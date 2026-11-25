#!/usr/bin/env bash
# Installs the launchd job that keeps "/Applications/Pokebots.app" on the newest `origin/main`.
#
#   scripts/custom-auto-update-setup.sh             install or update the job (runs every 5 minutes)
#   scripts/custom-auto-update-setup.sh --run-now   start one run now (installs the job when it is missing)
#   scripts/custom-auto-update-setup.sh --status    show the job, the last status and the log tail
#   scripts/custom-auto-update-setup.sh --remove    remove the job
#
# The job runs `scripts/custom-auto-update.sh` (see that file for what one run does). Run this from
# any checkout of the repository: the job uses the main checkout (the first worktree) for git.
#
# A loaded job is reloaded only when its plist changes, and never while a run holds the lock: a
# reload stops the running build. `--run-now` on a loaded job only asks launchd to start a run.
# A failed load is tried again, and the script exits non-zero when the job is still not loaded.
# `--status` exits 3 when the job is not loaded, because then the app gets no updates.
#
# Test hooks (scripts/custom-auto-update-race-e2e.ts): POKEBOTS_AUTOUPDATE_LABEL,
# POKEBOTS_AUTOUPDATE_STATE, POKEBOTS_AUTOUPDATE_AGENTS_DIR, POKEBOTS_AUTOUPDATE_JOB_SCRIPT and
# POKEBOTS_AUTOUPDATE_INTERVAL put a test job next to the real one. Never set them for the real job.
set -euo pipefail

label="${POKEBOTS_AUTOUPDATE_LABEL:-app.pokebots.autoupdate}"
state="${POKEBOTS_AUTOUPDATE_STATE:-$HOME/.local/state/pokebots-autoupdate}"
agents_dir="${POKEBOTS_AUTOUPDATE_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
interval="${POKEBOTS_AUTOUPDATE_INTERVAL:-300}"
plist="$agents_dir/$label.plist"
domain="gui/$(id -u)"
here="$(cd "$(dirname "$0")/.." && pwd)"
job_source="${POKEBOTS_AUTOUPDATE_JOB_SCRIPT:-$here/scripts/custom-auto-update.sh}"
source_repo="$(git -C "$here" worktree list --porcelain | sed -n '1s/^worktree //p')"
# The names before the rename to Pokebots. Install and remove take the old job away. A test job
# leaves them alone.
legacy_label="app.openbot.custom.autoupdate"
legacy_state="$HOME/.local/state/openbot-custom-autoupdate"
legacy_plist="$HOME/Library/LaunchAgents/$legacy_label.plist"
manage_legacy=1
[[ -n "${POKEBOTS_AUTOUPDATE_LABEL:-}" ]] && manage_legacy=0

job_loaded() { launchctl print "$domain/$label" >/dev/null 2>&1; }

# The pid of a live run that holds the lock, or nothing.
run_owner() {
  local owner
  owner="$(cat "$state/lock/pid" 2>/dev/null || true)"
  if [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then echo "$owner"; fi
}

# Loads the plist. launchd can refuse a bootstrap for a short time after a bootout, while it still
# tears the old service down, so try again for up to 10 seconds. Exit loudly when it stays unloaded.
bootstrap_job() {
  local error=""
  for _ in $(seq 1 20); do
    error="$(launchctl bootstrap "$domain" "$plist" 2>&1)" || true
    if job_loaded; then return 0; fi
    sleep 0.5
  done
  echo "ERROR: launchd did not load the job $label. Updates are OFF." >&2
  [[ -n "$error" ]] && echo "launchctl bootstrap said: $error" >&2
  echo "Run this script again. If it fails again, check: launchctl print $domain/$label" >&2
  exit 1
}

# Holds the run lock while the job is reloaded, so that a scheduled run cannot start in between and
# be stopped by the reload. The job takes over a lock whose process is gone.
hold_lock() {
  mkdir -p "$state"
  if ! mkdir "$state/lock" 2>/dev/null; then
    if [[ -n "$(run_owner)" ]]; then return 1; fi
  fi
  echo $$ >"$state/lock/pid"
  trap 'if [[ "$(cat "$state/lock/pid" 2>/dev/null)" == "$$" ]]; then rm -rf "$state/lock"; fi' EXIT
}

release_lock() {
  if [[ "$(cat "$state/lock/pid" 2>/dev/null || true)" == "$$" ]]; then rm -rf "$state/lock"; fi
  trap - EXIT
}

write_plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$state/bin/custom-auto-update.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>POKEBOTS_REPO</key><string>$source_repo</string>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartInterval</key><integer>$interval</integer>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$state/launchd.log</string>
  <key>StandardErrorPath</key><string>$state/launchd.log</string>
</dict>
</plist>
EOF
}

show_status() {
  local loaded=1
  if job_loaded; then
    launchctl print "$domain/$label" 2>/dev/null | grep -E '^\s*(state|last exit code|run interval)' || true
  else
    loaded=0
    echo "WARNING: the job $label is NOT loaded. Updates are OFF: merged changes do not reach the app."
    echo "Turn them on with: scripts/custom-auto-update-setup.sh"
  fi
  echo "Installed commit: $(cat "$state/installed-commit" 2>/dev/null || echo none)"
  cat "$state/status.json" 2>/dev/null || true
  local owner status
  owner="$(run_owner)"
  status="$(sed -n 's/.*"status":"\([a-z_]*\)".*/\1/p' "$state/status.json" 2>/dev/null || true)"
  if [[ -n "$owner" ]]; then
    echo "A run is in progress (pid $owner)."
  elif [[ "$status" == building || "$status" == installing || "$status" == waiting ]]; then
    echo "The run that wrote \"$status\" is gone. The next run starts again."
  fi
  tail -n 15 "$state/update.log" 2>/dev/null || true
  ((loaded == 1)) || exit 3
  exit 0
}

case "${1:-}" in
  --status) show_status ;;
  --remove)
    launchctl bootout "$domain/$label" 2>/dev/null || true
    rm -f "$plist"
    if ((manage_legacy == 1)); then
      launchctl bootout "$domain/$legacy_label" 2>/dev/null || true
      rm -f "$legacy_plist"
    fi
    echo "Removed the job. The state stays in $state."
    exit 0
    ;;
  "" | --run-now) ;;
  *)
    echo "Unknown option: $1" >&2
    exit 2
    ;;
esac

# Move the job from its old name. Wait for a run of the old job to end, so that its build
# worktree and lock are not moved under it. The build worktree is registered in the checkout,
# so tell git where it is now.
if ((manage_legacy == 1)); then
  if [[ -f "$legacy_plist" ]] || launchctl print "$domain/$legacy_label" >/dev/null 2>&1; then
    launchctl bootout "$domain/$legacy_label" 2>/dev/null || true
    rm -f "$legacy_plist"
    echo "Removed the old job $legacy_label."
  fi
  if [[ -d "$legacy_state" && ! -e "$state" ]]; then
    for _ in $(seq 1 600); do
      owner="$(cat "$legacy_state/lock/pid" 2>/dev/null || true)"
      if [[ -z "$owner" ]] || ! kill -0 "$owner" 2>/dev/null; then break; fi
      sleep 1
    done
    mkdir -p "$(dirname "$state")"
    mv "$legacy_state" "$state"
    rm -rf "$state/lock"
    if [[ -d "$state/repo" ]]; then git -C "$source_repo" worktree repair "$state/repo" || true; fi
    echo "Moved the state from $legacy_state to $state."
  fi
fi

# A running job keeps reading the copy it opened, so replacing the copy is safe during a run.
mkdir -p "$state/bin" "$agents_dir"
cp "$job_source" "$state/bin/custom-auto-update.sh.new"
chmod +x "$state/bin/custom-auto-update.sh.new"
mv "$state/bin/custom-auto-update.sh.new" "$state/bin/custom-auto-update.sh"

new_plist="$plist.new.$$"
write_plist >"$new_plist"
plutil -lint "$new_plist" >/dev/null

if job_loaded && cmp -s "$new_plist" "$plist"; then
  rm -f "$new_plist"
  echo "The job $label is loaded and up to date."
elif ! hold_lock; then
  rm -f "$new_plist"
  echo "A run is in progress (pid $(run_owner)). The job was not reloaded, so the run goes on."
  echo "Run this script again after the run ends to apply the new job settings."
  exit 0
else
  mv "$new_plist" "$plist"
  if job_loaded; then launchctl bootout "$domain/$label" 2>/dev/null || true; fi
  bootstrap_job
  release_lock
  echo "Installed the job $label. It checks origin/main every $((interval / 60)) minutes."
fi
echo "Git checkout: $source_repo"
echo "Log: $state/update.log"

if [[ "${1:-}" == "--run-now" ]]; then
  owner="$(run_owner)"
  if [[ -n "$owner" ]]; then
    echo "A run is already in progress (pid $owner). It was not stopped."
    exit 0
  fi
  # No -k: kickstart -k stops a running build.
  launchctl kickstart "$domain/$label"
  echo "Started one run now. Check it with: scripts/custom-auto-update-setup.sh --status"
fi

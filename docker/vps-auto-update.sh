#!/usr/bin/env bash
# Stages the latest self-hosted OpenBot server image from GHCR and applies it only when
# all VPS agents are idle, rolling back automatically if the new container fails health checks.
set -euo pipefail

STACK_DIR="${STACK_DIR:-/srv/stacks/openbot}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-openbot}"
CONTAINER_NAME="${CONTAINER_NAME:-openbot-openbot-1}"
IMAGE_REF="${IMAGE_REF:-ghcr.io/stevmolina/pokebots:latest}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"
LOCK_FILE="${LOCK_FILE:-/run/openbot-vps-auto-update.lock}"

DRY_RUN=0
STAGE_ONLY=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --stage-only) STAGE_ONLY=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: vps-auto-update.sh [--stage-only] [--dry-run] [--force]

Environment variables:
  STACK_DIR               Compose stack directory (default: /srv/stacks/openbot)
  COMPOSE_SERVICE         Compose service name (default: openbot)
  CONTAINER_NAME          Running container name (default: openbot-openbot-1)
  IMAGE_REF               GHCR image reference (default: ghcr.io/stevmolina/pokebots:latest)
  HEALTH_TIMEOUT_SECONDS  Seconds to wait for healthy startup (default: 120)
  LOCK_FILE               Flock lock file path (default: /run/openbot-vps-auto-update.lock)
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

log() {
  printf '[%s] [vps-auto-update] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

status_value() {
  local payload=$1 key=$2
  printf '%s\n' "$payload" | awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); print; exit }'
}

read_container_status() {
  docker exec "$CONTAINER_NAME" curl -fsS --max-time 5 \
    --unix-socket /run/openbot/control.sock http://localhost/v1/status 2>/dev/null || true
}

check_idle() {
  local status_text=$1
  local restart_ready blockers busy_procs

  restart_ready=$(status_value "$status_text" restart_ready)
  if [ "$restart_ready" = "true" ]; then
    return 0
  fi
  if [ "$restart_ready" = "false" ]; then
    blockers=$(status_value "$status_text" restart_blockers)
    log "Deferring update: server is busy (${blockers:-active-work}). Image remains staged."
    return 1
  fi

  # Fallback for older images that do not yet expose restart_ready on /v1/status.
  busy_procs=$(docker exec "$CONTAINER_NAME" ps -eo comm= 2>/dev/null \
    | grep -E '^(antigravity|claude|codex|grok)$' || true)
  if [ -n "$busy_procs" ]; then
    log "Deferring update: active agent processes detected ($(printf '%s' "$busy_procs" | tr '\n' ',' | sed 's/,$//')). Image remains staged."
    return 1
  fi
  return 0
}

wait_for_health() {
  local require_online=$1
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  local status_text server_state

  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)" = "true" ]; then
      status_text=$(read_container_status)
      if [ -n "$status_text" ]; then
        server_state=$(status_value "$status_text" server)
        if [ "$require_online" = "0" ] || [ "$server_state" = "online" ]; then
          return 0
        fi
      fi
    fi
    sleep 2
  done
  return 1
}

update_compose_image() {
  local compose_file=$1 target_image=$2
  python3 - "$compose_file" "$target_image" <<'PY'
import re, sys
from pathlib import Path

path = Path(sys.argv[1])
image = sys.argv[2]
text = path.read_text()

new_text, count = re.subn(r'^(\s*image:\s*).*$', rf'\1{image}', text, count=1, flags=re.MULTILINE)
if count != 1:
    raise SystemExit(f"Could not update image line in {path}")

new_text = re.sub(r'^(\s*pull_policy:\s*)never\s*$', r'\1missing', new_text, flags=re.MULTILINE)
path.write_text(new_text)
PY
}

main() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "Another update check is already running; skipping."
    exit 0
  fi

  local compose_file="$STACK_DIR/compose.yaml"
  [ -f "$compose_file" ] || { echo "Compose file not found: $compose_file" >&2; exit 1; }

  # 1. Stage the latest image from GHCR in the background.
  docker pull --quiet "$IMAGE_REF" >/dev/null

  local pulled_id running_id
  pulled_id=$(docker image inspect --format '{{.Id}}' "$IMAGE_REF")
  running_id=$(docker inspect --format '{{.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)

  if [ -z "$running_id" ]; then
    log "Container $CONTAINER_NAME is not present; skipping automatic swap."
    exit 0
  fi

  if [ "$pulled_id" = "$running_id" ]; then
    exit 0
  fi

  log "New image staged: $IMAGE_REF (${pulled_id:0:19}, running ${running_id:0:19})."
  if [ "$STAGE_ONLY" -eq 1 ]; then
    exit 0
  fi

  # 2. Check whether VPS agents are idle before swapping.
  local before_status require_online=0
  before_status=$(read_container_status)
  if [ "$(status_value "$before_status" server)" = "online" ]; then
    require_online=1
  fi

  if [ "$FORCE" -eq 0 ]; then
    if ! check_idle "$before_status"; then
      exit 0
    fi
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Dry run: container is idle and would update $CONTAINER_NAME to $IMAGE_REF."
    exit 0
  fi

  # 3. Tag the currently healthy image for deterministic rollback, update compose.yaml, and apply.
  local rollback_tag="openbot-vps-rollback:last-known-good"
  local backup_file="$STACK_DIR/compose.yaml.bak-autoupdate"
  docker tag "$running_id" "$rollback_tag"
  cp -a "$compose_file" "$backup_file"
  update_compose_image "$compose_file" "$IMAGE_REF"

  log "Applying $IMAGE_REF to $CONTAINER_NAME..."
  if (cd "$STACK_DIR" && docker compose up -d "$COMPOSE_SERVICE") && wait_for_health "$require_online"; then
    local new_version
    new_version=$(status_value "$(read_container_status)" version)
    log "Update succeeded: $CONTAINER_NAME is healthy on $IMAGE_REF (version=${new_version:-unknown})."
    rm -f "$backup_file"
    exit 0
  fi

  # 4. Rollback automatically to the exact previously running image ID if health check fails.
  log "ERROR: $CONTAINER_NAME failed health check after ${HEALTH_TIMEOUT_SECONDS}s; rolling back to $rollback_tag ($running_id)."
  cp -a "$backup_file" "$compose_file"
  update_compose_image "$compose_file" "$rollback_tag"
  rm -f "$backup_file"
  (cd "$STACK_DIR" && docker compose up -d "$COMPOSE_SERVICE") || true
  if wait_for_health "$require_online"; then
    log "Rollback succeeded: previous container restored and healthy."
  else
    log "CRITICAL: rollback container did not pass health check within ${HEALTH_TIMEOUT_SECONDS}s."
  fi
  exit 1
}

main

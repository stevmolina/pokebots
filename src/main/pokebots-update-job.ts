import { execFile } from "node:child_process";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { UpdateStatus } from "@pokebots/contracts/ipc";
import { sourceText } from "@pokebots/i18n/source";

const run = promisify(execFile);

/** The job checks every 5 minutes, so 20 minutes without a sign of it means it does not run. */
const STALE_AFTER_MS = 20 * 60_000;
/** After sleep, launchd starts the missed run a moment after wake. Wait before calling the job off. */
const STALE_GRACE_MS = 2 * 60_000;
const LOADED_CHECK_EVERY_MS = 60_000;
/** A setup run reloads the job, which is unloaded for a moment. Two misses in a row mean it is off. */
const NOT_LOADED_MISSES = 2;

export interface PokebotsUpdateJobOptions {
  label: string;
  stateDirectory: string;
  plist: string;
  now?: () => number;
}

/**
 * The launchd job that installs new builds of Pokebots on Steven's Mac
 * (`scripts/custom-auto-update.sh`). It is local only: it updates the app that this Mac runs, from
 * this Mac's checkout, so a joined server or a web client has no such job and never sees this state.
 */
export function createPokebotsUpdateJob(options: PokebotsUpdateJobOptions) {
  const { label, stateDirectory, plist } = options;
  const now = options.now ?? Date.now;
  const service = `gui/${userInfo().uid}/${label}`;
  let lastLoadedCheck = Number.NEGATIVE_INFINITY;
  let loadedCheckRunning = false;
  let notLoadedMisses = 0;
  let staleSince: number | null = null;

  function readCommit(name: "staged-commit" | "approved-commit"): string | null {
    try {
      const commit = readFileSync(join(stateDirectory, name), "utf8").trim();
      return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
    } catch {
      return null;
    }
  }

  const enabled = () => existsSync(join(stateDirectory, "manual-updates"));

  async function isLoaded(): Promise<boolean> {
    try {
      await run("/bin/launchctl", ["print", service], { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  /** Asks launchd at most once a minute, in the background, so the 3-second status poll stays cheap. */
  function refreshLoaded(): void {
    if (loadedCheckRunning || now() - lastLoadedCheck < LOADED_CHECK_EVERY_MS) return;
    loadedCheckRunning = true;
    lastLoadedCheck = now();
    void isLoaded().then((loaded) => {
      notLoadedMisses = loaded ? 0 : notLoadedMisses + 1;
      loadedCheckRunning = false;
    });
  }

  /** The newest sign that a run started: its heartbeat, its log or its status. */
  function lastActivity(): number | null {
    let newest: number | null = null;
    for (const name of ["last-check", "update.log", "status.json"]) {
      try {
        const time = statSync(join(stateDirectory, name)).mtimeMs;
        if (newest === null || time > newest) newest = time;
      } catch {
        // A missing file is no sign of a run.
      }
    }
    return newest;
  }

  /** True when the job is not loaded, or no run started for 20 minutes. */
  function updatesOff(): boolean {
    if (!enabled()) return false;
    refreshLoaded();
    if (notLoadedMisses >= NOT_LOADED_MISSES) return true;
    const activity = lastActivity();
    if (activity === null || now() - activity < STALE_AFTER_MS) {
      staleSince = null;
      return false;
    }
    if (staleSince === null) {
      staleSince = now();
      // A loaded job that missed its runs gets one now. It does not stop a run that is under way.
      void run("/bin/launchctl", ["kickstart", service], { timeout: 5_000 }).catch(() => undefined);
    }
    return now() - staleSince >= STALE_GRACE_MS;
  }

  function status(currentVersion: string): UpdateStatus {
    const staged = readCommit("staged-commit");
    const base = {
      availableVersion: staged?.slice(0, 7) ?? null,
      currentVersion,
      progress: null,
      checkedAt: null,
    };
    if (updatesOff()) {
      // The island shows an error with a Retry button. Retry calls `check`, which loads the job again.
      return { ...base, phase: "error", message: sourceText("error.update.jobOff"), errorCode: null };
    }
    const approved = staged !== null && readCommit("approved-commit") === staged;
    return {
      ...base,
      phase: staged ? (approved ? "installing" : "ready") : enabled() ? "idle" : "unsupported",
      message: null,
      errorCode: null,
    };
  }

  /** Starts a run. Loads the job first when it is not loaded. Never stops a run that is under way. */
  async function check(): Promise<void> {
    if (!enabled()) return;
    if (!(await isLoaded())) {
      if (!existsSync(plist)) throw new Error(sourceText("error.update.jobStartFailed"));
      for (let attempt = 0; attempt < 10 && !(await isLoaded()); attempt += 1) {
        await run("/bin/launchctl", ["bootstrap", `gui/${userInfo().uid}`, plist], { timeout: 5_000 }).catch(
          () => new Promise((resolve) => setTimeout(resolve, 500)),
        );
      }
      if (!(await isLoaded())) throw new Error(sourceText("error.update.jobStartFailed"));
    }
    notLoadedMisses = 0;
    lastLoadedCheck = now();
    staleSince = null;
    // No -k: `kickstart -k` stops a running build.
    await run("/bin/launchctl", ["kickstart", service], { timeout: 5_000 }).catch(() => undefined);
  }

  function approve(): Promise<void> {
    const staged = readCommit("staged-commit");
    if (!staged) throw new Error(sourceText("error.update.installFailed"));
    const pending = join(stateDirectory, "approved-commit.new");
    writeFileSync(pending, `${staged}\n`, { mode: 0o600 });
    renameSync(pending, join(stateDirectory, "approved-commit"));
    return check();
  }

  return { status, check, approve };
}

const pokebotsUpdateJob = createPokebotsUpdateJob({
  label: "app.pokebots.autoupdate",
  stateDirectory: join(homedir(), ".local", "state", "pokebots-autoupdate"),
  plist: join(homedir(), "Library", "LaunchAgents", "app.pokebots.autoupdate.plist"),
});

/** Local only: the job updates `/Applications/Pokebots.app` on this Mac (see `createPokebotsUpdateJob`). */
export function usesPokebotsUpdateJob(executable: string): boolean {
  return process.platform === "darwin" && executable.startsWith("/Applications/Pokebots.app/Contents/MacOS/");
}

export const pokebotsUpdateStatus = pokebotsUpdateJob.status;
export const checkPokebotsUpdate = pokebotsUpdateJob.check;
export const approvePokebotsUpdate = pokebotsUpdateJob.approve;

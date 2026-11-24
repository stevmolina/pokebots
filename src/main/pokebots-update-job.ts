import { execFile } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import type { UpdateStatus } from "@pokebots/contracts/ipc";
import { sourceText } from "@pokebots/i18n/source";

const stateDirectory = join(homedir(), ".local", "state", "pokebots-autoupdate");

export function usesPokebotsUpdateJob(executable: string): boolean {
  return process.platform === "darwin" && executable.startsWith("/Applications/Pokebots.app/Contents/MacOS/");
}

function readCommit(name: "staged-commit" | "approved-commit"): string | null {
  try {
    const commit = readFileSync(join(stateDirectory, name), "utf8").trim();
    return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

export function pokebotsUpdateStatus(currentVersion: string): UpdateStatus {
  const staged = readCommit("staged-commit");
  const approved = staged !== null && readCommit("approved-commit") === staged;
  const enabled = existsSync(join(stateDirectory, "manual-updates"));
  return {
    phase: staged ? (approved ? "installing" : "ready") : enabled ? "idle" : "unsupported",
    availableVersion: staged?.slice(0, 7) ?? null,
    currentVersion,
    progress: null,
    checkedAt: null,
    message: null,
    errorCode: null,
  };
}

export function checkPokebotsUpdate(): void {
  if (existsSync(join(stateDirectory, "manual-updates"))) {
    // A running job will see the approval on its next scheduled run.
    execFile(
      "/bin/launchctl",
      ["kickstart", `gui/${userInfo().uid}/app.pokebots.autoupdate`],
      { timeout: 5_000 },
      () => undefined,
    );
  }
}

export function approvePokebotsUpdate(): void {
  const staged = readCommit("staged-commit");
  if (!staged) throw new Error(sourceText("error.update.installFailed"));
  const pending = join(stateDirectory, "approved-commit.new");
  writeFileSync(pending, `${staged}\n`, { mode: 0o600 });
  renameSync(pending, join(stateDirectory, "approved-commit"));
  checkPokebotsUpdate();
}

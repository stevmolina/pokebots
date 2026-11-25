// Replays the 2026-11-24 auto-update incident on a temporary launchd job, never the real one.
//
// On that day a scheduled run was building when an agent ran `custom-auto-update-setup.sh --run-now`.
// Setup unloaded the job (which stopped the build) and loaded it again; the load failed while
// launchd still tore the old service down, so the job stayed unloaded for about 20 hours and the
// status stayed "building". This test checks each part of the fix:
//
//   1. `--run-now` during a run does not reload the job and does not stop the build.
//   2. A plist change during a run is not applied; with no run, it is applied.
//   3. A refused bootstrap is tried again, and a load that never works exits 1 with an error.
//   4. `--status` exits 3 when the job is not loaded.
//   5. A run that finds "building" from a dead run says so and starts again.
//   6. The app's job reader shows "Updates are off" for an unloaded or silent job, and its Retry
//      loads the job again.
//
// The temporary job runs a fake build that uses the real job script's lock, status and recovery
// functions. macOS only. `bun scripts/custom-auto-update-race-e2e.ts`.
// Writes .openbot-build/custom-auto-update-race-e2e/report.json.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { sourceText } from "@pokebots/i18n/source";
import { createPokebotsUpdateJob } from "../src/main/pokebots-update-job";

const repo = resolve(import.meta.dirname, "..");
const out = join(repo, ".openbot-build", "custom-auto-update-race-e2e");
const setupScript = join(repo, "scripts", "custom-auto-update-setup.sh");
const jobScript = join(repo, "scripts", "custom-auto-update.sh");

if (process.platform !== "darwin") {
  process.stdout.write("This test needs launchd (macOS). Skipped.\n");
  process.exit(0);
}

const label = `app.pokebots.autoupdate-e2e-${process.pid}`;
const domain = `gui/${userInfo().uid}`;
const service = `${domain}/${label}`;
const root = mkdtempSync(join(tmpdir(), "pokebots-autoupdate-e2e-"));
const state = join(root, "state");
const agentsDir = join(root, "agents");
const plist = join(agentsDir, `${label}.plist`);
const fakeBin = join(root, "fake-bin");
mkdirSync(fakeBin, { recursive: true });

// The fake build: the real job's lock, heartbeat, recovery and status, then a sleep in place of a build.
const realJobCopy = join(root, "real-job.sh");
writeFileSync(realJobCopy, readFileSync(jobScript));
const fakeJob = join(root, "fake-job.sh");
writeFileSync(
  fakeJob,
  `#!/bin/bash
state="$(cd "$(dirname "$0")/.." && pwd)"
source "${realJobCopy}"
mkdir -p "$state"
touch "$state/last-check"
exec >>"$state/update.log" 2>&1
take_lock || exit 0
say "Run started (pid $$)."
echo "$$" >>"$state/runs"
recover_stale_status
write_status building "1111111111111111111111111111111111111111" "Building the fake commit."
sleep "$(cat "$state/build-seconds" 2>/dev/null || echo 20)"
write_status ready "1111111111111111111111111111111111111111" "Ready to install the fake commit."
`,
);
chmodSync(fakeJob, 0o755);

// A launchctl that refuses the first FAIL_TIMES bootstraps, as launchd does while it tears a service down.
const fakeLaunchctl = join(fakeBin, "launchctl");
writeFileSync(
  fakeLaunchctl,
  `#!/bin/bash
if [[ "$1" == bootstrap ]]; then
  n=$(cat "$BOOTSTRAP_COUNTER" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" >"$BOOTSTRAP_COUNTER"
  if ((n <= FAIL_TIMES)); then echo "Bootstrap failed: 5: Input/output error" >&2; exit 5; fi
fi
exec /bin/launchctl "$@"
`,
);
chmodSync(fakeLaunchctl, 0o755);

interface Step {
  name: string;
  passed: boolean;
  detail: object;
}
const steps: Step[] = [];
let failure: string | null = null;

function setup(args: string[], extra: Record<string, string> = {}) {
  const result = spawnSync("bash", [setupScript, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      POKEBOTS_AUTOUPDATE_LABEL: label,
      POKEBOTS_AUTOUPDATE_STATE: state,
      POKEBOTS_AUTOUPDATE_AGENTS_DIR: agentsDir,
      POKEBOTS_AUTOUPDATE_JOB_SCRIPT: fakeJob,
      POKEBOTS_AUTOUPDATE_INTERVAL: "3600",
      ...extra,
    },
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

function launchctl(...args: string[]) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

const loaded = () => launchctl("print", service).code === 0;
const readStatus = (): { status?: string; message?: string } => {
  try {
    return JSON.parse(readFileSync(join(state, "status.json"), "utf8"));
  } catch {
    return {};
  }
};
const lockOwner = (): number | null => {
  try {
    const pid = Number(readFileSync(join(state, "lock", "pid"), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};
const alive = (pid: number | null) => {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const runCount = () =>
  existsSync(join(state, "runs")) ? readFileSync(join(state, "runs"), "utf8").trim().split("\n").length : 0;

async function waitFor(what: string, condition: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Starts a run the way the 5-minute timer does, and waits until it holds the lock and builds. */
async function startBuild(seconds: number): Promise<number> {
  writeFileSync(join(state, "build-seconds"), `${seconds}\n`);
  const before = runCount();
  launchctl("kickstart", service);
  await waitFor(
    "a run that builds",
    () => runCount() > before && readStatus().status === "building" && alive(lockOwner()),
  );
  const owner = lockOwner();
  assert.ok(owner);
  return owner;
}

async function step(name: string, body: () => Promise<object>): Promise<void> {
  try {
    const detail = await body();
    steps.push({ name, passed: true, detail });
    process.stdout.write(`ok   ${name}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push({ name, passed: false, detail: { error: message } });
    failure ??= `${name}: ${message}`;
    process.stdout.write(`FAIL ${name}: ${message}\n`);
  }
}

try {
  await step("install the temporary job", async () => {
    const result = setup([]);
    assert.equal(result.code, 0, result.output);
    assert.ok(loaded(), "the job is loaded");
    return { output: result.output };
  });

  await step("the old setup path (bootout, then bootstrap at once) stops a running build", async () => {
    const owner = await startBuild(30);
    launchctl("bootout", service);
    const bootstrap = launchctl("bootstrap", domain, plist);
    await waitFor("the build to stop", () => !alive(owner));
    // Leave the job loaded for the next steps, whatever the immediate bootstrap did.
    await waitFor("the job to load again", () => {
      if (!loaded()) launchctl("bootstrap", domain, plist);
      return loaded();
    });
    return {
      buildStopped: !alive(owner),
      immediateBootstrapExit: bootstrap.code,
      immediateBootstrapOutput: bootstrap.output.trim(),
      statusLeftBehind: readStatus().status,
    };
  });

  await step("a run that finds a dead run's 'building' says so and starts again", async () => {
    // The previous step left "building" and the dead run's lock behind, as on 2026-11-24.
    writeFileSync(join(state, "status.json"), `${JSON.stringify({ status: "building", commit: "2".repeat(40) })}\n`);
    mkdirSync(join(state, "lock"), { recursive: true });
    writeFileSync(join(state, "lock", "pid"), "999999\n");
    const status = setup(["--status"]);
    assert.equal(status.code, 0, status.output);
    assert.match(status.output, /The run that wrote "building" is gone/);
    await startBuild(1);
    await waitFor("the run to finish", () => readStatus().status === "ready" && !alive(lockOwner()));
    const log = readFileSync(join(state, "update.log"), "utf8");
    assert.match(log, /The last run stopped while building\. Starting again\./);
    return { statusOutput: status.output.trim().split("\n"), finalStatus: readStatus() };
  });

  await step("--run-now during a build keeps the build and the job", async () => {
    const owner = await startBuild(20);
    const result = setup(["--run-now"]);
    const buildAlive = alive(owner);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /loaded and up to date/);
    assert.match(result.output, /already in progress/);
    assert.ok(buildAlive, "the build still runs");
    assert.ok(loaded(), "the job is still loaded");
    await waitFor("the build to finish", () => readStatus().status === "ready", 30_000);
    return { output: result.output.trim().split("\n"), buildAlive, finalStatus: readStatus().status };
  });

  await step("a plist change during a build is not applied", async () => {
    const owner = await startBuild(20);
    const result = setup([], { POKEBOTS_AUTOUPDATE_INTERVAL: "1800" });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /was not reloaded/);
    assert.ok(alive(owner), "the build still runs");
    assert.ok(loaded(), "the job is still loaded");
    assert.match(readFileSync(plist, "utf8"), /<integer>3600<\/integer>/);
    await waitFor("the build to finish", () => readStatus().status === "ready" && !alive(lockOwner()), 30_000);
    return { output: result.output.trim().split("\n") };
  });

  await step("a plist change with no run is applied", async () => {
    const result = setup([], { POKEBOTS_AUTOUPDATE_INTERVAL: "1800" });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Installed the job/);
    assert.ok(loaded());
    assert.match(launchctl("print", service).output, /run interval = 1800 seconds/);
    return { output: result.output.trim().split("\n") };
  });

  await step("--run-now on an idle loaded job starts one run without a reload", async () => {
    writeFileSync(join(state, "build-seconds"), "1\n");
    const before = runCount();
    const result = setup(["--run-now"], { POKEBOTS_AUTOUPDATE_INTERVAL: "1800" });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /loaded and up to date/);
    assert.match(result.output, /Started one run now/);
    await waitFor("the run", () => runCount() > before && readStatus().status === "ready" && !alive(lockOwner()));
    return { output: result.output.trim().split("\n") };
  });

  await step("a refused bootstrap is tried again", async () => {
    launchctl("bootout", service);
    await waitFor("the job to unload", () => !loaded());
    const counter = join(root, "bootstrap-count-retry");
    const result = setup([], {
      PATH: `${fakeBin}:${process.env.PATH}`,
      BOOTSTRAP_COUNTER: counter,
      FAIL_TIMES: "3",
      POKEBOTS_AUTOUPDATE_INTERVAL: "1800",
    });
    const attempts = Number(readFileSync(counter, "utf8").trim());
    assert.equal(result.code, 0, result.output);
    assert.ok(loaded());
    assert.equal(attempts, 4);
    return { attempts, output: result.output.trim().split("\n") };
  });

  await step("a bootstrap that never works exits 1 with an error", async () => {
    launchctl("bootout", service);
    await waitFor("the job to unload", () => !loaded());
    const counter = join(root, "bootstrap-count-fail");
    const result = setup([], {
      PATH: `${fakeBin}:${process.env.PATH}`,
      BOOTSTRAP_COUNTER: counter,
      FAIL_TIMES: "1000",
    });
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /ERROR: launchd did not load the job/);
    assert.ok(!loaded());
    assert.ok(!existsSync(join(state, "lock")), "setup released its lock");
    return { attempts: Number(readFileSync(counter, "utf8").trim()), output: result.output.trim().split("\n") };
  });

  await step("--status exits 3 and warns when the job is not loaded", async () => {
    const result = setup(["--status"]);
    assert.equal(result.code, 3, result.output);
    assert.match(result.output, /is NOT loaded\. Updates are OFF/);
    return { output: result.output.trim().split("\n") };
  });

  await step("the app shows 'Updates are off' for an unloaded job, and Retry loads it", async () => {
    writeFileSync(join(state, "manual-updates"), "");
    let clock = Date.now();
    const job = createPokebotsUpdateJob({ label, stateDirectory: state, plist, now: () => clock });
    const offMessage = sourceText("error.update.jobOff");
    let status = job.status("0.0.0");
    for (let i = 0; i < 50 && status.phase !== "error"; i += 1) {
      clock += 61_000;
      await new Promise((resolve) => setTimeout(resolve, 200));
      status = job.status("0.0.0");
    }
    assert.equal(status.phase, "error");
    assert.equal(status.message, offMessage);
    assert.equal(status.errorCode, null);
    const before = runCount();
    await job.check();
    assert.ok(loaded(), "Retry loaded the job");
    await waitFor(
      "the run that Retry started",
      () => runCount() > before && !alive(lockOwner()) && readStatus().status === "ready",
    );
    status = job.status("0.0.0");
    assert.equal(status.phase, "idle");
    return { offStatus: { phase: "error", message: offMessage }, afterRetry: status.phase };
  });

  await step("the app shows 'Updates are off' after 20 minutes with no run, after a grace", async () => {
    let clock = Date.now() + 25 * 60_000;
    const job = createPokebotsUpdateJob({ label, stateDirectory: state, plist, now: () => clock });
    const before = runCount();
    const first = job.status("0.0.0");
    assert.equal(first.phase, "idle", "the first stale sight waits for the grace");
    await waitFor("the kickstart of the stale job", () => runCount() > before && !alive(lockOwner()));
    clock += 2 * 60_000 + 1_000;
    const later = job.status("0.0.0");
    assert.equal(later.phase, "error");
    clock = Date.now();
    const fresh = job.status("0.0.0");
    assert.equal(fresh.phase, "idle");
    return { firstSight: first.phase, afterGrace: later.phase, whenFresh: fresh.phase };
  });
} finally {
  launchctl("bootout", service);
  const report = { passed: failure === null, failure, label, steps };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  rmSync(root, { recursive: true, force: true });
  process.stdout.write(`Report: ${join(out, "report.json")}\n`);
}

if (failure) {
  process.stderr.write(`${failure}\n`);
  process.exit(1);
}

// Checks that a desktop client connects again within seconds after its joined server restarts.
//
// The script starts this worktree's dev stack with `OPENBOT_DEV_CLIENT_TRANSPORT=webrtc`: the test
// client joins the dev host over WebRTC through the local Signal service, as a desktop app joins a VPS.
// When the client shows the host online, `bun run dev:restart-host --pause=<s>` stops the host with
// SIGTERM, as systemd stops a server (or SIGKILL with `--signal=SIGKILL`, a crash with no goodbye),
// and starts it again after the pause (default 90 s). The script
// then records:
//   - when the host stopped, when the client showed it offline, and when the new host process started;
//   - when the new host was online on Signal (`host.getStatus()` gives `online`);
//   - when the client showed the host online again;
//   - the connect attempts, new sessions and tickets that the client asked the account service for
//     from the stop, from the `remote-connect:*` spans of its trace file.
// It passes when the client is online within 10 s after the host is online on Signal.
//
// Run: bun scripts/remote-host-restart-reconnect-e2e.ts [--pause=90] [--signal=SIGKILL] [--timeout=420] [--label=after] [--keep]
// No dev stack of this worktree can run. `--timeout` is how long the script waits for the client after
// the host is online. `--keep` leaves the stack running; stop it with `bun run dev:stop`.
// Writes .openbot-build/remote-host-restart-reconnect-e2e/<label>.json.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import type { OpenBotDesktopApi } from "@pokebots/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@pokebots/contracts/runtime-values";
import { createOpenBotLogger } from "@pokebots/logging";
import type { Page } from "playwright-core";
import { argument } from "./channel-e2e-support";
import { type AutomationSession, connectToDevApp } from "./dev-automation/cdp-client";
import { type DevInstanceRecord, readDevInstanceRecords } from "./dev-automation/instance-registry";
import { resolveDevelopmentAppDataRoot } from "./development-state-paths";

// The page functions below run in the app window, where the preload bridge sets this.
declare global {
  interface Window {
    openbot: OpenBotDesktopApi;
  }
}

const NAME = "remote-host-restart-reconnect-e2e";
const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, ".openbot-build", NAME);
const logger = createOpenBotLogger(NAME);
const pauseSeconds = Number(argument("pause") ?? "90");
assert.ok(Number.isFinite(pauseSeconds) && pauseSeconds >= 0, "--pause takes a number of seconds.");
const timeoutSeconds = Number(argument("timeout") ?? "420");
assert.ok(Number.isFinite(timeoutSeconds) && timeoutSeconds > 0, "--timeout takes a number of seconds.");
const label = argument("label") ?? "report";
assert.match(label, /^\w[\w.-]*$/, "--label takes a file name, not a path.");
const keep = process.argv.includes("--keep");
const stopSignal = argument("signal") ?? "SIGTERM";
assert.ok(stopSignal === "SIGTERM" || stopSignal === "SIGKILL", "--signal takes SIGTERM or SIGKILL.");
/** The client must be online this soon after the host is online on Signal. */
const RECONNECT_LIMIT_MS = 10_000;
// Bounds on failure only: the first start of a dev stack builds the app and seeds a profile.
const STACK_DEADLINE_MS = 6 * 60_000;
const POLL_MS = 250;

interface TraceSpan {
  at: number;
  name: string;
  outcome: string;
}

interface Report {
  label: string;
  startedAt: string;
  pauseSeconds: number;
  /** How the host stopped: SIGTERM quits with its services, SIGKILL is a crash with no goodbye. */
  signal: string;
  passed: boolean;
  /** The test client's window had the focus when the host stopped. Without focus, the offline delay is 15 min. */
  clientFocused?: boolean;
  /** Epoch milliseconds of each step. */
  times: {
    restartRequested?: number;
    hostStopped?: number;
    clientOffline?: number;
    hostProcessStarted?: number;
    hostOnline?: number;
    clientOnline?: number;
  };
  /** Milliseconds from the host online on Signal to the client online. The check. */
  reconnectAfterHostOnlineMs?: number;
  /** Milliseconds from the start of the new host process to the client online. */
  reconnectAfterHostStartMs?: number;
  /** Milliseconds from the host stop to the client online. */
  outageMs?: number;
  /** What the client asked the account service for from the host stop: one ticket for each attempt. */
  requests?: { attempts: number; newSessions: number; tickets: number; failedAttempts: number };
  connectSpans?: { atMs: number; name: string; outcome: string }[];
  error?: string;
}

const report: Report = {
  label,
  startedAt: new Date().toISOString(),
  pauseSeconds,
  signal: stopSignal,
  passed: false,
  times: {},
};

const wait = (milliseconds: number) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function until<T>(what: string, deadlineMs: number, read: () => Promise<T | null | undefined>): Promise<T> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const value = await read().catch(() => null);
    if (value !== null && value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await wait(POLL_MS);
  }
}

const ownRecords = () => readDevInstanceRecords().filter((record) => resolve(record.projectRoot) === ROOT);
const ownRecord = (service: DevInstanceRecord["service"]) => ownRecords().find((record) => record.service === service);

function connect(record: DevInstanceRecord): Promise<AutomationSession> {
  return connectToDevApp(record.remoteDebuggingPort, logger, {
    expectedRendererPort: record.rendererPort,
    ownerPid: record.pid,
  });
}

/** The state of the dev host in the test client's server list. */
async function hostState(client: Page, serverId: string): Promise<string | null> {
  const servers = await client.evaluate(() => window.openbot.servers.list());
  return servers.find((server) => server.id === serverId)?.state ?? null;
}

function readTrace(path: string): TraceSpan[] {
  const spans: TraceSpan[] = [];
  for (const file of [`${path}.1`, path]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isDynamicRecord(value) || value.kind !== "connect") continue;
      if (!isString(value.at) || !isString(value.name) || !isString(value.outcome)) continue;
      const at = Date.parse(value.at);
      if (isNumber(at) && Number.isFinite(at)) spans.push({ at, name: value.name, outcome: value.outcome });
    }
  }
  return spans;
}

mkdirSync(OUT, { recursive: true });
assert.equal(ownRecords().length, 0, "A dev stack of this worktree already runs. Stop it with `bun run dev:stop`.");
const stackLog = openSync(resolve(OUT, `${label}-stack.log`), "w");
const stack = spawn(process.execPath, ["scripts/dev-services.ts", "test-client"], {
  cwd: ROOT,
  // The Bun that runs this script goes first on the path: a shell can find another Bun first.
  env: {
    ...process.env,
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
    OPENBOT_DEV_CLIENT_TRANSPORT: "webrtc",
  },
  stdio: ["ignore", stackLog, stackLog],
  detached: true,
});
stack.unref();
logger.info(`Started the dev stack (supervisor ${stack.pid}). Its output is in ${label}-stack.log.`);

let clientSession: AutomationSession | null = null;
let hostSession: AutomationSession | null = null;
try {
  const [host, client] = await until("the host and the test client to start", STACK_DEADLINE_MS, async () => {
    const app = ownRecord("app");
    const testClient = ownRecord("test-client");
    return app && testClient ? ([app, testClient] as const) : null;
  });
  // The window opens after the process, so the first connections can find no window.
  clientSession = await until("the test client's window", STACK_DEADLINE_MS, () => connect(client));
  const clientPage = clientSession.page;
  const server = await until("the test client to show the host online", STACK_DEADLINE_MS, async () => {
    const servers = await clientPage.evaluate(() => window.openbot.servers.list());
    return servers.find((item) => item.kind === "remote" && item.state === "online");
  });
  logger.info("The test client shows the host online over WebRTC.");
  const userData = join(resolveDevelopmentAppDataRoot(), client.profile);
  const tracePath = join(userData, "logs", "trace.ndjson");
  report.clientFocused = await clientPage.evaluate(() => document.hasFocus());

  // 1. Stop the host. The supervisor starts it again after the pause.
  report.times.restartRequested = Date.now();
  execFileSync(
    process.execPath,
    ["scripts/dev-stack.ts", "restart-host", `--pause=${pauseSeconds}`, `--signal=${stopSignal}`],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
  const offline = until("the test client to show the host offline", 60_000, async () => {
    const state = await hostState(clientPage, server.id);
    return state !== "online" ? Date.now() : null;
  });
  report.times.hostStopped = await until("the host process to stop", 60_000, async () =>
    ownRecords().some((record) => record.service === "app" && record.pid === host.pid) ? null : Date.now(),
  );
  report.times.clientOffline = await offline;
  logger.info(`The host stopped. It starts again in ${pauseSeconds} s.`);

  // 2. The new host process starts, and goes online on Signal.
  const restarted = await until("the new host process", pauseSeconds * 1000 + STACK_DEADLINE_MS, async () => {
    const app = ownRecord("app");
    return app && app.pid !== host.pid ? app : null;
  });
  report.times.hostProcessStarted = restarted.startedAt;
  hostSession = await until("the new host window", STACK_DEADLINE_MS, () => connect(restarted));
  const hostPage = hostSession.page;
  report.times.hostOnline = await until("the new host to be online on Signal", STACK_DEADLINE_MS, async () => {
    const status = await hostPage.evaluate(() => window.openbot.host.getStatus());
    return status.phase === "online" ? Date.now() : null;
  });
  logger.info("The new host is online on Signal. The script waits for the test client.");

  // 3. The client connects again.
  const clientOnline = await until("the test client to show the host online again", timeoutSeconds * 1000, async () =>
    (await hostState(clientPage, server.id)) === "online" ? Date.now() : null,
  ).catch(() => null);
  if (clientOnline !== null) report.times.clientOnline = clientOnline;
  const times = report.times;
  if (times.clientOnline !== undefined && times.hostOnline !== undefined) {
    report.reconnectAfterHostOnlineMs = times.clientOnline - times.hostOnline;
    if (times.hostProcessStarted !== undefined)
      report.reconnectAfterHostStartMs = times.clientOnline - times.hostProcessStarted;
    if (times.hostStopped !== undefined) report.outageMs = times.clientOnline - times.hostStopped;
  }

  // 4. What the client asked the account service for. The trace file is written each second.
  await wait(2_000);
  const from = times.hostStopped ?? times.restartRequested ?? Date.now();
  const spans = readTrace(tracePath).filter((span) => span.at >= from);
  report.connectSpans = spans.map((span) => ({ atMs: span.at - from, name: span.name, outcome: span.outcome }));
  report.requests = {
    attempts: spans.filter((span) => span.name === "remote-connect:start").length,
    newSessions: spans.filter((span) => span.name === "remote-connect:session" && span.outcome === "ok").length,
    tickets: spans.filter((span) => span.name === "remote-connect:ticket").length,
    failedAttempts: spans.filter((span) => span.name === "remote-connect:failed").length,
  };
  report.passed =
    report.reconnectAfterHostOnlineMs !== undefined && report.reconnectAfterHostOnlineMs <= RECONNECT_LIMIT_MS;
  if (times.clientOnline === undefined)
    report.error = `The test client did not show the host online within ${timeoutSeconds} s after the host was online.`;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await clientSession?.close().catch(() => undefined);
  await hostSession?.close().catch(() => undefined);
  const path = resolve(OUT, `${label}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  logger.info(
    `${report.passed ? "Passed" : "Failed"}: the client was online ${report.reconnectAfterHostOnlineMs ?? "-"} ms after the host. Wrote ${path}.`,
  );
  if (!keep) execFileSync(process.execPath, ["scripts/dev-stack.ts", "stop"], { cwd: ROOT, stdio: "inherit" });
}
process.exitCode = report.passed ? 0 : 1;

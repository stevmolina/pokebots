// Measures how fast the chat of an agent opens on a far joined server while the window loads its lists.
//
// Seed the dev host with many agents, start this worktree's stack with a far data channel, then run:
//   bun run dev:seed --scale=agents:46,messages:200
//   OPENBOT_DEV_RTT_MS=600 OPENBOT_DEV_CLIENT_TRANSPORT=webrtc OPENBOT_DEV_SYNC_PROFILE=1 bun run dev:test-client
//   bun scripts/agent-switch-perf-e2e.ts --allow-mutations [--label=<name>] [--agents="Scale 1,Scale 2,Scale 3"]
//     [--compare=<old report.json>]
//
// The script selects the dev host as the test client's server and reloads the window. Main keeps its
// connection, so the reload starts the renderer's reads again, as a reconnect or a start does. Then:
// - `start`: the chat read of the agent that the window opens with.
// - `early`: right after the first chat read, it opens each agent of `--agents` in turn and waits for
//   its chat read. The lists of the other agents still load in this phase.
// - `settled`: after no request is in flight for a while, it opens the same agents again.
// For each chat read it records the requests in flight when the read started (the read included), the
// time of the read, the time from the click to the end of the read, and the time from the click to the
// first frame that shows the chat's messages without a loading screen. It also counts the requests
// of the whole run and the highest number in flight. The request file of main gives each request, so
// `OPENBOT_DEV_SYNC_PROFILE=1` is necessary.
// Writes .openbot-build/agent-switch-perf/<label>/report.json and, with --compare, comparison.md.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDynamicRecord, isNumber, isString } from "@pokebots/contracts/runtime-values";
import { createOpenBotLogger } from "@pokebots/logging";
import type { RemoteRequestRecord } from "@pokebots/team-client/sync-profile";
import type { Page } from "playwright-core";
import { argument, WAIT_MS } from "./channel-e2e-support";
import { assertMutationAllowed, connectToDevApp } from "./dev-automation/cdp-client";
import { type DevInstanceRecord, readDevInstanceRecords } from "./dev-automation/instance-registry";
import { resolveDevelopmentAppDataRoot } from "./development-state-paths";

const NAME = "agent-switch-perf";
const ROOT = resolve(import.meta.dirname, "..");
const SYNC_FILE = "dev-sync-profile.ndjson";
const POLL_MS = 100;
/** No request in flight for this long ends the `early` phase. */
const QUIET_MS = 2_000;
const CHAT_READ = /^\/v1\/agents\/[^/]+\/conversation-page/;
const logger = createOpenBotLogger(NAME);

const label = argument("label") ?? "current";
assert.match(label, /^\w[\w.-]*$/, "--label takes a folder name, not a path.");
const OUT = resolve(ROOT, ".openbot-build", NAME, label);
const agents = (argument("agents") ?? "Scale 1,Scale 2,Scale 3").split(",").map((name) => name.trim());
const compare = argument("compare");

interface ChatRead {
  phase: "start" | "early" | "settled";
  agent: string | null;
  /** Requests in flight when the chat read started, the read included. */
  inFlight: number;
  readMs: number;
  /** From the click on the agent to the end of its chat read. Null for the `start` read. */
  clickToReadMs: number | null;
  /**
   * From the click to the first frame that shows the chat's messages and no loading screen. For the
   * `start` read, from the reload.
   */
  clickToShownMs: number;
}

type PhaseSummary = Pick<ChatRead, "inFlight" | "readMs" | "clickToReadMs" | "clickToShownMs">;

interface Report {
  label: string;
  roundTripMs: number | null;
  agents: string[];
  reads: ChatRead[];
  /** Requests that the reload started until the `early` phase ended. */
  requests: number;
  peakInFlight: number;
  /** Requests by route, most first, for the routes with more than 3. */
  repeatedRoutes: Record<string, number>;
  summary: Record<ChatRead["phase"], PhaseSummary>;
}

function isRequestRecord(value: unknown): value is RemoteRequestRecord {
  return (
    isDynamicRecord(value) &&
    isString(value.route) &&
    isNumber(value.startedAt) &&
    isNumber(value.endedAt) &&
    isNumber(value.inFlight)
  );
}

interface SyncFile {
  records: RemoteRequestRecord[];
  open: number;
  roundTripMs: number | null;
}

function readSyncFile(path: string): SyncFile {
  const records: RemoteRequestRecord[] = [];
  let started = 0;
  let roundTripMs: number | null = null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    const value = JSON.parse(line);
    if (!isDynamicRecord(value)) continue;
    if (value.event === "process" && isNumber(value.roundTripMs)) roundTripMs = value.roundTripMs;
    else if (value.event === "start") started += 1;
    else if (value.event === "end" && isRequestRecord(value)) records.push(value);
  }
  return { records, open: started - records.length, roundTripMs };
}

function testClient(): DevInstanceRecord {
  const instances = readDevInstanceRecords().filter(
    (record) => record.service === "test-client" && resolve(record.projectRoot) === ROOT,
  );
  assert.equal(
    instances.length,
    1,
    "Start `OPENBOT_DEV_SYNC_PROFILE=1 OPENBOT_DEV_CLIENT_TRANSPORT=webrtc bun run dev:test-client` in this worktree first.",
  );
  const [instance] = instances;
  assert.ok(instance);
  return instance;
}

async function poll<T>(page: Page, what: string, read: () => T | null): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = read();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`Timed out: ${what}.`);
    await page.waitForTimeout(POLL_MS);
  }
}

/** The first chat read that started at or after `from` and ended. */
function chatReadAfter(syncPath: string, from: number): RemoteRequestRecord | null {
  return (
    readSyncFile(syncPath)
      .records.filter((record) => CHAT_READ.test(record.route) && record.startedAt >= from)
      .sort((a, b) => a.startedAt - b.startedAt)[0] ?? null
  );
}

/**
 * Clicks the chat of `name` in the sidebar. A chat button's name starts with the agent name and a period.
 * Returns the click time and the rows of the chat that showed before: the opened chat shows other rows.
 */
async function openChat(page: Page, name: string): Promise<{ at: number; before: (string | null)[] }> {
  await page.waitForFunction(
    (prefix) =>
      [...document.querySelectorAll("button")].some((button) =>
        (button.getAttribute("aria-label") ?? "").startsWith(prefix),
      ),
    `${name}.`,
    { polling: POLL_MS, timeout: WAIT_MS },
  );
  return page.evaluate((prefix) => {
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      (candidate.getAttribute("aria-label") ?? "").startsWith(prefix),
    );
    if (!(button instanceof HTMLElement)) throw new Error(`No chat ${prefix}`);
    const before = [...document.querySelectorAll(".conversation-scroll [data-chat-search-message]")].map((row) =>
      row.getAttribute("data-chat-search-message"),
    );
    const at = performance.timeOrigin + performance.now();
    button.click();
    return { at, before };
  }, `${name}.`);
}

/** Waits until the opened chat shows its messages and no loading screen. Returns that time. */
async function shownAt(page: Page, name: string, before: readonly (string | null)[] = []): Promise<number> {
  await page
    .waitForFunction(
      (rows) => {
        if (document.querySelector(".app-loading")) return false;
        const shownBefore = new Set(rows);
        return [...document.querySelectorAll(".conversation-scroll [data-chat-search-message]")].some(
          (row) => !shownBefore.has(row.getAttribute("data-chat-search-message")),
        );
      },
      before,
      { polling: "raf", timeout: WAIT_MS },
    )
    .catch((error: unknown) => {
      throw new Error(`Timed out: the chat of ${name} shows its messages.`, { cause: error });
    });
  return page.evaluate(() => performance.timeOrigin + performance.now());
}

async function switchTo(page: Page, syncPath: string, name: string, phase: ChatRead["phase"]): Promise<ChatRead> {
  const { at: clickedAt, before } = await openChat(page, name);
  const shown = await shownAt(page, name, before);
  const read = await poll(page, `the chat read of ${name}`, () => chatReadAfter(syncPath, clickedAt));
  const result: ChatRead = {
    phase,
    agent: name,
    inFlight: read.inFlight,
    readMs: Math.round(read.endedAt - read.startedAt),
    clickToReadMs: Math.round(read.endedAt - clickedAt),
    clickToShownMs: Math.round(shown - clickedAt),
  };
  logger.info(`${phase} ${name}: ${JSON.stringify(result)}`);
  return result;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function summarize(reads: readonly ChatRead[]): Report["summary"] {
  const phase = (name: ChatRead["phase"]): PhaseSummary => {
    const sample = reads.filter((read) => read.phase === name);
    const clicks = sample.flatMap((read) => (read.clickToReadMs === null ? [] : [read.clickToReadMs]));
    return {
      inFlight: median(sample.map((read) => read.inFlight)),
      readMs: median(sample.map((read) => read.readMs)),
      clickToReadMs: clicks.length ? median(clicks) : null,
      clickToShownMs: median(sample.map((read) => read.clickToShownMs)),
    };
  };
  return { start: phase("start"), early: phase("early"), settled: phase("settled") };
}

function comparison(before: Report, after: Report): string {
  const rows = (["start", "early", "settled"] as const).map((phase) => {
    const a = before.summary[phase];
    const b = after.summary[phase];
    return `| ${phase} | ${a.inFlight} → ${b.inFlight} | ${a.readMs} → ${b.readMs} | ${a.clickToReadMs ?? "-"} → ${b.clickToReadMs ?? "-"} | ${a.clickToShownMs} → ${b.clickToShownMs} |`;
  });
  return [
    `# Agent switch: ${before.label} → ${after.label}`,
    "",
    "Medians of each phase.",
    "",
    "| Phase | Requests in flight at the chat read | Chat read (ms) | Click to chat read end (ms) | Click to messages on screen (ms) |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Requests until quiet: ${before.requests} → ${after.requests}. Highest in flight: ${before.peakInFlight} → ${after.peakInFlight}.`,
    "",
  ].join("\n");
}

const instance = testClient();
assertMutationAllowed({
  command: "agent-switch-perf reloads the test client and opens chats",
  allowMutations: process.argv.includes("--allow-mutations"),
  instanceNamed: true,
  target: instance.instanceId,
});
const syncPath = join(resolveDevelopmentAppDataRoot(), instance.profile, SYNC_FILE);
assert.ok(existsSync(syncPath), `${syncPath} is missing. Start the stack with OPENBOT_DEV_SYNC_PROFILE=1.`);
const session = await connectToDevApp(instance.remoteDebuggingPort, logger, {
  expectedRendererPort: instance.rendererPort,
  ownerPid: instance.pid,
});
try {
  const page = session.page;
  const server = await page.evaluate<string | null>(`(async () => {
    const servers = await window.openbot.servers.list();
    const remote = servers.find((server) => server.kind === "remote");
    if (!remote) return null;
    if (!remote.active) await window.openbot.servers.select(remote.id);
    return remote.name;
  })()`);
  assert.ok(server, "The test client has no remote server. Restart the test client after the host registers.");
  // The window opens with the first agent of the list, so the first switch goes to another agent.
  const first = agents[0];
  assert.ok(first, "--agents names no agent.");
  await openChat(page, first);
  await poll(page, "the first chat settles", () => (readSyncFile(syncPath).open === 0 ? true : null));

  const reloadedAt = Date.now();
  await page.reload({ waitUntil: "commit" });
  const reads: ChatRead[] = [];
  const startShown = await shownAt(page, first);
  const start = await poll(page, "the chat read after the reload", () => chatReadAfter(syncPath, reloadedAt));
  reads.push({
    phase: "start",
    agent: first,
    inFlight: start.inFlight,
    readMs: Math.round(start.endedAt - start.startedAt),
    clickToReadMs: null,
    clickToShownMs: Math.round(startShown - reloadedAt),
  });
  for (const name of [...agents.slice(1), first]) reads.push(await switchTo(page, syncPath, name, "early"));

  // Quiet: no request in flight and no new one for QUIET_MS.
  let quietSince = 0;
  let seen = -1;
  await poll(page, "the client is quiet", () => {
    const file = readSyncFile(syncPath);
    if (file.open !== 0 || file.records.length !== seen) {
      seen = file.records.length;
      quietSince = Date.now();
      return null;
    }
    return Date.now() - quietSince >= QUIET_MS ? true : null;
  });
  const file = readSyncFile(syncPath);
  const run = file.records.filter((record) => record.startedAt >= reloadedAt);
  const routes: Record<string, number> = {};
  for (const record of run) routes[record.route] = (routes[record.route] ?? 0) + 1;

  for (const name of [...agents.slice(1), first]) reads.push(await switchTo(page, syncPath, name, "settled"));

  const report: Report = {
    label,
    roundTripMs: file.roundTripMs,
    agents,
    reads,
    requests: run.length,
    peakInFlight: Math.max(0, ...run.map((record) => record.inFlight)),
    repeatedRoutes: Object.fromEntries(
      Object.entries(routes)
        .filter(([, count]) => count > 3)
        .sort((a, b) => b[1] - a[1]),
    ),
    summary: summarize(reads),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  logger.info(`summary ${JSON.stringify(report.summary)} requests=${report.requests} peak=${report.peakInFlight}`);
  logger.info(`report: ${resolve(OUT, "report.json")}`);
  if (compare) {
    const before: Report = JSON.parse(readFileSync(resolve(compare), "utf8"));
    writeFileSync(resolve(OUT, "comparison.md"), comparison(before, report));
    logger.info(`comparison: ${resolve(OUT, "comparison.md")}`);
  }
} finally {
  await session.close();
}

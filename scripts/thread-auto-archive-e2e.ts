// Runs the real host, its agent service and its Team API on a temporary profile, with a Codex app-server
// fixture. Checks that the host archives idle side threads by itself (`thread-auto-archive-v1`): after
// the idle time, when the linked GitHub pull requests are merged, and to make room for a new thread. A
// busy thread stays open. The setting route is checked through the Team API.
// Run: bun scripts/thread-auto-archive-e2e.ts. Report: .openbot-build/thread-auto-archive-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { INPUT_LIMITS } from "@pokebots/contracts/input-limits";
import { AGENT_PROVIDERS, type AgentTask, isAgentTask, isAgentTasksSnapshot } from "@pokebots/contracts/ipc";
import { isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import { TEAM_API_ROUTES } from "@pokebots/contracts/team-api-routes";
import { TEAM_APP_VERSION_HEADER, TEAM_PROTOCOL_VERSION_HEADER } from "@pokebots/contracts/team-protocol";
import { AGENT_TASKS_ROUTES } from "@pokebots/contracts/team-protocol/agent-tasks-v1";
import { teamCapabilitiesForProtocol, teamCapabilityHeaders } from "@pokebots/contracts/team-protocol/current";
import {
  THREAD_AUTO_ARCHIVE_CAPABILITY,
  THREAD_AUTO_ARCHIVE_ROUTES,
} from "@pokebots/contracts/team-protocol/thread-auto-archive-v1";
import { decodeTeamProtocolV2Json, type TeamProtocolV2Json } from "@pokebots/contracts/team-protocol/v2";
import { TEAM_PROTOCOL_V10 } from "@pokebots/contracts/team-protocol/v10";
import { sourceText } from "@pokebots/i18n/source";
import { plugin } from "bun";
import { Effect } from "effect";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";

const OUT = resolve(import.meta.dirname, "../.openbot-build/thread-auto-archive-e2e");
const HOST_VERSION = "0.0.0-e2e";
const DAY_MS = 24 * 60 * 60_000;
const fixtureRoot = process.env.OPENBOT_THREAD_AUTO_ARCHIVE_FIXTURE_ROOT;
if (!fixtureRoot) {
  const root = await mkdtemp(join(tmpdir(), "openbot-thread-auto-archive-"));
  const home = join(root, "home");
  try {
    // Bun resolves os.homedir() at startup. The host and provider adapters must see the fixture home.
    const child = Bun.spawn([process.execPath, import.meta.path], {
      env: { ...process.env, HOME: home, USERPROFILE: home, OPENBOT_THREAD_AUTO_ARCHIVE_FIXTURE_ROOT: root },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exitCode = await child.exited;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  process.exit(process.exitCode ?? 0);
}
const root = fixtureRoot;
const userData = join(root, "user-data");
const home = join(root, "home");
const fakeCodex = join(root, "codex");
await mkdir(home, { recursive: true });
process.env.CODEX_HOME = join(home, ".codex");
process.env.OPENBOT_CODEX_PATH = fakeCodex;

// The main process imports Electron for its windows and IPC. No check here opens a window.
plugin({
  name: "thread-auto-archive-electron-boundary",
  setup(build) {
    class Inert {}
    build.module("electron", () => ({
      loader: "object",
      exports: {
        app: { getPath: () => tmpdir(), getVersion: () => HOST_VERSION, isPackaged: false, on: () => undefined },
        BrowserWindow: Object.assign(class extends Inert {}, { getAllWindows: () => [] }),
        MessageChannelMain: class extends Inert {},
        Notification: Object.assign(class extends Inert {}, { isSupported: () => false }),
        clipboard: {},
        dialog: {},
        ipcMain: { handle: () => undefined, removeHandler: () => undefined, on: () => undefined },
        nativeImage: {},
        net: {},
        powerMonitor: { on: () => undefined },
        safeStorage: { isEncryptionAvailable: () => false },
        screen: {},
        session: {},
        shell: { openExternal: async () => undefined },
        systemPreferences: {},
        webContents: { getAllWebContents: () => [] },
      },
    }));
  },
});

const { TeamApiServer } = await import("../src/main/team-api-server");
const { AGENT_ACCESS_FILE, AgentAccessStore } = await import("../src/main/agent-access-store");
const { TeamStore } = await import("../src/main/team-store");
const { createThreadAutoArchiveControl, GitHubPullRequestStates, ThreadAutoArchiveScheduler } = await import(
  "../src/main/thread-auto-archive"
);
const { AgentService } = await import("../src/backend/agent-service");
const { AgentStore } = await import("../src/backend/agent-store");
const { runCauseEffect } = await import("../src/backend/effect-boundary");
const { MailboxStore } = await import("../src/backend/mailbox-store");
const { OpenBotDatabase } = await import("../src/backend/openbot-database");
const { SidebarLayoutStore } = await import("../src/backend/sidebar-layout-store");

const unused = () => Effect.die(new Error("Not used by this check."));
const agentBrowser: AgentBrowserHost = {
  listTabs: () => [],
  beginTakeover: unused,
  endTakeover: () => {},
  userControlTabFor: () => null,
  awaitUserControlRelease: unused,
  resolveUploadTarget: unused,
  handleDynamicTool: unused,
  onChanged: () => () => {},
  onControlChanged: () => () => {},
  onDocumentChanged: () => () => {},
  clearControls: () => {},
  endControl: () => {},
  close: () => Effect.void,
  clearAgentSession: () => Effect.void,
  shareTab: () => undefined,
  unshareThread: () => undefined,
  agentTab: () => null,
};
const teamBrowser: TeamApiBrowser = {
  listTabs: () => [],
  getControlState: () => ({ sessions: [] }),
  open: unused,
  activate: unused,
  navigate: unused,
  reload: unused,
  stop: unused,
  setColorScheme: unused,
  takeUserControl: unused,
  startTeach: unused,
  stopTeach: () => [],
  releaseUserControl: () => {},
  releaseUserControlHeldBy: () => {},
  releaseUserControlRefused: () => {},
  close: unused,
  capturePreview: unused,
  setVisible: unused,
  getDisplayState: () => ({ tabs: [], activeTabId: null }),
  loadUrl: unused,
  isPrivate: () => false,
  startView: unused,
  dispatchViewInput: unused,
  copyViewSelection: unused,
  importSignIn: unused,
};

// "RUN <tag>" ends the turn at once. "HOLD <tag>" keeps it running until the test writes release-<tag>.
const FAKE_CODEX = `#!/usr/bin/env node
const { existsSync, watchFile, unwatchFile } = require("node:fs");
const { createInterface } = require("node:readline");
const { join } = require("node:path");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.160.1\\n");
  process.exit(0);
}
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
let threads = 0;
let turns = 0;
const finish = (threadId, turnId, text, status = "completed") => {
  if (text) write({ method: "item/completed", params: { threadId, turnId, item: { type: "agentMessage", id: "message-" + turnId, text, phase: "final_answer" } } });
  write({ method: "turn/completed", params: { threadId, turn: { id: turnId, status } } });
};
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  const params = message.params || {};
  const respond = (result) => write({ id: message.id, result });
  switch (message.method) {
    case "initialize": return respond({});
    case "account/read": return respond({ account: { type: "chatgpt", email: "fixture@example.test" } });
    case "account/rateLimits/read": return respond({ rateLimits: { limitId: "codex", primary: null, secondary: null }, rateLimitsByLimitId: null });
    case "model/list": return respond({ data: [{ model: "gpt-6-luna", displayName: "GPT-6 Luna" }] });
    case "plugin/list": return respond({ marketplaces: [] });
    case "config/read": return respond({ config: { mcp_servers: {} }, layers: [] });
    case "hooks/list": return respond({ data: [] });
    case "config/batchWrite":
    case "thread/name/set":
    case "thread/archive": return respond({});
    case "thread/start": return respond({ thread: { id: "thread-" + process.pid + "-" + (++threads), turns: [] } });
    case "thread/unsubscribe":
      respond({ status: "unsubscribed" });
      return write({ method: "thread/closed", params: { threadId: params.threadId } });
    case "thread/turns/list":
    case "thread/items/list":
    case "thread/backgroundTerminals/list": return respond({ data: [], nextCursor: null });
    case "thread/resume":
    case "thread/read": return respond({ thread: { id: params.threadId, turns: [] } });
    case "turn/start": {
      const { threadId } = params;
      const turnId = "turn-" + process.pid + "-" + (++turns);
      const text = (params.input || []).map((item) => item.text || "").join("\\n");
      respond({ turn: { id: turnId, status: "inProgress", items: [] } });
      write({ method: "turn/started", params: { threadId, turn: { id: turnId } } });
      const work = [...text.matchAll(/^(RUN|HOLD) ([A-Z0-9-]+)/gm)].at(-1);
      if (!work || work[1] === "RUN") return setImmediate(() => finish(threadId, turnId, "Done."));
      const file = join(${JSON.stringify(root)}, "release-" + work[2]);
      const release = () => {
        if (!existsSync(file)) return;
        unwatchFile(file, release);
        finish(threadId, turnId, "Done.");
      };
      watchFile(file, { interval: 50 }, release);
      return;
    }
    case "turn/interrupt":
      respond({});
      return finish(params.threadId, params.turnId, null, "interrupted");
    default:
      if (message.id !== undefined) write({ id: message.id, error: { code: -32601, message: "Method not found" } });
  }
});
`;
await writeFile(fakeCodex, FAKE_CODEX, { mode: 0o755 });

const database = new OpenBotDatabase(userData);
const store = new AgentStore(userData, home, database);
const mailbox = new MailboxStore(userData, store.sharedRoot, database);
const sidebarLayout = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
const team = new TeamStore(join(userData, "team.json"));
const agentAccess = new AgentAccessStore(join(userData, AGENT_ACCESS_FILE));
const preferencePath = join(userData, "openbot-thread-auto-archive-v1.json");
const threadAutoArchive = createThreadAutoArchiveControl(preferencePath);
const owner = { username: "test-owner", password: "e2e-owner-password" };
const member = { username: "test-member", password: "e2e-member-password" };

const agents = new AgentService({
  store,
  mailbox,
  browser: agentBrowser,
  sidebarLayout,
  preferredProvider: "codex",
  requestTimeoutMs: 2500,
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  memoryReviewInterval: () => 0,
  hostTurnLimits: { turnLimit: () => "unlimited", agentTaskLimit: () => 8 },
});
const server = new TeamApiServer({
  store: team,
  agents,
  mailbox,
  browser: teamBrowser,
  sidebarLayout,
  appVersion: HOST_VERSION,
  hiddenAgents: agents,
  agentAccess,
  agentTasks: agents,
  admin: { threadAutoArchive },
});

// GitHub: pull request 7 is merged, 8 is open. Each request is recorded, with whether it had the token.
const githubRequests: Array<{ path: string; authorized: boolean }> = [];
const fixtureToken = "ghu_fixture_connection_token";
const githubFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  githubRequests.push({ path: url.pathname, authorized: headers.get("authorization") === `Bearer ${fixtureToken}` });
  if (url.pathname === "/repos/acme/widgets/pulls/7")
    return Response.json({ state: "closed", merged: true, merged_at: "2026-11-20T10:00:00Z" });
  if (url.pathname === "/repos/acme/widgets/pulls/8") return Response.json({ state: "open", merged: false });
  return new Response("{}", { status: 404 });
};
let clock = Date.now();
const scheduler = new ThreadAutoArchiveScheduler({
  preference: () => threadAutoArchive.get(),
  sweep: (policy) => agents.autoArchiveThreads(policy),
  pullRequests: new GitHubPullRequestStates({
    connectionToken: () => Effect.succeed(fixtureToken),
    fetch: githubFetch,
    ghPath: null,
    now: () => clock,
  }),
  now: () => clock,
});

interface Report {
  passed: boolean;
  checks: {
    settingRoute?: { default: string; memberRefused: number; invalid: number; saved: boolean };
    mergedPullRequestArchives?: { archived: string; githubCalls: number; cachedSecondSweep: boolean };
    idleArchives?: { archived: number; busyStaysOpen: boolean };
    restore?: boolean;
    makeRoom?: { limit: number; archivedOldestIdle: string };
    allBusyRefuses?: { status: number };
  };
  error?: string;
}
const report: Report = { passed: false, checks: {} };
let port: number;
async function request(path: string, token: string | undefined, body?: TeamProtocolV2Json) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      [TEAM_PROTOCOL_VERSION_HEADER]: String(TEAM_PROTOCOL_V10),
      [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
      ...teamCapabilityHeaders(TEAM_PROTOCOL_V10, teamCapabilitiesForProtocol(TEAM_PROTOCOL_V10)),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? decodeTeamProtocolV2Json(JSON.parse(text)) : null };
}
async function call(path: string, expected: number, token?: string, body?: TeamProtocolV2Json) {
  const result = await request(path, token, body);
  assert.equal(result.status, expected, `${path} returned ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}
async function login(credentials: typeof owner) {
  const session = await call(TEAM_API_ROUTES.auth.login, 200, undefined, credentials);
  assert.ok(isDynamicRecord(session) && isString(session.sessionToken));
  return session.sessionToken;
}
async function waitFor<T>(name: string, read: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    assert.ok(Date.now() < deadline, `Timed out waiting for ${name}.`);
    await Bun.sleep(30);
  }
}

const failures: unknown[] = [];
try {
  await mkdir(userData, { recursive: true });
  await runCauseEffect(threadAutoArchive.load());
  await runCauseEffect(team.initialize());
  await runCauseEffect(team.configure("Thread Archive E2E Host", owner.username, owner.password));
  assert.equal(await runCauseEffect(agentAccess.load()), true);
  await runCauseEffect(sidebarLayout.initialize());
  await runCauseEffect(agents.initialize());
  port = await runCauseEffect(server.start());
  const ownerToken = await login(owner);
  const invite = await runCauseEffect(team.createInvite("member"));
  await call(TEAM_API_ROUTES.join.server, 201, undefined, { inviteToken: invite.token, ...member });
  const memberToken = await login(member);

  // The setting, through the Team API. Only an owner or admin reads or changes it.
  const serves = await call(TEAM_API_ROUTES.compatibility, 200);
  assert.ok(JSON.stringify(serves).includes(THREAD_AUTO_ARCHIVE_CAPABILITY), "The host serves the capability.");
  assert.deepEqual(await call(THREAD_AUTO_ARCHIVE_ROUTES.settings, 200, ownerToken, {}), {
    idleDays: 3,
    mergedPullRequests: true,
  });
  assert.equal((await request(THREAD_AUTO_ARCHIVE_ROUTES.settings, memberToken, {})).status, 403);
  assert.equal(
    (await request(THREAD_AUTO_ARCHIVE_ROUTES.update, memberToken, { idleDays: 0, mergedPullRequests: false })).status,
    403,
  );
  assert.equal(
    (await request(THREAD_AUTO_ARCHIVE_ROUTES.update, ownerToken, { idleDays: 2, mergedPullRequests: true })).status,
    400,
  );
  assert.deepEqual(
    await call(THREAD_AUTO_ARCHIVE_ROUTES.update, 200, ownerToken, { idleDays: 7, mergedPullRequests: false }),
    { idleDays: 7, mergedPullRequests: false },
  );
  const reloaded = createThreadAutoArchiveControl(preferencePath);
  await runCauseEffect(reloaded.load());
  assert.deepEqual(reloaded.get(), { idleDays: 7, mergedPullRequests: false });
  report.checks.settingRoute = { default: "3 days + pull requests", memberRefused: 403, invalid: 400, saved: true };

  const create = (name: string) =>
    runCauseEffect(
      agents.createAgentProfile({
        name,
        description: name,
        avatarSeed: name.toLowerCase(),
        avatarHue: null,
        provider: "codex",
      }),
    );
  const agent = await create("Worker");
  const list = async (agentId: string): Promise<AgentTask[]> => {
    const snapshot = await call(AGENT_TASKS_ROUTES.list, 200, ownerToken, { agentId });
    assert.ok(isAgentTasksSnapshot(snapshot));
    return snapshot.tasks;
  };
  const start = async (agentId: string, text: string): Promise<AgentTask> => {
    const started = await call(AGENT_TASKS_ROUTES.start, 200, ownerToken, { agentId, text });
    assert.ok(isAgentTask(started));
    return started;
  };
  const stateOf = async (agentId: string, taskId: string) =>
    (await list(agentId)).find(({ id }) => id === taskId)?.state;
  const settled = (agentId: string, taskIds: string[], state: AgentTask["state"]) =>
    waitFor(`${taskIds.length} threads ${state}`, async () => {
      const tasks = await list(agentId);
      return taskIds.every((taskId) => tasks.find(({ id }) => id === taskId)?.state === state) ? true : undefined;
    });

  const idleOne = await start(agent.id, "RUN IDLE-ONE");
  const idleTwo = await start(agent.id, "RUN IDLE-TWO");
  const busy = await start(agent.id, "HOLD BUSY");
  const merged = await start(agent.id, "RUN PR-MERGED fixed in https://github.com/acme/widgets/pull/7");
  const open = await start(agent.id, "RUN PR-OPEN see https://github.com/acme/widgets/pull/8");
  const mixed = await start(
    agent.id,
    "RUN PR-MIXED https://github.com/acme/widgets/pull/7 and https://github.com/acme/widgets/pull/8",
  );
  await settled(agent.id, [idleOne.id, idleTwo.id, merged.id, open.id, mixed.id], "idle");
  await settled(agent.id, [busy.id], "running");

  // Pull request rule only: the thread whose one pull request is merged is archived.
  await runCauseEffect(threadAutoArchive.set({ idleDays: 0, mergedPullRequests: true }));
  const pullRequestSweep = await Effect.runPromise(scheduler.sweepNow());
  assert.deepEqual(pullRequestSweep, { idle: 0, pullRequests: 1 });
  assert.equal(await stateOf(agent.id, merged.id), "closed");
  for (const taskId of [idleOne.id, idleTwo.id, open.id, mixed.id])
    assert.equal(await stateOf(agent.id, taskId), "idle");
  assert.equal(await stateOf(agent.id, busy.id), "running");
  assert.ok(githubRequests.length > 0 && githubRequests.every(({ authorized }) => authorized));
  const firstCalls = githubRequests.length;
  await Effect.runPromise(scheduler.sweepNow());
  // Pull request 7 is known merged and 8 was read less than 10 minutes ago: no new GitHub call.
  assert.equal(githubRequests.length, firstCalls);
  report.checks.mergedPullRequestArchives = { archived: merged.id, githubCalls: firstCalls, cachedSecondSweep: true };

  // Idle rule: two days later, with one idle day, every idle thread is archived. The busy one stays open.
  await runCauseEffect(threadAutoArchive.set({ idleDays: 1, mergedPullRequests: false }));
  clock = Date.now() + 2 * DAY_MS;
  const idleSweep = await Effect.runPromise(scheduler.sweepNow());
  assert.deepEqual(idleSweep, { idle: 4, pullRequests: 0 });
  for (const taskId of [idleOne.id, idleTwo.id, open.id, mixed.id])
    assert.equal(await stateOf(agent.id, taskId), "closed");
  assert.equal(await stateOf(agent.id, busy.id), "running");
  report.checks.idleArchives = { archived: 4, busyStaysOpen: true };

  // Off: nothing more is archived.
  await runCauseEffect(threadAutoArchive.set({ idleDays: 0, mergedPullRequests: false }));
  assert.deepEqual(await Effect.runPromise(scheduler.sweepNow()), { idle: 0, pullRequests: 0 });

  // An archived thread can be restored.
  await call(AGENT_TASKS_ROUTES.reopen, 200, ownerToken, { agentId: agent.id, taskId: idleOne.id });
  assert.equal(await stateOf(agent.id, idleOne.id), "idle");
  report.checks.restore = true;

  // A full thread list archives the idle thread with the oldest activity instead of refusing.
  const openCount = async () => (await list(agent.id)).filter(({ state }) => state !== "closed").length;
  const filler: string[] = [];
  while ((await openCount()) < INPUT_LIMITS.agentTasks)
    filler.push((await start(agent.id, `RUN FILL-${filler.length}`)).id);
  await settled(agent.id, filler, "idle");
  assert.equal(await openCount(), INPUT_LIMITS.agentTasks);
  const extra = await start(agent.id, "RUN EXTRA");
  assert.equal(await openCount(), INPUT_LIMITS.agentTasks);
  // The restored thread has the oldest activity of the idle threads. The list holds open threads
  // first, so an archived thread past the limit is not in it.
  assert.ok([undefined, "closed"].includes(await stateOf(agent.id, idleOne.id)));
  assert.equal(await stateOf(agent.id, busy.id), "running");
  assert.notEqual(await stateOf(agent.id, extra.id), "closed");
  report.checks.makeRoom = { limit: INPUT_LIMITS.agentTasks, archivedOldestIdle: idleOne.id };

  // Only a list where every thread is busy refuses a new thread.
  const full = await create("Full");
  for (let index = 0; index < INPUT_LIMITS.agentTasks; index += 1) await start(full.id, `HOLD FULL-${index}`);
  const refused = await request(AGENT_TASKS_ROUTES.start, ownerToken, { agentId: full.id, text: "RUN REFUSED" });
  assert.notEqual(refused.status, 200);
  assert.deepEqual(refused.body, {
    error: sourceText("error.backend.threadOpenLimitReached", { count: INPUT_LIMITS.agentTasks }),
  });
  report.checks.allBusyRefuses = { status: refused.status };
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  failures.push(error);
}
try {
  await Effect.runPromise(scheduler.close());
  await runCauseEffect(server.stop()).catch(() => undefined);
  await runCauseEffect(agents.stop()).catch(() => undefined);
  database.close();
  await mkdir(OUT, { recursive: true });
  const evidence = JSON.stringify(report, null, 2);
  await writeFile(join(OUT, "report.json"), `${evidence}\n`);
  process.stdout.write(`${evidence}\n`);
} catch (error) {
  failures.push(error);
}
if (failures.length > 0) throw failures[0];

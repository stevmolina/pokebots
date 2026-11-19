// Runs the real host and Team API on a temporary profile. A Codex app-server fixture calls tools
// and holds turns until the test releases or stops them. Run: bun scripts/start-agent-task-e2e.ts.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENT_PROVIDERS, isAgentTask, isAgentTasksSnapshot, isConversationSnapshot } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { TEAM_API_ROUTES } from "@openbot/contracts/team-api-routes";
import {
  TEAM_APP_VERSION_HEADER,
  TEAM_CAPABILITIES_HEADER,
  TEAM_PROTOCOL_VERSION_HEADER,
} from "@openbot/contracts/team-protocol";
import { AGENT_ACCESS_ROUTES } from "@openbot/contracts/team-protocol/agent-access-v1";
import { AGENT_TASKS_ROUTES } from "@openbot/contracts/team-protocol/agent-tasks-v1";
import { teamCapabilitiesForProtocol } from "@openbot/contracts/team-protocol/current";
import { teamHttpCodec } from "@openbot/contracts/team-protocol/http-codecs";
import { decodeTeamProtocolV2Json, type TeamProtocolV2Json } from "@openbot/contracts/team-protocol/v2";
import { TEAM_PROTOCOL_V9 } from "@openbot/contracts/team-protocol/v9";
import { sourceText } from "@openbot/i18n/source";
import { plugin } from "bun";
import { Effect } from "effect";
import { z } from "zod";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";
import type {
  startAgentTaskToolSchema,
  startTaskToolSchema,
  stopAgentTaskToolSchema,
} from "../src/backend/agent-tasks/agent-tasks";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";

const OUT = resolve(import.meta.dirname, "../.openbot-build/start-agent-task-e2e");
const HOST_VERSION = "0.0.0-e2e";
const root = await mkdtemp(join(tmpdir(), "openbot-start-agent-task-"));
const userData = join(root, "user-data");
const home = join(root, "home");
const fakeCodex = join(root, "codex");
const fakeLog = join(root, "codex.jsonl");
const holdNextThread = join(root, "hold-next-thread");
await mkdir(home);
process.env.CODEX_HOME = join(home, ".codex");
process.env.OPENBOT_CODEX_PATH = fakeCodex;

// The main process imports Electron for its windows and IPC. No check here opens a window.
plugin({
  name: "start-agent-task-electron-boundary",
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

// Session and turn IDs are unique across providers. The fixture logs each input and each tool reply.
const FAKE_CODEX = `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, unlinkSync, watchFile, unwatchFile } = require("node:fs");
const { createInterface } = require("node:readline");
const { join } = require("node:path");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.160.1\\n");
  process.exit(0);
}
const log = (entry) => appendFileSync(${JSON.stringify(fakeLog)}, JSON.stringify(entry) + "\\n");
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
const config = { config: { mcp_servers: {} }, layers: [] };
const waiting = new Map();
const held = new Map();
const backgroundWork = new Map();
const workspaces = new Map();
let threads = 0;
let turns = 0;
const afterRelease = (file, done) => {
  let completed = false;
  const release = () => {
    if (completed || !existsSync(file)) return;
    completed = true;
    unwatchFile(file, release);
    done();
  };
  watchFile(file, { interval: 50 }, release);
  queueMicrotask(release);
  return () => unwatchFile(file, release);
};
const finish = (threadId, turnId, text, status = "completed") => {
  const file = held.get(turnId);
  if (file) unwatchFile(file);
  held.delete(turnId);
  if (text) {
    const item = { type: "agentMessage", id: "message-" + turnId, text, phase: "final_answer" };
    write({ method: "item/completed", params: { threadId, turnId, item } });
  }
  write({ method: "turn/completed", params: { threadId, turn: { id: turnId, status } } });
};
const read = createInterface({ input: process.stdin });
read.on("line", (line) => {
  const message = JSON.parse(line);
  const params = message.params || {};
  const respond = (result) => write({ id: message.id, result });
  switch (message.method) {
    case "initialize": return respond({});
    case "account/read": return respond({ account: { type: "chatgpt", email: "fixture@example.test" } });
    case "account/rateLimits/read": return respond({ rateLimits: { limitId: "codex", primary: null, secondary: null }, rateLimitsByLimitId: null });
    case "model/list": return respond({ data: [{ model: "gpt-6-luna", displayName: "GPT-6 Luna" }] });
    case "plugin/list": return respond({ marketplaces: [] });
    case "config/read": return respond(config);
    case "config/batchWrite": return respond({});
    case "thread/name/set": return respond({});
    case "thread/start": {
      const id = "thread-" + process.pid + "-" + (++threads);
      workspaces.set(id, params.cwd);
      const gate = ${JSON.stringify(holdNextThread)};
      if (existsSync(gate)) {
        const tag = readFileSync(gate, "utf8");
        unlinkSync(gate);
        log({ tag, threadId: id, turnId: "" });
        return afterRelease(join(${JSON.stringify(root)}, "release-" + tag), () =>
          respond({ thread: { id, turns: [] } }));
      }
      return respond({ thread: { id, turns: [] } });
    }
    case "thread/unsubscribe": {
      const cancel = backgroundWork.get(params.threadId);
      if (cancel) cancel();
      return respond({ status: "Unsubscribed" });
    }
    case "thread/turns/list":
    case "thread/items/list": return respond({ data: [], nextCursor: null });
    case "thread/resume":
    case "thread/read": return respond({ thread: { id: params.threadId, turns: [] } });
    case "turn/start": {
      const { threadId } = params;
      const turnId = "turn-" + process.pid + "-" + (++turns);
      const text = (params.input || []).map((item) => item.text || "").join("\\n");
      respond({ turn: { id: turnId, status: "inProgress", items: [] } });
      write({ method: "turn/started", params: { threadId, turn: { id: turnId } } });
      const call = [...text.matchAll(/<<CALL([^\\n]+)CALL>>/g)].at(-1);
      if (call) {
        const { tag, tool, args } = JSON.parse(call[1]);
        const id = "tool-" + turnId;
        waiting.set(id, { tag, threadId, turnId });
        return write({ id, method: "item/tool/call", params: {
          threadId, turnId, callId: id, namespace: "openbot", tool: "tool_call",
          arguments: { name: "openbot." + tool, arguments: args },
        } });
      }
      const work = [...text.matchAll(/^(RUN|HOLD|FAIL|PLAN|BACKGROUND) ([A-Z-]+)$/gm)].at(-1);
      if (!work) return setImmediate(() => finish(threadId, turnId, "Ready."));
      const [_, mode, tag] = work;
      log({ tag, threadId, turnId, text, model: params.model, cwd: workspaces.get(threadId),
        sandbox: params.sandboxPolicy?.type });
      if (mode === "RUN") return setImmediate(() => finish(threadId, turnId, "RESULT " + tag));
      if (mode === "FAIL") return setImmediate(() => finish(threadId, turnId, null, "failed"));
      const file = join(${JSON.stringify(root)}, "release-" + tag);
      if (mode === "BACKGROUND") {
        const startedAt = new Date().toISOString();
        const report = (status, endedAt) => write({ method: "turn/subagents/updated", params: {
          threadId, turnId, subagents: [{ id: tag, title: tag, status, startedAt, endedAt,
            steps: [], background: true, agentType: null, prompt: null, error: null }],
        } });
        report("running", null);
        finish(threadId, turnId, null);
        const cancel = afterRelease(file, () => {
          backgroundWork.delete(threadId);
          report("completed", new Date().toISOString());
          const nextTurn = "turn-" + process.pid + "-" + (++turns);
          write({ method: "turn/started", params: { threadId, turn: { id: nextTurn }, unprompted: true } });
          const id = "tool-" + nextTurn;
          waiting.set(id, { tag: tag + "-TOOLS", threadId, turnId: nextTurn, answer: "RESULT " + tag });
          write({ id, method: "item/tool/call", params: {
            threadId, turnId: nextTurn, callId: id, namespace: "openbot", tool: "tool_call",
            arguments: { name: "openbot.list_workflows", arguments: {} },
          } });
        });
        return backgroundWork.set(threadId, () => {
          cancel();
          backgroundWork.delete(threadId);
          report("stopped", new Date().toISOString());
          log({ tag: tag + "-STOPPED", threadId, turnId });
        });
      }
      held.set(turnId, file);
      return afterRelease(file, () => {
        if (mode === "PLAN") write({ method: "turn/plan/updated", params: {
          threadId, turnId, plan: [{ step: "Finish the remaining work", status: "pending" }],
        } });
        finish(threadId, turnId, "RESULT " + tag);
      });
    }
    case "turn/interrupt": {
      respond({});
      return finish(params.threadId, params.turnId, null, "interrupted");
    }
    default: {
      const turn = waiting.get(message.id);
      if (turn) {
        waiting.delete(message.id);
        log({ tag: turn.tag, threadId: turn.threadId, turnId: turn.turnId, result: message.result });
        finish(turn.threadId, turn.turnId, turn.answer ?? "Tool call ended.");
      } else if (message.id !== undefined) write({ id: message.id, error: { code: -32601, message: "Method not found" } });
    }
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
const owner = { username: "test-owner", password: "e2e-owner-password" };
const member = { username: "test-member", password: "e2e-member-password" };
let taskLimit = 2;
const autoApproving = new Set<string>();

const agents = new AgentService({
  store,
  mailbox,
  browser: agentBrowser,
  sidebarLayout,
  preferredProvider: "codex",
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  memoryReviewInterval: () => 0,
  hostTurnLimits: { turnLimit: () => "unlimited", agentTaskLimit: () => taskLimit },
  approvalAutomation: {
    autoApproves: (id) => autoApproving.has(id),
    set: () => Effect.succeed({ defaultAutoApprove: false, autoApproveOverrides: {} }),
  },
  channelPersonAgentLevel: (personId, agentId) => {
    const person = team.getMember(personId);
    return person && !person.disabled ? server.agentLevel(person, agentId) : "none";
  },
  channelRemotePerson: () => true,
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
});

const report: { passed: boolean; checks: Record<string, string | boolean>; error?: string } = {
  passed: false,
  checks: {},
};
let port: number;
async function call(
  path: string,
  expected: number,
  token?: string,
  body?: TeamProtocolV2Json,
): Promise<TeamProtocolV2Json> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      [TEAM_PROTOCOL_VERSION_HEADER]: String(TEAM_PROTOCOL_V9),
      [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
      [TEAM_CAPABILITIES_HEADER]: teamCapabilitiesForProtocol(TEAM_PROTOCOL_V9).join(","),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${path} returned ${response.status}.`);
  return text ? decodeTeamProtocolV2Json(JSON.parse(text)) : null;
}

async function login(credentials: typeof owner) {
  const session = await call(TEAM_API_ROUTES.auth.login, 200, undefined, credentials);
  assert.ok(isDynamicRecord(session) && isString(session.sessionToken));
  return session.sessionToken;
}

async function waitFor<T>(name: string, read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    assert.ok(Date.now() < deadline, `Timed out waiting for ${name}.`);
    await Bun.sleep(30);
  }
}

const fixtureEntry = z.object({
  tag: z.string(),
  threadId: z.string(),
  turnId: z.string(),
  text: z.string().optional(),
  model: z.string().optional(),
  sandbox: z.string().optional(),
  cwd: z.string().optional(),
  result: z.object({ success: z.boolean(), contentItems: z.array(z.object({ text: z.string() })) }).optional(),
});

async function fixtureLog(tag: string) {
  return waitFor(tag, async () => {
    const log = await readFile(fakeLog, "utf8").catch(() => "");
    return log
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => fixtureEntry.parse(JSON.parse(line)))
      .find((entry) => entry.tag === tag);
  });
}

type TaskToolArguments = z.input<
  typeof startAgentTaskToolSchema | typeof startTaskToolSchema | typeof stopAgentTaskToolSchema
>;
const command = (tag: string, tool: string, args: TaskToolArguments | Record<string, never>) =>
  `<<CALL${JSON.stringify({ tag, tool, args })}CALL>>`;
const launchInfo = z.object({ threadId: z.string(), agentId: z.string() });

const failures: unknown[] = [];
try {
  await mkdir(userData);
  await runCauseEffect(team.initialize());
  await runCauseEffect(team.configure("Task E2E Host", owner.username, owner.password));
  assert.equal(await runCauseEffect(agentAccess.load()), true);
  await runCauseEffect(sidebarLayout.initialize());
  await runCauseEffect(agents.initialize());
  port = await runCauseEffect(server.start());

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
  const caller = await create("Caller");
  const target = await create("Target");
  const ownerToken = await login(owner);
  const invite = await runCauseEffect(team.createInvite("member"));
  await call(TEAM_API_ROUTES.join.server, 201, undefined, { inviteToken: invite.token, ...member });
  const token = await login(member);
  let revision = 0;
  const access = (level: "none" | "view" | "chat") =>
    call(AGENT_ACCESS_ROUTES.set, 200, ownerToken, {
      revision: revision++,
      everyone: { [caller.id]: "chat", [target.id]: level },
      roles: [],
    });
  await access("chat");

  const chat = async (agentId: string, taskId?: string) => {
    const path = TEAM_API_ROUTES.agent.conversation(agentId);
    const snapshot = taskId
      ? await call(AGENT_TASKS_ROUTES.read, 200, token, { agentId, taskId })
      : teamHttpCodec(TEAM_PROTOCOL_V9).decodeResponse("GET", path, 200, await call(path, 200, token));
    assert.ok(isConversationSnapshot(snapshot), JSON.stringify(snapshot));
    return snapshot;
  };
  const send = (agentId: string, text: string, taskId?: string) =>
    taskId
      ? call(AGENT_TASKS_ROUTES.send, 202, token, { agentId, taskId, text })
      : call(TEAM_API_ROUTES.agent.messages(agentId), 202, token, { text, attachmentDraftIds: [] });
  const tasks = async (agentId: string, reader = token) => {
    const snapshot = await call(AGENT_TASKS_ROUTES.list, 200, reader, { agentId });
    assert.ok(isAgentTasksSnapshot(snapshot));
    return snapshot.tasks;
  };
  const task = async (agentId: string, taskId: string) => (await tasks(agentId)).find(({ id }) => id === taskId);
  const targetTaskIds = async () => (await tasks(target.id, ownerToken)).map(({ id }) => id).sort();
  const resultIn = (result: string, taskId?: string) =>
    waitFor(result, async () => {
      const snapshot = await chat(caller.id, taskId);
      return snapshot.messages.find((message) => message.source === "agent" && message.text === result);
    });
  const start = async (tag: string, brief: string, targetId?: string, sourceTaskId?: string) => {
    await send(caller.id, command(tag, "start_agent_task", { brief, agentId: targetId }), sourceTaskId);
    const entry = await fixtureLog(tag);
    assert.equal(entry.result?.success, true, JSON.stringify(entry.result));
    const result = launchInfo.parse(JSON.parse(entry.result?.contentItems[0]?.text ?? ""));
    assert.equal(result.agentId, targetId ?? caller.id);
    return result;
  };
  const stop = async (tag: string, threadId: string, sourceTaskId?: string) => {
    await send(caller.id, command(tag, "stop_agent_task", { threadId }), sourceTaskId);
    return (await fixtureLog(tag)).result?.success;
  };

  await writeFile(join(root, "release-SELF"), "");
  const self = await start("self", "HOLD SELF");
  const selfWork = await fixtureLog("SELF");
  const selfResult = await resultIn("RESULT SELF");
  const selfThread = await chat(caller.id, self.threadId);
  assert.equal(selfThread.threadId, self.threadId);
  assert.equal(selfResult.senderAgentId, caller.id);
  assert.ok(
    (await chat(caller.id)).messages.some(
      ({ id, turnId }) => id === selfResult.replyToMessageId && turnId === selfResult.turnId,
    ),
  );
  assert.notEqual(selfWork.threadId, (await fixtureLog("self")).threadId);
  assert.equal(selfWork.cwd, caller.workspacePath);
  assert.equal(selfWork.model, caller.model);
  assert.ok(selfThread.messages.some(({ text }) => text === "HOLD SELF"));
  assert.ok(!selfWork.text?.includes("<<CALL"));
  report.checks.selfThread = self.threadId;
  report.checks.preexistingRelease = true;

  const side = await call(AGENT_TASKS_ROUTES.start, 200, token, { agentId: caller.id, text: "Side chat" });
  assert.ok(isAgentTask(side));
  await send(target.id, "HOLD TARGET-MAIN");
  const targetMain = await fixtureLog("TARGET-MAIN");
  const first = await start("first", "HOLD FIRST", target.id);
  const second = await start("second", "HOLD SECOND", target.id, side.id);
  const [firstWork, secondWork] = await Promise.all([fixtureLog("FIRST"), fixtureLog("SECOND")]);
  for (const worker of [firstWork, secondWork]) {
    assert.equal(worker.cwd, target.workspacePath);
    assert.equal(worker.model, target.model);
    assert.ok(!worker.text?.includes("Side chat"));
    assert.ok(!worker.text?.includes("<<CALL"));
  }
  assert.equal(new Set([targetMain.threadId, firstWork.threadId, secondWork.threadId]).size, 3);
  assert.equal((await chat(target.id, first.threadId)).activeTurnId, firstWork.turnId);
  assert.equal((await chat(target.id, second.threadId)).activeTurnId, secondWork.turnId);
  assert.equal((await chat(target.id)).activeTurnId, targetMain.turnId);
  report.checks.concurrentProviderSessions = true;

  const queued = await start("queued", "HOLD QUEUED", target.id);
  assert.equal((await task(target.id, queued.threadId))?.state, "queued");
  assert.equal(await stop("stop-queued", queued.threadId), true);
  assert.equal((await task(target.id, queued.threadId))?.queuedMessages.length, 0);
  assert.equal(await stop("wrong-chat", first.threadId, side.id), false);
  assert.equal(await stop("stop-first", first.threadId), true);
  await waitFor("first interrupted", async () =>
    (await task(target.id, first.threadId))?.outcome === "interrupted" ? true : undefined,
  );
  assert.equal((await chat(target.id, second.threadId)).activeTurnId, secondWork.turnId);
  assert.equal((await chat(target.id)).activeTurnId, targetMain.turnId);
  report.checks.cancellationIsolated = true;

  // Archive the originating side chat before the target finishes. Its answer still belongs there.
  await waitFor("side caller idle", async () =>
    (await chat(caller.id, side.id)).activeTurnId === null ? true : undefined,
  );
  await call(AGENT_TASKS_ROUTES.close, 200, token, { agentId: caller.id, taskId: side.id });
  await writeFile(join(root, "release-SECOND"), "");
  const otherResult = await resultIn("RESULT SECOND", side.id);
  assert.equal(otherResult.senderAgentId, target.id);
  assert.ok(!(await chat(caller.id)).messages.some(({ text }) => text === "RESULT SECOND"));
  assert.ok(!(await chat(target.id)).messages.some(({ text }) => text.includes("HOLD SECOND")));
  report.checks.exactArchivedSideChat = side.id;

  const beforeDenied = await targetTaskIds();
  for (const level of ["none", "view"] as const) {
    await access(level);
    await send(caller.id, command(level, "start_agent_task", { brief: "HOLD DENIED", agentId: target.id }));
    assert.equal((await fixtureLog(level)).result?.success, false);
    assert.deepEqual(await targetTaskIds(), beforeDenied);
  }
  report.checks.joinedMemberPermissions = true;

  const legacyStart = async (tag: string, brief: string) => {
    await send(caller.id, command(tag, "start_task", { title: "Legacy task", brief }));
    const reply = (await fixtureLog(tag)).result;
    assert.equal(reply?.success, true);
    return z.object({ taskId: z.string() }).parse(JSON.parse(reply?.contentItems[0]?.text ?? "")).taskId;
  };
  await legacyStart(
    "legacy-parent",
    command("legacy-child", "start_task", {
      title: "Nested legacy task",
      brief: command("legacy-denied", "start_agent_task", { brief: "HOLD DENIED", agentId: target.id }),
    }),
  );
  assert.equal((await fixtureLog("legacy-child")).result?.success, true);
  assert.equal((await fixtureLog("legacy-denied")).result?.success, false);
  assert.deepEqual(await targetTaskIds(), beforeDenied);
  await legacyStart("legacy-remote", command("legacy-workflows", "list_workflows", {}));
  assert.match((await fixtureLog("legacy-workflows")).result?.contentItems[0]?.text ?? "", /cannot read workflows/);
  report.checks.legacyRequesterPermissions = true;
  await access("chat");

  const waitForBackground = (threadId: string) =>
    waitFor("background work without an active turn", async () => {
      const snapshot = await chat(target.id, threadId);
      return snapshot.activeTurnId === null &&
        snapshot.messages.some(({ subagents }) => subagents?.some(({ status }) => status === "running"))
        ? true
        : undefined;
    });
  const background = await start("background", "BACKGROUND BACKGROUND", target.id);
  await waitForBackground(background.threadId);
  const backgroundRequest = (await fixtureLog("background")).turnId;
  const launchResults = async (turnId: string) =>
    (await chat(caller.id)).messages.filter((message) => message.source === "agent" && message.turnId === turnId);
  assert.deepEqual(await launchResults(backgroundRequest), []);
  await writeFile(join(root, "release-BACKGROUND"), "");
  const backgroundResult = await resultIn("RESULT BACKGROUND");
  assert.equal(backgroundResult.turnId, backgroundRequest);
  assert.equal(backgroundResult.senderAgentId, target.id);
  assert.equal((await launchResults(backgroundRequest)).length, 1);
  assert.match((await fixtureLog("BACKGROUND-TOOLS")).result?.contentItems[0]?.text ?? "", /cannot read workflows/);
  report.checks.backgroundFinalResult = true;

  await writeFile(join(root, "release-BACKGROUND-FAST"), "");
  await start("background-fast", "BACKGROUND BACKGROUND-FAST", target.id);
  const fastResult = await resultIn("RESULT BACKGROUND-FAST");
  assert.equal(fastResult.turnId, (await fixtureLog("background-fast")).turnId);
  report.checks.fastBackgroundFinalResult = true;

  const backgroundStop = await start("background-stop", "BACKGROUND BACKGROUND-STOP", target.id);
  await waitForBackground(backgroundStop.threadId);
  assert.equal(await stop("stop-background", backgroundStop.threadId), true);
  assert.equal((await fixtureLog("BACKGROUND-STOP-STOPPED")).threadId, (await fixtureLog("BACKGROUND-STOP")).threadId);
  const backgroundStopRequest = (await fixtureLog("background-stop")).turnId;
  assert.deepEqual(
    (await launchResults(backgroundStopRequest)).map(({ text }) => text),
    [sourceText("status.agent.agentTaskStopped")],
  );
  assert.equal((await chat(target.id)).activeTurnId, targetMain.turnId);
  report.checks.backgroundCancellationIsolated = true;

  const failed = await start("failed", "FAIL FAILED", target.id);
  const failedResult = await resultIn(sourceText("status.agent.agentTaskFailed"));
  assert.equal(failedResult.turnId, (await fixtureLog("failed")).turnId);
  assert.equal((await task(target.id, failed.threadId))?.outcome, "failed");
  report.checks.reasonlessFailure = true;

  const planHolder = await start("plan-holder", "HOLD PLAN-HOLDER");
  const planHolderWork = await fixtureLog("PLAN-HOLDER");
  const plan = await start("plan", "PLAN PLAN");
  const plannedTurnRequest = (await fixtureLog("plan")).turnId;
  const plannedTurn = await fixtureLog("PLAN");
  let resumedPlan = false;
  agents.on("event", (event) => {
    if (event.type !== "agent-task-conversation" || event.taskId !== plan.threadId) return;
    if (event.snapshot.messages.some(({ id }) => id === `${plannedTurn.turnId}:plan-continuation`)) taskLimit = 1;
    const active = event.snapshot.activeTurnId;
    if (active && active !== plannedTurn.turnId) resumedPlan = true;
  });
  await writeFile(join(root, "release-PLAN"), "");
  await waitFor("plan continuation held between turns", async () =>
    taskLimit === 1 && (await chat(caller.id, plan.threadId)).activeTurnId === null ? true : undefined,
  );
  assert.equal(await stop("stop-plan", plan.threadId), true);
  const stoppedPlan = await waitFor("plan stop result", async () =>
    (await launchResults(plannedTurnRequest)).find(({ text }) => text === sourceText("status.agent.agentTaskStopped")),
  );
  assert.equal(stoppedPlan.senderAgentId, caller.id);
  assert.equal((await chat(caller.id, planHolder.threadId)).activeTurnId, planHolderWork.turnId);
  taskLimit = 2;
  await writeFile(join(root, "release-PLAN-HOLDER"), "");
  await resultIn("RESULT PLAN-HOLDER");
  assert.equal((await chat(caller.id, plan.threadId)).activeTurnId, null);
  assert.equal(resumedPlan, false);
  report.checks.queuedPlanCancellation = true;

  await writeFile(holdNextThread, "POLICY-THREAD");
  await start("policy", "RUN POLICY", target.id);
  await fixtureLog("POLICY-THREAD");
  autoApproving.add(target.id);
  await writeFile(join(root, "release-POLICY-THREAD"), "");
  const policyResult = await resultIn(sourceText("error.team.agentNotFound"));
  assert.equal(policyResult.turnId, (await fixtureLog("policy")).turnId);
  autoApproving.delete(target.id);
  report.checks.changedEligibilityReported = true;

  await writeFile(holdNextThread, "SANDBOX-THREAD");
  await start("sandbox", "RUN SANDBOX", target.id);
  await fixtureLog("SANDBOX-THREAD");
  await runCauseEffect(agents.updateAgent({ agentId: target.id, access: "workspace" }));
  await writeFile(join(root, "release-SANDBOX-THREAD"), "");
  assert.equal((await fixtureLog("SANDBOX")).sandbox, "workspaceWrite");
  await resultIn("RESULT SANDBOX");
  report.checks.currentSandboxPolicy = true;

  await runCauseEffect(agents.updateAgent({ agentId: caller.id, computerUse: false }));
  await send(caller.id, command("host-limit", "start_agent_task", { brief: "HOLD DENIED", agentId: target.id }));
  assert.equal((await fixtureLog("host-limit")).result?.success, false);
  report.checks.hostPermissionLimit = true;

  const legacyId = await legacyStart("legacy", "RUN LEGACY");
  await waitFor("legacy task result", async () =>
    (await chat(caller.id, legacyId)).messages.find(({ text }) => text === "RESULT LEGACY"),
  );
  assert.ok(!(await chat(caller.id)).messages.some(({ text }) => text === "RESULT LEGACY"));
  report.checks.legacyResultStaysInTask = true;

  await writeFile(join(root, "release-TARGET-MAIN"), "");
  await waitFor("target main idle", async () => ((await chat(target.id)).activeTurnId === null ? true : undefined));
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  failures.push(error);
}
try {
  await runCauseEffect(server.stop()).catch(() => undefined);
  await runCauseEffect(agents.stop()).catch(() => undefined);
  database.close();
  await mkdir(OUT, { recursive: true });
  const evidence = JSON.stringify(report, null, 2);
  await writeFile(join(OUT, "report.json"), `${evidence}\n`);
  process.stdout.write(`${evidence}\n`);
} catch (error) {
  failures.push(error);
} finally {
  try {
    await rm(root, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
}
if (failures.length > 0) throw failures[0];

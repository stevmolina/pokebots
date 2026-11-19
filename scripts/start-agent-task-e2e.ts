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
const { appendFileSync, watchFile, unwatchFile } = require("node:fs");
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
const workspaces = new Map();
let threads = 0;
let turns = 0;
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
      return respond({ thread: { id, turns: [] } });
    }
    case "thread/unsubscribe": return respond({ status: "Unsubscribed" });
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
      const work = [...text.matchAll(/^(RUN|HOLD) ([A-Z-]+)$/gm)].at(-1);
      if (!work) return setImmediate(() => finish(threadId, turnId, "Ready."));
      const [_, mode, tag] = work;
      log({ tag, threadId, turnId, text, model: params.model, cwd: workspaces.get(threadId) });
      if (mode === "RUN") return setImmediate(() => finish(threadId, turnId, "RESULT " + tag));
      const file = join(${JSON.stringify(root)}, "release-" + tag);
      held.set(turnId, file);
      return watchFile(file, { interval: 50 }, (now) => {
        if (now.nlink) finish(threadId, turnId, "RESULT " + tag);
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
        finish(turn.threadId, turn.turnId, "Tool call ended.");
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

const agents = new AgentService({
  store,
  mailbox,
  browser: agentBrowser,
  sidebarLayout,
  preferredProvider: "codex",
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  memoryReviewInterval: () => 0,
  hostTurnLimits: { turnLimit: () => "unlimited", agentTaskLimit: () => 2 },
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
const command = (tag: string, tool: string, args: TaskToolArguments) =>
  `<<CALL${JSON.stringify({ tag, tool, args })}CALL>>`;
const launchInfo = z.object({ threadId: z.string(), agentId: z.string() });

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
  const task = async (agentId: string, taskId: string) => {
    const snapshot = await call(AGENT_TASKS_ROUTES.list, 200, token, { agentId });
    assert.ok(isAgentTasksSnapshot(snapshot));
    return snapshot.tasks.find(({ id }) => id === taskId);
  };
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

  const self = await start("self", "RUN SELF");
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
  assert.ok(selfThread.messages.some(({ text }) => text === "RUN SELF"));
  assert.ok(!selfWork.text?.includes("<<CALL"));
  report.checks.selfThread = self.threadId;

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

  for (const level of ["none", "view"] as const) {
    await access(level);
    await send(caller.id, command(level, "start_agent_task", { brief: "HOLD DENIED", agentId: target.id }));
    assert.equal((await fixtureLog(level)).result?.success, false);
  }
  await access("chat");
  assert.ok(
    !(await call(AGENT_TASKS_ROUTES.list, 200, token, { agentId: target.id }).then(
      (snapshot) => isAgentTasksSnapshot(snapshot) && snapshot.tasks.some(({ title }) => title === "HOLD DENIED"),
    )),
  );
  report.checks.joinedMemberPermissions = true;

  await runCauseEffect(agents.updateAgent({ agentId: caller.id, computerUse: false }));
  await send(caller.id, command("host-limit", "start_agent_task", { brief: "HOLD DENIED", agentId: target.id }));
  assert.equal((await fixtureLog("host-limit")).result?.success, false);
  report.checks.hostPermissionLimit = true;

  await send(caller.id, command("legacy", "start_task", { title: "Legacy task", brief: "RUN LEGACY" }));
  const legacy = (await fixtureLog("legacy")).result;
  assert.equal(legacy?.success, true);
  const { taskId: legacyId } = z.object({ taskId: z.string() }).parse(JSON.parse(legacy?.contentItems[0]?.text ?? ""));
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
  throw error;
} finally {
  await runCauseEffect(server.stop()).catch(() => undefined);
  await runCauseEffect(agents.stop()).catch(() => undefined);
  database.close();
  await mkdir(OUT, { recursive: true });
  const evidence = JSON.stringify(report, null, 2);
  await writeFile(join(OUT, "report.json"), `${evidence}\n`);
  process.stdout.write(`${evidence}\n`);
  await rm(root, { recursive: true, force: true });
}

// Runs the real host, its queue and the Team API on a temporary profile, with a fake Rooms MCP server
// and a fake Codex CLI that logs each prompt it receives. Checks that the host listens to Rooms for
// the agents that have it on: new messages start a turn, a paused room does not, the hourly cap
// holds, failures back off instead of spinning, Stop on a room page turns listening off, and the
// setting survives a restart. Also checks the `rooms-listening-v1` routes.
// Run: bun scripts/rooms-listening-e2e.ts. Writes .openbot-build/rooms-listening-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENT_PROVIDERS, isConversationSnapshot } from "@pokebots/contracts/ipc";
import { isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import { TEAM_API_ROUTES } from "@pokebots/contracts/team-api-routes";
import { TEAM_APP_VERSION_HEADER, TEAM_PROTOCOL_VERSION_HEADER } from "@pokebots/contracts/team-protocol";
import { teamCapabilitiesForProtocol, teamCapabilityHeaders } from "@pokebots/contracts/team-protocol/current";
import { teamHttpCodec } from "@pokebots/contracts/team-protocol/http-codecs";
import {
  decodeRoomsListeningResponse,
  ROOMS_LISTENING_CAPABILITY,
  ROOMS_LISTENING_ROUTES,
} from "@pokebots/contracts/team-protocol/rooms-listening-v1";
import { decodeTeamProtocolV2Json, type TeamProtocolV2Json } from "@pokebots/contracts/team-protocol/v2";
import { TEAM_PROTOCOL_V10 } from "@pokebots/contracts/team-protocol/v10";
import { plugin } from "bun";
import { Effect } from "effect";
import { z } from "zod";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";

const OUT = resolve(import.meta.dirname, "../.openbot-build/rooms-listening-e2e");
const HOST_VERSION = "0.0.0-e2e";
const fixtureRoot = process.env.OPENBOT_ROOMS_LISTENING_FIXTURE_ROOT;
if (!fixtureRoot) {
  const root = await mkdtemp(join(tmpdir(), "openbot-rooms-listening-"));
  const home = join(root, "home");
  try {
    // Bun resolves os.homedir() at startup. The host and provider adapters must see the fixture home.
    const child = Bun.spawn([process.execPath, import.meta.path], {
      env: { ...process.env, HOME: home, USERPROFILE: home, OPENBOT_ROOMS_LISTENING_FIXTURE_ROOT: root },
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
const promptLog = join(root, "prompts.jsonl");
await mkdir(home, { recursive: true });
process.env.CODEX_HOME = join(home, ".codex");
process.env.OPENBOT_CODEX_PATH = fakeCodex;

plugin({
  name: "rooms-listening-electron-boundary",
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
const { createRoomsListeningControl } = await import("../src/main/rooms-listening-preference-store");
const { RoomsListener } = await import("../src/main/rooms-listener");
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

// The CLI logs the full prompt text of each turn with the tag in it, then answers at once.
const FAKE_CODEX = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.160.1\\n");
  process.exit(0);
}
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
let threads = 0;
let turns = 0;
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
    case "thread/start": return respond({ thread: { id: "thread-" + process.pid + "-" + (++threads), turns: [] } });
    case "thread/resume":
    case "thread/read": return respond({ thread: { id: params.threadId, turns: [] } });
    case "thread/turns/list":
    case "thread/items/list": return respond({ data: [], nextCursor: null });
    case "turn/start": {
      const { threadId } = params;
      const turnId = "turn-" + process.pid + "-" + (++turns);
      const text = (params.input || []).map((item) => item.text || "").join("\\n");
      appendFileSync(${JSON.stringify(promptLog)}, JSON.stringify({ provider: "codex", text, at: Date.now() }) + "\\n");
      respond({ turn: { id: turnId, status: "inProgress", items: [] } });
      write({ method: "turn/started", params: { threadId, turn: { id: turnId } } });
      return setImmediate(() => {
        write({ method: "item/completed", params: { threadId, turnId, item: { type: "agentMessage", id: "m-" + turnId, text: "Ready.", phase: "final_answer" } } });
        write({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
      });
    }
    default:
      if (message.id !== undefined) respond({});
  }
});
`;
await writeFile(fakeCodex, FAKE_CODEX, { mode: 0o755 });

// A fake Rooms MCP server over streamable HTTP. Each `wait` call takes the next planned answer for the
// calling agent; with none planned it holds 1 s and answers nothing new, as a quiet room does.
const rpcRequest = z.object({
  id: z.number().optional(),
  method: z.string(),
  params: z
    .object({
      protocolVersion: z.string().optional(),
      arguments: z.object({ agent: z.string().optional() }).optional(),
    })
    .optional(),
});
type WaitAnswer = { status?: number; result?: unknown };
const planned = new Map<string, WaitAnswer[]>();
const waitCalls: { agent: string; at: number; authorization: string | null }[] = [];
const plan = (agent: string, ...answers: WaitAnswer[]) =>
  planned.set(agent, [...(planned.get(agent) ?? []), ...answers]);
const roomsServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (request.method !== "POST") return new Response(null, { status: request.method === "DELETE" ? 200 : 405 });
    const authorization = request.headers.get("authorization");
    if (authorization !== "Bearer rooms-fixture-token") return new Response("unauthorized", { status: 401 });
    const message = rpcRequest.parse(await request.json());
    if (message.id === undefined) return new Response(null, { status: 202 });
    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: message.id, result });
    if (message.method === "initialize")
      return reply({
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "Rooms", version: "fixture" },
      });
    if (message.method !== "tools/call") return reply({});
    const agent = message.params?.arguments?.agent ?? "";
    waitCalls.push({ agent, at: Date.now(), authorization });
    const next = planned.get(agent)?.shift();
    if (next?.status) return new Response("upstream failed", { status: next.status });
    if (!next) await Bun.sleep(1_000);
    const result = next?.result ?? { messages: [], rooms: {}, next: "Nothing new. Keep listening." };
    return reply({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
  },
});
const roomMessage = (id: number, room: string, body: string) => ({
  id,
  room,
  thread: null,
  author: "Claude · Ada #1a2b",
  kind: "agent",
  body,
  mentions: [],
  at: "2026-11-25T12:00:00Z",
});
const rooms = {
  r_design: { name: "Design", notice: "Keep it short.", paused: false },
  r_paused: { name: "Paused room", notice: "", paused: true },
};

const database = new OpenBotDatabase(userData);
const store = new AgentStore(userData, home, database);
const mailbox = new MailboxStore(userData, store.sharedRoot, database);
const sidebarLayout = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
const team = new TeamStore(join(userData, "team.json"));
const agentAccess = new AgentAccessStore(join(userData, AGENT_ACCESS_FILE));
const owner = { username: "test-owner", password: "e2e-owner-password" };
/** The agents that have the Rooms app, as `enabledMcpServers` gives it in the app. */
const connected = new Set<string>();

const agents = new AgentService({
  store,
  mailbox,
  browser: agentBrowser,
  sidebarLayout,
  preferredProvider: "codex",
  requestTimeoutMs: 2500,
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  memoryReviewInterval: () => 0,
  hostTurnLimits: { turnLimit: () => "unlimited", agentTaskLimit: () => 2 },
});
// The same wiring as `application-services.ts`, with the fixture's server, token and connections.
const preferencePath = join(userData, "rooms-listening.json");
let listener: InstanceType<typeof RoomsListener> | null = null;
const makeControl = () =>
  createRoomsListeningControl(preferencePath, {
    agents: () => agents.listAgents().map((agent) => ({ id: agent.id, name: agent.name })),
    roomsConnected: (agentId) => connected.has(agentId),
    changed: () => listener?.refresh(),
  });
let roomsListening = makeControl();
const makeListener = () =>
  new RoomsListener({
    url: new URL("/mcp", roomsServer.url).href,
    fetch: (input, init) => fetch(input, init),
    accessToken: () => Effect.succeed("rooms-fixture-token"),
    refreshAccessToken: () => Effect.succeed(null),
    listeningAgents: () => roomsListening.listeningAgents(),
    deliver: (agentId, text, key) =>
      agents.sendMessage({ agentId, text, clientMessageId: key }, { id: "rooms", name: "Rooms" }).pipe(Effect.asVoid),
    stopListening: (agentId) => roomsListening.set({ agentId, listening: false }),
    turnsPerHour: 3,
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
  admin: { roomsListening: { get: () => roomsListening.get(), set: (change) => roomsListening.set(change) } },
});

const report: { passed: boolean; checks: Record<string, string | number | boolean>; error?: string } = {
  passed: false,
  checks: {},
};
let port = 0;
async function call(path: string, expected: number, token?: string, body?: TeamProtocolV2Json) {
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
  assert.equal(response.status, expected, `${path} returned ${response.status}: ${text}`);
  return text ? decodeTeamProtocolV2Json(JSON.parse(text)) : null;
}

async function waitFor<T>(name: string, read: () => Promise<T | undefined> | T | undefined, ms = 15_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    assert.ok(Date.now() < deadline, `Timed out waiting for ${name}.`);
    await Bun.sleep(30);
  }
}

async function prompts() {
  const log = await readFile(promptLog, "utf8").catch(() => "");
  return log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { provider: string; text: string; at: number });
}
const promptFor = (tag: string) =>
  waitFor(tag, async () => (await prompts()).find((entry) => entry.text.includes(tag)));

const failures: unknown[] = [];
try {
  await mkdir(userData);
  await runCauseEffect(roomsListening.load());
  await runCauseEffect(team.initialize());
  await runCauseEffect(team.configure("Rooms E2E Host", owner.username, owner.password));
  assert.equal(await runCauseEffect(agentAccess.load()), true);
  await runCauseEffect(sidebarLayout.initialize());
  await runCauseEffect(agents.initialize());
  port = await runCauseEffect(server.start());
  const session = await call(TEAM_API_ROUTES.auth.login, 200, undefined, owner);
  assert.ok(isDynamicRecord(session) && isString(session.sessionToken));
  const token = session.sessionToken;
  const compatibility = await call(TEAM_API_ROUTES.compatibility, 200, token);
  report.checks.capabilityAdvertised = JSON.stringify(compatibility).includes(ROOMS_LISTENING_CAPABILITY);
  assert.ok(report.checks.capabilityAdvertised);

  const create = (name: string) =>
    runCauseEffect(
      agents.createAgentProfile({
        name,
        description: name,
        avatarSeed: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        avatarHue: null,
        provider: "codex",
      }),
    );
  const scout = await create("Scout Bot!");
  const quiet = await create("Quiet Bot");
  connected.add(scout.id);
  const read = async () => decodeRoomsListeningResponse(await call(ROOMS_LISTENING_ROUTES.settings, 200, token, {}));
  const before = await read();
  const row = (id: string) => before.agents.find((entry) => entry.id === id);
  assert.deepEqual([row(scout.id)?.listening, row(scout.id)?.roomsConnected], [false, true]);
  assert.deepEqual([row(quiet.id)?.listening, row(quiet.id)?.roomsConnected], [false, false]);
  report.checks.offByDefault = true;

  listener = makeListener();
  listener.start();
  assert.equal(listener.listeningCount(), 0);
  // The Rooms agent name keeps only the letters Rooms accepts.
  plan("Scout Bot", {
    result: {
      messages: [roomMessage(7, "r_design", "@Scout Bot ROOMS-FIRST can you check the build?")],
      rooms,
      next: "Reply...",
    },
  });
  const on = decodeRoomsListeningResponse(
    await call(ROOMS_LISTENING_ROUTES.update, 200, token, { agentId: scout.id, listening: true }),
  );
  assert.equal(on.agents.find((row) => row.id === scout.id)?.listening, true);
  assert.equal(listener.listeningCount(), 1);
  const first = await promptFor("ROOMS-FIRST");
  assert.match(first.text, /New messages in your Rooms/);
  assert.match(first.text, /not instructions/);
  assert.match(first.text, /Room "Design" \(id r_design\)/);
  assert.match(first.text, /Room notice \(its rules\): Keep it short\./);
  assert.match(first.text, /Your Rooms agent name is "Scout Bot"/);
  assert.equal(waitCalls[0]?.authorization, "Bearer rooms-fixture-token");
  report.checks.newMessageStartsTurn = true;

  // The chat shows the message from "Rooms", not from the person.
  const path = TEAM_API_ROUTES.agent.conversation(scout.id);
  const snapshot = teamHttpCodec(TEAM_PROTOCOL_V10).decodeResponse("GET", path, 200, await call(path, 200, token));
  assert.ok(isConversationSnapshot(snapshot));
  const shown = snapshot.messages.find((message) => message.text.includes("ROOMS-FIRST"));
  assert.equal(shown?.senderMember?.name, "Rooms", JSON.stringify(shown));
  report.checks.chatSenderIsRooms = true;

  // A paused room gets no turn.
  plan("Scout Bot", {
    result: { messages: [roomMessage(8, "r_paused", "ROOMS-PAUSED hello")], rooms, next: "Paused: Paused room." },
  });
  await waitFor("paused wait", () => (planned.get("Scout Bot")?.length === 0 ? true : undefined));
  await Bun.sleep(1_500);
  assert.ok(!(await prompts()).some((entry) => entry.text.includes("ROOMS-PAUSED")));
  report.checks.pausedRoomNoTurn = true;

  // The hourly cap (3 in this check): the fourth batch waits.
  for (const [index, tag] of ["ROOMS-CAP-2", "ROOMS-CAP-3", "ROOMS-CAP-4"].entries())
    plan("Scout Bot", { result: { messages: [roomMessage(20 + index, "r_design", tag)], rooms, next: "Reply..." } });
  await promptFor("ROOMS-CAP-3");
  await Bun.sleep(2_000);
  assert.ok(!(await prompts()).some((entry) => entry.text.includes("ROOMS-CAP-4")));
  report.checks.hourlyCapHolds = true;

  // Failures back off: 3 failing answers in a row are spread over seconds, not a spin.
  await call(ROOMS_LISTENING_ROUTES.update, 200, token, { agentId: scout.id, listening: false });
  assert.equal(listener.listeningCount(), 0);
  connected.add(quiet.id);
  plan("Quiet Bot", { status: 500 }, { status: 500 }, { status: 500 });
  const failStart = Date.now();
  await call(ROOMS_LISTENING_ROUTES.update, 200, token, { agentId: quiet.id, listening: true });
  await Bun.sleep(4_000);
  const quietCalls = waitCalls.filter((entry) => entry.agent === "Quiet Bot" && entry.at >= failStart);
  report.checks.callsInFourSecondsAfterFailure = quietCalls.length;
  assert.ok(quietCalls.length <= 2, `Rooms wait was called ${quietCalls.length} times in 4 s after failures.`);
  report.checks.failuresBackOff = true;

  // A restart: a new control and listener read the saved file and listen again.
  await runCauseEffect(listener.stop());
  roomsListening = makeControl();
  await runCauseEffect(roomsListening.load());
  assert.deepEqual(
    roomsListening.listeningAgents().map((row) => row.id),
    [quiet.id],
  );
  planned.set("Quiet Bot", [
    { result: { messages: [roomMessage(40, "r_design", "ROOMS-AFTER-RESTART ping")], rooms, next: "Reply..." } },
  ]);
  listener = makeListener();
  listener.start();
  await promptFor("ROOMS-AFTER-RESTART");
  report.checks.survivesRestart = true;

  // Stop on the room page turns listening off for the agent.
  plan("Quiet Bot", {
    result: {
      messages: [],
      rooms: {},
      next: "Your person pressed Stop on the room page. Stop listening now and tell them in one line.",
    },
  });
  await waitFor("stop", () => (roomsListening.listeningAgents().length === 0 ? true : undefined));
  const reloaded = makeControl();
  await runCauseEffect(reloaded.load());
  assert.equal(reloaded.listeningAgents().length, 0);
  await waitFor("listener idle", () => (listener?.listeningCount() === 0 ? true : undefined));
  report.checks.stopTurnsListeningOff = true;
  report.checks.waitCalls = waitCalls.length;
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  failures.push(error);
}
try {
  if (listener) await runCauseEffect(listener.stop());
  await runCauseEffect(server.stop()).catch(() => undefined);
  await runCauseEffect(agents.stop()).catch(() => undefined);
  await roomsServer.stop(true);
  database.close();
  await mkdir(OUT, { recursive: true });
  const evidence = JSON.stringify(report, null, 2);
  await writeFile(join(OUT, "report.json"), `${evidence}\n`);
  process.stdout.write(`${evidence}\n`);
} catch (error) {
  failures.push(error);
}
if (failures.length > 0) throw failures[0];

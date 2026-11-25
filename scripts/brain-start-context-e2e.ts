// Runs the real host, its queue and the Team API on a temporary profile, with a fake Second Brain
// server and fake Codex (app-server) and OpenCode (ACP) CLIs that log each prompt they receive.
// Checks that the first message of a new chat gets brain context for both provider families, that
// later messages do not, that a slow brain does not hold the turn, and the `brain-context-v1` routes.
// Run: bun scripts/brain-start-context-e2e.ts. Writes .openbot-build/brain-start-context-e2e/report.json.
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENT_PROVIDERS, type McpServerConfig } from "@pokebots/contracts/ipc";
import { isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import { TEAM_API_ROUTES } from "@pokebots/contracts/team-api-routes";
import { TEAM_APP_VERSION_HEADER, TEAM_PROTOCOL_VERSION_HEADER } from "@pokebots/contracts/team-protocol";
import {
  BRAIN_CONTEXT_CAPABILITY,
  BRAIN_CONTEXT_ROUTES,
  decodeBrainContextResponse,
} from "@pokebots/contracts/team-protocol/brain-context-v1";
import { teamCapabilitiesForProtocol, teamCapabilityHeaders } from "@pokebots/contracts/team-protocol/current";
import { decodeTeamProtocolV2Json, type TeamProtocolV2Json } from "@pokebots/contracts/team-protocol/v2";
import { TEAM_PROTOCOL_V10 } from "@pokebots/contracts/team-protocol/v10";
import { plugin } from "bun";
import { Effect } from "effect";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";

const OUT = resolve(import.meta.dirname, "../.openbot-build/brain-start-context-e2e");
const HOST_VERSION = "0.0.0-e2e";
const fixtureRoot = process.env.OPENBOT_BRAIN_CONTEXT_FIXTURE_ROOT;
if (!fixtureRoot) {
  const root = await mkdtemp(join(tmpdir(), "openbot-brain-context-"));
  const home = join(root, "home");
  try {
    // Bun resolves os.homedir() at startup. The host and provider adapters must see the fixture home.
    const child = Bun.spawn([process.execPath, import.meta.path], {
      env: { ...process.env, HOME: home, USERPROFILE: home, OPENBOT_BRAIN_CONTEXT_FIXTURE_ROOT: root },
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
const fakeOpencode = join(root, "opencode");
const promptLog = join(root, "prompts.jsonl");
await mkdir(home, { recursive: true });
process.env.CODEX_HOME = join(home, ".codex");
process.env.OPENBOT_CODEX_PATH = fakeCodex;

plugin({
  name: "brain-start-context-electron-boundary",
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
const { createBrainContextControl } = await import("../src/main/brain-context-preference-store");
const { BrainService, isBrainConnection } = await import("../src/backend/brain-service");
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
  startView: unused,
  dispatchViewInput: unused,
  copyViewSelection: unused,
  importSignIn: unused,
};

// Each CLI logs the full prompt text of each turn with the tag in it, then answers at once.
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
const FAKE_OPENCODE = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
if (process.argv.includes("--version")) {
  process.stdout.write("2.2.7\\n");
  process.exit(0);
}
const model = "opencode/big-pickle";
let count = 0;
const write = (frame) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...frame }) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  const respond = (result) => write({ id, result });
  if (method === "initialize")
    return respond({ protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [] });
  if (method === "session/new" || method === "session/load")
    return respond({
      sessionId: params.sessionId ?? "s-" + process.pid + "-" + (++count),
      models: { availableModels: [{ modelId: model, name: "Big Pickle" }], currentModelId: model },
    });
  if (method === "session/prompt") {
    const text = params.prompt.map((part) => part.text ?? "").join("\\n");
    appendFileSync(${JSON.stringify(promptLog)}, JSON.stringify({ provider: "acp", text, at: Date.now() }) + "\\n");
    write({ method: "session/update", params: {
      sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Ready." } }
    } });
    return respond({ stopReason: "end_turn" });
  }
  return respond({});
});
`;
await writeFile(fakeCodex, FAKE_CODEX, { mode: 0o755 });
await writeFile(fakeOpencode, FAKE_OPENCODE, { mode: 0o755 });

// The fake brain answers by the first word of the question: CONTEXT has the `context` route, SEARCH has
// only `search` (a brain before the `context` tool), SLOW answers after the time box, EMPTY knows nothing.
const brainRequests: { path: string; question: string; cwd: string | null; authorization: string | null }[] = [];
const brainServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const question = url.searchParams.get("question") ?? url.searchParams.get("query") ?? "";
    brainRequests.push({
      path: url.pathname,
      question,
      cwd: url.searchParams.get("cwd"),
      authorization: request.headers.get("authorization"),
    });
    const mode = /\b(CONTEXT|SEARCH|SLOW|EMPTY)\b/.exec(question)?.[1];
    if (url.pathname === "/api/v1/context") {
      if (mode === "SEARCH") return Response.json({ error: { code: "not_found" } }, { status: 404 });
      if (mode === "SLOW") await Bun.sleep(5_000);
      if (mode === "EMPTY") return Response.json({ text: "" });
      return Response.json({
        text: "Me: Steven. 2026-11-25: the Mac update job was off, so merged fixes were not installed. Token sk-ant-api03-SYNTHETICSECRETVALUE",
      });
    }
    if (url.pathname === "/api/v1/search")
      return Response.json({
        claims: [
          { text: "Pokebots ships from main by a launchd job.", page: "wiki/pokebots.md", verified_at: "2026-11-20" },
        ],
      });
    return Response.json({ error: { code: "not_found" } }, { status: 404 });
  },
});
const brain = new BrainService({
  oauth: { accessToken: () => Effect.succeed("brain-fixture-token"), refreshAccessToken: () => Effect.succeed(null) },
  connections: () => [],
  fetch: (input, init) => fetch(new URL(`${input.pathname}${input.search}`, brainServer.url), init),
});
const brainConnection: McpServerConfig = {
  id: "second-brain",
  name: "Second Brain",
  transport: "http",
  enabled: true,
  command: "",
  args: [],
  env: [],
  envPassthrough: [],
  workingDirectory: "",
  url: "https://brain.mcpbox.dev/mcp",
  headers: [],
};
assert.ok(isBrainConnection(brainConnection));

const brainContext = createBrainContextControl(join(userData, "brain-context.json"));
const database = new OpenBotDatabase(userData);
const store = new AgentStore(userData, home, database);
const mailbox = new MailboxStore(userData, store.sharedRoot, database);
const sidebarLayout = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
const team = new TeamStore(join(userData, "team.json"));
const agentAccess = new AgentAccessStore(join(userData, AGENT_ACCESS_FILE));
const owner = { username: "test-owner", password: "e2e-owner-password" };
/** The agents whose host has a Second Brain connection, as `enabledMcpServers` gives it in the app. */
const connected = new Set<string>();

const agents = new AgentService({
  store,
  mailbox,
  browser: agentBrowser,
  sidebarLayout,
  preferredProvider: "codex",
  requestTimeoutMs: 2500,
  bundledExecutables: { opencode: fakeOpencode },
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex" && provider !== "opencode"),
  memoryReviewInterval: () => 0,
  hostTurnLimits: { turnLimit: () => "unlimited", agentTaskLimit: () => 2 },
  // The same wiring as `application-services.ts`, with the agent's connection list from the fixture.
  brainStartContext: ({ agent, question }) => {
    if (!brainContext.get().enabled || !connected.has(agent.id)) return Effect.succeed(null);
    return brain.startContext(brainConnection, { question, cwd: agent.workspacePath });
  },
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
  admin: { brainContext },
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

async function waitFor<T>(name: string, read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 15_000;
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

const START = "--- context from your Second Brain ---";
const failures: unknown[] = [];
try {
  await mkdir(userData);
  await runCauseEffect(brainContext.load());
  await runCauseEffect(team.initialize());
  await runCauseEffect(team.configure("Brain Context E2E Host", owner.username, owner.password));
  assert.equal(await runCauseEffect(agentAccess.load()), true);
  await runCauseEffect(sidebarLayout.initialize());
  await runCauseEffect(agents.initialize());
  port = await runCauseEffect(server.start());

  const session = await call(TEAM_API_ROUTES.auth.login, 200, undefined, owner);
  assert.ok(isDynamicRecord(session) && isString(session.sessionToken));
  const token = session.sessionToken;
  const compatibility = await call(TEAM_API_ROUTES.compatibility, 200, token);
  assert.ok(isDynamicRecord(compatibility));
  report.checks.capabilityAdvertised = JSON.stringify(compatibility).includes(BRAIN_CONTEXT_CAPABILITY);
  assert.ok(report.checks.capabilityAdvertised, "The host does not advertise brain-context-v1.");

  // The switch, as a joined client reads and sets it.
  const read = async () => decodeBrainContextResponse(await call(BRAIN_CONTEXT_ROUTES.settings, 200, token, {}));
  assert.deepEqual(await read(), { enabled: true });
  report.checks.defaultOn = true;

  const create = (name: string, provider: "codex" | "opencode") =>
    runCauseEffect(
      agents.createAgentProfile({
        name,
        description: name,
        avatarSeed: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        avatarHue: null,
        provider,
      }),
    );
  const send = (agentId: string, text: string) =>
    call(TEAM_API_ROUTES.agent.messages(agentId), 202, token, { text, attachmentDraftIds: [] });

  // Codex: the first message gets the block, with secrets redacted; the second does not.
  const codex = await create("Codex Bot", "codex");
  connected.add(codex.id);
  await send(codex.id, "CONTEXT CODEX-FIRST is the update job on?");
  const codexFirst = await promptFor("CODEX-FIRST");
  assert.equal(codexFirst.provider, "codex");
  // The memory block of the turn context comes first; the brain block leads the person's message.
  assert.ok(codexFirst.text.includes(`${START}\n`), codexFirst.text);
  assert.ok(codexFirst.text.indexOf(START) < codexFirst.text.indexOf("--- current message ---"));
  assert.match(codexFirst.text, /the Mac update job was off/);
  assert.doesNotMatch(codexFirst.text, /SYNTHETICSECRETVALUE/);
  assert.ok(codexFirst.text.indexOf("CODEX-FIRST") > codexFirst.text.indexOf("--- current message ---"));
  const contextCall = brainRequests.find((entry) => entry.question.includes("CODEX-FIRST"));
  assert.equal(contextCall?.path, "/api/v1/context");
  assert.equal(contextCall?.cwd, codex.workspacePath);
  assert.equal(contextCall?.authorization, "Bearer brain-fixture-token");
  report.checks.codexFirstTurnHasContext = true;
  report.checks.secretsRedacted = true;
  report.checks.workspaceSentAsCwd = true;
  await send(codex.id, "CONTEXT CODEX-SECOND and now?");
  const codexSecond = await promptFor("CODEX-SECOND");
  assert.ok(!codexSecond.text.includes(START));
  assert.ok(!brainRequests.some((entry) => entry.question.includes("CODEX-SECOND")));
  report.checks.laterTurnNoContext = true;

  // ACP (the family of Gemini, Grok, Cursor and OpenCode): the same block in the prompt.
  const acp = await create("ACP Bot", "opencode");
  connected.add(acp.id);
  await send(acp.id, "CONTEXT ACP-FIRST hello");
  const acpFirst = await promptFor("ACP-FIRST");
  assert.equal(acpFirst.provider, "acp");
  assert.ok(acpFirst.text.includes(START), acpFirst.text);
  assert.match(acpFirst.text, /the Mac update job was off/);
  report.checks.acpFirstTurnHasContext = true;

  // A brain without the `context` route: the search route fills in.
  const search = await create("Search Bot", "codex");
  connected.add(search.id);
  await send(search.id, "SEARCH SEARCH-FIRST where does Pokebots ship from?");
  const searchFirst = await promptFor("SEARCH-FIRST");
  assert.ok(searchFirst.text.includes(START));
  assert.match(searchFirst.text, /launchd job\. \(wiki\/pokebots\.md, verified 2026-11-20\)/);
  report.checks.searchFallback = true;

  // A slow brain does not hold the turn past the time box, and the turn has no block.
  const slow = await create("Slow Bot", "codex");
  connected.add(slow.id);
  const sentAt = Date.now();
  await send(slow.id, "SLOW SLOW-FIRST hi");
  const slowFirst = await promptFor("SLOW-FIRST");
  assert.ok(!slowFirst.text.includes(START));
  report.checks.slowBrainWaitMs = slowFirst.at - sentAt;
  assert.ok(slowFirst.at - sentAt < 4_500, `The slow brain held the turn ${slowFirst.at - sentAt} ms.`);
  report.checks.slowBrainSkipped = true;

  // No connection: no brain call. Switch off: no brain call either.
  const plain = await create("Plain Bot", "codex");
  await send(plain.id, "CONTEXT PLAIN-FIRST hi");
  assert.ok(!(await promptFor("PLAIN-FIRST")).text.includes(START));
  assert.ok(!brainRequests.some((entry) => entry.question.includes("PLAIN-FIRST")));
  report.checks.noConnectionNoCall = true;
  assert.deepEqual(
    decodeBrainContextResponse(await call(BRAIN_CONTEXT_ROUTES.update, 200, token, { enabled: false })),
    { enabled: false },
  );
  assert.deepEqual(await read(), { enabled: false });
  const off = await create("Off Bot", "codex");
  connected.add(off.id);
  await send(off.id, "CONTEXT OFF-FIRST hi");
  assert.ok(!(await promptFor("OFF-FIRST")).text.includes(START));
  assert.ok(!brainRequests.some((entry) => entry.question.includes("OFF-FIRST")));
  const reloaded = createBrainContextControl(join(userData, "brain-context.json"));
  await runCauseEffect(reloaded.load());
  assert.deepEqual(reloaded.get(), { enabled: false });
  report.checks.switchOffStopsCallsAndPersists = true;
  report.checks.brainRequests = brainRequests.length;
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  failures.push(error);
}
try {
  await runCauseEffect(server.stop()).catch(() => undefined);
  await runCauseEffect(agents.stop()).catch(() => undefined);
  await brainServer.stop(true);
  database.close();
  await mkdir(OUT, { recursive: true });
  const evidence = JSON.stringify(report, null, 2);
  await writeFile(join(OUT, "report.json"), `${evidence}\n`);
  // The prompts as the providers received them, for the pull request proof.
  for (const entry of await prompts()) appendFileSync(join(OUT, "prompts.jsonl"), `${JSON.stringify(entry)}\n`);
  process.stdout.write(`${evidence}\n`);
} catch (error) {
  failures.push(error);
}
if (failures.length > 0) throw failures[0];

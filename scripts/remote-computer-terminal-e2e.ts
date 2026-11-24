// Runs the terminal and file tools of `remote-computer-terminal-v1` on the real modules: the loopback
// MCP server of `RemoteComputerHost` (the host on a joined server), the real `RemoteComputerClient` and
// `RemoteComputerTerminal` (the Mac app), and the Team API between them as a direct link. A command
// and a file copy are called the way an Antigravity agent calls them: `openbot.tool_call` names
// `my_computer.<tool>`, `findAgentMcpTool` resolves it on the agent's entry, and `McpGateway` runs it.
// The driver is `remote-computer-use-e2e-driver.ts`, a stand-in, so no screen grants are needed.
//
// It checks that the tools are absent and refused while the terminal switch is off (the default) or the
// host lacks the capability; that a command runs in a login shell as the user, in the home folder,
// without the environment of the app; that exit codes, stderr, a time limit and a huge output are
// reported and fit the reply; that a command ends when the switch goes off and on Stop; that a file
// copy lands in the agent's folder on the host with the same bytes and SHA-256, never over another
// file, never outside its folder; and that a log line hides secrets.
// `bun scripts/remote-computer-terminal-e2e.ts`. Writes
// .openbot-build/remote-computer-terminal-e2e/report.json.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServerConfig, RemoteComputerServer } from "@pokebots/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import { REMOTE_COMPUTER_USE_ROUTES } from "@pokebots/contracts/team-protocol/remote-computer-use-v1";
import { createOpenBotLogger, redactText } from "@pokebots/logging";
import { Effect, Schema } from "effect";
import { McpGateway } from "../src/backend/agent/mcp-gateway";
import { findAgentMcpTool, mcpServersFromGateway, mcpToolCallResponse } from "../src/backend/agent/mcp-tools";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { McpServerStore } from "../src/backend/mcp-server-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { NO_PROVIDER_CREDENTIALS } from "../src/backend/provider-drivers";
import { RemoteComputerClient } from "../src/main/remote-computer-client";
import { RemoteComputerHost } from "../src/main/remote-computer-host";
import { describeTerminalCall, RemoteComputerTerminal } from "../src/main/remote-computer-terminal";

const OUT = resolve(import.meta.dirname, "../.openbot-build/remote-computer-terminal-e2e");
const MEMBER = "member-1";
const SESSION = "session-1";
const SERVER = "server-1";
const AGENT = "agent-a";

const checks: string[] = [];
function pass(name: string): void {
  checks.push(name);
}

const root = await mkdtemp(join(tmpdir(), "openbot-terminal-e2e-"));
// The "Mac" has a home folder with a file whose name has spaces, as a screen recording has.
await mkdir(join(root, "mac-home"), { recursive: true });
const macHome = await realpath(join(root, "mac-home"));
const workspace = join(root, "host-workspace");
await mkdir(join(macHome, "Desktop"), { recursive: true });
await mkdir(workspace, { recursive: true });
const recording = join(macHome, "Desktop", "Screen Recording 2026-11-19 at 10.00.00.mov");
const recordingBytes = randomBytes(1_000_000);
await writeFile(recording, recordingBytes);
await writeFile(join(macHome, "Desktop", "empty.txt"), "");
await writeFile(join(macHome, "note.txt"), "hello from the mac\n");

process.env.OPENBOT_E2E_SECRET = "must-not-reach-the-command";
// The test moves this forward to expire the host's cache of the tool list.
let skewMs = 0;
const host = new RemoteComputerHost({
  now: () => Date.now() + skewMs,
  downloadDirectory: (agentId) => (agentId === AGENT ? join(workspace, "from-mac") : null),
});
let enabled = true;
let terminalEnabled = false;
let terminalSupported = true;
let disabledByStop = false;
let driverPresent = true;
const servers = (): RemoteComputerServer[] => [
  {
    serverId: SERVER,
    serverName: "Dev host",
    enabled,
    supported: true,
    connected: true,
    terminalSupported,
    terminalEnabled: enabled && terminalEnabled,
  },
];
const driver: McpServerConfig = {
  id: "computer-use",
  name: "computer_use",
  transport: "stdio",
  enabled: true,
  command: process.execPath,
  args: [resolve(import.meta.dirname, "remote-computer-use-e2e-driver.ts")],
  env: [],
  envPassthrough: [],
  workingDirectory: "",
  url: "",
  headers: [],
};
const client = new RemoteComputerClient({
  servers,
  disable: () =>
    Effect.sync(() => {
      enabled = false;
      terminalEnabled = false;
      disabledByStop = true;
    }),
  send: (_serverId, path, body) =>
    Effect.promise(async () => {
      if (path === REMOTE_COMPUTER_USE_ROUTES.state && "available" in body)
        await runCauseEffect(host.setState(MEMBER, SESSION, body));
      else if (path === REMOTE_COMPUTER_USE_ROUTES.reply && "requestId" in body)
        // A call that Stop or the switch ended has no waiting request on the host: its late answer is dropped.
        host.reply(MEMBER, SESSION, body);
      return {};
    }),
  driver: () => (driverPresent ? driver : null),
  computerName: () => "Test Mac",
  toJpeg: () => null,
  terminal: new RemoteComputerTerminal({
    home: () => macHome,
    // The real environment of this process, with the home folder of the test Mac: the terminal must
    // leave the secret above out by itself.
    env: () => ({ ...process.env, HOME: macHome, SHELL: "/bin/sh" }),
  }),
});
host.attach({
  send: (sessionId, event) => {
    if (sessionId !== SESSION) return false;
    setImmediate(() => client.handleCall(SERVER, event));
    return true;
  },
  agentsOnlyFor: (memberId) => (memberId === MEMBER ? [AGENT] : []),
});

const database = new OpenBotDatabase(root);
const report: { passed: boolean; checks: string[]; samples: { command?: unknown; fetch?: unknown }; error?: string } = {
  passed: false,
  checks,
  samples: {},
};

/** The SDK transport, with its optional members spelled the way `exactOptionalPropertyTypes` wants. */
function asTransport(inner: StreamableHTTPClientTransport): Transport {
  const transport: Transport = {
    start: () => {
      inner.onclose = () => transport.onclose?.();
      inner.onerror = (error) => transport.onerror?.(error);
      inner.onmessage = (message) => transport.onmessage?.(message);
      return inner.start();
    },
    send: (message, options) => inner.send(message, options),
    close: () => inner.close(),
    setProtocolVersion: (version) => inner.setProtocolVersion(version),
  };
  return transport;
}

async function connect(url: string, bearer: string): Promise<Client> {
  const mcp = new Client({ name: "provider", version: "1" }, { capabilities: {} });
  await mcp.connect(
    asTransport(
      new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: bearer } } }),
    ),
  );
  return mcp;
}

const commandReport = Schema.decodeUnknownSync(
  Schema.Struct({
    exit_code: Schema.NullOr(Schema.Number),
    stdout: Schema.String,
    stderr: Schema.String,
    timed_out: Schema.Boolean,
  }),
);

const fileReport = Schema.decodeUnknownSync(
  Schema.Struct({ saved_to: Schema.String, bytes: Schema.Number, sha256: Schema.String }),
);

function textOf(result: unknown): string {
  assert.ok(isDynamicRecord(result) && Array.isArray(result.content), "The tool returns content.");
  return result.content.map((item) => (isDynamicRecord(item) && isString(item.text) ? item.text : "")).join("");
}

try {
  await runCauseEffect(database.initialize());
  const gateway = new McpGateway({
    servers: new McpServerStore(database),
    credentials: NO_PROVIDER_CREDENTIALS,
    computerUseMcpServer: () => null,
    logger: createOpenBotLogger("agent-service", () => undefined),
    hooks: { emitError: () => undefined, refreshAllAgentRuntimes: () => Effect.void },
  });
  const agentTools = mcpServersFromGateway(gateway);

  client.start();
  await waitFor(() => host.mcpServers().length === 1);
  const [entry] = host.mcpServers();
  assert.ok(entry);
  const bearer = entry.headers.find((pair) => pair.key === "Authorization")?.value ?? "";
  const mcp = await connect(entry.url, bearer);

  // 1. Off by default: nothing is listed, and a call is refused by the computer itself.
  const offTools = (await mcp.listTools()).tools.map((tool) => tool.name);
  assert.ok(offTools.includes("click"), "the Computer Use tools are still listed");
  assert.ok(!offTools.some((name) => name.startsWith("openbot_")), "no terminal tool while the switch is off");
  const offCall = await mcp.callTool({ name: "openbot_run_command", arguments: { command: "echo nope" } });
  assert.equal(offCall.isError, true);
  assert.match(textOf(offCall), /does not let the agents of this server run commands/u);
  pass("terminal tools are not listed, and a call is refused, while the switch is off");

  // 2. The host lacks the capability (the app's view of it): still nothing, even with the switch on.
  terminalEnabled = true;
  terminalSupported = false;
  await expireToolList();
  assert.ok(!(await mcp.listTools()).tools.some((tool) => tool.name.startsWith("openbot_")));
  assert.equal(
    (await mcp.callTool({ name: "openbot_run_command", arguments: { command: "echo nope" } })).isError,
    true,
  );
  pass("a host without remote-computer-terminal-v1 gets no terminal tools, switch on or not");

  // 3. Switch on, host capable: the tools are listed, and the file tool is made by the host.
  terminalSupported = true;
  await expireToolList();
  const onTools = (await mcp.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(onTools, [
    "click",
    "get_desktop_state",
    "get_screen_size",
    "openbot_fetch_file",
    "openbot_read_file_chunk",
    "openbot_run_command",
  ]);
  pass("with the switch on, the app lists the command and chunk tools and the host adds the file tool");

  // 4. A command, called as Antigravity does: openbot.tool_call -> my_computer.<tool> on the agent's entry.
  const run = async (args: DynamicRecord, name = "my_computer.openbot_run_command") => {
    const found = findAgentMcpTool([entry], name);
    assert.ok(found, `${name} resolves on the agent's entry`);
    const ran = await runCauseEffect(agentTools.callTool(found.config, found.tool, args));
    assert.ok("result" in ran, "the tool call reaches the computer");
    const response = mcpToolCallResponse(ran.result);
    const text = response.contentItems.map((item) => ("text" in item ? item.text : "")).join("");
    return { success: response.success, text };
  };
  const first = await run({ command: "printf hello-from-mac; echo oops >&2; pwd; exit 3" });
  const firstReport = commandReport(JSON.parse(first.text));
  assert.equal(firstReport.exit_code, 3);
  assert.equal(firstReport.stdout, `hello-from-mac${macHome}\n`);
  assert.equal(firstReport.stderr, "oops\n");
  assert.equal(firstReport.timed_out, false);
  report.samples.command = firstReport;
  pass(
    "openbot.tool_call to my_computer.openbot_run_command runs in the home folder and reports exit code, stdout and stderr",
  );

  const secret = commandReport(JSON.parse((await run({ command: `echo "$\{OPENBOT_E2E_SECRET:-unset}"` })).text));
  assert.equal(secret.stdout.trim(), "unset");
  const cwd = commandReport(JSON.parse((await run({ command: "pwd", cwd: "~/Desktop" })).text));
  assert.equal(cwd.stdout.trim(), join(macHome, "Desktop"));
  const badCwd = await run({ command: "pwd", cwd: "~/missing" });
  assert.equal(badCwd.success, false);
  pass("the command does not inherit the app's environment, honors cwd with ~, and refuses a folder that is not there");

  const slow = await run({ command: "sleep 30", timeout_seconds: 1 });
  assert.equal(slow.success, false);
  assert.equal(commandReport(JSON.parse(slow.text)).timed_out, true);
  pass("a command still running at its time limit is stopped and reported");

  const big = commandReport(JSON.parse((await run({ command: "yes abcdefghij | head -c 600000" })).text));
  assert.match(big.stdout, /characters omitted/u);
  assert.ok(big.stdout.length < 51_000);
  // The worst case for the reply size: every character is escaped twice on the wire.
  const quotes = await run({ command: "head -c 400000 /dev/zero | tr '\\000' '\"'" });
  assert.equal(quotes.success, true);
  pass("a huge output keeps its start and end and still fits the reply");

  const both = await run({
    command: "head -c 400000 /dev/zero | tr '\\000' '\"'; head -c 400000 /dev/zero | tr '\\000' '\"' >&2",
  });
  assert.equal(both.success, true, `two streams full of quotes still fit the reply: ${both.text.slice(0, 300)}`);
  const tooLong = await run({ command: "echo hi", timeout_seconds: 171 });
  assert.equal(tooLong.success, false, "a time limit above what the host waits for is refused");
  const grandchildFile = join(macHome, "pid-grandchild");
  await run({ command: `sleep 60 & echo $! > '${grandchildFile}'; wait`, timeout_seconds: 1 });
  const grandchild = await waitForPid(grandchildFile);
  await waitFor(() => !alive(grandchild));
  pass(
    "both streams full of quotes fit, a limit above 170 s is refused, and a timeout also ends the command's children",
  );

  // 5. A file copy. The agent ends with the file on the disk of the host.
  const fetchRecord = async (args: DynamicRecord) => mcp.callTool({ name: "openbot_fetch_file", arguments: args });
  const copied = await fetchRecord({ path: "~/Desktop/Screen Recording 2026-11-19 at 10.00.00.mov" });
  assert.ok(!copied.isError, textOf(copied));
  const copiedReport = fileReport(JSON.parse(textOf(copied)));
  assert.equal(copiedReport.saved_to, join(workspace, "from-mac", "Screen Recording 2026-11-19 at 10.00.00.mov"));
  assert.equal(copiedReport.bytes, recordingBytes.length);
  assert.equal(copiedReport.sha256, createHash("sha256").update(recordingBytes).digest("hex"));
  assert.ok((await readFile(copiedReport.saved_to)).equals(recordingBytes));
  report.samples.fetch = copiedReport;
  pass("openbot_fetch_file copies a 1 MB recording in three chunks to the agent's folder on the host, byte for byte");

  const again = fileReport(JSON.parse(textOf(await fetchRecord({ path: recording }))));
  assert.equal(again.saved_to, join(workspace, "from-mac", "Screen Recording 2026-11-19 at 10.00.00 (2).mov"));
  const empty = fileReport(JSON.parse(textOf(await fetchRecord({ path: "~/Desktop/empty.txt" }))));
  assert.equal(empty.bytes, 0);
  const traversal = fileReport(
    JSON.parse(textOf(await fetchRecord({ path: "~/note.txt", file_name: "../../../evil.txt" }))),
  );
  assert.equal(traversal.saved_to, join(workspace, "from-mac", "evil.txt"));
  assert.equal(await readFile(traversal.saved_to, "utf8"), "hello from the mac\n");
  assert.equal((await fetchRecord({ path: "~/Desktop" })).isError, true);
  assert.equal((await fetchRecord({ path: "~/Desktop/missing.mov" })).isError, true);
  assert.deepEqual((await readdir(workspace)).sort(), ["from-mac"]);
  pass(
    "a second copy gets a new name, an empty file works, a file name cannot leave the folder, a folder or missing file fails",
  );

  // 5b. A named pipe must not freeze the app, and a link in place of the folder must not redirect a copy.
  execFileSync("mkfifo", [join(macHome, "pipe")]);
  const started = Date.now();
  const pipeRead = await mcp.callTool({ name: "openbot_read_file_chunk", arguments: { path: "~/pipe" } });
  assert.equal(pipeRead.isError, true);
  assert.ok(Date.now() - started < 5_000, "a named pipe is refused at once, not opened");
  const outside = join(root, "outside");
  await mkdir(outside);
  await rename(join(workspace, "from-mac"), join(workspace, "from-mac-real"));
  await symlink(outside, join(workspace, "from-mac"));
  const redirected = await fetchRecord({ path: "~/note.txt" });
  assert.equal(redirected.isError, true);
  assert.deepEqual(await readdir(outside), []);
  await rm(join(workspace, "from-mac"));
  await rename(join(workspace, "from-mac-real"), join(workspace, "from-mac"));
  pass("a named pipe is refused without blocking, and a link where the copy folder should be sends nothing outside");

  // 6. A secret in a command never reaches the log line.
  const logged = redactText(
    "curl -H 'Authorization: Bearer sk-live-abcdefghijklmnopqrstuvwx' OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
  );
  assert.ok(!logged.includes("abcdefghijklmnopqrstuvwx"));
  const line = describeTerminalCall(
    "openbot_run_command",
    {
      command: `${"x".repeat(170)} sk-live-abcdefghijklmnopqrstuvwx mysql -pHunter2 PGPASSWORD=abc curl -u bob:hunter2`,
    },
    redactText,
  );
  for (const secret of ["abcdefghijklmn", "Hunter2", "PGPASSWORD=abc", "bob:hunter2"])
    assert.ok(!line.includes(secret), `the log line hides ${secret}`);
  const late = describeTerminalCall(
    "openbot_run_command",
    { command: `${"y".repeat(60)} mysql -pHunter2 PGPASSWORD=abc curl -u bob:hunter2` },
    redactText,
  );
  assert.ok(!/Hunter2|hunter2|PGPASSWORD=abc/u.test(late));
  pass("the redaction that the log line uses hides keys and bearers in a command");

  // 6b. Terminal only: no Computer Use grants on the Mac, so the driver is not ready.
  driverPresent = false;
  client.reconcile();
  await expireToolList();
  assert.deepEqual((await mcp.listTools()).tools.map((tool) => tool.name).sort(), [
    "openbot_fetch_file",
    "openbot_read_file_chunk",
    "openbot_run_command",
  ]);
  const noDriver = commandReport(JSON.parse((await run({ command: "echo still-works" })).text));
  assert.equal(noDriver.stdout, "still-works\n");
  assert.equal((await mcp.callTool({ name: "click", arguments: { x: 1 } })).isError, true);
  driverPresent = true;
  client.reconcile();
  await expireToolList();
  assert.ok((await mcp.listTools()).tools.some((tool) => tool.name === "click"));
  pass("without Computer Use grants the terminal still works alone, and the driver tools stay refused");

  // 7. Switch off while a command runs: it ends at once and its process is gone.
  const pidFile = join(macHome, "pid-switch");
  const running = run({ command: `echo $$ > '${pidFile}'; sleep 30` });
  const pid = await waitForPid(pidFile);
  terminalEnabled = false;
  client.reconcile();
  const ended = await running;
  assert.equal(ended.success, false);
  await waitFor(() => !alive(pid));
  assert.equal(
    (await mcp.callTool({ name: "openbot_run_command", arguments: { command: "echo nope" } })).isError,
    true,
  );
  pass("turning the terminal switch off ends a running command and refuses the next one");

  // 8. Stop: the session ends, the main switch and the terminal go off, and a running command dies.
  terminalEnabled = true;
  client.reconcile();
  const stopFile = join(macHome, "pid-stop");
  const stopped = run({ command: `echo $$ > '${stopFile}'; sleep 30` });
  const stopPid = await waitForPid(stopFile);
  assert.equal(client.sessions().length, 1, "a running call shows in the sessions list");
  await runCauseEffect(client.stop(SERVER));
  assert.ok(disabledByStop);
  assert.equal((await stopped).success, false);
  await waitFor(() => !alive(stopPid));
  await waitFor(() => host.mcpServers().length === 0);
  assert.deepEqual(client.sessions(), []);
  assert.equal(terminalEnabled, false, "Stop turns the terminal switch off with the main one");
  pass("Stop ends a running command, empties the sessions list, turns both switches off and drops the computer");

  await mcp.close();
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
  await client.dispose();
  await runCauseEffect(host.stop());
  await rm(root, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await writeFile(resolve(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.passed ? 0 : 1;
}

/** The host keeps a computer's tool list for 60 s; move its clock on, and say that the computer is still there. */
async function expireToolList(): Promise<void> {
  skewMs += 61_000;
  await runCauseEffect(host.setState(MEMBER, SESSION, { available: true, computerName: "Test Mac" }));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPid(path: string): Promise<number> {
  let pid = 0;
  await waitFor(() => {
    pid = Number.parseInt(readPidSync(path), 10);
    return Number.isInteger(pid) && pid > 0;
  });
  return pid;
}

function readPidSync(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("A condition did not become true in time.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

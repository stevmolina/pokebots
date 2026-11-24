// Drives the cloud computer live view card path against the local Agent Computer REST fixture:
// "cloud agent" prompt rule -> computer_start -> chat card with the machine id only -> client reads the
// link from the owner or admin machine list -> link. Writes .openbot-build/computer-live-view-card-e2e/report.json.
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  type AgentSummary,
  COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX,
  type ConversationMessage,
  computerLiveViewEvent,
  computerLiveViewItemType,
  DEFAULT_AGENT_DEFAULTS,
  machineLiveViewUrl,
} from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { redactSecrets, redactText } from "@openbot/logging";
import { Effect } from "effect";
import { CLOUD_AGENT_RULE, developerInstructions } from "../src/backend/agent/developer-instructions";
import {
  AGENT_COMPUTER_TOOL_DEFINITIONS,
  handleAgentComputerTool,
} from "../src/backend/agent-computer/agent-computer-tools";
import { AgentComputerService } from "../src/main/agent-computer-service";
import { FIXTURE_KEY, FIXTURE_LIVE, startAgentComputerFixture } from "./agent-computer-fixture";

const run = Effect.runPromise;
const out = resolve(".openbot-build/computer-live-view-card-e2e/report.json");
const root = await mkdtemp(join(tmpdir(), "openbot-live-view-card-"));
const fixture = await startAgentComputerFixture();
const checks: string[] = [];
const cipherKey = randomBytes(32);
const cipher = {
  encrypt(value: string) {
    const iv = randomBytes(12);
    const encrypt = createCipheriv("aes-256-gcm", cipherKey, iv);
    const encrypted = Buffer.concat([encrypt.update(value, "utf8"), encrypt.final()]);
    return Buffer.concat([iv, encrypt.getAuthTag(), encrypted]);
  },
  decrypt(value: Buffer) {
    const decrypt = createDecipheriv("aes-256-gcm", cipherKey, value.subarray(0, 12));
    decrypt.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decrypt.update(value.subarray(28)), decrypt.final()]).toString("utf8");
  },
};

const agent: AgentSummary = {
  id: "agent-1",
  name: "Tester",
  title: "",
  description: "",
  notifications: false,
  provider: "codex",
  model: "gpt-5.5",
  reasoningEffort: "medium",
  threadId: null,
  workspacePath: "/workspace",
  preview: "",
  updatedAt: null,
  avatarSeed: "agent-1",
  avatarHue: null,
  avatarUrl: null,
};

try {
  // 1. Every agent gets the rule: the phrases name the machine; open it or work on it starts it at once, with no offer.
  for (const provider of ["codex", "claude"] as const) {
    const text = developerInstructions({ ...agent, provider }, "/shared", [], "/automation", DEFAULT_AGENT_DEFAULTS);
    assert.ok(text.includes(CLOUD_AGENT_RULE), `${provider} instructions have the cloud agent rule`);
  }
  for (const phrase of [
    "cloud agent",
    "cloud machine",
    "cloud computer",
    "in the cloud",
    "at once",
    "do not offer",
    "Claude Code",
  ])
    assert.ok(CLOUD_AGENT_RULE.includes(phrase), phrase);
  assert.match(CLOUD_AGENT_RULE, /Server settings > Cloud computers/u);
  assert.match(CLOUD_AGENT_RULE, /asks you to open it or to do work on it/u);
  assert.match(CLOUD_AGENT_RULE, /Talk about it does not start it/u);
  const start = AGENT_COMPUTER_TOOL_DEFINITIONS.find(({ name }) => name === "computer_start");
  assert.match(start?.description ?? "", /call this at once; do not offer it/u);
  assert.match(start?.description ?? "", /Open live view button/u);
  checks.push(
    "base developer instructions (codex, claude) and computer_start say: talk does not start it; open or work starts it at once, no offer",
  );

  // 2. computer_start reports the machine id to the router; the agent's result has no live view link.
  const service = new AgentComputerService({ path: join(root, "credential.json"), cipher, baseUrl: fixture.baseUrl });
  await run(service.load());
  assert.equal((await run(service.connect(FIXTURE_KEY))).connected, true);
  const started: string[] = [];
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const result = await run(
    handleAgentComputerTool(service.api, {
      tool: "computer_start",
      arguments: { context: "demo-project" },
      workspacePath: workspace,
      approve: () => Effect.succeed(false),
      onStarted: (id) => started.push(id),
    }),
  );
  assert.equal(result.success, true);
  assert.deepEqual(started, ["demo-machine"]);
  assert.ok(!JSON.stringify(result).includes(FIXTURE_LIVE), "tool result has no live view link");
  checks.push("computer_start calls onStarted with the machine id; the agent result has no live view link");

  // A failed start posts no card.
  const failed: string[] = [];
  const refused = await run(
    handleAgentComputerTool(service.api, {
      tool: "computer_start",
      arguments: { context: "exhausted" },
      workspacePath: workspace,
      approve: () => Effect.succeed(false),
      onStarted: (id) => failed.push(id),
    }),
  );
  assert.equal(refused.success, false);
  assert.deepEqual(failed, []);
  checks.push("a failed computer_start posts no card");

  // A card that cannot be posted does not hide the started machine from the agent.
  const kept = await run(
    handleAgentComputerTool(service.api, {
      tool: "computer_start",
      arguments: { context: "demo-project" },
      workspacePath: workspace,
      approve: () => Effect.succeed(false),
      onStarted: () => {
        throw new Error("card write failed");
      },
    }),
  );
  assert.equal(kept.success, true);
  assert.match(JSON.stringify(kept), /demo-machine/u);
  checks.push("a card post that throws still returns the started machine to the agent");

  // 3. The chat card: a completed system message whose item type holds the machine id only.
  const [machineId = ""] = started;
  const card: ConversationMessage = {
    id: "card-1",
    turnId: "turn-1",
    author: "system",
    source: "system",
    status: "completed",
    createdAt: new Date(0).toISOString(),
    itemType: computerLiveViewItemType({ machineId }),
    text: sourceText("status.agent.computerLiveViewReady"),
  };
  assert.equal(card.itemType, `${COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX}demo-machine`);
  assert.deepEqual(computerLiveViewEvent(card), { machineId: "demo-machine" });
  assert.ok(!JSON.stringify(card).includes(FIXTURE_LIVE), "the stored card has no live view link");
  assert.equal(computerLiveViewEvent({ ...card, author: "agent" }), null);
  assert.throws(() => computerLiveViewItemType({ machineId: "https://x.invalid/live" }));
  checks.push("card message stores only the machine id; agent-written or malformed item types are refused");

  // 4. The client's press: the owner or admin machine list gives the link for that id only.
  const list = await run(service.machines());
  const [row] = list.machines;
  assert.ok(row);
  assert.equal(machineLiveViewUrl(list, machineId), FIXTURE_LIVE);
  assert.equal(machineLiveViewUrl(list, "another-machine"), null);
  assert.equal(machineLiveViewUrl({ machines: [{ ...row, liveViewUrl: "javascript:alert(1)" }] }, machineId), null);
  assert.ok(!redactText(`log ${FIXTURE_LIVE}`).includes(FIXTURE_LIVE));
  assert.ok(!redactSecrets(`send ${FIXTURE_LIVE}`).includes(FIXTURE_LIVE));
  checks.push("button lookup returns the https link for the card's machine, null otherwise; link stays redacted");

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
  process.stdout.write(`${checks.length} checks passed. ${out}\n`);
} finally {
  await fixture.close();
  await rm(root, { recursive: true, force: true });
}

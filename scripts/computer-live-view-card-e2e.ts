// Drives the cloud computer live view card path against the local Agent Computer REST fixture:
// "cloud agent" prompt rule -> computer_start -> chat card with the machine id only, and a `live_view`
// note that says where the user opens the live view -> the person presses Open live view -> the host
// looks the link up for that person (the key's machines for an owner or admin, the machines of their
// own account for each person) -> link. The Team API route of this lookup is in team-api-routes-e2e.
// Writes .openbot-build/computer-live-view-card-e2e/report.json.
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
  httpsLiveViewUrl,
  machineLiveViewUrl,
  type ServerSummary,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { sourceText } from "@openbot/i18n/source";
import { redactSecrets, redactText } from "@openbot/logging";
import { Effect, Redacted } from "effect";
import { CLOUD_AGENT_RULE, developerInstructions } from "../src/backend/agent/developer-instructions";
import type { AgentComputerApi } from "../src/backend/agent-computer/agent-computer-api";
import {
  AGENT_COMPUTER_TOOL_DEFINITIONS,
  COMPUTER_LIVE_VIEW_ELSEWHERE,
  COMPUTER_LIVE_VIEW_IN_CHAT,
  handleAgentComputerTool,
} from "../src/backend/agent-computer/agent-computer-tools";
import type { IntegrationCredential } from "../src/backend/integration-credential";
import type { DynamicToolResult } from "../src/backend/protocol";
import { AgentComputerService } from "../src/main/agent-computer-service";
import { computerLiveViewUrl } from "../src/main/computer-live-view";
import { decodeComputerLiveViewFromHost } from "../src/main/remote-agent-computer-decoding";
import { decodeComputerLiveViewFromMain } from "../src/preload/agent-computer-decoding";
import { computerLiveViewOpener } from "../src/renderer/src/features/conversation/computer-live-view-opener";
import {
  FIXTURE_ACCOUNT_KEY,
  FIXTURE_ACCOUNT_LIVE,
  FIXTURE_KEY,
  FIXTURE_LIVE,
  startAgentComputerFixture,
} from "./agent-computer-fixture";

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

/** The Pokebots account credential of the person who sent the turn, as the host resolves it. */
const accountCredential: IntegrationCredential<"computer"> = {
  audience: "computer",
  bearer: Effect.succeed(Redacted.make(FIXTURE_ACCOUNT_KEY)),
};

/** A text field of the JSON that `computer_start` gives the agent, or null. */
function resultField(result: DynamicToolResult, key: "id" | "live_view"): string | null {
  const item = result.contentItems[0];
  const parsed = item?.type === "inputText" ? JSON.parse(item.text) : null;
  const field = isDynamicRecord(parsed) ? parsed[key] : null;
  return typeof field === "string" ? field : null;
}

/** A joined server as the desktop app sees it. */
const joined = (role: ServerSummary["role"], capabilities: string[]): ServerSummary => ({
  notificationsMuted: false,
  notificationsMutedUntil: null,
  notificationLevel: "all",
  id: "server-1",
  name: "Server",
  kind: "remote",
  state: "online",
  apiUrl: null,
  remoteDesktopAvailable: false,
  logoUrl: null,
  role,
  active: true,
  compatibility: {
    localAppVersion: "0.0.0",
    hostAppVersion: "0.0.0",
    localProtocol: { minimum: 9, maximum: 10 },
    hostProtocol: { minimum: 9, maximum: 10 },
    negotiatedProtocol: 10,
    capabilities,
  },
});

try {
  // 1. Every agent on a server with Agent Computer gets the rule: the phrases name the machine; a request to
  // open it or work on it starts it at once, with no offer. Without Agent Computer, the rule is left out.
  for (const provider of ["codex", "claude"] as const) {
    const base = { sideThread: false, memoriesInTurns: true, teammatesInTurns: true, homeSkills: [] };
    const on = developerInstructions({ ...agent, provider }, "/shared", [], "/automation", DEFAULT_AGENT_DEFAULTS, {
      ...base,
      agentComputer: true,
    });
    const off = developerInstructions(
      { ...agent, provider },
      "/shared",
      [],
      "/automation",
      DEFAULT_AGENT_DEFAULTS,
      base,
    );
    assert.ok(on.includes(CLOUD_AGENT_RULE), `${provider} instructions have the cloud agent rule`);
    assert.ok(!off.includes(CLOUD_AGENT_RULE), `${provider} instructions without Agent Computer leave it out`);
  }
  for (const phrase of ["Cloud agent", "cloud machine", "cloud computer", "at once", "do not offer", "computer_list"])
    assert.ok(CLOUD_AGENT_RULE.includes(phrase), phrase);
  assert.match(CLOUD_AGENT_RULE, /Talk about it starts nothing/u);
  assert.match(CLOUD_AGENT_RULE, /open it or to work on it/u);
  checks.push(
    "with Agent Computer, every agent gets the rule: talk starts nothing; open or work starts it at once, no offer",
  );

  // 2. Bug 2: a channel or a Slack, Discord, Telegram or WhatsApp thread gets no card, so the rule must not
  // promise a button. It points the agent to computer_start's live_view, which says where the live view is.
  assert.doesNotMatch(CLOUD_AGENT_RULE, /button/iu, "the rule promises no button");
  assert.match(CLOUD_AGENT_RULE, /live_view/u);
  const start = AGENT_COMPUTER_TOOL_DEFINITIONS.find(({ name }) => name === "computer_start");
  assert.match(start?.description ?? "", /live_view says where the user sees it/u);
  assert.doesNotMatch(start?.description ?? "", /live_view_url|shows the user a live view button/u);
  assert.match(COMPUTER_LIVE_VIEW_ELSEWHERE, /^No button in this chat: .*Machines/u);
  checks.push("the rule and computer_start promise no button; live_view in the result says where the live view is");

  // 3. computer_start reports the machine id to the router; the agent's result has no live view link.
  const service = new AgentComputerService({ path: join(root, "credential.json"), cipher, baseUrl: fixture.baseUrl });
  await run(service.load());
  assert.equal((await run(service.connect(FIXTURE_KEY))).connected, true);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const startOn = (api: AgentComputerApi, context: string, onStarted?: (id: string) => boolean) =>
    run(
      handleAgentComputerTool(api, {
        tool: "computer_start",
        arguments: { context },
        workspacePath: workspace,
        approve: () => Effect.succeed(false),
        onStarted,
      }),
    );

  // In an app chat the router posts the card and answers true.
  const started: string[] = [];
  const inChat = await startOn(service.api, "demo-project", (id) => started.push(id) > 0);
  assert.equal(inChat.success, true);
  assert.deepEqual(started, ["demo-machine"]);
  assert.equal(resultField(inChat, "live_view"), COMPUTER_LIVE_VIEW_IN_CHAT);
  assert.ok(!JSON.stringify(inChat).includes(FIXTURE_LIVE), "tool result has no live view link");
  checks.push("in an app chat, computer_start posts the card and live_view says the button is in this chat");

  // In a channel or a linked Slack thread the router posts no card and answers false.
  const inChannel = await startOn(service.api, "demo-project", () => false);
  assert.equal(inChannel.success, true);
  assert.equal(resultField(inChannel, "live_view"), COMPUTER_LIVE_VIEW_ELSEWHERE);
  assert.ok(!JSON.stringify(inChannel).includes(FIXTURE_LIVE));
  checks.push("in a channel or messaging thread, live_view says there is no button and names Machines");

  // A failed start posts no card.
  const failed: string[] = [];
  const refused = await startOn(service.api, "exhausted", (id) => failed.push(id) > 0);
  assert.equal(refused.success, false);
  assert.deepEqual(failed, []);
  checks.push("a failed computer_start posts no card");

  // A card that cannot be posted does not hide the started machine from the agent, and promises no button.
  const kept = await startOn(service.api, "demo-project", () => {
    throw new Error("card write failed");
  });
  assert.equal(kept.success, true);
  assert.equal(resultField(kept, "id"), "demo-machine");
  assert.equal(resultField(kept, "live_view"), COMPUTER_LIVE_VIEW_ELSEWHERE);
  checks.push("a card post that throws still returns the started machine, and live_view promises no button");

  // 4. The chat card: a completed system message whose item type holds the machine id only.
  const card: ConversationMessage = {
    id: "card-1",
    turnId: "turn-1",
    author: "system",
    source: "system",
    status: "completed",
    createdAt: new Date(0).toISOString(),
    itemType: computerLiveViewItemType({ machineId: "demo-machine" }),
    text: sourceText("status.agent.computerLiveViewReady"),
  };
  assert.equal(card.itemType, `${COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX}demo-machine`);
  assert.deepEqual(computerLiveViewEvent(card), { machineId: "demo-machine" });
  assert.ok(!JSON.stringify(card).includes(FIXTURE_LIVE), "the stored card has no live view link");
  assert.equal(computerLiveViewEvent({ ...card, author: "agent" }), null);
  assert.throws(() => computerLiveViewItemType({ machineId: "https://x.invalid/live" }));
  checks.push("card message stores only the machine id; agent-written or malformed item types are refused");

  // 5. Bug 1: the person who sent the turn has an account credential, so computer_start runs on the
  // account-scoped API. The card holds that machine's id. The host key's machine list never has it.
  const accountCards: string[] = [];
  const accountStart = await startOn(
    service.api.forAccount(accountCredential),
    "demo-project",
    (id) => accountCards.push(id) > 0,
  );
  assert.equal(accountStart.success, true);
  assert.deepEqual(accountCards, ["account-machine"]);
  assert.ok(!JSON.stringify(accountStart).includes(FIXTURE_ACCOUNT_LIVE));
  const keyList = await run(service.machines());
  assert.equal(machineLiveViewUrl(keyList, "account-machine"), null, "the old lookup cannot open it");
  checks.push("an account-scoped start posts a card whose machine the key's machine list does not have");

  const lookup = (canAdminister: boolean, credential: IntegrationCredential<"computer"> | undefined, id: string) =>
    run(computerLiveViewUrl(service.api, { canAdminister, credential }, id));
  // The person whose account started it opens it: on this computer (the owner) and as a joined member.
  assert.equal(await lookup(true, accountCredential, "account-machine"), FIXTURE_ACCOUNT_LIVE);
  assert.equal(await lookup(false, accountCredential, "account-machine"), FIXTURE_ACCOUNT_LIVE);
  // Another member, or an owner or admin without that account, does not get it.
  assert.equal(await lookup(false, undefined, "account-machine"), null);
  assert.equal(await lookup(true, undefined, "account-machine"), null);
  // The key's machines stay for an owner or admin only.
  assert.equal(await lookup(true, undefined, "demo-machine"), FIXTURE_LIVE);
  assert.equal(await lookup(false, accountCredential, "demo-machine"), null);
  assert.equal(await lookup(true, accountCredential, "another-machine"), null);
  assert.ok(!redactText(`log ${FIXTURE_ACCOUNT_LIVE}`).includes(FIXTURE_ACCOUNT_LIVE));
  assert.ok(!redactSecrets(`send ${FIXTURE_ACCOUNT_LIVE}`).includes(FIXTURE_ACCOUNT_LIVE));
  checks.push(
    "host lookup: the starting person opens an account machine; key machines stay owner or admin; link redacted",
  );

  // A list that fails is not the answer: the other list still answers, and only no list fails the open.
  const brokenCredential: IntegrationCredential<"computer"> = {
    audience: "computer",
    bearer: Effect.fail(new Error("no grant")),
  };
  assert.equal(await lookup(true, brokenCredential, "demo-machine"), FIXTURE_LIVE);
  await assert.rejects(lookup(false, brokenCredential, "account-machine"));
  checks.push("a list that fails is skipped; the open fails only when no list could answer");

  // 6. The client gate and the boundary decoders. A member gets the button only from a host that answers
  // members (`computer-live-view-v1`); an older host keeps the owner or admin gate. Links are https only.
  const asked: string[] = [];
  const liveView = async (machineId: string) => {
    asked.push(machineId);
    return machineId === "account-machine" ? FIXTURE_ACCOUNT_LIVE : null;
  };
  const opened: (string | null)[] = [];
  const open = async (link: Promise<string | null>) => {
    const url = await link;
    opened.push(url);
    return url !== null;
  };
  const memberOpener = computerLiveViewOpener(joined("member", ["computer-live-view-v1"]), liveView, open);
  assert.ok(memberOpener, "a member gets the button on a host with computer-live-view-v1");
  assert.equal(await memberOpener("account-machine"), true);
  assert.equal(await memberOpener("demo-machine"), false);
  assert.deepEqual(opened, [FIXTURE_ACCOUNT_LIVE, null]);
  assert.equal(computerLiveViewOpener(joined("member", ["agent-computer-v1"]), liveView, open), undefined);
  assert.ok(computerLiveViewOpener(joined("admin", ["agent-computer-v1"]), liveView, open));
  assert.ok(computerLiveViewOpener({ ...joined("owner", []), kind: "local" }, liveView, open));
  checks.push("client gate: members get the button only with computer-live-view-v1; older hosts keep owner/admin");

  assert.equal(decodeComputerLiveViewFromHost({ liveViewUrl: FIXTURE_ACCOUNT_LIVE }), FIXTURE_ACCOUNT_LIVE);
  assert.equal(decodeComputerLiveViewFromHost({ liveViewUrl: null }), null);
  assert.throws(() => decodeComputerLiveViewFromHost({ liveViewUrl: "javascript:alert(1)" }));
  assert.throws(() => decodeComputerLiveViewFromMain("http://computer.example.invalid/live"));
  assert.equal(httpsLiveViewUrl("javascript:alert(1)"), null);
  const [row] = keyList.machines;
  assert.ok(row);
  assert.equal(
    machineLiveViewUrl({ machines: [{ ...row, liveViewUrl: "javascript:alert(1)" }] }, "demo-machine"),
    null,
  );
  checks.push("host, preload and list decoders accept only https live view links");

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
  process.stdout.write(`${checks.length} checks passed. ${out}\n`);
} finally {
  await fixture.close();
  await rm(root, { recursive: true, force: true });
}

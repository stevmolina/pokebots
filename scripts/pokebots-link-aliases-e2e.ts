import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createAgentTemplateShareUrl, createOpenBotAgentTemplateUrl } from "@pokebots/contracts/agent-template-links";
import { createInviteUrl, createOpenBotInviteUrl, parseInviteUrl } from "@pokebots/contracts/invite-links";
import { createMarketplaceShareUrl, createOpenBotMarketplaceUrl } from "@pokebots/contracts/marketplace-links";
import { createOpenBotPluginUrl, createPluginShareUrl } from "@pokebots/contracts/plugin-links";
import { readIncomingLink, redirectIncomingLink } from "../apps/mobile/src/features/links/model/incoming-links";
import { findDeepLink, parseDeepLink } from "../src/main/deep-link-router";

const templateId = "A".repeat(22);
const skill = { kind: "skill", id: "sample-skill" } as const;
const agent = { kind: "agent", id: "sample-agent" } as const;
const invite = {
  apiUrl: "https://api.openbot.run",
  serverId: "01234567-89ab-4def-8123-456789abcdef",
  fingerprint: "f".repeat(32),
  token: "t".repeat(32),
};
const query = `?api=https%3A%2F%2Fapi.openbot.run&server=${invite.serverId}&fingerprint=${invite.fingerprint}&invite=${invite.token}`;
const listings = [
  [createOpenBotPluginUrl("sample-plugin"), createPluginShareUrl("sample-plugin"), "plugins/sample-plugin", "plugin"],
  [
    createOpenBotAgentTemplateUrl(templateId),
    createAgentTemplateShareUrl(templateId),
    `agents/${templateId}`,
    "agent-template",
  ],
  [
    createOpenBotMarketplaceUrl(agent),
    createMarketplaceShareUrl(agent),
    "marketplace/agents/sample-agent",
    "marketplace",
  ],
  [
    createOpenBotMarketplaceUrl(skill),
    createMarketplaceShareUrl(skill),
    "marketplace/skills/sample-skill",
    "marketplace",
  ],
] as const;

assert.ok(createOpenBotInviteUrl(invite) === `openbot://join${query}`);
assert.ok(createInviteUrl(invite) === `https://openbot.run/join${query}`);
for (const [app, share, path, kind] of listings) {
  assert.equal(app, `openbot://${path}`);
  assert.equal(share, `https://openbot.run/${path}`);
  const expected = parseDeepLink(app);
  assert.equal(expected?.kind, kind);
  assert.deepEqual(parseDeepLink(share), expected);
  assert.deepEqual(findDeepLink(["--", `pokebots://${path}`]), expected);
}

function mobileLink(value: string) {
  const route = redirectIncomingLink(value, true);
  assert.ok(route);
  const request = new URL(route, "https://openbot.run").searchParams.get("request");
  return readIncomingLink(request ?? undefined);
}

for (const [app, , path] of listings.slice(0, 2)) {
  const expected = mobileLink(app);
  assert.ok(expected.kind === "plugin" || expected.kind === "template");
  assert.deepEqual(mobileLink(`pokebots://${path}`), expected);
}

const untrustedQuery = query.replace("api.openbot.run", "accounts.example");
const rejected = [
  `join${untrustedQuery}`,
  `join${query.replace(invite.token, "short")}`,
  `join${query.replace(invite.fingerprint, "short")}`,
  `join/wrong${query}`,
  `join${query}&invite=${invite.token}`,
  "plugins/sample-plugin?install=1",
  "user@plugins/sample-plugin",
  "plugins:8443/sample-plugin",
  "plugins/sample-plugin#install",
  "agents/short",
  "marketplace/skills/sample%2Fskill",
  "marketplace/agents/sample-agent/extra",
];
for (const scheme of ["openbot", "pokebots"]) {
  const value = `${scheme}://join${query}`;
  assert.ok(parseDeepLink(value)?.kind === "invite");
  assert.ok(mobileLink(value).kind === "invite");
  assert.deepEqual(parseInviteUrl(value), invite);
  for (const path of rejected) assert.equal(parseDeepLink(`${scheme}://${path}`), null);
}
const selfHosted = `pokebots://join${untrustedQuery}`;
assert.equal(mobileLink(selfHosted).kind, "invalid");
assert.ok(parseDeepLink(selfHosted, { selfHostedApiOrigin: "https://accounts.example" })?.kind === "invite");
assert.equal(parseDeepLink("https://openbot.run.example/plugins/sample-plugin"), null);
for (const path of [
  "mcp-auth?code=sample&state=sample",
  "slack-workspace?nonce=sample&grant=sample",
  "discord-guild?nonce=sample&grant=sample",
]) {
  assert.ok(parseDeepLink(`openbot://${path}`));
  assert.equal(parseDeepLink(`pokebots://${path}`), null);
}

const report = {
  result: "passed",
  listingKinds: listings.map(([, , path]) => path),
  rejectedPerScheme: rejected.length,
  checked: ["desktop routing", "mobile incoming links", "invite origin rules", "canonical output", "callback schemes"],
};
await mkdir(".openbot-build", { recursive: true });
await writeFile(".openbot-build/pokebots-link-aliases.json", JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report)}\n`);

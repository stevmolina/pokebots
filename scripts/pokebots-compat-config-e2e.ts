// Verifies Release A3 compatibility for Pokebots deep-link schemes (`pokebots://` alongside
// `openbot://`) and paired `POKEBOTS_*` / legacy environment variables across desktop main,
// backend, contracts, and Signal (`remote/api`).
// Run: `bun scripts/pokebots-compat-config-e2e.ts`
// Writes `.openbot-build/pokebots-compat-config-e2e/report.json`.

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createOpenBotAgentTemplateUrl, parseAgentTemplateUrl } from "@openbot/contracts/agent-template-links";
import {
  hasSupportedDeepLinkScheme,
  isSupportedDeepLinkProtocol,
  OPENBOT_DEEP_LINK_PROTOCOL,
  POKEBOTS_DEEP_LINK_PROTOCOL,
} from "@openbot/contracts/deep-link-schemes";
import { createOpenBotInviteUrl, parseInviteUrl, toOpenBotInviteUrl } from "@openbot/contracts/invite-links";
import { createOpenBotMarketplaceUrl, parseMarketplaceUrl } from "@openbot/contracts/marketplace-links";
import { createMobileConnectUrl, parseMobileConnectUrl } from "@openbot/contracts/mobile-connect";
import { createOpenBotPluginUrl, parsePluginUrl } from "@openbot/contracts/plugin-links";
import {
  AGENT_COMPUTER_API_URL_ENV,
  AGENT_SCREEN_BIN_ENV,
  CUA_DRIVER_PATH_ENV,
  DATA_DIR_ENV,
  DISABLE_GPU_ENV,
  EnvCompatibilityConflictError,
  type EnvironmentRecord,
  HOSTED_SERVER_ENV,
  normalizeEnvTrimmed,
  REMOTE_DESKTOP_RUNTIME_PATH_ENV,
  resolveCompatEnv,
  SOURCE_COMMIT_ENV,
} from "@openbot/contracts/pokebots-env";
import { readRemoteApiConfig } from "../remote/api/src/config";
import { agentScreenMcpServer, perAgentScreensEnabled } from "../src/backend/agent/agent-screens";
import { readCentralAuthApiUrlFromEnv, readMobileConnectApiUrlFromEnv } from "../src/main/central-auth-manager";
import { readSelfHostedSignalOriginFromEnv } from "../src/main/content-security-policy";
import { findDeepLink, MCP_OAUTH_REDIRECT_URL, parseDeepLink } from "../src/main/deep-link-router";
import { githubAppConfig } from "../src/main/github-connector-config";

const OUT = resolve(import.meta.dirname, "../.openbot-build/pokebots-compat-config-e2e");

interface CheckEntry {
  name: string;
  passed: boolean;
  detail: string;
}

interface Report {
  passed: boolean;
  checks: CheckEntry[];
}

const report: Report = { passed: false, checks: [] };

function recordCheck(name: string, fn: () => string): void {
  const detail = fn();
  report.checks.push({ name, passed: true, detail });
}

function assertConflictRedacted(
  run: () => unknown,
  expectedPokebots: string,
  expectedLegacy: string,
  secretMarkers: readonly string[],
): string {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof EnvCompatibilityConflictError,
    `Expected EnvCompatibilityConflictError for ${expectedPokebots}/${expectedLegacy}, got ${String(caught)}`,
  );
  assert.equal(caught.pokebotsName, expectedPokebots);
  assert.equal(caught.legacyName, expectedLegacy);
  assert.ok(caught.message.includes(expectedPokebots), "Error message must name the POKEBOTS_* variable.");
  assert.ok(caught.message.includes(expectedLegacy), "Error message must name the legacy variable.");
  for (const secret of secretMarkers) {
    assert.ok(
      !caught.message.includes(secret),
      `Error message must redact secret marker for ${expectedPokebots}/${expectedLegacy}.`,
    );
  }
  return caught.message;
}

const SECRET_A = "super-secret-value-alpha-0123456789abcdef";
const SECRET_B = "super-secret-value-bravo-fedcba9876543210";

function baseLegacySignalEnv(overrides: EnvironmentRecord = {}): EnvironmentRecord {
  return {
    REMOTE_TLS_DISABLED: "true",
    REMOTE_TICKET_PUBLIC_KEYS: '{"keys":[{"kty":"OKP","crv":"Ed25519","x":"legacy-key"}]}',
    REMOTE_CONTROL_PLANE_URL: "https://api.openbot.run",
    REMOTE_SESSION_SECRET: "session-secret-legacy-0123456789abcdef",
    REMOTE_AUTH_WEBHOOK_SECRET: "webhook-secret-legacy-0123456789abcdef",
    TURN_SHARED_SECRET: "turn-secret-legacy-0123456789abcdef01",
    TURN_HOST: "turn.openbot.run",
    ...overrides,
  };
}

try {
  recordCheck("safe-settings-pokebots-precedence", () => {
    const safeEnv: EnvironmentRecord = {
      POKEBOTS_DATA_DIR: "/srv/pokebots/data",
      OPENBOT_DATA_DIR: "/srv/openbot/data",
      POKEBOTS_DISABLE_GPU: "1",
      OPENBOT_DISABLE_GPU: "0",
      POKEBOTS_HOSTED_SERVER: "1",
      OPENBOT_HOSTED_SERVER: "0",
      POKEBOTS_AGENT_SCREEN_BIN: "/usr/local/bin/pokebots-screen",
      OPENBOT_AGENT_SCREEN_BIN: "/usr/local/bin/openbot-screen",
      POKEBOTS_REMOTE_DESKTOP_RUNTIME_PATH: "/opt/pokebots/rdp",
      OPENBOT_REMOTE_DESKTOP_RUNTIME_PATH: "/opt/openbot/rdp",
      POKEBOTS_CUA_DRIVER_PATH: "/opt/pokebots/cua",
      OPENBOT_CUA_DRIVER_PATH: "/opt/openbot/cua",
      POKEBOTS_SOURCE_COMMIT: "pokebots-commit-sha",
      OPENBOT_SOURCE_COMMIT: "openbot-commit-sha",
      POKEBOTS_SERVER: "1",
      OPENBOT_SERVER: "0",
    };

    assert.equal(resolveCompatEnv(safeEnv, DATA_DIR_ENV), "/srv/pokebots/data");
    assert.equal(resolveCompatEnv(safeEnv, DISABLE_GPU_ENV), "1");
    assert.equal(resolveCompatEnv(safeEnv, HOSTED_SERVER_ENV), "1");
    assert.equal(resolveCompatEnv(safeEnv, AGENT_SCREEN_BIN_ENV), "/usr/local/bin/pokebots-screen");
    assert.equal(resolveCompatEnv(safeEnv, REMOTE_DESKTOP_RUNTIME_PATH_ENV), "/opt/pokebots/rdp");
    assert.equal(resolveCompatEnv(safeEnv, CUA_DRIVER_PATH_ENV), "/opt/pokebots/cua");
    assert.equal(resolveCompatEnv(safeEnv, SOURCE_COMMIT_ENV), "pokebots-commit-sha");
    assert.equal(perAgentScreensEnabled(safeEnv as NodeJS.ProcessEnv), true);
    assert.equal(
      agentScreenMcpServer("agent-1", safeEnv as NodeJS.ProcessEnv)?.command,
      "/usr/local/bin/pokebots-screen",
    );

    const signalConfig = readRemoteApiConfig(
      baseLegacySignalEnv({
        POKEBOTS_REMOTE_SIGNAL_HOST: "127.0.0.1",
        REMOTE_SIGNAL_HOST: "0.0.0.0",
        POKEBOTS_REMOTE_SIGNAL_PORT: "9443",
        REMOTE_SIGNAL_PORT: "8443",
        POKEBOTS_REMOTE_MAX_CONNECTIONS_PER_USER: "64",
        REMOTE_MAX_CONNECTIONS_PER_USER: "16",
        POKEBOTS_SOURCE_COMMIT: "abc1234",
        OPENBOT_SOURCE_COMMIT: "def5678",
      }),
    );
    assert.equal(signalConfig.host, "127.0.0.1");
    assert.equal(signalConfig.port, 9443);
    assert.equal(signalConfig.maximumConnectionsPerUser, 64);
    assert.equal(signalConfig.sourceCommit, "abc1234");
    assert.equal(normalizeEnvTrimmed("  trimmed  "), "trimmed");

    return "POKEBOTS_* overrides OPENBOT_* and legacy Signal values for all safe settings.";
  });

  recordCheck("security-sensitive-contradictions-rejected-and-redacted", () => {
    assertConflictRedacted(
      () =>
        readCentralAuthApiUrlFromEnv({
          POKEBOTS_AUTH_API_URL: `https://api.pokebots.example/${SECRET_A}`,
          OPENBOT_AUTH_API_URL: `https://api.openbot.example/${SECRET_B}`,
        }),
      "POKEBOTS_AUTH_API_URL",
      "OPENBOT_AUTH_API_URL",
      [SECRET_A, SECRET_B, "api.pokebots.example", "api.openbot.example"],
    );

    assertConflictRedacted(
      () =>
        readMobileConnectApiUrlFromEnv({
          POKEBOTS_MOBILE_AUTH_API_URL: "https://mobile-a.example.com",
          OPENBOT_MOBILE_AUTH_API_URL: "https://mobile-b.example.com",
        }),
      "POKEBOTS_MOBILE_AUTH_API_URL",
      "OPENBOT_MOBILE_AUTH_API_URL",
      ["mobile-a.example.com", "mobile-b.example.com"],
    );

    assertConflictRedacted(
      () =>
        readSelfHostedSignalOriginFromEnv({
          POKEBOTS_AUTH_API_URL: "https://api.example.com",
          POKEBOTS_REMOTE_SIGNAL_URL: `wss://signal-a.example.com/v1/signal?token=${SECRET_A}`,
          OPENBOT_REMOTE_SIGNAL_URL: `wss://signal-b.example.com/v1/signal?token=${SECRET_B}`,
        }),
      "POKEBOTS_REMOTE_SIGNAL_URL",
      "OPENBOT_REMOTE_SIGNAL_URL",
      [SECRET_A, SECRET_B, "signal-a.example.com", "signal-b.example.com"],
    );

    assertConflictRedacted(
      () =>
        resolveCompatEnv(
          {
            POKEBOTS_AGENT_COMPUTER_API_URL: "https://computer-a.example.com/api/v1",
            OPENBOT_AGENT_COMPUTER_API_URL: "https://computer-b.example.com/api/v1",
          },
          AGENT_COMPUTER_API_URL_ENV,
        ),
      "POKEBOTS_AGENT_COMPUTER_API_URL",
      "OPENBOT_AGENT_COMPUTER_API_URL",
      ["computer-a.example.com", "computer-b.example.com"],
    );

    assertConflictRedacted(
      () =>
        githubAppConfig({
          POKEBOTS_GITHUB_CLIENT_ID: "Iv23PokebotsClient",
          OPENBOT_GITHUB_CLIENT_ID: "Iv23OpenBotClient",
        }),
      "POKEBOTS_GITHUB_CLIENT_ID",
      "OPENBOT_GITHUB_CLIENT_ID",
      ["Iv23PokebotsClient", "Iv23OpenBotClient"],
    );

    assertConflictRedacted(
      () =>
        githubAppConfig({
          POKEBOTS_GITHUB_APP_SLUG: "pokebots-git",
          OPENBOT_GITHUB_APP_SLUG: "openbotgit",
        }),
      "POKEBOTS_GITHUB_APP_SLUG",
      "OPENBOT_GITHUB_APP_SLUG",
      ["pokebots-git", "openbotgit"],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_REMOTE_SESSION_SECRET: SECRET_A,
            REMOTE_SESSION_SECRET: SECRET_B,
          }),
        ),
      "POKEBOTS_REMOTE_SESSION_SECRET",
      "REMOTE_SESSION_SECRET",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_REMOTE_AUTH_WEBHOOK_SECRET: SECRET_A,
            REMOTE_AUTH_WEBHOOK_SECRET: SECRET_B,
          }),
        ),
      "POKEBOTS_REMOTE_AUTH_WEBHOOK_SECRET",
      "REMOTE_AUTH_WEBHOOK_SECRET",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_TURN_SHARED_SECRET: SECRET_A,
            TURN_SHARED_SECRET: SECRET_B,
          }),
        ),
      "POKEBOTS_TURN_SHARED_SECRET",
      "TURN_SHARED_SECRET",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_REMOTE_METRICS_TOKEN: SECRET_A,
            REMOTE_METRICS_TOKEN: SECRET_B,
          }),
        ),
      "POKEBOTS_REMOTE_METRICS_TOKEN",
      "REMOTE_METRICS_TOKEN",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_REMOTE_TLS_DISABLED: "false",
            REMOTE_TLS_DISABLED: "true",
          }),
        ),
      "POKEBOTS_REMOTE_TLS_DISABLED",
      "REMOTE_TLS_DISABLED",
      ["false", "true"],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_REMOTE_TICKET_PUBLIC_KEYS: '{"keys":[{"x":"pokebots-key"}]}',
            REMOTE_TICKET_PUBLIC_KEYS: undefined,
            REMOTE_TICKET_PUBLIC_JWKS: '{"keys":[{"x":"legacy-jwks"}]}',
          }),
        ),
      "POKEBOTS_REMOTE_TICKET_PUBLIC_KEYS",
      "REMOTE_TICKET_PUBLIC_JWKS",
      ["pokebots-key", "legacy-jwks"],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_SLACK_SIGNING_SECRET: `A123:${SECRET_A}`,
            SLACK_SIGNING_SECRET: `A123:${SECRET_B}`,
          }),
        ),
      "POKEBOTS_SLACK_SIGNING_SECRET",
      "SLACK_SIGNING_SECRET",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_GITHUB_WEBHOOK_SECRET: SECRET_A,
            GITHUB_WEBHOOK_SECRET: SECRET_B,
          }),
        ),
      "POKEBOTS_GITHUB_WEBHOOK_SECRET",
      "GITHUB_WEBHOOK_SECRET",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_TELEGRAM_BOT_TOKENS: `123456:${SECRET_A}`,
            TELEGRAM_BOT_TOKENS: `123456:${SECRET_B}`,
          }),
        ),
      "POKEBOTS_TELEGRAM_BOT_TOKENS",
      "TELEGRAM_BOT_TOKENS",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_DISCORD_BOT_TOKEN: `aaa.${SECRET_A}.ccc`,
            DISCORD_BOT_TOKEN: `aaa.${SECRET_B}.ccc`,
          }),
        ),
      "POKEBOTS_DISCORD_BOT_TOKEN",
      "DISCORD_BOT_TOKEN",
      [SECRET_A, SECRET_B],
    );

    assertConflictRedacted(
      () =>
        readRemoteApiConfig(
          baseLegacySignalEnv({
            POKEBOTS_SIGNAL_ID: "signal-eu-1",
            SIGNAL_ID: "signal-us-1",
          }),
        ),
      "POKEBOTS_SIGNAL_ID",
      "SIGNAL_ID",
      ["signal-eu-1", "signal-us-1"],
    );

    return "All 17 security-sensitive contradictions threw EnvCompatibilityConflictError with values redacted.";
  });

  recordCheck("security-sensitive-matching-pairs-accepted", () => {
    assert.equal(
      readCentralAuthApiUrlFromEnv({
        POKEBOTS_AUTH_API_URL: "https://API.OPENBOT.RUN:443/",
        OPENBOT_AUTH_API_URL: "https://api.openbot.run",
      }),
      "https://api.openbot.run",
    );

    assert.equal(
      readSelfHostedSignalOriginFromEnv({
        POKEBOTS_AUTH_API_URL: "https://api.example.com/",
        OPENBOT_AUTH_API_URL: "https://API.EXAMPLE.COM:443",
        POKEBOTS_REMOTE_SIGNAL_URL: "wss://SIGNAL.EXAMPLE.COM:443/v1/signal",
        OPENBOT_REMOTE_SIGNAL_URL: "wss://signal.example.com/v1/signal",
      }),
      "wss://signal.example.com",
    );

    assert.deepEqual(
      githubAppConfig({
        POKEBOTS_GITHUB_CLIENT_ID: "Iv23SameClientId",
        OPENBOT_GITHUB_CLIENT_ID: "  Iv23SameClientId  ",
        POKEBOTS_GITHUB_APP_SLUG: "openbotgit",
        OPENBOT_GITHUB_APP_SLUG: "  openbotgit  ",
      }),
      { clientId: "Iv23SameClientId", slug: "openbotgit" },
    );

    const matchingSignal = readRemoteApiConfig(
      baseLegacySignalEnv({
        POKEBOTS_REMOTE_TLS_DISABLED: " true ",
        REMOTE_TLS_DISABLED: "true",
        POKEBOTS_REMOTE_CONTROL_PLANE_URL: "https://API.OPENBOT.RUN:443/",
        REMOTE_CONTROL_PLANE_URL: "https://api.openbot.run",
        POKEBOTS_REMOTE_SESSION_SECRET: SECRET_A,
        REMOTE_SESSION_SECRET: `  ${SECRET_A}  `,
        POKEBOTS_REMOTE_TICKET_PUBLIC_KEYS: '{"keys":[{"x":"same"}]}',
        REMOTE_TICKET_PUBLIC_KEYS: undefined,
        REMOTE_TICKET_PUBLIC_JWKS: '{"keys":[{"x":"same"}]}',
        POKEBOTS_TURN_HOST: "TURN.OPENBOT.RUN",
        TURN_HOST: "turn.openbot.run",
        POKEBOTS_REMOTE_METRICS_TOKEN: SECRET_B,
        REMOTE_METRICS_TOKEN: SECRET_B,
      }),
    );
    assert.equal(matchingSignal.sessionSecret, SECRET_A);
    assert.equal(matchingSignal.metricsToken, SECRET_B);
    assert.deepEqual(matchingSignal.turnHosts, ["turn.openbot.run"]);

    return "Matching security-sensitive pairs accepted across URL, case, and trim normalization.";
  });

  recordCheck("legacy-openbot-only-and-blank-pokebots-unchanged", () => {
    const legacyOnly: EnvironmentRecord = {
      POKEBOTS_DATA_DIR: "   ",
      OPENBOT_DATA_DIR: "/legacy/openbot/data",
      POKEBOTS_AUTH_API_URL: "",
      OPENBOT_AUTH_API_URL: "https://legacy-auth.example.com",
      POKEBOTS_REMOTE_SIGNAL_URL: "  ",
      OPENBOT_REMOTE_SIGNAL_URL: "wss://legacy-signal.example.com/v1/signal",
      OPENBOT_SERVER: "1",
      OPENBOT_AGENT_SCREEN_BIN: "/usr/bin/legacy-screen",
    };

    assert.equal(resolveCompatEnv(legacyOnly, DATA_DIR_ENV), "/legacy/openbot/data");
    assert.equal(readCentralAuthApiUrlFromEnv(legacyOnly), "https://legacy-auth.example.com");
    assert.equal(readSelfHostedSignalOriginFromEnv(legacyOnly), "wss://legacy-signal.example.com");
    assert.equal(perAgentScreensEnabled(legacyOnly as NodeJS.ProcessEnv), true);
    assert.equal(
      agentScreenMcpServer("agent-legacy", legacyOnly as NodeJS.ProcessEnv)?.command,
      "/usr/bin/legacy-screen",
    );

    const legacySignal = readRemoteApiConfig(baseLegacySignalEnv({ POKEBOTS_REMOTE_SESSION_SECRET: "   " }));
    assert.equal(legacySignal.controlPlaneUrl, "https://api.openbot.run");
    assert.equal(legacySignal.sessionSecret, "session-secret-legacy-0123456789abcdef");

    return "Legacy OPENBOT_* and Signal-only configs work unchanged, and blank POKEBOTS_* values are ignored.";
  });

  recordCheck("deep-links-scheme-parity-and-rejection", () => {
    assert.equal(OPENBOT_DEEP_LINK_PROTOCOL, "openbot:");
    assert.equal(POKEBOTS_DEEP_LINK_PROTOCOL, "pokebots:");
    assert.equal(isSupportedDeepLinkProtocol("openbot:"), true);
    assert.equal(isSupportedDeepLinkProtocol("pokebots:"), true);
    assert.equal(isSupportedDeepLinkProtocol("https:"), false);
    assert.equal(hasSupportedDeepLinkScheme("openbot://plugins/linear"), true);
    assert.equal(hasSupportedDeepLinkScheme("POKEBOTS://plugins/linear"), true);
    assert.equal(hasSupportedDeepLinkScheme("javascript:alert(1)"), false);

    const invitePayload = {
      apiUrl: "https://api.openbot.run",
      serverId: "550e8400-e29b-41d4-a716-446655440000",
      fingerprint: "A".repeat(43),
      token: "B".repeat(43),
    };
    const openbotInvite = createOpenBotInviteUrl(invitePayload);
    assert.ok(openbotInvite.startsWith("openbot://join?"), "Canonical invite URL stays openbot:// during Release A.");
    const pokebotsInvite = openbotInvite.replace(/^openbot:/u, "pokebots:");

    assert.deepEqual(parseInviteUrl(pokebotsInvite), parseInviteUrl(openbotInvite));
    assert.equal(toOpenBotInviteUrl(pokebotsInvite), openbotInvite);
    assert.equal(parseDeepLink(openbotInvite)?.kind, "invite");
    assert.equal(parseDeepLink(pokebotsInvite)?.kind, "invite");
    assert.deepEqual(findDeepLink(["--flag", pokebotsInvite]), { kind: "invite", url: pokebotsInvite });

    const pluginOpenBot = createOpenBotPluginUrl("linear-sync");
    assert.equal(pluginOpenBot, "openbot://plugins/linear-sync");
    const pluginPokebots = "pokebots://plugins/linear-sync";
    assert.equal(parsePluginUrl(pluginPokebots), parsePluginUrl(pluginOpenBot));
    assert.deepEqual(parseDeepLink(pluginPokebots), parseDeepLink(pluginOpenBot));

    const templateId = "AbCdEfGhIjKlMnOpQrStUv";
    const templateOpenBot = createOpenBotAgentTemplateUrl(templateId);
    assert.equal(templateOpenBot, `openbot://agents/${templateId}`);
    const templatePokebots = `pokebots://agents/${templateId}`;
    assert.equal(parseAgentTemplateUrl(templatePokebots), parseAgentTemplateUrl(templateOpenBot));
    assert.deepEqual(parseDeepLink(templatePokebots), parseDeepLink(templateOpenBot));

    const marketplaceAgent = createOpenBotMarketplaceUrl({ kind: "agent", id: "openbot-curated-agent-writer" });
    assert.equal(marketplaceAgent, "openbot://marketplace/agents/openbot-curated-agent-writer");
    assert.deepEqual(
      parseMarketplaceUrl(marketplaceAgent.replace(/^openbot:/u, "pokebots:")),
      parseMarketplaceUrl(marketplaceAgent),
    );
    assert.deepEqual(
      parseDeepLink(marketplaceAgent.replace(/^openbot:/u, "pokebots:")),
      parseDeepLink(marketplaceAgent),
    );

    const marketplaceSkill = createOpenBotMarketplaceUrl({ kind: "skill", id: "daily-briefing" });
    assert.equal(marketplaceSkill, "openbot://marketplace/skills/daily-briefing");
    assert.deepEqual(
      parseDeepLink(marketplaceSkill.replace(/^openbot:/u, "pokebots:")),
      parseDeepLink(marketplaceSkill),
    );

    assert.equal(MCP_OAUTH_REDIRECT_URL, "openbot://mcp-auth");
    assert.deepEqual(
      parseDeepLink("pokebots://mcp-auth?code=grant-123&state=state-456"),
      parseDeepLink("openbot://mcp-auth?code=grant-123&state=state-456"),
    );
    assert.deepEqual(
      parseDeepLink("pokebots://slack-workspace?nonce=n1&grant=g1"),
      parseDeepLink("openbot://slack-workspace?nonce=n1&grant=g1"),
    );
    assert.deepEqual(
      parseDeepLink("pokebots://discord-guild?nonce=n2&grant=g2"),
      parseDeepLink("openbot://discord-guild?nonce=n2&grant=g2"),
    );

    const mobileConnectPayload = {
      apiUrl: "https://api.openbot.run",
      ticket: "T".repeat(43),
      host: { hostId: "host-123", fingerprint: "F".repeat(43) },
    };
    const mobileOpenBot = createMobileConnectUrl(mobileConnectPayload);
    assert.ok(
      mobileOpenBot.startsWith("openbot://mobile-connect?"),
      "Canonical mobile-connect URL stays openbot:// during Release A.",
    );
    const mobilePokebots = mobileOpenBot.replace(/^openbot:/u, "pokebots:");
    assert.deepEqual(parseMobileConnectUrl(mobilePokebots), parseMobileConnectUrl(mobileOpenBot));

    // Malformed and disallowed URLs must be rejected identically for both schemes.
    const invalidTemplates = [
      "://join?api=https%3A%2F%2Fevil.example&server=550e8400-e29b-41d4-a716-446655440000&fingerprint=" +
        "A".repeat(43) +
        "&invite=" +
        "B".repeat(43),
      "://user:pass@plugins/linear-sync",
      "://plugins:8080/linear-sync",
      "://plugins/linear-sync?install=1",
      "://plugins/../catalog.json",
      "://agents/too-short",
      "://marketplace/agents/valid-id?extra=1",
      "://marketplace/unknown/valid-id",
      "://mcp-auth/extra?code=grant-123&state=state-456",
      "://user:pass@mcp-auth?code=grant-123&state=state-456",
      "://mcp-auth:8080?code=grant-123&state=state-456",
      "://mcp-auth?code=grant-123",
      "://slack-workspace/extra?nonce=n1&grant=g1",
      "://discord-guild?nonce=n2",
    ];
    for (const suffix of invalidTemplates) {
      assert.equal(parseDeepLink(`openbot${suffix}`), null, `openbot${suffix} must be rejected.`);
      assert.equal(parseDeepLink(`pokebots${suffix}`), null, `pokebots${suffix} must be rejected.`);
    }
    assert.equal(parseDeepLink("javascript://plugins/linear-sync"), null);
    assert.equal(parseDeepLink("http://openbot.run/plugins/linear-sync"), null);
    assert.equal(parseDeepLink("https://openbot.run.evil.com/plugins/linear-sync"), null);

    const invalidMobileSuffixes = [
      `://user:pass@mobile-connect?api=https%3A%2F%2Fapi.openbot.run&ticket=${"T".repeat(43)}`,
      `://mobile-connect:8443?api=https%3A%2F%2Fapi.openbot.run&ticket=${"T".repeat(43)}`,
      `://mobile-connect/extra?api=https%3A%2F%2Fapi.openbot.run&ticket=${"T".repeat(43)}`,
      `://mobile-connect?api=http%3A%2F%2Fapi.openbot.run&ticket=${"T".repeat(43)}`,
      `://mobile-connect?api=https%3A%2F%2Fapi.openbot.run&ticket=${"T".repeat(43)}&extra=1`,
    ];
    for (const suffix of invalidMobileSuffixes) {
      assert.equal(parseMobileConnectUrl(`openbot${suffix}`), null, `openbot${suffix} must be rejected.`);
      assert.equal(parseMobileConnectUrl(`pokebots${suffix}`), null, `pokebots${suffix} must be rejected.`);
    }
    assert.equal(
      parseMobileConnectUrl(`other://mobile-connect?api=https%3A%2F%2Fapi.openbot.run&ticket=${"T".repeat(43)}`),
      null,
    );

    return "All 9 deep-link routes match identically between pokebots:// and openbot://, invalid URLs fail identically, and emitted links stay openbot://.";
  });

  report.passed = true;
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  // Machine-readable: E2E proof report written to stdout alongside report.json.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

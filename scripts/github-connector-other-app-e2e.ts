// Checks what the GitHub connection does with a stored sign-in of the earlier GitHub App ("OpenBotGit")
// after the move to "PokebotsApp", through the real connector service, store and encrypted file on a
// temporary folder. Only the network is a stub: it records each request and never reaches GitHub.
//  - A token set of the earlier app with no `clientId` is not refreshed with the new Client ID. It works
//    until it expires. Then the connection shows Reconnect, and the stored file keeps both tokens.
//  - The revoke page of a sign-in is the page of the app that issued it.
//  - A token set of the earlier app that never expires keeps the connection as it was.
//  - A token set of the new app is refreshed with the new Client ID.
// Run: `bun scripts/github-connector-other-app-e2e.ts`.
// Writes .openbot-build/github-connector-other-app-e2e/report.json.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { GitHubConnectorStatus } from "@openbot/contracts/ipc";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { githubAppConfig, LEGACY_GITHUB_APP_CLIENT_ID } from "../src/main/github-connector-config";
import { GitHubConnectorService } from "../src/main/github-connector-service";
import { type GitHubConnectorRecord, GitHubConnectorStore } from "../src/main/github-connector-store";

const OUT = resolve(import.meta.dirname, "../.openbot-build/github-connector-other-app-e2e");
const root = await mkdtemp(join(tmpdir(), "openbot-github-other-app-"));
const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

const app = githubAppConfig({});
assert.ok(app, "This build has a GitHub App.");
assert.notEqual(app.clientId, LEGACY_GITHUB_APP_CLIENT_ID, "The configured app is not the earlier one.");
assert.equal(app.slug, "pokebotsapp");

const cipher = {
  encrypt: (value: string) => Buffer.from(value, "utf8"),
  decrypt: (value: Buffer) => value.toString("utf8"),
};

interface Case {
  name: string;
  /** The state after the connection checked its tokens. */
  state: GitHubConnectorStatus["state"];
  /** The Client ID of each token request that went out. */
  tokenRequests: string[];
}

const steps: string[] = [];
const results: Case[] = [];

async function runCase(
  name: string,
  record: Omit<GitHubConnectorRecord, "login" | "userId" | "avatarUrl">,
  expected: { state: GitHubConnectorStatus["state"]; tokenRequests: string[]; revokeClientId: string },
) {
  const directory = await mkdtemp(join(root, "case-"));
  const path = join(directory, "github.json");
  const store = new GitHubConnectorStore(path, cipher);
  await runCauseEffect(store.write({ ...record, login: "ana", userId: 7, avatarUrl: null }));
  const tokenRequests: string[] = [];
  const fetchStub = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = String(url);
    if (target.includes("/login/oauth/access_token")) {
      const clientId = new URLSearchParams(String(init?.body)).get("client_id") ?? "";
      tokenRequests.push(clientId);
      return Response.json({
        access_token: "ghu_refreshed",
        expires_in: 28_800,
        refresh_token: "ghr_refreshed",
        refresh_token_expires_in: 15_811_200,
      });
    }
    return Response.json({ message: "stub" }, { status: 503 });
  };
  const service = new GitHubConnectorService({
    app,
    store: new GitHubConnectorStore(path, cipher),
    toolDirectory: join(directory, "tools"),
    apiUrl: "http://127.0.0.1:9",
    openExternal: async () => {},
    fetch: fetchStub,
    now: () => NOW,
  });
  const states: GitHubConnectorStatus["state"][] = [];
  service.onChanged((status) => states.push(status.state));
  await runCauseEffect(service.load());
  // The check runs in the background: wait for the state or the request, not for elapsed time.
  const settled = () =>
    expected.state === "expired"
      ? service.status().state === "expired"
      : tokenRequests.length >= 1 || expected.tokenRequests.length === 0;
  for (let attempt = 0; attempt < 200 && !settled(); attempt += 1) await new Promise((done) => setTimeout(done, 25));
  // One more turn, so a request that should not go out has its chance to.
  await new Promise((done) => setTimeout(done, 100));
  const state = service.status().state;
  const revokeUrl = service.pages().revokeUrl ?? "";
  await runCauseEffect(service.dispose());
  assert.ok(revokeUrl.endsWith(`/${expected.revokeClientId}`), `${name}: revoke page ${revokeUrl}`);
  assert.equal(state, expected.state, `${name}: state`);
  assert.deepEqual(tokenRequests, expected.tokenRequests, `${name}: token requests`);
  // The stored file still holds what it held, for the refresh that did not run.
  const reread = new GitHubConnectorStore(path, cipher);
  await runCauseEffect(reread.load());
  const stored = reread.read();
  assert.ok(stored, `${name}: the sign-in file is still there`);
  results.push({ name, state, tokenRequests });
  steps.push(name);
  return stored;
}

try {
  const due = NOW + 5 * 60_000;
  const early = await runCase(
    "A token set of the earlier app that is due soon still works and is not sent to GitHub",
    {
      accessToken: "ghu_old",
      accessTokenExpiresAt: due,
      refreshToken: "ghr_old",
      refreshTokenExpiresAt: NOW + 86_400_000,
    },
    { state: "connected", tokenRequests: [], revokeClientId: LEGACY_GITHUB_APP_CLIENT_ID },
  );
  assert.equal(early.accessToken, "ghu_old", "The access token stays in the file.");

  const legacy = await runCase(
    "A token set of the earlier app that expired shows Reconnect and is not sent to GitHub",
    {
      accessToken: "ghu_old",
      accessTokenExpiresAt: NOW - 1_000,
      refreshToken: "ghr_old",
      refreshTokenExpiresAt: NOW + 86_400_000,
    },
    { state: "expired", tokenRequests: [], revokeClientId: LEGACY_GITHUB_APP_CLIENT_ID },
  );
  assert.equal(legacy.accessToken, "ghu_old", "The access token stays in the file.");
  assert.equal(legacy.refreshToken, "ghr_old", "The refresh token stays in the file.");

  await runCase(
    "A token set of the earlier app that never expires keeps the connection",
    { accessToken: "ghu_old", accessTokenExpiresAt: null, refreshToken: null, refreshTokenExpiresAt: null },
    { state: "connected", tokenRequests: [], revokeClientId: LEGACY_GITHUB_APP_CLIENT_ID },
  );

  const current = await runCase(
    "A token set of the new app is refreshed with the new Client ID",
    {
      accessToken: "ghu_new",
      accessTokenExpiresAt: due,
      refreshToken: "ghr_new",
      refreshTokenExpiresAt: NOW + 86_400_000,
      clientId: app.clientId,
    },
    { state: "connected", tokenRequests: [app.clientId], revokeClientId: app.clientId },
  );
  assert.equal(current.accessToken, "ghu_refreshed", "The refreshed token is stored.");
  assert.equal(current.clientId, app.clientId, "The Client ID stays in the file.");

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify({ passed: true, steps, results }, null, 2)}\n`);
  process.stdout.write(`passed: ${steps.length} checks; ${join(OUT, "report.json")}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}

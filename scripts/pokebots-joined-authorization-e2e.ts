// Run: bun scripts/pokebots-joined-authorization-e2e.ts
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { runTeamEffect } from "@pokebots/team-client";
import { IntegrationAuthorization } from "@pokebots/team-client/integration-authorization";
import { RemoteTeamDirectoryClient } from "@pokebots/team-client/remote-directory";
import { Effect } from "effect";

const hostId = "test-host";
const sessionId = "test-session";
const grant = "a".repeat(43);
let now = Date.now();
const realNow = Date.now;
let accountCalls = 0;
let hostCalls = 0;
let failHost = false;
let replyHost = hostId;
let replySession = sessionId;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const browser = pathname.startsWith("/api/browser/");
    assert.equal(pathname, `${browser ? "/api/browser" : ""}/v1/me/integrations/token`);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get(browser ? "X-OpenBot-Browser" : "Authorization"), browser ? "1" : "Bearer test");
    assert.deepEqual(await request.json(), { action: "grant", remoteSessionId: sessionId });
    accountCalls++;
    return Response.json({ grant, hostId: replyHost, sessionId: replySession, expiresAt: now + 60_000 });
  },
});
const options = { apiUrl: server.url.origin, fetch, verifyHostKeySignature: () => Effect.succeed(false) };
const mobile = new RemoteTeamDirectoryClient({ ...options, token: "test" });
const browser = new RemoteTeamDirectoryClient({ ...options, authentication: { kind: "browser" } });
const authorize = mobile.requestIntegrationGrant(hostId, sessionId).pipe(
  Effect.map((value) => {
    assert.equal(value === grant, true);
    hostCalls++;
    return { status: failHost ? 403 : 200, body: { expiresAt: now + 60_000 } };
  }),
);

try {
  Date.now = () => now;
  const peer = new IntegrationAuthorization();
  await Promise.all([runTeamEffect(peer.ensure(authorize)), runTeamEffect(peer.ensure(authorize))]);
  await runTeamEffect(peer.ensure(authorize));
  assert.equal(accountCalls, 1);
  assert.equal(hostCalls, 1);
  now += 31_000;
  await runTeamEffect(peer.ensure(authorize));
  assert.equal(hostCalls, 2);

  const reconnected = new IntegrationAuthorization();
  failHost = true;
  await assert.rejects(runTeamEffect(reconnected.ensure(authorize)));
  await assert.rejects(runTeamEffect(reconnected.ensure(authorize)));
  assert.equal(hostCalls, 3);
  now += 30_001;
  failHost = false;
  await runTeamEffect(reconnected.ensure(authorize));
  assert.equal(hostCalls, 4);

  assert.equal((await runTeamEffect(browser.requestIntegrationGrant(hostId, sessionId))) === grant, true);
  replyHost = "wrong-host";
  await assert.rejects(runTeamEffect(browser.requestIntegrationGrant(hostId, sessionId)));
  replyHost = hostId;
  replySession = "wrong-session";
  await assert.rejects(runTeamEffect(browser.requestIntegrationGrant(hostId, sessionId)));
  await mkdir(".openbot-build", { recursive: true });
  await writeFile(
    ".openbot-build/pokebots-joined-authorization-e2e.json",
    JSON.stringify(
      {
        passed: [
          "bearer",
          "browser prefix",
          "host and session binding",
          "coalescing",
          "renewal",
          "reconnect",
          "retry cooldown",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  Date.now = realNow;
  await server.stop(true);
}

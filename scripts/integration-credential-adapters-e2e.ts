import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Redacted } from "effect";
import { AgentComputerApi } from "../src/backend/agent-computer/agent-computer-api";
import { BrainService } from "../src/backend/brain-service";
import { CentralAuthManager } from "../src/main/central-auth-manager";
import { joinedIntegrationCredential, localIntegrationCredential } from "../src/main/integration-credentials";
import { RoomsService } from "../src/main/rooms-service";

const bearer = "fixture-adapter-bearer";
const localSession = "fixture-local-session";
const localUser = { id: "local-user", email: "local@example.invalid", name: null, avatarUrl: null };
const checks: string[] = [];
const allowance = { seconds_remaining: 90, minutes_remaining: 1.5, resets_at: null };
const exchange = {
  hostId: "fixture-host",
  userId: "fixture-user",
  sessionId: "fixture-session",
  machineToken: "fixture-machine",
  grant: "fixture-grant",
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health/live") return Response.json({ status: "ok" });
    if (pathname === "/v1/me" && request.headers.get("Authorization") === `Bearer ${localSession}`)
      return Response.json(localUser);
    if (pathname === "/v1/me/integrations/token" && request.method === "POST") {
      assert.ok(request.headers.get("Authorization") === `Bearer ${localSession}`);
      assert.deepEqual(await request.json(), { audience: "brain" });
      return Response.json({ accessToken: bearer, expiresAt: Date.now() + 60_000 });
    }
    if (pathname === "/v2/remote/hosts/fixture-host/integrations/token" && request.method === "POST") {
      const body = await request.json();
      assert.ok(body.audience === "computer" || body.audience === "rooms");
      assert.deepEqual(body, {
        machineToken: exchange.machineToken,
        grant: exchange.grant,
        audience: body.audience,
        profile: "native",
      });
      return Response.json({
        accessToken: bearer,
        expiresAt: Date.now() + 60_000,
        userId: exchange.userId,
        sessionId: exchange.sessionId,
      });
    }
    if (request.headers.get("Authorization") !== `Bearer ${bearer}`) return new Response(null, { status: 401 });
    if (pathname === "/allowance" && request.method === "GET") return Response.json(allowance);
    if (pathname === "/rooms") return Response.json({ rooms: [] });
    if (pathname === "/machines/start" && request.headers.get("Idempotency-Key") === "fixture-start") {
      return Response.json({
        id: "fixture-computer",
        context: "fixture",
        existing: false,
        resumed: false,
        live_view_url: "https://example.invalid/fixture",
        deadline_at: "2030-01-01T00:00:00Z",
        billing: { plan: "free", ...allowance },
      });
    }
    return new Response(null, { status: 404 });
  },
});

const root = await mkdtemp(join(tmpdir(), "openbot-integration-e2e-"));
const storagePath = join(root, "session.bin");
const auth = new CentralAuthManager({
  apiUrl: server.url.href,
  storagePath,
  encrypt: (value) => Buffer.from(value),
  decrypt: (value) => value.toString(),
});
try {
  await writeFile(
    storagePath,
    Buffer.from(JSON.stringify({ version: 2, sessionToken: localSession })).toString("base64"),
  );
  assert.equal((await Effect.runPromise(auth.initialize())).status, "signed_in");
  const localBrain = localIntegrationCredential(auth, localUser.id, { audience: "brain" });
  const wrongLocal = localIntegrationCredential(auth, "other-user", { audience: "brain" });
  await assert.rejects(Effect.runPromise(wrongLocal.bearer));
  checks.push("Local exchange uses the matching signed-in account and rejects a different user");
  const actor = { ...exchange, audience: "computer", profile: "native" } as const;
  const credential = joinedIntegrationCredential(server.url.href, actor);
  const computer = new AgentComputerApi({ baseUrl: server.url.href, credential });
  assert.deepEqual(await Effect.runPromise(computer.allowance()), allowance);
  const started = await Effect.runPromise(computer.start("fixture", undefined, { idempotencyKey: "fixture-start" }));
  assert.deepEqual(started.billing, { plan: "free", ...allowance });
  checks.push("Joined exchange, computer allowance, start billing, and idempotency header");
  const unexpectedFallback = () => {
    assert.fail("Built-in operations must bypass manual credentials");
  };
  for (const mismatch of [{ userId: "other-user" }, { sessionId: "other-session" }]) {
    const badCredential = joinedIntegrationCredential(server.url.href, { ...actor, ...mismatch });
    const rejectedComputer = new AgentComputerApi({
      baseUrl: server.url.href,
      credential: badCredential,
      key: unexpectedFallback,
    });
    await assert.rejects(Effect.runPromise(rejectedComputer.allowance()), { code: "NOT_CONNECTED" });
  }
  checks.push("Joined exchange rejects each actor identity mismatch without manual fallback");

  const oauth = { accessToken: unexpectedFallback, refreshAccessToken: unexpectedFallback };
  const rooms = new RoomsService(oauth, server.url.href.replace(/\/$/u, ""));
  assert.deepEqual(
    await Effect.runPromise(
      rooms.execute({ kind: "list" }, joinedIntegrationCredential(server.url.href, { ...actor, audience: "rooms" })),
    ),
    { connected: true, rooms: [] },
  );
  const brain = new BrainService({
    oauth,
    connections: unexpectedFallback,
    fetch: (url, init) => {
      assert.equal(url.href, "https://brain.mcpbox.dev/api/v1/brains");
      assert.ok(new Headers(init.headers).get("Authorization") === `Bearer ${bearer}`);
      return Promise.resolve(Response.json({ brains: [] }));
    },
  });
  assert.deepEqual(await Effect.runPromise(brain.request({ operation: "brains" }, localBrain)), { brains: [] });
  await assert.rejects(
    Effect.runPromise(
      rooms.execute({ kind: "list" }, { audience: "rooms", bearer: Effect.succeed(Redacted.make("rejected")) }),
    ),
  );
  checks.push("Brain and Rooms use the supplied credential without MCP lookup or OAuth fallback");
  const output = ".openbot-build/integration-credential-adapters-e2e";
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify({ checks }, null, 2));
  process.stdout.write(`Integration credential adapters E2E passed. Report at ${output}/report.json\n`);
} finally {
  await Effect.runPromise(auth.dispose());
  await server.stop(true);
  await rm(root, { recursive: true, force: true });
}

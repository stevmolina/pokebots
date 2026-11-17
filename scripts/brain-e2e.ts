// Run with: bun --preload ./scripts/team-api-routes-e2e-electron.mjs scripts/brain-e2e.ts
// Exercises the real Brain service and host route over HTTP. No production writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  BRAIN_CAPABILITY,
  BRAIN_ROUTE,
  type BrainRequest,
  brainRequestSchema,
  decodeBrainResponse,
} from "@openbot/contracts/brain";
import type { McpServerConfig } from "@openbot/contracts/ipc";
import { MCP_MEMBER_ACCESS_CAPABILITY } from "@openbot/contracts/team-protocol/current";
import { Effect } from "effect";
import { BrainService } from "../src/backend/brain-service";
import { HttpError } from "../src/main/team-api/http-error";
import { routeBrain } from "../src/main/team-api/route-brain";

const connection: McpServerConfig = {
  command: "",
  args: [],
  env: [],
  envPassthrough: [],
  workingDirectory: "",
  headers: [],
  id: "brain-example",
  name: "Second Brain",
  transport: "http",
  url: "https://brain.mcpbox.dev/mcp",
  enabled: true,
};
let refreshed = 0;
let upstreamCalls = 0;
let written = "";
const upstream = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    upstreamCalls++;
    if (request.headers.get("Authorization") === "Bearer expired-e2e") return new Response(null, { status: 401 });
    assert.equal(request.headers.get("Authorization"), "Bearer refreshed-e2e");
    const url = new URL(request.url);
    if (url.pathname.endsWith("/brains"))
      return Response.json({
        brains: [{ id: "example/notes", repo: "example/notes" }],
        access_token: "must-not-cross-boundary",
      });
    if (url.pathname.endsWith("/search")) {
      assert.equal(url.searchParams.get("brain"), "example/notes");
      return Response.json({ claims: [] });
    }
    if (url.pathname.endsWith("/remember")) {
      written = await request.text();
      return Response.json({
        mode: "pull_request",
        recorded: false,
        pull_request: { url: "https://github.com/example/notes/pull/1" },
      });
    }
    if (url.pathname.endsWith("/sessions")) {
      assert.equal(url.searchParams.get("query"), "release");
      return Response.json({
        sessions: [{ id: "chat-1", source: "codex", title: "Release", snippet: "Final review", provider: "ignored" }],
      });
    }
    if (url.pathname.endsWith("/files") && request.method === "POST") {
      written = await request.text();
      return Response.json({ status: "stored", file: { path: "inputs/a.md", size: 3 } });
    }
    if (url.pathname.endsWith("/forget")) {
      written = await request.text();
      return Response.json({
        mode: "commit",
        recorded: true,
        commit: { sha: "abc1234", url: "https://github.com/example/notes/commit/abc1234" },
      });
    }
    return new Response("private upstream error", { status: 503 });
  },
});
const brain = new BrainService({
  connections: () => [connection],
  oauth: {
    accessToken: () => Effect.succeed(refreshed ? "refreshed-e2e" : "expired-e2e"),
    refreshAccessToken: () => {
      refreshed++;
      return Effect.succeed("refreshed-e2e");
    },
  },
  fetch: (input, init) => {
    const url = new URL(String(input));
    return fetch(new URL(`${url.pathname}${url.search}`, upstream.url), init);
  },
});
const host = createServer(async (request, response) => {
  const json = (status: number, value: object | null) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(value));
    return "handled" as const;
  };
  try {
    const result = await routeBrain(
      {
        request,
        response,
        method: request.method ?? "GET",
        url: new URL(request.url ?? "/", "http://localhost"),
        protocol: 9,
        capabilities: new Set([BRAIN_CAPABILITY, MCP_MEMBER_ACCESS_CAPABILITY]),
        member: {
          id: "member-e2e",
          username: "reader",
          email: null,
          name: null,
          role: request.headers["x-e2e-owner"] ? "owner" : "member",
          createdAt: "2026-01-01",
          disabled: false,
        },
        token: "session-e2e",
        sessionId: "session-e2e",
        sessionExpiresAt: "2099-01-01",
        agentLevel: () => "manage",
        json,
        empty: (status) => json(status, null),
      },
      brain,
      {
        listMcpServers: () => [connection],
        saveMcpServer: () => Effect.succeed([connection]),
        removeMcpServer: () => Effect.succeed([]),
        setMcpServerEnabled: () => Effect.succeed([connection]),
        testMcpServer: () => Effect.succeed({ toolCount: 1, error: null }),
      },
      { addedBy: () => false, add: () => Effect.void, remove: () => Effect.void },
    );
    if (result === "unmatched") json(404, {});
  } catch (error) {
    json(error instanceof HttpError ? error.status : 500, { error: error instanceof Error ? error.message : "error" });
  }
});
await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
const address = host.address();
assert.ok(address && typeof address !== "string");
const call = (operation: BrainRequest, owner = true) =>
  fetch(`http://127.0.0.1:${address.port}${BRAIN_ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(owner ? { "x-e2e-owner": "true" } : {}) },
    body: JSON.stringify(operation),
  });
const scope = { mcpServerId: connection.id, brain: "example/notes" };
try {
  const listed = await call({ operation: "brains", mcpServerId: connection.id });
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.deepEqual(decodeBrainResponse(listedBody).brains, [{ id: "example/notes", repo: "example/notes" }]);
  assert.equal(JSON.stringify(listedBody).includes("must-not-cross-boundary"), false);
  assert.equal(refreshed, 1);
  const before = upstreamCalls;
  assert.equal((await call({ operation: "brains", mcpServerId: connection.id }, false)).status, 403);
  assert.equal(upstreamCalls, before);
  assert.equal((await call({ operation: "search", ...scope, query: "launch" })).status, 200);
  const write = decodeBrainResponse(
    await (await call({ operation: "remember", ...scope, text: "Launch is Tuesday." })).json(),
  );
  assert.equal(write.mode, "pull_request");
  assert.equal(write.recorded, false);
  assert.equal(JSON.parse(written).text, "Launch is Tuesday.");
  const chats = decodeBrainResponse(await (await call({ operation: "sessions", ...scope, query: "release" })).json());
  assert.equal(chats.sessions?.[0]?.snippet, "Final review");
  assert.equal("provider" in (chats.sessions?.[0] ?? {}), false);
  const added = await call({ operation: "addFile", ...scope, path: "inputs/a.md", content: "YWJj" });
  assert.equal(added.status, 200);
  assert.deepEqual(JSON.parse(written), { brain: "example/notes", path: "inputs/a.md", content: "YWJj" });
  const forgotten = decodeBrainResponse(
    await (await call({ operation: "forget", ...scope, claim_id: "claim-12345678", reason: "Out of date" })).json(),
  );
  assert.equal(forgotten.mode, "commit");
  assert.equal(forgotten.recorded, true);
  assert.equal(JSON.parse(written).reason, "Out of date");
  assert.equal((await call({ operation: "brains", mcpServerId: "missing" })).status, 500);
  assert.equal(brainRequestSchema.safeParse({ operation: "arbitrary", ...scope }).success, false);
  const failure = await call({ operation: "overview", ...scope });
  assert.equal((await failure.text()).includes("private upstream error"), false);
  await mkdir(".openbot-build/brain", { recursive: true });
  await writeFile(
    ".openbot-build/brain/report.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "host HTTP route",
          "OAuth refresh",
          "MCP ownership gate",
          "request bounds",
          "secret field stripping",
          "search scope",
          "PR result",
          "committed result",
          "chat search",
          "file add",
          "safe upstream failure",
        ],
        liveAuthenticated: false,
      },
      null,
      2,
    ),
  );
  process.stdout.write("Brain E2E passed. Report: .openbot-build/brain/report.json\n");
} finally {
  upstream.stop(true);
  await new Promise<void>((resolve, reject) => host.close((error) => (error ? reject(error) : resolve())));
}

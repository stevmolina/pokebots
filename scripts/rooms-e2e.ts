// Drives the real Rooms HTTP service with development identities and isolated SQLite data.
// Run with ROOMS_CHECKOUT and ROOMS_PYTHON pointing to a local Rooms checkout and its environment.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ROOMS_CODECS, ROOMS_ROUTE } from "@openbot/contracts/team-protocol/rooms-v1";
import { Effect } from "effect";
import { decodeRoomsResultFromHost } from "../src/main/remote-rooms-decoding";
import { RoomsService } from "../src/main/rooms-service";
import { decodeRoomsResultFromMain } from "../src/preload/rooms-decoding";

const checkout = process.env.ROOMS_CHECKOUT;
const python = process.env.ROOMS_PYTHON;
if (!checkout || !python) throw new Error("Set ROOMS_CHECKOUT and ROOMS_PYTHON for the real Rooms service.");
const root = await mkdtemp(join(tmpdir(), "openbot-rooms-proof-"));
const child = Bun.spawn([python, resolve("scripts/rooms-fixture.py"), join(root, "rooms.db")], {
  env: { ...process.env, PYTHONPATH: checkout },
  stdout: "pipe",
  stderr: "inherit",
});
const checks: string[] = [];
try {
  const reader = child.stdout.getReader();
  const ready = await reader.read();
  assert(!ready.done, "Rooms service must start");
  const baseUrl = new TextDecoder().decode(ready.value).trim();
  assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  let refreshes = 0;
  const service = new RoomsService(
    {
      accessToken: () => Effect.succeed("expired-proof"),
      refreshAccessToken: () => {
        refreshes++;
        return Effect.succeed("rooms-proof-alice");
      },
    },
    `${baseUrl}/api/v1`,
  );
  const call = (input: Parameters<typeof service.execute>[0]) => Effect.runPromise(service.execute(input));
  const created = await call({ kind: "create", name: "Rooms proof", notice: "Coordinate release work" });
  assert(created.connected && created.room);
  assert.equal(refreshes, 1);
  checks.push("Stored MCP token refresh after a real HTTP 401");
  const roomId = created.room.id;
  assert((await call({ kind: "list" })).rooms?.some((room) => room.id === roomId));
  await call({ kind: "send", roomId, body: "Hello @Bob" });
  let messages = (await call({ kind: "read", roomId, since: 0 })).messages;
  const first = messages?.find((message) => message.body === "Hello @Bob");
  assert(first && first.kind === "human" && first.mentions.includes("Bob"));
  await call({ kind: "send", roomId, body: "Thread reply", thread: first.id });
  messages = (await call({ kind: "read", roomId, since: 0, thread: first.id })).messages;
  assert(messages?.some((message) => message.body === "Thread reply" && message.thread === first.id));
  checks.push("Room create, list, person messages, mentions, and threads");
  await call({ kind: "memory", roomId, about: "Release", decided: "Friday", open: "Review", base_version: 0 });
  const detail = await call({ kind: "detail", roomId });
  assert.equal(detail.memory?.decided, "Friday");
  await assert.rejects(call({ kind: "memory", roomId, about: "Stale", decided: "", open: "", base_version: 0 }));
  assert.equal((await call({ kind: "detail", roomId })).memory?.decided, "Friday");
  checks.push("Memory read, edit, and stale edit rejection without data loss");
  const invite = (await call({ kind: "invite", roomId })).invite;
  assert(invite);
  const bob = new RoomsService(
    { accessToken: () => Effect.succeed("rooms-proof-bob"), refreshAccessToken: () => Effect.succeed(null) },
    `${baseUrl}/api/v1`,
  );
  await Effect.runPromise(bob.execute({ kind: "join", invite }));
  assert((await Effect.runPromise(bob.execute({ kind: "list" }))).rooms?.some((room) => room.id === roomId));
  checks.push("Invite creation and join with a second person");
  await call({ kind: "task-create", roomId, title: "Verify Rooms" });
  const task = (await call({ kind: "detail", roomId })).tasks?.[0];
  assert(task);
  for (const action of ["claim", "renew", "release", "claim", "block", "claim", "done"] as const)
    await call({ kind: "task-action", roomId, taskId: task.id, action, reason: "Review needed" });
  assert.equal((await call({ kind: "detail", roomId })).tasks?.[0]?.status, "done");
  checks.push("Task create, claim, renew, release, block, reclaim, and complete");
  await call({ kind: "resume", roomId });
  const beforeWait = (await call({ kind: "read", roomId, since: 0 })).messages ?? [];
  const cursor = Math.max(0, ...beforeWait.map((message) => message.id));
  const wait = call({ kind: "wait", roomId, since: cursor });
  await Effect.runPromise(bob.execute({ kind: "send", roomId, body: "Live message" }));
  assert((await wait).messages?.some((message) => message.body === "Live message"));
  checks.push("Long poll observes room messages");
  const codec = ROOMS_CODECS.get(ROOMS_ROUTE);
  assert(codec);
  const projected = codec.response(200, detail);
  assert.deepEqual(decodeRoomsResultFromMain(projected), decodeRoomsResultFromHost(projected));
  assert.throws(() => codec.request({ kind: "send", roomId, body: 1 }));
  assert(!JSON.stringify(detail).includes("rooms-proof-alice"));
  const signedOut = new RoomsService({
    accessToken: () => Effect.succeed(null),
    refreshAccessToken: () => Effect.succeed(null),
  });
  assert.deepEqual(await Effect.runPromise(signedOut.execute({ kind: "list" })), { connected: false });
  checks.push("Frozen wire codec, independent preload and host decoders, and disconnected result");
  const output = resolve(".openbot-build/rooms-e2e/report.json");
  await mkdir(resolve(".openbot-build/rooms-e2e"), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        passed: true,
        liveProductionAuthenticated: false,
        server: "real local Rooms, development authentication",
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  child.kill("SIGTERM");
  await child.exited;
  await rm(root, { recursive: true, force: true });
}

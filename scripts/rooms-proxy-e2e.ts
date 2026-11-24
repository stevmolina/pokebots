// Drives the real main-process Rooms proxy over HTTP. The fixture has no external credentials.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { registerSecretValue } from "@pokebots/logging";
import { Effect } from "effect";
import { decodeRoomsResultFromHost } from "../src/main/remote-rooms-decoding";
import { RoomsService } from "../src/main/rooms-service";
import { decodeRoomsResultFromMain } from "../src/preload/rooms-decoding";

const token = "rooms-proof-private-access-token";
registerSecretValue(token);
let refreshed = false;
let sends = 0;
let sentBody = "";
const room = { id: "r_proof", name: "Proof room", notice: "", paused: false, role: "owner", unread: 1 };
const fixture = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("agent"), null);
    if (request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response("unauthorized", { status: 401 });
    if (url.pathname.endsWith("/messages") && request.method === "POST") {
      sentBody = await request.text();
      sends++;
      return Response.json({ room, access_token: token, guidance: "Do not forward", message: { body: token } });
    }
    if (url.pathname.endsWith("/wait"))
      return Response.json({
        room,
        messages: [
          {
            id: 1,
            thread: null,
            author: "Alice",
            kind: "human",
            body: `Hello ${token}`,
            mentions: [],
            at: "2026-11-17T00:00:00Z",
          },
        ],
      });
    return Response.json({ rooms: [room], access_token: token, guidance: "Do not forward" });
  },
});
try {
  const proxy = new RoomsService(
    {
      accessToken: () => Effect.succeed(refreshed ? token : "expired"),
      refreshAccessToken: () => {
        refreshed = true;
        return Effect.succeed(token);
      },
    },
    `http://127.0.0.1:${fixture.port}/api/v1`,
  );
  const list = await Effect.runPromise(proxy.execute({ kind: "list" }));
  assert(refreshed && list.connected && list.rooms?.[0]?.id === room.id);
  assert(!JSON.stringify(list).includes(token));
  assert(!JSON.stringify(list).includes("guidance"));
  assert.deepEqual(decodeRoomsResultFromMain(list), decodeRoomsResultFromHost(list));
  await Effect.runPromise(proxy.execute({ kind: "send", roomId: room.id, body: `Never send ${token}`, thread: 1 }));
  assert.equal(sends, 1);
  assert(!sentBody.includes(token));
  assert(JSON.parse(sentBody).thread === 1);
  const wait = await Effect.runPromise(proxy.execute({ kind: "wait", roomId: room.id, since: 0 }));
  assert.equal(wait.messages?.[0]?.body, "Hello [redacted]");
  assert.throws(() => decodeRoomsResultFromMain({ connected: true, rooms: [{ ...room, unread: -1 }] }));
  const output = ".openbot-build/rooms-e2e/proxy-report.json";
  await mkdir(".openbot-build/rooms-e2e", { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        passed: true,
        checks: [
          "HTTP bearer auth and refresh",
          "Person identity",
          "Projected response fields",
          "Independent preload and host decoding",
          "Secret redaction on send and receive",
          "Thread forwarding",
          "Long-poll response",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await fixture.stop(true);
}

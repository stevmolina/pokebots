// A stand-in for OpenBot's Keeper Commander bridge (`openbot_keeper.py`) for `keeper-driver-e2e.ts`. It
// speaks the same line protocol and acts as Keeper does: a master password, a two-step code, a device
// approval, and a clone code that changes at each sign-in. It needs no Keeper account and no network.
//
// The driver gives the bridge a clean environment, so the test names two paths as arguments: the state
// folder, with the files `approved` (the user approved the device), `expired` (Keeper ended the
// persistent login) and `clone` (the clone code that Keeper accepts next), and the log, where each
// request is appended without its secrets.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";

const STATE = process.argv[2] ?? "";
const LOG = process.argv[3] ?? "";
export const FAKE_KEEPER_EMAIL = "ada@example.com";
export const FAKE_KEEPER_PASSWORD = "correct horse battery staple";
export const FAKE_KEEPER_CODE = "424242";
export const FAKE_KEEPER_EMAIL_CODE = "737373";
export const FAKE_KEEPER_LOGIN_PASSWORD = "e2e-Example-Login-Password!";
export const FAKE_KEEPER_UID = "AbCdEfGhIjKlMnOpQrStUv";

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();

async function readLine(): Promise<DynamicRecord | null> {
  const next = await lines.next();
  if (next.done) return null;
  const value = JSON.parse(next.value);
  return isDynamicRecord(value) ? value : null;
}

function send(message: DynamicRecord): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function log(entry: DynamicRecord): void {
  if (LOG) appendFileSync(LOG, `${JSON.stringify({ ...entry, argv: process.argv.slice(2), pid: process.pid })}\n`);
}

function nextClone(): string {
  const clone = `clone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(STATE, "clone"), clone);
  return clone;
}

function config(clone: string): DynamicRecord {
  return {
    config_storage: "file",
    server: "keepersecurity.com",
    user: FAKE_KEEPER_EMAIL,
    device_token: "fake-device-token-value",
    private_key: "fake-device-private-key",
    clone_code: clone,
  };
}

async function login(request: DynamicRecord): Promise<void> {
  const passwordOk = request.email === FAKE_KEEPER_EMAIL && request.password === FAKE_KEEPER_PASSWORD;
  log({ op: "login", passwordOk });
  if (!passwordOk) return send({ event: "error", code: "password", config: null });
  let error: string | null = null;
  for (;;) {
    send({ event: "step", step: "two-factor", error });
    const answer = await readLine();
    if (!answer) return;
    if (answer.code === FAKE_KEEPER_CODE) break;
    error = "code";
  }
  error = null;
  for (;;) {
    send({ event: "step", step: "device-approval", error });
    const answer = await readLine();
    if (!answer) return;
    if (answer.code === FAKE_KEEPER_EMAIL_CODE) break;
    if (answer.code === "" && existsSync(join(STATE, "approved"))) break;
    error = answer.code === "" ? "pending" : "code";
  }
  send({ event: "step", step: "setup", error: null });
  send({ event: "done", config: config(nextClone()), folder: "Shared with OpenBot", loginCount: 1 });
}

/** A stored session works only with the clone code of the last sign-in, as at Keeper. */
function stored(request: DynamicRecord): DynamicRecord | null {
  const sent = isDynamicRecord(request.config) ? request.config.clone_code : null;
  const expected = existsSync(join(STATE, "clone")) ? readFileSync(join(STATE, "clone"), "utf8") : null;
  const ok = !existsSync(join(STATE, "expired")) && sent === expected;
  log({ op: request.op, cloneOk: sent === expected, uid: request.uid ?? null, kind: request.kind ?? null });
  if (!ok) {
    send({ event: "error", code: "expired", config: isDynamicRecord(request.config) ? request.config : null });
    return null;
  }
  return config(nextClone());
}

async function main(): Promise<void> {
  const request = await readLine();
  if (!request) return;
  if (request.op === "login") return login(request);
  const next = stored(request);
  if (!next) return;
  if (request.op === "list") {
    send({
      event: "done",
      config: next,
      folder: "Shared with OpenBot",
      logins: [
        {
          uid: FAKE_KEEPER_UID,
          title: "Example",
          username: "ada",
          urls: ["https://example.com/login"],
          hasTotp: true,
          revision: 7,
        },
        {
          uid: "bad uid!",
          title: "Not a Keeper uid",
          username: null,
          urls: ["https://example.com"],
          hasTotp: false,
          revision: 1,
        },
      ],
    });
  } else if (request.op === "secret") {
    const value =
      request.uid !== FAKE_KEEPER_UID ? null : request.kind === "totp" ? "123456" : FAKE_KEEPER_LOGIN_PASSWORD;
    send({ event: "done", config: next, value });
  } else if (request.op === "logout") {
    send({ event: "done", config: null });
  } else {
    send({ event: "error", code: "failed", config: next });
  }
}

if (import.meta.main) {
  await main();
  // The driver keeps stdin open, as for the real bridge, which exits after its last line.
  await new Promise<void>((resolve) => process.stdout.write("", () => resolve()));
  process.exit(0);
}

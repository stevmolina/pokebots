// The Keeper driver of the password-manager engine, end to end, over a fake Keeper Commander bridge
// (`keeper-fakes/fake-commander.ts`) that the driver starts as a real child process. No Keeper
// account and no network. Cases:
// 1. A wrong master password fails with the password message.
// 2. A sign-in asks for a two-step code (a wrong code asks again), then a device approval (Continue
//    before the approval says so), then connects. The master password reaches the bridge on stdin
//    only, never in an argument, and the stored file has no secret in clear text.
// 3. The browser sees only the logins of the site, without passwords; the fill reads the password
//    and the one-time code. Each call stores the new clone code, so many calls in a row work, also
//    when a call fails after its sign-in. A login whose website changed is not filled on its old site.
// 4. A restart reads the stored connection, and a stopped sign-in leaves nothing.
// 5. Keeper ends the session: the status says expired, also after a failed new sign-in. Disconnect
//    signs out and removes the files. A cancel removes the killed bridge's temporary config.
// 6. The values that the driver registers are redacted in log text.
// `bun run test:keeper-driver`. Writes .openbot-build/keeper-driver-e2e/report.json.
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PasswordManagerStatus } from "@pokebots/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@pokebots/contracts/runtime-values";
import { sourceText } from "@pokebots/i18n/source";
import { redactSecrets } from "@pokebots/logging";
import { Effect, Schema } from "effect";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { EncryptedRecordStore } from "../src/main/password-managers/encrypted-record-store";
import { KeeperDriver, keeperRecordSchema } from "../src/main/password-managers/keeper-driver";
import { PasswordManagersService } from "../src/main/password-managers/password-managers-service";
import {
  FAKE_KEEPER_CODE,
  FAKE_KEEPER_EMAIL,
  FAKE_KEEPER_LOGIN_PASSWORD,
  FAKE_KEEPER_PASSWORD,
  FAKE_KEEPER_UID,
} from "./keeper-fakes/fake-commander";

const OUT = resolve(import.meta.dirname, "../.openbot-build/keeper-driver-e2e");
const FAKE = resolve(import.meta.dirname, "keeper-fakes/fake-commander.ts");
const WAIT_MS = 20_000;

interface Report {
  passed: boolean;
  checks: string[];
  requests?: unknown[];
  error?: string;
}

const report: Report = { passed: false, checks: [] };
const root = await mkdtemp(join(tmpdir(), "openbot-keeper-driver-e2e-"));
const state = join(root, "keeper-state");
const logPath = join(root, "requests.jsonl");
const storePath = join(root, "openbot-keeper-connector-v1.json");
const dataDirectory = join(root, "keeper-host");
const drivers: KeeperDriver[] = [];

/** Stands in for the operating system's encryption: reversible, and never clear text. */
const cipher = {
  encrypt: (value: string) => Buffer.from([...Buffer.from(value, "utf8")].map((byte) => byte ^ 0x5a)),
  decrypt: (value: Buffer) => Buffer.from([...value].map((byte) => byte ^ 0x5a)).toString("utf8"),
};

function makeDriver(): KeeperDriver {
  const driver = new KeeperDriver({
    store: new EncryptedRecordStore({
      path: storePath,
      cipher,
      decode: Schema.decodeUnknownSync(keeperRecordSchema),
      unreadable: sourceText("error.connector.keeperFileUnreadable"),
    }),
    dataDirectory,
    // As the installer answers: the command and the bridge, which the driver starts with the request on stdin.
    installCli: () => Effect.succeed({ command: process.execPath, args: [FAKE, state, logPath] }),
  });
  drivers.push(driver);
  return driver;
}

function pass(name: string): void {
  report.checks.push(name);
}

async function waitFor(
  driver: KeeperDriver,
  label: string,
  check: (status: PasswordManagerStatus) => boolean,
): Promise<PasswordManagerStatus> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const status = driver.status();
    if (check(status)) return status;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(status)}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

async function requests(): Promise<DynamicRecord[]> {
  const text = await readFile(logPath, "utf8").catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const entry = JSON.parse(line);
      return isDynamicRecord(entry) ? [entry] : [];
    });
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

try {
  await mkdir(state, { recursive: true });
  const driver = makeDriver();
  const engine = new PasswordManagersService([driver]);
  await runCauseEffect(engine.load());
  assert.deepEqual(engine.list(), [
    {
      manager: "keeper",
      state: "disconnected",
      step: null,
      methods: ["account"],
      signInUrl: null,
      vaultNames: [],
      loginCount: null,
      expiresAt: null,
      error: null,
      errorCode: null,
    },
  ]);
  assert.equal(engine.refusal("keeper", { kind: "browser" }), sourceText("error.connector.passwordManagerMethod"));
  assert.equal(engine.refusal("keeper", { kind: "code", code: "1" }), null);
  pass("Keeper lists the account method only, and the engine refuses a browser sign-in");

  // 1. A wrong master password.
  await runCauseEffect(
    engine.connect({ manager: "keeper", method: { kind: "account", email: FAKE_KEEPER_EMAIL, password: "wrong" } }),
  );
  const wrong = await waitFor(driver, "the password failure", (status) => status.state === "failed");
  assert.equal(wrong.error, sourceText("error.connector.keeperPassword"));
  pass("a wrong master password fails with the password message");

  // 2. Two-step code, then device approval.
  const started = await runCauseEffect(
    engine.connect({
      manager: "keeper",
      method: { kind: "account", email: ` ${FAKE_KEEPER_EMAIL} `, password: FAKE_KEEPER_PASSWORD },
    }),
  );
  assert.equal(started.state, "signing-in");
  await waitFor(driver, "the two-step code", (status) => status.step === "two-factor" && status.error === null);
  await runCauseEffect(engine.connect({ manager: "keeper", method: { kind: "code", code: "000000" } }));
  const wrongCode = await waitFor(driver, "the code failure", (status) => status.errorCode === "code");
  assert.equal(wrongCode.step, "two-factor");
  assert.equal(wrongCode.error, sourceText("error.connector.keeperCode"));
  await runCauseEffect(engine.connect({ manager: "keeper", method: { kind: "code", code: FAKE_KEEPER_CODE } }));
  await waitFor(driver, "the device approval", (status) => status.step === "device-approval");
  await runCauseEffect(engine.connect({ manager: "keeper", method: { kind: "code", code: "" } }));
  const pending = await waitFor(
    driver,
    "the not approved message",
    (status) => status.step === "device-approval" && status.error !== null,
  );
  assert.equal(pending.error, sourceText("error.connector.keeperNotApproved"));
  assert.equal(pending.errorCode, null);
  await writeFile(join(state, "approved"), "");
  await runCauseEffect(engine.connect({ manager: "keeper", method: { kind: "code", code: "" } }));
  const connected = await waitFor(driver, "the connection", (status) => status.state === "connected");
  assert.deepEqual(connected.vaultNames, ["Shared with OpenBot"]);
  const counted = await waitFor(driver, "the login count", (status) => status.loginCount !== null);
  assert.equal(counted.loginCount, 1, "The login with an id that is not a Keeper uid is left out.");
  pass("a sign-in asks for a code again after a wrong code, waits for the device approval, then connects");

  const logged = await requests();
  const stored = await readFile(storePath, "utf8");
  for (const secret of [FAKE_KEEPER_PASSWORD, FAKE_KEEPER_CODE, "fake-device-private-key", "clone-"]) {
    assert.ok(!stored.includes(secret), "The stored file has no secret in clear text.");
    assert.ok(!logged.some((entry) => JSON.stringify(entry.argv).includes(secret)), "No argument holds a secret.");
  }
  assert.ok(logged.some((entry) => entry.op === "login" && entry.passwordOk === true));
  assert.equal(
    await runCauseEffect(engine.connect({ manager: "keeper", method: { kind: "code", code: "1" } })).catch(
      (error: unknown) => (error instanceof Error ? error.message : ""),
    ),
    sourceText("error.connector.keeperCodeNotAsked"),
  );
  pass("the master password reaches the bridge on stdin only, and the stored file is encrypted");

  // 3. Logins, fill, and the clone code that changes at each call.
  const [route] = engine.routes();
  assert.ok(route?.prefix === "keeper:" && route.name === "Keeper");
  const logins = await runCauseEffect(driver.loginsFor("https://www.example.com"));
  assert.deepEqual(logins, [{ id: FAKE_KEEPER_UID, title: "Example", username: "ada", hasOneTimePassword: true }]);
  assert.deepEqual(await runCauseEffect(driver.loginsFor("https://example.org")), []);
  assert.equal(
    await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://example.com", "password")),
    FAKE_KEEPER_LOGIN_PASSWORD,
  );
  assert.equal(await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://example.com", "totp")), "123456");
  assert.equal(await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://evil.example", "password")), null);
  assert.equal(await runCauseEffect(driver.secretFor("bad uid!", "https://example.com", "password")), null);
  for (let call = 0; call < 3; call += 1)
    assert.ok(await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://example.com", "password")));
  assert.ok((await requests()).every((entry) => entry.op === "login" || entry.cloneOk === true));
  pass("the browser sees the site's logins without passwords, the fill reads them, and each new clone code is kept");

  // The login's website changed in Keeper after the list was read: the old page gets nothing.
  await writeFile(join(state, "moved"), "");
  assert.equal(await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://example.com", "password")), null);
  await rm(join(state, "moved"));
  pass("a login whose website changed in Keeper is not filled on its old site");

  // A call that signs in and then fails still keeps the new clone code, so the next call works.
  await writeFile(join(state, "sync-fail"), "");
  await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://example.com", "password")).catch(() => null);
  await rm(join(state, "sync-fail"));
  assert.equal(
    await runCauseEffect(driver.secretFor(FAKE_KEEPER_UID, "https://example.com", "password")),
    FAKE_KEEPER_LOGIN_PASSWORD,
  );
  assert.ok((await requests()).every((entry) => entry.op === "login" || entry.cloneOk === true));
  pass("a call that fails after its sign-in keeps the new clone code");

  // 6. Redaction of what the driver registered.
  const line = `password=${FAKE_KEEPER_LOGIN_PASSWORD} master=${FAKE_KEEPER_PASSWORD} code=${FAKE_KEEPER_CODE}`;
  const redacted = redactSecrets(line);
  for (const secret of [FAKE_KEEPER_LOGIN_PASSWORD, FAKE_KEEPER_PASSWORD, FAKE_KEEPER_CODE])
    assert.ok(!redacted.includes(secret), "A registered secret is redacted.");
  pass("the master password, the code and a filled password are redacted in log text");

  // 4. A restart, and a stopped sign-in.
  await runCauseEffect(driver.dispose());
  const restarted = makeDriver();
  await runCauseEffect(restarted.load());
  assert.equal(restarted.status().state, "connected");
  assert.equal((await runCauseEffect(restarted.loginsFor("https://example.com")))?.length, 1);
  pass("a restart reads the stored connection and signs in with Commander's config alone");

  // 5. Keeper ends the session, then disconnect.
  await writeFile(join(state, "expired"), "");
  await runCauseEffect(restarted.secretFor(FAKE_KEEPER_UID, "https://example.com", "password")).catch(() => null);
  const expired = await waitFor(restarted, "the expired session", (status) => status.errorCode === "expired");
  assert.equal(expired.state, "failed");
  assert.equal(expired.error, sourceText("error.connector.keeperExpired"));
  assert.equal(await runCauseEffect(restarted.loginsFor("https://example.com")), null);
  // A new sign-in with a wrong password does not bring the ended session back.
  await runCauseEffect(restarted.connect({ kind: "account", email: FAKE_KEEPER_EMAIL, password: "wrong" }));
  const retried = await waitFor(restarted, "the failed sign-in", (status) => status.state !== "signing-in");
  assert.equal(retried.state, "failed");
  assert.equal(restarted.connected(), false);
  assert.equal(await runCauseEffect(restarted.loginsFor("https://example.com")), null);
  pass("an ended session shows as expired, the browser stops reading, and a failed new sign-in keeps it ended");
  await rm(join(state, "expired"));
  const before = (await requests()).length;
  await runCauseEffect(restarted.disconnect());
  assert.equal(restarted.status().state, "disconnected");
  assert.ok((await requests()).slice(before).some((entry) => entry.op === "logout"));
  assert.ok(!(await exists(storePath)) && !(await exists(dataDirectory)));
  pass("disconnect signs Commander out and removes the stored config and Commander's files");

  const cancelEngine = new PasswordManagersService([restarted]);
  await runCauseEffect(
    cancelEngine.connect({
      manager: "keeper",
      method: { kind: "account", email: FAKE_KEEPER_EMAIL, password: FAKE_KEEPER_PASSWORD },
    }),
  );
  await waitFor(restarted, "the two-step code", (status) => status.step === "two-factor");
  assert.ok(await exists(join(dataDirectory, "tmp", "keeper-fake", "config.json")));
  const cancelled = await runCauseEffect(cancelEngine.cancel("keeper"));
  assert.equal(cancelled.state, "disconnected");
  assert.ok(!(await exists(storePath)));
  const deadline = Date.now() + WAIT_MS;
  while ((await exists(join(dataDirectory, "tmp"))) && Date.now() < deadline)
    await new Promise((done) => setTimeout(done, 20));
  assert.ok(!(await exists(join(dataDirectory, "tmp"))), "The killed bridge's temporary config is removed.");
  pass("cancel stops a sign-in that waits for a code, nothing is stored, and the temporary config is removed");

  report.requests = await requests();
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  for (const driver of drivers) await runCauseEffect(driver.dispose()).catch(() => undefined);
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
  process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${join(OUT, "report.json")}\n`);
  if (report.error) process.stdout.write(`${report.error}\n`);
}

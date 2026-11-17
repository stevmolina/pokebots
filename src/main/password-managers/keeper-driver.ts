// Keeper as a driver of the password-manager engine. OpenBot runs Keeper Commander, Keeper's own CLI,
// as a separate program through a small Python bridge (`keeper-helper-script.ts`); it does not include
// Commander's code.
//
// An `account` connection gives the account's email and master password to Commander once, on stdin.
// Commander signs in, asks for a two-step code or a device approval when Keeper wants one, and turns
// on its persistent login for this device. The host then keeps only Commander's config (the device
// key and the session's clone code), encrypted by the operating system. The master password is not
// kept. Later calls sign in with that config alone. The browser reads only the logins in the folder
// "Shared with OpenBot", which the connection makes when it is not there.

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  disconnectedPasswordManager,
  type PasswordManagerConnectMethod,
  type PasswordManagerErrorCode,
  type PasswordManagerStatus,
  type PasswordManagerStep,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { isFixedSourceText, sourceText } from "@openbot/i18n/source";
import { createOpenBotLogger, registerSecretValue, toLogValue } from "@openbot/logging";
import { Effect, Exit, Result, Schema, Scope, Semaphore } from "effect";
import { causeHelpers } from "../../backend/effect-boundary";
import {
  PASSWORD_MANAGER_BRANDS,
  type PasswordVault,
  PasswordVaultError,
  type VaultLogin,
  websiteMatchesOrigin,
} from "../../backend/password-vault";
import { type PasswordManagerDriver, PasswordManagerError, passwordManagerFailure } from "./driver";
import type { EncryptedRecordStore } from "./encrypted-record-store";
import type { KeeperCommander } from "./keeper-commander-installer";

const logger = createOpenBotLogger("keeper");
const { io } = causeHelpers(PasswordManagerError);

/** The folder that the browser reads. The user moves the logins that OpenBot may use into it. */
const KEEPER_SHARED_FOLDER = "Shared with OpenBot";
const COMMAND_MS = 2 * 60_000;
/** The user can take some time to find a code or to approve the device. */
const SIGN_IN_MS = 15 * 60_000;
const SIGN_OUT_MS = 20_000;
const INDEX_MS = 10 * 60_000;
/** Each call signs in again, which keeps the persistent login of this device from timing out. */
const KEEP_ALIVE_MS = 12 * 60 * 60_000;
const MAX_LOGINS = 500;
const MAX_LINE_CHARS = 1024 * 1024;
const MAX_OUTPUT_CHARS = 16 * 1024 * 1024;
const KEEPER_UID = /^[A-Za-z0-9_-]{16,64}$/u;
/** The fields of Commander's config that sign in this device. Each is registered as a secret. */
const CONFIG_SECRETS = ["clone_code", "device_token", "private_key", "session_token", "password"] as const;

export const keeperRecordSchema = Schema.Struct({
  /** Commander's config as JSON text. It goes to the bridge only, on stdin. */
  config: Schema.String,
  email: Schema.String,
  connectedAt: Schema.Number,
});
export type KeeperRecord = typeof keeperRecordSchema.Type;

/** Commander's config file as JSON. The bridge reads and writes it; OpenBot only stores it. */
export type KeeperConfig = DynamicRecord;

/** One request to the bridge, the first line of its stdin. */
export type KeeperHelperRequest =
  | { op: "login"; config: null; email: string; password: string }
  | { op: "list"; config: KeeperConfig }
  | { op: "secret"; config: KeeperConfig; uid: string; kind: "password" | "totp" }
  | { op: "logout"; config: KeeperConfig };

/** One line that the bridge writes. Unknown fields are ignored. */
export type KeeperHelperEvent =
  | { event: "step"; step: "two-factor" | "device-approval" | "setup"; error: "code" | "pending" | null }
  | { event: "done"; config: KeeperConfig | null; logins?: unknown; value?: unknown; urls?: unknown }
  | { event: "error"; code: string; config: KeeperConfig | null };

/** The last line of a call. */
export type KeeperHelperResult = Exclude<KeeperHelperEvent, { event: "step" }>;

export interface KeeperHelperCall {
  /** Ends with the last `done` or `error` line, or with null when the bridge stopped without one. */
  result: Promise<KeeperHelperResult | null>;
  /** Sends one answer line to the bridge. */
  answer(code: string): void;
}

export type KeeperHelperRunner = (
  commander: KeeperCommander,
  request: KeeperHelperRequest,
  options: {
    env: NodeJS.ProcessEnv;
    signal: AbortSignal;
    timeoutMs: number;
    onStep?: (event: Extract<KeeperHelperEvent, { event: "step" }>) => void;
  },
) => KeeperHelperCall;

function parseLine(line: string): KeeperHelperEvent | null {
  try {
    return parseEvent(JSON.parse(line));
  } catch {
    return null;
  }
}

function parseEvent(value: unknown): KeeperHelperEvent | null {
  if (!isDynamicRecord(value) || typeof value.event !== "string") return null;
  const config = isDynamicRecord(value.config) ? value.config : null;
  if (value.event === "step") {
    const step = value.step;
    if (step !== "two-factor" && step !== "device-approval" && step !== "setup") return null;
    const error = value.error === "code" || value.error === "pending" ? value.error : null;
    return { event: "step", step, error };
  }
  if (value.event === "done")
    return { event: "done", config, logins: value.logins, value: value.value, urls: value.urls };
  if (value.event === "error" && typeof value.code === "string") return { event: "error", code: value.code, config };
  return null;
}

/**
 * Runs the bridge with no shell and no inherited credentials. Secrets go on stdin only. The output is
 * never logged: it holds Commander's config and, for `secret`, a password. stderr is dropped.
 */
const runKeeperHelper: KeeperHelperRunner = (commander, request, options) => {
  const env: NodeJS.ProcessEnv = { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", KEEPER_CONFIG_STORAGE: "file" };
  for (const name of ["SystemRoot", "PATH", "LANG", "LC_ALL"]) if (process.env[name]) env[name] = process.env[name];
  Object.assign(env, options.env);
  const child = spawn(commander.command, [...commander.args], {
    env,
    signal: options.signal,
    timeout: options.timeoutMs,
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  child.stdin.on("error", () => undefined);
  const result = new Promise<KeeperHelperResult | null>((resolve) => {
    let buffer = "";
    let size = 0;
    let last: KeeperHelperResult | null = null;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      size += text.length;
      if (size > MAX_OUTPUT_CHARS) {
        child.kill();
        return;
      }
      buffer += text;
      let end = buffer.indexOf("\n");
      while (end >= 0) {
        const event = parseLine(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (event?.event === "step") options.onStep?.(event);
        else if (event) last = event;
        end = buffer.indexOf("\n");
      }
      if (buffer.length > MAX_LINE_CHARS) child.kill();
    });
    child.once("error", () => resolve(null));
    child.once("close", () => resolve(last));
  });
  child.stdin.write(`${JSON.stringify(request)}\n`);
  return {
    result,
    answer: (code) => {
      if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify({ code })}\n`);
    },
  };
};

/** A failure that the status shows, with its `errorCode`. */
class KeeperFailure extends Error {
  readonly code: PasswordManagerErrorCode | null;
  constructor(message: string, code: PasswordManagerErrorCode | null = null) {
    super(message);
    this.code = code;
  }
}

function fail(message: string, code: PasswordManagerErrorCode | null = null): PasswordManagerError {
  return new PasswordManagerError({ cause: new KeeperFailure(message, code) });
}

/** The failure of a bridge error code. */
function bridgeFailure(code: string): PasswordManagerError {
  switch (code) {
    case "password":
      return fail(sourceText("error.connector.keeperPassword"));
    case "plan":
      return fail(sourceText("error.connector.keeperPlan"), "plan");
    case "expired":
      return fail(sourceText("error.connector.keeperExpired"), "expired");
    case "sso":
      return fail(sourceText("error.connector.keeperSso"));
    case "two-factor-unsupported":
      return fail(sourceText("error.connector.keeperTwoFactorUnsupported"));
    case "locked":
      return fail(sourceText("error.connector.keeperLocked"));
    case "throttled":
      return fail(sourceText("error.connector.keeperThrottled"));
    case "persistent-login":
      return fail(sourceText("error.connector.keeperPersistentLogin"));
    default:
      return fail(sourceText("error.connector.keeperFailed"));
  }
}

function failureOf(cause: unknown): KeeperFailure {
  if (cause instanceof KeeperFailure) return cause;
  return new KeeperFailure(
    cause instanceof Error && isFixedSourceText(cause.message)
      ? cause.message
      : sourceText("error.connector.keeperFailed"),
  );
}

/** The stored config, or a thrown error for a record that is not one. */
function parseConfig(text: string): KeeperConfig {
  const config = JSON.parse(text);
  if (!isDynamicRecord(config)) throw new Error(sourceText("error.connector.keeperFailed"));
  return config;
}

function registerConfig(config: KeeperConfig | null): void {
  if (!config) return;
  for (const name of CONFIG_SECRETS) {
    const value = config[name];
    if (typeof value === "string" && value) registerSecretValue(value);
  }
}

function registerRecord(record: KeeperRecord): void {
  registerSecretValue(record.config);
  try {
    registerConfig(parseConfig(record.config));
  } catch {
    /* A record that is not JSON fails at its first call. */
  }
}

const indexedLoginSchema = Schema.Struct({
  uid: Schema.String,
  title: Schema.String,
  username: Schema.NullOr(Schema.String),
  urls: Schema.Array(Schema.String),
  hasTotp: Schema.Boolean,
  revision: Schema.Number,
});
type IndexedLogin = typeof indexedLoginSchema.Type;
const listSchema = Schema.Struct({ logins: Schema.Array(indexedLoginSchema) });

function matchesOrigin(login: IndexedLogin, origin: string): boolean {
  // Keeper fills a login on the whole site of its website: `example.com` also fills on `app.example.com`.
  return login.urls.some((url) => websiteMatchesOrigin({ url, autofill: "anywhere" }, origin));
}

interface Attempt {
  abort: AbortController;
  step: PasswordManagerStep;
  /** Set while the bridge waits for a code. */
  answer: ((code: string) => void) | null;
}

export interface KeeperDriverOptions {
  store: EncryptedRecordStore<KeeperRecord>;
  /** Commander's own files on this host (its home and its temporary config). Outside every root that an agent can write. */
  dataDirectory: string;
  /** Installs the pinned Commander, or null when OpenBot has no install for this computer. */
  installCli: ((signal: AbortSignal) => Effect.Effect<KeeperCommander, PasswordManagerError>) | null;
  runHelper?: KeeperHelperRunner;
  now?: () => number;
}

export class KeeperDriver implements PasswordManagerDriver, PasswordVault {
  readonly id = "keeper" as const;
  /** Released: a login id of the browser is `keeper:<record uid>`. */
  readonly prefix = "keeper:";
  readonly brand = PASSWORD_MANAGER_BRANDS.keeper;
  readonly signInHosts: readonly string[] = [];
  readonly vault: PasswordVault = this;
  readonly #options: KeeperDriverOptions;
  readonly #run: KeeperHelperRunner;
  readonly #now: () => number;
  readonly #listeners = new Set<(status: PasswordManagerStatus) => void>();
  readonly #running = new Set<Promise<unknown>>();
  /** Owns the sign-in and the index reads that run after an answer. Dispose stops them. */
  readonly #scope = Scope.makeUnsafe();
  /** One Commander call at a time: each sign-in changes the config's clone code. */
  readonly #session = Semaphore.makeUnsafe(1);
  readonly #indexing = Semaphore.makeUnsafe(1);
  #attempt: Attempt | null = null;
  /** Stops the calls of the stored connection. Replaced at each disconnect. */
  #connection = new AbortController();
  #commander: KeeperCommander | null = null;
  #index: { readAt: number; logins: Map<string, IndexedLogin> } | null = null;
  #error: string | null = null;
  #errorCode: PasswordManagerErrorCode | null = null;
  /**
   * Why Keeper ended the stored session (`expired` or `plan`). It stays until a sign-in succeeds or a
   * disconnect, so a failed new sign-in does not show the old session as connected.
   */
  #ended: KeeperFailure | null = null;
  #keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(options: KeeperDriverOptions) {
    this.#options = options;
    this.#run = options.runHelper ?? runKeeperHelper;
    this.#now = options.now ?? Date.now;
  }

  /** Reads the stored connection, then reads the logins in the background. */
  readonly load = Effect.fn("Keeper.load")(function* (this: KeeperDriver) {
    const error = yield* this.#options.store.load();
    if (error) logger.warn("The Keeper connection file could not be read.", { cause: toLogValue(error) });
    // A config that a quit left in the temporary folder is not used again.
    yield* io(() => rm(join(this.#options.dataDirectory, "tmp"), { recursive: true, force: true })).pipe(Effect.ignore);
    const record = this.#options.store.read();
    if (!record) return;
    registerRecord(record);
    this.#startKeepAlive();
    yield* this.#refreshInBackground();
  }).bind(this);

  status(): PasswordManagerStatus {
    const base = disconnectedPasswordManager("keeper", ["account"]);
    const failure = { error: this.#error, errorCode: this.#errorCode };
    const attempt = this.#attempt;
    if (attempt) return { ...base, ...failure, state: "signing-in", step: attempt.step };
    if (this.connected()) {
      return {
        ...base,
        state: "connected",
        vaultNames: [KEEPER_SHARED_FOLDER],
        loginCount: this.#index?.logins.size ?? null,
      };
    }
    if (this.#error) return { ...base, ...failure, state: "failed" };
    const ended = this.#ended;
    return ended ? { ...base, state: "failed", error: ended.message, errorCode: ended.code } : base;
  }

  onChanged(listener: (status: PasswordManagerStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  connected(): boolean {
    return !this.#attempt && !this.#ended && this.#options.store.read() !== null;
  }

  readonly connect = Effect.fn("Keeper.connect")(function* (
    this: KeeperDriver,
    method: PasswordManagerConnectMethod,
  ): Effect.fn.Return<PasswordManagerStatus, PasswordManagerError> {
    if (method.kind === "code") {
      if (method.code) registerSecretValue(method.code, { allowShort: true });
      const attempt = this.#attempt;
      const answer = attempt?.answer;
      if (!attempt || !answer) return yield* passwordManagerFailure(sourceText("error.connector.keeperCodeNotAsked"));
      attempt.answer = null;
      attempt.step = "setup";
      this.#error = null;
      this.#errorCode = null;
      this.#emit();
      answer(method.code.trim());
      return this.status();
    }
    if (method.kind !== "account")
      return yield* passwordManagerFailure(sourceText("error.connector.passwordManagerMethod"));
    registerSecretValue(method.password, { allowShort: true });
    const email = method.email.trim();
    const password = method.password;
    yield* this.#start((attempt) => this.#signIn(attempt, email, password));
    return this.status();
  }).bind(this);

  readonly cancel = Effect.fn("Keeper.cancel")(function* (this: KeeperDriver) {
    yield* Effect.sync(() => {
      const attempt = this.#attempt;
      if (!attempt) return;
      attempt.abort.abort();
      this.#attempt = null;
      this.#error = null;
      this.#errorCode = null;
      this.#emit();
    });
    return this.status();
  }).bind(this);

  /**
   * Signs Commander out of Keeper, which ends this device's persistent login, then removes the stored
   * config and Commander's files on this host. The device stays in the Keeper account's device list;
   * the user can remove it there.
   */
  readonly disconnect = Effect.fn("Keeper.disconnect")(function* (
    this: KeeperDriver,
  ): Effect.fn.Return<PasswordManagerStatus, PasswordManagerError> {
    const record = this.#options.store.read();
    yield* this.#stop();
    yield* Effect.promise(() => Promise.allSettled([...this.#running]));
    if (record) {
      yield* this.#session
        .withPermit(
          Effect.gen({ self: this }, function* () {
            const signal = AbortSignal.timeout(SIGN_OUT_MS);
            const commander = yield* this.#cli(signal);
            const config = yield* Effect.try({
              try: () => parseConfig(record.config),
              catch: () => fail(sourceText("error.connector.keeperFailed")),
            });
            yield* this.#call(commander, { op: "logout", config }, { signal, timeoutMs: SIGN_OUT_MS });
          }),
        )
        .pipe(Effect.ignore);
    }
    yield* this.#options.store.clear();
    yield* io(() => rm(this.#options.dataDirectory, { recursive: true, force: true }));
    this.#ended = null;
    this.#error = null;
    this.#errorCode = null;
    this.#emit();
    return this.status();
  }).bind(this);

  /** Stops the sign-in and Commander. The stored connection stays. */
  readonly dispose = Effect.fn("Keeper.dispose")(function* (this: KeeperDriver) {
    this.#attempt?.abort.abort();
    this.#attempt = null;
    this.#connection.abort();
    this.#stopKeepAlive();
    yield* Scope.close(this.#scope, Exit.void);
    yield* Effect.promise(() => Promise.allSettled([...this.#running]));
  }).bind(this);

  readonly loginsFor = Effect.fn("Keeper.loginsFor")(function* (
    this: KeeperDriver,
    origin: string,
  ): Effect.fn.Return<VaultLogin[] | null, PasswordVaultError> {
    if (!this.connected()) return null;
    const logins = yield* this.#logins().pipe(Effect.mapError(({ cause }) => new PasswordVaultError({ cause })));
    return [...logins.values()]
      .filter((login) => matchesOrigin(login, origin))
      .map((login) => ({
        id: login.uid,
        title: login.title,
        username: login.username,
        hasOneTimePassword: login.hasTotp,
      }));
  }).bind(this);

  readonly secretFor = Effect.fn("Keeper.secretFor")(function* (
    this: KeeperDriver,
    id: string,
    origin: string,
    kind: "password" | "totp",
  ): Effect.fn.Return<string | null, PasswordVaultError> {
    if (!this.connected() || !KEEPER_UID.test(id)) return null;
    const value = yield* Effect.gen({ self: this }, function* () {
      const login = (yield* this.#logins()).get(id);
      if (!login || !matchesOrigin(login, origin) || (kind === "totp" && !login.hasTotp)) return null;
      const read = yield* Effect.result(this.#storedCall({ op: "secret", uid: id, kind }));
      if (Result.isSuccess(read)) {
        const secret = read.success.value;
        // The list can be 10 minutes old: the login's websites now must still match the page.
        const urls = read.success.urls;
        const current = Array.isArray(urls) ? urls.filter((url) => typeof url === "string") : [];
        if (typeof secret === "string" && secret && matchesOrigin({ ...login, urls: current }, origin)) return secret;
        if (typeof secret === "string" && secret) {
          yield* this.#logins(true).pipe(Effect.ignore);
          return null;
        }
      }
      // The list can be 10 minutes old. A login that left the shared folder gives null, and the fill
      // tells the agent to list the logins again. A login that is still there keeps its failure.
      if ((yield* this.#logins(true)).has(id) && Result.isFailure(read)) return yield* read.failure;
      return null;
    }).pipe(Effect.mapError(({ cause }) => new PasswordVaultError({ cause })));
    if (!value) return null;
    registerSecretValue(value, { allowShort: true });
    return value;
  }).bind(this);

  /** Starts a sign-in that answers at once; `work` continues in the driver's scope. */
  #start(work: (attempt: Attempt) => Effect.Effect<void, PasswordManagerError>): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      yield* this.#stop();
      const attempt: Attempt = { abort: new AbortController(), step: "setup", answer: null };
      this.#attempt = attempt;
      this.#error = null;
      this.#errorCode = null;
      this.#emit();
      yield* Effect.forkIn(
        work(attempt).pipe(
          Effect.catch(({ cause }) =>
            Effect.sync(() => {
              if (this.#attempt !== attempt) return;
              logger.warn("Unable to connect Keeper", { cause: toLogValue(cause) });
              this.#attempt = null;
              this.#setError(failureOf(cause));
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              if (this.#attempt !== attempt) return;
              this.#attempt = null;
              this.#emit();
            }),
          ),
        ),
        this.#scope,
      );
    });
  }

  /** Commander's sign-in with the email and the master password, then the stored config. */
  #signIn(attempt: Attempt, email: string, password: string): Effect.Effect<void, PasswordManagerError> {
    const { signal } = attempt.abort;
    return this.#session
      .withPermit(
        Effect.gen({ self: this }, function* () {
          const commander = yield* this.#cli(signal);
          let answer: (code: string) => void = () => undefined;
          const call = yield* this.#spawn(
            commander,
            { op: "login", config: null, email, password },
            { signal, timeoutMs: SIGN_IN_MS },
            (event) => {
              if (this.#attempt !== attempt) return;
              attempt.step = event.step;
              if (event.step === "setup") {
                attempt.answer = null;
                this.#error = null;
                this.#errorCode = null;
              } else {
                attempt.answer = (code) => answer(code);
                this.#error =
                  event.error === "code"
                    ? sourceText("error.connector.keeperCode")
                    : event.error === "pending"
                      ? sourceText("error.connector.keeperNotApproved")
                      : null;
                this.#errorCode = event.error === "code" ? "code" : null;
              }
              this.#emit();
            },
          );
          answer = call.answer;
          const result = yield* io(() => call.result);
          registerConfig(result?.config ?? null);
          if (!result) {
            if (signal.aborted) return yield* fail(sourceText("error.connector.keeperFailed"));
            return yield* fail(sourceText("error.connector.keeperSignInTimeout"));
          }
          if (result.event === "error") return yield* bridgeFailure(result.code);
          if (result.event !== "done" || !result.config) return yield* fail(sourceText("error.connector.keeperFailed"));
          const record: KeeperRecord = {
            config: JSON.stringify(result.config),
            email: email.toLowerCase(),
            connectedAt: this.#now(),
          };
          registerRecord(record);
          const kept = yield* this.#options.store.write(record, () => this.#attempt === attempt && !signal.aborted);
          if (!kept) return yield* fail(sourceText("error.connector.keeperFailed"));
          this.#index = null;
          this.#ended = null;
          this.#attempt = null;
          this.#error = null;
          this.#errorCode = null;
          this.#emit();
          this.#startKeepAlive();
        }),
      )
      .pipe(Effect.andThen(() => this.#refreshInBackground()));
  }

  /** Stops a sign-in and the calls of the stored connection. */
  #stop(): Effect.Effect<void> {
    return Effect.sync(() => {
      this.#attempt?.abort.abort();
      this.#attempt = null;
      this.#connection.abort();
      this.#connection = new AbortController();
      this.#index = null;
      this.#stopKeepAlive();
    });
  }

  #cli(signal: AbortSignal): Effect.Effect<KeeperCommander, PasswordManagerError> {
    return Effect.suspend(() => {
      if (this.#commander) return Effect.succeed(this.#commander);
      const install = this.#options.installCli;
      if (!install) return Effect.fail(fail(sourceText("error.connector.keeperCliInstallFailed")));
      return install(signal).pipe(Effect.tap((commander) => Effect.sync(() => (this.#commander = commander))));
    });
  }

  /** Commander's home and temporary files: inside the host's data folder, never the user's own Commander. */
  #env(): Effect.Effect<NodeJS.ProcessEnv, PasswordManagerError> {
    const home = join(this.#options.dataDirectory, "home");
    const temp = join(this.#options.dataDirectory, "tmp");
    return io(async () => {
      await mkdir(home, { recursive: true, mode: 0o700 });
      await mkdir(temp, { recursive: true, mode: 0o700 });
      return { HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TMPDIR: temp, TEMP: temp, TMP: temp };
    });
  }

  #spawn(
    commander: KeeperCommander,
    request: KeeperHelperRequest,
    options: { signal: AbortSignal; timeoutMs: number },
    onStep?: (event: Extract<KeeperHelperEvent, { event: "step" }>) => void,
  ): Effect.Effect<KeeperHelperCall, PasswordManagerError> {
    return Effect.gen({ self: this }, function* () {
      const env = yield* this.#env();
      return yield* io((interrupted) => {
        const call = this.#run(commander, request, {
          env,
          signal: AbortSignal.any([options.signal, interrupted]),
          timeoutMs: options.timeoutMs,
          ...(onStep ? { onStep } : {}),
        });
        // The bridge deletes its temporary config when it ends normally. A cancel, a quit or a timeout
        // kills it first, so the config is removed here before any answer reaches a caller. Calls run
        // one at a time, so no other call uses the folder.
        const temp = join(this.#options.dataDirectory, "tmp");
        const result = call.result.finally(() => rm(temp, { recursive: true, force: true }).catch(() => undefined));
        const pending = result.finally(() => this.#running.delete(pending));
        this.#running.add(pending);
        return Promise.resolve({ result, answer: call.answer });
      });
    });
  }

  #call(
    commander: KeeperCommander,
    request: KeeperHelperRequest,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Effect.Effect<KeeperHelperResult | null, PasswordManagerError> {
    return Effect.gen({ self: this }, function* () {
      const call = yield* this.#spawn(commander, request, options);
      return yield* io(() => call.result);
    });
  }

  /**
   * Runs one request with the stored config, and stores the config that Commander wrote back: each
   * sign-in gives the device a new clone code, which the next sign-in needs.
   */
  #storedCall(
    request: { op: "list" } | { op: "secret"; uid: string; kind: "password" | "totp" },
  ): Effect.Effect<Extract<KeeperHelperResult, { event: "done" }>, PasswordManagerError> {
    return this.#session.withPermit(
      Effect.gen({ self: this }, function* () {
        const record = this.#options.store.read();
        if (!record || !this.connected()) return yield* fail(sourceText("error.connector.keeperFailed"));
        const { signal } = this.#connection;
        const commander = yield* this.#cli(signal);
        const config = yield* Effect.try({
          try: () => parseConfig(record.config),
          catch: () => fail(sourceText("error.connector.keeperFailed")),
        });
        const result = yield* this.#call(commander, { ...request, config }, { signal, timeoutMs: COMMAND_MS });
        if (result?.config) {
          registerConfig(result.config);
          const next = JSON.stringify(result.config);
          if (next !== record.config) {
            yield* this.#options.store.write(
              { ...record, config: next },
              () => this.#options.store.read()?.connectedAt === record.connectedAt && !signal.aborted,
            );
          }
        }
        if (!result) return yield* fail(sourceText("error.connector.keeperFailed"));
        if (result.event === "error") {
          const error = bridgeFailure(result.code);
          if (error.cause instanceof KeeperFailure && error.cause.code) this.#setError(error.cause);
          return yield* error;
        }
        if (result.event !== "done") return yield* fail(sourceText("error.connector.keeperFailed"));
        return result;
      }),
    );
  }

  /** The index of the shared logins, read again when it is older than 10 minutes, or at once with `refresh`. */
  #logins(refresh = false): Effect.Effect<Map<string, IndexedLogin>, PasswordManagerError> {
    return this.#indexing.withPermit(
      Effect.gen({ self: this }, function* () {
        const current = this.#index;
        if (!refresh && current && this.#now() - current.readAt < INDEX_MS) return current.logins;
        const output = yield* this.#storedCall({ op: "list" });
        const list = yield* Effect.try({
          try: () => Schema.decodeUnknownSync(listSchema)({ logins: output.logins }),
          catch: () => fail(sourceText("error.connector.keeperFailed")),
        });
        const logins = new Map<string, IndexedLogin>();
        for (const login of list.logins) {
          if (logins.size >= MAX_LOGINS) break;
          if (KEEPER_UID.test(login.uid)) logins.set(login.uid, login);
        }
        const changed = current?.logins.size !== logins.size;
        this.#index = { readAt: this.#now(), logins };
        if (this.#errorCode === null && this.#error) this.#error = null;
        if (changed) this.#emit();
        return logins;
      }),
    );
  }

  #refreshInBackground(refresh = false): Effect.Effect<void> {
    return Effect.forkIn(
      this.#logins(refresh).pipe(
        Effect.catch(({ cause }) =>
          Effect.sync(() => logger.warn("The Keeper logins could not be read.", { cause: toLogValue(cause) })),
        ),
      ),
      this.#scope,
    ).pipe(Effect.asVoid);
  }

  #startKeepAlive(): void {
    this.#stopKeepAlive();
    this.#keepAlive = setInterval(() => {
      if (this.connected()) Effect.runFork(this.#refreshInBackground(true));
    }, KEEP_ALIVE_MS);
    this.#keepAlive.unref?.();
  }

  #stopKeepAlive(): void {
    if (this.#keepAlive) clearInterval(this.#keepAlive);
    this.#keepAlive = null;
  }

  #setError(failure: KeeperFailure): void {
    if (failure.code === "expired" || failure.code === "plan") this.#ended = failure;
    this.#error = failure.message;
    this.#errorCode = failure.code;
    this.#emit();
  }

  #emit(): void {
    const status = this.status();
    for (const listener of this.#listeners) listener(status);
  }
}

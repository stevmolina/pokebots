// The Agent Computer REST API (computer.mcpbox.dev): cloud Ubuntu desktops that agents start, drive
// with shell commands, and pause. Each call uses an actor credential or a manual key. The bearer and each
// `live_view_url` are bearer credentials: both are registered for redaction before any log can see them.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { sourceText } from "@openbot/i18n/source";
import { redactSecrets, registerSecretValue } from "@openbot/logging";
import { Effect, Redacted, Schema } from "effect";
import type { IntegrationCredential } from "../integration-credential";

const AGENT_COMPUTER_API_URL = "https://computer.mcpbox.dev/api/v1";

export const AGENT_COMPUTER_CONTEXT_PATTERN = /^[a-z0-9-]{1,32}$/u;
export const AGENT_COMPUTER_BASH_TIMEOUT_MAX = 600;

/** Machine sizes: standard is 2 vCPU, large is 8 vCPU. An older API ignores the size and answers without one. */
export const AGENT_COMPUTER_SIZES = ["standard", "large"] as const;
export type AgentComputerSize = (typeof AGENT_COMPUTER_SIZES)[number];

/**
 * A failed call. `code` is the API's error code, or `NETWORK_ERROR`, `NOT_CONNECTED` and
 * `BAD_RESPONSE` for failures before or after the API answered. `message` never holds the key.
 */
export class AgentComputerFailed extends Schema.TaggedError<AgentComputerFailed>()("AgentComputerFailed", {
  code: Schema.String,
  message: Schema.String,
  status: Schema.Number,
}) {}

const machineSchema = Schema.Struct({
  id: Schema.String,
  context: Schema.String,
  size: Schema.optional(Schema.String),
  status: Schema.String,
  deadline_at: Schema.NullOr(Schema.String),
  live_view_url: Schema.NullOr(Schema.String),
  updated_at: Schema.NullOr(Schema.String),
});

const listSchema = Schema.Struct({ machines: Schema.Array(machineSchema) });

const allowanceSchema = Schema.Struct({
  seconds_remaining: Schema.NullOr(Schema.Number),
  minutes_remaining: Schema.NullOr(Schema.Number),
  resets_at: Schema.NullOr(Schema.String),
});

const startSchema = Schema.Struct({
  id: Schema.String,
  context: Schema.String,
  size: Schema.optional(Schema.String),
  size_note: Schema.optional(Schema.String),
  existing: Schema.Boolean,
  resumed: Schema.Boolean,
  other_contexts: Schema.optional(Schema.Array(Schema.String)),
  live_view_url: Schema.String,
  deadline_at: Schema.String,
  billing: Schema.optional(
    Schema.Struct({
      plan: Schema.String,
      minutes_remaining: Schema.NullOr(Schema.Number),
      seconds_remaining: Schema.optional(Schema.NullOr(Schema.Number)),
      resets_at: Schema.optional(Schema.NullOr(Schema.String)),
      rate: Schema.optional(Schema.Number),
      upgrade_url: Schema.optional(Schema.String),
      manage_url: Schema.optional(Schema.String),
    }),
  ),
  briefing: Schema.optional(Schema.Array(Schema.String)),
});

const bashSchema = Schema.Struct({
  stdout: Schema.String,
  stderr: Schema.String,
  exit_code: Schema.NullOr(Schema.Number),
  timed_out: Schema.Boolean,
});

const publishSchema = Schema.Struct({ url: Schema.String, bytes: Schema.Number, expires_at: Schema.String });

const statusSchema = Schema.Struct({ id: Schema.String, status: Schema.String });

const errorSchema = Schema.Struct({ error: Schema.Struct({ code: Schema.String, message: Schema.String }) });

interface RawResponse {
  status: number;
  contentType: string;
  body: Buffer;
}

/** The largest answer read: a 1 MiB file, or a screenshot, with room to spare. */
const RESPONSE_LIMIT = 16 * 1024 * 1024;

export interface AgentComputerApiOptions {
  /** The key, read at each call, so a connect or disconnect applies at once. Null while not connected. */
  key?: () => string | null;
  /** Bind one authorized actor to this instance. */
  credential?: IntegrationCredential<"computer">;
  /** The API root. A test points it at a local server. */
  baseUrl?: string | undefined;
}

/**
 * One call per method, each an Effect. A call is interrupted with its fiber: the request is aborted.
 * Every answer is decoded at this boundary; a link in an answer is registered for redaction.
 */
export class AgentComputerApi {
  readonly #key: () => string | null;
  readonly #credential: IntegrationCredential<"computer"> | undefined;
  readonly #base: string;

  constructor(options: AgentComputerApiOptions) {
    this.#key = options.key ?? (() => null);
    this.#credential = options.credential;
    this.#base = (options.baseUrl ?? process.env.OPENBOT_AGENT_COMPUTER_API_URL ?? AGENT_COMPUTER_API_URL).replace(
      /\/+$/u,
      "",
    );
  }

  connected(): boolean {
    return Boolean(this.#credential || this.#key());
  }

  forAccount(credential: IntegrationCredential<"computer">): AgentComputerApi {
    return new AgentComputerApi({ key: () => null, baseUrl: this.#base, credential });
  }

  /** Reads the machine registry without waking a machine. A manual call can override the saved key. */
  readonly list = Effect.fn("AgentComputerApi.list")(function* (this: AgentComputerApi, key?: string) {
    const answer = yield* this.#json("GET", "/machines", undefined, 30_000, key);
    const { machines } = yield* decode(listSchema, answer);
    for (const machine of machines) if (machine.live_view_url) registerSecretValue(machine.live_view_url);
    return machines;
  });

  readonly allowance = Effect.fn("AgentComputerApi.allowance")(function* (this: AgentComputerApi, key?: string) {
    const answer = yield* this.#json("GET", "/allowance", undefined, 30_000, key);
    return yield* decode(allowanceSchema, answer);
  });

  readonly start = Effect.fn("AgentComputerApi.start")(function* (
    this: AgentComputerApi,
    context: string,
    size?: AgentComputerSize,
    options?: { idempotencyKey?: string | undefined },
  ) {
    const answer = yield* this.#json(
      "POST",
      "/machines/start",
      size ? { context, size } : { context },
      300_000,
      undefined,
      options?.idempotencyKey,
    );
    const started = yield* decode(startSchema, answer);
    registerSecretValue(started.live_view_url);
    if (started.billing?.upgrade_url) registerSecretValue(started.billing.upgrade_url);
    if (started.billing?.manage_url) registerSecretValue(started.billing.manage_url);
    return started;
  });

  readonly bash = Effect.fn("AgentComputerApi.bash")(function* (
    this: AgentComputerApi,
    id: string,
    input: { cmd: string; timeout_s?: number | undefined; cwd?: string | undefined },
  ) {
    const timeout = input.timeout_s ?? 120;
    const body = { cmd: input.cmd, timeout_s: timeout, ...(input.cwd ? { cwd: input.cwd } : {}) };
    const answer = yield* this.#json("POST", `${machinePath(id)}/bash`, body, (timeout + 60) * 1000);
    return yield* decode(bashSchema, answer);
  });

  readonly screenshot = Effect.fn("AgentComputerApi.screenshot")(function* (this: AgentComputerApi, id: string) {
    const answer = yield* this.#send("POST", `${machinePath(id)}/screenshot`, {}, 120_000);
    return { bytes: answer.body, mimeType: answer.contentType || "image/png" };
  });

  readonly file = Effect.fn("AgentComputerApi.file")(function* (this: AgentComputerApi, id: string, path: string) {
    const answer = yield* this.#send("POST", `${machinePath(id)}/files`, { path }, 120_000);
    return { bytes: answer.body, mimeType: answer.contentType || "application/octet-stream" };
  });

  readonly publish = Effect.fn("AgentComputerApi.publish")(function* (
    this: AgentComputerApi,
    id: string,
    path: string,
    filename?: string,
  ) {
    const body = { path, ...(filename ? { filename } : {}) };
    const answer = yield* this.#json("POST", `${machinePath(id)}/publish`, body, 600_000);
    return yield* decode(publishSchema, answer);
  });

  readonly stop = Effect.fn("AgentComputerApi.stop")(function* (this: AgentComputerApi, id: string) {
    const answer = yield* this.#json("POST", `${machinePath(id)}/stop`, {}, 120_000);
    return yield* decode(statusSchema, answer);
  });

  readonly destroy = Effect.fn("AgentComputerApi.destroy")(function* (this: AgentComputerApi, id: string) {
    const answer = yield* this.#json("POST", `${machinePath(id)}/destroy`, { confirm: true }, 120_000);
    return yield* decode(statusSchema, answer);
  });

  #json(method: "GET" | "POST", path: string, body: unknown, timeoutMs: number, key?: string, idempotencyKey?: string) {
    return this.#send(method, path, body, timeoutMs, key, idempotencyKey).pipe(
      Effect.flatMap((answer) =>
        Effect.try({
          try: (): unknown => JSON.parse(answer.body.toString("utf8")),
          catch: () => badResponse(answer.status),
        }),
      ),
    );
  }

  /** Sends one request. A status of 400 or more fails with the API's own code and message. */
  readonly #send = Effect.fn("AgentComputerApi.send")(function* (
    this: AgentComputerApi,
    method: "GET" | "POST",
    path: string,
    body: unknown,
    timeoutMs: number,
    explicitKey?: string,
    idempotencyKey?: string,
  ) {
    const key = this.#credential
      ? Redacted.value(yield* this.#credential.bearer.pipe(Effect.mapError(notConnected)))
      : (explicitKey ?? this.#key());
    if (!key) return yield* Effect.fail(notConnected());
    registerSecretValue(key);
    const url = new URL(`${this.#base}${path}`);
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    return yield* Effect.callback<RawResponse, AgentComputerFailed>((resume, signal) => {
      const send = url.protocol === "http:" ? httpRequest : httpsRequest;
      const request = send(
        url,
        {
          method,
          signal,
          timeout: timeoutMs,
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
            ...(idempotencyKey !== undefined ? { "Idempotency-Key": idempotencyKey } : {}),
            ...(payload ? { "Content-Type": "application/json", "Content-Length": String(payload.length) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > RESPONSE_LIMIT) {
              response.destroy();
              resume(Effect.fail(badResponse(response.statusCode ?? 0)));
              return;
            }
            chunks.push(chunk);
          });
          response.on("error", () => resume(Effect.fail(networkError())));
          response.on("end", () => {
            const status = response.statusCode ?? 0;
            const answer = {
              status,
              contentType:
                String(response.headers["content-type"] ?? "")
                  .split(";")[0]
                  ?.trim() ?? "",
              body: Buffer.concat(chunks),
            };
            if (this.#credential && answer.body.includes(key)) {
              resume(Effect.fail(badResponse(status)));
              return;
            }
            resume(status >= 400 ? Effect.fail(apiError(answer)) : Effect.succeed(answer));
          });
        },
      );
      request.on("timeout", () => request.destroy(new Error("timeout")));
      request.on("error", () => resume(Effect.fail(networkError())));
      request.end(payload);
    });
  });
}

function notConnected() {
  return new AgentComputerFailed({
    code: "NOT_CONNECTED",
    message: sourceText("error.connector.agentComputerNotConnected"),
    status: 0,
  });
}

function machinePath(id: string): string {
  return `/machines/${encodeURIComponent(id)}`;
}

function decode<S extends Schema.Top>(schema: S, value: unknown) {
  return Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => badResponse(200)));
}

function apiError(answer: RawResponse): AgentComputerFailed {
  try {
    const parsed = Schema.decodeUnknownSync(errorSchema)(JSON.parse(answer.body.toString("utf8")));
    // An allowance error carries a signed billing link for the person: it never reaches an agent or a log.
    for (const url of parsed.error.message.match(/https?:\/\/\S+/gu) ?? []) registerSecretValue(url);
    const code = redactSecrets(parsed.error.code).slice(0, 64);
    return new AgentComputerFailed({
      code,
      message:
        code === "ALLOWANCE_EXHAUSTED"
          ? sourceText("error.connector.agentComputerAllowanceExhausted")
          : redactSecrets(parsed.error.message).slice(0, 1_000),
      status: answer.status,
    });
  } catch {
    return new AgentComputerFailed({
      code: answer.status === 401 ? "UNAUTHORIZED" : "PROVIDER_ERROR",
      message: sourceText("error.connector.agentComputerHttp", { status: String(answer.status) }),
      status: answer.status,
    });
  }
}

function badResponse(status: number): AgentComputerFailed {
  return new AgentComputerFailed({
    code: "BAD_RESPONSE",
    message: sourceText("error.connector.agentComputerUnexpected"),
    status,
  });
}

function networkError(): AgentComputerFailed {
  return new AgentComputerFailed({
    code: "NETWORK_ERROR",
    message: sourceText("error.connector.agentComputerUnreachable"),
    status: 0,
  });
}

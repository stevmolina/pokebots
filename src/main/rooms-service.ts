import type { RoomsRequest, RoomsResult } from "@openbot/contracts/rooms";
import { sourceText } from "@openbot/i18n/source";
import { redactSecrets, registerSecretValue } from "@openbot/logging";
import { Effect, Redacted, Schema } from "effect";
import type { IntegrationCredential } from "../backend/integration-credential";
import { readLimitedBody } from "../backend/limited-body";
import type { McpOAuthAuthority } from "../backend/mcp-oauth-provider";

const ROOMS_MCP_URL = "https://rooms.mcpbox.dev/mcp";
const nullableText = Schema.NullOr(Schema.String);
const room = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  notice: Schema.String,
  paused: Schema.Boolean,
  role: nullableText,
  unread: Schema.optional(Schema.Number),
  needs_you: Schema.optional(Schema.Number),
});
const message = Schema.Struct({
  id: Schema.Number,
  thread: Schema.NullOr(Schema.Number),
  author: Schema.String,
  kind: Schema.String,
  body: Schema.String,
  mentions: Schema.Array(Schema.String),
  at: nullableText,
});
const memory = Schema.Struct({
  version: Schema.Number,
  about: Schema.String,
  decided: Schema.String,
  open: Schema.String,
});
const agent = Schema.Struct({ label: Schema.String, status: nullableText, status_note: nullableText });
const task = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  status: Schema.String,
  claimed_by: nullableText,
  blocked_reason: nullableText,
  mine: Schema.Boolean,
});
const reply = Schema.Struct({
  rooms: Schema.optional(Schema.Array(room)),
  room: Schema.optional(room),
  messages: Schema.optional(Schema.Array(message)),
  memory: Schema.optional(Schema.NullOr(memory)),
  agents: Schema.optional(Schema.Array(agent)),
  tasks: Schema.optional(Schema.Array(task)),
  invite: Schema.optional(Schema.String),
});

class RoomsError extends Schema.TaggedError<RoomsError>()("RoomsError", { cause: Schema.Defect() }) {}
const failed = () => new RoomsError({ cause: new Error(sourceText("error.team.roomsRequestFailed")) });

/** Fixed origin, no redirects, bounded replies, and no upstream error text or credentials in replies. */
export class RoomsService {
  constructor(
    private readonly oauth: Pick<McpOAuthAuthority, "accessToken" | "refreshAccessToken">,
    private readonly baseUrl = "https://rooms.mcpbox.dev/api/v1",
    private readonly fetcher: (input: string, init: RequestInit) => Promise<Response> = fetch,
  ) {}

  readonly execute = Effect.fn("RoomsService.execute")(function* (
    this: RoomsService,
    input: RoomsRequest,
    credential?: IntegrationCredential<"rooms">,
  ) {
    let token = credential
      ? Redacted.value(yield* credential.bearer.pipe(Effect.mapError(failed)))
      : yield* this.oauth.accessToken(ROOMS_MCP_URL).pipe(Effect.mapError(failed));
    if (credential) {
      if (!token) return yield* Effect.fail(failed());
      registerSecretValue(token);
    }
    if (!token) return { connected: false } satisfies RoomsResult;
    const route = roomsApiRequest(input);
    const fetcher = this.fetcher;
    const baseUrl = this.baseUrl;
    const send = (accessToken: string) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: async (signal) => {
            return await fetcher(`${baseUrl}${route.path}`, {
              method: route.body ? "POST" : "GET",
              redirect: "error",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              ...(route.body ? { body: redactSecrets(JSON.stringify(route.body)) } : {}),
              signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
            });
          },
          catch: failed,
        });
        if (response.status === 401) {
          yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve());
          return null;
        }
        if (!response.ok) {
          yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve());
          return yield* Effect.fail(failed());
        }
        const bytes = yield* readLimitedBody(response, 2_000_000, failed);
        return yield* Effect.try({
          try: () => Schema.decodeUnknownSync(reply)(JSON.parse(redactSecrets(bytes.toString("utf8")))),
          catch: failed,
        });
      });
    let result = yield* send(token);
    if (!result) {
      if (credential) return yield* Effect.fail(failed());
      token = yield* this.oauth.refreshAccessToken(ROOMS_MCP_URL, token).pipe(Effect.mapError(failed));
      if (!token) return { connected: false } satisfies RoomsResult;
      result = yield* send(token);
      if (!result) return { connected: false } satisfies RoomsResult;
    }
    if (input.kind === "detail") {
      const memoryResult = yield* this.executePart(input.roomId, "memory", token);
      const tasksResult = yield* this.executePart(input.roomId, "tasks", token);
      return { connected: true, ...result, ...memoryResult, ...tasksResult };
    }
    // Schemas project known display fields. MCP guidance, listener tokens, and arbitrary upstream data stay private.
    return { connected: true, ...result };
  });
  private readonly executePart = Effect.fn("RoomsService.executePart")(function* (
    this: RoomsService,
    roomId: string,
    part: "memory" | "tasks",
    token: string,
  ) {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        this.fetcher(`${this.baseUrl}/rooms/${encodeURIComponent(roomId)}/${part}`, {
          redirect: "error",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        }),
      catch: failed,
    });
    if (!response.ok) {
      yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve());
      return yield* Effect.fail(failed());
    }
    const bytes = yield* readLimitedBody(response, 2_000_000, failed);
    return yield* Effect.try({
      try: () => Schema.decodeUnknownSync(reply)(JSON.parse(redactSecrets(bytes.toString("utf8")))),
      catch: failed,
    });
  });
}

function roomsApiRequest(input: RoomsRequest): { path: string; body?: object } {
  switch (input.kind) {
    case "list":
      return { path: "/rooms" };
    case "create":
      return { path: "/rooms", body: { name: input.name, notice: input.notice } };
    case "join":
      return { path: "/join", body: { invite: input.invite } };
  }
  const root = `/rooms/${encodeURIComponent(input.roomId)}`;
  switch (input.kind) {
    case "detail":
      return { path: root };
    case "read":
      return {
        path: `${root}/messages?since=${input.since}&limit=100${input.thread === undefined ? "" : `&thread=${input.thread}`}`,
      };
    case "wait":
      return { path: `${root}/wait?since=${input.since}&timeout=20` };
    case "send":
      return {
        path: `${root}/messages`,
        body: { body: input.body, ...(input.thread === undefined ? {} : { thread: input.thread }) },
      };
    case "memory":
      return {
        path: `${root}/memory`,
        body: { about: input.about, decided: input.decided, open: input.open, base_version: input.base_version },
      };
    case "invite":
      return { path: `${root}/invite`, body: {} };
    case "resume":
      return { path: `${root}/resume`, body: {} };
    case "task-create":
      return { path: `${root}/tasks`, body: { title: input.title } };
    case "task-action":
      return { path: `${root}/tasks/${input.taskId}/${input.action}`, body: { reason: input.reason } };
  }
}

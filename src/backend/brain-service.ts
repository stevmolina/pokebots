import { type BrainRequest, decodeBrainResponse } from "@pokebots/contracts/brain";
import type { McpServerConfig } from "@pokebots/contracts/ipc";
import { sourceText } from "@pokebots/i18n/source";
import { redactSecrets, registerSecretValue } from "@pokebots/logging";
import { Effect, Redacted, Schema } from "effect";
import { z } from "zod";
import type { IntegrationCredential } from "./integration-credential";
import { readLimitedBody } from "./limited-body";
import type { McpOAuth } from "./mcp-oauth-provider";

class BrainError extends Schema.TaggedError<BrainError>()("BrainError", {
  message: Schema.String,
}) {}

const paths = {
  brains: "/brains",
  overview: "/brains/overview",
  search: "/search",
  claim: "/claims/get",
  explain: "/claims/explain",
  page: "/pages/get",
  files: "/files",
  file: "/files/get",
  addFile: "/files",
  remember: "/remember",
  update: "/update-fact",
  forget: "/forget",
  sessions: "/sessions",
  session: "/sessions/show",
} as const;
type BrainServiceRequest = {
  [Operation in BrainRequest["operation"]]: Omit<Extract<BrainRequest, { operation: Operation }>, "mcpServerId"> & {
    mcpServerId?: string;
  };
}[BrainRequest["operation"]];

const writes = new Set<BrainRequest["operation"]>(["addFile", "remember", "update", "forget"]);

/** Longest wait for brain context before a turn starts without it. */
const BRAIN_START_CONTEXT_TIMEOUT_MS = 3_000;
const START_CONTEXT_LIMIT = 12_000;
const startContextReply = z.object({ text: z.string().optional(), context: z.string().optional() });
const startSearchReply = z.object({
  claims: z
    .array(
      z.object({
        text: z.string(),
        page: z.string(),
        verified_at: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export interface BrainStartContextInput {
  question: string;
  /** The agent's workspace folder, so the brain can pick the project it belongs to. */
  cwd?: string;
}

export function isBrainConnection(config: McpServerConfig): boolean {
  if (config.transport !== "http") return false;
  try {
    const url = new URL(config.url);
    return url.origin === "https://brain.mcpbox.dev" && url.pathname === "/mcp";
  } catch {
    return false;
  }
}

/** No brain response is written to disk. The MCP authority owns token refresh and shutdown. */
export class BrainService {
  constructor(
    private readonly options: {
      oauth: Pick<McpOAuth, "accessToken" | "refreshAccessToken">;
      connections: () => McpServerConfig[];
      fetch?: (input: URL, init: RequestInit) => Promise<Response>;
    },
  ) {}

  /**
   * What the brain knows about the first message of a chat, as text for the turn prompt, or null.
   * Uses the `context` route, and the `search` route while a brain has no `context` route yet. Never
   * fails and never waits more than `BRAIN_START_CONTEXT_TIMEOUT_MS`: a chat starts without it then.
   */
  readonly startContext = Effect.fn("Brain.startContext")(
    function* (this: BrainService, connection: McpServerConfig, input: BrainStartContextInput) {
      if (!isBrainConnection(connection) || !connection.enabled) return null;
      // A query string can reach access logs: the question goes out redacted, and short.
      const question = redactSecrets(input.question).trim().slice(0, 1000);
      if (!question) return null;
      let token = yield* this.options.oauth.accessToken(connection.url).pipe(Effect.orElseSucceed(() => null));
      if (!token) return null;
      const fetcher = this.options.fetch ?? fetch;
      const unreadable = () => null;
      const send = (path: string, query: Record<string, string>, accessToken: string) =>
        Effect.tryPromise({
          try: (signal) => {
            const url = new URL(`https://brain.mcpbox.dev/api/v1${path}`);
            for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
            return fetcher(url, {
              method: "GET",
              redirect: "error",
              signal,
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          },
          catch: unreadable,
        });
      const oauth = this.options.oauth;
      const get = (path: string, query: Record<string, string>) =>
        Effect.gen(function* () {
          if (!token) return { status: 401, value: null };
          let response = yield* send(path, query, token);
          // Retry only authentication, once, as `request` does.
          if (response.status === 401) {
            yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve());
            token = yield* oauth.refreshAccessToken(connection.url, token).pipe(Effect.orElseSucceed(() => null));
            if (!token) return { status: 401, value: null };
            response = yield* send(path, query, token);
          }
          if (!response.ok) {
            yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve());
            return { status: response.status, value: null };
          }
          const bytes = yield* readLimitedBody(response, 1024 * 1024, unreadable);
          const value = yield* Effect.try({
            try: (): unknown => JSON.parse(bytes.toString("utf8")),
            catch: unreadable,
          });
          return { status: response.status, value };
        });
      const context = yield* get("/context", {
        question,
        ...(input.cwd ? { cwd: input.cwd.slice(0, 1000) } : {}),
        // Characters of brain text; the brain's default. The `text` field is the whole block.
        budget: "6000",
      });
      if (context.status !== 404) {
        const reply = startContextReply.safeParse(context.value);
        const text = reply.success ? (reply.data.text ?? reply.data.context ?? "") : "";
        return text.trim() ? redactSecrets(text.trim()).slice(0, START_CONTEXT_LIMIT) : null;
      }
      // A brain without the `context` route yet: its best claims for the message.
      const search = yield* get("/search", { query: searchTerms(question), limit: "8" });
      const reply = startSearchReply.safeParse(search.value);
      const claims = reply.success ? (reply.data.claims ?? []) : [];
      if (claims.length === 0) return null;
      return redactSecrets(
        claims
          .map(
            (claim) => `- ${claim.text} (${claim.page}${claim.verified_at ? `, verified ${claim.verified_at}` : ""})`,
          )
          .join("\n"),
      ).slice(0, START_CONTEXT_LIMIT);
    },
    (effect) => effect.pipe(Effect.orElseSucceed(() => null)),
    Effect.timeoutOrElse({ duration: BRAIN_START_CONTEXT_TIMEOUT_MS, orElse: () => Effect.succeed(null) }),
  );

  readonly request = Effect.fn("Brain.request")(
    function* (this: BrainService, input: BrainServiceRequest, credential?: IntegrationCredential<"brain">) {
      const connection = credential
        ? undefined
        : this.options.connections().find((row) => row.id === input.mcpServerId && isBrainConnection(row));
      const failure = () => new BrainError({ message: sourceText("error.brain.request") });
      const disconnected = () => new BrainError({ message: sourceText("error.brain.connect") });
      const token = credential
        ? Redacted.value(yield* credential.bearer.pipe(Effect.mapError(failure)))
        : connection?.transport === "http"
          ? yield* this.options.oauth.accessToken(connection.url).pipe(Effect.mapError(failure))
          : null;
      if (!token) return yield* Effect.fail(disconnected());
      if (credential) registerSecretValue(token);
      const { operation, mcpServerId: _id, ...fields } = input;
      const url = new URL(`https://brain.mcpbox.dev/api/v1${paths[operation]}`);
      const write = writes.has(operation);
      if (!write)
        for (const [key, value] of Object.entries(fields))
          if (value !== undefined) url.searchParams.set(key, String(value));
      const send = (accessToken: string) =>
        Effect.tryPromise({
          try: (signal) =>
            (this.options.fetch ?? fetch)(url, {
              method: write ? "POST" : "GET",
              redirect: "error",
              signal,
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              ...(write ? { body: JSON.stringify(fields) } : {}),
            }),
          catch: failure,
        });
      let response = yield* send(token);
      // Retry only authentication, once. Do not retry an ambiguous write failure.
      if (response.status === 401 && connection?.transport === "http") {
        yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: failure });
        const refreshed = yield* this.options.oauth
          .refreshAccessToken(connection.url, token)
          .pipe(Effect.mapError(failure));
        if (!refreshed) return yield* Effect.fail(disconnected());
        response = yield* send(refreshed);
      }
      if (!response.ok) {
        yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: failure });
        return yield* Effect.fail(failure());
      }
      const text = yield* readLimitedBody(response, 8 * 1024 * 1024, failure);
      return yield* Effect.try({
        try: () => {
          const value = JSON.parse(credential ? redactSecrets(text.toString("utf8")) : text.toString("utf8"));
          const result = decodeBrainResponse(value);
          switch (operation) {
            case "brains":
              if (!result.brains) throw failure();
              break;
            case "search":
              if (!result.claims) throw failure();
              break;
            case "claim":
            case "explain":
              if (!result.claim) throw failure();
              break;
            case "overview":
              if (!result.pages) throw failure();
              break;
            case "page":
              if (result.text === undefined) throw failure();
              break;
            case "files":
              if (!result.files) throw failure();
              break;
            case "file":
              if (!result.download_url) throw failure();
              break;
            case "sessions":
              if (!result.sessions) throw failure();
              break;
            case "session":
              if (!result.session) throw failure();
              break;
            case "addFile":
              z.object({ status: z.literal("stored") }).parse(value);
              break;
            case "remember":
            case "update":
            case "forget":
              if (result.mode === "pull_request" && result.recorded === false && result.pull_request?.url) break;
              if (result.mode === "commit" && result.recorded === true && result.commit) break;
              throw failure();
          }
          return result;
        },
        catch: failure,
      });
    },
    Effect.timeoutOrElse({
      duration: 30_000,
      orElse: () => Effect.fail(new BrainError({ message: sourceText("error.brain.request") })),
    }),
  );
}

/** The words of a message that a full-text search can match: the first 12 of 3 letters or more. */
function searchTerms(question: string): string {
  const words = question.match(/[\p{L}\p{N}][\p{L}\p{N}._-]{2,}/gu) ?? [];
  return (words.slice(0, 12).join(" ") || question).slice(0, 300);
}

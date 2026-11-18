import { type BrainRequest, decodeBrainResponse } from "@openbot/contracts/brain";
import type { McpServerConfig } from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { redactSecrets, registerSecretValue } from "@openbot/logging";
import { Effect, Redacted, Schema } from "effect";
import { z } from "zod";
import type { IntegrationCredential } from "./integration-credential";
import { readLimitedBody } from "./limited-body";
import type { McpOAuth } from "./mcp-oauth-provider";

export class BrainError extends Schema.TaggedError<BrainError>()("BrainError", {
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

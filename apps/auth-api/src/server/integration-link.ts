import { sourceText } from "@openbot/i18n/source-english";
import { Effect } from "effect";
import { AuthServiceError } from "./auth-service";
import { randomToken, sha256 } from "./crypto";
import { integrations, type LinkAudience, linkIdentity, linkIssuer } from "./integration-token";
import { readJsonObject } from "./json-body";
import type { WorkerBindings } from "./types";

export const INTEGRATION_LINK_PAGE = "/integration-accounts";
const CLIENT_PATH = "/integration-accounts/client.json";
const CALLBACK_PATH = "/api/browser/integration-link/return";
const FLOW_MS = 5 * 60_000;
type Bindings = Pick<WorkerBindings, "DB" | "POKEBOTS_INTEGRATION_PRIVATE_KEY" | "POKEBOTS_INTEGRATION_WORKOS_ISSUER">;

function endpoints(request: Request) {
  const origin = new URL(request.url).origin;
  return {
    client_id: new URL(CLIENT_PATH, origin).href,
    redirect_uri: new URL(CALLBACK_PATH, origin).href,
  };
}

export function integrationLinkClient(request: Request) {
  const { client_id, redirect_uri } = endpoints(request);
  return Response.json({
    client_id,
    client_name: "Pokebots",
    redirect_uris: [redirect_uri],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

function unavailable() {
  return new AuthServiceError(
    503,
    "integration_link_unavailable",
    sourceText("error.auth.integrationTokensUnavailable"),
  );
}

export const startIntegrationLink = Effect.fn("IntegrationLink.start")(function* (
  request: Request,
  userId: string,
  sessionToken: string,
  bindings: Bindings,
) {
  const { audience } = yield* readJsonObject(request);
  if (audience !== "brain" && audience !== "rooms") {
    return yield* new AuthServiceError(
      400,
      "invalid_integration_link",
      sourceText("error.auth.integrationTokenInvalid"),
    );
  }
  const issuer = linkIssuer(bindings);
  const client = endpoints(request);
  if (!issuer || !bindings.POKEBOTS_INTEGRATION_PRIVATE_KEY?.trim() || !client.client_id.startsWith("https://")) {
    return yield* unavailable();
  }

  const state = randomToken();
  const verifier = randomToken();
  const stateHash = yield* sha256(state);
  const sessionHash = yield* sha256(sessionToken);
  const challenge = yield* sha256(verifier);
  const now = Date.now();
  const inserted = yield* Effect.tryPromise({
    try: async () => {
      const prune = bindings.DB.prepare(
        `DELETE FROM pokebots_integration_link_flows WHERE state_hash IN (
           SELECT state_hash FROM pokebots_integration_link_flows WHERE expires_at <= ? ORDER BY expires_at LIMIT 100
         )`,
      ).bind(now);
      const insert = bindings.DB.prepare(
        `INSERT INTO pokebots_integration_link_flows
           (state_hash, auth_session_hash, user_id, audience, issuer, callback, verifier, expires_at)
         SELECT ?, token_hash, user_id, ?, ?, ?, ?, min(expires_at, ?)
         FROM auth_sessions WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?
           AND (SELECT count(*) FROM pokebots_integration_link_flows WHERE auth_session_hash = ? AND expires_at > ?) < 8
         RETURNING state_hash`,
      ).bind(
        stateHash,
        audience,
        issuer,
        client.redirect_uri,
        verifier,
        now + FLOW_MS,
        sessionHash,
        userId,
        now,
        sessionHash,
        now,
      );
      const [, result] = await bindings.DB.batch([prune, insert]);
      return result?.results.length === 1;
    },
    catch: unavailable,
  });
  if (!inserted) return yield* unavailable();

  const authorization = new URL("/oauth2/authorize", issuer);
  authorization.search = new URLSearchParams({
    ...client,
    response_type: "code",
    resource: integrations[audience],
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl: authorization.href };
});

export const finishIntegrationLink = Effect.fn("IntegrationLink.finish")(function* (
  request: Request,
  userId: string,
  sessionToken: string,
  bindings: Bindings,
  upstream: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const issuer = linkIssuer(bindings);
  if (!issuer || !state || !/^[A-Za-z0-9_-]{43}$/u.test(state) || url.searchParams.getAll("state").length !== 1) {
    return false;
  }

  const client = endpoints(request);
  const stateHash = yield* sha256(state);
  const sessionHash = yield* sha256(sessionToken);
  // Delete and read in one statement. Only the current account session can spend the state.
  const pending = yield* Effect.tryPromise({
    try: () =>
      bindings.DB.prepare(
        `DELETE FROM pokebots_integration_link_flows
       WHERE state_hash = ? AND user_id = ? AND auth_session_hash = ? AND issuer = ? AND callback = ? AND expires_at > ?
       RETURNING audience, verifier`,
      )
        .bind(stateHash, userId, sessionHash, issuer, client.redirect_uri, Date.now())
        .first<{ audience: LinkAudience; verifier: string }>(),
    catch: unavailable,
  });
  const code = url.searchParams.get("code");
  if (
    !pending ||
    url.searchParams.has("error") ||
    !code ||
    code.length > 2048 ||
    url.searchParams.getAll("code").length !== 1 ||
    url.searchParams.get("iss") !== issuer ||
    url.searchParams.getAll("iss").length !== 1
  )
    return false;

  const accessToken = yield* Effect.tryPromise({
    try: async () => {
      const response = await upstream(new URL("/oauth2/token", issuer).href, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        body: new URLSearchParams({
          ...client,
          grant_type: "authorization_code",
          code,
          code_verifier: pending.verifier,
          resource: integrations[pending.audience],
        }),
      });
      if (!response.ok) return null;
      const body = await response.json();
      return body && typeof body === "object" && "access_token" in body && typeof body.access_token === "string"
        ? body.access_token
        : null;
    },
    catch: unavailable,
  });
  return yield* linkIdentity(accessToken, userId, pending.audience, bindings, upstream, sessionHash).pipe(
    Effect.as(true),
  );
});

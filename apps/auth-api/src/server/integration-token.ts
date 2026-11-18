import { sourceText } from "@openbot/i18n/source-english";
import { Effect } from "effect";
import { createRemoteJWKSet, customFetch, type FetchImplementation, importPKCS8, jwtVerify, SignJWT } from "jose";
import { AuthServiceError } from "./auth-service";
import { readJsonObject } from "./json-body";
import type { WorkerBindings } from "./types";

const TOKEN_LIFETIME_SECONDS = 300;

const integrations = {
  brain: "https://brain.mcpbox.dev/mcp",
  rooms: "https://rooms.mcpbox.dev/mcp",
} as const;

type LinkAudience = keyof typeof integrations;
type IntegrationBindings = Pick<
  WorkerBindings,
  "DB" | "POKEBOTS_INTEGRATION_PRIVATE_KEY" | "POKEBOTS_INTEGRATION_WORKOS_ISSUER"
>;
type LinkedIdentity = { issuer: string; subject: string };

function invalidRequest() {
  return new AuthServiceError(
    400,
    "invalid_integration_token_request",
    sourceText("error.auth.integrationTokenInvalid"),
  );
}

function linkIssuer(bindings: IntegrationBindings): string | null {
  const value = bindings.POKEBOTS_INTEGRATION_WORKOS_ISSUER?.trim();
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "https:" && (value === url.origin || value === `${url.origin}/`) ? url.origin : null;
}

const linkIdentity = Effect.fn("IntegrationToken.linkIdentity")(function* (
  token: unknown,
  userId: string,
  audience: LinkAudience,
  bindings: IntegrationBindings,
  fetchJwks: FetchImplementation,
) {
  if (typeof token !== "string" || !token || token.length > 8192) return yield* invalidRequest();
  const issuer = linkIssuer(bindings);
  if (!issuer) return yield* unavailable();

  const verified = yield* Effect.tryPromise({
    try: () =>
      jwtVerify(
        token,
        createRemoteJWKSet(new URL("/oauth2/jwks", issuer), { timeoutDuration: 5000, [customFetch]: fetchJwks }),
        {
          issuer,
          audience: integrations[audience],
          algorithms: ["RS256"],
          requiredClaims: ["sub", "exp"],
        },
      ),
    catch: invalidRequest,
  });
  const { sub, sub_profile: profile } = verified.payload;
  if (!sub || !/^user_[a-zA-Z0-9]+$/u.test(sub) || (profile !== undefined && profile !== "user")) {
    return yield* invalidRequest();
  }

  // The two unique keys prevent both rebinding and linking the same service
  // account to a second Pokebots account, even across concurrent requests.
  const link = bindings.DB.prepare(
    "INSERT INTO pokebots_integration_links(user_id, audience, issuer, subject, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  ).bind(userId, audience, issuer, sub, Date.now());
  const read = bindings.DB.prepare(
    "SELECT issuer, subject FROM pokebots_integration_links WHERE user_id = ? AND audience = ?",
  ).bind(userId, audience);
  const [, result] = yield* Effect.tryPromise({
    try: () => bindings.DB.batch<LinkedIdentity>([link, read]),
    catch: unavailable,
  });
  const saved = result?.results[0];
  if (saved?.issuer !== issuer || saved.subject !== sub) {
    return yield* new AuthServiceError(
      409,
      "integration_account_already_linked",
      sourceText("error.auth.integrationAccountAlreadyLinked"),
    );
  }
  return { linked: true } as const;
});

function unavailable() {
  return new AuthServiceError(
    503,
    "integration_tokens_unavailable",
    sourceText("error.auth.integrationTokensUnavailable"),
  );
}

export const issueIntegrationToken = Effect.fn("IntegrationToken.issue")(function* (
  request: Request,
  userId: string,
  bindings: IntegrationBindings,
  fetchJwks: FetchImplementation = (input, init) => fetch(input, init),
) {
  const { action, audience, scope = "integration:use", profile, workosAccessToken } = yield* readJsonObject(request);
  if (audience !== "brain" && audience !== "rooms" && audience !== "computer") return yield* invalidRequest();
  const pem = bindings.POKEBOTS_INTEGRATION_PRIVATE_KEY?.replaceAll("\\n", "\n").trim();
  if (!pem) return yield* unavailable();
  if (action === "link" && audience !== "computer") {
    return yield* linkIdentity(workosAccessToken, userId, audience, bindings, fetchJwks);
  }
  if (action !== undefined || scope !== "integration:use" || (profile !== undefined && profile !== "native"))
    return yield* invalidRequest();

  const key = yield* Effect.tryPromise({ try: () => importPKCS8(pem, "RS256"), catch: unavailable });
  const identity =
    audience === "computer" || profile === "native"
      ? null
      : yield* Effect.tryPromise({
          try: () =>
            bindings.DB.prepare(
              "SELECT issuer, subject FROM pokebots_integration_links WHERE user_id = ? AND audience = ?",
            )
              .bind(userId, audience)
              .first<LinkedIdentity>(),
          catch: unavailable,
        });
  const claims =
    identity && identity.issuer === linkIssuer(bindings)
      ? { scope, linked_workos_iss: identity.issuer, linked_workos_sub: identity.subject }
      : { scope };
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_LIFETIME_SECONDS;
  const accessToken = yield* Effect.tryPromise({
    try: () =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer("urn:pokebots:integrations")
        .setAudience(audience)
        .setSubject(`pokebots:${userId}`)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(key),
    catch: unavailable,
  });
  return { accessToken, expiresAt: expiresAt * 1000 };
});

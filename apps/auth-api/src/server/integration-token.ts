import { sourceText } from "@openbot/i18n/source-english";
import { Effect } from "effect";
import { createRemoteJWKSet, customFetch, type FetchImplementation, importPKCS8, jwtVerify, SignJWT } from "jose";
import { AuthServiceError } from "./auth-service";
import { randomToken, sha256 } from "./crypto";
import { readJsonObject } from "./json-body";
import type { RemoteControlPlane } from "./remote-control-plane";
import type { WorkerBindings } from "./types";

const TOKEN_LIFETIME_SECONDS = 300;
const GRANT_LIFETIME_MS = 60 * 60 * 1000;

const liveSessionJoins = `
  JOIN remote_memberships m ON m.membership_id = s.membership_id
    AND m.host_id = s.host_id AND m.user_id = s.user_id AND m.status = 'active'
  JOIN auth_sessions a ON a.token_hash = s.auth_session_hash
    AND a.user_id = s.user_id AND a.revoked_at IS NULL
  JOIN remote_hosts h ON h.host_id = s.host_id
`;

function invalidGrant() {
  return new AuthServiceError(403, "invalid_integration_grant", sourceText("error.auth.integrationTokenInvalid"));
}

const createGrant = Effect.fn("IntegrationToken.createGrant")(function* (
  sessionId: unknown,
  userId: string,
  accountToken: string | undefined,
  bindings: IntegrationBindings,
) {
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 256 || !accountToken)
    return yield* invalidRequest();

  const grant = randomToken();
  const grantHash = yield* sha256(grant);
  const authSessionHash = yield* sha256(accountToken);
  const now = Date.now();
  const row = yield* Effect.tryPromise({
    try: async () => {
      const prune = bindings.DB.prepare(
        `DELETE FROM pokebots_integration_grants WHERE grant_hash IN (
           SELECT grant_hash FROM pokebots_integration_grants WHERE expires_at <= ? ORDER BY expires_at LIMIT 100
         )`,
      ).bind(now);
      const insert = bindings.DB.prepare(
        `INSERT INTO pokebots_integration_grants
           (grant_hash, session_id, host_id, user_id, auth_session_hash, auth_epoch, expires_at)
         SELECT ?, s.session_id, s.host_id, s.user_id, s.auth_session_hash, h.auth_epoch,
           min(s.expires_at, a.expires_at, ?)
         FROM remote_sessions s ${liveSessionJoins}
         WHERE s.session_id = ? AND s.user_id = ? AND s.auth_session_hash = ?
           AND s.ended_at IS NULL AND s.expires_at > ? AND a.expires_at > ?
           AND h.machine_token_hash IS NOT NULL
         RETURNING host_id AS hostId, expires_at AS expiresAt`,
      ).bind(grantHash, now + GRANT_LIFETIME_MS, sessionId, userId, authSessionHash, now, now);
      const [, result] = await bindings.DB.batch<{ hostId: string; expiresAt: number }>([prune, insert]);
      return result?.results[0];
    },
    catch: unavailable,
  });
  if (!row) return yield* invalidGrant();
  return { grant, sessionId, ...row };
});

export const exchangeIntegrationGrant = Effect.fn("IntegrationToken.exchangeGrant")(function* (
  request: Request,
  hostId: string,
  remote: Pick<RemoteControlPlane, "authenticateHost">,
  bindings: IntegrationBindings,
) {
  const { machineToken, grant, audience, profile } = yield* readJsonObject(request);
  if (
    typeof machineToken !== "string" ||
    !machineToken ||
    machineToken.length > 256 ||
    typeof grant !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(grant) ||
    (audience !== "brain" && audience !== "rooms" && audience !== "computer") ||
    (profile !== undefined && profile !== "native")
  )
    return yield* invalidRequest();

  const host = yield* remote.authenticateHost(hostId, machineToken);
  const grantHash = yield* sha256(grant);
  const now = Date.now();
  const session = yield* Effect.tryPromise({
    try: () =>
      bindings.DB.prepare(
        `SELECT s.user_id AS userId, s.session_id AS sessionId,
         min(g.expires_at, s.expires_at, a.expires_at) AS expiresAt
       FROM pokebots_integration_grants g
       JOIN remote_sessions s ON s.session_id = g.session_id AND s.host_id = g.host_id
         AND s.user_id = g.user_id AND s.auth_session_hash = g.auth_session_hash
       ${liveSessionJoins}
       WHERE g.grant_hash = ? AND g.host_id = ? AND g.expires_at > ?
         AND s.ended_at IS NULL AND s.expires_at > ? AND a.expires_at > ?
         AND g.auth_epoch = h.auth_epoch AND h.machine_token_hash = ?`,
      )
        .bind(grantHash, hostId, now, now, now, host.machine_token_hash)
        .first<{ userId: string; sessionId: string; expiresAt: number }>(),
    catch: unavailable,
  });
  if (!session) return yield* invalidGrant();
  const token = yield* signToken(session.userId, audience, profile, bindings, session.expiresAt);
  return { ...token, userId: session.userId, sessionId: session.sessionId };
});

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
  accountToken?: string,
) {
  const {
    action,
    remoteSessionId,
    audience,
    scope = "integration:use",
    profile,
    workosAccessToken,
  } = yield* readJsonObject(request);
  if (action === "grant") return yield* createGrant(remoteSessionId, userId, accountToken, bindings);
  if (audience !== "brain" && audience !== "rooms" && audience !== "computer") return yield* invalidRequest();
  if (!bindings.POKEBOTS_INTEGRATION_PRIVATE_KEY?.trim()) return yield* unavailable();
  if (action === "link" && audience !== "computer") {
    return yield* linkIdentity(workosAccessToken, userId, audience, bindings, fetchJwks);
  }
  if (action !== undefined || scope !== "integration:use" || (profile !== undefined && profile !== "native"))
    return yield* invalidRequest();

  return yield* signToken(userId, audience, profile, bindings);
});

const signToken = Effect.fn("IntegrationToken.sign")(function* (
  userId: string,
  audience: LinkAudience | "computer",
  profile: "native" | undefined,
  bindings: IntegrationBindings,
  expiryLimit = Infinity,
) {
  const pem = bindings.POKEBOTS_INTEGRATION_PRIVATE_KEY?.replaceAll("\\n", "\n").trim();
  if (!pem) return yield* unavailable();
  const scope = "integration:use";
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
  const expiresAt = Math.min(issuedAt + TOKEN_LIFETIME_SECONDS, Math.floor(expiryLimit / 1000));
  if (expiresAt <= issuedAt) return yield* invalidGrant();
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

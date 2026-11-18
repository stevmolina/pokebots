import { sourceText } from "@openbot/i18n/source-english";
import { Effect } from "effect";
import { importPKCS8, SignJWT } from "jose";
import { AuthServiceError } from "./auth-service";
import { readJsonObject } from "./json-body";
import type { WorkerBindings } from "./types";

const TOKEN_LIFETIME_SECONDS = 300;

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
  bindings: Pick<WorkerBindings, "DB" | "POKEBOTS_INTEGRATION_PRIVATE_KEY">,
) {
  const { audience, scope = "integration:use" } = yield* readJsonObject(request);
  if (
    (audience !== "brain" && audience !== "rooms" && audience !== "computer") ||
    (scope !== "integration:use" && scope !== "integration:link") ||
    (audience === "computer" && scope === "integration:link")
  ) {
    return yield* new AuthServiceError(
      400,
      "invalid_integration_token_request",
      sourceText("error.auth.integrationTokenInvalid"),
    );
  }

  const pem = bindings.POKEBOTS_INTEGRATION_PRIVATE_KEY?.replaceAll("\\n", "\n").trim();
  if (!pem) return yield* unavailable();

  const key = yield* Effect.tryPromise({ try: () => importPKCS8(pem, "RS256"), catch: unavailable });
  const {
    results: [identity, another],
  } = yield* Effect.tryPromise({
    try: () =>
      bindings.DB.prepare("SELECT issuer, subject FROM workos_sign_in_identities WHERE user_id = ? LIMIT 2")
        .bind(userId)
        .all<{ issuer: string; subject: string }>(),
    catch: unavailable,
  });
  const claims =
    identity?.issuer && identity.subject && !another
      ? { scope, workos_iss: identity.issuer, workos_sub: identity.subject }
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

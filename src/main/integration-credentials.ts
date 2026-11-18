import { sourceText } from "@openbot/i18n/source";
import { registerSecretValue } from "@openbot/logging";
import { Effect, Redacted } from "effect";
import { z } from "zod";
import type { IntegrationCredential } from "../backend/integration-credential";
import { readLimitedBody } from "../backend/limited-body";
import type { CentralAuthManager } from "./central-auth-manager";

export type IntegrationAudience = "brain" | "rooms" | "computer";

export interface IntegrationTokenRequest<Audience extends IntegrationAudience = IntegrationAudience> {
  audience: Audience;
  profile?: "native";
}

export interface JoinedIntegrationTokenRequest<Audience extends IntegrationAudience = IntegrationAudience>
  extends IntegrationTokenRequest<Audience> {
  hostId: string;
  machineToken: string;
  grant: string;
  userId: string;
  sessionId: string;
}

const tokenReply = z.object({
  accessToken: z
    .string()
    .max(8192)
    .regex(/^[A-Za-z0-9._~+/-]+=*$/u),
  expiresAt: z.number().int(),
});
const joinedReply = tokenReply.extend({ userId: z.string(), sessionId: z.string() });
const unavailable = () => new Error(sourceText("error.auth.integrationTokensUnavailable"));

export function decodeIntegrationBearer(value: unknown): Redacted.Redacted<string> {
  const reply = tokenReply.safeParse(value);
  if (!reply.success) throw unavailable();
  registerSecretValue(reply.data.accessToken);
  if (reply.data.expiresAt <= Date.now()) throw unavailable();
  return Redacted.make(reply.data.accessToken);
}

export function localIntegrationCredential<Audience extends IntegrationAudience>(
  auth: Pick<CentralAuthManager, "requestIntegrationBearer">,
  userId: string,
  request: IntegrationTokenRequest<Audience>,
): IntegrationCredential<Audience> {
  return { audience: request.audience, bearer: auth.requestIntegrationBearer(userId, request) };
}

export function joinedIntegrationCredential<Audience extends IntegrationAudience>(
  accountApiUrl: string,
  request: JoinedIntegrationTokenRequest<Audience>,
  fetcher: (input: URL, init: RequestInit) => Promise<Response> = fetch,
): IntegrationCredential<Audience> {
  return {
    audience: request.audience,
    bearer: exchangeJoinedIntegrationToken(accountApiUrl, request, fetcher).pipe(Effect.map((reply) => reply.bearer)),
  };
}

export function exchangeJoinedIntegrationToken(
  accountApiUrl: string,
  request: JoinedIntegrationTokenRequest,
  fetcher: (input: URL, init: RequestInit) => Promise<Response> = fetch,
) {
  const { audience, profile, hostId, machineToken, grant, userId, sessionId } = request;
  return Effect.fn("IntegrationCredential.exchange")(function* () {
    registerSecretValue(machineToken);
    registerSecretValue(grant);
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetcher(new URL(`/v2/remote/hosts/${encodeURIComponent(hostId)}/integrations/token`, accountApiUrl), {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineToken, grant, audience, profile }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        }),
      catch: unavailable,
    });
    if (!response.ok) {
      yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve());
      return yield* Effect.fail(unavailable());
    }
    const bytes = yield* readLimitedBody(response, 16_384, unavailable);
    return yield* Effect.try({
      try: () => {
        const reply = joinedReply.safeParse(JSON.parse(bytes.toString("utf8")));
        if (!reply.success || reply.data.userId !== userId || reply.data.sessionId !== sessionId) throw unavailable();
        return { bearer: decodeIntegrationBearer(reply.data), expiresAt: reply.data.expiresAt };
      },
      catch: unavailable,
    });
  })();
}

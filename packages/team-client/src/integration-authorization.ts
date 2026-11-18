import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { POKEBOTS_INTEGRATIONS_ROUTES } from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { Effect, Schema, Semaphore } from "effect";

class IntegrationAuthorizationError extends Schema.TaggedError<IntegrationAuthorizationError>()(
  "IntegrationAuthorizationError",
  {},
) {}

export function decodeIntegrationGrant(value: unknown, hostId: string, sessionId: string): string {
  if (
    isDynamicRecord(value) &&
    value.hostId === hostId &&
    value.sessionId === sessionId &&
    isString(value.grant) &&
    /^[A-Za-z0-9_-]{43}$/u.test(value.grant) &&
    isNumber(value.expiresAt) &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > Date.now()
  )
    return value.grant;
  throw new IntegrationAuthorizationError();
}

export function isIntegrationOperation(path: string): boolean {
  return (
    path === POKEBOTS_INTEGRATIONS_ROUTES.brain ||
    path === POKEBOTS_INTEGRATIONS_ROUTES.rooms ||
    path === POKEBOTS_INTEGRATIONS_ROUTES.computerAllowance
  );
}

/** Keep only expiry and retry state, for the lifetime of one authenticated peer. */
export class IntegrationAuthorization {
  readonly #lock = Semaphore.makeUnsafe(1);
  #renewAt = 0;
  #retryAt = 0;

  get due(): boolean {
    return Date.now() >= Math.max(this.#renewAt, this.#retryAt);
  }

  readonly ensure = Effect.fn("IntegrationAuthorization.ensure")(function* (
    this: IntegrationAuthorization,
    authorize: Effect.Effect<{ status: number; body: unknown }, unknown>,
  ): Effect.fn.Return<void, IntegrationAuthorizationError> {
    return yield* this.#lock.withPermit(
      Effect.gen({ self: this }, function* () {
        const now = Date.now();
        if (now < this.#renewAt) return;
        if (now < this.#retryAt) return yield* new IntegrationAuthorizationError();
        this.#retryAt = Number.POSITIVE_INFINITY;

        const response = yield* authorize.pipe(
          Effect.mapError(() => new IntegrationAuthorizationError()),
          Effect.ensuring(
            Effect.sync(() => {
              this.#retryAt = Date.now() + 30_000;
            }),
          ),
        );
        const { body } = response;
        const receivedAt = Date.now();
        if (
          response.status !== 200 ||
          !isDynamicRecord(body) ||
          !isNumber(body.expiresAt) ||
          !Number.isSafeInteger(body.expiresAt) ||
          body.expiresAt <= receivedAt
        )
          return yield* new IntegrationAuthorizationError();

        this.#retryAt = 0;
        this.#renewAt = body.expiresAt - Math.min(30_000, (body.expiresAt - receivedAt) / 2);
      }),
    );
  }).bind(this);
}

import type { Effect, Redacted } from "effect";

/** A main-process-only credential resolved for one authorized actor. */
export type IntegrationCredential<Audience extends string> = {
  readonly audience: Audience;
  readonly bearer: Effect.Effect<Redacted.Redacted<string>, Error>;
};

import { sourceText } from "@pokebots/i18n/source";
import { Effect } from "effect";
import type { IntegrationCredential } from "../backend/integration-credential";
import type { CentralAuthManager } from "./central-auth-manager";
import {
  exchangeJoinedIntegrationToken,
  type IntegrationAudience,
  type IntegrationTokenRequest,
  joinedIntegrationCredential,
} from "./integration-credentials";
import type { TeamStore } from "./team-store";

const unavailable = () => new Error(sourceText("error.auth.integrationTokensUnavailable"));

export class JoinedIntegrationAccess {
  constructor(
    private readonly store: TeamStore,
    private readonly auth: Pick<CentralAuthManager, "hostSiteCredential">,
    private readonly accountApiUrl: string,
    private readonly fetcher: (input: URL, init: RequestInit) => Promise<Response> = fetch,
  ) {}

  readonly authorize = Effect.fn("JoinedIntegrationAccess.authorize")(function* (
    this: JoinedIntegrationAccess,
    token: string,
    sessionId: string,
    grant: string,
  ) {
    const pending = this.store.beginIntegrationAuthorization(token, sessionId);
    const machine = pending && this.auth.hostSiteCredential(pending.hostId);
    if (!pending || !machine) return yield* Effect.fail(unavailable());
    const proof = yield* exchangeJoinedIntegrationToken(
      this.accountApiUrl,
      { ...machine, userId: pending.userId, sessionId, grant, audience: "brain", profile: "native" },
      this.fetcher,
    );
    const expiresAt = pending.save(grant, proof.grantExpiresAt);
    if (!expiresAt) return yield* Effect.fail(unavailable());
    return { expiresAt };
  });

  hasGrant(token: string, sessionId: string): boolean {
    return this.store.integrationGrantForSession(token, sessionId) !== null;
  }

  credentialForSession<Audience extends IntegrationAudience>(
    token: string,
    sessionId: string,
    request: IntegrationTokenRequest<Audience>,
  ): IntegrationCredential<Audience> {
    return this.#credential(() => this.store.integrationGrantForSession(token, sessionId), request);
  }

  credentialForMember<Audience extends IntegrationAudience>(
    member: { memberId: string; accountId: string },
    request: IntegrationTokenRequest<Audience>,
  ): IntegrationCredential<Audience> {
    return this.#credential(() => this.store.integrationGrantForMember(member.memberId, member.accountId), request);
  }

  #credential<Audience extends IntegrationAudience>(
    lookup: () => ReturnType<TeamStore["integrationGrantForSession"]>,
    request: IntegrationTokenRequest<Audience>,
  ): IntegrationCredential<Audience> {
    return {
      audience: request.audience,
      bearer: Effect.gen({ self: this }, function* () {
        const actor = lookup();
        const machine = actor && this.auth.hostSiteCredential(actor.hostId);
        if (!actor || !machine) return yield* Effect.fail(unavailable());
        const credential = joinedIntegrationCredential(
          this.accountApiUrl,
          { ...actor, ...machine, ...request },
          this.fetcher,
        );
        const bearer = yield* credential.bearer;
        const current = lookup();
        if (
          current?.sessionId !== actor.sessionId ||
          current.hostId !== actor.hostId ||
          current.userId !== actor.userId
        )
          return yield* Effect.fail(unavailable());
        return bearer;
      }),
    };
  }
}

import { brainRequestSchema } from "@openbot/contracts/brain";
import {
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_CAPABILITY,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { sourceText } from "@openbot/i18n/source";
import { Effect, Result } from "effect";
import { AgentComputerApi } from "../../backend/agent-computer/agent-computer-api";
import type { BrainService } from "../../backend/brain-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { JoinedIntegrationAccess } from "../joined-integration-access";
import { decodeRoomsRequest } from "../rooms-inputs";
import type { RoomsService } from "../rooms-service";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, stringField } from "./request-helpers";

export interface PokebotsIntegrationRoutes {
  access: JoinedIntegrationAccess;
  brain: BrainService;
  rooms: RoomsService;
  available?: () => boolean;
  computerBaseUrl?: string;
}

const paths: ReadonlySet<string> = new Set(Object.values(POKEBOTS_INTEGRATIONS_ROUTES));

export async function routePokebotsIntegrations(
  context: TeamApiRequestContext,
  services: PokebotsIntegrationRoutes | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, request, token, sessionId, json } = context;
  if (
    method !== "POST" ||
    !paths.has(url.pathname) ||
    !services ||
    services.available?.() === false ||
    !capabilities.has(POKEBOTS_INTEGRATIONS_CAPABILITY)
  )
    return "unmatched";
  if (request.headers["x-openbot-webrtc-session"] !== sessionId)
    throw new HttpError(403, sourceText("error.team.authenticationRequired"));
  const { access, brain, rooms } = services;
  const body = await readJson(request);
  if (url.pathname !== POKEBOTS_INTEGRATIONS_ROUTES.authorize && !access.hasGrant(token, sessionId))
    throw new HttpError(403, sourceText("error.auth.integrationTokensUnavailable"));
  const profile = body.profile === "native" ? ({ profile: body.profile } as const) : {};
  switch (url.pathname) {
    case POKEBOTS_INTEGRATIONS_ROUTES.authorize: {
      const grant = stringField(body, "grant", false, 43);
      if (!/^[A-Za-z0-9_-]{43}$/u.test(grant)) throw new HttpError(400, "Invalid integration grant.");
      const result = await Effect.runPromise(Effect.result(access.authorize(token, sessionId, grant)));
      if (Result.isFailure(result)) throw new HttpError(403, sourceText("error.auth.integrationTokensUnavailable"));
      return json(200, result.success);
    }
    case POKEBOTS_INTEGRATIONS_ROUTES.brain: {
      const parsed = brainRequestSchema.safeParse(body.request);
      if (!parsed.success || parsed.data.mcpServerId !== POKEBOTS_BRAIN_ID)
        throw new HttpError(400, "Invalid Brain request.");
      const credential = access.credentialForSession(token, sessionId, { ...profile, audience: "brain" });
      return json(200, await Effect.runPromise(brain.request(parsed.data, credential)));
    }
    case POKEBOTS_INTEGRATIONS_ROUTES.rooms: {
      const input = decodeRoomsRequest(body.request);
      const credential = access.credentialForSession(token, sessionId, { ...profile, audience: "rooms" });
      return json(200, await runCauseEffect(rooms.execute(input, credential)));
    }
    case POKEBOTS_INTEGRATIONS_ROUTES.computerAllowance: {
      const credential = access.credentialForSession(token, sessionId, { audience: "computer" });
      return json(
        200,
        await Effect.runPromise(new AgentComputerApi({ credential, baseUrl: services.computerBaseUrl }).allowance()),
      );
    }
  }
  return "unmatched";
}

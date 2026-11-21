import { parseHomeAgentRulesPreference } from "@pokebots/contracts/ipc";
import {
  HOME_AGENT_RULES_CAPABILITY,
  HOME_AGENT_RULES_ROUTES,
} from "@pokebots/contracts/team-protocol/home-agent-rules-v1";
import { sourceText } from "@pokebots/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireOwner } from "./request-helpers";

export async function routeHomeAgentRules(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (
    method !== "POST" ||
    (url.pathname !== HOME_AGENT_RULES_ROUTES.settings && url.pathname !== HOME_AGENT_RULES_ROUTES.update)
  )
    return "unmatched";
  const setting = admin?.homeAgentRules;
  if (!setting || !capabilities.has(HOME_AGENT_RULES_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.homeAgentRulesUnsupported"));
  requireOwner(member);
  const body = await readJson(request);
  const result =
    url.pathname === HOME_AGENT_RULES_ROUTES.settings
      ? setting.get()
      : setting.set(parseHomeAgentRulesPreference(body));
  return json(200, await runCauseEffect(result));
}

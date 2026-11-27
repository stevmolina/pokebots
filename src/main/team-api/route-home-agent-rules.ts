import { type HomeAgentRulesSetting, parseHomeAgentRulesPreference } from "@pokebots/contracts/ipc";
import {
  HOME_AGENT_RULES_CAPABILITY,
  HOME_AGENT_RULES_ROUTES,
  isHomeAgentRulesV1File as isV1File,
} from "@pokebots/contracts/team-protocol/home-agent-rules-v1";
import {
  HOME_AGENT_RULES_V2_CAPABILITY,
  HOME_AGENT_RULES_V2_ROUTES,
} from "@pokebots/contracts/team-protocol/home-agent-rules-v2";
import { sourceText } from "@pokebots/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireOwner } from "./request-helpers";

/** A v1 client knows only two file names: it sees only those, and its update keeps the other selected files. */
function v1View(setting: HomeAgentRulesSetting): HomeAgentRulesSetting {
  return {
    enabled: setting.enabled,
    files: setting.files.filter(isV1File),
    availableFiles: setting.availableFiles.filter(isV1File),
  };
}

export async function routeHomeAgentRules(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (method !== "POST") return "unmatched";
  const path = url.pathname;
  const v1 = path === HOME_AGENT_RULES_ROUTES.settings || path === HOME_AGENT_RULES_ROUTES.update;
  const v2 = path === HOME_AGENT_RULES_V2_ROUTES.settings || path === HOME_AGENT_RULES_V2_ROUTES.update;
  if (!v1 && !v2) return "unmatched";
  const setting = admin?.homeAgentRules;
  if (!setting || !capabilities.has(v1 ? HOME_AGENT_RULES_CAPABILITY : HOME_AGENT_RULES_V2_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.homeAgentRulesUnsupported"));
  requireOwner(member);
  const body = await readJson(request);
  if (path === HOME_AGENT_RULES_V2_ROUTES.settings) return json(200, await runCauseEffect(setting.get()));
  if (path === HOME_AGENT_RULES_V2_ROUTES.update)
    return json(200, await runCauseEffect(setting.set(parseHomeAgentRulesPreference(body))));
  if (path === HOME_AGENT_RULES_ROUTES.settings) return json(200, v1View(await runCauseEffect(setting.get())));
  // The v1 codec already refused any other name in the body.
  const update = parseHomeAgentRulesPreference(body);
  const kept = setting.preference().files.filter((file) => !isV1File(file));
  const saved = await runCauseEffect(
    setting.set(
      parseHomeAgentRulesPreference({ enabled: update.enabled, files: [...update.files.filter(isV1File), ...kept] }),
    ),
  );
  return json(200, v1View(saved));
}

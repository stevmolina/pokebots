import { BRAIN_CONTEXT_CAPABILITY, BRAIN_CONTEXT_ROUTES } from "@pokebots/contracts/team-protocol/brain-context-v1";
import { sourceText } from "@pokebots/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin } from "./request-helpers";

/**
 * "Start chats with brain context" of this server, read and set from a joined server. Only the switch
 * leaves the host, never brain content. Frozen by `brain-context-v1`.
 */
export async function routeBrainContext(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (
    method !== "POST" ||
    (url.pathname !== BRAIN_CONTEXT_ROUTES.settings && url.pathname !== BRAIN_CONTEXT_ROUTES.update)
  )
    return "unmatched";
  const setting = admin?.brainContext;
  if (!setting || !capabilities.has(BRAIN_CONTEXT_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.brainContextUnsupported"));
  requireAdmin(member);
  // `readJson` has already run the body through the brain-context wire codec.
  const body = await readJson(request);
  if (url.pathname === BRAIN_CONTEXT_ROUTES.settings) return json(200, setting.get());
  return json(200, await runCauseEffect(setting.set(body.enabled === true)));
}

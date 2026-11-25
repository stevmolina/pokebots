import {
  AGENT_PULL_REQUESTS_CAPABILITY,
  AGENT_PULL_REQUESTS_ROUTES,
} from "@pokebots/contracts/team-protocol/agent-pull-requests-v1";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson } from "./request-helpers";

/**
 * Linked GitHub pull request status per agent, for settling rules and PR chips.
 * Frozen by `agent-pull-requests-v1`.
 */
export async function routeAgentPullRequests(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, request, json } = context;
  if (method !== "POST" || url.pathname !== AGENT_PULL_REQUESTS_ROUTES.list) return "unmatched";
  if (!admin?.listAgentPullRequests || !capabilities.has(AGENT_PULL_REQUESTS_CAPABILITY)) return "unmatched";
  await readJson(request);
  const map = await runCauseEffect(admin.listAgentPullRequests());
  const agents = Object.entries(map).map(([agentId, status]) => ({
    agentId,
    open: status.open,
    allMerged: status.allMerged,
    mergedAt: status.mergedAt,
  }));
  return json(200, { agents });
}

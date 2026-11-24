import {
  AGENT_COMPUTER_KEY_INPUT_LIMIT,
  decodeComputerManagementInput,
  isComputerMachineId,
} from "@pokebots/contracts/ipc";
import { AGENT_COMPUTER_CAPABILITY, AGENT_COMPUTER_ROUTES } from "@pokebots/contracts/team-protocol/agent-computer-v1";
import {
  COMPUTER_LIVE_VIEW_CAPABILITY,
  COMPUTER_LIVE_VIEW_ROUTE,
} from "@pokebots/contracts/team-protocol/computer-live-view-v1";
import {
  COMPUTER_MANAGEMENT_CAPABILITY,
  COMPUTER_MANAGEMENT_ROUTE,
} from "@pokebots/contracts/team-protocol/computer-management-v1";
import { sourceText } from "@pokebots/i18n/source";
import { registerSecretValue } from "@pokebots/logging";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAgentComputer, TeamApiComputerLiveView } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin, stringField } from "./request-helpers";

const ROUTES: ReadonlySet<string> = new Set([...Object.values(AGENT_COMPUTER_ROUTES), COMPUTER_MANAGEMENT_ROUTE]);

/**
 * The Agent Computer account of this host, which an owner or administrator connects from their own
 * computer with an API key. Frozen by `agent-computer-v1`. The key arrives once, in the connect body;
 * no answer carries it. `requireAdmin` runs on every route.
 */
export async function routeAgentComputer(
  context: TeamApiRequestContext,
  agentComputer: TeamApiAgentComputer | undefined,
  liveView?: TeamApiComputerLiveView | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (method === "POST" && url.pathname === COMPUTER_LIVE_VIEW_ROUTE) {
    // Any member may ask. `liveView` answers the link only for a machine that this member may open:
    // the key's machines for an owner or admin, and the machines of the member's own account.
    if (!liveView || !capabilities.has(COMPUTER_LIVE_VIEW_CAPABILITY))
      throw new HttpError(400, sourceText("error.team.connectorsUnsupported"));
    const machineId = stringField(await readJson(request), "machineId", false, 108);
    if (!isComputerMachineId(machineId)) throw new HttpError(400, "Invalid machine id.");
    return json(200, { liveViewUrl: await runCauseEffect(liveView(member, machineId)) });
  }
  if (method !== "POST" || !ROUTES.has(url.pathname)) return "unmatched";
  if (!agentComputer || !capabilities.has(AGENT_COMPUTER_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.connectorsUnsupported"));
  requireAdmin(member);
  // `readJson` has already run the body through the `agent-computer-v1` codec.
  const body = await readJson(request);
  switch (url.pathname) {
    case COMPUTER_MANAGEMENT_ROUTE:
      if (!capabilities.has(COMPUTER_MANAGEMENT_CAPABILITY))
        throw new HttpError(400, sourceText("error.team.connectorsUnsupported"));
      return json(200, await runCauseEffect(agentComputer.manage(decodeComputerManagementInput(body))));
    case AGENT_COMPUTER_ROUTES.connect: {
      const apiKey = stringField(body, "apiKey", false, AGENT_COMPUTER_KEY_INPUT_LIMIT).trim();
      registerSecretValue(apiKey);
      return json(200, await runCauseEffect(agentComputer.connect(apiKey)));
    }
    case AGENT_COMPUTER_ROUTES.test:
      return json(200, await runCauseEffect(agentComputer.test()));
    case AGENT_COMPUTER_ROUTES.disconnect:
      return json(200, await runCauseEffect(agentComputer.disconnect()));
    case AGENT_COMPUTER_ROUTES.machines:
      return json(200, await runCauseEffect(agentComputer.machines()));
    default:
      return json(200, agentComputer.status());
  }
}

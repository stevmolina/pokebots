import { BRAIN_CAPABILITY, BRAIN_ROUTE, brainRequestSchema } from "@openbot/contracts/brain";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import type { BrainService } from "../../backend/brain-service";
import type { TeamApiMcpServerOwners, TeamApiMcpServers } from "./dependencies";
import { HttpError } from "./http-error";
import { requireMcpAccess, requireOwnMcpSignIn } from "./mcp-member-access";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson } from "./request-helpers";

export async function routeBrain(
  context: TeamApiRequestContext,
  brain: BrainService | undefined,
  servers: TeamApiMcpServers | undefined,
  owners: TeamApiMcpServerOwners | undefined,
): Promise<RouteOutcome> {
  if (context.method === "POST" && context.url.pathname === BRAIN_ROUTE) {
    if (!brain || !servers || !context.capabilities.has(BRAIN_CAPABILITY))
      throw new HttpError(400, sourceText("error.brain.request"));
    const parsed = brainRequestSchema.safeParse(await readJson(context.request));
    if (!parsed.success) throw new HttpError(400, "Invalid Brain request.");
    const access = requireMcpAccess(context.member, context.capabilities, owners);
    // A shared agent connection is not permission to read another person's private chats.
    requireOwnMcpSignIn(access, servers.listMcpServers(), parsed.data.mcpServerId);
    return context.json(200, await Effect.runPromise(brain.request(parsed.data)));
  }
  return "unmatched";
}

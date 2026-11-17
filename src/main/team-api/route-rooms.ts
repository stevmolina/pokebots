import { ROOMS_CAPABILITY, ROOMS_ROUTE } from "@openbot/contracts/team-protocol/rooms-v1";
import { runCauseEffect } from "../../backend/effect-boundary";
import { decodeRoomsRequest } from "../rooms-inputs";
import type { RoomsService } from "../rooms-service";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin } from "./request-helpers";

export async function routeRooms(
  context: TeamApiRequestContext,
  rooms: RoomsService | undefined,
): Promise<RouteOutcome> {
  if (
    context.method !== "POST" ||
    context.url.pathname !== ROOMS_ROUTE ||
    !rooms ||
    !context.capabilities.has(ROOMS_CAPABILITY)
  )
    return "unmatched";
  requireAdmin(context.member);
  return context.json(200, await runCauseEffect(rooms.execute(decodeRoomsRequest(await readJson(context.request)))));
}

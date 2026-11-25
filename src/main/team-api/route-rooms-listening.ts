import { parseRoomsListeningChange } from "@pokebots/contracts/ipc";
import {
  ROOMS_LISTENING_CAPABILITY,
  ROOMS_LISTENING_ROUTES,
} from "@pokebots/contracts/team-protocol/rooms-listening-v1";
import { sourceText } from "@pokebots/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin } from "./request-helpers";

/**
 * Rooms listening of this server's agents, read and set from a joined server. Only agent ids, names
 * and flags leave the host, never room content. Frozen by `rooms-listening-v1`.
 */
export async function routeRoomsListening(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (
    method !== "POST" ||
    (url.pathname !== ROOMS_LISTENING_ROUTES.settings && url.pathname !== ROOMS_LISTENING_ROUTES.update)
  )
    return "unmatched";
  const setting = admin?.roomsListening;
  if (!setting || !capabilities.has(ROOMS_LISTENING_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.roomsListeningUnsupported"));
  requireAdmin(member);
  const body = await readJson(request);
  if (url.pathname === ROOMS_LISTENING_ROUTES.settings) return json(200, setting.get());
  return json(200, await runCauseEffect(setting.set(parseRoomsListeningChange(body))));
}

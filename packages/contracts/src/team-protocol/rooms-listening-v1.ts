// Frozen optional rooms-listening-v1 wire contract.
//
// What it grants, recorded here because freezing it makes it permanent: an owner or admin of a
// server can read, for each agent of the host, whether the host listens to Rooms for it and whether
// the agent has the Rooms app, and turn listening on or off for one agent. On, the host waits for new
// messages in the Rooms of the host's Rooms sign-in and starts a turn in that agent's chat. The routes
// carry agent ids, names and flags, never room content. A member cannot use either route;
// `requireAdmin` on the host is the only gate. Widening any of it needs a second capability string.
import { decodeRoomsListeningSetting, type RoomsListeningSetting } from "../ipc-rooms-listening";
import { adminRoute, boolean, empty, fields, identifier, list, type OptionalRouteCodec, string } from "./admin-wire";

export const ROOMS_LISTENING_CAPABILITY = "rooms-listening-v1";

export const ROOMS_LISTENING_ROUTES = {
  settings: "/v1/admin/host/rooms-listening",
  update: "/v1/admin/host/rooms-listening/update",
} as const;

const snapshot = fields({
  agents: list(fields({ id: identifier, name: string(200), listening: boolean, roomsConnected: boolean }), 500),
});

export const ROOMS_LISTENING_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [ROOMS_LISTENING_ROUTES.settings, adminRoute(empty, snapshot)],
  [ROOMS_LISTENING_ROUTES.update, adminRoute(fields({ agentId: identifier, listening: boolean }), snapshot)],
]);

/** The setting that a host answers, as the client type. */
export function decodeRoomsListeningResponse(value: unknown): RoomsListeningSetting {
  return decodeRoomsListeningSetting(value);
}

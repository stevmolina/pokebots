// Optional computer-live-view-v1 wire contract.
//
// The Open live view button of a chat card asks the host for the live view link of one cloud computer.
// Any member can ask. The host answers the link only when that member may open the machine: an owner
// or admin for a machine of the host's Agent Computer key, and each person for a machine of their own
// Pokebots account. Otherwise the answer is null, also for a machine that does not exist. The link is
// a bearer credential: only the screen of the person who asked opens it.
import { adminRoute, fields, nullable, type OptionalRouteCodec, string } from "./admin-wire";

export const COMPUTER_LIVE_VIEW_CAPABILITY = "computer-live-view-v1";
export const COMPUTER_LIVE_VIEW_ROUTE = "/v1/agent-computer/live-view";

export const COMPUTER_LIVE_VIEW_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [
    COMPUTER_LIVE_VIEW_ROUTE,
    adminRoute(fields({ machineId: string(108) }), fields({ liveViewUrl: nullable(string(2_048)) })),
  ],
]);

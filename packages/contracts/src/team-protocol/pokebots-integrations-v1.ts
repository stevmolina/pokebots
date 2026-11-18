// Optional protocol 9 routes for the signed-in Pokebots account.

import { adminRoute, count, fields, nullable, type OptionalRouteCodec, oneOf, string } from "./admin-wire";
import { BRAIN_CODECS } from "./brain-v1";
import { ROOMS_CODECS, ROOMS_ROUTE } from "./rooms-v1";

export const POKEBOTS_INTEGRATIONS_CAPABILITY = "pokebots-integrations-v1";
export const POKEBOTS_INTEGRATIONS_ROUTES = {
  authorize: "/v1/integrations/authorize",
  brain: "/v1/integrations/brain",
  rooms: "/v1/integrations/rooms",
  computerAllowance: "/v1/integrations/computer/allowance",
} as const;
export const POKEBOTS_BRAIN_ID = "pokebots-account";

const optionalProfile = { profile: oneOf("native") };
const brainRequest = BRAIN_CODECS.get("/v1/brain/request");
const roomsRequest = ROOMS_CODECS.get(ROOMS_ROUTE);
if (!brainRequest || !roomsRequest) throw new Error("Missing integration route codec.");

export const POKEBOTS_INTEGRATIONS_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [POKEBOTS_INTEGRATIONS_ROUTES.authorize, adminRoute(fields({ grant: string(43) }), fields({ expiresAt: count }))],
  [
    POKEBOTS_INTEGRATIONS_ROUTES.brain,
    {
      request: fields({ request: brainRequest.request }, optionalProfile),
      response: brainRequest.response,
    },
  ],
  [
    POKEBOTS_INTEGRATIONS_ROUTES.rooms,
    {
      request: fields({ request: roomsRequest.request }, optionalProfile),
      response: roomsRequest.response,
    },
  ],
  [
    POKEBOTS_INTEGRATIONS_ROUTES.computerAllowance,
    adminRoute(
      fields({}),
      fields({
        seconds_remaining: nullable(count),
        minutes_remaining: nullable(count),
        resets_at: nullable(string(30)),
      }),
    ),
  ],
]);

import { createFileRoute } from "@tanstack/solid-router";
import { Effect } from "effect";
import { runApiResponse } from "../../../../../../server/effect-runtime";
import {
  json,
  remoteControlPlaneErrorResponse,
  requestIntegrationExchange,
} from "../../../../../../server/request-auth";

export const Route = createFileRoute("/v2/remote/hosts/$hostId/integrations/token")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        runApiResponse(
          Effect.gen(function* () {
            return json(yield* requestIntegrationExchange(request, params.hostId));
          }),
          remoteControlPlaneErrorResponse,
        ),
    },
  },
});

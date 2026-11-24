import { sourceText } from "@pokebots/i18n/source-english";
import { createFileRoute } from "@tanstack/solid-router";
import { Effect } from "effect";
import { runApiResponse } from "../../../../server/effect-runtime";
import {
  apiError,
  authErrorResponse,
  bearerToken,
  json,
  requestAuthService,
  requestIntegrationToken,
} from "../../../../server/request-auth";

export const Route = createFileRoute("/v1/me/integrations/token")({
  server: {
    handlers: {
      POST: ({ request }) =>
        runApiResponse(
          Effect.gen(function* () {
            const token = bearerToken(request);
            const user = token ? yield* requestAuthService().authenticate(token) : null;
            if (!token || !user) return apiError(401, "unauthorized", sourceText("error.auth.signInRequired"));
            return json(yield* requestIntegrationToken(request, user.id, token));
          }),
          authErrorResponse,
        ),
    },
  },
});

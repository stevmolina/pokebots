import { BRAIN_CAPABILITY, BRAIN_ROUTE, type BrainRequest, brainRequestSchema } from "@pokebots/contracts/brain";
import {
  type IntegrationProfile,
  integrationRequest,
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_CAPABILITY,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@pokebots/contracts/team-protocol/pokebots-integrations-v1";
import { sourceText } from "@pokebots/i18n/source";
import { Effect } from "effect";
import type { BrainService } from "../../backend/brain-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { CentralAuthManager } from "../central-auth-manager";
import { currentIntegrationCredential } from "../local-integration-credential";
import { decodeBrainFromHost } from "../remote-brain-decoding";
import type { RemoteServerManager } from "../remote-server-manager";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";
import { isObject } from "./validation";

interface BrainIpcDependencies {
  brain: BrainService;
  centralAuth: CentralAuthManager;
  remoteServers: RemoteServerManager;
}
export function brainIpcHandlers({
  brain,
  centralAuth,
  remoteServers,
}: BrainIpcDependencies): Pick<IpcGroupHandlers, "brain"> {
  return {
    brain: {
      request: scopedHandler(
        (value): BrainRequest & { profile?: IntegrationProfile } => ({
          ...brainRequestSchema.parse(value),
          profile: isObject(value) && value.profile === "native" ? ("native" as const) : undefined,
        }),
        {
          local: ({ profile, ...input }) => {
            const credential =
              input.mcpServerId === POKEBOTS_BRAIN_ID
                ? currentIntegrationCredential(centralAuth, "brain", profile)
                : undefined;
            if (input.mcpServerId === POKEBOTS_BRAIN_ID && !credential)
              throw new Error(sourceText("error.auth.integrationTokensUnavailable"));
            return Effect.runPromise(brain.request(input, credential));
          },
          remote: ({ profile, ...input }, serverId) => {
            if (input.mcpServerId === POKEBOTS_BRAIN_ID) {
              if (!remoteServers.supportsCapability(serverId, POKEBOTS_INTEGRATIONS_CAPABILITY))
                throw new Error(sourceText("error.brain.request"));
              return runCauseEffect(
                remoteServers.request(serverId, POKEBOTS_INTEGRATIONS_ROUTES.brain, decodeBrainFromHost, {
                  method: "POST",
                  body: integrationRequest(input, profile),
                }),
              );
            }
            if (!remoteServers.supportsCapability(serverId, BRAIN_CAPABILITY))
              throw new Error(sourceText("error.brain.request"));
            return runCauseEffect(
              remoteServers.request(serverId, BRAIN_ROUTE, decodeBrainFromHost, { method: "POST", body: input }),
            );
          },
        },
      ),
    },
  };
}

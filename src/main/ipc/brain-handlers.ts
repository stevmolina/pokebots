import { BRAIN_CAPABILITY, BRAIN_ROUTE, brainRequestSchema } from "@openbot/contracts/brain";
import {
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_CAPABILITY,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import type { BrainService } from "../../backend/brain-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { CentralAuthManager } from "../central-auth-manager";
import { currentIntegrationCredential } from "../local-integration-credential";
import { decodeBrainFromHost } from "../remote-brain-decoding";
import type { RemoteServerManager } from "../remote-server-manager";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";

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
      request: scopedHandler((value) => brainRequestSchema.parse(value), {
        local: (input) => {
          const credential =
            input.mcpServerId === POKEBOTS_BRAIN_ID ? currentIntegrationCredential(centralAuth, "brain") : undefined;
          if (input.mcpServerId === POKEBOTS_BRAIN_ID && !credential)
            throw new Error(sourceText("error.auth.integrationTokensUnavailable"));
          return Effect.runPromise(brain.request(input, credential));
        },
        remote: (input, serverId) => {
          if (input.mcpServerId === POKEBOTS_BRAIN_ID) {
            if (!remoteServers.supportsCapability(serverId, POKEBOTS_INTEGRATIONS_CAPABILITY))
              throw new Error(sourceText("error.brain.request"));
            return runCauseEffect(
              remoteServers.request(serverId, POKEBOTS_INTEGRATIONS_ROUTES.brain, decodeBrainFromHost, {
                method: "POST",
                body: { request: input },
              }),
            );
          }
          if (!remoteServers.supportsCapability(serverId, BRAIN_CAPABILITY))
            throw new Error(sourceText("error.brain.request"));
          return runCauseEffect(
            remoteServers.request(serverId, BRAIN_ROUTE, decodeBrainFromHost, { method: "POST", body: input }),
          );
        },
      }),
    },
  };
}

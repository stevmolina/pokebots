import type { RoomsRequest } from "@openbot/contracts/rooms";
import {
  type IntegrationProfile,
  integrationRequest,
  POKEBOTS_INTEGRATIONS_CAPABILITY,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { ROOMS_CAPABILITY, ROOMS_ROUTE } from "@openbot/contracts/team-protocol/rooms-v1";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { CentralAuthManager } from "../central-auth-manager";
import { currentIntegrationCredential } from "../local-integration-credential";
import { decodeRoomsResultFromHost } from "../remote-rooms-decoding";
import { decodeRoomsRequest } from "../rooms-inputs";
import type { RoomsService } from "../rooms-service";
import type { AgentComputerIpcDependencies } from "./agent-computer-handlers";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";
import { isObject } from "./validation";

export interface RoomsIpcDependencies {
  rooms: RoomsService;
  centralAuth: CentralAuthManager;
  remoteServers: AgentComputerIpcDependencies["remoteServers"];
}
export function roomsIpcHandlers({
  rooms,
  centralAuth,
  remoteServers,
}: RoomsIpcDependencies): Pick<IpcGroupHandlers, "rooms"> {
  return {
    rooms: {
      execute: scopedHandler(
        (value): RoomsRequest & { account?: "linked" | IntegrationProfile | "manual" } => {
          const account = isObject(value) ? value.account : undefined;
          return {
            ...decodeRoomsRequest(value),
            account: account === "linked" || account === "native" || account === "manual" ? account : undefined,
          };
        },
        {
          local: ({ account, ...input }) => {
            const credential = currentIntegrationCredential(
              centralAuth,
              "rooms",
              account === "native" ? account : undefined,
            );
            if (account === "manual") return runCauseEffect(rooms.execute(input));
            if (account === "linked" || account === "native") {
              if (!credential) throw new Error(sourceText("error.auth.integrationTokensUnavailable"));
              return runCauseEffect(rooms.execute(input, credential));
            }
            return runCauseEffect(
              rooms.execute(input).pipe(
                Effect.flatMap((legacy) => {
                  if (legacy.connected) return Effect.succeed(legacy);
                  return credential ? rooms.execute(input, credential) : Effect.succeed(legacy);
                }),
              ),
            );
          },
          remote: ({ account, ...input }, serverId) => {
            if (remoteServers.supportsCapability(serverId, POKEBOTS_INTEGRATIONS_CAPABILITY)) {
              return runCauseEffect(
                remoteServers.request(serverId, POKEBOTS_INTEGRATIONS_ROUTES.rooms, decodeRoomsResultFromHost, {
                  method: "POST",
                  body: integrationRequest(input, account === "native" ? account : undefined),
                }),
              );
            }
            if (!remoteServers.supportsCapability(serverId, ROOMS_CAPABILITY))
              throw new Error(sourceText("error.team.connectorsUnsupported"));
            return runCauseEffect(
              remoteServers.request(serverId, ROOMS_ROUTE, decodeRoomsResultFromHost, { method: "POST", body: input }),
            );
          },
        },
      ),
    },
  };
}

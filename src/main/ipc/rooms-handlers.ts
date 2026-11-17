import { ROOMS_CAPABILITY, ROOMS_ROUTE } from "@openbot/contracts/team-protocol/rooms-v1";
import { sourceText } from "@openbot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import { decodeRoomsResultFromHost } from "../remote-rooms-decoding";
import { decodeRoomsRequest } from "../rooms-inputs";
import type { RoomsService } from "../rooms-service";
import type { AgentComputerIpcDependencies } from "./agent-computer-handlers";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";

export interface RoomsIpcDependencies {
  rooms: RoomsService;
  remoteServers: AgentComputerIpcDependencies["remoteServers"];
}
export function roomsIpcHandlers({ rooms, remoteServers }: RoomsIpcDependencies): Pick<IpcGroupHandlers, "rooms"> {
  return {
    rooms: {
      execute: scopedHandler(decodeRoomsRequest, {
        local: (input) => runCauseEffect(rooms.execute(input)),
        remote: (input, serverId) => {
          if (!remoteServers.supportsCapability(serverId, ROOMS_CAPABILITY))
            throw new Error(sourceText("error.team.connectorsUnsupported"));
          return runCauseEffect(
            remoteServers.request(serverId, ROOMS_ROUTE, decodeRoomsResultFromHost, { method: "POST", body: input }),
          );
        },
      }),
    },
  };
}

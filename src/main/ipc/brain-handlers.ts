import { BRAIN_CAPABILITY, BRAIN_ROUTE, brainRequestSchema } from "@openbot/contracts/brain";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import type { BrainService } from "../../backend/brain-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import { decodeBrainFromHost } from "../remote-brain-decoding";
import type { RemoteServerManager } from "../remote-server-manager";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";

interface BrainIpcDependencies {
  brain: BrainService;
  remoteServers: RemoteServerManager;
}
export function brainIpcHandlers({ brain, remoteServers }: BrainIpcDependencies): Pick<IpcGroupHandlers, "brain"> {
  return {
    brain: {
      request: scopedHandler((value) => brainRequestSchema.parse(value), {
        local: (input) => Effect.runPromise(brain.request(input)),
        remote: (input, serverId) => {
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

import {
  decodeAgentComputerAllowanceFromHost,
  decodeAgentComputerMachineListFromHost,
  decodeAgentComputerStatusFromHost,
  decodeComputerLiveViewFromHost,
  decodeComputerManagementResultFromHost,
} from "../remote-agent-computer-decoding";
// The Agent Computer account of a server: read its status, connect an API key, test it, disconnect,
// and list its machines. Each endpoint goes to this computer's service or to a joined server's
// `agent-computer-v1` routes.

import {
  AGENT_COMPUTER_KEY_INPUT_LIMIT,
  decodeAgentComputerAccountAllowance,
  decodeComputerManagementInput,
  isComputerMachineId,
  machineLiveViewUrl,
} from "@openbot/contracts/ipc";
import { AGENT_COMPUTER_CAPABILITY, AGENT_COMPUTER_ROUTES } from "@openbot/contracts/team-protocol/agent-computer-v1";
import {
  COMPUTER_LIVE_VIEW_CAPABILITY,
  COMPUTER_LIVE_VIEW_ROUTE,
} from "@openbot/contracts/team-protocol/computer-live-view-v1";
import {
  COMPUTER_MANAGEMENT_CAPABILITY,
  COMPUTER_MANAGEMENT_ROUTE,
} from "@openbot/contracts/team-protocol/computer-management-v1";
import type { TeamCurrentCapability } from "@openbot/contracts/team-protocol/current";
import {
  POKEBOTS_INTEGRATIONS_CAPABILITY,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { sourceText } from "@openbot/i18n/source";
import { registerSecretValue } from "@openbot/logging";
import { Effect } from "effect";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { AgentComputerService } from "../agent-computer-service";
import type { CentralAuthManager } from "../central-auth-manager";
import { computerLiveViewUrl } from "../computer-live-view";
import { currentIntegrationCredential } from "../local-integration-credential";
import type { ResponseDecoder } from "../remote-host-decoding";
import type { RemoteRequestInit } from "../remote-server-client";
import type { RemoteWorkflowError } from "../remote-service-effects";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler, scopedQueryHandler } from "./scoped-handler";
import { stringPayload } from "./validation";

export interface AgentComputerIpcDependencies {
  centralAuth: CentralAuthManager;
  agentComputer: Pick<
    AgentComputerService,
    "api" | "status" | "connect" | "test" | "disconnect" | "machines" | "manage"
  >;
  remoteServers: {
    supportsCapability(serverId: string, capability: TeamCurrentCapability): boolean;
    request<T>(
      serverId: string,
      path: string,
      decoder: ResponseDecoder<T>,
      init?: RemoteRequestInit,
    ): Effect.Effect<T, RemoteWorkflowError>;
  };
}

const decodeKey = stringPayload("apiKey", AGENT_COMPUTER_KEY_INPUT_LIMIT);

function decodeMachineId(value: unknown): string {
  if (typeof value !== "string" || !isComputerMachineId(value)) throw new Error("Invalid machine id.");
  return value;
}

export function agentComputerIpcHandlers({
  agentComputer,
  centralAuth,
  remoteServers,
}: AgentComputerIpcDependencies): Pick<IpcGroupHandlers, "agentComputer"> {
  function post<T>(serverId: string, path: string, decoder: ResponseDecoder<T>, body: Record<string, string> = {}) {
    if (!remoteServers.supportsCapability(serverId, AGENT_COMPUTER_CAPABILITY))
      throw new Error(sourceText("error.team.connectorsUnsupported"));
    return runCauseEffect(remoteServers.request(serverId, path, decoder, { method: "POST", body }));
  }

  return {
    agentComputer: {
      allowance: scopedQueryHandler({
        local: () => {
          const credential = currentIntegrationCredential(centralAuth, "computer");
          return credential
            ? runCauseEffect(
                agentComputer.api
                  .forAccount(credential)
                  .allowance()
                  .pipe(
                    Effect.map(decodeAgentComputerAccountAllowance),
                    Effect.mapError((failure) => ({ cause: new Error(failure.message) })),
                  ),
              )
            : null;
        },
        remote: (serverId) =>
          remoteServers.supportsCapability(serverId, POKEBOTS_INTEGRATIONS_CAPABILITY)
            ? runCauseEffect(
                remoteServers.request(
                  serverId,
                  POKEBOTS_INTEGRATIONS_ROUTES.computerAllowance,
                  decodeAgentComputerAllowanceFromHost,
                  { method: "POST", body: {} },
                ),
              )
            : null,
      }),
      manage: scopedHandler(decodeComputerManagementInput, {
        local: (input) => runCauseEffect(agentComputer.manage(input)),
        remote: (input, serverId) => {
          if (!remoteServers.supportsCapability(serverId, COMPUTER_MANAGEMENT_CAPABILITY))
            throw new Error(sourceText("error.team.connectorsUnsupported"));
          return post(serverId, COMPUTER_MANAGEMENT_ROUTE, decodeComputerManagementResultFromHost, { ...input });
        },
      }),
      status: scopedQueryHandler({
        local: () => agentComputer.status(),
        remote: (serverId) => post(serverId, AGENT_COMPUTER_ROUTES.status, decodeAgentComputerStatusFromHost),
      }),
      connect: scopedHandler(
        (value) => {
          const apiKey = decodeKey(value).trim();
          registerSecretValue(apiKey);
          return apiKey;
        },
        {
          local: (apiKey) => runCauseEffect(agentComputer.connect(apiKey)),
          remote: (apiKey, serverId) =>
            post(serverId, AGENT_COMPUTER_ROUTES.connect, decodeAgentComputerStatusFromHost, { apiKey }),
        },
      ),
      test: scopedQueryHandler({
        local: () => runCauseEffect(agentComputer.test()),
        remote: (serverId) => post(serverId, AGENT_COMPUTER_ROUTES.test, decodeAgentComputerStatusFromHost),
      }),
      disconnect: scopedQueryHandler({
        local: () => runCauseEffect(agentComputer.disconnect()),
        remote: (serverId) => post(serverId, AGENT_COMPUTER_ROUTES.disconnect, decodeAgentComputerStatusFromHost),
      }),
      machines: scopedQueryHandler({
        local: () => runCauseEffect(agentComputer.machines()),
        remote: async (serverId) => {
          const list = await post(serverId, AGENT_COMPUTER_ROUTES.machines, decodeAgentComputerMachineListFromHost);
          for (const machine of list.machines) if (machine.liveViewUrl) registerSecretValue(machine.liveViewUrl);
          return list;
        },
      }),
      // The Open live view button of a chat card. This computer's person is its owner: the key's machines
      // and the machines of their own signed-in account. A joined host decides who may open each machine
      // (`computer-live-view-v1`); an older host has only the owner or admin machine list.
      liveView: scopedHandler(decodeMachineId, {
        local: (machineId) =>
          runCauseEffect(
            computerLiveViewUrl(
              agentComputer.api,
              { canAdminister: true, credential: currentIntegrationCredential(centralAuth, "computer") },
              machineId,
            ),
          ),
        remote: async (machineId, serverId) => {
          if (remoteServers.supportsCapability(serverId, COMPUTER_LIVE_VIEW_CAPABILITY)) {
            const url = await runCauseEffect(
              remoteServers.request(serverId, COMPUTER_LIVE_VIEW_ROUTE, decodeComputerLiveViewFromHost, {
                method: "POST",
                body: { machineId },
              }),
            );
            if (url) registerSecretValue(url);
            return url;
          }
          const list = await post(serverId, AGENT_COMPUTER_ROUTES.machines, decodeAgentComputerMachineListFromHost);
          for (const machine of list.machines) if (machine.liveViewUrl) registerSecretValue(machine.liveViewUrl);
          return machineLiveViewUrl(list, machineId);
        },
      }),
    },
  };
}

import {
  type AgentComputerAccountAllowance,
  type AgentComputerMachineList,
  type AgentComputerStatus,
  type ComputerManagementInput,
  type ComputerManagementResult,
  decodeAgentComputerAccountAllowance,
  decodeAgentComputerMachineList,
  decodeAgentComputerStatus,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { AGENT_COMPUTER_ROUTES } from "@openbot/contracts/team-protocol/agent-computer-v1";
import { COMPUTER_MANAGEMENT_ROUTE } from "@openbot/contracts/team-protocol/computer-management-v1";
import { POKEBOTS_INTEGRATIONS_ROUTES } from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import type { TeamApiRequest } from "./team-api-requests";

/** Human-only account controls. The transport supplies authentication and capability checks. */
export interface AgentComputerPort {
  manage(input: ComputerManagementInput, serverId: string): Promise<ComputerManagementResult>;
  allowance?(serverId: string): Promise<AgentComputerAccountAllowance | null>;
  status(serverId: string): Promise<AgentComputerStatus>;
  connect(apiKey: string, serverId: string): Promise<AgentComputerStatus>;
  test(serverId: string): Promise<AgentComputerStatus>;
  disconnect(serverId: string): Promise<AgentComputerStatus>;
  machines(serverId: string): Promise<AgentComputerMachineList>;
}

export function createAgentComputerPort(
  request: (serverId: string) => TeamApiRequest,
  usesAccount?: (serverId: string) => boolean,
): AgentComputerPort {
  const status = (serverId: string, path: string, body: { apiKey: string } | Record<string, never> = {}) =>
    request(serverId)("POST", path, decodeAgentComputerStatus, body);
  return {
    allowance: (id) =>
      usesAccount?.(id)
        ? request(id)("POST", POKEBOTS_INTEGRATIONS_ROUTES.computerAllowance, decodeAgentComputerAccountAllowance, {})
        : Promise.resolve(null),
    manage: (input, id) =>
      request(id)(
        "POST",
        COMPUTER_MANAGEMENT_ROUTE,
        (value) => {
          if (
            !isDynamicRecord(value) ||
            (value.screenshot !== null &&
              (typeof value.screenshot !== "string" ||
                value.screenshot.length > 1_500_000 ||
                !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u.test(value.screenshot)))
          )
            throw new Error("Invalid computer screenshot.");
          if (!Array.isArray(value.sizes) || value.sizes.length > 200) throw new Error("Invalid computer sizes.");
          const sizes = value.sizes.map((row: unknown) => {
            if (
              !isDynamicRecord(row) ||
              typeof row.id !== "string" ||
              (row.size !== null && typeof row.size !== "string")
            )
              throw new Error("Invalid computer size.");
            return { id: row.id, size: row.size };
          });
          return { screenshot: value.screenshot, sizes };
        },
        { ...input },
      ),
    status: (id) => status(id, AGENT_COMPUTER_ROUTES.status),
    connect: (apiKey, id) => status(id, AGENT_COMPUTER_ROUTES.connect, { apiKey }),
    test: (id) => status(id, AGENT_COMPUTER_ROUTES.test),
    disconnect: (id) => status(id, AGENT_COMPUTER_ROUTES.disconnect),
    machines: (id) => request(id)("POST", AGENT_COMPUTER_ROUTES.machines, decodeAgentComputerMachineList, {}),
  };
}

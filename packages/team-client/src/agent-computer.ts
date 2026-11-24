import {
  type AgentComputerAccountAllowance,
  type AgentComputerMachineList,
  type AgentComputerStatus,
  type ComputerManagementInput,
  type ComputerManagementResult,
  decodeAgentComputerAccountAllowance,
  decodeAgentComputerMachineList,
  decodeAgentComputerStatus,
  httpsLiveViewUrl,
  machineLiveViewUrl,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { AGENT_COMPUTER_ROUTES } from "@openbot/contracts/team-protocol/agent-computer-v1";
import { COMPUTER_LIVE_VIEW_ROUTE } from "@openbot/contracts/team-protocol/computer-live-view-v1";
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
  /**
   * The https live view link of one machine that this person may open, or null. The link is a bearer
   * credential: open it at once and do not keep it.
   */
  liveView(machineId: string, serverId: string): Promise<string | null>;
}

/**
 * `servesLiveView` is true for a host with `computer-live-view-v1`: it answers the live view link of one
 * machine for any member who may open it. An older host has only the owner or admin machine list.
 */
export function createAgentComputerPort(
  request: (serverId: string) => TeamApiRequest,
  usesAccount?: (serverId: string) => boolean,
  servesLiveView?: (serverId: string) => boolean,
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
    liveView: async (machineId, id) =>
      servesLiveView?.(id)
        ? request(id)("POST", COMPUTER_LIVE_VIEW_ROUTE, decodeLiveView, { machineId })
        : machineLiveViewUrl(
            await request(id)("POST", AGENT_COMPUTER_ROUTES.machines, decodeAgentComputerMachineList, {}),
            machineId,
          ),
  };
}

/** The host's `computer-live-view-v1` answer: an https link, or null. Throws for any other value. */
function decodeLiveView(value: unknown): string | null {
  if (!isDynamicRecord(value) || (value.liveViewUrl !== null && typeof value.liveViewUrl !== "string"))
    throw new Error("Invalid computer live view.");
  const url = httpsLiveViewUrl(value.liveViewUrl);
  if (value.liveViewUrl !== null && url === null) throw new Error("Invalid computer live view.");
  return url;
}

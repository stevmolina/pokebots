import type { AgentComputerMachineList, AgentComputerStatus } from "@openbot/contracts/ipc";
import { AGENT_COMPUTER_MACHINE_LIMIT, decodeAgentComputerAccountAllowance } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

const nullableString = (value: unknown): value is string | null => value === null || isString(value);

/** Throws for a value that is not a status. */
export function decodeAgentComputerStatusFromHost(value: unknown): AgentComputerStatus {
  if (
    !isDynamicRecord(value) ||
    typeof value.connected !== "boolean" ||
    !nullableString(value.keyHint) ||
    !nullableString(value.error)
  )
    throw new Error("Invalid Agent Computer status.");
  return { connected: value.connected, keyHint: value.keyHint, error: value.error };
}

/** Throws for a value that is not a machine list. */
export function decodeAgentComputerMachineListFromHost(value: unknown): AgentComputerMachineList {
  if (!isDynamicRecord(value) || !Array.isArray(value.machines) || value.machines.length > AGENT_COMPUTER_MACHINE_LIMIT)
    throw new Error("Invalid Agent Computer machine list.");
  return {
    machines: value.machines.map((row: unknown) => {
      if (
        !isDynamicRecord(row) ||
        !isString(row.id) ||
        !isString(row.context) ||
        !isString(row.status) ||
        !nullableString(row.deadlineAt) ||
        !nullableString(row.liveViewUrl) ||
        !nullableString(row.updatedAt)
      )
        throw new Error("Invalid Agent Computer machine.");
      return {
        id: row.id,
        context: row.context,
        status: row.status,
        deadlineAt: row.deadlineAt,
        liveViewUrl: row.liveViewUrl,
        updatedAt: row.updatedAt,
      };
    }),
  };
}

export function decodeComputerManagementResultFromHost(value: unknown): {
  screenshot: string | null;
  sizes: { id: string; size: string | null }[];
} {
  if (
    !isDynamicRecord(value) ||
    !nullableString(value.screenshot) ||
    (value.screenshot !== null &&
      (value.screenshot.length > 1_500_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u.test(value.screenshot)))
  )
    throw new Error("Invalid computer screenshot.");
  if (!Array.isArray(value.sizes) || value.sizes.length > 200) throw new Error("Invalid computer sizes.");
  const sizes = value.sizes.map((row: unknown) => {
    if (!isDynamicRecord(row) || !isString(row.id) || !nullableString(row.size))
      throw new Error("Invalid computer size.");
    return { id: row.id, size: row.size };
  });
  return { screenshot: value.screenshot, sizes };
}

export function decodeAgentComputerAllowanceFromHost(value: unknown) {
  return decodeAgentComputerAccountAllowance(value);
}

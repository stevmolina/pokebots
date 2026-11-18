import {
  type AgentComputerMachine,
  type AgentComputerStatus,
  DISCONNECTED_AGENT_COMPUTER,
  type OpenBotDesktopApi,
} from "@openbot/contracts/ipc";

/** The Agent Computer account of each server. Any key connects; the list has one running and one paused computer. */
export function createMockAgentComputer(): OpenBotDesktopApi["agentComputer"] {
  const statuses = new Map<string, AgentComputerStatus>();
  const status = (serverId: string) => statuses.get(serverId) ?? DISCONNECTED_AGENT_COMPUTER;
  const machines = (): AgentComputerMachine[] => [
    {
      id: "sbx_preview_work",
      context: "work",
      status: "running",
      deadlineAt: new Date(Date.now() + 40 * 60_000).toISOString(),
      liveViewUrl: "https://computer.mcpbox.dev/live/preview",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "sbx_preview_video",
      context: "video",
      status: "paused",
      deadlineAt: null,
      liveViewUrl: "https://computer.mcpbox.dev/live/preview-video",
      updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    },
  ];
  const registry = machines();
  return {
    allowance: async () => null,
    manage: async (input) => {
      if (input.operation === "start") {
        const machine = registry.find((row) => row.context === input.target);
        if (machine) machine.status = "running";
        else
          registry.push({
            id: `preview-${input.target}`,
            context: input.target,
            status: "running",
            deadlineAt: null,
            liveViewUrl: null,
            updatedAt: null,
          });
      } else if (input.operation === "stop") {
        const machine = registry.find((row) => row.id === input.target);
        if (machine) machine.status = "paused";
      } else if (input.operation === "destroy") {
        const index = registry.findIndex((row) => row.id === input.target);
        if (index >= 0) registry.splice(index, 1);
      }
      return { screenshot: null, sizes: registry.map((row) => ({ id: row.id, size: "standard" })) };
    },
    status: async (serverId) => status(serverId),
    connect: async (apiKey, serverId) => {
      const next = { connected: true, keyHint: apiKey.slice(0, 12), error: null };
      statuses.set(serverId, next);
      return next;
    },
    test: async (serverId) => status(serverId),
    disconnect: async (serverId) => {
      statuses.delete(serverId);
      return DISCONNECTED_AGENT_COMPUTER;
    },
    machines: async (serverId) => ({ machines: status(serverId).connected ? registry.map((row) => ({ ...row })) : [] }),
  };
}

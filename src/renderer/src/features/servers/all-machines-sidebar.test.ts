import { SIDEBAR_UNASSIGNED_SECTION_ID, type SidebarLayoutSnapshot } from "@openbot/contracts/ipc";
import type { AgentProfile } from "@openbot/ui/data";
import { describe, expect, it } from "vitest";
import { type AllMachinesSource, allMachinesSearchAgents, mergeAllMachinesSidebar } from "./all-machines-sidebar";

function makeAgent(id: string, name: string): AgentProfile {
  return {
    id,
    name,
    title: "",
    description: "",
    notifications: true,
    provider: "codex",
    model: "gpt-5",
    reasoningEffort: "medium",
    threadId: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
    time: "",
    preview: "",
  };
}

function makeLayout(
  sections: SidebarLayoutSnapshot["sections"],
  agentAssignments: Record<string, string>,
  agentOrder: string[],
): SidebarLayoutSnapshot {
  return {
    revision: 1,
    sections,
    order: [...sections.map((section) => section.id), SIDEBAR_UNASSIGNED_SECTION_ID],
    agentAssignments,
    agentOrder,
  };
}

describe("allMachinesSearchAgents", () => {
  const sources: AllMachinesSource[] = [
    {
      serverId: "vps-1",
      agents: [makeAgent("bot-1", "Pokebot"), makeAgent("bot-2", "Notes")],
      agentStates: {},
      agentMoods: {},
      layout: makeLayout([{ id: "sec-work", name: "Work" }], { "bot-1": "sec-work" }, ["bot-1", "bot-2"]),
    },
    {
      serverId: "vps-2",
      agents: [makeAgent("bot-1", "Halo"), makeAgent("bot-3", "Ops")],
      agentStates: {},
      agentMoods: {},
      layout: makeLayout([{ id: "sec-infra", name: "Infra" }], { "bot-3": "sec-infra" }, ["bot-3", "bot-1"]),
    },
  ];

  it("includes bots from every machine in sidebar section order and maps each id back to its server", () => {
    const merged = mergeAllMachinesSidebar({
      sources,
      activeServerId: "vps-1",
      filter: null,
    });
    const ordered = allMachinesSearchAgents(merged);

    expect(ordered.map((agent) => agent.name)).toEqual(["Pokebot", "Ops", "Notes", "Halo"]);
    expect(ordered.map((agent) => merged.agentServers.get(agent.id))).toEqual([
      { serverId: "vps-1", agentId: "bot-1" },
      { serverId: "vps-2", agentId: "bot-3" },
      { serverId: "vps-1", agentId: "bot-2" },
      { serverId: "vps-2", agentId: "bot-1" },
    ]);
  });

  it("limits search agents to the chosen machine when a filter is set", () => {
    const merged = mergeAllMachinesSidebar({
      sources,
      activeServerId: "vps-1",
      filter: "vps-2",
    });
    const ordered = allMachinesSearchAgents(merged);

    expect(ordered.map((agent) => agent.name)).toEqual(["Ops", "Halo"]);
    expect(ordered.every((agent) => merged.agentServers.get(agent.id)?.serverId === "vps-2")).toBe(true);
  });
});

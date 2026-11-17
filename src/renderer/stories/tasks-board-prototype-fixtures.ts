/**
 * The data of the Tasks board prototype: five agents on two servers and twenty tasks in every state.
 * The list and the three board variants show the same tasks, so the comparison is of design only.
 */

import type { AgentTask, ClientAgentSummary, ConversationSnapshot } from "@openbot/contracts/ipc";
import type { AgentProfile } from "@openbot/ui/data";
import type { ServerMarkServer } from "@openbot/ui/features/servers/ServerRail";
import type { MockOpenBotOptions } from "../src/preview/mock-openbot";
import { STORY_AGENT_SUMMARIES } from "./fixtures";

const MINUTE = 60_000;
/* The real clock, so the times read as recent. */
const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * MINUTE).toISOString();

const EXTRA_AGENTS: ClientAgentSummary[] = [
  {
    id: "ops",
    provider: "claude",
    name: "Ops",
    title: "Infrastructure",
    description: "Keeps the servers, backups and deploys healthy.",
    notifications: true,
    model: "claude-sonnet-5",
    reasoningEffort: "medium",
    access: "full",
    threadId: "thread-ops",
    workspacePath: "/mock/OpenBot/Agents/ops",
    preview: "The backup job finished.",
    updatedAt: ago(30),
    avatarSeed: "ops",
    avatarHue: 30,
    avatarUrl: null,
  },
  {
    id: "design",
    provider: "codex",
    name: "Design",
    title: "Product designer",
    description: "Makes the screens, assets and illustrations.",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    access: "workspace",
    threadId: "thread-design",
    workspacePath: "/mock/OpenBot/Agents/design",
    preview: "The assets are exported.",
    updatedAt: ago(40),
    avatarSeed: "design",
    avatarHue: 150,
    avatarUrl: null,
  },
];

export const BOARD_AGENT_SUMMARIES: ClientAgentSummary[] = [...STORY_AGENT_SUMMARIES, ...EXTRA_AGENTS];

export const BOARD_AGENTS: AgentProfile[] = BOARD_AGENT_SUMMARIES.map((agent) => ({
  id: agent.id,
  provider: agent.provider,
  name: agent.name,
  title: agent.title,
  description: agent.description,
  notifications: agent.notifications,
  model: agent.model,
  reasoningEffort: agent.reasoningEffort,
  threadId: agent.threadId,
  workspacePath: agent.workspacePath,
  avatarSeed: agent.avatarSeed,
  avatarHue: agent.avatarHue,
  avatarUrl: agent.avatarUrl,
  time: "",
  preview: agent.preview,
}));

/** The two servers of the All machines view. */
export const BOARD_SERVERS: Record<"local" | "studio", ServerMarkServer & { name: string }> = {
  local: { id: "local", name: "This computer", logoUrl: null, kind: "local" },
  studio: { id: "studio-vps", name: "Studio VPS", logoUrl: null, kind: "remote" },
};

type TaskSeed = Pick<AgentTask, "id" | "agentId" | "title" | "state"> & Partial<AgentTask>;

function seedTask(seed: TaskSeed): AgentTask {
  return {
    threadId: `${seed.id}-thread`,
    origin: "user",
    outcome: null,
    hold: null,
    activeTurnId: seed.state === "running" ? `${seed.id}-turn` : null,
    progress: null,
    error: null,
    queuedMessages: [],
    createdAt: ago(240),
    updatedAt: ago(10),
    closedAt: null,
    ...seed,
  };
}

const queued = (id: string, text: string, minutes: number) => [
  { deliveryId: `${id}-delivery`, text, createdAt: ago(minutes) },
];

export const BOARD_TASKS: AgentTask[] = [
  // Needs you: the last turn ended.
  seedTask({
    id: "hiring-loops",
    agentId: "chief",
    title: "Summarise the open hiring loops for the design lead role",
    state: "idle",
    outcome: "completed",
    updatedAt: ago(6),
  }),
  seedTask({
    id: "citations",
    agentId: "research",
    title: "Pull the citation counts for the twelve papers in the reading list",
    state: "idle",
    outcome: "failed",
    error: "Semantic Scholar returned 429 Too Many Requests.",
    updatedAt: ago(14),
  }),
  seedTask({
    id: "ios-assets",
    agentId: "design",
    title: "Export the onboarding illustrations at 1x, 2x and 3x for the iOS asset catalog",
    state: "idle",
    outcome: "completed",
    updatedAt: ago(32),
  }),
  seedTask({
    id: "crm-cleanup",
    agentId: "sales",
    title: "Clean the CRM export and remove duplicate contacts",
    state: "idle",
    outcome: "interrupted",
    updatedAt: ago(48),
  }),
  seedTask({
    id: "db-password",
    agentId: "ops",
    title: "Rotate the staging database password and update the deploy secrets",
    state: "idle",
    outcome: "completed",
    updatedAt: ago(55),
  }),
  // Working: a turn runs.
  seedTask({
    id: "board-update",
    agentId: "chief",
    title:
      "Draft the Q4 board update from the finance notes, last month's product metrics and the hiring plan, and flag the three open risks that the leadership team raised on Monday",
    state: "running",
    progress: "Reading finance-notes.md",
    updatedAt: ago(1),
  }),
  seedTask({
    id: "papers",
    agentId: "research",
    title: "Find recent papers on retrieval for long documents",
    state: "running",
    progress: "Searching arxiv.org",
    updatedAt: ago(2),
  }),
  seedTask({
    id: "backup-job",
    agentId: "ops",
    title: "Check why the nightly backup job took three hours on Sunday",
    state: "running",
    progress: "Reading backup.log",
    updatedAt: ago(3),
  }),
  seedTask({
    id: "webinar-leads",
    agentId: "sales",
    title: "Write follow-up emails for the five leads from the webinar",
    state: "running",
    progress: "Writing email 3 of 5",
    updatedAt: ago(4),
  }),
  // Queued: the next message waits to start, or the task has not started.
  seedTask({
    id: "lease-offers",
    agentId: "chief",
    title: "Compare the three office lease offers and list the risks of each",
    state: "queued",
    hold: "task-limit",
    queuedMessages: queued("lease-offers", "Compare the three office lease offers", 3),
    updatedAt: ago(3),
  }),
  seedTask({
    id: "pricing-dark",
    agentId: "design",
    title: "Make a dark version of the pricing page hero",
    state: "queued",
    hold: "task-limit",
    queuedMessages: queued("pricing-dark", "Make a dark version of the pricing page hero", 5),
    updatedAt: ago(5),
  }),
  seedTask({
    id: "contoso",
    agentId: "sales",
    title: "Find the decision makers at Contoso and Fabrikam",
    state: "queued",
    hold: "task-limit",
    queuedMessages: queued("contoso", "Find the decision makers at Contoso and Fabrikam", 7),
    updatedAt: ago(7),
  }),
  seedTask({
    id: "benchmarks",
    agentId: "research",
    origin: "agent",
    title: "Check the benchmark numbers in the draft against the source tables",
    state: "idle",
    updatedAt: ago(20),
  }),
  // Done: closed.
  seedTask({
    id: "offsite",
    agentId: "chief",
    title: "Make a shortlist of venues for the team offsite",
    state: "closed",
    outcome: "completed",
    closedAt: ago(75),
  }),
  seedTask({
    id: "northwind",
    agentId: "sales",
    title: "Prepare the call notes for Northwind Traders",
    state: "closed",
    outcome: "completed",
    closedAt: ago(130),
  }),
  seedTask({
    id: "type-pairings",
    agentId: "design",
    title: "Pick three type pairings for the new docs site",
    state: "closed",
    outcome: "completed",
    closedAt: ago(180),
  }),
  seedTask({
    id: "tls-renew",
    agentId: "ops",
    title: "Renew the TLS certificate of the status page",
    state: "closed",
    outcome: "completed",
    closedAt: ago(300),
  }),
  seedTask({
    id: "mamba",
    agentId: "research",
    title: "Read the Mamba paper and note the main claims",
    state: "closed",
    outcome: "completed",
    closedAt: ago(60 * 26),
  }),
  seedTask({
    id: "lisbon-flights",
    agentId: "chief",
    title: "Book the flights for the Lisbon offsite",
    state: "closed",
    outcome: "completed",
    closedAt: ago(60 * 50),
  }),
];

/** The server of each task. In the All machines view, a card shows its server mark. */
const STUDIO_TASKS = new Set([
  "citations",
  "db-password",
  "papers",
  "backup-job",
  "contoso",
  "benchmarks",
  "tls-renew",
  "mamba",
]);
export const serverOfTask = (task: AgentTask) =>
  STUDIO_TASKS.has(task.id) ? BOARD_SERVERS.studio : BOARD_SERVERS.local;

function conversationOf(task: AgentTask): ConversationSnapshot {
  return {
    agentId: task.agentId,
    threadId: task.threadId,
    activeTurnId: task.activeTurnId,
    revision: 1,
    messages: [
      {
        id: `${task.id}-ask`,
        author: "user",
        source: "user",
        text: task.title,
        createdAt: task.createdAt,
        status: "completed",
      },
      ...(task.outcome
        ? [
            {
              id: `${task.id}-reply`,
              author: "assistant" as const,
              source: "assistant" as const,
              text:
                task.outcome === "failed"
                  ? "I started, but the service stopped my requests."
                  : "Done. The result is in my workspace.",
              createdAt: task.updatedAt,
              status: "completed" as const,
            },
          ]
        : []),
    ],
  };
}

/** The preview mock with the board agents and tasks, so the real list and side panel show them. */
export const BOARD_APP_OPTIONS: MockOpenBotOptions = {
  agents: BOARD_AGENT_SUMMARIES,
  tasks: BOARD_TASKS.reduce<Record<string, AgentTask[]>>((byAgent, task) => {
    byAgent[task.agentId] = [...(byAgent[task.agentId] ?? []), task];
    return byAgent;
  }, {}),
  taskConversations: Object.fromEntries(BOARD_TASKS.map((task) => [task.id, conversationOf(task)])),
};

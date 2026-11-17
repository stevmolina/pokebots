import { avatarHeadColor } from "@openbot/brand/bloub-avatar";
import type { AvatarColor, AvatarHue } from "@openbot/contracts/ipc";
import { router } from "expo-router";
import { useMemo } from "react";
import { useAgentThreadReads } from "@/features/chat/components/use-agent-thread-reads";
import { useOpenAgentTasks } from "@/features/chat/components/use-open-agent-tasks";
import { useMobileWorkspaceSelector } from "@/features/workspace/context/mobile-workspace-context";
import { haptics } from "@/shared/lib/haptics";

/** The agent's own chat in the session list. It is not a task: the agent chat screen shows it. */
export const MAIN_THREAD_ID = "main";
/** The task id of a new session before its first message starts it, as the desktop new session. */
export const DRAFT_THREAD_ID = "new";

/** The agent's name in the chat header, which opens its sessions, and the sessions that need the person. */
export interface ChatThreadMenu {
  /** Opens the sessions sheet. */
  open: () => void;
  /** The open sessions, other than the one on the screen, with agent messages that the person has not read. */
  attention: number;
  /** The agent's color, for the dot of an unread session. */
  color: string;
}

/**
 * The sessions of an agent, from its name in the chat header: a sheet with the main session first,
 * the other sessions, a new session, all sessions and the agent's info. `activeId` is the session on
 * the screen: `MAIN_THREAD_ID` in the agent's chat, `DRAFT_THREAD_ID`, or a task id. Undefined on a
 * host without `agent-tasks-v1`; the agent's name then opens the agent's info, as before.
 */
export function useChatThreadMenu(
  agent: {
    id: string;
    serverId: string;
    avatarSeed: string;
    avatarHue: AvatarHue | null;
    avatarColor: AvatarColor | null;
  },
  activeId: string,
): ChatThreadMenu | undefined {
  const supported = useMobileWorkspaceSelector((current) => current.canUseTasks(agent.serverId));
  const tasks = useOpenAgentTasks(agent.serverId, agent.id);
  const reads = useAgentThreadReads(agent.serverId, agent.id);
  const agentColor = avatarHeadColor(agent.avatarSeed, agent.avatarHue, agent.avatarColor);
  return useMemo(() => {
    if (!supported) return undefined;
    const unread = (taskId: string) => taskId !== activeId && (reads.get(taskId)?.unreadCount ?? 0) > 0;
    const open = () => {
      void haptics.impact("soft");
      router.push({
        pathname: "/agent-sessions",
        params: { serverId: agent.serverId, agentId: agent.id, activeId },
      });
    };
    const attention = tasks.filter((task) => task.id !== activeId && unread(task.id)).length;
    return { open, attention, color: agentColor };
  }, [supported, tasks, reads, agentColor, activeId, agent.id, agent.serverId]);
}

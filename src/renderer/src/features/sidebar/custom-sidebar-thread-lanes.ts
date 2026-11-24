import type { AgentProfile } from "@pokebots/ui/data";
import { threadTabKey } from "@pokebots/ui/features/conversation/threads/thread-types";
import type { SidebarThreadLanes } from "@pokebots/ui/features/sidebar/sidebar-types";
import { createEffect } from "solid-js";
import { useNavigation } from "../../navigation";
import { useAgentTasks } from "../agent-tasks/agent-tasks-context";
import { useAgentThreads } from "../agent-threads/agent-threads-context";
import { createThreadActivity } from "../agent-threads/thread-activity";

/**
 * OpenBot Custom: the thread lanes of the sidebar. They live here, so the upstream sidebar host keeps
 * one hook call and one prop.
 */
export function useCustomSidebarThreadLanes(input: {
  agentList: () => readonly AgentProfile[];
  activeServerId: () => string;
  /** The agent whose chat shows now, or undefined while a channel or a person shows. */
  shownAgent: () => AgentProfile | undefined;
  /** The agent works now. Its thread list loads before the others. */
  working: (agentId: string) => boolean;
}): () => SidebarThreadLanes {
  const { openAgentThread } = useNavigation();
  const agentTasks = useAgentTasks();
  const agentThreads = useAgentThreads();
  const threadActivity = createThreadActivity();
  /**
   * The lanes list the threads of every agent, so each agent's thread list loads once per server.
   * Events keep a loaded list current. These lists load in the background, a few at a time and after
   * the open chat: on a joined server, 50 list reads at once made the chat wait behind them.
   */
  const requestedThreadLists = new Set<string>();
  createEffect(
    () =>
      agentTasks.available()
        ? input
            .agentList()
            .map((agent) => `${input.activeServerId()}/${agent.id}`)
            .filter((key) => !requestedThreadLists.has(key))
        : [],
    (keys) => {
      for (const key of keys) requestedThreadLists.add(key);
      agentTasks.loadTasksInBackground(
        keys.map((key) => key.slice(key.indexOf("/") + 1)),
        input.working,
      );
    },
  );
  return () => {
    const agent = input.shownAgent();
    return {
      threads: threadActivity.entries(),
      latestThreadUpdatedAt: threadActivity.latestThreadUpdatedAt(),
      activeKey: agent ? threadTabKey(agent.id, agentThreads.activeId(agent.id)) : null,
      unreadAgentIds: threadActivity.unreadAgentIds(),
      onOpenThread: openAgentThread,
    };
  };
}

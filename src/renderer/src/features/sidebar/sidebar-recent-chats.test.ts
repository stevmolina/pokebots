import { sidebarRecentChats } from "@pokebots/ui/features/sidebar/sidebar-recent-chats";
import type { SidebarChatItem, SidebarThreadEntry } from "@pokebots/ui/features/sidebar/sidebar-types";
import { expect, it } from "vitest";

function agentChat(id: string, name: string, updatedAt: string | null): SidebarChatItem {
  return {
    kind: "agent",
    id,
    agent: {
      id,
      name,
      title: "",
      description: "",
      notifications: true,
      provider: "codex",
      model: "gpt-5",
      reasoningEffort: "medium",
      threadId: `thread-${id}`,
      workspacePath: `/tmp/${id}`,
      avatarSeed: id,
      avatarHue: null,
      avatarUrl: null,
      updatedAt,
      time: "",
      preview: "",
    },
  };
}

it("orders done bots by last used across main chats, active threads, and finished side threads", () => {
  const chats = [
    agentChat("portfolio", "Portfolio", "2026-11-20T22:22:50.151Z"),
    agentChat("pokebot", "Pokebot", "2026-11-20T20:02:01.462Z"),
    agentChat("puppets", "Master of Puppets", "2026-11-19T14:52:52.149Z"),
    agentChat("posts", "Posts", "2026-11-18T23:49:48.978Z"),
  ];

  // Finished side threads are no longer in active `threads`, so they come via `latestThreadUpdatedAt`.
  const activeThreads: SidebarThreadEntry[] = [];
  const latestThreadUpdatedAt = {
    pokebot: "2026-11-22T23:12:41.768Z",
    puppets: "2026-11-22T23:15:34.195Z",
  };

  const ordered = sidebarRecentChats(chats, activeThreads, latestThreadUpdatedAt);
  expect(ordered.map((item) => item.id)).toEqual(["puppets", "pokebot", "portfolio", "posts"]);
});

it("keeps active thread timestamps ahead of older main-chat timestamps", () => {
  const chats = [
    agentChat("older", "Older", "2026-11-20T10:00:00.000Z"),
    agentChat("newer-main", "Newer Main", "2026-11-21T10:00:00.000Z"),
  ];
  const activeThreads: SidebarThreadEntry[] = [
    {
      agentId: "older",
      threadId: "task-1",
      title: "Active work",
      state: { kind: "working" },
      updatedAt: "2026-11-22T10:00:00.000Z",
    },
  ];

  const ordered = sidebarRecentChats(chats, activeThreads);
  expect(ordered.map((item) => item.id)).toEqual(["older", "newer-main"]);
});

/**
 * The featured agent at the top of the list: a centered face with its name and a star, as the Grok Bot
 * desktop app and the iOS app show their main bot. It is the first pinned agent. The phone list falls
 * back to the first agent of the server, so its list is never without one. A click opens its chat, and
 * the tile has the menu of the agent, so pinning, muting and the rest stay in reach. On the desktop and
 * the web client the pinned group does not repeat the agent. The phone list keeps it there.
 */

import { buttonVariants, ContextMenu, Star } from "@openbot/ui";
import { createMemo, createSignal, Show } from "solid-js";
import type { AgentProfile } from "../../data";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import { SidebarAgentContextMenu } from "./SidebarAgentContextMenu";
import { sidebarAgentStateLabel } from "./sidebar-filtering";
import { sidebarPinnedItemKey } from "./sidebar-pins";
import { useSidebarScope } from "./sidebar-scope";

/** The agent of the tile, and the key of its pin when it is pinned. */
export function useSidebarFeaturedAgent() {
  const { props, resolvedPinnedItems } = useSidebarScope();
  return createMemo((): { agent: AgentProfile; pinnedKey: string | undefined } | undefined => {
    // The "All machines" view mixes servers, so no one agent is the main one.
    if (props.allMachines) return undefined;
    for (const item of resolvedPinnedItems()) {
      if (item.chat.kind === "agent") return { agent: item.chat.agent, pinnedKey: sidebarPinnedItemKey(item.ref) };
    }
    const fallback = props.largeTitle ? props.agents[0] : undefined;
    return fallback ? { agent: fallback, pinnedKey: undefined } : undefined;
  });
}

export function SidebarFeaturedAgent() {
  const { props } = useSidebarScope();
  const { t, format } = useText();
  const featured = useSidebarFeaturedAgent();
  /** What the agent waits for, as the pinned row says it, so a screen reader hears it on the tile too. */
  const stateLabel = (agentId: string) => {
    const state = props.agentStates[agentId];
    return state?.kind === "routine" || state?.kind === "waiting" || state?.kind === "limited"
      ? sidebarAgentStateLabel(state, t, format)
      : "";
  };
  const tileLabel = (agent: AgentProfile) => {
    if (props.largeTitle) return undefined;
    const state = stateLabel(agent.id);
    if (state) return t("sidebar.pinned.agentWithState", { name: agent.name, state });
    return unread(agent.id) ? `${agent.name}. ${t("sidebar.chat.unread")}` : undefined;
  };
  const [menuOpen, setMenuOpen] = createSignal(false);
  const unread = (agentId: string) =>
    props.agentStates[agentId]?.kind === "unread" || (props.threadLanes?.unreadAgentIds.has(agentId) ?? false);
  return (
    <Show when={featured()}>
      {(tile) => (
        <div class="sidebar-featured" data-menu-open={menuOpen() ? "" : undefined}>
          <ContextMenu.Root modal={false} onOpenChange={setMenuOpen}>
            <ContextMenu.Trigger
              as="button"
              type="button"
              class={[buttonVariants({ variant: "ghost" }), "sidebar-featured-button"]}
              aria-label={tileLabel(tile().agent)}
              aria-current={props.activeAgentId === tile().agent.id ? "page" : undefined}
              onClick={() => props.onSelectAgent(tile().agent.id)}
            >
              <span class="sidebar-featured-avatar">
                <AgentAvatar agent={tile().agent} motion="idle" mood={props.agentMoods[tile().agent.id] ?? "idle"} />
                <span class="sidebar-featured-badge" aria-hidden="true">
                  <Star />
                </span>
              </span>
              <span class="sidebar-featured-name">{tile().agent.name}</span>
              <Show when={!props.largeTitle && unread(tile().agent.id)}>
                <span class="sidebar-featured-unread" aria-hidden="true" />
              </Show>
            </ContextMenu.Trigger>
            <Show when={tile().pinnedKey !== undefined}>
              <SidebarAgentContextMenu agent={tile().agent} pinned />
            </Show>
          </ContextMenu.Root>
        </div>
      )}
    </Show>
  );
}

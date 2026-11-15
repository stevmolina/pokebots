/**
 * The featured agent at the top of the phone list: a large face with its name, centered, as the home
 * of the iOS app shows its main bot. It is the first pinned agent, or else the agent of the newest chat.
 * A tap opens its chat.
 */

import { Button, Star } from "@openbot/ui";
import { createMemo, Show } from "solid-js";
import type { AgentProfile } from "../../data";
import { AgentAvatar } from "../agents/AgentAvatar";
import { useSidebarScope } from "./sidebar-scope";

export function SidebarFeaturedAgent() {
  const { props, resolvedPinnedItems } = useSidebarScope();
  const agent = createMemo((): AgentProfile | undefined => {
    for (const item of resolvedPinnedItems()) if (item.chat.kind === "agent") return item.chat.agent;
    return props.agents[0];
  });
  return (
    <Show when={props.allMachines ? undefined : agent()}>
      {(featured) => (
        <div class="sidebar-featured">
          <Button
            variant="ghost"
            type="button"
            class="sidebar-featured-button"
            aria-current={props.activeAgentId === featured().id ? "page" : undefined}
            onClick={() => props.onSelectAgent(featured().id)}
          >
            <span class="sidebar-featured-avatar">
              <AgentAvatar agent={featured()} motion="idle" mood={props.agentMoods[featured().id] ?? "idle"} />
              <span class="sidebar-featured-badge" aria-hidden="true">
                <Star />
              </span>
            </span>
            <span class="sidebar-featured-name">{featured().name}</span>
          </Button>
        </div>
      )}
    </Show>
  );
}

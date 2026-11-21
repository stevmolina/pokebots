/**
 * The right-click menu on an agent, in the pinned group and in a section alike. Filing the agent
 * away is `SidebarMoveToSubmenu`, which the channel menu shows too; everything here is agent-only.
 */

import {
  AppWindow,
  Bell,
  BellOff,
  CheckCheck,
  ChevronRight,
  CircleDot,
  ContextMenu,
  Copy,
  Ellipsis,
  MessageCirclePlus,
  Moon,
  Pin,
  PinOff,
  RotateCcw,
  Star,
} from "@pokebots/ui";
import { Show } from "solid-js";
import type { AgentProfile } from "../../data";
import { useText } from "../../text";
import { DeleteIcon, EditIcon } from "./SidebarIcons";
import { SidebarMoveToSubmenu } from "./SidebarMoveToSubmenu";
import { type SidebarPinnedItem, sidebarPinnedItemKey } from "./sidebar-pins";
import { useSidebarScope } from "./sidebar-scope";

/**
 * The menu stays at about eight rows. Pin, read state, a new thread, Move to and Edit stay on top, with
 * Make main agent where it applies and Delete last. Mute, Open in new window, Duplicate and Hide sit
 * under More. `userHidden` swaps the hide item for a restore item that names the section the agent
 * goes back to; Restore stays on top, since it is the one thing a hidden agent needs.
 */
export function SidebarAgentContextMenu(menuProps: {
  agent: AgentProfile;
  pinned: boolean;
  userHidden?: boolean;
  /** Set on a pinned agent that is not the tile at the top: the item moves it before the tile's agent. */
  mainAgentId?: string;
}) {
  const { chatPinnedItems, customSectionById, openDelete, props } = useSidebarScope();
  const { t } = useText();
  const ref = (): SidebarPinnedItem => ({ kind: "agent", id: menuProps.agent.id });
  const unread = () => props.unreadAgentIds?.has(menuProps.agent.id) ?? false;
  const muted = () => props.mutedAgentIds?.has(menuProps.agent.id) ?? false;
  const restoreLabel = () => {
    const assigned = props.layout.agentAssignments[menuProps.agent.id];
    const section = assigned ? customSectionById().get(assigned) : undefined;
    return section ? t("sidebar.agentMenu.restoreTo", { section: section.name }) : t("sidebar.agentMenu.restore");
  };
  /** The tile shows the first pinned agent, so moving this pin before the tile's pin makes it the main agent. */
  const makeMain = (mainAgentId: string) => {
    const items = [...chatPinnedItems()];
    const sourceIndex = items.findIndex((item) => sidebarPinnedItemKey(item) === sidebarPinnedItemKey(ref()));
    if (sourceIndex < 0) return;
    const [source] = items.splice(sourceIndex, 1);
    const targetIndex = items.findIndex((item) => item.kind === "agent" && item.id === mainAgentId);
    if (!source || targetIndex < 0) return;
    items.splice(targetIndex, 0, source);
    props.onReorderPinned(items);
  };
  /** Whether any item remains for the More submenu, so an empty submenu never shows. */
  const hasMore = () =>
    Boolean(props.onSetAgentMuted) ||
    (!menuProps.userHidden && Boolean(props.onOpenAgentWindow || props.onHideAgent)) ||
    (props.duplicateSupported !== false && Boolean(props.onDuplicateAgent));
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content class="agent-context-menu" aria-label={t("sidebar.agentMenu.label")}>
        <Show
          when={
            menuProps.pinned &&
            !props.allMachines &&
            menuProps.mainAgentId !== menuProps.agent.id &&
            menuProps.mainAgentId
          }
        >
          {(mainAgentId) => (
            <ContextMenu.Item onSelect={() => makeMain(mainAgentId())}>
              <Star class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("sidebar.agentMenu.makeMain")}</span>
            </ContextMenu.Item>
          )}
        </Show>
        {/* Pins belong to one server, so the "All machines" view shows none and offers none. */}
        <Show when={!props.allMachines}>
          <ContextMenu.Item
            data-cuelume-tap="toggle"
            onSelect={() => (menuProps.pinned ? props.onUnpin(ref()) : props.onPin(ref()))}
          >
            <Show when={menuProps.pinned} fallback={<Pin class="agent-context-icon size-4" aria-hidden="true" />}>
              <PinOff class="agent-context-icon size-4" aria-hidden="true" />
            </Show>
            <span>{menuProps.pinned ? t("sidebar.unpin") : t("sidebar.pin")}</span>
          </ContextMenu.Item>
        </Show>
        <Show when={unread() && props.onMarkAgentRead}>
          {(markRead) => (
            <ContextMenu.Item onSelect={() => markRead()(menuProps.agent.id)}>
              <CheckCheck class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("sidebar.agentMenu.markRead")}</span>
            </ContextMenu.Item>
          )}
        </Show>
        <Show when={!unread() && props.onMarkAgentUnread}>
          {(markUnread) => (
            <ContextMenu.Item onSelect={() => markUnread()(menuProps.agent.id)}>
              <CircleDot class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("sidebar.agentMenu.markUnread")}</span>
            </ContextMenu.Item>
          )}
        </Show>
        <Show when={!menuProps.userHidden && props.onNewAgentThread}>
          {(start) => (
            <ContextMenu.Item onSelectAfterClose={() => start()(menuProps.agent.id)}>
              <MessageCirclePlus class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("sidebar.agentMenu.newThread")}</span>
            </ContextMenu.Item>
          )}
        </Show>
        <SidebarMoveToSubmenu chatId={menuProps.agent.id} />
        <ContextMenu.Item onSelect={() => props.onEditAgent(menuProps.agent.id)}>
          <EditIcon />
          <span>{t("sidebar.agentMenu.edit")}</span>
        </ContextMenu.Item>
        <Show when={menuProps.userHidden && props.onRestoreAgent}>
          <ContextMenu.Item onSelectAfterClose={() => props.onRestoreAgent?.(menuProps.agent.id)}>
            <RotateCcw class="agent-context-icon size-4" aria-hidden="true" />
            <span>{restoreLabel()}</span>
          </ContextMenu.Item>
        </Show>
        <Show when={hasMore()}>
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger>
              <Ellipsis class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("app.rail.more")}</span>
              <ChevronRight class="agent-context-submenu-chevron size-4" aria-hidden="true" />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent
                class="ui-action-menu agent-context-menu agent-context-submenu"
                aria-label={t("app.rail.more")}
              >
                <Show when={props.onSetAgentMuted}>
                  {(setMuted) => (
                    <ContextMenu.Item
                      data-cuelume-tap="toggle"
                      onSelect={() => setMuted()(menuProps.agent.id, !muted())}
                    >
                      <Show when={muted()} fallback={<BellOff class="agent-context-icon size-4" aria-hidden="true" />}>
                        <Bell class="agent-context-icon size-4" aria-hidden="true" />
                      </Show>
                      <span>{muted() ? t("sidebar.agentMenu.unmute") : t("sidebar.agentMenu.mute")}</span>
                    </ContextMenu.Item>
                  )}
                </Show>
                <Show when={!menuProps.userHidden && props.onOpenAgentWindow}>
                  {(open) => (
                    <ContextMenu.Item onSelect={() => open()(menuProps.agent.id)}>
                      <AppWindow class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("sidebar.agentMenu.openWindow")}</span>
                    </ContextMenu.Item>
                  )}
                </Show>
                <Show when={props.duplicateSupported !== false && props.onDuplicateAgent}>
                  <ContextMenu.Item
                    disabled={props.duplicatingAgentIds?.has(menuProps.agent.id) ?? false}
                    onSelect={() => void props.onDuplicateAgent?.(menuProps.agent.id).catch(() => undefined)}
                  >
                    <Copy class="agent-context-icon size-4" aria-hidden="true" />
                    <span>
                      {props.duplicatingAgentIds?.has(menuProps.agent.id)
                        ? t("sidebar.agentMenu.duplicating")
                        : t("sidebar.agentMenu.duplicate")}
                    </span>
                  </ContextMenu.Item>
                </Show>
                <Show when={!menuProps.userHidden && props.onHideAgent}>
                  <ContextMenu.Item onSelectAfterClose={() => props.onHideAgent?.(menuProps.agent.id)}>
                    <Moon class="agent-context-icon size-4" aria-hidden="true" />
                    <span>{t("sidebar.agentMenu.hide")}</span>
                  </ContextMenu.Item>
                </Show>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        </Show>
        <Show when={props.deleteSupported !== false}>
          <ContextMenu.Separator />
          <ContextMenu.Item
            class="ui-action-menu-danger agent-context-danger"
            onSelect={() => openDelete("agent", menuProps.agent.id)}
          >
            <DeleteIcon />
            <span>{t("sidebar.agentMenu.delete")}</span>
          </ContextMenu.Item>
        </Show>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

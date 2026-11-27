/**
 * The right-click menu on an agent, in the pinned group and in a section alike. Filing the agent
 * away is `SidebarMoveToSubmenu`, which the channel menu shows too; everything here is agent-only.
 */

import {
  AlarmClock,
  AppWindow,
  Bell,
  BellOff,
  Check,
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
import { evaluateAgentSettle, latestAgentActivityAt, sidebarAutoSettleMs } from "./sidebar-settling";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** 8 in the morning of the next day, in local time. */
function tomorrowMorning(): number {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next.getTime();
}

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
  mainAgentId?: string | undefined;
}) {
  const {
    chatPinnedItems,
    customSectionById,
    openDelete,
    props,
    settleAgent,
    settledAgents,
    snoozeAgent,
    snoozeClock,
    snoozedAgents,
    unsnoozeAgent,
  } = useSidebarScope();
  const snoozed = () => snoozedAgents().has(menuProps.agent.id);
  const canSettle = () => {
    if (props.pages === undefined || menuProps.userHidden || props.allMachines || snoozed()) return false;
    const state = props.agentStates[menuProps.agent.id];
    if (state?.kind === "working" || state?.kind === "waiting") return false;
    const threadEntry = props.threadLanes?.threads.find((entry) => entry.agentId === menuProps.agent.id);
    if (threadEntry?.state.kind === "working" || threadEntry?.state.kind === "waiting") return false;
    return evaluateAgentSettle({
      unread: state?.kind === "unread" || (props.threadLanes?.unreadAgentIds.has(menuProps.agent.id) ?? false),
      lastActivityAt: latestAgentActivityAt(
        menuProps.agent.updatedAt,
        props.threadLanes?.latestThreadUpdatedAt?.[menuProps.agent.id],
      ),
      settledAt: settledAgents().get(menuProps.agent.id),
      settleAfterMs: sidebarAutoSettleMs(props.autoSettle),
      now: snoozeClock(),
      pullRequests: props.agentPullRequests?.[menuProps.agent.id],
    }).inDone;
  };
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
        <Show when={canSettle()}>
          <ContextMenu.Item onSelect={() => settleAgent(menuProps.agent.id)}>
            <Check class="agent-context-icon size-4" aria-hidden="true" />
            <span>{t("sidebar.agentMenu.settle")}</span>
          </ContextMenu.Item>
        </Show>
        {/* Snooze puts the agent in "Snoozed" of the chat list until the time; it wakes up by itself. */}
        <Show when={props.pages !== undefined && !menuProps.userHidden && !props.allMachines}>
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger>
              <AlarmClock class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("sidebar.snooze.menu")}</span>
              <ChevronRight class="agent-context-submenu-chevron size-4" aria-hidden="true" />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent
                class="ui-action-menu agent-context-menu agent-context-submenu"
                aria-label={t("sidebar.snooze.menu")}
              >
                <ContextMenu.Item onSelect={() => snoozeAgent(menuProps.agent.id, Date.now() + HOUR_MS)}>
                  <span>{t("sidebar.snooze.hour")}</span>
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => snoozeAgent(menuProps.agent.id, tomorrowMorning())}>
                  <span>{t("sidebar.snooze.tomorrow")}</span>
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => snoozeAgent(menuProps.agent.id, Date.now() + 7 * DAY_MS)}>
                  <span>{t("sidebar.snooze.week")}</span>
                </ContextMenu.Item>
                <Show when={snoozed()}>
                  <ContextMenu.Separator />
                  <ContextMenu.Item onSelect={() => unsnoozeAgent(menuProps.agent.id)}>
                    <span>{t("sidebar.snooze.wake")}</span>
                  </ContextMenu.Item>
                </Show>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        </Show>
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

import {
  Archive,
  buttonVariants,
  ChevronRight,
  DropdownMenu,
  Ellipsis,
  MessageCirclePlus,
  PanelRight,
  Pin,
} from "@openbot/ui";
import { createScrollFades } from "@openbot/ui/components/createScrollFades";
import { sidebarMessageTime } from "@openbot/ui/features/sidebar/sidebar-filtering";
import { useText } from "@openbot/ui/text";
import { For, onSettled, Show } from "solid-js";
import { ThreadStatusMark } from "./ThreadStatusMark";
import { ThreadTitle } from "./ThreadTitle";
import type { ThreadHeaderProps } from "./thread-types";

/** The sessions in the phone sheet. The list scrolls without a scrollbar, and fades at an edge with more threads. */
function ThreadMenuList(props: ThreadHeaderProps) {
  const { format } = useText();
  const fades = createScrollFades();
  onSettled(() => fades.stop);
  const current = (id: string) => (id === props.activeId ? "true" : undefined);
  return (
    <div class={["agent-threads-menu-list", fades.classes()]} ref={fades.bind} onScroll={fades.measure}>
      <For each={props.sessions}>
        {(thread) => (
          <DropdownMenu.Item
            class="agent-threads-menu-item"
            aria-current={current(thread.id)}
            onSelectAfterClose={() => props.onOpen(thread.id)}
          >
            <Show when={thread.stem}>
              {(stem) => (
                <span class="agent-threads-menu-stem" aria-hidden="true">
                  <For each={stem().through}>
                    {(line) => <span class={["agent-threads-stem-rail", line && "agent-threads-stem-line"]} />}
                  </For>
                  <span class={["agent-threads-stem-elbow", stem().last && "agent-threads-stem-last"]} />
                </span>
              )}
            </Show>
            <ThreadTitle class="agent-threads-menu-title" title={thread.title} />
            <ThreadStatusMark status={thread.status} unread={thread.unread} />
            <span class="agent-threads-menu-time ui-menu-trailing">{sidebarMessageTime(thread.updatedAt, format)}</span>
          </DropdownMenu.Item>
        )}
      </For>
    </div>
  );
}

/** The "More" button at the end of the header. */
function ThreadMenuTrigger(props: Pick<ThreadHeaderProps, "sessions" | "activeId">) {
  const { t } = useText();
  // A session with unread replies, other than the open one: the button shows the dot of the thread list.
  const unreadInMenu = () => props.sessions.some((thread) => (thread.unread ?? 0) > 0 && thread.id !== props.activeId);
  return (
    <DropdownMenu.Trigger
      class={buttonVariants({
        variant: "ghost",
        size: "icon-sm",
        class: "agent-threads-icon-button agent-threads-menu-button agent-threads-phone-more no-drag",
      })}
      aria-label={t("agent.dock.more")}
      aria-description={unreadInMenu() ? t("conversation.threads.allUnread") : undefined}
      title={t("agent.dock.more")}
    >
      <Ellipsis aria-hidden="true" />
      <Show when={unreadInMenu()}>
        <span class="agent-threads-menu-unread" aria-hidden="true" />
      </Show>
    </DropdownMenu.Trigger>
  );
}

/** The actions of the sheet: a new session, the pins and the side panel. */
function ThreadMenuActions(props: ThreadHeaderProps) {
  const { t } = useText();
  return (
    <>
      <DropdownMenu.Item disabled={!props.canStartNew} onSelectAfterClose={props.onNew}>
        <MessageCirclePlus aria-hidden="true" />
        {t("conversation.sessions.new")}
      </DropdownMenu.Item>
      <Show when={props.phoneActions?.onOpenPins}>
        {(openPins) => (
          <DropdownMenu.Item onSelectAfterClose={openPins()}>
            <Pin aria-hidden="true" />
            {t("chat.pins.title")}
          </DropdownMenu.Item>
        )}
      </Show>
      <Show when={props.phoneActions?.onToggleSidePanel}>
        {(togglePanel) => (
          <DropdownMenu.Item onSelectAfterClose={togglePanel()}>
            <PanelRight aria-hidden="true" />
            {t(props.phoneActions?.sidePanelOpen ? "conversation.sidePanel.close" : "conversation.sidePanel.open")}
          </DropdownMenu.Item>
        )}
      </Show>
    </>
  );
}

/** The archived threads, in a submenu. Opening an archived thread restores it. */
function ThreadMenuArchived(props: ThreadHeaderProps) {
  const { t, format } = useText();
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger>
        <Archive class="agent-context-icon size-4" aria-hidden="true" />
        <span>{t("conversation.threads.archived")}</span>
        <ChevronRight class="agent-context-submenu-chevron size-4" aria-hidden="true" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent class="ui-action-menu agent-context-menu agent-context-submenu agent-threads-archived">
          <For each={props.archived}>
            {(thread) => (
              <DropdownMenu.Item class="agent-threads-menu-item" onSelectAfterClose={() => props.onRestore(thread.id)}>
                <ThreadTitle class="agent-threads-menu-title" title={thread.title} />
                <span class="agent-threads-menu-time ui-menu-trailing">
                  {sidebarMessageTime(thread.updatedAt, format)}
                </span>
              </DropdownMenu.Item>
            )}
          </For>
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/** The bottom edge of the screen, full width: the sheet stands on it. */
function screenBottomEdge() {
  const root = document.documentElement;
  return { x: 0, y: root.clientHeight, width: root.clientWidth, height: 0 };
}

/**
 * The "More" menu of a phone chat header: a sheet at the bottom of the screen. The sessions come first,
 * in reach of the thumb, and the actions follow in one group. A desktop header has no menu: its sessions
 * and pins are in the details pane.
 */
export function ThreadMenu(props: ThreadHeaderProps) {
  const { t } = useText();
  return (
    <div class="agent-threads-header">
      <DropdownMenu.Root
        placement="top"
        gutter={0}
        sameWidth
        flip={false}
        overflowPadding={0}
        getAnchorRect={screenBottomEdge}
      >
        <ThreadMenuTrigger sessions={props.sessions} activeId={props.activeId} />
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="agent-threads-menu agent-threads-sheet">
            <span class="agent-threads-sheet-handle" aria-hidden="true" />
            <Show when={props.sessions.length > 0}>
              {/* A heading for the eye; the menu items already name each session. */}
              <div class="agent-threads-sheet-title" aria-hidden="true">
                {t("conversation.sessions.title")}
              </div>
              <ThreadMenuList {...props} />
            </Show>
            <div class="agent-threads-sheet-group">
              <ThreadMenuActions {...props} />
              <Show when={props.archived.length > 0}>
                <ThreadMenuArchived {...props} />
              </Show>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

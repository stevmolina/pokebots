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
import { RemoteDesktopIcon } from "@openbot/ui/features/conversation/ConversationIcons";
import { SidePanelToggle } from "@openbot/ui/features/conversation/SidePanel";
import { sidebarMessageTime } from "@openbot/ui/features/sidebar/sidebar-filtering";
import { useText } from "@openbot/ui/text";
import { createMemo, For, onSettled, Show } from "solid-js";
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

/** The "More" button at the end of the header. A dot shows while a remote desktop session runs. */
function ThreadMenuTrigger(props: ThreadHeaderProps & { ref: (element: HTMLElement) => void }) {
  const { t } = useText();
  /** A remote desktop session runs, and its button is in the menu. */
  const busy = () => props.phoneActions?.remoteActive === true;
  return (
    <DropdownMenu.Trigger
      class={buttonVariants({
        variant: "ghost",
        size: "icon-sm",
        class: "agent-threads-icon-button agent-threads-menu-button agent-threads-phone-more no-drag",
      })}
      aria-label={t("agent.dock.more")}
      title={t("agent.dock.more")}
      ref={props.ref}
    >
      <Ellipsis aria-hidden="true" />
      <Show when={busy()}>
        <span class="agent-threads-more-dot" aria-hidden="true" />
      </Show>
    </DropdownMenu.Trigger>
  );
}

/**
 * The actions of the menu: the pins, the side panel and, on a desktop, the remote desktop. A phone also
 * starts a new session here, because its header has no "+".
 */
function ThreadMenuActions(
  props: ThreadHeaderProps & { onOpenRemote: (open: (trigger: HTMLElement) => void) => void },
) {
  const { t } = useText();
  return (
    <>
      <Show when={props.phoneActions?.desktop !== true}>
        <DropdownMenu.Item disabled={!props.canStartNew} onSelectAfterClose={props.onNew}>
          <MessageCirclePlus aria-hidden="true" />
          {t("conversation.sessions.new")}
        </DropdownMenu.Item>
      </Show>
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
      <Show when={props.phoneActions?.onOpenRemote}>
        {(open) => (
          <DropdownMenu.Item
            disabled={props.phoneActions?.remoteEnabled !== true}
            onSelectAfterClose={() => props.onOpenRemote(open())}
          >
            <RemoteDesktopIcon />
            {t(
              props.phoneActions?.remoteActive ? "conversation.header.resumeRemote" : "conversation.header.openRemote",
            )}
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
 * The "More" menu of the chat header. A desktop header shows a dropdown with the header actions; the
 * sessions are in the agent panel. On a phone the menu is a sheet at the bottom of the screen: the
 * sessions come first, in reach of the thumb, and the actions follow in one group.
 */
export function ThreadMenu(props: ThreadHeaderProps) {
  const { t } = useText();
  // A memo: the menu reads it inside its own effects, where reading the header props is not allowed.
  const sheet = createMemo(() => props.phoneActions?.desktop !== true);
  let trigger: HTMLElement | undefined;
  const openRemote = (open: (trigger: HTMLElement) => void) => {
    if (trigger) open(trigger);
  };
  return (
    <div class="agent-threads-header" data-actions-menu={sheet() ? undefined : ""}>
      <DropdownMenu.Root
        placement={sheet() ? "top" : "bottom-end"}
        gutter={sheet() ? 0 : 4}
        sameWidth={sheet()}
        flip={!sheet()}
        overflowPadding={sheet() ? 0 : 8}
        getAnchorRect={(anchor) => (sheet() ? screenBottomEdge() : anchor?.getBoundingClientRect())}
      >
        <ThreadMenuTrigger
          {...props}
          ref={(element) => {
            trigger = element;
          }}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content class={sheet() ? "agent-threads-menu agent-threads-sheet" : "agent-threads-menu"}>
            <Show when={sheet()} fallback={<ThreadMenuActions {...props} onOpenRemote={openRemote} />}>
              <span class="agent-threads-sheet-handle" aria-hidden="true" />
              <Show when={props.sessions.length > 0}>
                {/* A heading for the eye; the menu items already name each session. */}
                <div class="agent-threads-sheet-title" aria-hidden="true">
                  {t("conversation.sessions.title")}
                </div>
                <ThreadMenuList {...props} />
              </Show>
              <div class="agent-threads-sheet-group">
                <ThreadMenuActions {...props} onOpenRemote={openRemote} />
                <Show when={props.archived.length > 0}>
                  <ThreadMenuArchived {...props} />
                </Show>
              </div>
            </Show>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Show when={props.phoneActions?.sidePanel}>{(sidePanel) => <SidePanelToggle {...sidePanel()} />}</Show>
    </div>
  );
}

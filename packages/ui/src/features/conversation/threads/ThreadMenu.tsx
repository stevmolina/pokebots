import {
  Archive,
  buttonVariants,
  ChevronDown,
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
import { createMemo, For, onSettled, Show } from "solid-js";
import { ThreadStatusMark, ThreadStatusText, ThreadTabIcon, threadAttention } from "./ThreadStatusMark";
import { ThreadTitle } from "./ThreadTitle";
import type { ThreadHeaderProps, ThreadRowMode } from "./thread-types";

/** The threads in the menu. The list scrolls without a scrollbar, and fades at an edge with more threads. */
function ThreadMenuList(props: ThreadHeaderProps) {
  const { format } = useText();
  const fades = createScrollFades();
  onSettled(() => fades.stop);
  const current = (id: string) => (id === props.activeId ? "true" : undefined);
  return (
    <div class={["agent-threads-menu-list", fades.classes()]} ref={fades.bind} onScroll={fades.measure}>
      <For each={props.threads}>
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

/**
 * The menu button: a chevron after the tabs, or in a narrow header the open thread with a chevron. In
 * a header too narrow for a title, only the chevron shows, and the menu marks the open thread. A phone
 * has its own button (`ThreadMenuTrigger`).
 */
function ThreadTabsTrigger(props: ThreadHeaderProps & { mode: ThreadRowMode }) {
  const { t } = useText();
  const active = () => props.tabs.find((thread) => thread.id === props.activeId);
  const switcher = () => (props.mode === "compact" ? active() : undefined);
  return (
    <Show
      when={switcher()}
      fallback={
        <DropdownMenu.Trigger
          class={buttonVariants({
            variant: "ghost",
            size: "icon-sm",
            class: "agent-threads-icon-button agent-threads-menu-button no-drag",
          })}
          aria-label={t("conversation.threads.all")}
          title={t("conversation.threads.all")}
        >
          <ChevronDown aria-hidden="true" />
        </DropdownMenu.Trigger>
      }
    >
      {(thread) => (
        <DropdownMenu.Trigger
          class={buttonVariants({ variant: "ghost", size: "sm", class: "agent-threads-switcher no-drag" })}
          data-attention={threadAttention(thread().status)}
          title={thread().title}
          aria-label={t("conversation.threads.current", { title: thread().title })}
        >
          {/* The open thread as its selected tab shows it: the icon slot, the title, then the chevron. */}
          <span class="agent-threads-switcher-icon" aria-hidden="true">
            <ThreadTabIcon status={thread().status} />
          </span>
          <ThreadTitle class="agent-threads-tab-title" title={thread().title} />
          <ThreadStatusText status={thread().status} />
          <ChevronDown class="agent-threads-switcher-chevron" aria-hidden="true" />
        </DropdownMenu.Trigger>
      )}
    </Show>
  );
}

/**
 * The menu button. A phone has the pin and the side panel in the menu, so its button is one round
 * "More" button with dots; the title of the open thread is in the menu. Other windows keep the tabs button.
 */
function ThreadMenuTrigger(props: ThreadHeaderProps & { mode: ThreadRowMode }) {
  const { t } = useText();
  return (
    <Show when={props.phoneActions} fallback={<ThreadTabsTrigger {...props} />}>
      <DropdownMenu.Trigger
        class={buttonVariants({
          variant: "ghost",
          size: "icon-sm",
          class: "agent-threads-icon-button agent-threads-menu-button agent-threads-phone-more no-drag",
        })}
        aria-label={t("agent.dock.more")}
        title={t("agent.dock.more")}
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenu.Trigger>
    </Show>
  );
}

/** The actions of the menu: a new thread, and on a phone also the pins and the side panel. */
function ThreadMenuActions(props: ThreadHeaderProps) {
  const { t } = useText();
  return (
    <>
      <DropdownMenu.Item disabled={!props.canStartNew} onSelectAfterClose={props.onNew}>
        <MessageCirclePlus aria-hidden="true" />
        {t("conversation.threads.new")}
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
 * Every side thread of the agent. A thread without a tab opens in a new tab. On a phone the menu is a
 * sheet at the bottom of the screen: the threads come first, in reach of the thumb, and the actions
 * follow in one group.
 */
export function ThreadMenu(props: ThreadHeaderProps & { mode: ThreadRowMode }) {
  const { t } = useText();
  // A memo: the menu reads it inside its own effects, where reading the header props is not allowed.
  const sheet = createMemo(() => props.phoneActions !== undefined);
  return (
    <DropdownMenu.Root
      placement={sheet() ? "top" : "bottom-start"}
      gutter={sheet() ? 0 : 4}
      sameWidth={sheet()}
      flip={!sheet()}
      overflowPadding={sheet() ? 0 : 8}
      getAnchorRect={(anchor) => (sheet() ? screenBottomEdge() : anchor?.getBoundingClientRect())}
    >
      <ThreadMenuTrigger {...props} />
      <DropdownMenu.Portal>
        <DropdownMenu.Content class={sheet() ? "agent-threads-menu agent-threads-sheet" : "agent-threads-menu"}>
          <Show
            when={sheet()}
            fallback={
              <>
                <ThreadMenuActions {...props} />
                <Show when={props.threads.length > 0}>
                  <DropdownMenu.Separator />
                  <ThreadMenuList {...props} />
                </Show>
                <Show when={props.archived.length > 0}>
                  <DropdownMenu.Separator />
                  <ThreadMenuArchived {...props} />
                </Show>
              </>
            }
          >
            <span class="agent-threads-sheet-handle" aria-hidden="true" />
            <Show when={props.threads.length > 0}>
              {/* A heading for the eye; the menu items already name each thread. */}
              <div class="agent-threads-sheet-title" aria-hidden="true">
                {t("conversation.threads.all")}
              </div>
              <ThreadMenuList {...props} />
            </Show>
            <div class="agent-threads-sheet-group">
              <ThreadMenuActions {...props} />
              <Show when={props.archived.length > 0}>
                <ThreadMenuArchived {...props} />
              </Show>
            </div>
          </Show>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

import { Button, ChevronLeft, Search, SlidersHorizontal } from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { For, Show } from "solid-js";

/** The pane that a phone shows: the chat list at the root, or the conversation pushed over it. */
export type WebMobilePane = "conversation" | "workspace";

/**
 * The places of the phone navigation: the chat list, the tasks and the workflows of the server, and the
 * settings. The server list opens from the centered workspace pill, and search from the floating bottom pill.
 */
export type WebPhoneTab = "chats" | "tasks" | "workflows" | "settings";

interface WebMobileNavigationProps {
  /** The tab that shows, or none while another page is open. */
  active: WebPhoneTab | null;
  /** The tabs that this server has. Chats and Settings are always there. */
  available: (tab: WebPhoneTab) => boolean;
  onSelect: (tab: WebPhoneTab) => void;
  /** The connected server name shown in the centered top pill. */
  serverName?: string | undefined;
  /** Opens or closes the server drawer from the top workspace pill. */
  onOpenServers?: (() => void) | undefined;
  /** Opens global search from the floating bottom pill. */
  onOpenSearch?: (() => void) | undefined;
}

/**
 * The phone chrome: a top bar with settings and the centered workspace switcher,
 * paired with a floating bottom Search pill over the chat list. Both sit under the conversation pane, so a
 * chat that opens covers them, and a swipe back shows them again.
 */
export function WebMobileNavigation(props: WebMobileNavigationProps) {
  const { t } = useText();
  return (
    <>
      <header class="web-phone-header">
        <Button
          variant="ghost"
          type="button"
          class="web-phone-header-button"
          data-active={props.active === "settings" ? "true" : undefined}
          aria-label={t("webClient.tab.settings")}
          onClick={() => props.onSelect("settings")}
        >
          <SlidersHorizontal aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          type="button"
          class="web-phone-server-pill"
          aria-label={props.serverName || t("app.page.serverFallback")}
          onClick={() => props.onOpenServers?.()}
        >
          <span class="web-phone-server-name">{props.serverName}</span>
          <span class="web-phone-server-dot" aria-hidden="true" />
        </Button>
      </header>
      <nav class="web-phone-tab-bar" aria-label={t("webClient.pane.navigation")}>
        <For each={["chats", "tasks", "workflows"] as const}>
          {(tab) => (
            <Show when={props.available(tab)}>
              <Button
                variant="ghost"
                type="button"
                class="web-phone-tab"
                aria-current={props.active === tab ? "page" : undefined}
                onClick={() => props.onSelect(tab)}
              >
                {t(tab === "chats" ? "webClient.tab.chats" : tab === "tasks" ? "app.rail.tasks" : "app.rail.workflows")}
              </Button>
            </Show>
          )}
        </For>
        <Button
          variant="ghost"
          type="button"
          class="web-phone-search-pill"
          aria-label={t("sidebar.chat.search")}
          onClick={() => props.onOpenSearch?.()}
        >
          <Search aria-hidden="true" />
          <span class="web-phone-tab-label">{t("sidebar.chat.search")}</span>
        </Button>
      </nav>
    </>
  );
}

interface WebPhoneBackProps {
  onBack: () => void;
  /** Starts the swipe back from the leading edge. */
  onEdgePointerDown: (event: PointerEvent) => void;
}

/**
 * The Back button and the leading edge of a chat that a phone pushed over the list. A drag from the
 * edge follows the finger back to the list, as the iOS back swipe does.
 */
export function WebPhoneBack(props: WebPhoneBackProps) {
  const { t } = useText();
  return (
    <>
      <div class="web-phone-swipe-edge" aria-hidden="true" onPointerDown={(event) => props.onEdgePointerDown(event)} />
      <Button variant="ghost" type="button" class="web-phone-back" aria-label={t("common.back")} onClick={props.onBack}>
        <ChevronLeft aria-hidden="true" />
      </Button>
    </>
  );
}

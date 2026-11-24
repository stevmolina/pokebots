import { Button, ChevronLeft, Input, LayoutGrid, Search, X } from "@pokebots/ui";
import { useText } from "@pokebots/ui/text";
import { Show } from "solid-js";

/** The pane that a phone shows: the chat list at the root, or the conversation pushed over it. */
export type WebMobilePane = "conversation" | "workspace";

/**
 * The places of the phone navigation: the chat list, the tasks and the workflows of the server, and the
 * settings. The server list opens from the centered workspace pill, and search from the floating bottom pill.
 */
export type WebPhoneTab = "chats" | "tasks" | "workflows" | "settings";

interface WebMobileNavigationProps {
  /** Opens the app catalog from the round grid button. Absent while it cannot open. */
  onOpenApps?: (() => void) | undefined;
  /** The search field shows its results in place of the chat list. */
  searching: boolean;
  searchQuery: string;
  /** The search field took focus: the results show. */
  onOpenSearch: () => void;
  onSearchQuery: (query: string) => void;
  /** The round X button or Escape: the results go and the chat list shows again. */
  onCloseSearch: () => void;
}

/**
 * The bottom bar of the phone home: a round apps button and a wide search field, floating over the
 * chat list. The profile photo and New sit in the top corners of the list itself. The bar sits under
 * the conversation pane, so a chat that opens covers it, and a swipe back shows it again.
 *
 * The search pill is a real text field, not a button that opens a sheet: the tap that focuses it also
 * opens the keyboard, and the results show in place of the list. While it searches, the apps button
 * goes and a round X button at the end closes the search.
 */
export function WebMobileNavigation(props: WebMobileNavigationProps) {
  const { t } = useText();
  return (
    <nav class="web-phone-tab-bar" aria-label={t("webClient.pane.navigation")}>
      <Show when={!props.searching && props.onOpenApps}>
        {(open) => (
          <Button
            variant="ghost"
            type="button"
            class="web-phone-apps-button"
            aria-label={t("sidebar.footer.connectApps")}
            onClick={() => open()()}
          >
            <LayoutGrid aria-hidden="true" />
          </Button>
        )}
      </Show>
      <div class="web-phone-search-pill" data-searching={props.searching ? "" : undefined}>
        <Search aria-hidden="true" />
        <Input
          type="search"
          class="web-phone-search-input"
          aria-label={t("sidebar.chat.search")}
          placeholder={t("sidebar.chat.search")}
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="search"
          value={props.searchQuery}
          onValueChange={props.onSearchQuery}
          onFocus={() => props.onOpenSearch()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onCloseSearch();
            } else if (event.key === "Enter") {
              // The keyboard goes down, so the whole list of results shows.
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <Show when={props.searching}>
        <Button
          variant="ghost"
          type="button"
          class="web-phone-search-close"
          aria-label={t("common.close")}
          onClick={() => props.onCloseSearch()}
        >
          <X aria-hidden="true" />
        </Button>
      </Show>
    </nav>
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

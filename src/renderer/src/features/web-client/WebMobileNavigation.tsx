import { Button, ChevronLeft, LayoutGrid, Search } from "@openbot/ui";
import { useText } from "@openbot/ui/text";
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
  /** Opens global search from the wide search field. */
  onOpenSearch?: (() => void) | undefined;
}

/**
 * The bottom bar of the phone home: a round apps button and a wide search field, floating over the
 * chat list. The profile photo and New sit in the top corners of the list itself. The bar sits under
 * the conversation pane, so a chat that opens covers it, and a swipe back shows it again.
 */
export function WebMobileNavigation(props: WebMobileNavigationProps) {
  const { t } = useText();
  return (
    <nav class="web-phone-tab-bar" aria-label={t("webClient.pane.navigation")}>
      <Show when={props.onOpenApps}>
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

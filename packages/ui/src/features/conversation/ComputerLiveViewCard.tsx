import { Button, Monitor } from "@pokebots/ui";
import { Show } from "solid-js";
import { useText } from "../../text";
import { UiBlockCard } from "./ui-blocks/UiBlockCard";

export interface ComputerLiveViewCardProps {
  /** The id of the cloud computer that the agent started. It is not a credential. */
  machineId: string;
  /**
   * Reads the live view link and opens it. Absent for a person who may not manage the server's cloud
   * computers: the card then shows `note` and no button.
   */
  onOpen?: (() => void) | undefined;
  /**
   * Opens the live view in the app's built-in browser panel. Absent where the panel cannot show it, or
   * where `onOpen` already opens it there.
   */
  onOpenInPanel?: (() => void) | undefined;
  /** The open is on its way. */
  busy?: boolean | undefined;
  /** Why the last open failed, or why there is no button. */
  note?: string | undefined;
}

/** A cloud computer that an agent started. Open live view opens its desktop for the person. */
export function ComputerLiveViewCard(props: ComputerLiveViewCardProps) {
  const { t } = useText();
  return (
    <UiBlockCard
      class="marketplace-suggestion setting-link-card computer-live-view-card"
      status="pending"
      inlineActions
      busy={props.busy}
      icon={
        <span class="ui-block-icon setting-link-icon">
          <Monitor aria-hidden="true" />
        </span>
      }
      title={t("chat.computerLiveView.title")}
      subtitle={<span class="setting-link-path">{t("chat.computerLiveView.subtitle", { id: props.machineId })}</span>}
      actions={
        <>
          <Show when={props.onOpenInPanel}>
            {(openInPanel) => (
              <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => openInPanel()()}>
                {t("chat.computerLiveView.openInPanel")}
              </Button>
            )}
          </Show>
          <Show when={props.onOpen}>
            {(open) => (
              <Button type="button" size="sm" disabled={props.busy} onClick={() => open()()}>
                {t("chat.computerLiveView.open")}
              </Button>
            )}
          </Show>
        </>
      }
    >
      <Show when={props.note}>{(note) => <p class="setting-link-note">{note()}</p>}</Show>
    </UiBlockCard>
  );
}

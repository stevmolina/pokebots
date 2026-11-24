import type { AgentMessage } from "@pokebots/ui/data";
import { ComputerLiveViewCard } from "@pokebots/ui/features/conversation/ComputerLiveViewCard";
import { useText } from "@pokebots/ui/text";
import { createSignal } from "solid-js";
import { openWithPage } from "./computer-live-view-opener";
import { useConversationViewScope } from "./conversation-scope";
import type { ConversationProps } from "./conversation-types";

export interface ComputerLiveViewChatCardProps {
  machineId: string;
  /** Absent where this person cannot open live views: a member on a host without `computer-live-view-v1`. */
  onOpenLiveView?: ConversationProps["onOpenComputerLiveView"];
}

/**
 * The card of a cloud computer that an agent started. Open live view asks the server for the link only
 * at the press, and the server answers it only to a person who may open that machine. The link is never
 * kept here.
 */
export function ComputerLiveViewChatCard(props: ComputerLiveViewChatCardProps) {
  const { t } = useText();
  const { props: view, canOpenInBuiltInBrowser, openInBuiltInBrowser } = useConversationViewScope();
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<string | undefined>(undefined);
  const inPanel = openWithPage(openInBuiltInBrowser);
  // Open live view follows the "Open external links in" setting, as a chat link does: on this
  // computer's server it opens in the built-in browser. On a joined server the browser runs on the
  // host and other members can see its tabs, so only the explicit side panel button opens it there.
  const panelByDefault = () =>
    view.openLinksInBrowser === true && view.server?.kind !== "remote" && canOpenInBuiltInBrowser();
  const open = async (opener: NonNullable<ConversationProps["onOpenComputerLiveView"]>, here?: typeof inPanel) => {
    if (busy()) return;
    setBusy(true);
    setNote(undefined);
    try {
      if (!(await opener(props.machineId, here))) setNote(t("chat.computerLiveView.notFound"));
    } catch {
      setNote(t("chat.computerLiveView.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ComputerLiveViewCard
      machineId={props.machineId}
      busy={busy()}
      onOpen={
        props.onOpenLiveView
          ? () => {
              const opener = props.onOpenLiveView;
              if (opener) void open(opener, panelByDefault() ? inPanel : undefined);
            }
          : undefined
      }
      onOpenInPanel={
        props.onOpenLiveView && canOpenInBuiltInBrowser() && !panelByDefault()
          ? () => {
              const opener = props.onOpenLiveView;
              if (opener) void open(opener, inPanel);
            }
          : undefined
      }
      note={props.onOpenLiveView ? note() : t("chat.computerLiveView.unavailable")}
    />
  );
}

/** The live view card of a side thread message, as the agent's own chat draws it. Another message keeps its row. */
export function useThreadComputerLiveViewCard() {
  const { props } = useConversationViewScope();
  return (message: AgentMessage) => {
    const marker = message.actionMarker;
    if (marker?.kind !== "computer-live-view") return undefined;
    return <ComputerLiveViewChatCard machineId={marker.machineId} onOpenLiveView={props.onOpenComputerLiveView} />;
  };
}

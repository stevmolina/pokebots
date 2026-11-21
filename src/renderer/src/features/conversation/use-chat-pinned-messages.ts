import type { PinnedMessagesProps } from "@pokebots/ui/features/conversation/PinnedMessages";
import { DRAFT_THREAD_ID } from "@pokebots/ui/features/conversation/threads/thread-types";
import { useText } from "@pokebots/ui/text";
import { actionToast } from "../../action-toast";
import { useConversationViewScope } from "./conversation-scope";

/**
 * The pinned messages of the chat in view, as the pins list takes them: the header menu of a phone and
 * the details pane of an agent both show it. Missing while the host keeps no pins. The caller adds
 * `openRequest` and `quiet`.
 */
export function useChatPinnedMessages(): () => Omit<PinnedMessagesProps, "openRequest" | "quiet"> | undefined {
  const { t } = useText();
  const { messagePins, props, replyJump, sideThreadOpen } = useConversationViewScope();
  /** The chat in the main view: the open side thread, a new thread, or undefined for the agent's own chat. */
  const viewTaskId = () => (sideThreadOpen() ? (props.threads?.open?.id ?? DRAFT_THREAD_ID) : undefined);
  /**
   * Opens a pin in its chat: in place in the agent's own chat, else in the tab of its thread, which
   * reads the part around it. A pin whose message or thread is gone shows a toast, and the list reads again.
   * A later click replaces an earlier one that is still loading, so the earlier one shows no toast.
   */
  let pinOpens = 0;
  async function openPin(key: string): Promise<void> {
    const pin = messagePins.pin(key);
    if (!pin) return;
    const open = ++pinOpens;
    const opened =
      pin.taskId === null && !sideThreadOpen()
        ? await replyJump.jumpTo(pin.messageId)
        : ((await props.threads?.onOpenMessage(pin.taskId, pin.messageId)) ?? false);
    if (opened || open !== pinOpens) return;
    actionToast.error(t("chat.pins.missing"));
    messagePins.load();
  }
  /** The pins of all chats of the agent. The pins of the chat in view come first. */
  return () => {
    if (!messagePins.available()) return undefined;
    return {
      pins: messagePins.items(viewTaskId()),
      agents: props.agents,
      onOpenChange: (open: boolean) => {
        if (open) messagePins.load();
      },
      onJump: (key: string) => void openPin(key),
      onUnpin: (key: string) => {
        const pin = messagePins.pin(key);
        if (pin) messagePins.set(pin.taskId ?? undefined, pin.messageId, false);
      },
    };
  };
}

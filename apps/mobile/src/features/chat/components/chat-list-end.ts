import { createContext, useContext } from "react";

/**
 * Scrolls the chat list to its end, so a part of the list footer that grew, such as the open sessions
 * tray, shows in full above the composer and the keyboard. It does nothing outside a chat list.
 */
export const ChatListEndContext = createContext<() => void>(() => undefined);

export function useRevealChatListEnd(): () => void {
  return useContext(ChatListEndContext);
}

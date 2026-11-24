/**
 * "Open Link in Side Panel" of a chat link's native menu. Main sends the address to the window, and the
 * newest mounted chat that can show it in its built-in browser takes it. A chat that cannot, such as
 * one with the browser turned off, passes it on.
 */

type LinkPanelHandler = (url: string) => Promise<boolean>;

const handlers: LinkPanelHandler[] = [];

/** Adds a chat's handler while the chat is mounted. Returns the removal. */
export function onOpenLinkInPanel(handler: LinkPanelHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** Runs the newest handler that opens the link. False when no chat opened it. */
export async function openLinkInPanel(url: string): Promise<boolean> {
  for (const handler of handlers.toReversed()) {
    if (await handler(url).catch(() => false)) return true;
  }
  return false;
}

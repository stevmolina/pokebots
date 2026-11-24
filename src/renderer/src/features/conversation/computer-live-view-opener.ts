import { httpsLiveViewUrl, type ServerSummary } from "@openbot/contracts/ipc";
import { AGENT_COMPUTER_CAPABILITY } from "@openbot/contracts/team-protocol/agent-computer-v1";
import { COMPUTER_LIVE_VIEW_CAPABILITY } from "@openbot/contracts/team-protocol/computer-live-view-v1";
import { serverCanAdminister, serverSupportsCapability } from "../servers/server-capabilities";

/** Opens a live view link that is on its way. Resolves false when there is no link. */
export type LiveViewLinkOpen = (link: Promise<string | null>) => Promise<boolean>;

/**
 * The Open live view action of the chat's cloud computer card, or undefined where this account cannot
 * open it. With `computer-live-view-v1` (this computer, or a joined host that has it), every person gets
 * the button and the host answers the link only for a machine that this person may open: the key's
 * machines for an owner or admin, and the machines of the person's own account. An older host has only
 * the owner or admin machine list, so a member there gets no button. The link goes only to `open`: it is
 * never kept in the conversation, a cache or a log.
 *
 * `open` is where the client opens the link by default; the card can pass another one, such as the
 * built-in browser, for one press.
 */
export function computerLiveViewOpener(
  server: ServerSummary | undefined,
  liveView: (machineId: string, serverId: string) => Promise<string | null>,
  open: LiveViewLinkOpen,
): ((machineId: string, openHere?: LiveViewLinkOpen) => Promise<boolean>) | undefined {
  if (
    !server ||
    !(
      serverSupportsCapability(server, COMPUTER_LIVE_VIEW_CAPABILITY) ||
      serverCanAdminister(server, AGENT_COMPUTER_CAPABILITY)
    )
  )
    return undefined;
  const serverId = server.id;
  return (machineId, openHere) => (openHere ?? open)(liveView(machineId, serverId).then(httpsLiveViewUrl));
}

/** Opens the link with `openPage`, such as the built-in browser. */
export function openWithPage(openPage: (url: string) => Promise<boolean>): LiveViewLinkOpen {
  return async (link) => {
    const url = await link;
    return url ? openPage(url) : false;
  };
}

/** Opens the link with the shell of the desktop app. */
export function openWithShell(openUrl: (url: string) => unknown): LiveViewLinkOpen {
  return async (link) => {
    const url = await link;
    if (!url) return false;
    await openUrl(url);
    return true;
  };
}

/**
 * Opens the link in a new browser tab. The tab opens at the press, before the link arrives, so a popup
 * blocker does not stop it; it closes again when there is no link. A blocked tab is a failed open.
 */
export const openInBrowserTab: LiveViewLinkOpen = (link) => {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  return link.then(
    (url) => {
      if (!url) {
        tab?.close();
        return false;
      }
      // The browser blocked the tab: the card shows that the live view did not open.
      if (!tab) throw new Error("The browser blocked the live view tab.");
      tab.location.replace(url);
      return true;
    },
    (error: unknown) => {
      tab?.close();
      throw error;
    },
  );
};

import { type AgentComputerMachineList, machineLiveViewUrl, type ServerSummary } from "@openbot/contracts/ipc";
import { AGENT_COMPUTER_CAPABILITY } from "@openbot/contracts/team-protocol/agent-computer-v1";
import { serverCanAdminister } from "../servers/server-capabilities";

/**
 * The Open live view action of the chat's cloud computer card, or undefined where this account may not
 * manage the server's cloud computers (a member, or a host without `agent-computer-v1`). The link comes
 * from the owner or admin machine list at the press and goes only to `open`: it is never kept in the
 * conversation, a cache or a log.
 */
export function computerLiveViewOpener(
  server: ServerSummary | undefined,
  machines: (serverId: string) => Promise<AgentComputerMachineList>,
  open: (link: Promise<string | null>) => Promise<boolean>,
): ((machineId: string) => Promise<boolean>) | undefined {
  if (!serverCanAdminister(server, AGENT_COMPUTER_CAPABILITY)) return undefined;
  const serverId = server.id;
  return (machineId) => open(machines(serverId).then((list) => machineLiveViewUrl(list, machineId)));
}

/** Opens the link with the shell of the desktop app. */
export function openWithShell(openUrl: (url: string) => unknown) {
  return async (link: Promise<string | null>): Promise<boolean> => {
    const url = await link;
    if (!url) return false;
    await openUrl(url);
    return true;
  };
}

/**
 * Opens the link in a new browser tab. The tab opens at the press, before the link arrives, so a popup
 * blocker does not stop it; it closes again when there is no link.
 */
export function openInBrowserTab(link: Promise<string | null>): Promise<boolean> {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  return link.then(
    (url) => {
      if (!url) {
        tab?.close();
        return false;
      }
      if (tab) tab.location.replace(url);
      else window.open(url, "_blank", "noopener,noreferrer");
      return true;
    },
    (error: unknown) => {
      tab?.close();
      throw error;
    },
  );
}

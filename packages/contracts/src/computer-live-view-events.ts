import type { AgentComputerMachineList } from "./ipc-agent-computer";
import type { ConversationMessage } from "./ipc-conversation-messages";

export const COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX = "computer-live-view:";

/**
 * An agent started or resumed a cloud computer. The chat shows a card with an Open live view button.
 * The card holds only the machine id: the live view link is a bearer credential, so it is never in the
 * conversation. The client reads the link when the person presses the button: from the host's
 * `computer-live-view-v1` route, which answers only a person who may open that machine, or, on an older
 * host, from the owner or admin machine list of Machines and Server settings > Cloud computers.
 */
export interface ComputerLiveViewEvent {
  machineId: string;
}

/** A machine id, short enough that the item type stays within its 128 characters. */
export function isComputerMachineId(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,108}$/u.test(value);
}

export function computerLiveViewItemType(event: ComputerLiveViewEvent): string {
  if (!isComputerMachineId(event.machineId)) throw new Error("A valid machine id is required.");
  return `${COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX}${event.machineId}`;
}

export function computerLiveViewEvent(message: ConversationMessage): ComputerLiveViewEvent | null {
  if (message.author !== "system" || message.source !== "system" || message.status !== "completed") return null;
  if (!message.itemType?.startsWith(COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX)) return null;
  const machineId = message.itemType.slice(COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX.length);
  return isComputerMachineId(machineId) ? { machineId } : null;
}

/** The live view link of one machine in a list, or null when the list does not have it. */
export function machineLiveViewUrl(list: AgentComputerMachineList, machineId: string): string | null {
  return httpsLiveViewUrl(list.machines.find((machine) => machine.id === machineId)?.liveViewUrl);
}

/** A live view link that a client may open: https only. Any other value is null. */
export function httpsLiveViewUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && /^https:\/\//u.test(url) ? url : null;
}

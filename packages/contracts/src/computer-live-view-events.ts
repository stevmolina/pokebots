import type { AgentComputerMachineList } from "./ipc-agent-computer";
import type { ConversationMessage } from "./ipc-conversation-messages";

export const COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX = "computer-live-view:";

/**
 * An agent started or resumed a cloud computer. The chat shows a card with an Open live view button.
 * The card holds only the machine id: the live view link is a bearer credential, so it is never in the
 * conversation. A client that may manage the server's cloud computers reads the link when the person
 * presses the button, from the same machine list as Machines and Server settings > Cloud computers.
 */
export interface ComputerLiveViewEvent {
  machineId: string;
}

/** A machine id, short enough that the item type stays within its 128 characters. */
function isMachineId(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,108}$/u.test(value);
}

export function computerLiveViewItemType(event: ComputerLiveViewEvent): string {
  if (!isMachineId(event.machineId)) throw new Error("A valid machine id is required.");
  return `${COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX}${event.machineId}`;
}

export function computerLiveViewEvent(message: ConversationMessage): ComputerLiveViewEvent | null {
  if (message.author !== "system" || message.source !== "system" || message.status !== "completed") return null;
  if (!message.itemType?.startsWith(COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX)) return null;
  const machineId = message.itemType.slice(COMPUTER_LIVE_VIEW_ITEM_TYPE_PREFIX.length);
  return isMachineId(machineId) ? { machineId } : null;
}

/** The live view link of one machine in a list, or null when the list does not have it. */
export function machineLiveViewUrl(list: AgentComputerMachineList, machineId: string): string | null {
  const url = list.machines.find((machine) => machine.id === machineId)?.liveViewUrl ?? null;
  return url !== null && /^https:\/\//u.test(url) ? url : null;
}

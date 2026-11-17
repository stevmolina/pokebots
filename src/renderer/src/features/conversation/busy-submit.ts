/**
 * What Cmd+Enter (Ctrl+Enter) does with one message while the agent works. DOM-free, so a script can
 * check each case.
 *
 * - `send`: send as plain Enter does. The agent is idle, or the chat takes no steer or queue choice.
 * - `queue`: the host steers by default, so this message asks the host to hold it in the queue.
 * - `steer`: the host queues by default, so this message goes into the running turn, as Tab does.
 */
export type BusyOppositeAction = "send" | "queue" | "steer";

export interface BusyOppositeState {
  /** A turn is running. */
  readonly busy: boolean;
  /** A channel message is for the whole channel, so it has no steer or queue choice. */
  readonly channel: boolean;
  /** A queued message is open for edit, so the key saves it. */
  readonly editingQueued: boolean;
  /** The provider can take a message into the running turn. */
  readonly agentSteers: boolean;
  /** The busy-message mode of the agent, or the app default, is `steer`. */
  readonly hostSteers: boolean;
}

export function busyOppositeAction(state: BusyOppositeState): BusyOppositeAction {
  if (!state.busy || state.channel || state.editingQueued || !state.agentSteers) return "send";
  return state.hostSteers ? "queue" : "steer";
}

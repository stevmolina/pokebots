export interface QueuedWorkHooks {
  /** The agent has a delivery that is queued, starting or running. */
  hasUnfinishedDelivery(agentId: string): boolean;
  /** A spent plan holds the agent's whole queue, and none of its turns runs or starts. */
  limitHeld(agentId: string): boolean;
}

/**
 * Whether queued work of these agents holds a restart. Work that a spent plan holds does not: it is
 * saved and starts again after the restart, and it can wait for days, which would hold every update
 * of a server as long.
 */
export function queuedWorkHoldsRestart(agentIds: Iterable<string>, hooks: QueuedWorkHooks): boolean {
  for (const agentId of agentIds) {
    if (hooks.hasUnfinishedDelivery(agentId) && !hooks.limitHeld(agentId)) return true;
  }
  return false;
}

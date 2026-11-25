/**
 * Whether the agents of this computer start a new chat with context from the Second Brain: before
 * the first turn of a chat, the host asks the brain what it knows about the person's first message
 * and adds the answer to that turn's prompt, for every provider. It does nothing while no Second
 * Brain connection is on for the agent.
 */

import { isBoolean, isDynamicRecord } from "./runtime-values";

export interface BrainContextSetting {
  enabled: boolean;
}

/** On: the feature acts only for an agent that already has a Second Brain connection. */
export const DEFAULT_BRAIN_CONTEXT: BrainContextSetting = { enabled: true };

export function decodeBrainContextSetting(value: unknown): BrainContextSetting {
  if (!isDynamicRecord(value) || !isBoolean(value.enabled)) throw new Error("Invalid brain context setting.");
  return { enabled: value.enabled };
}

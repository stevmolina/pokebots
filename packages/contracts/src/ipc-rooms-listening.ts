/**
 * Rooms listening of a host: for each agent with it on and the Rooms app connected, the host waits for
 * new room messages and starts a turn in that agent's chat. Off for every agent by default.
 */

import { isBoundedString, isIdentifier } from "./ipc-bounded-values";
import { isBoolean, isDynamicRecord } from "./runtime-values";

export interface RoomsListeningAgent {
  id: string;
  name: string;
  /** The person turned listening on for this agent. */
  listening: boolean;
  /** The agent has the Rooms app among its MCP servers. Without it, listening does nothing. */
  roomsConnected: boolean;
}

export interface RoomsListeningSetting {
  agents: RoomsListeningAgent[];
}

export interface RoomsListeningChange {
  agentId: string;
  listening: boolean;
}

/** The most agents one setting lists. A host with more lists the first ones. */
export const ROOMS_LISTENING_AGENT_LIMIT = 500;

export function decodeRoomsListeningSetting(value: unknown): RoomsListeningSetting {
  if (!isDynamicRecord(value) || !Array.isArray(value.agents) || value.agents.length > ROOMS_LISTENING_AGENT_LIMIT)
    throw new Error("Invalid Rooms listening setting.");
  return {
    agents: value.agents.map((agent) => {
      if (
        !isDynamicRecord(agent) ||
        !isIdentifier(agent.id) ||
        !isBoundedString(agent.name, 200) ||
        !isBoolean(agent.listening) ||
        !isBoolean(agent.roomsConnected)
      )
        throw new Error("Invalid Rooms listening agent.");
      return { id: agent.id, name: agent.name, listening: agent.listening, roomsConnected: agent.roomsConnected };
    }),
  };
}

export function parseRoomsListeningChange(value: unknown): RoomsListeningChange {
  if (!isDynamicRecord(value) || !isIdentifier(value.agentId) || !isBoolean(value.listening))
    throw new Error("Invalid Rooms listening change.");
  return { agentId: value.agentId, listening: value.listening };
}

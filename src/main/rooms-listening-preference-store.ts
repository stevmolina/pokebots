import type { McpServerConfig, RoomsListeningChange, RoomsListeningSetting } from "@pokebots/contracts/ipc";
import { ROOMS_LISTENING_AGENT_LIMIT } from "@pokebots/contracts/ipc";
import { isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import { Effect, Schema } from "effect";
import { PreferenceStore } from "./preference-file";

/** The Rooms app's MCP server, as the Apps marketplace adds it. */
export function isRoomsConnection(config: McpServerConfig): boolean {
  if (config.transport !== "http" || !config.enabled) return false;
  try {
    const url = new URL(config.url);
    return url.origin === "https://rooms.mcpbox.dev" && url.pathname === "/mcp";
  } catch {
    return false;
  }
}

class RoomsListeningFailure extends Schema.TaggedError<RoomsListeningFailure>()("RoomsListeningFailure", {
  cause: Schema.Defect(),
}) {}

export type RoomsListeningControl = ReturnType<typeof createRoomsListeningControl>;

/**
 * The agents of this host that listen to Rooms (`rooms-listening-v1`). The file keeps only the agent
 * ids, so it survives a restart; an id of a deleted agent is left out of each answer.
 */
export function createRoomsListeningControl(
  path: string,
  options: {
    agents: () => readonly { id: string; name: string }[];
    roomsConnected: (agentId: string) => boolean;
    changed: () => void;
  },
) {
  const store = new PreferenceStore<{ agentIds: string[] }>({
    path,
    defaultValue: { agentIds: [] },
    decode: (parsed) =>
      isDynamicRecord(parsed) && parsed.version === 1 && Array.isArray(parsed.agentIds)
        ? { agentIds: parsed.agentIds.filter(isString).slice(0, ROOMS_LISTENING_AGENT_LIMIT) }
        : null,
  });
  const get = (): RoomsListeningSetting => {
    const listening = new Set(store.get().agentIds);
    return {
      agents: options
        .agents()
        .slice(0, ROOMS_LISTENING_AGENT_LIMIT)
        .map((agent) => ({
          id: agent.id,
          name: agent.name.slice(0, 200),
          listening: listening.has(agent.id),
          roomsConnected: options.roomsConnected(agent.id),
        })),
    };
  };
  return {
    load: () => store.load(),
    get,
    /** The agents to listen for now: listening on, the agent exists, and it has the Rooms app. */
    listeningAgents: () => get().agents.filter((agent) => agent.listening && agent.roomsConnected),
    set: Effect.fn("RoomsListening.set")(function* (change: RoomsListeningChange) {
      if (!options.agents().some((agent) => agent.id === change.agentId))
        return yield* new RoomsListeningFailure({ cause: new Error("Unknown agent.") });
      const known = new Set(options.agents().map((agent) => agent.id));
      const ids = store.get().agentIds.filter((id) => id !== change.agentId && known.has(id));
      yield* store
        .set({ agentIds: change.listening ? [...ids, change.agentId] : ids })
        .pipe(Effect.mapError((failure) => new RoomsListeningFailure({ cause: failure.cause })));
      options.changed();
      return get();
    }),
  };
}

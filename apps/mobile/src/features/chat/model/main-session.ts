import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/**
 * The main session of each agent on this phone: the session that the person created or opened last.
 * The agent shows it when it opens. A side thread id, or null for the agent's own chat. Keyed by
 * `serverId/agentId`. The host keeps the threads; this keeps only the choice.
 */
type MainSessions = Record<string, string>;

const key = "openbot.mobile.main-sessions.v1";
/** The stored choices. More agents than this fall back to their own chat, the oldest first. */
const MAX_ENTRIES = 40;

function decode(stored: string | null): MainSessions {
  let value: unknown = null;
  try {
    value = stored === null ? null : JSON.parse(stored);
  } catch {
    value = null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}

function read(): MainSessions {
  try {
    return decode(SecureStore.getItem(key));
  } catch {
    return {};
  }
}

const useMainSessions = create<MainSessions>(read);

const entryKey = (serverId: string, agentId: string) => `${serverId}/${agentId}`;

/** The main session of an agent: a side thread id, or null for the agent's own chat. */
export function mainSession(serverId: string, agentId: string): string | null {
  return useMainSessions.getState()[entryKey(serverId, agentId)] ?? null;
}

export function useMainSession(serverId: string, agentId: string): string | null {
  return useMainSessions((state) => state[entryKey(serverId, agentId)] ?? null);
}

/** Makes a session the main session of its agent. Null makes the agent's own chat main. */
export function setMainSession(serverId: string, agentId: string, taskId: string | null): void {
  const id = entryKey(serverId, agentId);
  const current = useMainSessions.getState();
  if ((current[id] ?? null) === taskId) return;
  // The newest choice goes last, so the cap drops the oldest.
  const { [id]: _previous, ...rest } = current;
  const next: MainSessions = taskId === null ? rest : { ...rest, [id]: taskId };
  const kept = Object.fromEntries(Object.entries(next).slice(-MAX_ENTRIES));
  useMainSessions.setState(kept, true);
  try {
    SecureStore.setItem(key, JSON.stringify(kept));
  } catch {
    // Without the store, the choice still holds until the app quits.
  }
}

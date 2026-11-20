import { z } from "zod";

/**
 * The sessions state of one agent on this device: the main session, and the side threads with a tab in
 * the side panel.
 */
export interface AgentThreadTabs {
  /** The main session: a side thread id or the new session. Null for the agent's own chat. */
  active: string | null;
  /** The tabs of the side panel, where each thread shows beside the agent's own chat. */
  side: string[];
}

/** Server id → agent id → tabs. */
export type ThreadTabsByServer = Record<string, Record<string, AgentThreadTabs>>;

const THREAD_TABS_STORAGE_KEY = "openbot:thread-tabs:v1";
/** More tabs than this do not fit in the side panel. */
const MAX_STORED_TABS = 50;

type ThreadTabsStorage = Pick<Storage, "getItem" | "setItem">;

const id = z.string().trim().min(1).max(200);
const idList = z.array(id.nullable().catch(null)).catch([]);
/** Versions with chat tabs also stored `open`, the tabs of the chat header. This version ignores it. */
const agentTabsSchema = z.object({
  active: id.nullable().catch(null),
  side: idList,
});
const threadTabsSchema = z.record(id, z.record(id, agentTabsSchema.nullable().catch(null)).catch({}));

export function readThreadTabs(storage: ThreadTabsStorage = window.localStorage): ThreadTabsByServer {
  try {
    const parsed = threadTabsSchema.safeParse(JSON.parse(storage.getItem(THREAD_TABS_STORAGE_KEY) ?? "{}"));
    if (!parsed.success) return {};
    const result: ThreadTabsByServer = {};
    for (const [serverId, agents] of Object.entries(parsed.data)) {
      const byAgent: Record<string, AgentThreadTabs> = {};
      for (const [agentId, tabs] of Object.entries(agents)) {
        if (!tabs) continue;
        const side = uniqueIds(tabs.side);
        if (side.length > 0 || tabs.active) byAgent[agentId] = { active: tabs.active, side };
      }
      if (Object.keys(byAgent).length > 0) result[serverId] = byAgent;
    }
    return result;
  } catch {
    return {};
  }
}

function uniqueIds(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.flatMap((tab) => (tab ? [tab] : [])))].slice(0, MAX_STORED_TABS);
}

export function writeThreadTabs(tabs: ThreadTabsByServer, storage: ThreadTabsStorage = window.localStorage): void {
  const stored = Object.fromEntries(
    Object.entries(tabs).map(([serverId, agents]) => [
      serverId,
      Object.fromEntries(
        Object.entries(agents).map(([agentId, agent]) => [
          agentId,
          // An older version reads `open` and takes the side panel tabs out of it, so it shows no chat tab.
          { open: agent.side, active: agent.active, side: agent.side },
        ]),
      ),
    ]),
  );
  try {
    storage.setItem(THREAD_TABS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // A UI preference must not block navigation when browser storage is unavailable.
  }
}

/**
 * Server id → agent id → the creation time of the newest side thread that this device has seen. A newer
 * thread, also one that started on another device while this one was off, gets a tab here.
 */
type SeenThreadsByServer = Record<string, Record<string, string>>;

const THREADS_SEEN_STORAGE_KEY = "openbot:thread-tabs-seen:v1";
const seenThreadsSchema = z.record(id, z.record(id, id.nullable().catch(null)).catch({}));

function readSeenThreads(storage: ThreadTabsStorage): SeenThreadsByServer {
  try {
    const parsed = seenThreadsSchema.safeParse(JSON.parse(storage.getItem(THREADS_SEEN_STORAGE_KEY) ?? "{}"));
    if (!parsed.success) return {};
    return Object.fromEntries(
      Object.entries(parsed.data).map(([serverId, agents]) => [
        serverId,
        Object.fromEntries(Object.entries(agents).flatMap(([agentId, time]) => (time ? [[agentId, time]] : []))),
      ]),
    );
  } catch {
    return {};
  }
}

/** Sets the newest seen thread creation time. `null` forgets it for a deleted agent. */
export function writeThreadsSeenThrough(
  serverId: string,
  agentId: string,
  time: string | null,
  storage: ThreadTabsStorage = window.localStorage,
): void {
  const stored = readSeenThreads(storage);
  const agents = { ...stored[serverId] };
  if (time === null) {
    if (!(agentId in agents)) return;
    delete agents[agentId];
  } else agents[agentId] = time;
  const next = { ...stored, [serverId]: agents };
  if (Object.keys(agents).length === 0) delete next[serverId];
  try {
    storage.setItem(THREADS_SEEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Without browser storage, a thread from another device gets a tab only while this window stays open.
  }
}

/** A side thread that is archived and waits for the end of its Undo time before the delete. */
export interface PendingThreadDelete {
  serverId: string;
  agentId: string;
  threadId: string;
  /** Epoch milliseconds. After this time, any window of this device can finish the delete. */
  deadline: number;
  /** The thread was not archived before the delete, so Undo restores it. */
  restore: boolean;
}

const THREAD_DELETES_STORAGE_KEY = "openbot:thread-deletes:v1";
/** A device does not delete more threads than this in one Undo time. */
const MAX_STORED_DELETES = 200;

const pendingDeleteSchema = z.object({
  serverId: id,
  agentId: id,
  threadId: id,
  deadline: z.number().finite(),
  restore: z.boolean(),
});
const pendingDeletesSchema = z.array(pendingDeleteSchema.nullable().catch(null)).catch([]);

export function readPendingThreadDeletes(storage: ThreadTabsStorage = window.localStorage): PendingThreadDelete[] {
  try {
    const parsed = pendingDeletesSchema.parse(JSON.parse(storage.getItem(THREAD_DELETES_STORAGE_KEY) ?? "[]"));
    return parsed.flatMap((entry) => (entry ? [entry] : [])).slice(0, MAX_STORED_DELETES);
  } catch {
    return [];
  }
}

function writePendingThreadDeletes(deletes: readonly PendingThreadDelete[], storage: ThreadTabsStorage): void {
  try {
    storage.setItem(THREAD_DELETES_STORAGE_KEY, JSON.stringify(deletes.slice(-MAX_STORED_DELETES)));
  } catch {
    // Without browser storage, a delete still runs at the end of its Undo time in this window.
  }
}

const sameDelete = (a: PendingThreadDelete, b: Pick<PendingThreadDelete, "serverId" | "threadId">) =>
  a.serverId === b.serverId && a.threadId === b.threadId;

export function addPendingThreadDelete(
  entry: PendingThreadDelete,
  storage: ThreadTabsStorage = window.localStorage,
): void {
  writePendingThreadDeletes(
    [...readPendingThreadDeletes(storage).filter((stored) => !sameDelete(stored, entry)), entry],
    storage,
  );
}

/** Removes a stored delete. Returns false when another window removed it first. */
export function takePendingThreadDelete(
  entry: Pick<PendingThreadDelete, "serverId" | "threadId">,
  storage: ThreadTabsStorage = window.localStorage,
): boolean {
  const stored = readPendingThreadDeletes(storage);
  const kept = stored.filter((candidate) => !sameDelete(candidate, entry));
  if (kept.length === stored.length) return false;
  writePendingThreadDeletes(kept, storage);
  return true;
}

/** Removes the stored deletes of a deleted agent: its threads went with it. */
export function forgetPendingThreadDeletes(
  serverId: string,
  agentId: string,
  storage: ThreadTabsStorage = window.localStorage,
): void {
  const stored = readPendingThreadDeletes(storage);
  const kept = stored.filter((entry) => entry.serverId !== serverId || entry.agentId !== agentId);
  if (kept.length !== stored.length) writePendingThreadDeletes(kept, storage);
}

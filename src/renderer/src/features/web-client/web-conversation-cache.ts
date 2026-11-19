import type { ConversationPage } from "@openbot/contracts/ipc";

const CACHE_PREFIX = "pokebots:conv-page:v1:";
const INDEX_KEY = "pokebots:conv-page:v1:index";
const MAX_CACHED_CONVERSATIONS = 30;
const MAX_ENTRY_BYTES = 60_000;

function entryKey(accountId: string, hostId: string, agentId: string): string {
  return `${CACHE_PREFIX}${accountId}:${hostId}:${agentId}`;
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(keys: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage quota errors.
  }
}

function isConversationPage(value: unknown): value is ConversationPage {
  if (typeof value !== "object" || value === null) return false;
  return (
    "messages" in value && Array.isArray(value.messages) && "agentId" in value && typeof value.agentId === "string"
  );
}

/** Synchronously reads a cached latest conversation page for instant cold-bot rendering. */
export function readCachedConversationPage(
  accountId: string,
  hostId: string,
  agentId: string,
): ConversationPage | null {
  try {
    const raw = localStorage.getItem(entryKey(accountId, hostId, agentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isConversationPage(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Saves a bot's latest conversation page to localStorage with an LRU cap. */
export function writeCachedConversationPage(
  accountId: string,
  hostId: string,
  agentId: string,
  page: ConversationPage,
): void {
  try {
    const key = entryKey(accountId, hostId, agentId);
    const serialized = JSON.stringify(page);
    if (serialized.length > MAX_ENTRY_BYTES) return;
    localStorage.setItem(key, serialized);
    const index = readIndex().filter((item) => item !== key);
    index.push(key);
    while (index.length > MAX_CACHED_CONVERSATIONS) {
      const oldest = index.shift();
      if (oldest) localStorage.removeItem(oldest);
    }
    writeIndex(index);
  } catch {
    // Ignore storage quota or serialization errors.
  }
}

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const key = "openbot.mobile.chatListView.v1";

/** "Active" groups the chats by state (Working, Done, Snoozed, then the rest); "Folders" shows every chat in its folder. */
export type MobileChatListView = "active" | "folders";

interface ChatListViewState {
  view: MobileChatListView;
  /** Snoozed agents, as `<server id>:<agent id>` to the end of the snooze (ms since epoch). */
  snoozes: Readonly<Record<string, number>>;
  ready: boolean;
}

/**
 * The view of the chat list and the snoozed agents. As on the desktop and the web client, each device keeps
 * its own choice: it is not synced to the host, so it works the same on this computer's host and on a
 * joined server. A snooze ends by itself when its time passes.
 */
export const useChatListView = create<ChatListViewState>(() => ({ view: "active", snoozes: {}, ready: false }));

export function snoozeKey(serverId: string, agentId: string): string {
  return `${serverId}:${agentId}`;
}

/** The snoozes that have not run out. */
function liveSnoozes(snoozes: Readonly<Record<string, number>>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(snoozes).filter(([, until]) => until > now));
}

export async function loadChatListView(): Promise<void> {
  if (useChatListView.getState().ready) return;
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (stored && !useChatListView.getState().ready) {
      let value: unknown = null;
      try {
        value = JSON.parse(stored);
      } catch {
        value = null;
      }
      const fields = new Map<string, unknown>(typeof value === "object" && value !== null ? Object.entries(value) : []);
      const savedSnoozes = fields.get("snoozes");
      const snoozes: Record<string, number> = {};
      if (typeof savedSnoozes === "object" && savedSnoozes !== null) {
        for (const [id, until] of Object.entries(savedSnoozes)) {
          if (typeof until === "number") snoozes[id] = until;
        }
      }
      useChatListView.setState({
        view: fields.get("view") === "folders" ? "folders" : "active",
        snoozes: liveSnoozes(snoozes, Date.now()),
      });
    }
  } catch {
    // A broken saved value falls back to the default view with no snoozes.
  } finally {
    useChatListView.setState({ ready: true });
  }
}

/** The writes run one after the other, so the last change is the one that stays. */
let writes: Promise<void> = Promise.resolve();

function save(next: Partial<Pick<ChatListViewState, "view" | "snoozes">>): void {
  useChatListView.setState({ ...next, ready: true });
  const { view, snoozes } = useChatListView.getState();
  const value = JSON.stringify({ view, snoozes: liveSnoozes(snoozes, Date.now()) });
  writes = writes.then(() => SecureStore.setItemAsync(key, value)).catch(() => undefined);
}

export function setChatListView(view: MobileChatListView): void {
  if (useChatListView.getState().view !== view) save({ view });
}

export function snoozeAgent(serverId: string, agentId: string, until: number): void {
  const snoozes = liveSnoozes(useChatListView.getState().snoozes, Date.now());
  save({ snoozes: { ...snoozes, [snoozeKey(serverId, agentId)]: until } });
}

export function unsnoozeAgent(serverId: string, agentId: string): void {
  const snoozes = { ...liveSnoozes(useChatListView.getState().snoozes, Date.now()) };
  delete snoozes[snoozeKey(serverId, agentId)];
  save({ snoozes });
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** The snooze ends of the menu, as on the desktop: 1 hour, tomorrow at 8:00, 1 week. */
export function snoozeUntil(choice: "hour" | "tomorrow" | "week", now = Date.now()): number {
  if (choice === "hour") return now + HOUR_MS;
  if (choice === "week") return now + 7 * DAY_MS;
  const tomorrow = new Date(now + DAY_MS);
  tomorrow.setHours(8, 0, 0, 0);
  return tomorrow.getTime();
}

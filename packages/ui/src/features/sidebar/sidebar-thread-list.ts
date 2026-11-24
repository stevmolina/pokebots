/**
 * Which side threads show under an agent row, and how many a "Show N more" pill holds back.
 *
 * - `live`: the agent has threads at work, waiting for the user, or with unread replies. They show by
 *   themselves under the row, the ones that wait for the user first, cut to `THREAD_LIST_LIMIT`.
 * - `all`: the user opened the list with the chevron. The live threads come first, then the latest
 *   others, each part cut to `THREAD_LIST_LIMIT`.
 * - `closed`: nothing shows under the row.
 *
 * The thread open on screen stays in a cut list even when it is older than the threads shown.
 */

import type { ThreadItem } from "../conversation/threads/thread-types";

/** The rows of each part of the list before the "Show N more" pill. */
export const THREAD_LIST_LIMIT = 3;

export type SidebarThreadListMode = "live" | "all" | "closed";

/**
 * A thread that shows by itself under its agent: it works, waits for a turn, waits for the user or
 * for other agents, or has replies the user did not read. A failed or idle thread waits for the chevron.
 */
export function threadIsLive(thread: ThreadItem): boolean {
  const kind = thread.status.kind;
  return (
    kind === "working" || kind === "queued" || kind === "waiting" || kind === "awaiting" || (thread.unread ?? 0) > 0
  );
}

/** A thread that needs a look: it is live or it failed. The full list puts these first. */
function needsLook(thread: ThreadItem): boolean {
  return thread.status.kind !== "idle" || (thread.unread ?? 0) > 0;
}

/** The first threads, with the open thread in the list even when it is further down. */
function cut(threads: readonly ThreadItem[], openId: string | undefined, limit: number): ThreadItem[] {
  const first = threads.slice(0, limit);
  const open = threads.find((thread) => thread.id === openId);
  if (!open || first.includes(open)) return first;
  return [...first.slice(0, limit - 1), open];
}

/** The threads that wait for the user come first; the order is kept otherwise. */
function userFirst(threads: readonly ThreadItem[]): ThreadItem[] {
  const waits = threads.filter((thread) => thread.status.kind === "waiting");
  return [...waits, ...threads.filter((thread) => thread.status.kind !== "waiting")];
}

/** The mode of the list under an agent row: the chevron wins, then live threads open it by themselves. */
export function sidebarThreadListMode(threads: readonly ThreadItem[], expanded: boolean): SidebarThreadListMode {
  if (expanded) return "all";
  return threads.some(threadIsLive) ? "live" : "closed";
}

export interface SidebarThreadList {
  shown: ThreadItem[];
  /** The threads behind the "Show N more" pill. 0: no pill, or the pill reads "Show less" when `showAll`. */
  hidden: number;
  /** Whether a pill shows: there are hidden threads, or the user opened them all. */
  pill: boolean;
}

/**
 * The threads under an agent row. `threads` come sorted as the host sorts them, the latest first.
 * `showAll` is the pill pressed: every thread of the mode shows, and the pill reads "Show less".
 */
export function sidebarThreadList(input: {
  threads: readonly ThreadItem[];
  mode: SidebarThreadListMode;
  openId: string | undefined;
  showAll: boolean;
  limit?: number;
}): SidebarThreadList {
  const limit = input.limit ?? THREAD_LIST_LIMIT;
  if (input.mode === "closed") return { shown: [], hidden: 0, pill: false };
  const live = input.mode === "live";
  const first = userFirst(input.threads.filter(live ? threadIsLive : needsLook));
  const rest = live ? [] : input.threads.filter((thread) => !needsLook(thread));
  const firstCut = cut(first, input.openId, limit);
  const restCut = cut(rest, input.openId, limit);
  const hidden = first.length - firstCut.length + (rest.length - restCut.length);
  if (input.showAll) return { shown: [...first, ...rest], hidden: 0, pill: hidden > 0 };
  return { shown: [...firstCut, ...restCut], hidden, pill: hidden > 0 };
}

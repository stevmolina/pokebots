import { isDynamicRecord, isOneOf } from "./runtime-values";

/**
 * The idle times after which the host archives a side thread by itself, in days. 0 is off. Fixed
 * choices, so the frozen `thread-auto-archive-v1` wire contract can name them.
 */
export const THREAD_AUTO_ARCHIVE_IDLE_DAYS = [0, 1, 3, 7] as const;
export type ThreadAutoArchiveIdleDays = (typeof THREAD_AUTO_ARCHIVE_IDLE_DAYS)[number];

/**
 * When the host archives the side threads of its agents by itself. A thread that runs a turn or has a
 * queued message is never archived. An archived thread can be restored.
 * - `idleDays`: archive a thread with no activity for this many days. 0 is off.
 * - `mergedPullRequests`: archive an idle thread when every GitHub pull request that its messages link
 *   is merged or closed.
 */
export interface ThreadAutoArchiveSetting {
  idleDays: ThreadAutoArchiveIdleDays;
  mergedPullRequests: boolean;
}

export const DEFAULT_THREAD_AUTO_ARCHIVE: ThreadAutoArchiveSetting = { idleDays: 3, mergedPullRequests: true };

export function parseThreadAutoArchiveSetting(value: unknown): ThreadAutoArchiveSetting {
  if (
    !isDynamicRecord(value) ||
    !isOneOf(THREAD_AUTO_ARCHIVE_IDLE_DAYS, value.idleDays) ||
    typeof value.mergedPullRequests !== "boolean"
  )
    throw new Error("Invalid thread auto-archive setting.");
  return { idleDays: value.idleDays, mergedPullRequests: value.mergedPullRequests };
}

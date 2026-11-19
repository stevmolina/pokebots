import type { AgentTask } from "@openbot/contracts/ipc";
import type { SidebarWaitReason } from "@openbot/ui/features/sidebar/sidebar-types";
import { DRAFT_THREAD_ID, MAIN_THREAD_ID, type ThreadItem, type ThreadStatus } from "./thread-types";

/** What a side thread does now. A turn that waits for an approval or an answer waits for the user. */
export function agentTaskThreadStatus(task: AgentTask, waitsFor: SidebarWaitReason | undefined): ThreadStatus {
  if (task.state === "running") return waitsFor ? { kind: "waiting", reason: waitsFor } : { kind: "working" };
  if (task.state === "queued") return { kind: "queued" };
  if (task.outcome === "failed") return { kind: "failed" };
  return task.awaitedReplies?.length ? { kind: "awaiting" } : { kind: "idle" };
}

/** The thread item of a side thread, as the header and the sidebar show it. */
export function sideThreadItem(
  task: AgentTask,
  waitsFor: SidebarWaitReason | undefined,
  unread: number | undefined,
): ThreadItem {
  const item: ThreadItem = {
    id: task.id,
    kind: "side",
    title: task.title,
    updatedAt: task.updatedAt,
    status: agentTaskThreadStatus(task, waitsFor),
  };
  if (unread !== undefined) item.unread = unread;
  return item;
}

export interface ThreadListsInput {
  /** The agent's own chat, as its session row shows it. */
  main: { title: string; updatedAt: string; status?: ThreadStatus | undefined };
  /** The side threads of the agent: open ones and archived (`closed`) ones. */
  tasks: readonly AgentTask[];
  /** The main session: the session on screen. */
  activeId: string;
  /** Whether a new session shows. */
  draft: boolean;
  draftTitle: string;
  /** Side threads that wait to be deleted: they show nowhere. */
  hidden: ReadonlySet<string>;
  /** What the running turn of a side thread waits for the user to do, if anything. */
  waitsFor: (task: AgentTask) => SidebarWaitReason | undefined;
  /** The agent messages of an open side thread that the user has not read. */
  unread?: ((task: AgentTask) => number) | undefined;
}

export interface ThreadLists {
  /** The open sessions: the main session first, then the others that changed last first. */
  sessions: ThreadItem[];
  archived: ThreadItem[];
}

/**
 * The session lists of an agent. The main session comes first; the agent's own chat and the side
 * threads follow, the one that changed last first, with each branch under its source. A thread that
 * is archived or deleted, also on another device, is not in the open list.
 */
export function threadLists(input: ThreadListsInput): ThreadLists {
  const archived: ThreadItem[] = [];
  const open: ThreadItem[] = [
    {
      id: MAIN_THREAD_ID,
      kind: "main",
      title: input.main.title,
      updatedAt: input.main.updatedAt,
      status: input.main.status ?? { kind: "idle" },
    },
  ];
  for (const task of input.tasks) {
    if (input.hidden.has(task.id)) continue;
    const item = sideThreadItem(task, input.waitsFor(task), input.unread?.(task));
    if (task.state === "closed") archived.push(item);
    else open.push(item);
  }
  open.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  archived.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const sources = new Map<string, string>();
  for (const task of input.tasks) {
    const sourceId = task.branch?.sourceTaskId;
    if (sourceId) sources.set(task.id, sourceId);
  }
  const main =
    input.activeId === DRAFT_THREAD_ID && input.draft
      ? {
          id: DRAFT_THREAD_ID,
          kind: "draft" as const,
          title: input.draftTitle,
          updatedAt: input.main.updatedAt,
          status: { kind: "idle" as const },
        }
      : open.find((item) => item.id === input.activeId);
  const rest = nestedBranches(
    open.filter((item) => item.id !== main?.id),
    (id) => sources.get(id),
  );
  return { sessions: main ? [main, ...rest] : rest, archived };
}

/** The side threads with a tab in the side panel, in tab order. A thread that does not show has no tab. */
export function sideThreadTabs(
  input: Pick<ThreadListsInput, "tasks" | "hidden" | "waitsFor" | "unread">,
  ids: readonly string[],
): ThreadItem[] {
  return ids.flatMap((id) => {
    const task = input.tasks.find((entry) => entry.id === id);
    return task && task.state !== "closed" && !input.hidden.has(id)
      ? [sideThreadItem(task, input.waitsFor(task), input.unread?.(task))]
      : [];
  });
}

/**
 * The deepest level of the tree lines in the thread menu. A deeper branch shows at this level, below
 * its source, so that its title stays readable in the menu.
 */
const BRANCH_LEVELS = 4;

/**
 * Puts each branch under the open thread that it came from, with tree lines before its title. A
 * branch whose source is archived or deleted, or of the agent's own chat, stays at the top. Each
 * level keeps the order of `items`.
 */
function nestedBranches(items: readonly ThreadItem[], sourceOf: (id: string) => string | undefined): ThreadItem[] {
  const ids = new Set(items.map((item) => item.id));
  const parent = (item: ThreadItem): string | null => {
    const sourceId = sourceOf(item.id);
    return sourceId !== undefined && sourceId !== item.id && ids.has(sourceId) ? sourceId : null;
  };
  const children = new Map<string | null, ThreadItem[]>();
  for (const item of items) {
    const key = parent(item);
    children.set(key, [...(children.get(key) ?? []), item]);
  }
  const placed = new Set<string>();
  const walk = (id: string | null, level: number): { item: ThreadItem; level: number }[] =>
    (children.get(id) ?? []).flatMap((item) => {
      if (placed.has(item.id)) return [];
      placed.add(item.id);
      return [{ item, level }, ...walk(item.id, Math.min(level + 1, BRANCH_LEVELS))];
    });
  const rows = walk(null, 0);
  // The line of a level continues down to the next row on that level, if no row above it comes first.
  const continues = (from: number, level: number) => {
    for (const row of rows.slice(from + 1)) if (row.level <= level) return row.level === level;
    return false;
  };
  const nested = rows.map(({ item, level }, index) =>
    level === 0
      ? item
      : {
          ...item,
          stem: {
            through: Array.from({ length: level - 1 }, (_, outer) => continues(index, outer + 1)),
            last: !continues(index, level),
          },
        },
  );
  // A loop of sources has no top. Its threads still show, at the top.
  return [...nested, ...items.filter((item) => !placed.has(item.id))];
}

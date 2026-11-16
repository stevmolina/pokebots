import type { SidebarWaitReason } from "@openbot/ui/features/sidebar/sidebar-types";

/** What the agent does in a thread, as a sidebar row shows it for the agent. */
export type ThreadStatus =
  | { kind: "idle" }
  | { kind: "working" }
  /** A message waits for a free turn. */
  | { kind: "queued" }
  | { kind: "waiting"; reason: SidebarWaitReason }
  | { kind: "failed" };

/**
 * One session of an agent: a side thread, the agent's own chat (`main`), or a new session that has no
 * message yet (`draft`): its first message starts it.
 */
export interface ThreadItem {
  id: string;
  kind: "main" | "side" | "draft";
  title: string;
  updatedAt: string;
  status: ThreadStatus;
  /** The agent messages in the thread that the user has not read. Absent when the host keeps no read mark. */
  unread?: number | undefined;
  /**
   * The tree lines before the title in a session list, for a branch under its source thread. Absent
   * at the top level and in the side panel tabs.
   */
  stem?: ThreadStem | undefined;
}

/**
 * The tree lines of a branch. `through` has one entry for each outer level, true where the line of
 * that level continues to a later thread. `last` ends the line of this level at this branch.
 */
export interface ThreadStem {
  through: readonly boolean[];
  last: boolean;
}

/**
 * The header actions that the "More" menu keeps, on a phone and in a desktop header. Each one is
 * missing when that action does not apply, such as pins on a host that has none, or the side panel
 * of a read-only channel.
 */
export interface ThreadPhoneActions {
  onOpenPins?: (() => void) | undefined;
  onToggleSidePanel?: (() => void) | undefined;
  /** The side panel is open, so the menu item closes it. */
  sidePanelOpen?: boolean | undefined;
  /** Opens the remote desktop of a joined server. The menu button is the element the window opens from. */
  onOpenRemote?: ((trigger: HTMLElement) => void) | undefined;
  /** The remote desktop can open: the server is online, or a session runs. */
  remoteEnabled?: boolean | undefined;
  /** A remote desktop session runs. The item resumes it, and the menu button has a dot. */
  remoteActive?: boolean | undefined;
  /** An agent controls the browser of the side panel. The menu button has a dot. */
  browserActing?: boolean | undefined;
  /** A desktop header: a dropdown with the actions only. Without it, a phone sheet that also lists the sessions. */
  desktop?: boolean | undefined;
}

/** A turn runs in the thread. The user stops it before an archive or a delete. */
export function threadBusy(status: ThreadStatus): boolean {
  return status.kind === "working" || status.kind === "waiting";
}

/**
 * The sessions of one agent and what the user can do with them. The agent shows one session at a
 * time: the main session, which is the session that the user created or opened last. The others keep
 * running. `onRename` and `onDelete` are missing when the host cannot rename or delete threads; the
 * actions then do not show.
 */
export interface ThreadHeaderProps {
  /**
   * Every session that is not archived: the main session first, then the agent's own chat and the side
   * threads that changed last. A new session that has no message shows while it is the main session.
   */
  sessions: readonly ThreadItem[];
  archived: readonly ThreadItem[];
  /** The main session: the one on screen. */
  activeId: string;
  /** False at the limit of threads. */
  canStartNew: boolean;
  /** Opens a session and makes it the main session. */
  onOpen: (id: string) => void;
  /** Starts a new session and makes it the main session. */
  onNew: () => void;
  onArchive: (id: string) => void;
  /**
   * Stops the running turn of a side thread and cancels its queued messages. The thread stays open.
   * Missing when the host cannot stop a thread.
   */
  onStop?: ((id: string) => void) | undefined;
  /** Restores an archived thread and opens it. */
  onRestore: (id: string) => void;
  onRename?: ((id: string, title: string) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  /** Opens a side thread in the side panel. Missing when the chat has no side panel. */
  onMoveToSide?: ((id: string) => void) | undefined;
  /** The header actions of the "More" menu: on a phone with the sessions, on a desktop alone. */
  phoneActions?: ThreadPhoneActions | undefined;
}

/** The id of the agent's own chat in the thread lists. A side thread has the id of its task. */
export const MAIN_THREAD_ID = "main";
/** The id of a new session, before its first message starts the thread. */
export const DRAFT_THREAD_ID = "draft";

/**
 * The key of one thread of one agent, as the sidebar thread lanes name a row. Agent ids have no slash:
 * they name folders.
 */
export function threadTabKey(agentId: string, threadId: string): string {
  return `${agentId}/${threadId}`;
}

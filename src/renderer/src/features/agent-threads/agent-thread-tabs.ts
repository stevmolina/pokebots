import type { AgentTask } from "@pokebots/contracts/ipc";
import { TOAST_DURATION, toast } from "@pokebots/ui";
import { DRAFT_THREAD_ID, MAIN_THREAD_ID } from "@pokebots/ui/features/conversation/threads/thread-types";
import { currentText } from "@pokebots/ui/text";
import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { createScopeGuard } from "../../scope-lifetime";
import type { AgentTasks } from "../agent-tasks/agent-tasks-state";
import {
  type AgentThreadTabs,
  addPendingThreadDelete,
  forgetPendingThreadDeletes,
  type PendingThreadDelete,
  readPendingThreadDeletes,
  readThreadTabs,
  type ThreadTabsByServer,
  takePendingThreadDelete,
  writeThreadsSeenThrough,
  writeThreadTabs,
} from "./thread-tabs-storage";

const NO_TABS: AgentThreadTabs = { active: null, side: [] };
/** The window that shows the Undo toast finishes the delete. Another window waits this much longer. */
const OTHER_WINDOW_DELAY_MS = 5_000;

export interface AgentThreadTabsOptions {
  serverId: () => string;
  activeAgentId: () => string | undefined;
  tasks: AgentTasks;
}

/**
 * The sessions of each agent on this device: which session is the main session, and which side
 * threads have a tab in the side panel. The main session is the one that the user created or opened
 * last; the agent shows it when it opens. The threads themselves, and whether they are archived, come
 * from the host. A main session that is archived or deleted, also on another device, falls back to the
 * agent's own chat. Make it in the owner of the server: when that owner ends, each delete that waits
 * for its Undo time runs at once.
 */
export function createAgentThreadTabs(options: AgentThreadTabsOptions) {
  const { serverId, activeAgentId, tasks } = options;
  const scopeIsCurrent = createScopeGuard();
  /** The server of this state. On desktop the server scope makes the state again for each server. */
  const ownServerId = untrack(serverId);
  const [tabsByServer, setTabsByServer] = createFreshSignal<ThreadTabsByServer>(readThreadTabs());
  /** Agents with a new session. A new session that has no message is not kept after a restart. */
  const [drafts, setDrafts] = createFreshSignal<ReadonlySet<string>>(new Set());
  /** Threads that wait for the end of their Undo time before the delete. */
  const [hidden, setHidden] = createFreshSignal<ReadonlySet<string>>(new Set());
  /** The message that a side thread scrolls to when it shows, after a click on "Branched from". */
  const [messageFocus, setMessageFocus] = createSignal<ThreadMessageFocus | null>(null);

  const storedTabs = (agentId: string): AgentThreadTabs => tabsByServer()[serverId()]?.[agentId] ?? NO_TABS;
  const task = (agentId: string, id: string): AgentTask | undefined =>
    tasks.snapshot(agentId)?.tasks.find((entry) => entry.id === id);
  const shown = (agentId: string, id: string): boolean => {
    const entry = task(agentId, id);
    return entry !== undefined && entry.state !== "closed" && !hidden().has(id);
  };
  /** The side threads with a tab in the side panel that shows. */
  const sideIds = (agentId: string): string[] => storedTabs(agentId).side.filter((id) => shown(agentId, id));
  /** The side panel tabs that a write keeps. Before the thread list loads, no stored tab is dropped. */
  const keptSideIds = (agentId: string): string[] =>
    tasks.snapshot(agentId) ? sideIds(agentId) : storedTabs(agentId).side.filter((id) => !hidden().has(id));
  const hasDraft = (agentId: string) => drafts().has(agentId);
  /** The main session of an agent: a side thread, a new session, or the agent's own chat. */
  function activeId(agentId: string): string {
    const active = storedTabs(agentId).active;
    if (active === DRAFT_THREAD_ID) return hasDraft(agentId) ? DRAFT_THREAD_ID : MAIN_THREAD_ID;
    return active !== null && shown(agentId, active) ? active : MAIN_THREAD_ID;
  }

  /**
   * Writes the main session and the side panel tabs of one agent. Another window can write other
   * agents, so the stored value is read first. Without `side`, the side panel keeps its tabs, less the
   * thread that becomes the main session.
   */
  function writeTabs(agentId: string, tabs: { active: string | null; side?: string[] } | null): void {
    const server = serverId();
    const stored = readThreadTabs();
    const agents = { ...stored[server] };
    const side = tabs?.side ?? keptSideIds(agentId).filter((id) => id !== tabs?.active);
    if (tabs && (side.length > 0 || tabs.active !== null)) agents[agentId] = { active: tabs.active, side };
    else delete agents[agentId];
    const next = { ...stored, [server]: agents };
    if (Object.keys(agents).length === 0) delete next[server];
    setTabsByServer(() => next);
    writeThreadTabs(next);
    // The scroll to a message belongs to the session that opened at it. Another session ends it, so the
    // thread does not scroll there again when its view shows again.
    const focus = untrack(messageFocus);
    if (focus && focus.taskId !== tabs?.active) setMessageFocus(null);
  }

  function setDraft(agentId: string, shownDraft: boolean): void {
    setDrafts((current) => {
      if (current.has(agentId) === shownDraft) return current;
      const next = new Set(current);
      if (shownDraft) next.add(agentId);
      else next.delete(agentId);
      return next;
    });
  }

  /** The side panel tabs to keep: all of them, less `id`. */
  const sideWithout = (agentId: string, id: string) => keptSideIds(agentId).filter((entry) => entry !== id);

  /**
   * Opens a session and makes it the main session. A new session that the user leaves without a
   * message closes.
   */
  function open(agentId: string, id: string): void {
    if (id !== DRAFT_THREAD_ID) setDraft(agentId, false);
    writeTabs(agentId, { active: id === MAIN_THREAD_ID ? null : id, side: sideWithout(agentId, id) });
  }

  /**
   * Opens the session of a conversation thread from outside the header, for example a notification:
   * a side thread, or the agent's own chat for a thread that is no side thread. An archived side
   * thread does not open, and the main session stays.
   */
  async function openConversation(agentId: string, threadId: string): Promise<void> {
    const find = () => tasks.snapshot(agentId)?.tasks.find((entry) => entry.threadId === threadId);
    if (!find() && tasks.available()) await tasks.loadTasks(agentId);
    if (!scopeIsCurrent()) return;
    const entry = find();
    if (!entry) open(agentId, MAIN_THREAD_ID);
    else if (entry.state !== "closed") open(agentId, entry.id);
  }

  /** Starts a new session and makes it the main session. Its first message starts the thread. */
  function startNew(agentId: string): void {
    setDraft(agentId, true);
    writeTabs(agentId, { active: DRAFT_THREAD_ID });
  }

  /** Closes the new session of an agent. The agent's own chat becomes the main session. */
  function closeDraft(agentId: string): void {
    if (!hasDraft(agentId)) return;
    setDraft(agentId, false);
    if (activeId(agentId) === DRAFT_THREAD_ID) writeTabs(agentId, { active: null });
  }

  /**
   * Moves a session to the side panel, where its thread shows beside the main session. When the
   * thread was the main session, the agent's own chat becomes the main session.
   */
  function toSide(agentId: string, id: string): void {
    if (id === MAIN_THREAD_ID || id === DRAFT_THREAD_ID) return;
    const active = storedTabs(agentId).active;
    writeTabs(agentId, { active: active === id ? null : active, side: [...sideWithout(agentId, id), id] });
  }

  /** Moves a side panel tab back to the chat, where its thread becomes the main session. */
  function toChat(agentId: string, id: string): void {
    open(agentId, id);
  }

  /** Closes a side panel tab. The thread stays in the thread list. */
  function closeSide(agentId: string, id: string): void {
    writeTabs(agentId, { active: storedTabs(agentId).active, side: sideWithout(agentId, id) });
  }

  /** Moves a side panel tab to an index among the side panel tabs. */
  function moveSide(agentId: string, id: string, index: number): void {
    const side = keptSideIds(agentId).filter((entry) => entry !== id);
    side.splice(index, 0, id);
    writeTabs(agentId, { active: storedTabs(agentId).active, side });
  }

  /**
   * Archives a thread. When the host archived it, it leaves the side panel, and as the main session it
   * gives way to the agent's own chat. The thread then shows in the archived list.
   */
  async function archive(agentId: string, id: string): Promise<void> {
    if (!(await tasks.closeTask(agentId, id)) || !scopeIsCurrent()) return;
    release(agentId, id);
  }

  /** Takes a thread out of the side panel, and gives the main session to the agent's own chat if it had it. */
  function release(agentId: string, id: string): void {
    const active = storedTabs(agentId).active;
    writeTabs(agentId, { active: active === id ? null : active, side: sideWithout(agentId, id) });
  }

  /** Restores an archived thread and opens it. */
  async function restore(agentId: string, id: string): Promise<void> {
    if (task(agentId, id)?.state === "closed" && !(await tasks.reopenTask(agentId, id))) return;
    if (scopeIsCurrent()) open(agentId, id);
  }

  async function rename(agentId: string, id: string, title: string): Promise<void> {
    await tasks.renameTask(agentId, id, title);
  }

  /**
   * Deletes that wait for the end of the Undo time, by thread. A server switch ends this scope and the
   * Undo time with it: each delete then runs at once, against the server it was made on.
   */
  const pendingDeletes = new Map<string, () => void>();
  /** Stored deletes of other windows or of an earlier session, which this window finishes. */
  const storedDeleteTimers = new Set<ReturnType<typeof setTimeout>>();
  onCleanup(() => {
    for (const timer of storedDeleteTimers) clearTimeout(timer);
    for (const commit of [...pendingDeletes.values()]) commit();
  });

  function setHiddenThread(id: string, hide: boolean): void {
    setHidden((current) => {
      if (current.has(id) === hide) return current;
      const next = new Set(current);
      if (hide) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /**
   * The thread is archived at once, so it stays archived also when the app quits, and a toast offers
   * Undo. The host deletes it only when the time is over. The delete is stored on this device until
   * then, so a later start of the app finishes it. Each request goes to the server of the delete.
   */
  async function remove(agentId: string, id: string): Promise<void> {
    const entry = task(agentId, id);
    if (!entry || hidden().has(id)) return;
    const server = serverId();
    const wasActive = activeId(agentId) === id;
    const wasSide = storedTabs(agentId).side.includes(id);
    const restore = entry.state !== "closed";
    release(agentId, id);
    setHiddenThread(id, true);

    /** Undo: the thread shows again where it was, as the main session or in the side panel. */
    function showTab(): void {
      setHiddenThread(id, false);
      if (wasActive) open(agentId, id);
      else if (wasSide) toSide(agentId, id);
    }

    // The archive shows its own error. The thread then stays where it was.
    if (restore && !(await tasks.closeTask(agentId, id, server))) {
      if (scopeIsCurrent()) showTab();
      return;
    }
    const pending: PendingThreadDelete = {
      serverId: server,
      agentId,
      threadId: id,
      deadline: Date.now() + TOAST_DURATION,
      restore,
    };
    addPendingThreadDelete(pending);
    // The scope ended during the archive: the next start finishes the delete.
    if (!scopeIsCurrent()) return;

    const toastId = `agent-thread-delete-${server}-${id}`;
    let settled = false;
    function settle(): boolean {
      if (settled) return false;
      settled = true;
      pendingDeletes.delete(id);
      // A scope cleanup can call this, and a write to the Toaster from there stops the reactive system.
      queueMicrotask(() => toast.dismiss(toastId));
      return true;
    }
    async function undo(): Promise<void> {
      if (!settle()) return;
      takePendingThreadDelete(pending);
      if (!scopeIsCurrent()) return;
      // A thread that does not open again stays in the archived list.
      if (restore && !(await tasks.reopenTask(agentId, id, server))) {
        if (scopeIsCurrent()) setHiddenThread(id, false);
        return;
      }
      if (scopeIsCurrent()) showTab();
    }
    async function commit(): Promise<void> {
      if (!settle()) return;
      const deleted = await tasks.deleteTask(agentId, id, server);
      // A delete that failed after this scope ended stays stored: the next start finishes it. A
      // thread that the host kept while the scope is current comes back in the archived list.
      if (deleted || scopeIsCurrent()) takePendingThreadDelete(pending);
      if (!deleted && scopeIsCurrent()) setHiddenThread(id, false);
    }
    pendingDeletes.set(id, () => void commit());
    const { t } = currentText();
    toast(t("conversation.threads.deleteUndo.title", { title: entry.title }), {
      id: toastId,
      duration: TOAST_DURATION,
      action: { label: t("conversation.threads.deleteUndo.action"), onClick: () => void undo() },
      onAutoClose: () => void commit(),
      onDismiss: () => void commit(),
    });
  }

  /** Finishes a stored delete of this server that no window of this session owns. */
  async function finishStoredDelete(entry: PendingThreadDelete): Promise<void> {
    if (pendingDeletes.has(entry.threadId)) return;
    // Another window finished it, or its Undo restored the thread.
    if (!takePendingThreadDelete(entry)) {
      if (scopeIsCurrent()) setHiddenThread(entry.threadId, false);
      return;
    }
    const deleted = await tasks.deleteTask(entry.agentId, entry.threadId, entry.serverId);
    if (deleted) return;
    if (scopeIsCurrent()) setHiddenThread(entry.threadId, false);
    else addPendingThreadDelete(entry);
  }

  // The stored deletes of this server stay hidden. The window that shows their toast finishes them;
  // after that window's time, or after a quit, this window does.
  createEffect(
    () => serverId(),
    (server) => {
      for (const entry of readPendingThreadDeletes()) {
        if (entry.serverId !== server || pendingDeletes.has(entry.threadId)) continue;
        setHiddenThread(entry.threadId, true);
        const timer = setTimeout(
          () => {
            storedDeleteTimers.delete(timer);
            void finishStoredDelete(entry);
          },
          Math.max(0, entry.deadline + OTHER_WINDOW_DELAY_MS - Date.now()),
        );
        storedDeleteTimers.add(timer);
      }
    },
  );

  /** Sends a message to a side thread. An archived thread is restored first. */
  async function send(
    agentId: string,
    id: string,
    text: string,
    attachmentDraftIds: string[],
    replyToMessageId: string | null = null,
    createArtifact?: boolean,
    queueOnly?: boolean,
  ): Promise<boolean> {
    if (task(agentId, id)?.state === "closed" && !(await tasks.reopenTask(agentId, id))) return false;
    return tasks.sendToTask(agentId, id, text, attachmentDraftIds, replyToMessageId, createArtifact, queueOnly);
  }

  /** The first message of a new session starts the thread, which takes its place as the main session. */
  async function sendDraft(agentId: string, text: string, attachmentDraftIds: string[]): Promise<boolean> {
    const started = await tasks.startTask(agentId, text, attachmentDraftIds);
    if (!started) return false;
    if (!scopeIsCurrent()) {
      // The user left the server while its files loaded. The thread started there, and is its main session (#9123).
      const stored = readThreadTabs();
      const tabs = stored[ownServerId]?.[agentId] ?? NO_TABS;
      const active = tabs.active === DRAFT_THREAD_ID ? started.id : tabs.active;
      writeThreadTabs({ ...stored, [ownServerId]: { ...stored[ownServerId], [agentId]: { ...tabs, active } } });
      return true;
    }
    const stillOpen = activeId(agentId) === DRAFT_THREAD_ID;
    setDraft(agentId, false);
    writeTabs(agentId, { active: stillOpen ? started.id : storedTabs(agentId).active });
    return true;
  }

  /** Runs a queued message of the agent's own chat in a new thread, and opens it. */
  async function runQueuedMessage(agentId: string, deliveryId: string): Promise<void> {
    const started = await tasks.runQueuedMessageAsTask(agentId, deliveryId);
    if (!started || !scopeIsCurrent()) return;
    open(agentId, started.id);
  }

  /**
   * Copies a conversation through an agent answer into a new thread, which becomes the main session,
   * as a queued message that runs in a new thread does. Resolves true when the branch opened.
   */
  async function branch(agentId: string, sourceTaskId: string | null, messageId: string): Promise<boolean> {
    const started = await tasks.branchTask(agentId, sourceTaskId, messageId);
    if (!started || !scopeIsCurrent()) return false;
    open(agentId, started.id);
    return true;
  }

  /**
   * Opens a side thread at one of its messages. An archived thread is restored, as from the menu. The list
   * has every open thread, so a thread that the list does not have is archived. A thread in the side
   * panel stays there and scrolls to the message beside the chat.
   */
  async function openAt(agentId: string, id: string, messageId: string): Promise<void> {
    setMessageFocus({ taskId: id, messageId, nonce: (messageFocus()?.nonce ?? 0) + 1 });
    if (!task(agentId, id) && !(await tasks.reopenTask(agentId, id))) return;
    if (!scopeIsCurrent() || sideIds(agentId).includes(id)) return;
    await restore(agentId, id);
  }

  /** Removes the sessions state of a deleted agent. */
  function forgetAgent(agentId: string): void {
    forgetPendingThreadDeletes(serverId(), agentId);
    writeThreadsSeenThrough(serverId(), agentId, null);
    setDraft(agentId, false);
    writeTabs(agentId, null);
  }

  // The open thread and the threads in the side panel keep their conversations. The conversations of
  // the other threads go when there are too many, and the thread reads it again when its tab opens.
  createEffect(
    () => {
      const agentId = activeAgentId();
      return agentId ? [activeId(agentId), ...sideIds(agentId)].join("\n") : "";
    },
    (key) => tasks.showConversations(key ? key.split("\n") : []),
  );

  // The open thread and the threads in the side panel read their conversations once, also when their
  // tabs are open after a restart. Events then keep them current. A thread that waits for its read is
  // not read again when another thread loads; it is read again only after it stops waiting and waits again.
  let reading: ReadonlySet<string> = new Set();
  createEffect(
    () => {
      const agentId = activeAgentId();
      if (!agentId) return null;
      const ids = [activeId(agentId), ...sideIds(agentId)].filter(
        (id) => id !== MAIN_THREAD_ID && id !== DRAFT_THREAD_ID && !tasks.conversation(id),
      );
      return ids.length === 0 ? null : [agentId, ...ids].join("\n");
    },
    (key) => {
      const [agentId = "", ...ids] = key?.split("\n") ?? [];
      for (const id of ids) if (!reading.has(id)) tasks.openTask(agentId, id);
      reading = new Set(ids);
    },
  );

  return {
    sideIds,
    hasDraft,
    activeId,
    hidden,
    open,
    openConversation,
    startNew,
    closeDraft,
    toSide,
    toChat,
    closeSide,
    moveSide,
    archive,
    restore,
    rename,
    remove,
    send,
    sendDraft,
    runQueuedMessage,
    branch,
    openAt,
    messageFocus,
    forgetAgent,
  };
}

/**
 * A signal whose read gives the last write at once. A write in an event handler reaches a plain signal
 * only after the flush, and a tab action reads the tabs again in the same handler: a stale read there
 * would write a closed tab back.
 */
function createFreshSignal<T>(initial: T): [() => T, (next: (current: T) => T) => void] {
  let latest = initial;
  // The value lives in `latest`; the signal only tells readers that it changed.
  const [version, setVersion] = createSignal(0);
  return [
    () => {
      version();
      return latest;
    },
    (next) => {
      latest = next(latest);
      setVersion((current) => current + 1);
    },
  ];
}

/** A message that a side thread scrolls to once. A new request has a new nonce. */
export interface ThreadMessageFocus {
  taskId: string;
  messageId: string;
  nonce: number;
}

export type AgentThreadTabsState = ReturnType<typeof createAgentThreadTabs>;

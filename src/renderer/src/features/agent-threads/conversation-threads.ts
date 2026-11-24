import type { AgentApproval, AgentContextState, AgentEvent, AgentTask } from "@pokebots/contracts/ipc";
import { isAgentTaskActive, taskApproval } from "@pokebots/team-client/agent-tasks";
import type { AgentProfile } from "@pokebots/ui/data";
import type { AgentThreadOlderMessages } from "@pokebots/ui/features/conversation/threads/AgentThreadView";
import {
  sideThreadTabs,
  type ThreadListsInput,
  threadLists,
} from "@pokebots/ui/features/conversation/threads/thread-items";
import {
  DRAFT_THREAD_ID,
  MAIN_THREAD_ID,
  type ThreadHeaderProps,
  type ThreadStatus,
} from "@pokebots/ui/features/conversation/threads/thread-types";
import type { SidebarWaitReason } from "@pokebots/ui/features/sidebar/sidebar-types";
import type { AgentTasks } from "../agent-tasks/agent-tasks-state";
import type {
  BrowserTakeoverRequest,
  ConversationBranchSource,
  ConversationThreads,
  PromptAnswerOptions,
  SideThread,
} from "../conversation/conversation-types";
import type { AgentThreadTabsState } from "./agent-thread-tabs";

type PromptEvent = Extract<AgentEvent, { type: "prompt" }>;

export interface ConversationThreadsInput {
  agent: { id: string; updatedAt: string };
  /** The title of the agent's own chat in the session list. */
  mainTitle: string;
  /** What the agent's own chat does now. Missing where the client does not know: the row then has no badge. */
  mainStatus?: (() => ThreadStatus) | undefined;
  tasks: AgentTasks;
  tabs: AgentThreadTabsState;
  /** The approvals that wait on the server. A side thread's turn waits for the one of its own thread. */
  approvals: readonly AgentApproval[];
  /** The questions that wait on the server. A side thread's turn waits for the one of its own thread. */
  prompts: readonly PromptEvent[];
  /** The browser takeovers that wait on the server. A side thread's turn waits for the one of its own thread. */
  takeovers: readonly BrowserTakeoverRequest[];
  newThreadTitle: string;
  onRespondApproval: (
    approval: AgentApproval,
    decision: "accept" | "decline",
    options?: PromptAnswerOptions,
  ) => Promise<boolean>;
  /**
   * The context of each side thread that reported it, by thread id. Only this computer reports it.
   * Read only by `contextState`, so a new runtime snapshot does not build the threads again.
   */
  contextStates?: (() => Readonly<Record<string, AgentContextState>>) | undefined;
  /** Missing when the host cannot compact a side thread. */
  onCompactContext?: ((taskId: string) => Promise<void>) | undefined;
  /**
   * Opens the agent's own chat at a message, as a search result does. Resolves false when the chat does
   * not have the message. Without it, a click on "Branched from" opens the agent's own chat at its latest message.
   */
  onOpenMainMessage?: ((messageId: string) => Promise<boolean>) | undefined;
  /**
   * The agents that a new session can move to, from the agent picker of its empty view. Missing in a
   * window that shows one agent.
   */
  draftAgents?: DraftAgentsInput | undefined;
}

interface DraftAgentsInput {
  agents: readonly AgentProfile[];
  /** Shows another agent's chat with one of its sessions open. */
  open: (agentId: string, threadId: string) => void;
}

/** The threads of one agent, for the conversation. Read it in a memo: it reads the thread state. */
export function conversationThreads(input: ConversationThreadsInput): ConversationThreads {
  const { agent, tasks, tabs, approvals, prompts, takeovers, onCompactContext, draftAgents } = input;
  const agentId = agent.id;
  const snapshot = tasks.snapshot(agentId);
  const list = snapshot?.tasks ?? [];
  const activeId = tabs.activeId(agentId);
  const listInput: ThreadListsInput = {
    main: { title: input.mainTitle, updatedAt: agent.updatedAt, status: input.mainStatus?.() },
    activeId,
    draft: tabs.hasDraft(agentId),
    tasks: list,
    draftTitle: input.newThreadTitle,
    hidden: tabs.hidden(),
    waitsFor: (task) => taskWaitsFor(task, { approvals, prompts, takeovers }),
    unread: (task) => tasks.unreadCount(task),
  };
  const lists = threadLists(listInput);
  const open =
    activeId === MAIN_THREAD_ID
      ? undefined
      : activeId === DRAFT_THREAD_ID
        ? null
        : list.find((task) => task.id === activeId);
  const approval = open ? taskApproval(open, approvals) : undefined;
  const editable = tasks.editable();
  const olderMessages = (taskId: string): AgentThreadOlderMessages | undefined => {
    const older = tasks.olderMessages(taskId);
    return older ? { loading: older.loading, onLoad: () => void tasks.loadOlderMessages(agentId, taskId) } : undefined;
  };
  const newerMessages = (taskId: string): AgentThreadOlderMessages | undefined => {
    const newer = tasks.newerMessages(taskId);
    return newer ? { loading: newer.loading, onLoad: () => void tasks.loadLatest(agentId, taskId) } : undefined;
  };
  const focus = tabs.messageFocus();
  /** A thread in the side panel, with the actions of its own message box. */
  const sideThread = (id: string): SideThread | undefined => {
    const task = list.find((entry) => entry.id === id);
    if (!task) return undefined;
    const sideApproval = taskApproval(task, approvals);
    return {
      task,
      conversation: tasks.conversation(task.id),
      olderMessages: olderMessages(task.id),
      newerMessages: newerMessages(task.id),
      focusMessage: focus?.taskId === task.id ? focus : undefined,
      approval: sideApproval,
      onSend: (text, attachmentDraftIds, replyToMessageId, createArtifact, queueOnly) =>
        tabs.send(agentId, task.id, text, attachmentDraftIds, replyToMessageId, createArtifact, queueOnly),
      onStop: () => tasks.stopTask(agentId, task.id),
      onRead: (messageId) => tasks.markTaskRead(agentId, task.id, messageId),
      onRespondApproval: (decision, options) =>
        sideApproval ? input.onRespondApproval(sideApproval, decision, options) : Promise.resolve(false),
      get contextState() {
        return input.contextStates?.()[task.threadId];
      },
      onCompactContext: onCompactContext ? () => onCompactContext(task.id) : undefined,
    };
  };
  /**
   * The source of a branch. The list has the current title of a listed source. The list can leave out an
   * archived source, so the link's title is the fallback; a link with no title is a deleted source.
   */
  const branchSource = (task: AgentTask): ConversationBranchSource | undefined => {
    const branch = task.branch;
    if (!branch) return undefined;
    const { sourceTaskId, sourceMessageId, throughMessageId } = branch;
    if (sourceTaskId === null)
      return {
        throughMessageId,
        title: null,
        deleted: false,
        onOpen: () => {
          tabs.open(agentId, MAIN_THREAD_ID);
          void input.onOpenMainMessage?.(sourceMessageId);
        },
      };
    const title = list.find((entry) => entry.id === sourceTaskId)?.title ?? branch.sourceTitle;
    return {
      throughMessageId,
      title,
      deleted: title === null,
      onOpen: () => void tabs.openAt(agentId, sourceTaskId, sourceMessageId),
    };
  };
  /** The sessions of this agent: its own chat, its side threads and its new session. */
  const header: ThreadHeaderProps = {
    ...lists,
    activeId,
    canStartNew: true,
    onOpen: (id) => tabs.open(agentId, id),
    onNew: () => tabs.startNew(agentId),
    onArchive: (id) => void tabs.archive(agentId, id),
    onStop: (id) => tasks.stopTask(agentId, id),
    onRestore: (id) => void tabs.restore(agentId, id),
    onRename: editable ? (id, title) => void tabs.rename(agentId, id, title) : undefined,
    onDelete: editable ? (id) => void tabs.remove(agentId, id) : undefined,
  };
  return {
    background: list.filter((task) => task.state === "running" || task.state === "queued"),
    header,
    side: {
      tabs: sideThreadTabs(listInput, tabs.sideIds(agentId)),
      thread: sideThread,
      onToSide: (id) => tabs.toSide(agentId, id),
      onToChat: (id) => tabs.toChat(agentId, id),
      onClose: (id) => tabs.closeSide(agentId, id),
      onMove: (id, index) => tabs.moveSide(agentId, id, index),
    },
    open,
    tasks: list,
    limit: snapshot?.limit ?? 1,
    running: list.filter(isAgentTaskActive).length,
    conversation: open ? tasks.conversation(open.id) : undefined,
    olderMessages: open ? olderMessages(open.id) : undefined,
    newerMessages: open ? newerMessages(open.id) : undefined,
    approval,
    acceptsFiles: tasks.filesAccepted(),
    acceptsReplies: tasks.repliable(),
    onSend: (text, attachmentDraftIds, replyToMessageId, createArtifact, queueOnly) =>
      open
        ? tabs.send(agentId, open.id, text, attachmentDraftIds, replyToMessageId, createArtifact, queueOnly)
        : tabs.sendDraft(agentId, text, attachmentDraftIds),
    onStop: () => {
      if (open) tasks.stopTask(agentId, open.id);
    },
    onStopTask: (taskId) => tasks.stopTask(agentId, taskId),
    onRead: (messageId) => {
      if (open) tasks.markTaskRead(agentId, open.id, messageId);
    },
    onRespondApproval: (decision, options) =>
      approval ? input.onRespondApproval(approval, decision, options) : Promise.resolve(false),
    get contextState() {
      return open ? input.contextStates?.()[open.threadId] : undefined;
    },
    onCompactContext: open && onCompactContext ? () => onCompactContext(open.id) : undefined,
    // Custom: the new thread moves to another agent. The draft of this agent closes, and the other agent's opens.
    onChangeDraftAgent:
      draftAgents && open === null ? (target) => changeDraftAgent(input, draftAgents, target) : undefined,
    // Only this computer moves a queued message to a new thread.
    onRunQueuedMessage: tasks.queuedMessageMovable()
      ? (deliveryId) => void tabs.runQueuedMessage(agentId, deliveryId)
      : undefined,
    queueActions: tasks.queueActions()
      ? {
          cancel: (deliveryId) => tasks.cancelQueuedMessage(agentId, deliveryId),
          steer: (task, deliveryId) => {
            if (task.activeTurnId) tasks.steerQueuedMessage(agentId, task.id, deliveryId, task.activeTurnId);
          },
          reorder: (taskId, deliveryIds) => tasks.reorderQueue(agentId, taskId, deliveryIds),
        }
      : undefined,
    onBranch: tasks.canBranch()
      ? (sourceTaskId, messageId) => tabs.branch(agentId, sourceTaskId, messageId)
      : undefined,
    onDeleteMessage: tasks.canDeleteMessage()
      ? (taskId, messageId) => tasks.deleteTaskMessage(agentId, taskId, messageId)
      : undefined,
    branchSource,
    routineThread: (routineId) => {
      const task = routineTask(list, routineId);
      return task ? () => tabs.open(agentId, task.id) : undefined;
    },
    onOpenRoutineThread: async (routineId) => {
      const listed = () => routineTask(tasks.snapshot(agentId)?.tasks ?? [], routineId);
      if (!listed()) await tasks.loadTasks(agentId);
      const task = listed();
      if (task) tabs.open(agentId, task.id);
      return task !== undefined;
    },
    onOpenRoutineRun: async (routineId, messageId) => {
      // An archived thread of the routine keeps its runs too. `openAt` restores it.
      const listed = () =>
        (tasks.snapshot(agentId)?.tasks ?? [])
          .filter((task) => task.routineId === routineId)
          .sort((left, right) => Number(left.state === "closed") - Number(right.state === "closed"));
      if (listed().length === 0) await tasks.loadTasks(agentId);
      for (const task of listed()) {
        if (!(await tasks.taskHasMessage(agentId, task.id, messageId))) continue;
        await tabs.openAt(agentId, task.id, messageId);
        await tasks.loadMessage(agentId, task.id, messageId).catch(() => false);
        return true;
      }
      return false;
    },
    focusMessage: focus && list.some((task) => task.id === focus.taskId) ? focus : null,
    onOpenMessage: async (taskId, messageId) => {
      if (taskId === null) {
        tabs.open(agentId, MAIN_THREAD_ID);
        return (await input.onOpenMainMessage?.(messageId)) ?? false;
      }
      // A deleted thread that waits for the end of its Undo time does not open.
      if (tabs.hidden().has(taskId)) return false;
      // The part around the message loads first, so a pin of a deleted message or thread opens no tab.
      if (!(await tasks.loadMessage(agentId, taskId, messageId).catch(() => false))) return false;
      // The thread scrolls to the message when its row shows. A restore that fails shows its own error.
      await tabs.openAt(agentId, taskId, messageId);
      return true;
    },
  };
}

/** Custom: starts the new session with another agent, and closes the new session of this one. */
function changeDraftAgent(input: ConversationThreadsInput, all: DraftAgentsInput, target: string): void {
  const { agent, tabs } = input;
  if (target === agent.id || !all.agents.some((profile) => profile.id === target)) return;
  tabs.startNew(target);
  tabs.closeDraft(agent.id);
  all.open(target, DRAFT_THREAD_ID);
}

/** The open side thread where the routine runs. */
function routineTask(list: readonly AgentTask[], routineId: string): AgentTask | undefined {
  return list.find((task) => task.routineId === routineId && task.state !== "closed");
}

type TaskThread = { agentId: string; threadId: string };

/** The requests that wait for the user on the server, of every thread. */
export interface ThreadWaits {
  approvals: readonly AgentApproval[];
  prompts: readonly PromptEvent[];
  takeovers: readonly BrowserTakeoverRequest[];
}

/** What the running turn of a side thread waits for the user to do, if anything. */
export function taskWaitsFor(task: AgentTask, waits: ThreadWaits): SidebarWaitReason | undefined {
  if (taskApproval(task, waits.approvals) !== undefined) return "approval";
  if (ofTaskThread(task, waits.prompts) !== undefined) return "question";
  if (ofTaskThread(task, waits.takeovers) !== undefined) return "takeover";
  return undefined;
}

/** The question or takeover that the turn of this task waits for: the one of the task's own thread. */
function ofTaskThread<Request extends TaskThread>(task: TaskThread, requests: readonly Request[]): Request | undefined {
  return requests.find((request) => request.agentId === task.agentId && request.threadId === task.threadId);
}

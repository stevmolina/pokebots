import { limitedQuoteText } from "@pokebots/contracts/chat-tag-references";
import type {
  AgentApproval,
  AgentTask,
  AgentTaskHold,
  AttachmentSummary,
  DraftAttachment,
  InstalledSkill,
  MessageReaction,
  QueueDelivery,
} from "@pokebots/contracts/ipc";
import type { AppTextKey } from "@pokebots/i18n";
import { isAgentTaskActive } from "@pokebots/team-client/agent-tasks";
import { Button, Check, CopyButton, DropdownMenu, LoaderCircle, MessageSquareText, Square, toast } from "@pokebots/ui";
import { createScrollFades } from "@pokebots/ui/components/createScrollFades";
import type {
  AgentMessage,
  AgentProfile,
  ComposerBrowserTab,
  ComposerMcpServer,
  ComposerThread,
} from "@pokebots/ui/data";
import { AgentAvatar } from "@pokebots/ui/features/agents/AgentAvatar";
import { AgentActivityIndicator, nextAgentActivityLabel } from "@pokebots/ui/features/conversation/AgentActivity";
import {
  type AgentStep,
  AgentStepsDisclosure,
  type AgentStepsFacts,
  type AgentStepsTrace,
} from "@pokebots/ui/features/conversation/AgentSteps";
import {
  AttachmentCards,
  type AttachmentDownloads,
  type AttachmentMediaSource,
} from "@pokebots/ui/features/conversation/AttachmentCards";
import { AwaitingReplies, type AwaitingReplyItem } from "@pokebots/ui/features/conversation/AwaitingReplies";
import { agentActivityExitDuration } from "@pokebots/ui/features/conversation/activity-timing";
import { branchPointIds } from "@pokebots/ui/features/conversation/branch-points";
import { type ChangeMarkerActions, ChatActionMarker } from "@pokebots/ui/features/conversation/ChatActionMarker";
import { type ChatMessageAuthor, ChatMessageRow } from "@pokebots/ui/features/conversation/ChatMessageRow";
import { ComposerAddMenu, ComposerArtifactChip } from "@pokebots/ui/features/conversation/ComposerAddMenu";
import {
  ComposerAttachmentRow,
  type ComposerPendingImage,
} from "@pokebots/ui/features/conversation/ComposerAttachmentRow";
import {
  ComposerEditor,
  type ComposerPasteResult,
  type ComposerSelection,
  type QuoteRequest,
} from "@pokebots/ui/features/conversation/ComposerEditor";
import { ComposerNotice } from "@pokebots/ui/features/conversation/ComposerNotice";
import { ComposerReplyPreview } from "@pokebots/ui/features/conversation/ComposerReplyPreview";
import { ComposerSendControl } from "@pokebots/ui/features/conversation/ComposerSendControl";
import { ComposerStackCard } from "@pokebots/ui/features/conversation/ComposerStackCard";
import { ContextUsageMeter, type ContextUsageView } from "@pokebots/ui/features/conversation/ContextUsage";
import { ApprovalCard } from "@pokebots/ui/features/conversation/ConversationPrompts";
import { dayMarkerLabel } from "@pokebots/ui/features/conversation/chat-day-markers";
import { CHAT_TIME_GAP_MS, continuesSenderRun } from "@pokebots/ui/features/conversation/chat-grouping";
import {
  preferredMessageScrollBehavior,
  ScrollToLatestButton,
} from "@pokebots/ui/features/conversation/MessageNavigation";
import {
  DeleteMessageDialog,
  MessageActions,
  MessageMenu,
  MessageMenuItems,
  type MessageMenuItemsProps,
} from "@pokebots/ui/features/conversation/MessageRendering";
import { type ChatBubbleStyle, ownMessageAuthor } from "@pokebots/ui/features/conversation/own-bubble";
import { QueuePanel } from "@pokebots/ui/features/conversation/QueuePanel";
import {
  MessageSelectionActions,
  type QuoteShortcutModifier,
} from "@pokebots/ui/features/conversation/SelectionActions";
import type { SendShortcut } from "@pokebots/ui/features/conversation/send-shortcut";
import { ComposerVoiceControls, type VoicePhase } from "@pokebots/ui/features/conversation/VoiceRecordingMorph";
import { type TextValue, useText } from "@pokebots/ui/text";
import type { JSX } from "@solidjs/web";
import { children, createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js";
import { createComposerRowsResize } from "../createComposerRowsResize";
import { type AgentThreadBranchSource, BranchDivider } from "./BranchDivider";
import { MAIN_THREAD_ID } from "./thread-types";

const HOLD_TEXT = {
  "agent-restarting": "conversation.threads.hold.agentRestarting",
  "usage-limit": "conversation.threads.hold.usageLimit",
  "server-busy": "conversation.threads.hold.serverBusy",
  "agent-busy": "conversation.threads.hold.agentBusy",
  "one-turn": "conversation.threads.hold.oneTurn",
} as const satisfies Record<Exclude<AgentTaskHold, "task-limit">, AppTextKey>;

/** The list stays at its end while new text comes in, when the user has not scrolled up. */
const STICK_DISTANCE = 48;
/** A message this many view heights from the middle of the view or nearer slides into place. */
const NEAR_SCROLL_VIEWS = 2;

/**
 * Whether the thread shows this message as a row. A stopped turn can leave an agent message with no
 * text and nothing else in it. The thinking and the memory changes of a turn show in its steps.
 */
function shownInThread(message: AgentMessage): boolean {
  if (message.kind === "thinking" || message.kind === "memory-changes") return false;
  return (
    message.author === "you" ||
    message.streaming === true ||
    message.body.trim().length > 0 ||
    (message.attachments?.length ?? 0) > 0 ||
    message.imageGeneration !== undefined ||
    message.videoGeneration !== undefined ||
    message.questionPrompt !== undefined ||
    message.plan !== undefined ||
    message.actionMarker !== undefined
  );
}

/** Why the next message of a queued thread waits. Without a known hold, the thread names no reason. */
export function agentThreadHoldText(task: AgentTask, limit: number, t: TextValue["t"]): string | null {
  if (task.state !== "queued" || task.hold === null) return null;
  if (task.hold === "task-limit") return t("conversation.threads.hold.threadLimit", { count: limit });
  return t(HOLD_TEXT[task.hold]);
}

/** Another side thread of the agent whose turn runs, so the person can stop it to free a thread. */
export interface AgentThreadBusy {
  /** The task id. */
  id: string;
  title: string;
}

/** Dictation into the thread's message box, as in the agent's own chat. */
export interface AgentThreadVoice {
  /** The phase of this thread's recording; "idle" when it has none. */
  phase: VoicePhase;
  /** Another message box records, so this one cannot start. */
  blocked: boolean;
  /** What was said so far. */
  liveText: string;
  levels: readonly number[];
  elapsedSeconds: number;
  /** The download progress of the speech model, in percent, while it is prepared. */
  modelProgress: number | null;
  onStart: () => void;
  onCancel: () => void;
  onFinish: () => void;
  /** Stops the recording and sends the message with its text. */
  onSend: () => void;
}

/** A thread's messages before the loaded ones, which it reads page by page. */
export interface AgentThreadOlderMessages {
  /** A page read is in progress. */
  loading: boolean;
  onLoad: () => void;
}

/** The queue of a thread, with the actions of the queue in the agent's own chat. */
export interface AgentThreadQueue {
  /** The messages that wait to start in the thread, in queue order. */
  deliveries: QueueDelivery[];
  /** The queued message that the message box edits now, or null. */
  editingDeliveryId: string | null;
  /** A save or a cancel of the edit is in progress. */
  editBusy: boolean;
  /** Steers a queued message into the running turn. Missing where the provider cannot steer. */
  onSteer?: ((deliveryId: string) => void) | undefined;
  onCancel: (deliveryId: string) => void;
  /** Puts a queued message in the message box. Send saves it in its place. */
  onEdit: (delivery: QueueDelivery) => void;
  onCancelEdit: () => void;
  onReorder: (deliveryIds: string[]) => void;
}

/** Stands in for the agent name, so the name in the empty-thread subtitle can be a button. */
const AGENT_NAME_MARKER = "\u0000";

export interface AgentThreadViewProps {
  /** Null for a new thread: its first message starts it. */
  task: AgentTask | null;
  /** How many threads of the agent can run at the same time. */
  limit: number;
  /**
   * The other side threads of the agent that run a turn. They show under a thread-limit hold, each
   * with a Stop button. Missing where the host cannot stop a thread.
   */
  busyThreads?: readonly AgentThreadBusy[] | undefined;
  /** Stops the turn of another side thread by its task id and cancels its queued messages. */
  onStopThread?: ((taskId: string) => void) | undefined;
  agent: AgentProfile;
  agents: AgentProfile[];
  /**
   * Custom: starts the new thread with another agent. With it, the avatar of a new thread is a menu of
   * the agents. Missing for a thread that has started, or where the host cannot move the new thread.
   */
  onChangeAgent?: ((agentId: string) => void) | undefined;
  messages: readonly AgentMessage[];
  /** The agent's skills, for the `$` picker and the skill tags in messages. */
  skills?: InstalledSkill[] | undefined;
  /** The last skill list request failed, so an empty picker says so instead of "no skills". */
  skillsLoadFailed?: boolean | undefined;
  /** The host's MCP servers, offered by the same `$` the skills answer. */
  mcpServers?: ComposerMcpServer[] | undefined;
  /** The agent's browser tabs, for the `@` picker. */
  browserTabs?: ComposerBrowserTab[] | undefined;
  /** The agent's side threads, newest first, for the `@` picker. The view leaves out its own thread. */
  threads?: ComposerThread[] | undefined;
  /** Shows the browser tab, or opens the thread by its task id, that a tag names. */
  onOpenTag?: ((kind: "tab" | "thread", id: string) => void) | undefined;
  /** The unsent text of this thread's message box. The host keeps it for each thread. */
  createArtifact?: boolean | undefined;
  onCreateArtifactChange?: ((enabled: boolean) => void) | undefined;
  draft: string;
  /** The files that the draft names. */
  draftAttachments?: DraftAttachment[] | undefined;
  /** Custom: rows that the app shows above the message box, such as background workers. */
  aboveComposer?: JSX.Element;
  /** Custom: a row that the app shows under the thread title, such as the live bar of its subagents. */
  belowTitle?: JSX.Element;
  /** The images of the draft that show in the thumbnail row. A send takes them with the text. */
  rowAttachments?: readonly DraftAttachment[] | undefined;
  /** The pasted images that still import, with their local previews. */
  pendingImages?: readonly ComposerPendingImage[] | undefined;
  onRemoveAttachment?: ((attachment: DraftAttachment) => void) | undefined;
  /** Loads the images of a client that gets no `previewUrl`. */
  mediaSource?: AttachmentMediaSource | undefined;
  /** The download state of attachments from a joined server. */
  downloads?: AttachmentDownloads | undefined;
  onDraftChange: (text: string) => void;
  /** Receives pasted files and long text pastes, as `ComposerEditor` says. Without it, a file paste does nothing here. */
  onPasteFiles?:
    | ((
        files: File[],
        selection: ComposerSelection,
        text?: string,
      ) => undefined | Promise<ComposerPasteResult | undefined>)
    | undefined;
  onOpenDraftAttachment?: ((attachment: DraftAttachment) => void) | undefined;
  /** Opens the file picker. Without it, the "+" menu has no image or context item. */
  onAttachFiles?: (() => void) | undefined;
  /** Opens the agent's side question with the draft. Without it, the "+" menu has no side question. */
  onSideQuestion?: (() => void) | undefined;
  /** Without it, the message box has no microphone. */
  voice?: AgentThreadVoice | undefined;
  /** Each increase moves the caret to the end of the text, as after a dictation. */
  focusRequest?: number | undefined;
  /** Sends a message. The host clears the text when the message went; when it did not, the text stays. */
  onSend: (text: string) => Promise<boolean>;
  /**
   * Cmd+Enter (Ctrl+Enter) while plain Enter sends: queues a message behind the running turn instead
   * of steering into it. Absent, the chord sends like Enter.
   */
  onSendAlternate?: ((text: string) => Promise<boolean>) | undefined;
  onStop: () => void;
  onOpenLink: (url: string) => void;
  /**
   * Opens a file that a message links to: from the shared folder, or from the workspace of `agentId`, the
   * agent that wrote the message. `asWritten` is the file name as the message wrote it, when the path joins
   * it to a folder. Without it, a file link shows as text.
   */
  onOpenFile?:
    | ((kind: "shared" | "workspace", agentId: string | undefined, path: string, asWritten?: string) => void)
    | undefined;
  /**
   * Opens an agent's chat, or one of its threads by tab id. With it, a message to or from another agent
   * shows as a marker, as in the agent's own chat. Without it, the message shows as a row.
   */
  onSelectAgent?: ((agentId: string, tabId?: string) => void) | undefined;
  /** The actions of a skill or instruction change line. An instruction change has View, not Undo. */
  changeMarkerActions?: ChangeMarkerActions | undefined;
  onPreview: (attachment: AttachmentSummary) => void;
  onAttachmentAction: (attachment: AttachmentSummary, action: "open" | "reveal" | "download") => void;
  /** The window draws the macOS window controls over the top start corner. The image viewer leaves room. */
  macWindowControls?: boolean | undefined;
  /** The approval that the thread's running turn waits for. */
  approval?: AgentApproval | undefined;
  onRespondApproval: (decision: "accept" | "decline") => Promise<boolean>;
  /** How full the thread's context is, when its provider reported it. */
  context?: ContextUsageView | undefined;
  /** Compacts the thread's context now. Missing when the host cannot. */
  onCompactContext?: (() => Promise<void>) | undefined;
  /** Whether the thread's running turn waits for the person: a question or a browser takeover. */
  waitsForAnswer?: boolean | undefined;
  /** Another card that the thread shows, such as a question or a browser takeover. The app builds it. */
  attention?: JSX.Element | undefined;
  /**
   * The thread has messages before the loaded ones. Missing when it has none, when it is not known yet,
   * or when the server cannot read them.
   */
  olderMessages?: AgentThreadOlderMessages | undefined;
  /**
   * The thread shows a part around an old message, and its latest messages are not loaded: a way back
   * to the latest message shows. `onLoad` reads them in the place of the part.
   */
  newerMessages?: AgentThreadOlderMessages | undefined;
  /**
   * The card that the app draws in the place of a message row, such as an MCP sign-in or a visual
   * reply page. `quote` puts text in this message box. Undefined keeps the row.
   */
  messageCard?:
    | ((message: AgentMessage, quote: (messageId: string, text: string) => void) => JSX.Element | undefined)
    | undefined;
  /**
   * The steps of the finished turn above an answer, or on the thinking row of a finished turn with no
   * answer. Undefined for a message that has none.
   */
  stepsAbove?: ((messageId: string) => AgentStep[] | undefined) | undefined;
  /** The time that the turn of an answer took, and how many of its steps failed. */
  factsAbove?: ((messageId: string) => AgentStepsFacts | undefined) | undefined;
  /** The trace of the turn of an answer. With it, the steps stand beside the answer, as in the agent's chat. */
  traceAbove?: ((messageId: string) => AgentStepsTrace) | undefined;
  /** The steps of the running turn, for its activity row. */
  activeSteps?: readonly AgentStep[] | undefined;
  /**
   * When the background work of the thread started, in epoch milliseconds, while it still runs after
   * its turn ended. The agent continues when it ends, so the thread shows that it waits.
   */
  backgroundWorkSince?: number | undefined;
  /** The "Show agent steps" setting: the steps are open at first. */
  stepsOpenByDefault?: boolean | undefined;
  /** Receives the message list, where the app searches the thread. */
  scrollRef?: ((element: HTMLElement) => void) | undefined;
  /** Whether a long message draws in full, with no fold: the app searches the drawn text of the thread. */
  showFullMessage?: ((message: AgentMessage) => boolean) | undefined;
  /** The user's send shortcut. Enter when absent. */
  sendShortcut?: SendShortcut | undefined;
  /** Opens the passage that a quote chip points to. */
  onOpenQuote?: ((messageId: string, text: string) => void) | undefined;
  /** Sets or clears the person's reaction on a message of this thread. */
  onReact?: ((message: AgentMessage, emoji: MessageReaction | null) => void) | undefined;
  /** Reads an agent reply aloud. Absent where this computer cannot. */
  readAloud?: ((message: AgentMessage) => { reading: boolean; onToggle: () => void } | undefined) | undefined;
  /** Copies a message. Without it, the messages have no action row and no right-click menu. */
  onCopyMessage?: ((message: AgentMessage) => void) | undefined;
  /** The message that the copy action copied a moment ago. The full action row shows it. */
  copiedMessageId?: string | null | undefined;
  /**
   * True (the default) shows Reply and a More button in the action row. False shows Reply, Copy and
   * Branch in the row, as before.
   */
  compactMessageActions?: boolean | undefined;
  /** How the reader's own bubbles look: the agent's color, solid or as a tint, or classic grey (the default). */
  bubbleStyle?: ChatBubbleStyle | undefined;
  /**
   * Copies the thread through an answer into a new thread. Only the last answer of each finished turn
   * offers it. Missing where the host cannot branch.
   */
  onBranch?: ((messageId: string) => void) | undefined;
  /**
   * Deletes a message of the thread, after the reader confirms. Missing where the host cannot delete
   * messages. `canDeleteMessage` says which messages offer it.
   */
  onDeleteMessage?: ((messageId: string) => Promise<void>) | undefined;
  /** Whether the reader can delete a message. Without it, every message that is not streaming can. */
  canDeleteMessage?: ((message: AgentMessage) => boolean) | undefined;
  /**
   * The "Use as backdrop" action of a message, or undefined when the message has nothing that can go
   * behind the window. Missing where the host has no backdrop.
   */
  backdropAction?: ((message: AgentMessage) => (() => void) | undefined) | undefined;
  /** Where the thread came from, when it is a branch. A line shows after the copied messages. */
  branchSource?: AgentThreadBranchSource | undefined;
  /** Makes the draft a reply to a message of the thread. Missing where the host cannot take a reply in a thread. */
  onReply?: ((message: AgentMessage) => void) | undefined;
  /** The message that the draft replies to. It shows above the message box. */
  replyTo?: AgentMessage | undefined;
  /** Removes the reply from the draft. */
  onCancelReply?: (() => void) | undefined;
  /** A message to scroll to and mark once, when it shows. Each new request has a new nonce. */
  focusMessage?: { messageId: string; nonce: number } | undefined;
  /** Pins a message to this thread, or unpins it. Without it, the message menu has no such item. */
  messagePins?:
    | { isPinned: (messageId: string) => boolean; onToggle: (messageId: string, pinned: boolean) => void }
    | undefined;
  /**
   * The queue of the thread, as the agent's own chat shows its queue. Without it the thread lists the
   * start of each queued message: a joined server sends no more on `agent-tasks-v1`.
   */
  queue?: AgentThreadQueue | undefined;
  /** The agents that the thread asked and that have not answered yet, as the agent's own chat shows them. */
  awaiting?: readonly AwaitingReplyItem[] | undefined;
  /** Opens an agent of `awaiting` that waits for the user, where it waits. Without it, `onSelectAgent` opens the agent. */
  onOpenWaitingAgent?: ((agentId: string) => void) | undefined;
  /**
   * The actions for text selected in the thread. Quote puts the text in this message box, and a send
   * goes to this thread. Without it, selected text has no actions.
   */
  selectionActions?: AgentThreadSelectionActions | undefined;
}

export interface AgentThreadSelectionActions {
  /** Sends the instruction about a selected passage of a message to this thread. */
  onSend: (messageId: string, body: string) => Promise<boolean>;
  quoteShortcut: QuoteShortcutModifier;
}

/**
 * A side thread of an agent, in the place of its chat: the messages, why the thread waits, and a
 * message box. While a turn runs, a message waits in the thread, or steers the turn as the
 * busy-message mode says.
 */
export function AgentThreadView(props: AgentThreadViewProps) {
  const { t, format, errorMessage } = useText();
  // Resolved once, so the card is built one time for the check and the row.
  const attention = children(() => props.attention);
  const [sending, setSending] = createSignal(false);
  const [addMenuOpen, setAddMenuOpen] = createSignal(false);
  const [reactionMessageId, setReactionMessageId] = createSignal<string | null>(null);
  const [expandedEmojiId, setExpandedEmojiId] = createSignal<string | null>(null);
  const [skillPickerRequest, setSkillPickerRequest] = createSignal(0);
  // Custom: the avatar and the agent name of a new thread open the same menu of agents.
  const [agentMenuOpen, setAgentMenuOpen] = createSignal(false);
  const canChangeAgent = () => (props.onChangeAgent && props.agents.length > 1 ? props.onChangeAgent : undefined);
  const emptySubtitleParts = () => {
    const [before = "", after = ""] = t("conversation.threads.view.emptySubtitle", {
      name: AGENT_NAME_MARKER,
    }).split(AGENT_NAME_MARKER);
    return [before, after] as const;
  };
  const [selectionScope, setSelectionScope] = createSignal<HTMLElement>();
  const [quoteRequest, setQuoteRequest] = createSignal<QuoteRequest>();
  const quoteSelection = (messageId: string, text: string) =>
    // A passage past the message limit would make the editor drop it with the text after it.
    setQuoteRequest((current) => ({ id: (current?.id ?? 0) + 1, messageId, text: limitedQuoteText(text) }));
  /* A thread does not tag itself. */
  const otherThreads = createMemo(() => props.threads?.filter((thread) => thread.id !== props.task?.id));
  let scroller: HTMLElement | undefined;
  let atEnd = true;
  /**
   * The place of the reader when they asked for older messages: the first message then, and where its
   * row was. The page goes in above, and the view keeps that row in its place.
   */
  let olderAnchor: { firstId: string | undefined; row: Element; top: number } | undefined;
  function loadOlder(older: AgentThreadOlderMessages): void {
    const row = scroller?.querySelector(".virtual-chat-row");
    if (row) olderAnchor = { firstId: props.messages[0]?.id, row, top: row.getBoundingClientRect().top };
    older.onLoad();
  }
  // A read that ends with no new messages leaves no place to keep.
  createEffect(
    () => props.olderMessages?.loading === true,
    (loading) => {
      if (!loading && olderAnchor && untrack(() => props.messages[0]?.id) === olderAnchor.firstId)
        olderAnchor = undefined;
    },
  );
  // A read of the latest messages takes the place of the part, and the view follows its end again.
  createEffect(
    () => props.newerMessages?.loading === true,
    (loading) => {
      if (loading) atEnd = true;
    },
  );
  function loadLatest(newer: AgentThreadOlderMessages): void {
    atEnd = true;
    newer.onLoad();
  }
  let shownTaskId = untrack(() => props.task?.id);
  const activityLabel = nextAgentActivityLabel();
  const fades = createScrollFades();
  // The view stays when another thread opens in its place, so each thread opens at its latest message.
  // The effect can run again with the same thread, which must not move the reader.
  createEffect(
    () => props.task?.id,
    (taskId) => {
      if (taskId === shownTaskId) return;
      shownTaskId = taskId;
      atEnd = true;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    },
  );
  onSettled(() => {
    const element = scroller;
    const list = element?.firstElementChild;
    if (!element || !list) return fades.stop;
    let lastTop = element.scrollTop;
    let lastHeight = element.scrollHeight;
    // The scroll event of the view's own follow can come after more text, far from the new end (#5002).
    // That follow moves the view down, so only a move up, with no shorter content, stops the follow.
    const onScroll = () => {
      const { scrollTop, scrollHeight } = element;
      if (scrollHeight - scrollTop - element.clientHeight < STICK_DISTANCE) atEnd = true;
      else if (scrollTop < lastTop && scrollHeight >= lastHeight) atEnd = false;
      lastTop = scrollTop;
      lastHeight = scrollHeight;
    };
    const follow = new ResizeObserver(() => {
      const anchor = olderAnchor;
      if (anchor && untrack(() => props.messages[0]?.id) !== anchor.firstId) {
        olderAnchor = undefined;
        element.scrollTop += anchor.row.getBoundingClientRect().top - anchor.top;
        return;
      }
      if (atEnd) element.scrollTop = element.scrollHeight;
    });
    follow.observe(list);
    // A thread that opens at a message, such as a pin, stays at it.
    if (atEnd) element.scrollTop = element.scrollHeight;
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      follow.disconnect();
      element.removeEventListener("scroll", onScroll);
      fades.stop();
    };
  });
  /** Scrolls to the row of a message and marks it, as a click on a quote does. False when the row does not show. */
  function showMessage(messageId: string): boolean {
    const message = scroller?.querySelector<HTMLElement>(`[data-chat-search-message="${CSS.escape(messageId)}"]`);
    const row = message?.closest<HTMLElement>(".virtual-chat-row");
    if (!row || !scroller) return false;
    atEnd = false;
    // A row near the view slides into place. A far row, or a part that took the place of the
    // messages, shows at once: a long slide over messages that the reader did not ask for helps nobody.
    const view = scroller.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const distance = Math.abs(bounds.top + bounds.height / 2 - (view.top + view.height / 2));
    const behavior = distance <= view.height * NEAR_SCROLL_VIEWS ? preferredMessageScrollBehavior() : "auto";
    row.scrollIntoView({ behavior, block: "center", inline: "nearest" });
    // The row lights up, then fades.
    delete row.dataset.replyFlash;
    void row.offsetWidth;
    row.dataset.replyFlash = "";
    const end = (event: AnimationEvent) => {
      if (event.target !== row || event.animationName !== "reply-flash") return;
      row.removeEventListener("animationend", end);
      delete row.dataset.replyFlash;
    };
    row.addEventListener("animationend", end);
    return true;
  }
  let focusedNonce: number | undefined;
  // The thread scrolls to a message once, when its row shows, for example its source after "Branched from".
  createEffect(
    // A part that takes the place of the messages can have as many messages, so the ends are in the key too.
    () => ({
      focus: props.focusMessage,
      count: props.messages.length,
      first: props.messages[0]?.id,
      last: props.messages.at(-1)?.id,
      taskId: props.task?.id,
    }),
    ({ focus }) => {
      if (!focus || focus.nonce === focusedNonce) return;
      if (showMessage(focus.messageId)) focusedNonce = focus.nonce;
    },
  );
  const messagesById = createMemo(() => new Map(props.messages.map((message) => [message.id, message])));
  /** The message that a reply quotes, when the thread has it. */
  const referenced = (message: AgentMessage) => {
    const id = message.replyToMessageId;
    return id ? messagesById().get(id) : undefined;
  };
  /** Each Reply moves the caret to the message box, as in the agent's own chat. */
  const [replyFocus, setReplyFocus] = createSignal(0);
  const replyAction = (message: AgentMessage) => {
    const onReply = props.onReply;
    if (!onReply) return undefined;
    return () => {
      onReply(message);
      setReplyFocus((current) => current + 1);
    };
  };
  const active = () => (props.task ? isAgentTaskActive(props.task) : false);
  /** The answers that end a finished turn: each offers a branch. */
  const branchPoints = createMemo(() => branchPointIds(props.messages, props.task?.activeTurnId));
  /** A turn runs, so a branch waits: the backend copies only a thread that does not run. */
  const branchBusy = () => props.task?.activeTurnId != null;
  const branchAction = (message: AgentMessage) => {
    const onBranch = props.onBranch;
    if (!onBranch || !branchPoints().has(message.id)) return undefined;
    return () => onBranch(message.id);
  };
  /** The message that the delete dialog asks about. */
  const [deleteTargetId, setDeleteTargetId] = createSignal<string | null>(null);
  const deleteAction = (message: AgentMessage) => {
    if (!props.onDeleteMessage || message.streaming) return undefined;
    if (props.canDeleteMessage && !props.canDeleteMessage(message)) return undefined;
    return () => setDeleteTargetId(message.id);
  };
  const deleteMessage = (messageId: string) => props.onDeleteMessage?.(messageId) ?? Promise.resolve();
  const title = () => props.task?.title ?? t("conversation.threads.new");
  const placeholder = () =>
    props.task
      ? // The tab already names the thread, and a title can be a whole message.
        t("conversation.threads.view.placeholder", { name: props.agent.name })
      : t("conversation.threads.view.newPlaceholder", { name: props.agent.name });
  const voicePhase = () => props.voice?.phase ?? "idle";
  const recording = () => voicePhase() === "recording";
  /** As in the agent's own chat, nothing sends while the microphone opens or the speech becomes text. */
  const voiceBusy = () => voicePhase() !== "idle" && !recording();
  const send = async (alternate = false) => {
    // As in the agent's own chat, a send while recording sends what was said.
    if (recording()) {
      props.voice?.onSend();
      return;
    }
    const text = props.draft.trim();
    if (draftEmpty() || sending() || voiceBusy()) return;
    setSending(true);
    try {
      await (alternate && props.onSendAlternate ? props.onSendAlternate(text) : props.onSend(text));
    } finally {
      setSending(false);
    }
  };
  // An answer from another agent to a request of this thread shows with the name of that agent.
  const author = (message: AgentMessage): ChatMessageAuthor => {
    if (message.author === "you")
      return ownMessageAuthor({
        name: t("chat.message.you"),
        style: props.bubbleStyle ?? "classic",
        agent: props.agent,
        chatColor: undefined,
      });
    const senderId = message.senderAgentId;
    if (senderId === undefined || senderId === props.agent.id)
      return { kind: "agent", name: props.agent.name, agent: props.agent };
    const sender = props.agents.find((candidate) => candidate.id === senderId);
    return {
      kind: "agent",
      name: sender?.name ?? t("chat.message.agentFallback"),
      agent: sender,
      avatarSeed: senderId,
    };
  };
  /* The exchange ids of the agent messages whose text shows under their marker. */
  const [openAgentMessages, setOpenAgentMessages] = createSignal<ReadonlySet<string>>(new Set());
  const toggleAgentMessage = (messageId: string) =>
    setOpenAgentMessages((open) => {
      const next = new Set(open);
      if (!next.delete(messageId)) next.add(messageId);
      return next;
    });
  /** The marker of a message to or from another agent. A message with no text gets no toggle. */
  const agentMessageMarker = (message: AgentMessage) => {
    const marker = message.actionMarker;
    if (marker?.kind !== "agent-message" || !props.onSelectAgent) return undefined;
    if (message.body.trim() === "") return marker;
    return { ...marker, expanded: openAgentMessages().has(marker.messageId) };
  };
  /** A skill or instruction change line, which shows as a marker with its actions, as in the agent's own chat. */
  const changeMarker = (message: AgentMessage) => {
    const marker = message.actionMarker;
    return marker?.kind === "skill-lifecycle" || marker?.kind === "instructions-change" ? marker : undefined;
  };
  /** Opens the shared files that a message of `agentId` links to, as in the agent's chat. */
  const sharedFileOpener = (agentId: string | undefined) => {
    const open = props.onOpenFile;
    return open ? (path: string, asWritten?: string) => open("shared", agentId, path, asWritten) : undefined;
  };
  /** Opens the workspace files that a message of `agentId` links to, as in the agent's chat. */
  const workspaceFileOpener = (agentId: string | undefined) => {
    const open = props.onOpenFile;
    return open && agentId
      ? (path: string, asWritten?: string) => open("workspace", agentId, path, asWritten)
      : undefined;
  };
  /** The text of an open agent message, under its marker, as the sender's message. Its attachments stay under the marker. */
  const agentMessageText = (messageId: string) => {
    const message = () => props.messages.find((candidate) => candidate.exchange?.messageId === messageId);
    return (
      <Show when={message()}>
        {(current) => (
          <ChatMessageRow
            message={{
              id: current().id,
              author: "agent",
              body: current().body,
              time: current().time,
              ...(current().createdAt === undefined ? {} : { createdAt: current().createdAt }),
              kind: "text",
            }}
            author={author(current())}
            showAuthor
            showTime
            agents={props.agents}
            skills={props.skills}
            // The sender's name opens the thread that sent the message, or else the sender's own chat, as in the chat.
            onSelectAgent={(agentId) =>
              agentId === current().exchange?.senderAgentId
                ? props.onSelectAgent?.(agentId, current().exchange?.senderTaskId ?? MAIN_THREAD_ID)
                : props.onSelectAgent?.(agentId)
            }
            onOpenTag={props.onOpenTag}
            onOpenLink={props.onOpenLink}
            onPreview={props.onPreview}
            onAttachmentAction={props.onAttachmentAction}
            // A path is in the workspace of the agent that sent the message.
            onOpenSharedFile={sharedFileOpener(current().exchange?.senderAgentId)}
            onOpenWorkspaceFile={workspaceFileOpener(current().exchange?.senderAgentId)}
            macWindowControls={props.macWindowControls}
          />
        )}
      </Show>
    );
  };
  function pinAction(message: AgentMessage) {
    const pins = props.messagePins;
    if (!pins || message.streaming) return undefined;
    const pinned = pins.isPinned(message.id);
    return { pinned, onToggle: () => pins.onToggle(message.id, !pinned) };
  }
  /** The items of a message's menu: Reply, Copy, Pin, Branch on the last answer of a finished turn, Use as backdrop, and Delete. */
  function menuItems(message: AgentMessage, onCopy: (message: AgentMessage) => void): MessageMenuItemsProps {
    return {
      message,
      reactions: props.onReact !== undefined,
      onReact: (emoji) => props.onReact?.(message, emoji),
      onReply: replyAction(message),
      onCopy: () => onCopy(message),
      readAloud: props.readAloud?.(message),
      onBranch: branchAction(message),
      branchDisabled: branchBusy(),
      pin: pinAction(message),
      onUseAsBackdrop: props.backdropAction?.(message),
      onDelete: deleteAction(message),
    };
  }
  /**
   * The action row of a message. The compact row has Reply, reactions, and More with the items of the
   * right-click menu. The full row has Reply, reactions, Copy, read aloud, and Branch on the last
   * answer of a finished turn. The text above a waiting question is a step of the turn, so it has no
   * actions, as in the agent's chat.
   */
  function messageActions(message: AgentMessage): JSX.Element | undefined {
    const onCopy = props.onCopyMessage;
    if (!onCopy || message.streaming || message.itemType === "commentary") return undefined;
    const onReact = props.onReact;
    // Custom: the reaction picker of the row, as in the agent's own chat.
    const reactionProps = () => ({
      reactions: onReact !== undefined,
      pickerOpen: reactionMessageId() === message.id,
      expandedEmoji: expandedEmojiId() === message.id,
      onTogglePicker: () => {
        setExpandedEmojiId(null);
        setReactionMessageId((current) => (current === message.id ? null : message.id));
      },
      onExpandEmoji: () => setExpandedEmojiId(message.id),
      onReact: (emoji: MessageReaction | null) => {
        setReactionMessageId(null);
        setExpandedEmojiId(null);
        onReact?.(message, emoji);
      },
    });
    return (
      <Show
        when={props.compactMessageActions !== false}
        fallback={
          <MessageActions
            message={message}
            authorName={author(message).name}
            {...reactionProps()}
            copied={props.copiedMessageId === message.id}
            onReply={replyAction(message)}
            onCopy={() => onCopy(message)}
            readAloud={props.readAloud?.(message)}
            onBranch={branchAction(message)}
            branchDisabled={branchBusy()}
          />
        }
      >
        <MessageActions
          message={message}
          authorName={author(message).name}
          {...reactionProps()}
          onReply={replyAction(message)}
          menu={() => <MessageMenuItems {...menuItems(message, onCopy)} />}
        />
      </Show>
    );
  }
  /** The right-click menu of a message, with the items of its More button. */
  function messageMenu(message: AgentMessage): (() => JSX.Element) | undefined {
    const onCopy = props.onCopyMessage;
    if (!onCopy || message.streaming || message.itemType === "commentary") return undefined;
    return () => <MessageMenu {...menuItems(message, onCopy)} authorName={author(message).name} />;
  }
  /** A finished turn with no answer shows its steps on its thinking row, with no message under them. */
  const shownRow = (message: AgentMessage) =>
    shownInThread(message) || (message.kind === "thinking" && props.stepsAbove?.(message.id) !== undefined);
  const shownRows = createMemo(() => props.messages.filter(shownRow));
  /** A marker, a question or a thinking row draws no message row, so a run of one sender cannot continue under it. */
  const holdsSenderRun = (message: AgentMessage) =>
    message.kind !== "thinking" &&
    message.kind !== "plan" &&
    message.kind !== "subagents" &&
    message.kind !== "memory-changes" &&
    message.questionPrompt === undefined &&
    !agentMessageMarker(message) &&
    !changeMarker(message);
  const senderRunRow = (message: AgentMessage) => ({
    author: message.author === "agent" ? `agent:${message.senderAgentId ?? props.agent.id}` : message.author,
    ...(message.createdAt === undefined ? {} : { createdAt: message.createdAt }),
    ...(message.turnId === undefined ? {} : { turnId: message.turnId }),
  });
  /**
   * As in the agent's chat: a separator names the time above the first row and above a new day. The
   * compact action row shows no time, so a pause of an hour or more also gets one.
   */
  const timeMarkers = createMemo(() => {
    const labels = new Map<string, string>();
    const gap = props.compactMessageActions === false ? {} : { gapMs: CHAT_TIME_GAP_MS };
    let previous: AgentMessage | undefined;
    for (const message of shownRows()) {
      const label =
        message.createdAt === undefined
          ? previous === undefined
            ? (message.time ?? t("chat.day.now"))
            : null
          : dayMarkerLabel(previous?.createdAt, message.createdAt, { t, format, ...gap });
      if (label !== null) labels.set(message.id, label);
      previous = message;
    }
    return labels;
  });
  /** As in the agent's chat: the messages of a run by one sender read as one block. */
  const continuesRunIds = createMemo(() => {
    const ids = new Set<string>();
    const markers = timeMarkers();
    let previous: AgentMessage | undefined;
    for (const message of shownRows()) {
      if (
        holdsSenderRun(message) &&
        continuesSenderRun(previous && senderRunRow(previous), senderRunRow(message), {
          previousDrawsTime: previous !== undefined && holdsSenderRun(previous),
          startsDay: markers.has(message.id),
        })
      )
        ids.add(message.id);
      previous = message;
    }
    return ids;
  });
  /**
   * The row that the branch line follows: the last message that the branch copied. That message can be
   * one that the thread does not show as a row, such as a thought in the steps of a turn. Then the line
   * follows the last shown message from before the branch was made: the copies keep their times.
   */
  const branchDividerId = createMemo(() => {
    const source = props.branchSource;
    if (!source) return undefined;
    const shown = shownRows();
    if (shown.some((message) => message.id === source.throughMessageId)) return source.throughMessageId;
    const branchedAt = props.task ? Date.parse(props.task.createdAt) : Number.NaN;
    if (Number.isNaN(branchedAt)) return undefined;
    return shown.findLast((message) => message.createdAt !== undefined && Date.parse(message.createdAt) < branchedAt)
      ?.id;
  });
  function branchDividerAfter(messageId: string): AgentThreadBranchSource | undefined {
    return branchDividerId() === messageId ? props.branchSource : undefined;
  }
  const failed = () => (props.task?.state === "idle" && props.task.outcome === "failed" ? props.task : undefined);
  /**
   * The reason of the failed turn, as the main chat shows it. A thread keeps the provider's text (#5220),
   * which can be technical; the notice then shows the general sentence, and Copy details keeps the
   * text, which the host redacted, for a report (#10888).
   */
  const failure = (error: string | null) => {
    const reason = error?.trim() ?? "";
    if (!reason) return { body: t("conversation.threads.view.failedBody"), details: null };
    const fallback = t("agent.error.continueFailed");
    const body = errorMessage(reason, fallback);
    return { body, details: body === fallback ? reason : null };
  };
  const running = () =>
    props.task?.state === "running" && !props.approval && !props.waitsForAnswer ? props.task : undefined;
  const queued = () => (props.task && props.task.queuedMessages.length > 0 ? props.task : undefined);
  // As in the agent's chat: a live turn hides the row, also while it waits for an approval or an answer.
  const backgroundWorkSince = () => (props.task?.state === "running" ? undefined : props.backgroundWorkSince);
  const hold = () => (props.task ? agentThreadHoldText(props.task, props.limit, t) : null);
  /** Under a thread-limit hold, the threads that hold it, so the person can stop one. */
  const busyRows = () => {
    const rows = props.busyThreads?.filter((thread) => thread.id !== props.task?.id) ?? [];
    return props.task?.state === "queued" && props.task.hold === "task-limit" && props.onStopThread && rows.length > 0
      ? rows
      : undefined;
  };
  const editingQueued = () => Boolean(props.queue?.editingDeliveryId);
  const sendLabel = () =>
    t(recording() ? "composer.send.voice" : editingQueued() ? "composer.send.saveQueued" : "composer.send.message");
  /*
   * The rows that the queue panel shows. When the last message goes, the slot closes at once and keeps
   * these rows, so the whole panel goes down behind the input in one move, as in the agent's own chat.
   * Another thread does not get the rows of the one before.
   */
  const [queueRows, setQueueRows] = createSignal<{ taskId: string | undefined; deliveries: QueueDelivery[] }>({
    taskId: undefined,
    deliveries: [],
  });
  let queueExitTimer: number | undefined;
  createEffect(
    () => ({ taskId: props.task?.id, deliveries: props.queue?.deliveries ?? [] }),
    (next) => {
      const shown = untrack(queueRows);
      if (next.deliveries.length > 0 || next.taskId !== shown.taskId) {
        if (queueExitTimer !== undefined) window.clearTimeout(queueExitTimer);
        queueExitTimer = undefined;
        // Each change of the thread sends its queue again. A row that did not change keeps its object,
        // so the panel does not draw it again and the pointer and the focus stay on it.
        const previous = new Map(shown.deliveries.map((delivery) => [delivery.id, delivery]));
        const deliveries = next.deliveries.map((delivery) => {
          const known = previous.get(delivery.id);
          return known && JSON.stringify(known) === JSON.stringify(delivery) ? known : delivery;
        });
        setQueueRows({ taskId: next.taskId, deliveries });
        return;
      }
      // Each change of the thread sends the empty queue again. The panel closes at the end of its
      // first exit, not after the thread is quiet.
      if (shown.deliveries.length === 0 || queueExitTimer !== undefined) return;
      queueExitTimer = window.setTimeout(() => {
        queueExitTimer = undefined;
        setQueueRows(next);
      }, agentActivityExitDuration());
    },
  );
  onCleanup(() => {
    if (queueExitTimer !== undefined) window.clearTimeout(queueExitTimer);
  });
  const queuePanelOwner = () => (queueRows().deliveries.length > 0 ? queueRows().taskId : undefined);
  const queueOpen = () => (props.queue?.deliveries.length ?? 0) > 0 && queueRows().taskId === props.task?.id;
  /**
   * The messages that wait, shown under the hold above the message box when the queue panel does not
   * list them: a joined server sends only the start of each message, and a host can report a waiting
   * thread with no queued rows. Then the title, the start of the first message, stands in for it.
   */
  const waitingRows = (): { id: string; text: string }[] | undefined => {
    const task = props.task;
    if (!task || queueOpen()) return undefined;
    if (props.queue && !hold()) return undefined;
    const rows = task.queuedMessages.map((message) => ({ id: message.deliveryId, text: message.text }));
    if (rows.length > 0) return rows;
    return hold() ? [{ id: task.id, text: task.title }] : undefined;
  };
  const draftRows = createComposerRowsResize(() => props.task?.id ?? "");
  const hasRow = () =>
    Boolean(props.onRemoveAttachment) &&
    ((props.rowAttachments?.length ?? 0) > 0 || (props.pendingImages?.length ?? 0) > 0);
  const draftEmpty = () => props.draft.trim().length === 0 && (props.rowAttachments?.length ?? 0) === 0;
  /** As in the agent's own chat: Send, Send what was said while a recording runs, or Stop while the thread works. */
  const sendButton = () => (
    <ComposerSendControl
      stop={active() && draftEmpty() && !recording()}
      onStop={() => props.onStop()}
      label={sendLabel()}
      disabled={sending() || voiceBusy() || (!recording() && draftEmpty())}
      busy={sending()}
    />
  );
  /* Only a new thread before its first send: a saved thread whose messages still load shows no prompt. */
  const empty = () =>
    !props.task &&
    shownRows().length === 0 &&
    !running() &&
    !props.approval &&
    attention.toArray().length === 0 &&
    !hold() &&
    !queued();
  return (
    <>
      <Show when={props.task}>
        <div class="agent-thread-title">
          <MessageSquareText aria-hidden="true" />
          <span>{title()}</span>
        </div>
        {props.belowTitle}
      </Show>
      <Show when={props.selectionActions}>
        {(actions) => (
          <MessageSelectionActions
            scope={selectionScope()}
            contextKey={props.task?.id}
            // As the message box: a quote waits in a locked box, and could go to the next thread.
            disabled={!props.task || sending() || voicePhase() === "transcribing"}
            onSend={(messageId, body) => actions().onSend(messageId, body)}
            onQuote={quoteSelection}
            quoteShortcut={actions().quoteShortcut}
          />
        )}
      </Show>
      <section
        ref={(element: HTMLElement) => {
          scroller = element;
          setSelectionScope(element);
          fades.bind(element);
          props.scrollRef?.(element);
        }}
        class={["conversation-scroll agent-thread-scroll", fades.classes()]}
        data-selection-scope=""
        aria-label={t("conversation.threads.view.label", { title: title() })}
        onScroll={fades.measure}
      >
        <Show when={empty()}>
          <div class="agent-thread-empty">
            <Show
              when={canChangeAgent()}
              fallback={
                <AgentAvatar agent={props.agent} mood="idle" motion="always" class="agent-thread-empty-avatar" />
              }
            >
              {(change) => (
                <DropdownMenu.Root placement="bottom" gutter={8} open={agentMenuOpen()} onOpenChange={setAgentMenuOpen}>
                  <DropdownMenu.Trigger
                    class="agent-thread-empty-agent"
                    aria-label={t("conversation.threads.view.changeAgent", { name: props.agent.name })}
                  >
                    <AgentAvatar agent={props.agent} mood="idle" motion="always" class="agent-thread-empty-avatar" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="agent-thread-empty-agent-menu">
                      <DropdownMenu.RadioGroup
                        value={props.agent.id}
                        onChange={(agentId) => {
                          if (agentId !== props.agent.id) change()(agentId);
                        }}
                      >
                        <For each={props.agents} keyed={(option) => option.id}>
                          {(option) => (
                            <DropdownMenu.RadioItem
                              value={option().id}
                              closeOnSelect
                              class="agent-thread-empty-agent-option"
                            >
                              <AgentAvatar agent={option()} class="agent-thread-empty-agent-option-avatar" />
                              <span>{option().name}</span>
                              <Show when={props.agent.id === option().id}>
                                <Check aria-hidden="true" class="agent-thread-empty-agent-check" />
                              </Show>
                            </DropdownMenu.RadioItem>
                          )}
                        </For>
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </Show>
            <h2 class="agent-thread-empty-title">{t("conversation.threads.view.emptyTitle")}</h2>
            <p class="agent-thread-empty-subtitle">
              <Show
                when={canChangeAgent()}
                fallback={t("conversation.threads.view.emptySubtitle", { name: props.agent.name })}
              >
                {emptySubtitleParts()[0]}
                <Button
                  type="button"
                  variant="link"
                  class="agent-thread-empty-agent-name"
                  aria-label={t("conversation.threads.view.changeAgent", { name: props.agent.name })}
                  aria-haspopup="menu"
                  aria-expanded={agentMenuOpen() ? "true" : "false"}
                  onClick={() => setAgentMenuOpen(true)}
                >
                  {props.agent.name}
                </Button>
                {emptySubtitleParts()[1]}
              </Show>
            </p>
          </div>
        </Show>
        <Show when={props.newerMessages}>
          {(newer) => <ScrollToLatestButton onClick={() => loadLatest(newer())} />}
        </Show>
        <div class="virtual-chat-list virtual-chat-list-static" ref={fades.watch}>
          <Show when={props.olderMessages}>
            {(older) => (
              <div class="conversation-history-status">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={older().loading}
                  onClick={() => loadOlder(older())}
                >
                  {older().loading ? t("chat.history.loadingOlder") : t("conversation.threads.view.loadOlder")}
                </Button>
              </div>
            )}
          </Show>
          {/* The start of the thread shows once its first message is loaded. */}
          <Show when={props.task?.origin === "agent" && !props.olderMessages}>
            <p class="agent-thread-origin">
              {t("conversation.threads.view.startedByAgent", { name: props.agent.name })}
            </p>
          </Show>
          <For each={shownRows()} keyed={(message) => message.id}>
            {(message) => {
              const card = createMemo(() => props.messageCard?.(message(), quoteSelection));
              // As in the agent's chat: the steps of an answer stand beside it and open only the trace.
              // "Show agent steps" keeps the open list above the answer.
              const stepsInRow = () =>
                props.traceAbove !== undefined &&
                !props.stepsOpenByDefault &&
                message().kind !== "thinking" &&
                message().questionPrompt === undefined &&
                !agentMessageMarker(message()) &&
                !changeMarker(message()) &&
                !card() &&
                author(message()).kind === "agent";
              const stepsDisclosure = () => (
                <Show when={props.stepsAbove?.(message().id)}>
                  {(steps) => (
                    <AgentStepsDisclosure
                      steps={steps()}
                      defaultOpen={props.stepsOpenByDefault ?? false}
                      list={!stepsInRow()}
                      // A turn with no answer shows its steps on its thinking row, with no trace, as in the chat.
                      trace={message().kind === "thinking" ? undefined : props.traceAbove?.(message().id)}
                      facts={props.factsAbove?.(message().id)}
                    />
                  )}
                </Show>
              );
              return (
                <div
                  class="virtual-chat-row"
                  data-grouped={!card() && continuesRunIds().has(message().id) ? "sender" : undefined}
                >
                  <Show when={timeMarkers().get(message().id)}>
                    {(label) => (
                      <div class="time-marker">
                        <span>{label()}</span>
                      </div>
                    )}
                  </Show>
                  <Show when={!stepsInRow()}>{stepsDisclosure()}</Show>
                  <Show when={message().kind !== "thinking" && agentMessageMarker(message())}>
                    {(marker) => (
                      <article data-chat-search-message={message().id}>
                        <ChatActionMarker
                          marker={marker()}
                          agents={props.agents}
                          onSelectAgent={(agentId, tabId) => props.onSelectAgent?.(agentId, tabId)}
                          onToggleAgentMessage={toggleAgentMessage}
                          agentMessageText={agentMessageText}
                        />
                        <Show when={marker().direction === "incoming" && (message().attachments?.length ?? 0) > 0}>
                          <div class="chat-action-attachments">
                            <AttachmentCards
                              attachments={message().attachments ?? []}
                              mediaSource={props.mediaSource}
                              downloads={props.downloads}
                              onPreview={(attachment) => props.onPreview(attachment)}
                              onAction={props.onAttachmentAction}
                            />
                          </div>
                        </Show>
                      </article>
                    )}
                  </Show>
                  <Show when={message().kind !== "thinking" && changeMarker(message())}>
                    {(marker) => (
                      <article data-chat-search-message={message().id}>
                        <ChatActionMarker
                          marker={marker()}
                          agents={props.agents}
                          onSelectAgent={(agentId, tabId) => props.onSelectAgent?.(agentId, tabId)}
                          onOpenSkill={props.changeMarkerActions?.onOpenSkill}
                          onOpenInstructions={props.changeMarkerActions?.onOpenInstructions}
                        />
                      </article>
                    )}
                  </Show>
                  <Show
                    when={message().kind !== "thinking" && !agentMessageMarker(message()) && !changeMarker(message())}
                  >
                    <Show
                      when={card()}
                      fallback={
                        <ChatMessageRow
                          message={message()}
                          author={author(message())}
                          showFull={props.showFullMessage?.(message())}
                          agents={props.agents}
                          skills={props.skills}
                          reactions={message().reactions}
                          onRemoveReaction={props.onReact ? () => props.onReact?.(message(), null) : undefined}
                          onSelectAgent={() => undefined}
                          onOpenQuote={props.onOpenQuote}
                          onOpenTag={props.onOpenTag}
                          onOpenLink={props.onOpenLink}
                          onPreview={props.onPreview}
                          onAttachmentAction={props.onAttachmentAction}
                          onOpenSharedFile={sharedFileOpener(props.agent.id)}
                          onOpenWorkspaceFile={workspaceFileOpener(props.agent.id)}
                          mediaSource={props.mediaSource}
                          downloads={props.downloads}
                          onDownload={(attachment) => props.onAttachmentAction(attachment, "download")}
                          macWindowControls={props.macWindowControls}
                          referencedMessage={referenced(message())}
                          onOpenReference={() => {
                            const id = message().replyToMessageId;
                            if (id) showMessage(id);
                          }}
                          actions={messageActions(message())}
                          steps={stepsInRow() ? stepsDisclosure() : undefined}
                          actionTime={props.compactMessageActions === false}
                          actionsBeside={stepsInRow() || author(message()).kind === "you"}
                          menu={messageMenu(message())}
                          data-chat-search-message={message().id}
                        />
                      }
                    >
                      {card()}
                    </Show>
                  </Show>
                  <Show when={branchDividerAfter(message().id)}>{(source) => <BranchDivider source={source()} />}</Show>
                </div>
              );
            }}
          </For>
          <Show when={running()}>
            {(task) => (
              <div class="virtual-chat-row virtual-chat-row-activity">
                <AgentActivityIndicator
                  agent={props.agent}
                  label={activityLabel}
                  detail={task().progress}
                  steps={props.activeSteps}
                  stepsOpenByDefault={props.stepsOpenByDefault}
                />
              </div>
            )}
          </Show>
          <Show when={backgroundWorkSince()}>
            {(since) => (
              <div class="virtual-chat-row virtual-chat-row-activity">
                <AgentActivityIndicator
                  agent={props.agent}
                  label={activityLabel}
                  detail={t("chat.activity.backgroundWork")}
                  since={since()}
                />
              </div>
            )}
          </Show>
          <Show keyed when={props.approval}>
            {(approval) => (
              <div class="virtual-chat-row">
                <ApprovalCard
                  approval={approval}
                  agentName={props.agent.name}
                  onApprove={() => props.onRespondApproval("accept")}
                  onReject={() => props.onRespondApproval("decline")}
                />
              </div>
            )}
          </Show>
          <Show when={attention.toArray().length > 0}>
            <div class="virtual-chat-row">{attention()}</div>
          </Show>
        </div>
      </section>
      <div class="composer-wrap">
        {props.aboveComposer}
        {/* One card for everything above the input: see composer-stack.css. */}
        <div class="composer-stack">
          <Show when={hold()}>
            {(text) => (
              <div class="composer-notice agent-thread-hold" role="status">
                <LoaderCircle class="composer-notice-icon composer-spinner" aria-hidden="true" />
                <p class="agent-thread-hold-copy">{text()}</p>
              </div>
            )}
          </Show>
          <Show when={busyRows()}>
            {(rows) => (
              <ul class="agent-thread-busy" aria-label={t("conversation.threads.hold.busyThreads")}>
                <For each={rows()} keyed={(row) => row.id}>
                  {(row) => (
                    <li class="agent-thread-busy-row">
                      <span class="agent-thread-busy-title">{row().title}</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        class="agent-thread-busy-stop"
                        aria-label={t("conversation.threads.stopThread", { title: row().title })}
                        onClick={() => props.onStopThread?.(row().id)}
                      >
                        <Square aria-hidden="true" />
                        <span>{t("conversation.threads.stop")}</span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Show>
          <Show when={waitingRows()}>
            {(rows) => (
              <section class="agent-thread-queued" aria-label={t("conversation.threads.view.queued")}>
                <For each={rows()} keyed={(row) => row.id}>
                  {(row) => <p class="agent-thread-queued-text">{row().text}</p>}
                </For>
              </section>
            )}
          </Show>
          <ComposerStackCard when={failed()}>
            {(task) => {
              const shown = () => failure(task().error);
              return (
                <ComposerNotice
                  tone="danger"
                  title={t("conversation.threads.view.failed")}
                  body={shown().body}
                  action={
                    <Show when={shown().details}>
                      {(details) => (
                        <CopyButton
                          value={details()}
                          variant="outline"
                          size="sm"
                          label={t("agent.error.copyDetails")}
                          onCopyError={() => toast.error(t("app.clipboard.copyFailed"))}
                        />
                      )}
                    </Show>
                  }
                />
              );
            }}
          </ComposerStackCard>
          <ComposerStackCard when={props.awaiting?.length ? props.awaiting : undefined}>
            {(items) => (
              <AwaitingReplies items={items()} onOpenAgent={props.onOpenWaitingAgent ?? props.onSelectAgent} />
            )}
          </ComposerStackCard>
          <Show when={props.queue}>
            {(queue) => (
              <>
                <div
                  class="agent-queue-slot"
                  data-open={queueOpen() ? "true" : "false"}
                  aria-hidden={queueOpen() ? undefined : "true"}
                  inert={queueOpen() ? undefined : true}
                >
                  <div class="agent-queue-slot-inner">
                    {/* Each thread gets its own panel, so its rows do not animate in from the thread before. */}
                    <Show when={queuePanelOwner()} keyed>
                      {(_taskId) => (
                        <QueuePanel
                          deliveries={queueRows().deliveries}
                          agents={props.agents}
                          skills={props.skills}
                          editingDeliveryId={queue().editingDeliveryId}
                          canSteer={Boolean(props.task?.activeTurnId)}
                          onSteer={queue().onSteer}
                          onCancel={(deliveryId) => queue().onCancel(deliveryId)}
                          onEdit={(delivery) => queue().onEdit(delivery)}
                          onReorder={(deliveryIds) => queue().onReorder(deliveryIds)}
                        />
                      )}
                    </Show>
                  </div>
                </div>
                <ComposerStackCard when={queue().editingDeliveryId}>
                  {() => (
                    <ComposerNotice
                      body={t("composer.queueEdit.body")}
                      action={
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          disabled={queue().editBusy}
                          onClick={() => queue().onCancelEdit()}
                        >
                          {t("composer.queueEdit.cancel")}
                        </Button>
                      }
                    />
                  )}
                </ComposerStackCard>
              </>
            )}
          </Show>
          <ComposerStackCard when={props.replyTo}>
            {(message) => (
              <ComposerReplyPreview
                message={message()}
                agents={props.agents}
                skills={props.skills}
                disabled={sending() || voicePhase() === "transcribing"}
                onCancel={() => props.onCancelReply?.()}
              />
            )}
          </ComposerStackCard>
          <Show when={props.createArtifact}>
            <ComposerArtifactChip
              onRemove={props.onCreateArtifactChange ? () => props.onCreateArtifactChange?.(false) : undefined}
            />
          </Show>
        </div>
        <form
          ref={draftRows.form}
          class="composer agent-thread-composer"
          data-compact={hasRow() ? undefined : "true"}
          data-has-attachments={hasRow() ? "" : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Show when={props.onRemoveAttachment}>
            {(remove) => (
              <ComposerAttachmentRow
                attachments={props.rowAttachments ?? []}
                pending={props.pendingImages}
                removeDisabled={sending() || voicePhase() === "transcribing"}
                onRemove={(attachment) => remove()(attachment)}
                macWindowControls={props.macWindowControls}
              />
            )}
          </Show>
          <div class="composer-input-label" ref={draftRows.label}>
            <ComposerEditor
              agentId={props.agent.id}
              agents={props.agents}
              skills={props.skills}
              skillsLoadFailed={props.skillsLoadFailed}
              mcpServers={props.mcpServers}
              browserTabs={props.browserTabs}
              threads={otherThreads()}
              onOpenTag={props.onOpenTag}
              attachments={props.draftAttachments}
              value={props.draft}
              placeholder={props.replyTo ? t("composer.placeholder.reply") : placeholder()}
              ariaLabel={placeholder()}
              focusRequest={(props.focusRequest ?? 0) + replyFocus()}
              quoteRequest={quoteRequest()}
              skillPickerRequest={skillPickerRequest()}
              onOpenQuote={props.onOpenQuote}
              dictation={{ text: props.voice?.liveText ?? "", final: voicePhase() === "transcribing" }}
              disabled={sending() || voicePhase() === "transcribing"}
              sendShortcut={props.sendShortcut}
              onSubmit={() => void send()}
              onSubmitAlternate={props.onSendAlternate ? () => void send(true) : undefined}
              onValueChange={props.onDraftChange}
              onPasteFiles={props.onPasteFiles}
              onOpenAttachment={props.onOpenDraftAttachment}
            />
          </div>
          <div class="composer-toolbar">
            <ComposerAddMenu
              open={addMenuOpen()}
              onOpenChange={setAddMenuOpen}
              disabled={sending() || voicePhase() === "transcribing"}
              onCreateArtifact={props.onCreateArtifactChange ? () => props.onCreateArtifactChange?.(true) : undefined}
              onAttach={props.onAttachFiles}
              onPickSkill={() => setSkillPickerRequest((current) => current + 1)}
              onSideQuestion={props.onSideQuestion}
            />
            <div class="composer-primary-actions">
              {/* One meter for each thread: a pending Compact or an open popover stays with its thread. */}
              <Show when={props.task?.id} keyed>
                {(_taskId) => (
                  <Show when={props.context}>
                    {(usage) => <ContextUsageMeter usage={usage()} compact={props.onCompactContext} />}
                  </Show>
                )}
              </Show>
              <Show when={props.voice} fallback={sendButton()}>
                {(voice) => (
                  <ComposerVoiceControls
                    phase={voice().phase}
                    levels={voice().levels}
                    elapsedSeconds={voice().elapsedSeconds}
                    modelProgress={voice().modelProgress}
                    blocked={voice().blocked || sending()}
                    onStart={() => voice().onStart()}
                    onCancel={() => voice().onCancel()}
                    onFinish={() => voice().onFinish()}
                    onSend={() => void send()}
                    send={sendButton()}
                  />
                )}
              </Show>
            </div>
          </div>
        </form>
      </div>
      <DeleteMessageDialog
        messageId={deleteTargetId()}
        onDelete={deleteMessage}
        onClose={() => setDeleteTargetId(null)}
      />
    </>
  );
}

import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { AgentSummary, QueuedMessageReceipt } from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import type { AgentTasks } from "../agent-tasks/agent-tasks";
import type { MailboxStore } from "../mailbox-store";
import { type DynamicToolCallParams, isRecord } from "../protocol";
import type { ConversationRuntime } from "./conversation-runtime";
import type { DrainScheduler } from "./drain-scheduler";
import type { MailboxSync } from "./mailbox-sync";
import { type OpenBotToolResponse, openBotToolFailure } from "./routine-tools";
import { toolCallIdempotencyKey } from "./tool-call-idempotency";
import { ToolOperationFailed, toToolOperationFailed } from "./tool-operation";
import { unknownAgentMessage } from "./unknown-agent";

export type AgentMessageSteer =
  | "steered"
  | "recipient-queues"
  | "provider-unsupported"
  | "routine-run"
  | "steer-failed"
  | null;

export interface SendMessageToolHost {
  readonly mailbox: MailboxStore;
  readonly tasks: AgentTasks;
  readonly conversation: ConversationRuntime;
  readonly mailboxSync: Pick<MailboxSync, "emitQueue" | "syncMailboxMessages">;
  readonly drain: Pick<DrainScheduler, "scheduleDrain">;
  listAgents(): readonly AgentSummary[];
  steerAgentMessage(recipientAgentId: string, deliveryId: string): Effect.Effect<AgentMessageSteer>;
}

type SentDelivery = QueuedMessageReceipt["deliveries"][number] & {
  taskId?: string;
  messageId?: string;
  outcome?: "steered" | "queued";
  queuedBecause?: Exclude<AgentMessageSteer, "steered" | null>;
  note?: string;
};

/** The one reason that the user can change, named as the agent settings show it. */
const RECIPIENT_QUEUES_NOTE =
  "The recipient's While working setting is Queue, so the message waits for its next turn. The user can set it to Steer.";

/**
 * Adds how the recipient took the message to the receipt, when it was busy and may receive it. A
 * steered message shows as running. A queued one says why it waits while the recipient works. The
 * result explains itself, so the tool description stays in the context budget.
 */
function sentDelivery(
  delivery: QueuedMessageReceipt["deliveries"][number],
  steer: AgentMessageSteer,
  taskId?: string,
  messageId?: string,
): SentDelivery {
  const target = {
    ...(taskId ? { taskId } : {}),
    ...(messageId ? { messageId } : {}),
  };
  if (steer === "steered") return { ...delivery, ...target, status: "running", position: null, outcome: "steered" };
  if (delivery.status !== "queued") return { ...delivery, ...target };
  if (steer === "recipient-queues")
    return { ...delivery, ...target, outcome: "queued", queuedBecause: steer, note: RECIPIENT_QUEUES_NOTE };
  return { ...delivery, ...target, outcome: "queued", ...(steer ? { queuedBecause: steer } : {}) };
}

export const handleSendMessageTool = Effect.fn("SendMessageTool.handle")(
  function* (
    host: SendMessageToolHost,
    params: DynamicToolCallParams,
    senderAgentId: string,
  ): Effect.fn.Return<OpenBotToolResponse, ToolOperationFailed> {
    if (params.tool !== "send_message" || !isRecord(params.arguments)) {
      throw new Error(`Unsupported OpenBot tool: ${params.tool}`);
    }
    const recipientValues = params.arguments.recipientAgentIds;
    if (!Array.isArray(recipientValues) || !recipientValues.every((item) => isString(item))) {
      throw new Error("recipientAgentIds must be an array of agent ids.");
    }
    if (recipientValues.length !== new Set(recipientValues).size) {
      throw new Error("Duplicate recipients are not allowed.");
    }
    if (recipientValues.includes(senderAgentId)) throw new Error("An agent cannot message itself.");
    const agents = host.listAgents();
    const known = new Map(agents.map((agent) => [agent.id, agent]));
    for (const recipient of recipientValues) {
      const agent = known.get(recipient);
      // Suggest only an agent that this tool takes: not the sender.
      if (!agent)
        throw new Error(
          unknownAgentMessage(
            recipient,
            agents.filter((candidate) => candidate.id !== senderAgentId),
          ),
        );
    }
    const paths = params.arguments.paths ?? [];
    if (!Array.isArray(paths) || !paths.every((item) => isString(item))) {
      throw new Error("paths must be an array of local file paths.");
    }
    const replyToMessageId = params.arguments.replyToMessageId;
    if (
      replyToMessageId !== undefined &&
      replyToMessageId !== null &&
      (!isString(replyToMessageId) || replyToMessageId.length > INPUT_LIMITS.identifier)
    ) {
      throw new Error("replyToMessageId must be a message id.");
    }
    if (!isString(params.arguments.text)) throw new Error("text is required.");
    const expectsReply = params.arguments.expectsReply;
    if (expectsReply !== undefined && typeof expectsReply !== "boolean") {
      throw new Error("expectsReply must be a boolean.");
    }
    const newThread = params.arguments.newThread;
    if (newThread !== undefined && typeof newThread !== "boolean") {
      throw new Error("newThread must be a boolean.");
    }
    const rawThreadTitle = params.arguments.threadTitle;
    if (rawThreadTitle !== undefined && !isString(rawThreadTitle)) {
      throw new Error("threadTitle must be a string.");
    }
    const normalizedThreadTitle = rawThreadTitle === undefined ? undefined : rawThreadTitle.trim();
    if (
      normalizedThreadTitle !== undefined &&
      (normalizedThreadTitle.length === 0 || normalizedThreadTitle.length > INPUT_LIMITS.agentTaskTitle)
    ) {
      return openBotToolFailure(sourceText("error.backend.threadTitleRequired"));
    }
    const rawTaskId = params.arguments.taskId;
    if (
      rawTaskId !== undefined &&
      rawTaskId !== null &&
      (!isString(rawTaskId) || rawTaskId.length > INPUT_LIMITS.identifier)
    ) {
      throw new Error("taskId must be a side thread id.");
    }
    const requestedTaskId = rawTaskId?.trim() || null;
    if (newThread === false && normalizedThreadTitle !== undefined) {
      return openBotToolFailure("threadTitle requires newThread.");
    }
    const openNewThread = newThread === true || (newThread === undefined && normalizedThreadTitle !== undefined);
    if (openNewThread && requestedTaskId) {
      return openBotToolFailure("Cannot combine taskId with newThread or threadTitle.");
    }
    if (requestedTaskId && recipientValues.length !== 1) {
      return openBotToolFailure("taskId requires a single recipientAgentId.");
    }
    if (recipientValues.length === 0) {
      throw new Error(sourceText("error.backend.recipientRequired"));
    }

    const turnDeliveries = host.mailbox.findDeliveriesByTurn(senderAgentId, params.turnId);
    // A request from a Slack turn: the teammate's answer goes back to that Slack thread.
    const messagingReturn = turnDeliveries
      .map(({ delivery }) => host.mailbox.messagingOrigin(delivery.id))
      .find((origin) => origin !== null);
    // A request from a side thread: the teammate's answer goes back to that thread.
    const senderTaskId = turnDeliveries
      .map(({ delivery }) => host.mailbox.taskIdForDelivery(delivery.id))
      .find((taskId) => taskId !== null);
    // An agent can send "" for no reply. Every reader rejects an empty id. A model can also copy the
    // quotes around the id in the delivery prompt; such an id refers to no message.
    const replyReference =
      replyToMessageId
        ?.trim()
        .replace(/^"(.*)"$/s, "$1")
        .trim() || null;
    if (openNewThread && replyReference) {
      return openBotToolFailure("Cannot combine newThread with replyToMessageId.");
    }
    const replyTo = replyReference && host.mailbox.replyReferenceMessageId(replyReference);
    // An id that names no message would store the answer outside the thread that asked, and stop the
    // automatic result for the request (#5452). Nothing is written, so the agent can send it again. The
    // agent corrects its own call, so the user gets no error for it.
    if (replyReference && !replyTo) {
      const requestIds = turnDeliveries
        .filter(
          ({ delivery }) =>
            delivery.sender.kind === "agent" &&
            recipientValues.includes(delivery.sender.agentId) &&
            delivery.expectsReply !== false,
        )
        .map(({ delivery }) => delivery.messageId);
      return openBotToolFailure(
        [
          sourceText("error.backend.replyReferenceUnknown", { id: replyReference }),
          ...(requestIds.length > 0
            ? [sourceText("error.backend.replyReferenceRequests", { ids: requestIds.join(", ") })]
            : []),
        ].join(" "),
      );
    }

    const text = params.arguments.text;

    if (openNewThread) {
      const targets = recipientValues.map((agentId) => ({
        agentId,
        idempotencyKey:
          recipientValues.length === 1
            ? toolCallIdempotencyKey(params)
            : toolCallIdempotencyKey({
                threadId: `${params.threadId}/${agentId}`,
                turnId: params.turnId,
                callId: params.callId,
              }),
      }));
      const opened = yield* host.tasks.runWithNewMessageThreads(
        targets,
        normalizedThreadTitle ?? text,
        ({ agentId, idempotencyKey, taskId }) =>
          host.mailbox
            .enqueue({
              sender: { kind: "agent", agentId: senderAgentId },
              recipientAgentIds: [agentId],
              text,
              sourcePaths: paths,
              replyToMessageId: null,
              ...(expectsReply === undefined ? {} : { expectsReply }),
              ...(messagingReturn ? { messagingReturn } : {}),
              ...(senderTaskId ? { senderTaskId } : {}),
              taskId,
              idempotencyKey,
            })
            .pipe(toToolOperationFailed),
      );
      if (!opened.ok) return openBotToolFailure(opened.error);
      const deliveries = yield* Effect.forEach(
        opened.results,
        ({ taskId, receipt }) =>
          Effect.forEach(
            receipt.deliveries,
            (delivery) =>
              host.steerAgentMessage(delivery.recipientAgentId, delivery.id).pipe(
                Effect.map((steer) => {
                  host.mailboxSync.emitQueue(delivery.recipientAgentId);
                  host.drain.scheduleDrain(delivery.recipientAgentId);
                  return sentDelivery(
                    delivery,
                    steer,
                    taskId,
                    opened.results.length > 1 ? receipt.messageId : undefined,
                  );
                }),
              ),
            { concurrency: "unbounded" },
          ),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((groups) => groups.flat()));
      const snapshot = host.conversation.ensureSnapshot(senderAgentId, params.threadId);
      host.mailboxSync.syncMailboxMessages(snapshot);
      host.conversation.emitConversation(snapshot);
      return {
        success: true,
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({ messageId: opened.results[0]?.receipt.messageId ?? "", deliveries }),
          },
        ],
      };
    }

    let taskId: string | undefined;
    let messaging: ReturnType<MailboxStore["answerReturn"]>;
    if (requestedTaskId) {
      const [singleRecipient] = recipientValues;
      if (!singleRecipient) throw new Error(sourceText("error.backend.recipientRequired"));
      const target = host.tasks.validateMessageTarget(singleRecipient, requestedTaskId);
      if (!target.ok) return openBotToolFailure(target.error);
      taskId = target.task.taskId;
    } else {
      // An answer to a request from a side thread runs in that thread. When the thread is archived, the
      // answer goes to the recipient's own chat, so it is not lost. A message without replyToMessageId,
      // such as a question back, goes to the thread of the requests from its recipient that this turn
      // works on, when they all came from that one thread (#5093). Otherwise it goes to the own chat,
      // and the automatic result does not follow, so the thread would wait without an answer.
      // `answerTaskId` routes a message to one recipient only.
      const answeredRequestIds = replyTo
        ? [replyTo]
        : turnDeliveries
            .filter(
              ({ delivery }) => delivery.sender.kind === "agent" && delivery.sender.agentId === recipientValues[0],
            )
            .map(({ delivery }) => delivery.messageId);
      // Without replyToMessageId, a message that needs no answer, such as the recipient's answer or
      // notice, selects its side thread only while that thread waits for this agent. Otherwise the
      // message is a new request: it goes to the recipient's own chat, where it can start a task
      // (#10273). To continue the recipient's thread, the agent replies to the recipient's message.
      const threadRequestIds = replyTo
        ? answeredRequestIds
        : answeredRequestIds.filter(
            (requestId) =>
              host.mailbox.expectsReply(requestId) || host.mailbox.sideThreadWaitsFor(senderAgentId, requestId),
          );
      const answerTaskIds = new Set(
        threadRequestIds.map((requestId) => host.mailbox.answerTaskId(senderAgentId, requestId, recipientValues)),
      );
      const [answerTaskId = null] = answerTaskIds.size === 1 ? answerTaskIds : [];
      taskId = answerTaskId && host.tasks.threadId(answerTaskId) !== null ? answerTaskId : undefined;
      // The same rule for a request from a Slack thread or another external conversation (#5517).
      messaging = host.mailbox.answerReturn(answeredRequestIds, recipientValues);
    }

    const receipt = yield* host.mailbox
      .enqueue({
        sender: { kind: "agent", agentId: senderAgentId },
        recipientAgentIds: recipientValues,
        text,
        sourcePaths: paths,
        replyToMessageId: replyTo,
        ...(expectsReply === undefined ? {} : { expectsReply }),
        ...(messaging ? { messaging } : {}),
        ...(messagingReturn ? { messagingReturn } : {}),
        ...(senderTaskId ? { senderTaskId } : {}),
        ...(taskId ? { taskId } : {}),
        idempotencyKey: toolCallIdempotencyKey(params),
      })
      .pipe(toToolOperationFailed);
    // Waits for each provider, so the sender can tell the user if the message joined the turn. The
    // recipients are steered together, so one slow provider does not hold the others.
    const deliveries = yield* Effect.forEach(
      receipt.deliveries,
      (delivery) =>
        host.steerAgentMessage(delivery.recipientAgentId, delivery.id).pipe(
          Effect.map((steer) => {
            host.mailboxSync.emitQueue(delivery.recipientAgentId);
            host.drain.scheduleDrain(delivery.recipientAgentId);
            return sentDelivery(delivery, steer, taskId);
          }),
        ),
      { concurrency: "unbounded" },
    );
    const snapshot = host.conversation.ensureSnapshot(senderAgentId, params.threadId);
    host.mailboxSync.syncMailboxMessages(snapshot);
    host.conversation.emitConversation(snapshot);
    return {
      success: true,
      contentItems: [{ type: "inputText", text: JSON.stringify({ ...receipt, deliveries }) }],
    };
  },
  Effect.catchDefect((cause) => Effect.fail(new ToolOperationFailed({ cause }))),
  Effect.uninterruptible,
);

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSummary } from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentStore } from "../agent-store";
import { AgentTasks } from "../agent-tasks/agent-tasks";
import { AgentThreadStore } from "../agent-threads/agent-thread-store";
import { runCauseEffect } from "../effect-boundary";
import { MailboxStore } from "../mailbox-store";
import { OpenBotDatabase } from "../openbot-database";
import { ConversationRuntime } from "./conversation-runtime";
import { handleSendMessageTool, type SendMessageToolHost } from "./send-message-tool";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

interface SendMessageArgs {
  recipientAgentIds: string[];
  text: string;
  paths?: string[];
  replyToMessageId?: string | null;
  expectsReply?: boolean;
  newThread?: boolean;
  threadTitle?: string;
  taskId?: string | null;
}

const deliveryReceiptSchema = z.object({
  id: z.string(),
  messageId: z.string().optional(),
  recipientAgentId: z.string(),
  status: z.string(),
  position: z.number().nullable(),
  taskId: z.string().optional(),
});

const sendMessageResultPayloadSchema = z.object({
  messageId: z.string(),
  deliveries: z.array(deliveryReceiptSchema),
});

type SendMessageResultPayload = z.infer<typeof sendMessageResultPayloadSchema>;

function makeAgent(id: string, name: string, root: string): AgentSummary & { threadId: string } {
  return {
    id,
    provider: "codex",
    name,
    title: name,
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: `openbot-thread-${id}`,
    workspacePath: root,
    preview: "",
    updatedAt: "2026-11-20T00:00:00.000Z",
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
  };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "openbot-send-msg-thread-"));
  const database = new OpenBotDatabase(root);
  cleanup.push(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  await runCauseEffect(database.initialize());

  const alice = makeAgent("alice", "Alice", root);
  const bob = makeAgent("bob", "Bob", root);
  const carol = makeAgent("carol", "Carol", root);
  const agents = [alice, bob, carol];
  database.replaceAgents("seed", agents, "agents.updated");

  const agentStore = new AgentStore(root, root, database);
  await runCauseEffect(agentStore.initialize());
  const mailbox = new MailboxStore(root, join(root, "shared"), database);
  await runCauseEffect(mailbox.initialize());
  const threadStore = new AgentThreadStore(database);
  const conversation = new ConversationRuntime(agentStore, vi.fn(), () => agents);
  const drainScheduled: string[] = [];
  const emittedQueues: string[] = [];

  const tasks = new AgentTasks({
    store: threadStore,
    mailbox,
    conversation,
    hooks: {
      emit: vi.fn(),
      agent: (id) => agents.find((candidate) => candidate.id === id),
      hold: () => null,
      turnActive: () => false,
      defaultTaskLimit: () => 4,
      archived: () => Effect.void,
      queued: (id) => drainScheduled.push(id),
    },
  });

  // Bind each agent's main thread so `agentForThread` resolves calls from it.
  for (const agent of agents) {
    conversation.ensureSnapshot(agent.id, agent.threadId);
    conversation.bindThread(agent.threadId, agent.id, agent.threadId);
  }

  const host: SendMessageToolHost = {
    mailbox,
    tasks,
    conversation,
    mailboxSync: {
      emitQueue: (agentId: string) => {
        emittedQueues.push(agentId);
      },
      syncMailboxMessages: vi.fn(),
    },
    drain: {
      scheduleDrain: (agentId: string) => {
        drainScheduled.push(agentId);
      },
    },
    listAgents: () => agents,
    steerAgentMessage: () => Effect.succeed(null),
  };

  const callSendMessage = async (input: {
    threadId: string;
    turnId?: string;
    callId?: string;
    arguments: SendMessageArgs;
  }): Promise<{
    success: boolean;
    text: string;
    parsed?: SendMessageResultPayload;
  }> => {
    const senderAgentId = conversation.agentForThread(input.threadId);
    if (!senderAgentId) throw new Error(`Unknown thread: ${input.threadId}`);
    const response = await Effect.runPromise(
      handleSendMessageTool(
        host,
        {
          threadId: input.threadId,
          turnId: input.turnId ?? "turn-1",
          callId: input.callId ?? "call-1",
          namespace: "openbot",
          tool: "send_message",
          arguments: input.arguments,
        },
        senderAgentId,
      ),
    );
    const firstItem = response.contentItems[0];
    const text = firstItem?.type === "inputText" ? firstItem.text : "";
    let parsed: SendMessageResultPayload | undefined;
    if (response.success) {
      parsed = sendMessageResultPayloadSchema.parse(JSON.parse(text));
    }
    return { success: response.success, text, ...(parsed === undefined ? {} : { parsed }) };
  };

  return { alice, bob, carol, mailbox, threadStore, tasks, conversation, callSendMessage, drainScheduled };
}

describe("send_message side-thread routing", () => {
  it("preserves default main-chat routing when no side-thread option is passed", async () => {
    const { alice, bob, mailbox, tasks, callSendMessage } = await createFixture();
    const result = await callSendMessage({
      threadId: alice.threadId,
      arguments: { recipientAgentIds: [bob.id], text: "Hello Bob" },
    });
    expect(result.success, result.text).toBe(true);
    const deliveries = result.parsed?.deliveries ?? [];
    expect(deliveries).toHaveLength(1);
    const first = deliveries[0];
    expect(first?.recipientAgentId).toBe(bob.id);
    expect(first?.taskId).toBeUndefined();
    expect(tasks.openTaskIds(bob.id)).toHaveLength(0);
    expect(mailbox.taskIdForDelivery(first?.id ?? "")).toBeNull();
  });

  it("opens a new side thread with optional title and returns taskId for follow-ups", async () => {
    const { alice, bob, mailbox, tasks, callSendMessage } = await createFixture();
    const first = await callSendMessage({
      threadId: alice.threadId,
      callId: "call-open",
      arguments: {
        recipientAgentIds: [bob.id],
        text: "Audit the billing webhook retries.",
        newThread: true,
        threadTitle: "Billing audit",
      },
    });
    expect(first.success, first.text).toBe(true);
    const firstDelivery = first.parsed?.deliveries[0];
    expect(firstDelivery?.taskId).toBeTruthy();
    const bobTaskId = firstDelivery?.taskId ?? "";

    const bobTasks = tasks.snapshot(bob.id).tasks;
    expect(bobTasks).toHaveLength(1);
    expect(bobTasks[0]).toMatchObject({ id: bobTaskId, title: "Billing audit", origin: "agent" });
    expect(mailbox.taskIdForDelivery(firstDelivery?.id ?? "")).toBe(bobTaskId);
    // Main chat of Bob does not show the side-thread message.
    expect(mailbox.conversationMessages(bob.id)).toHaveLength(0);

    // Follow-up using the returned taskId routes into the same side thread.
    const followUp = await callSendMessage({
      threadId: alice.threadId,
      callId: "call-followup",
      arguments: {
        recipientAgentIds: [bob.id],
        text: "Also check idempotency keys.",
        taskId: bobTaskId,
      },
    });
    expect(followUp.success, followUp.text).toBe(true);
    const followUpDelivery = followUp.parsed?.deliveries[0];
    expect(followUpDelivery?.taskId).toBe(bobTaskId);
    expect(mailbox.taskIdForDelivery(followUpDelivery?.id ?? "")).toBe(bobTaskId);
    expect(tasks.openTaskIds(bob.id)).toHaveLength(1);
  });

  it("opens one side thread per recipient, returns per-recipient taskId, and is idempotent on retry", async () => {
    const { alice, bob, carol, mailbox, tasks, callSendMessage } = await createFixture();
    const args: SendMessageArgs = {
      recipientAgentIds: [bob.id, carol.id],
      text: "Review the release checklist.",
      threadTitle: "Release review",
    };
    const first = await callSendMessage({ threadId: alice.threadId, callId: "call-multi", arguments: args });
    expect(first.success, first.text).toBe(true);
    const deliveries = first.parsed?.deliveries ?? [];
    expect(deliveries).toHaveLength(2);
    const bobDelivery = deliveries.find((d) => d.recipientAgentId === bob.id);
    const carolDelivery = deliveries.find((d) => d.recipientAgentId === carol.id);
    expect(bobDelivery?.taskId).toBeTruthy();
    expect(carolDelivery?.taskId).toBeTruthy();
    expect(bobDelivery?.taskId).not.toBe(carolDelivery?.taskId);
    expect(mailbox.taskIdForDelivery(bobDelivery?.id ?? "")).toBe(bobDelivery?.taskId);
    expect(mailbox.taskIdForDelivery(carolDelivery?.id ?? "")).toBe(carolDelivery?.taskId);

    // Retry with the same callId returns the same deliveries/taskIds without creating extra threads.
    const retry = await callSendMessage({ threadId: alice.threadId, callId: "call-multi", arguments: args });
    expect(retry.success, retry.text).toBe(true);
    const retryDeliveries = retry.parsed?.deliveries ?? [];
    expect(retryDeliveries.map((d) => ({ id: d.id, taskId: d.taskId }))).toEqual(
      deliveries.map((d) => ({ id: d.id, taskId: d.taskId })),
    );
    expect(tasks.openTaskIds(bob.id)).toHaveLength(1);
    expect(tasks.openTaskIds(carol.id)).toHaveLength(1);
  });

  it("validates taskId ownership, archived state, routine threads, and conflicting options", async () => {
    const { alice, bob, carol, tasks, callSendMessage } = await createFixture();
    const carolTask = tasks.create(carol.id, "Carol private", "user");
    const bobArchived = tasks.create(bob.id, "Bob archived", "user");
    tasks.close(bobArchived);
    const bobRoutine = tasks.routineThread(bob.id, "routine-1", "Daily check");
    expect(bobRoutine).not.toBeNull();

    // Wrong owner (Carol's taskId sent to Bob).
    const wrongOwner = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-owner",
      arguments: { recipientAgentIds: [bob.id], text: "hi", taskId: carolTask.taskId },
    });
    expect(wrongOwner.success).toBe(false);
    expect(wrongOwner.text).toContain(sourceText("error.backend.threadNotFound"));

    // Unknown taskId.
    const unknown = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-unknown",
      arguments: { recipientAgentIds: [bob.id], text: "hi", taskId: "openbot-thread-missing" },
    });
    expect(unknown.success).toBe(false);
    expect(unknown.text).toContain(sourceText("error.backend.threadNotFound"));

    // Archived taskId.
    const archived = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-archived",
      arguments: { recipientAgentIds: [bob.id], text: "hi", taskId: bobArchived.taskId },
    });
    expect(archived.success).toBe(false);
    expect(archived.text).toContain(sourceText("error.backend.threadArchived"));

    // Routine thread taskId.
    const routine = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-routine",
      arguments: { recipientAgentIds: [bob.id], text: "hi", taskId: bobRoutine?.taskId ?? "" },
    });
    expect(routine.success).toBe(false);
    expect(routine.text).toContain("routine thread");

    // Multi-recipient with taskId.
    const multiTaskId = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-multi-task",
      arguments: { recipientAgentIds: [bob.id, carol.id], text: "hi", taskId: carolTask.taskId },
    });
    expect(multiTaskId.success).toBe(false);
    expect(multiTaskId.text).toContain("single recipientAgentId");

    // Conflicting newThread + taskId.
    const conflict = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-conflict",
      arguments: { recipientAgentIds: [carol.id], text: "hi", newThread: true, taskId: carolTask.taskId },
    });
    expect(conflict.success).toBe(false);
    expect(conflict.text).toContain("Cannot combine taskId");

    // Conflicting newThread: false + threadTitle.
    const titleConflict = await callSendMessage({
      threadId: alice.threadId,
      callId: "err-title-conflict",
      arguments: { recipientAgentIds: [bob.id], text: "hi", newThread: false, threadTitle: "Title" },
    });
    expect(titleConflict.success).toBe(false);
    expect(titleConflict.text).toContain("threadTitle requires newThread");
  });

  it("preserves reply routing back to caller's side thread and respects expectsReply", async () => {
    const { alice, bob, mailbox, tasks, conversation, callSendMessage } = await createFixture();

    // Start a turn in Alice's side thread.
    const aliceTask = tasks.create(alice.id, "Alice work", "user");
    conversation.bindThread(aliceTask.threadId, alice.id, aliceTask.threadId);
    const seedReceipt = await runCauseEffect(
      mailbox.enqueue({
        sender: { kind: "user" },
        recipientAgentIds: [alice.id],
        taskId: aliceTask.taskId,
        text: "Ask Bob in a side thread",
      }),
    );
    const seedDeliveryId = seedReceipt.deliveries[0]?.id ?? "";
    await runCauseEffect(mailbox.markStarting(seedDeliveryId));
    await runCauseEffect(mailbox.markRunning(seedDeliveryId, "alice-turn-1"));

    // Alice sends from her side thread into a new side thread on Bob (expectsReply defaults to true).
    const request = await callSendMessage({
      threadId: aliceTask.threadId,
      turnId: "alice-turn-1",
      callId: "alice-send-1",
      arguments: {
        recipientAgentIds: [bob.id],
        text: "Check deploy status",
        newThread: true,
        threadTitle: "Deploy check",
      },
    });
    expect(request.success, request.text).toBe(true);
    const reqDelivery = request.parsed?.deliveries[0];
    expect(reqDelivery?.taskId).toBeTruthy();
    const bobTask = tasks.require(bob.id, reqDelivery?.taskId ?? "");
    conversation.bindThread(bobTask.threadId, bob.id, bobTask.threadId);
    const reqMessageId = request.parsed?.messageId ?? "";
    expect(mailbox.expectsReply(reqMessageId)).toBe(true);

    // Bob starts a turn in Bob's side thread for Alice's request.
    await runCauseEffect(mailbox.markStarting(reqDelivery?.id ?? ""));
    await runCauseEffect(mailbox.markRunning(reqDelivery?.id ?? "", "bob-turn-1"));

    // Bob replies with replyToMessageId and expectsReply: false -> routes back to Alice's side thread.
    const reply = await callSendMessage({
      threadId: bobTask.threadId,
      turnId: "bob-turn-1",
      callId: "bob-reply-1",
      arguments: {
        recipientAgentIds: [alice.id],
        text: "Deploy is green.",
        replyToMessageId: reqMessageId,
        expectsReply: false,
      },
    });
    expect(reply.success, reply.text).toBe(true);
    const replyDelivery = reply.parsed?.deliveries[0];
    expect(replyDelivery?.taskId).toBe(aliceTask.taskId);
    expect(mailbox.taskIdForDelivery(replyDelivery?.id ?? "")).toBe(aliceTask.taskId);
    expect(mailbox.expectsReply(reply.parsed?.messageId ?? "")).toBe(false);

    // If Alice archives her side thread, a later reply from Bob falls back to Alice's main chat.
    tasks.close(aliceTask);
    const fallbackReply = await callSendMessage({
      threadId: bobTask.threadId,
      turnId: "bob-turn-1",
      callId: "bob-reply-2",
      arguments: {
        recipientAgentIds: [alice.id],
        text: "Follow-up after archive.",
        replyToMessageId: reqMessageId,
        expectsReply: false,
      },
    });
    expect(fallbackReply.success, fallbackReply.text).toBe(true);
    const fallbackDelivery = fallbackReply.parsed?.deliveries[0];
    expect(fallbackDelivery?.taskId).toBeUndefined();
    expect(mailbox.taskIdForDelivery(fallbackDelivery?.id ?? "")).toBeNull();
  });

  it("enforces unfinished thread limits, prevents orphan threads, and serializes concurrent calls", async () => {
    const { alice, bob, carol, tasks, callSendMessage } = await createFixture();

    // Fill Bob to the 8-unfinished-task limit using concurrent calls.
    const batch = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        callSendMessage({
          threadId: alice.threadId,
          callId: `concurrent-${index}`,
          arguments: {
            recipientAgentIds: [bob.id],
            text: `Task ${index}`,
            newThread: true,
          },
        }),
      ),
    );
    expect(batch.filter((res) => res.success)).toHaveLength(8);
    expect(batch.filter((res) => !res.success)).toHaveLength(2);
    expect(tasks.openTaskIds(bob.id)).toHaveLength(8);

    // Multi-recipient call where Bob is full and Carol has room must fail cleanly with 0 orphan threads on Carol.
    const multiAtCap = await callSendMessage({
      threadId: alice.threadId,
      callId: "multi-at-cap",
      arguments: {
        recipientAgentIds: [carol.id, bob.id],
        text: "Should fail atomically before creating Carol thread",
        newThread: true,
      },
    });
    expect(multiAtCap.success).toBe(false);
    expect(tasks.openTaskIds(carol.id)).toHaveLength(0);
    expect(tasks.openTaskIds(bob.id)).toHaveLength(8);
  });
});

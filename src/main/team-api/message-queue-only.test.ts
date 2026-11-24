import {
  MESSAGE_QUEUE_ONLY_CODECS,
  MESSAGE_QUEUE_ONLY_ROUTE,
} from "@openbot/contracts/team-protocol/message-queue-only-v1";
import { isAlternateSubmitKey } from "@openbot/ui/features/conversation/send-shortcut";
import { describe, expect, it } from "vitest";

const key = (overrides: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }>) => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe("Cmd+Enter queues while Enter steers", () => {
  it("treats Cmd+Enter or Ctrl+Enter as the queue chord only when plain Enter sends", () => {
    expect(isAlternateSubmitKey(key({ metaKey: true }), "enter")).toBe(true);
    expect(isAlternateSubmitKey(key({ ctrlKey: true }), "enter")).toBe(true);
    expect(isAlternateSubmitKey(key({}), "enter")).toBe(false);
    expect(isAlternateSubmitKey(key({ metaKey: true, shiftKey: true }), "enter")).toBe(false);
    expect(isAlternateSubmitKey(key({ metaKey: true }), "meta-enter")).toBe(false);
  });

  it("accepts a queue-only send for a main chat or a side thread", () => {
    const codec = MESSAGE_QUEUE_ONLY_CODECS.get(MESSAGE_QUEUE_ONLY_ROUTE);
    expect(codec).toBeDefined();
    expect(codec?.request({ agentId: "agent-1", text: "after this", attachmentDraftIds: [] })).toEqual({
      agentId: "agent-1",
      text: "after this",
      attachmentDraftIds: [],
    });
    expect(
      codec?.request({
        agentId: "agent-1",
        taskId: "task-1",
        text: "after this",
        attachmentDraftIds: [],
        timezone: "America/New_York",
      }),
    ).toMatchObject({ taskId: "task-1", timezone: "America/New_York" });
  });

  it("refuses a send without an agent or with a bad timezone", () => {
    const codec = MESSAGE_QUEUE_ONLY_CODECS.get(MESSAGE_QUEUE_ONLY_ROUTE);
    expect(() => codec?.request({ text: "x", attachmentDraftIds: [] })).toThrow();
    expect(() =>
      codec?.request({ agentId: "agent-1", text: "x", attachmentDraftIds: [], timezone: "Not/AZone" }),
    ).toThrow();
  });
});

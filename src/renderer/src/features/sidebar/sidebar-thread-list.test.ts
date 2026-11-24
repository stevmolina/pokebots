import type { ThreadItem, ThreadStatus } from "@pokebots/ui/features/conversation/threads/thread-types";
import {
  sidebarThreadList,
  sidebarThreadListMode,
  threadIsLive,
} from "@pokebots/ui/features/sidebar/sidebar-thread-list";
import { describe, expect, it } from "vitest";

function status(kind: ThreadStatus["kind"]): ThreadStatus {
  return kind === "waiting" ? { kind: "waiting", reason: "approval" } : { kind };
}

function thread(id: string, kind: ThreadStatus["kind"], unread = 0): ThreadItem {
  return { id, kind: "side", title: id, updatedAt: "2026-11-24T12:00:00.000Z", status: status(kind), unread };
}

const ids = (threads: readonly ThreadItem[]) => threads.map((item) => item.id);

describe("threadIsLive", () => {
  it("counts work, waits and unread replies, not idle or failed threads", () => {
    expect(threadIsLive(thread("a", "working"))).toBe(true);
    expect(threadIsLive(thread("b", "queued"))).toBe(true);
    expect(threadIsLive(thread("c", "waiting"))).toBe(true);
    expect(threadIsLive(thread("d", "awaiting"))).toBe(true);
    expect(threadIsLive(thread("e", "idle", 2))).toBe(true);
    expect(threadIsLive(thread("f", "idle"))).toBe(false);
    expect(threadIsLive(thread("g", "failed"))).toBe(false);
  });
});

describe("sidebarThreadListMode", () => {
  it("opens by itself only while a thread is live", () => {
    expect(sidebarThreadListMode([thread("a", "idle"), thread("b", "failed")], false)).toBe("closed");
    expect(sidebarThreadListMode([thread("a", "idle"), thread("b", "working")], false)).toBe("live");
  });

  it("follows the chevron first", () => {
    expect(sidebarThreadListMode([thread("a", "idle")], true)).toBe("all");
    expect(sidebarThreadListMode([], true)).toBe("all");
  });
});

describe("sidebarThreadList", () => {
  const threads = [
    thread("w1", "working"),
    thread("w2", "working"),
    thread("ask", "waiting"),
    thread("w3", "working"),
    thread("done", "idle", 1),
    thread("old1", "idle"),
    thread("bad", "failed"),
    thread("old2", "idle"),
  ];

  it("shows 3 live threads, the one that needs the user first, and counts the rest", () => {
    const list = sidebarThreadList({ threads, mode: "live", openId: undefined, showAll: false });
    expect(ids(list.shown)).toEqual(["ask", "w1", "w2"]);
    expect(list.hidden).toBe(2);
    expect(list.pill).toBe(true);
  });

  it("shows every live thread after Show more, and keeps a Show less pill", () => {
    const list = sidebarThreadList({ threads, mode: "live", openId: undefined, showAll: true });
    expect(ids(list.shown)).toEqual(["ask", "w1", "w2", "w3", "done"]);
    expect(list.hidden).toBe(0);
    expect(list.pill).toBe(true);
  });

  it("has no pill when the live threads fit", () => {
    const list = sidebarThreadList({
      threads: [thread("a", "working"), thread("b", "idle")],
      mode: "live",
      openId: undefined,
      showAll: false,
    });
    expect(ids(list.shown)).toEqual(["a"]);
    expect(list.pill).toBe(false);
  });

  it("keeps the open thread in a cut list", () => {
    const list = sidebarThreadList({ threads, mode: "live", openId: "done", showAll: false });
    expect(ids(list.shown)).toEqual(["ask", "w1", "done"]);
  });

  it("adds the latest other threads when the chevron opens the list", () => {
    const list = sidebarThreadList({ threads, mode: "all", openId: undefined, showAll: false });
    expect(ids(list.shown)).toEqual(["ask", "w1", "w2", "old1", "old2"]);
    expect(list.hidden).toBe(3);
  });

  it("shows nothing when closed", () => {
    expect(sidebarThreadList({ threads, mode: "closed", openId: undefined, showAll: false })).toEqual({
      shown: [],
      hidden: 0,
      pill: false,
    });
  });
});

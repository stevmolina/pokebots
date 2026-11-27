import { currentText } from "@pokebots/ui/text";
import {
  evaluateAgentSettle,
  formatSettleTimeLeft,
  latestAgentActivityAt,
  parseSidebarSettled,
  sidebarAutoSettleMs,
  sidebarSettledAgents,
  sidebarSettledMarker,
} from "@pokebots/ui/features/sidebar/sidebar-settling";
import { SIDEBAR_DOCK_FOLDERS_VIEW_ID } from "@pokebots/ui/features/sidebar/sidebar-types";
import { describe, expect, it } from "vitest";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

describe("sidebar settling rules", () => {
  const now = Date.parse("2026-11-25T18:00:00Z");

  it("keeps a read bot in Done until the inactivity window elapses", () => {
    const state = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 6 * HOUR_MS,
      settledAt: undefined,
      settleAfterMs: sidebarAutoSettleMs("1d"),
      now,
    });
    expect(state).toEqual({
      inDone: true,
      openPullRequest: undefined,
      remainingMs: 18 * HOUR_MS,
    });
  });

  it("auto-settles a read bot once the inactivity window passes", () => {
    const state = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 25 * HOUR_MS,
      settledAt: undefined,
      settleAfterMs: sidebarAutoSettleMs("1d"),
      now,
    });
    expect(state).toEqual({
      inDone: false,
      openPullRequest: undefined,
      remainingMs: null,
    });
  });

  it("respects 3d, 7d, and manual-only inactivity windows", () => {
    expect(sidebarAutoSettleMs("1d")).toBe(DAY_MS);
    expect(sidebarAutoSettleMs("3d")).toBe(3 * DAY_MS);
    expect(sidebarAutoSettleMs("7d")).toBe(7 * DAY_MS);
    expect(sidebarAutoSettleMs("manual")).toBeNull();

    const manualState = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 30 * DAY_MS,
      settledAt: undefined,
      settleAfterMs: null,
      now,
    });
    expect(manualState).toEqual({
      inDone: true,
      openPullRequest: undefined,
      remainingMs: null,
    });
  });

  it("holds off inactivity auto-settling while a linked PR is open", () => {
    const pr = {
      owner: "stevmolina",
      repo: "pokebots",
      number: 344,
      url: "https://github.com/stevmolina/pokebots/pull/344",
    };
    const state = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 5 * DAY_MS,
      settledAt: undefined,
      settleAfterMs: DAY_MS,
      now,
      pullRequests: { open: [pr], allMerged: false, mergedAt: null },
    });
    expect(state).toEqual({
      inDone: true,
      openPullRequest: pr,
      remainingMs: null,
    });
  });

  it("auto-settles when all linked PRs are merged and no newer activity followed", () => {
    const state = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 2 * HOUR_MS,
      settledAt: undefined,
      settleAfterMs: DAY_MS,
      now,
      pullRequests: { open: [], allMerged: true, mergedAt: now - HOUR_MS },
    });
    expect(state).toEqual({
      inDone: false,
      openPullRequest: undefined,
      remainingMs: null,
    });
  });

  it("does not auto-settle on an old merged PR if the bot had newer activity after merge", () => {
    const state = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 30 * 60_000,
      settledAt: undefined,
      settleAfterMs: DAY_MS,
      now,
      pullRequests: { open: [], allMerged: true, mergedAt: now - 2 * HOUR_MS },
    });
    expect(state.inDone).toBe(true);
    expect(state.remainingMs).toBe(DAY_MS - 30 * 60_000);
  });

  it("moves a bot to Settled on manual settle and wakes it on new activity or unread", () => {
    const settledAt = now - 10 * 60_000;
    const settled = evaluateAgentSettle({
      unread: false,
      lastActivityAt: now - 20 * 60_000,
      settledAt,
      settleAfterMs: DAY_MS,
      now,
    });
    expect(settled.inDone).toBe(false);

    const wokenByActivity = evaluateAgentSettle({
      unread: false,
      lastActivityAt: settledAt + 60_000,
      settledAt,
      settleAfterMs: DAY_MS,
      now,
    });
    expect(wokenByActivity.inDone).toBe(true);

    const wokenByUnread = evaluateAgentSettle({
      unread: true,
      lastActivityAt: now - 20 * 60_000,
      settledAt,
      settleAfterMs: DAY_MS,
      now,
    });
    expect(wokenByUnread.inDone).toBe(true);
  });

  it("round-trips settled markers and keeps the latest timestamp per agent", () => {
    const marker = sidebarSettledMarker("agent-1", now);
    expect(parseSidebarSettled(marker)).toEqual({ agentId: "agent-1", settledAt: now });
    expect(parseSidebarSettled(SIDEBAR_DOCK_FOLDERS_VIEW_ID)).toBeUndefined();
    expect(parseSidebarSettled("dock:settled:agent-1@soon")).toBeUndefined();
    expect(parseSidebarSettled("dock:settled:@123")).toBeUndefined();

    const map = sidebarSettledAgents([
      "section-a",
      sidebarSettledMarker("agent-1", now - 5_000),
      sidebarSettledMarker("agent-1", now),
      sidebarSettledMarker("agent-2", now - 1_000),
    ]);
    expect([...map]).toEqual([
      ["agent-1", now],
      ["agent-2", now - 1_000],
    ]);
  });

  it("picks the latest activity across main chat and side threads", () => {
    const t1 = "2026-11-25T10:00:00Z";
    const t2 = "2026-11-25T12:00:00Z";
    expect(latestAgentActivityAt(t1, t2)).toBe(Date.parse(t2));
    expect(latestAgentActivityAt(t2, t1)).toBe(Date.parse(t2));
    expect(latestAgentActivityAt(null, undefined)).toBeNull();
  });

  it("formats remaining auto-settle time compactly", () => {
    const { t, format } = currentText();
    expect(formatSettleTimeLeft(45 * 60_000, t, format)).toBe("45m");
    expect(formatSettleTimeLeft(18 * HOUR_MS, t, format)).toBe("18h");
    expect(formatSettleTimeLeft(2 * DAY_MS, t, format)).toBe("2d");
  });
});

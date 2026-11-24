import {
  parseSidebarSnooze,
  SIDEBAR_DOCK_FOLDERS_VIEW_ID,
  sidebarSnoozeMarker,
  sidebarSnoozes,
} from "@pokebots/ui/features/sidebar/sidebar-types";
import { describe, expect, it } from "vitest";

describe("sidebar snoozes", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");

  it("round-trips a snooze marker", () => {
    const marker = sidebarSnoozeMarker("agent-1", now + 60_000);
    expect(parseSidebarSnooze(marker)).toEqual({ agentId: "agent-1", until: now + 60_000 });
  });

  it("ignores ids that are not snooze markers", () => {
    expect(parseSidebarSnooze(SIDEBAR_DOCK_FOLDERS_VIEW_ID)).toBeUndefined();
    expect(parseSidebarSnooze("dock:open:dock:working")).toBeUndefined();
    expect(parseSidebarSnooze("dock:snooze:agent-1@soon")).toBeUndefined();
    expect(parseSidebarSnooze("dock:snooze:@123")).toBeUndefined();
  });

  it("keeps only snoozes that have not run out, the latest per agent", () => {
    const snoozes = sidebarSnoozes(
      [
        "section-a",
        sidebarSnoozeMarker("agent-1", now - 1),
        sidebarSnoozeMarker("agent-2", now + 1_000),
        sidebarSnoozeMarker("agent-2", now + 5_000),
        sidebarSnoozeMarker("agent-3", now + 3_600_000),
      ],
      now,
    );
    expect([...snoozes]).toEqual([
      ["agent-2", now + 5_000],
      ["agent-3", now + 3_600_000],
    ]);
  });
});

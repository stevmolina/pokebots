import SharedAgentSettingsPanel from "@openbot/ui/features/conversation/AgentSettingsPanel";
import { AgentSessions } from "@openbot/ui/features/conversation/threads/AgentSessions";
import type { ThreadItem } from "@openbot/ui/features/conversation/threads/thread-types";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { STORY_AGENT, STORY_AGENT_STATUS, STORY_MODELS, storyRuntimeSettings } from "../../../stories/fixtures";

function makeSession(id: string, title: string, minutesAgo: number): ThreadItem {
  return {
    id,
    kind: "side",
    title,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    status: { kind: "idle" },
    unread: 0,
  };
}

describe("AgentSessions minimal sidebar card", () => {
  it("shows 3 recent sessions by default with + New in the header and All N sessions footer", async () => {
    const onNew = vi.fn();
    const sessions = [
      makeSession("s1", "Minimalist Sidebar Mockups", 1),
      makeSession("s2", "Limit pill length", 2),
      makeSession("s3", "Bot list toggle", 3),
      makeSession("s4", "Older thread 4", 4),
      makeSession("s5", "Older thread 5", 5),
    ];

    render(() => (
      <AgentSessions
        sessions={sessions}
        archived={[]}
        activeId="s1"
        canStartNew
        onOpen={vi.fn()}
        onNew={onNew}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
      />
    ));

    expect(screen.getByText("Minimalist Sidebar Mockups")).toBeTruthy();
    expect(screen.getByText("Limit pill length")).toBeTruthy();
    expect(screen.getByText("Bot list toggle")).toBeTruthy();
    expect(screen.queryByText("Older thread 4")).toBeNull();

    const newBtn = screen.getByRole("button", { name: "New session" });
    expect(newBtn.textContent).toContain("New");
    fireEvent.click(newBtn);
    expect(onNew).toHaveBeenCalledTimes(1);

    const allBtn = screen.getByRole("button", { name: "All 5 sessions" });
    expect(allBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(allBtn);

    await waitFor(() => {
      expect(allBtn.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("Older thread 4")).toBeTruthy();
      expect(screen.getByText("Older thread 5")).toBeTruthy();
    });
  });
});

describe("SharedAgentSettingsPanel Dusk 3-tab layout", () => {
  it("renders Activity, Library, and Settings tabs without a separate Edit button", async () => {
    render(() => (
      <SharedAgentSettingsPanel
        agent={STORY_AGENT}
        runtimeSettings={storyRuntimeSettings(STORY_AGENT)}
        agentStatus={STORY_AGENT_STATUS}
        modelOptions={STORY_MODELS}
        working={false}
        width={320}
        maxWidth={() => 640}
        onClose={vi.fn()}
        onResize={vi.fn()}
        onResizeEnd={vi.fn()}
        onUpdateAgent={vi.fn(async () => undefined)}
        onUpdateRuntimeSettings={vi.fn(async () => true)}
        onSetAgentAvatar={vi.fn(async () => undefined)}
        notificationLevel={{ current: null, serverLevel: "all", onOpen: vi.fn() }}
        overview={<div>Activity summary content</div>}
        libraryOverview={<div>Library files content</div>}
        tools={<div>Tools section content</div>}
        links={<div>Links section content</div>}
      />
    ));

    expect(screen.getByRole("tab", { name: "Activity" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Library" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    // Activity tab is active by default and hides Notifications, Tools, and edit fields
    expect(screen.getByText("Activity summary content")).toBeTruthy();
    expect(screen.queryByText("Notify me")).toBeNull();
    expect(screen.queryByText("Tools section content")).toBeNull();

    // Switch to Library tab
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await waitFor(() => {
      expect(screen.getByText("Library files content")).toBeTruthy();
      expect(screen.queryByText("Activity summary content")).toBeNull();
    });

    // Switch to Settings tab
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Agent name")).toBeTruthy();
      expect(screen.getByText("Notify me")).toBeTruthy();
      expect(screen.getByText("Tools section content")).toBeTruthy();
      expect(screen.getByText("Links section content")).toBeTruthy();
    });
  });
});

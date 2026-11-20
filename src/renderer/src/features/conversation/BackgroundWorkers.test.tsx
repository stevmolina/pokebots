import { type BackgroundWorker, BackgroundWorkers } from "@openbot/ui/features/conversation/BackgroundWorkers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

function makeWorker(id: string, title: string, state: "running" | "queued" = "running"): BackgroundWorker {
  return {
    id,
    agent: undefined,
    title,
    since: new Date(Date.now() - 60_000).toISOString(),
    state,
    onOpen: vi.fn(),
  };
}

describe("BackgroundWorkers divider pill toggle", () => {
  it("renders no toggle pill when only one session is active", () => {
    render(() => <BackgroundWorkers items={[makeWorker("w1", "Only session")]} />);
    expect(screen.queryByRole("button", { name: /active session/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Only session/i })).toBeTruthy();
  });

  it("starts collapsed when multiple sessions are active and toggles on click", async () => {
    const items = [
      makeWorker("w1", "Order active sessions first"),
      makeWorker("w2", "Minimalist toggle mockups"),
      makeWorker("w3", "Send agent messages into side threads"),
    ];
    render(() => <BackgroundWorkers items={items} />);

    const toggle = screen.getByRole("button", { name: "Show all 3 active sessions" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("3 running");

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(toggle.getAttribute("aria-label")).toBe("Collapse to one active session");
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.getAttribute("aria-label")).toBe("Show all 3 active sessions");
    });
  });

  it("labels the pill as queued when all active sessions are queued", () => {
    const items = [makeWorker("w1", "Queued task 1", "queued"), makeWorker("w2", "Queued task 2", "queued")];
    render(() => <BackgroundWorkers items={items} />);

    const toggle = screen.getByRole("button", { name: "Show all 2 active sessions" });
    expect(toggle.textContent).toContain("2 queued");
  });

  it("resets back to collapsed after dropping to one session and growing again", async () => {
    const initial = [makeWorker("w1", "Session 1"), makeWorker("w2", "Session 2")];
    const [items, setItems] = createSignal(initial);
    render(() => <BackgroundWorkers items={items()} />);

    const toggle = screen.getByRole("button", { name: "Show all 2 active sessions" });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    setItems([makeWorker("w1", "Session 1")]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /active session/i })).toBeNull();
    });

    setItems([makeWorker("w1", "Session 1"), makeWorker("w2", "Session 2"), makeWorker("w3", "Session 3")]);
    await waitFor(() => {
      const reappeared = screen.getByRole("button", { name: "Show all 3 active sessions" });
      expect(reappeared.getAttribute("aria-expanded")).toBe("false");
    });
  });
});

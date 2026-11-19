import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { describe, expect, test } from "vitest";
import { buildTaskTitlePrompt, parseGeneratedTaskTitle, taskTitle } from "./task-title";

describe("taskTitle", () => {
  test("strips markdown links and bold formatting from the first line", () => {
    expect(taskTitle("**File:** [Screen Recording 2026-11-19.mov](/tmp/Screen%20Recording.mov)\nCheck this")).toBe(
      "File: Screen Recording 2026-11-19.mov",
    );
  });

  test("strips headings, list markers, inline code, and emphasis", () => {
    expect(taskTitle("\n  ## Fix `login_flow` in *mobile* view\nMore details")).toBe("Fix login_flow in mobile view");
    expect(taskTitle("- **Add** dark mode toggle")).toBe("Add dark mode toggle");
  });

  test("truncates long titles to the contract limit with an ellipsis", () => {
    const long = "a".repeat(INPUT_LIMITS.agentTaskTitle + 25);
    const result = taskTitle(long);
    expect(result.length).toBe(INPUT_LIMITS.agentTaskTitle);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("buildTaskTitlePrompt", () => {
  test("includes the user request and truncates very long inputs", () => {
    const prompt = buildTaskTitlePrompt("Fix the broken CSS on the mobile header");
    expect(prompt).toContain("Fix the broken CSS on the mobile header");

    const huge = "x".repeat(1200);
    const truncated = buildTaskTitlePrompt(huge);
    expect(truncated.length).toBeLessThan(1200);
    expect(truncated).toContain("…");
  });
});

describe("parseGeneratedTaskTitle", () => {
  test("cleans quotes, prefixes, markdown, and trailing punctuation", () => {
    expect(parseGeneratedTaskTitle('Title: "**Fix Mobile Header Layout**."')).toBe("Fix Mobile Header Layout");
    expect(parseGeneratedTaskTitle("`Session Auto-Titling`\nExtra explanation")).toBe("Session Auto-Titling");
  });

  test("returns null for empty or unusable output", () => {
    expect(parseGeneratedTaskTitle("   \n  ")).toBeNull();
    expect(parseGeneratedTaskTitle('""...')).toBeNull();
  });
});

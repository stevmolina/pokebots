import { describe, expect, it } from "vitest";
import { pickThreadTopicIcon } from "../../../../../packages/ui/src/features/conversation/threads/thread-topic-icon";

describe("pickThreadTopicIcon", () => {
  it("falls back to default for empty or generic titles", () => {
    expect(pickThreadTopicIcon(undefined)).toBe("default");
    expect(pickThreadTopicIcon("")).toBe("default");
    expect(pickThreadTopicIcon("   ")).toBe("default");
    expect(pickThreadTopicIcon("Quick question")).toBe("default");
  });

  it("matches common thread topics automatically", () => {
    expect(pickThreadTopicIcon("Pricing page copy")).toBe("chart");
    expect(pickThreadTopicIcon("Q3 budget")).toBe("chart");
    expect(pickThreadTopicIcon("Competitor scan")).toBe("search");
    expect(pickThreadTopicIcon("Launch plan")).toBe("launch");
    expect(pickThreadTopicIcon("Hiring pipeline")).toBe("users");
    expect(pickThreadTopicIcon("Check broken links")).toBe("bug");
    expect(pickThreadTopicIcon("Sidebar mockup")).toBe("design");
    expect(pickThreadTopicIcon("API refactor")).toBe("code");
    expect(pickThreadTopicIcon("Cold outreach email")).toBe("mail");
    expect(pickThreadTopicIcon("Sprint roadmap")).toBe("plan");
    expect(pickThreadTopicIcon("Agency proposal")).toBe("sales");
    expect(pickThreadTopicIcon("Landing page SEO")).toBe("web");
    expect(pickThreadTopicIcon("Paper summary")).toBe("book");
    expect(pickThreadTopicIcon("Prototype ideas")).toBe("idea");
    expect(pickThreadTopicIcon("Blog draft")).toBe("document");
  });
});

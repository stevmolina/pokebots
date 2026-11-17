import type { BrainRequest, BrainResponse } from "@openbot/contracts/brain";

const base = {
  page: "wiki/decisions.md",
  commit: "abc1234def",
  url: "https://github.com/example/notes/blob/abc1234def/wiki/decisions.md",
};
const claims = [
  {
    ...base,
    id: "demo-launch-date",
    text: "The launch is on Tuesday. The team will confirm the release after the final review.",
    line: 12,
    authority: "live",
    verified_at: "2026-11-17",
  },
  {
    ...base,
    id: "demo-review-day",
    text: "The final review is on Monday with the whole team.",
    line: 11,
    authority: null,
    verified_at: null,
  },
  {
    ...base,
    id: "demo-pricing",
    text: "Early customers keep the introductory price for one year.",
    page: "wiki/pricing.md",
    line: 4,
    authority: "decision",
    verified_at: "2026-10-30",
  },
];
const page = `# Project decisions

## Release

The launch is on **Tuesday**. The final review is on Monday.

- Freeze the build on Friday
- Send the notes to early customers
- Confirm the date after review

## Pricing

Early customers keep the introductory price for one year.
`;
export async function mockBrainRequest(input: BrainRequest): Promise<BrainResponse> {
  switch (input.operation) {
    case "brains":
      return {
        brains: [
          { id: "example/notes", repo: "example/notes" },
          { id: "example/research", repo: "example/research" },
        ],
      };
    case "search":
      return { claims };
    case "claim":
      return { claim: claims[0], nearby: claims.slice(1, 2) };
    case "explain":
      return {
        claim: claims.find((row) => row.id === input.claim_id) ?? claims[0],
        sources: [{ path: "sources/launch-review.md", origin: "Release review, 17 November" }],
        replaces: [{ old_claim_id: "demo-old-date", text: "The launch is on Monday.", page_path: base.page }],
      };
    case "overview":
      return {
        pages: [{ path: "wiki/decisions.md" }, { path: "wiki/pricing.md" }, { path: "wiki/research.md" }],
      };
    case "page":
      return { path: input.path, text: page, url: base.url };
    case "files":
      return {
        files: [
          { path: "inputs/2026-11-17-review.md", size: 2100, last_modified: "2026-11-17" },
          { path: "inputs/2026-11-02-price-list.xlsx", size: 48200, last_modified: "2026-11-02" },
        ],
        next_cursor: null,
      };
    case "file":
      return { text: "Launch review\n\nAll release checks must pass.", download_url: "https://example.com/review.md" };
    case "sessions":
      return {
        sessions: [
          {
            id: "demo-chat",
            source: "codex",
            title: "Review the release plan",
            started_at: "2026-11-17",
            snippet: "The final review is on Monday. The launch is on Tuesday.",
          },
          { id: "demo-chat-2", source: "claude", title: "Draft the pricing note", started_at: "2026-11-02" },
        ],
      };
    case "session":
      return {
        session: {
          id: input.session,
          title: "Review the release plan",
          turns: [
            { role: "user", text: "What remains before the release?" },
            { role: "assistant", text: "The final review is on Monday. The launch is on Tuesday." },
          ],
        },
      };
    case "addFile":
      return {};
    case "remember":
    case "update":
    case "forget":
      return {
        mode: "pull_request",
        recorded: false,
        pull_request: { url: "https://github.com/example/notes/pull/1" },
      };
  }
}

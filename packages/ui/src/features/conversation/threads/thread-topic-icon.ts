export type ThreadTopicIconKind =
  | "bug"
  | "chart"
  | "launch"
  | "users"
  | "search"
  | "design"
  | "code"
  | "mail"
  | "plan"
  | "sales"
  | "web"
  | "book"
  | "idea"
  | "document"
  | "default";

const TOPIC_RULES: ReadonlyArray<{ kind: ThreadTopicIconKind; pattern: RegExp }> = [
  {
    kind: "bug",
    pattern: /\b(bug|bugs|fix|fixes|fixed|broken|crash|error|errors|debug|debugging|issue|issues|hotfix)\b/i,
  },
  {
    kind: "chart",
    pattern: /\b(budget|pricing|metrics|revenue|analytics|forecast|q[1-4]|growth|stats|kpi|spend|cost|finance)\b/i,
  },
  {
    kind: "launch",
    pattern: /\b(launch|marketing|campaign|ads|social|post|posts|announcement|demo|pitch|release|ship)\b/i,
  },
  {
    kind: "users",
    pattern: /\b(hiring|hire|team|interview|interviews|candidate|candidates|onboarding|people|hr|meeting|meetings)\b/i,
  },
  {
    kind: "search",
    pattern:
      /\b(scan|research|audit|competitor|competitors|review|analyze|analysis|investigate|benchmark|benchmarks)\b/i,
  },
  {
    kind: "design",
    pattern: /\b(design|mockup|mockups|ui|ux|css|layout|theme|brand|logo|video|visual|animation|sidebar|icon|icons)\b/i,
  },
  {
    kind: "code",
    pattern:
      /\b(code|api|build|refactor|test|tests|pr|branch|feature|implement|migration|backend|frontend|script|cli)\b/i,
  },
  { kind: "mail", pattern: /\b(email|emails|mail|outreach|follow-?up|newsletter|reply|cold|inbox)\b/i },
  {
    kind: "plan",
    pattern: /\b(plan|roadmap|schedule|sprint|deadline|calendar|routine|reminder|checklist|timeline|milestone)\b/i,
  },
  { kind: "sales", pattern: /\b(sales|client|clients|proposal|deal|deals|contract|agency|lead|leads|pipeline)\b/i },
  { kind: "web", pattern: /\b(site|website|web|landing|domain|seo|deploy|url|links|page)\b/i },
  {
    kind: "book",
    pattern: /\b(study|read|reading|paper|papers|guide|learn|learning|summary|notes|docs|documentation)\b/i,
  },
  { kind: "idea", pattern: /\b(idea|ideas|brainstorm|prompt|prompts|agent|agents|ai|prototype|experiment)\b/i },
  { kind: "document", pattern: /\b(copy|draft|drafts|spec|report|write|writing|brief|headline|article|blog)\b/i },
];

/**
 * Picks a deterministic monochrome topic icon for an idle thread from its title.
 * Live thread states (working, waiting, queued, unread) take precedence in ThreadTabIcon.
 */
export function pickThreadTopicIcon(title: string | undefined): ThreadTopicIconKind {
  const trimmed = title?.trim();
  if (!trimmed) return "default";
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(trimmed)) return rule.kind;
  }
  return "default";
}

import { expandAttachmentReferences } from "@pokebots/contracts/attachment-references";
import { INPUT_LIMITS } from "@pokebots/contracts/input-limits";

const TITLE_PROMPT_MAX_CHARS = 800;

/**
 * Strips common markdown syntax (links, images, emphasis, inline code, headings, quotes, list
 * prefixes) from a single line so instant fallback titles and parsed AI titles stay plain text.
 */
function stripMarkdownLine(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)+/, "")
    .replace(/(`{1,3})([^`]+)\1/g, "$2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$|[.,!?;:])/g, "$1$2")
    .replace(/(^|\s)_([^_\s][^_]*?)_(?=\s|$|[.,!?;:])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateTitle(text: string): string {
  return text.length > INPUT_LIMITS.agentTaskTitle ? `${text.slice(0, INPUT_LIMITS.agentTaskTitle - 1)}…` : text;
}

/** The first clean line of the text, cut to the title limit. An attachment reference shows as its file name. */
export function taskTitle(text: string): string {
  const expanded = expandAttachmentReferences(text);
  const line =
    expanded
      .split("\n")
      .map(stripMarkdownLine)
      .find((part) => part.length > 0) ?? "";
  return truncateTitle(line);
}

/** Builds a short, single-turn prompt for generating a concise session title from the first user message. */
export function buildTaskTitlePrompt(userMessage: string): string {
  const expanded = expandAttachmentReferences(userMessage).trim();
  const excerpt = expanded.length > TITLE_PROMPT_MAX_CHARS ? `${expanded.slice(0, TITLE_PROMPT_MAX_CHARS)}…` : expanded;
  return [
    "Write a concise 3 to 6 word title summarizing the user's request below.",
    "Rules:",
    "- Use the same language as the user's request.",
    "- Output only the title as plain text.",
    "- No quotes, no markdown, no prefixes like 'Title:', and no trailing period.",
    "",
    "User request:",
    excerpt,
  ].join("\n");
}

/** Cleans and validates a model-generated session title, returning null if unusable. */
export function parseGeneratedTaskTitle(raw: string): string | null {
  const firstLine =
    raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  if (!firstLine) return null;
  const cleaned = stripMarkdownLine(firstLine)
    .replace(/^title\s*:\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return truncateTitle(cleaned);
}

/** True when an auto-generated title still looks like a raw first message rather than a short AI title. */
export function looksLikeRawTaskTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (taskTitle(trimmed) !== trimmed) return true;
  if (/[`*_[\]]|https?:\/\//i.test(trimmed)) return true;
  if (trimmed.endsWith("…") || trimmed.endsWith("...")) return true;
  if (trimmed.length > 52) return true;
  return trimmed.split(/\s+/).length > 7;
}

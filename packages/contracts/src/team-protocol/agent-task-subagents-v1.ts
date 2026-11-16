import { isConversationSnapshot } from "../ipc-conversations";
import { isDynamicRecord } from "../runtime-values";
import { AGENT_TASKS_ROUTES } from "./agent-tasks-v1";
import { AGENT_THREAD_PAGES_ROUTES } from "./agent-thread-pages-v1";
import type { OptionalTeamEvent } from "./optional-events";
import { withConversationSubagents } from "./subagents-v1";
import type { TeamProtocolV2Json } from "./v2";

/**
 * Frozen optional agent-task-subagents-v1 contract: the subagents that an agent started in a turn of
 * a task conversation, so that a client shows a background subagent of a side thread while it works.
 * It adds `subagents`, as subagents-v1 sends it on an agent page, with the same normalization and wire
 * budget, beside the frozen keys of a message in:
 *
 * - the response of `POST /v1/agent-tasks/read`;
 * - the `conversation` of the response of `POST /v1/agent-threads/read-older` (agent-thread-pages-v1);
 * - the `snapshot` of an `agent-task-conversation` event.
 *
 * The host adds it only for a client that advertises this capability and agent-tasks-v1, so the wire
 * of every released client stays as it was. Such a client reads the message as its fallback: a
 * `subagents` message whose text lists the subagents by title. A host without the capability never
 * sends `subagents`, so a client accepts it whenever it is present. A present list that
 * `isConversationSubagents` refuses fails closed. Widening any of it needs a second capability string.
 */
export const AGENT_TASK_SUBAGENTS_CAPABILITY = "agent-task-subagents-v1";

/** `projected`, the optional-route response of `path`, with the subagents of `source` on a task read or page. */
export function withAgentTaskSubagents(
  path: string,
  projected: TeamProtocolV2Json,
  source: unknown,
): TeamProtocolV2Json {
  const pathname = new URL(path, "http://openbot.invalid").pathname;
  if (pathname === AGENT_TASKS_ROUTES.read) return withConversationSubagents(projected, source);
  if (pathname !== AGENT_THREAD_PAGES_ROUTES.readOlder || !isDynamicRecord(projected) || !isDynamicRecord(source))
    return projected;
  const conversation = projected.conversation;
  if (conversation === undefined) return projected;
  return { ...projected, conversation: withConversationSubagents(conversation, source.conversation) };
}

/** `event`, as agent-tasks-v1 decodes it, with the subagents of the task conversation in `source`. */
export function withAgentTaskEventSubagents(event: OptionalTeamEvent, source: unknown): OptionalTeamEvent {
  if (event.type !== "agent-task-conversation" || !isDynamicRecord(source)) return event;
  const projected: TeamProtocolV2Json = JSON.parse(JSON.stringify(event.snapshot));
  const snapshot = withConversationSubagents(projected, source.snapshot);
  if (!isConversationSnapshot(snapshot)) throw new Error("Invalid agent task conversation event.");
  return { ...event, snapshot };
}

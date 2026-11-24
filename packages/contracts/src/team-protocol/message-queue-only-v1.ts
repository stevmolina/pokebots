// Frozen optional message-queue-only-v1 contract.
// A member with chat access can send one message that waits in the agent's queue instead of
// steering into a running turn, even when the agent's busy-message mode is `steer` (Cmd+Enter).
// The optional taskId selects an existing side thread.
import {
  type AdminDecoder,
  boolean,
  fields,
  identifier,
  list,
  nullable,
  type OptionalRouteCodec,
  string,
} from "./admin-wire";
import { AGENT_TASKS_CODECS, AGENT_TASKS_ROUTES } from "./agent-tasks-v1";

export const MESSAGE_QUEUE_ONLY_CAPABILITY = "message-queue-only-v1";
export const MESSAGE_QUEUE_ONLY_ROUTE = "/v1/messages/queue-only";

const timezone: AdminDecoder = (value) => {
  const decoded = string(128)(value);
  if (typeof decoded !== "string") throw new Error("Invalid message timezone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: decoded });
  } catch {
    throw new Error("Invalid message timezone.");
  }
  return decoded;
};

const receipt = AGENT_TASKS_CODECS.get(AGENT_TASKS_ROUTES.send)?.response;
if (!receipt) throw new Error("Missing task receipt codec.");

export const MESSAGE_QUEUE_ONLY_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [
    MESSAGE_QUEUE_ONLY_ROUTE,
    {
      request: fields(
        { agentId: identifier, text: string(100_000), attachmentDraftIds: list(identifier, 10) },
        {
          taskId: identifier,
          replyToMessageId: nullable(identifier),
          clientMessageId: identifier,
          timezone,
          createArtifact: boolean,
        },
      ),
      response: receipt,
    },
  ],
]);

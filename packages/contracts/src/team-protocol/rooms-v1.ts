// Frozen rooms-v1. Only owners and admins can use the host MCP Rooms account.
// The response projects display fields; it never forwards credentials or API guidance.
import {
  adminRoute,
  boolean,
  count,
  fields,
  identifier,
  list,
  nullable,
  type OptionalRouteCodec,
  oneOf,
  string,
  variant,
} from "./admin-wire";
export const ROOMS_CAPABILITY = "rooms-v1";
export const ROOMS_ROUTE = "/v1/admin/rooms";
const room = fields(
  { id: string(128), name: string(100), notice: string(2000), paused: boolean, role: nullable(string(64)) },
  { unread: count, needs_you: count },
);
const message = fields({
  id: count,
  thread: nullable(count),
  author: string(256),
  kind: string(64),
  body: string(10000),
  mentions: list(string(256), 100),
  at: nullable(string(64)),
});
const memory = fields({ version: count, about: string(1000), decided: string(1000), open: string(1000) });
const agent = fields({ label: string(256), status: nullable(string(64)), status_note: nullable(string(500)) });
const task = fields({
  id: count,
  title: string(200),
  status: string(64),
  claimed_by: nullable(string(256)),
  blocked_reason: nullable(string(500)),
  mine: boolean,
});
const request = variant({
  list: fields({ kind: oneOf("list") }),
  create: fields({ kind: oneOf("create"), name: string(100), notice: string(2000) }),
  join: fields({ kind: oneOf("join"), invite: string(2048) }),
  detail: fields({ kind: oneOf("detail"), roomId: identifier }),
  read: fields({ kind: oneOf("read"), roomId: identifier, since: count }, { thread: count }),
  wait: fields({ kind: oneOf("wait"), roomId: identifier, since: count }),
  send: fields({ kind: oneOf("send"), roomId: identifier, body: string(10000) }, { thread: count }),
  memory: fields({
    kind: oneOf("memory"),
    roomId: identifier,
    about: string(1000),
    decided: string(1000),
    open: string(1000),
    base_version: count,
  }),
  invite: fields({ kind: oneOf("invite"), roomId: identifier }),
  resume: fields({ kind: oneOf("resume"), roomId: identifier }),
  "task-create": fields({ kind: oneOf("task-create"), roomId: identifier, title: string(200) }),
  "task-action": fields({
    kind: oneOf("task-action"),
    roomId: identifier,
    taskId: count,
    action: oneOf("claim", "renew", "done", "block", "release"),
    reason: string(500),
  }),
});
const response = fields(
  { connected: boolean },
  {
    rooms: list(room, 500),
    room,
    messages: list(message, 100),
    memory: nullable(memory),
    agents: list(agent, 500),
    tasks: list(task, 500),
    invite: string(2048),
  },
);
export const ROOMS_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [ROOMS_ROUTE, adminRoute(request, response)],
]);

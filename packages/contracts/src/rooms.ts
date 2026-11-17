/** Rooms uses the host's existing MCP account. No credential crosses this contract. */
export interface RoomSummary {
  id: string;
  name: string;
  notice: string;
  paused: boolean;
  role: string | null;
  unread?: number;
  needs_you?: number;
}
export interface RoomMessage {
  id: number;
  thread: number | null;
  author: string;
  kind: string;
  body: string;
  mentions: readonly string[];
  at: string | null;
}
export interface RoomMemory {
  version: number;
  about: string;
  decided: string;
  open: string;
}
export interface RoomAgent {
  label: string;
  status: string | null;
  status_note: string | null;
}
export interface RoomTask {
  id: number;
  title: string;
  status: string;
  claimed_by: string | null;
  blocked_reason: string | null;
  mine: boolean;
}
export interface RoomsResult {
  connected: boolean;
  rooms?: readonly RoomSummary[];
  room?: RoomSummary;
  messages?: readonly RoomMessage[];
  memory?: RoomMemory | null;
  agents?: readonly RoomAgent[];
  tasks?: readonly RoomTask[];
  invite?: string;
}
export type RoomsRequest =
  | { kind: "list" }
  | { kind: "create"; name: string; notice: string }
  | { kind: "join"; invite: string }
  | { kind: "read"; roomId: string; since: number; thread?: number }
  | { kind: "wait"; roomId: string; since: number }
  | { kind: "send"; roomId: string; body: string; thread?: number }
  | { kind: "memory"; roomId: string; about: string; decided: string; open: string; base_version: number }
  | { kind: "detail" | "invite" | "resume"; roomId: string }
  | { kind: "task-create"; roomId: string; title: string }
  | {
      kind: "task-action";
      roomId: string;
      taskId: number;
      action: "claim" | "renew" | "done" | "block" | "release";
      reason: string;
    };
export type RoomsPort = (request: RoomsRequest) => Promise<RoomsResult>;

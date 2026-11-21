import type { RoomAgent, RoomMemory, RoomMessage, RoomSummary, RoomsResult, RoomTask } from "@pokebots/contracts/rooms";
import { isDynamicRecord } from "@pokebots/contracts/runtime-values";

const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown): v is string | null => v === null || text(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const room = (v: unknown): v is RoomSummary =>
  isDynamicRecord(v) &&
  text(v.id) &&
  text(v.name) &&
  text(v.notice) &&
  typeof v.paused === "boolean" &&
  nullableText(v.role) &&
  (v.unread === undefined || count(v.unread)) &&
  (v.needs_you === undefined || count(v.needs_you));
const message = (v: unknown): v is RoomMessage =>
  isDynamicRecord(v) &&
  count(v.id) &&
  (v.thread === null || count(v.thread)) &&
  text(v.author) &&
  text(v.kind) &&
  text(v.body) &&
  Array.isArray(v.mentions) &&
  v.mentions.every(text) &&
  nullableText(v.at);
const memory = (v: unknown): v is RoomMemory =>
  isDynamicRecord(v) && count(v.version) && text(v.about) && text(v.decided) && text(v.open);
const agent = (v: unknown): v is RoomAgent =>
  isDynamicRecord(v) && text(v.label) && nullableText(v.status) && nullableText(v.status_note);
const task = (v: unknown): v is RoomTask =>
  isDynamicRecord(v) &&
  count(v.id) &&
  text(v.title) &&
  text(v.status) &&
  nullableText(v.claimed_by) &&
  nullableText(v.blocked_reason) &&
  typeof v.mine === "boolean";
function list<T>(v: unknown, guard: (v: unknown) => v is T): T[] {
  if (!Array.isArray(v) || v.length > 500 || !v.every(guard)) throw new Error("Invalid Rooms list.");
  return v;
}
export function decodeRoomsResultFromMain(value: unknown): RoomsResult {
  if (!isDynamicRecord(value) || typeof value.connected !== "boolean") throw new Error("Invalid Rooms result.");
  const result: RoomsResult = { connected: value.connected };
  if (value.rooms !== undefined) result.rooms = list(value.rooms, room);
  if (value.messages !== undefined) result.messages = list(value.messages, message);
  if (value.agents !== undefined) result.agents = list(value.agents, agent);
  if (value.tasks !== undefined) result.tasks = list(value.tasks, task);
  if (value.room !== undefined) {
    if (!room(value.room)) throw new Error("Invalid Rooms room.");
    result.room = value.room;
  }
  if (value.memory !== undefined) {
    if (value.memory !== null && !memory(value.memory)) throw new Error("Invalid Rooms memory.");
    result.memory = value.memory;
  }
  if (value.invite !== undefined) {
    if (!text(value.invite) || !value.invite.startsWith("https://rooms.mcpbox.dev/join/"))
      throw new Error("Invalid Rooms invite.");
    result.invite = value.invite;
  }
  return result;
}

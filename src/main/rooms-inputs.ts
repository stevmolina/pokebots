import type { RoomsRequest } from "@pokebots/contracts/rooms";
import { Schema } from "effect";

const roomId = Schema.String.check(Schema.isPattern(/^r_[a-zA-Z0-9_-]{1,128}$/));
const text = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const request = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("list") }),
  Schema.Struct({ kind: Schema.Literal("create"), name: text(100), notice: text(2000) }),
  Schema.Struct({ kind: Schema.Literal("join"), invite: text(2048) }),
  Schema.Struct({ kind: Schema.Literal("read"), roomId, since: count, thread: Schema.optional(count) }),
  Schema.Struct({ kind: Schema.Literal("wait"), roomId, since: count }),
  Schema.Struct({ kind: Schema.Literal("send"), roomId, body: text(10000), thread: Schema.optional(count) }),
  Schema.Struct({
    kind: Schema.Literal("memory"),
    roomId,
    about: text(1000),
    decided: text(1000),
    open: text(1000),
    base_version: count,
  }),
  Schema.Struct({ kind: Schema.Literals(["detail", "invite", "resume"]), roomId }),
  Schema.Struct({ kind: Schema.Literal("task-create"), roomId, title: text(200) }),
  Schema.Struct({
    kind: Schema.Literal("task-action"),
    roomId,
    taskId: count,
    action: Schema.Literals(["claim", "renew", "done", "block", "release"]),
    reason: text(500),
  }),
]);
export function decodeRoomsRequest(value: unknown): RoomsRequest {
  return Schema.decodeUnknownSync(request)(value);
}

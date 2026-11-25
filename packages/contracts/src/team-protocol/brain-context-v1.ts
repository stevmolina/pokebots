// Frozen optional brain-context-v1 wire contract.
//
// What it grants, recorded here because freezing it makes it permanent: an owner or admin of a
// server can read and set "Start chats with brain context" of the host. On, the host asks the
// Second Brain connection of an agent for context about the first message of a new chat and adds the
// answer to that turn's prompt. The routes carry only the switch, never brain content. A member
// cannot use either route; `requireAdmin` on the host is the only gate. Widening any of it needs a
// second capability string.
import type { BrainContextSetting } from "../ipc-brain-context";
import { isBoolean, isDynamicRecord } from "../runtime-values";
import { adminRoute, boolean, empty, fields, type OptionalRouteCodec } from "./admin-wire";

export const BRAIN_CONTEXT_CAPABILITY = "brain-context-v1";

export const BRAIN_CONTEXT_ROUTES = {
  settings: "/v1/admin/host/brain-context",
  update: "/v1/admin/host/brain-context/update",
} as const;

const snapshot = fields({ enabled: boolean });

export const BRAIN_CONTEXT_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [BRAIN_CONTEXT_ROUTES.settings, adminRoute(empty, snapshot)],
  [BRAIN_CONTEXT_ROUTES.update, adminRoute(snapshot, snapshot)],
]);

/** The setting that a host answers, as the client type. */
export function decodeBrainContextResponse(value: unknown): BrainContextSetting {
  if (!isDynamicRecord(value) || !isBoolean(value.enabled)) throw new Error("Invalid brain context setting.");
  return { enabled: value.enabled };
}

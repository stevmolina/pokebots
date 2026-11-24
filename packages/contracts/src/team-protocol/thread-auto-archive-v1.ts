// Frozen optional thread-auto-archive-v1 wire contract. Keep IPC types and limits out of this file.
//
// What it grants, recorded here because freezing it makes it permanent: an owner or admin of a
// server reads and sets when its host archives the side threads of its agents by itself.
// - `idleDays` (0, 1, 3 or 7): archive a thread with no activity for this many days. 0 is off.
// - `mergedPullRequests`: archive an idle thread when every GitHub pull request that its messages link
//   is merged or closed.
// The host never archives a thread that runs a turn or has a queued message, and an archived thread
// can be restored. An update sets both fields. A member cannot use either route; `requireAdmin` on the
// host is the only gate. Widening any of it needs a second capability string.
import { type AdminDecoder, adminRoute, boolean, empty, fields, type OptionalRouteCodec } from "./admin-wire";

export const THREAD_AUTO_ARCHIVE_CAPABILITY = "thread-auto-archive-v1";

export const THREAD_AUTO_ARCHIVE_ROUTES = {
  settings: "/v1/admin/host/thread-auto-archive",
  update: "/v1/admin/host/thread-auto-archive/update",
} as const;

const idleDays: AdminDecoder = (value) => {
  if (value !== 0 && value !== 1 && value !== 3 && value !== 7) throw new Error("Invalid idle time.");
  return value;
};
const setting = fields({ idleDays, mergedPullRequests: boolean });

export const THREAD_AUTO_ARCHIVE_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [THREAD_AUTO_ARCHIVE_ROUTES.settings, adminRoute(empty, setting)],
  [THREAD_AUTO_ARCHIVE_ROUTES.update, adminRoute(setting, setting)],
]);

import { parseThreadAutoArchiveSetting, type ThreadAutoArchiveSetting } from "@openbot/contracts/ipc";
import {
  THREAD_AUTO_ARCHIVE_CAPABILITY,
  THREAD_AUTO_ARCHIVE_ROUTES,
} from "@openbot/contracts/team-protocol/thread-auto-archive-v1";
import { sourceText } from "@openbot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAdmin } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin } from "./request-helpers";

/**
 * When this computer archives the side threads of its agents by itself, read and set from a joined
 * server. Only an owner or admin can read or change it. Frozen by `thread-auto-archive-v1`.
 */
export async function routeThreadAutoArchive(
  context: TeamApiRequestContext,
  admin: TeamApiAdmin | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (
    method !== "POST" ||
    (url.pathname !== THREAD_AUTO_ARCHIVE_ROUTES.settings && url.pathname !== THREAD_AUTO_ARCHIVE_ROUTES.update)
  )
    return "unmatched";
  const setting = admin?.threadAutoArchive;
  if (!setting || !capabilities.has(THREAD_AUTO_ARCHIVE_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.threadAutoArchiveUnsupported"));
  requireAdmin(member);
  // `readJson` has already run the body through the thread-auto-archive wire codec.
  const body = await readJson(request);
  if (url.pathname === THREAD_AUTO_ARCHIVE_ROUTES.settings) return json(200, setting.get());
  let input: ThreadAutoArchiveSetting;
  try {
    input = parseThreadAutoArchiveSetting(body);
  } catch {
    throw new HttpError(400, sourceText("error.team.threadAutoArchiveInvalid"));
  }
  return json(200, await runCauseEffect(setting.set(input)));
}

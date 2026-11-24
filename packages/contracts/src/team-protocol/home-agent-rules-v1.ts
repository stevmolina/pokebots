// Frozen optional home-agent-rules-v1 wire contract.
//
// What it grants, recorded here because freezing it makes it permanent: an owner or admin of a
// server can read and set the host-level opt-in for selected Markdown rule files under
// `~/.agents/rules` on that host. The read route returns the enabled flag, selected file names, and
// the Markdown file names currently present under `~/.agents/rules` on the host. The update route
// saves the enabled flag and selected file names, and returns the updated setting snapshot. Neither
// route carries file contents. A member cannot use either route; `requireAdmin` on the host is the
// only gate. Widening any of it needs a second capability string.
import { decodeHomeAgentRulesSetting, type HomeAgentRulesSetting } from "../ipc-home-agent-rules";
import { adminRoute, boolean, empty, fields, list, type OptionalRouteCodec, string } from "./admin-wire";

export const HOME_AGENT_RULES_CAPABILITY = "home-agent-rules-v1";

export const HOME_AGENT_RULES_ROUTES = {
  settings: "/v1/admin/host/home-agent-rules",
  update: "/v1/admin/host/home-agent-rules/update",
} as const;

const ruleFileNames = list(string(128), 64);
const updateBody = fields({ enabled: boolean, files: ruleFileNames });
const snapshot = fields({ enabled: boolean, files: ruleFileNames, availableFiles: ruleFileNames });

export const HOME_AGENT_RULES_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [HOME_AGENT_RULES_ROUTES.settings, adminRoute(empty, snapshot)],
  [HOME_AGENT_RULES_ROUTES.update, adminRoute(updateBody, snapshot)],
]);

/**
 * The setting that a host answers, as the client type. It is not the preload decoder: the two check
 * different senders.
 */
export function decodeHomeAgentRulesResponse(value: unknown): HomeAgentRulesSetting {
  return decodeHomeAgentRulesSetting(value);
}

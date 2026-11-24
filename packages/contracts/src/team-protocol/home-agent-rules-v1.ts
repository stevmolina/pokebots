// Frozen optional contract. The server owner can read the opt-in and the availability
// of the two supported files, and change the opt-in and selection. The host sends only
// names and flags. Any change to the allowed files or access needs a new capability.
import type { HomeAgentRulesSetting } from "../ipc-home-agent-rules";
import { isDynamicRecord } from "../runtime-values";
import { adminRoute, boolean, empty, fields, list, oneOf, type OptionalRouteCodec } from "./admin-wire";

export const HOME_AGENT_RULES_CAPABILITY = "home-agent-rules-v1";

export const HOME_AGENT_RULES_ROUTES = {
  settings: "/v1/admin/host/home-agent-rules",
  update: "/v1/admin/host/home-agent-rules/update",
} as const;

const ruleFileNames = list(oneOf("agents.md", "proof.md"), 2);
const updateBody = fields({ enabled: boolean, files: ruleFileNames });
const snapshot = fields({ enabled: boolean, files: ruleFileNames, availableFiles: ruleFileNames });

export const HOME_AGENT_RULES_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [HOME_AGENT_RULES_ROUTES.settings, adminRoute(empty, snapshot)],
  [HOME_AGENT_RULES_ROUTES.update, adminRoute(updateBody, snapshot)],
]);

export function decodeHomeAgentRulesResponse(value: unknown): HomeAgentRulesSetting {
  if (!isDynamicRecord(value) || typeof value.enabled !== "boolean") throw new Error("Invalid home agent rules.");
  return { enabled: value.enabled, files: decodeFiles(value.files), availableFiles: decodeFiles(value.availableFiles) };
}

function decodeFiles(value: unknown): HomeAgentRulesSetting["files"] {
  if (!Array.isArray(value) || value.length > 2) throw new Error("Invalid home agent rule file list.");
  return value.map((file) => {
    if (file !== "agents.md" && file !== "proof.md") throw new Error("Invalid home agent rule file.");
    return file;
  });
}

// Frozen optional contract. The same opt-in as `home-agent-rules-v1`, with five allowed files
// instead of two. A host that serves this capability also serves v1: a v1 client sees only the
// v1 files, and its update keeps the v2-only selection. Any change to the allowed files or
// access needs a new capability.
import type { HomeAgentRulesSetting } from "../ipc-home-agent-rules";
import { isDynamicRecord } from "../runtime-values";
import { adminRoute, boolean, empty, fields, list, type OptionalRouteCodec, oneOf } from "./admin-wire";

export const HOME_AGENT_RULES_V2_CAPABILITY = "home-agent-rules-v2";

export const HOME_AGENT_RULES_V2_ROUTES = {
  settings: "/v2/admin/host/home-agent-rules",
  update: "/v2/admin/host/home-agent-rules/update",
} as const;

const V2_FILES = ["approval.md", "writing.md", "brain.md", "agents.md", "proof.md"] as const;
const ruleFileNames = list(oneOf(...V2_FILES), V2_FILES.length);
const updateBody = fields({ enabled: boolean, files: ruleFileNames });
const snapshot = fields({ enabled: boolean, files: ruleFileNames, availableFiles: ruleFileNames });

export const HOME_AGENT_RULES_V2_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [HOME_AGENT_RULES_V2_ROUTES.settings, adminRoute(empty, snapshot)],
  [HOME_AGENT_RULES_V2_ROUTES.update, adminRoute(updateBody, snapshot)],
]);

export function decodeHomeAgentRulesV2Response(value: unknown): HomeAgentRulesSetting {
  if (!isDynamicRecord(value) || typeof value.enabled !== "boolean") throw new Error("Invalid home agent rules.");
  return { enabled: value.enabled, files: decodeFiles(value.files), availableFiles: decodeFiles(value.availableFiles) };
}

function decodeFiles(value: unknown): HomeAgentRulesSetting["files"] {
  if (!Array.isArray(value) || value.length > V2_FILES.length) throw new Error("Invalid home agent rule file list.");
  return value.map((file) => {
    const known = V2_FILES.find((name) => name === file);
    if (!known) throw new Error("Invalid home agent rule file.");
    return known;
  });
}

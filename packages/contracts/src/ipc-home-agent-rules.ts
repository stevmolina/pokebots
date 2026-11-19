import { isDynamicRecord, isOneOf } from "./runtime-values";

export const HOME_AGENT_RULE_FILES = ["agents.md", "proof.md"] as const;
export type HomeAgentRuleFile = (typeof HOME_AGENT_RULE_FILES)[number];

export interface HomeAgentRulesPreference {
  enabled: boolean;
  files: HomeAgentRuleFile[];
}

export interface HomeAgentRulesSetting extends HomeAgentRulesPreference {
  availableFiles: HomeAgentRuleFile[];
}

export const DEFAULT_HOME_AGENT_RULES_PREFERENCE: HomeAgentRulesPreference = {
  enabled: false,
  files: [],
};

export function parseHomeAgentRuleFiles(value: unknown): HomeAgentRuleFile[] {
  if (
    !Array.isArray(value) ||
    value.length > HOME_AGENT_RULE_FILES.length ||
    !value.every((file) => isOneOf(HOME_AGENT_RULE_FILES, file))
  )
    throw new Error("Invalid home agent rule file list.");
  return HOME_AGENT_RULE_FILES.filter((file) => value.includes(file));
}

export function parseHomeAgentRulesPreference(value: unknown): HomeAgentRulesPreference {
  if (!isDynamicRecord(value) || typeof value.enabled !== "boolean") {
    throw new Error("Invalid home agent rules setting.");
  }
  return { enabled: value.enabled, files: parseHomeAgentRuleFiles(value.files) };
}

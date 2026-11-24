import {
  type HomeAgentRulesSetting,
  parseHomeAgentRuleFiles,
  parseHomeAgentRulesPreference,
} from "@pokebots/contracts/ipc";
import { isDynamicRecord } from "@pokebots/contracts/runtime-values";

export function decodeHomeAgentRulesFromMain(value: unknown): HomeAgentRulesSetting {
  if (!isDynamicRecord(value)) throw new Error("Invalid home agent rules setting.");
  return { ...parseHomeAgentRulesPreference(value), availableFiles: parseHomeAgentRuleFiles(value.availableFiles) };
}

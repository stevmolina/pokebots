import {
  type HomeAgentRulesSetting,
  parseHomeAgentRuleFiles,
  parseHomeAgentRulesPreference,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

export function decodeHomeAgentRulesFromMain(value: unknown): HomeAgentRulesSetting {
  if (!isDynamicRecord(value)) throw new Error("Invalid home agent rules setting.");
  return { ...parseHomeAgentRulesPreference(value), availableFiles: parseHomeAgentRuleFiles(value.availableFiles) };
}

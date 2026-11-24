/**
 * Host-level opt-in for selected Markdown rule files under `~/.agents/rules`.
 * Off by default so a fresh host loads no extra personal rules until its owner or admin chooses
 * which files to include across providers.
 */

import { isBoolean, isDynamicRecord, isString } from "./runtime-values";

export const HOME_AGENT_RULES_MAX_FILES = 64;
export const HOME_AGENT_RULES_MAX_FILE_NAME_LENGTH = 128;

export interface HomeAgentRulesPreference {
  enabled: boolean;
  files: string[];
}

export interface HomeAgentRulesSetting extends HomeAgentRulesPreference {
  /** Markdown rule files currently present in `~/.agents/rules` on the host. */
  availableFiles: string[];
}

export const DEFAULT_HOME_AGENT_RULES_PREFERENCE: HomeAgentRulesPreference = {
  enabled: false,
  files: [],
};

export const DEFAULT_HOME_AGENT_RULES_SETTING: HomeAgentRulesSetting = {
  enabled: false,
  files: [],
  availableFiles: [],
};

const CONTROL_CHAR_PATTERN = /[\p{Cc}]/u;

export function isHomeAgentRuleFileName(value: string): boolean {
  if (!value || value.length > HOME_AGENT_RULES_MAX_FILE_NAME_LENGTH) return false;
  if (value.trim() !== value) return false;
  if (value.startsWith(".") || value === "." || value === "..") return false;
  if (value.includes("/") || value.includes("\\")) return false;
  if (CONTROL_CHAR_PATTERN.test(value)) return false;
  return /\.md$/iu.test(value);
}

export function normalizeHomeAgentRuleFiles(files: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const name of files) {
    if (!isHomeAgentRuleFileName(name)) continue;
    unique.add(name);
    if (unique.size >= HOME_AGENT_RULES_MAX_FILES) break;
  }
  return [...unique].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function decodeRuleFileList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > HOME_AGENT_RULES_MAX_FILES) {
    throw new Error(`Invalid ${label}.`);
  }
  const files: string[] = [];
  for (const item of value) {
    if (!isString(item) || !isHomeAgentRuleFileName(item)) {
      throw new Error(`Invalid ${label}.`);
    }
    files.push(item);
  }
  return normalizeHomeAgentRuleFiles(files);
}

export function parseHomeAgentRulesPreference(value: unknown): HomeAgentRulesPreference {
  if (!isDynamicRecord(value) || !isBoolean(value.enabled)) {
    throw new Error("Invalid home agent rules setting.");
  }
  return {
    enabled: value.enabled,
    files: decodeRuleFileList(value.files, "home agent rule file list"),
  };
}

export function decodeHomeAgentRulesSetting(value: unknown): HomeAgentRulesSetting {
  if (!isDynamicRecord(value) || !isBoolean(value.enabled)) {
    throw new Error("Invalid home agent rules setting.");
  }
  return {
    enabled: value.enabled,
    files: decodeRuleFileList(value.files, "home agent rule file list"),
    availableFiles: decodeRuleFileList(value.availableFiles, "available home agent rule files"),
  };
}

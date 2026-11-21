import {
  DEFAULT_HOME_AGENT_RULES_PREFERENCE,
  type HomeAgentRulesPreference,
  type HomeAgentRulesSetting,
  parseHomeAgentRulesPreference,
} from "@pokebots/contracts/ipc";
import { isDynamicRecord } from "@pokebots/contracts/runtime-values";
import { Effect } from "effect";
import { availableHomeAgentRules } from "../backend/home-agent-rules";
import { PreferenceStore } from "./preference-file";

export type HomeAgentRulesControl = ReturnType<typeof createHomeAgentRulesControl>;

export function createHomeAgentRulesControl(path: string, home?: string) {
  const store = new PreferenceStore({
    path,
    defaultValue: DEFAULT_HOME_AGENT_RULES_PREFERENCE,
    decode: (value) => {
      if (!isDynamicRecord(value) || value.version !== 1) return null;
      try {
        return parseHomeAgentRulesPreference(value);
      } catch {
        return null;
      }
    },
  });
  const get = Effect.fn("HomeAgentRules.settings")(function* (): Effect.fn.Return<HomeAgentRulesSetting> {
    return { ...store.get(), availableFiles: yield* availableHomeAgentRules(home) };
  });
  return {
    load: () => store.load(),
    preference: () => store.get(),
    get,
    set: Effect.fn("HomeAgentRules.update")(function* (preference: HomeAgentRulesPreference) {
      yield* store.set(preference);
      return yield* get();
    }),
  };
}

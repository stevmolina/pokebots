import { type BrainContextSetting, DEFAULT_BRAIN_CONTEXT } from "@pokebots/contracts/ipc";
import { isBoolean, isDynamicRecord } from "@pokebots/contracts/runtime-values";
import { Effect } from "effect";
import { PreferenceStore } from "./preference-file";

/**
 * Whether the agents of this computer start a new chat with Second Brain context. Read at the start of
 * each turn, so a change applies to the next new chat. A file without the switch reads as the default.
 */
export type BrainContextControl = ReturnType<typeof createBrainContextControl>;

export function createBrainContextControl(path: string) {
  const store = new PreferenceStore<BrainContextSetting>({
    path,
    defaultValue: DEFAULT_BRAIN_CONTEXT,
    decode: (parsed) =>
      isDynamicRecord(parsed) && parsed.version === 1 && isBoolean(parsed.enabled) ? { enabled: parsed.enabled } : null,
  });
  return {
    load: () => store.load(),
    get: () => store.get(),
    set: Effect.fn("BrainContext.set")(function* (enabled: boolean) {
      return yield* store.set({ enabled });
    }),
  };
}

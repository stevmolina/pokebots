import {
  DEFAULT_REMOTE_CONTROL_POLICY,
  isRemoteControlAccess,
  type RemoteControlPolicy,
} from "@pokebots/contracts/ipc";
import { isBoolean, isDynamicRecord } from "@pokebots/contracts/runtime-values";
import { PreferenceStore } from "./preference-file";

/**
 * Who may control this computer through remote desktop, and whether the person at this computer
 * must allow each session. The host reads it at each session request. A missing or unknown file reads
 * as every member without a question, which is how remote control worked before the setting existed.
 */
export type RemoteControlPolicyStore = PreferenceStore<RemoteControlPolicy>;

export function createRemoteControlPolicyStore(path: string): RemoteControlPolicyStore {
  return new PreferenceStore({
    path,
    defaultValue: DEFAULT_REMOTE_CONTROL_POLICY,
    decode: (parsed) =>
      isDynamicRecord(parsed) &&
      parsed.version === 1 &&
      isRemoteControlAccess(parsed.access) &&
      isBoolean(parsed.askOnHost)
        ? { access: parsed.access, askOnHost: parsed.askOnHost }
        : null,
  });
}

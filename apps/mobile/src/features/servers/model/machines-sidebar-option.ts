import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/**
 * Design options for where the machine switcher lives, now that home has no chip row.
 * A: a Machines section at the top of the drawer. B: the drawer header is a machine pill that
 * opens an inline list. C: a compact switcher at the bottom of the drawer that opens a sheet.
 * Only one ships; this switch keeps the three on one branch for review.
 */
export type MachinesSidebarOption = "A" | "B" | "C";

export const DEFAULT_MACHINES_SIDEBAR_OPTION: MachinesSidebarOption = "A";

const key = "openbot.mobile.machines-sidebar-option.v1";

export const useMachinesSidebarOption = create<{ option: MachinesSidebarOption }>(() => ({
  option: DEFAULT_MACHINES_SIDEBAR_OPTION,
}));

export function isMachinesSidebarOption(value: unknown): value is MachinesSidebarOption {
  return value === "A" || value === "B" || value === "C";
}

async function loadMachinesSidebarOption(): Promise<void> {
  if (!__DEV__) return;
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (isMachinesSidebarOption(stored)) useMachinesSidebarOption.setState({ option: stored });
  } catch {
    // The default option stays.
  }
}

/** Development only: `openbot://dev-machines-option?o=B` switches the option. */
export function setMachinesSidebarOption(option: MachinesSidebarOption): void {
  useMachinesSidebarOption.setState({ option });
  SecureStore.setItemAsync(key, option).catch(() => undefined);
}

void loadMachinesSidebarOption();

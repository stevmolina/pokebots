import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const key = "openbot.mobile.all-machines.v1";

/**
 * Whether home shows All machines: one list of the agents of every joined server, as the desktop
 * sidebar does. A server chip or a tile of the Machines grid opens one server again. The choice stays
 * on this phone, and home shows it only while the phone has two servers or more.
 */
export const useAllMachines = create<{ on: boolean; ready: boolean }>(() => ({ on: false, ready: false }));

export async function loadAllMachines(): Promise<void> {
  if (useAllMachines.getState().ready) return;
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (!useAllMachines.getState().ready) useAllMachines.setState({ on: stored === "true" });
  } catch {
    // A failed read opens one server, as on a new install.
  } finally {
    useAllMachines.setState({ ready: true });
  }
}

export function setAllMachines(on: boolean): void {
  useAllMachines.setState({ on, ready: true });
  SecureStore.setItemAsync(key, String(on)).catch(() => undefined);
}

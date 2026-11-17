import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { DESIGN_PREVIEW_ALLOWED } from "./preview-switch";

const key = "openbot.mobile.calm-look.v1";

/**
 * The "New design" switch of Settings > Appearance: the real chat list in the calm look of the design
 * preview. Off by default, and only in development builds and the Pokebots build. Off, home is exactly
 * as before.
 */
export const useCalmLookStore = create<{ on: boolean; ready: boolean; saving: boolean }>(() => ({
  on: false,
  ready: !DESIGN_PREVIEW_ALLOWED,
  saving: false,
}));

export async function loadCalmLook(): Promise<void> {
  if (useCalmLookStore.getState().ready) return;
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (!useCalmLookStore.getState().ready) useCalmLookStore.setState({ on: stored === "true" });
  } catch {
    // A failed read keeps the current home.
  } finally {
    useCalmLookStore.setState({ ready: true });
  }
}

export async function saveCalmLook(on: boolean): Promise<void> {
  if (!DESIGN_PREVIEW_ALLOWED || useCalmLookStore.getState().saving) return;
  // Applies at once, also when storage fails; Settings shows the error.
  useCalmLookStore.setState({ on, saving: true });
  try {
    await SecureStore.setItemAsync(key, String(on));
  } finally {
    useCalmLookStore.setState({ saving: false });
  }
}

/** Whether home draws the calm look. Always false in the store build. */
export function useCalmLook(): boolean {
  return useCalmLookStore((state) => DESIGN_PREVIEW_ALLOWED && state.on);
}

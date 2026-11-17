import * as SecureStore from "expo-secure-store";
import { createContext, useContext } from "react";
import { create } from "zustand";
import { APP_BRAND } from "@/shared/lib/app-brand";
import { DESIGN_PREVIEW_ALLOWED } from "./preview-switch";

const key = "openbot.mobile.calm-look.v1";

/**
 * The "New design" switch of Settings > Appearance: the real chat list in the calm look of the design
 * preview. Only in development builds and the Pokebots build. On by default in the Pokebots build,
 * off by default in development builds; a choice in Settings wins. Off, home is exactly as before.
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
    const on = stored === null ? APP_BRAND === "pokebots" : stored === "true";
    if (!useCalmLookStore.getState().ready) useCalmLookStore.setState({ on });
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

/**
 * The look that home decided for its rows: the calm look, unless the switch is off or home is the pane
 * of a wide window. Rows read it here, so the pane keeps the current rows, and a row does not subscribe
 * to the switch itself. Outside home it is false.
 */
export const CalmRowsContext = createContext(false);

/** Whether a home row draws the calm look. */
export function useCalmRows(): boolean {
  return useContext(CalmRowsContext);
}

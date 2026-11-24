import { createContext, useContext } from "react";
import type { PanGesture } from "react-native-gesture-handler";

export interface AppDrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
  openingGesture: PanGesture;
  /** Turns off the pan that opens the drawer, for a screen whose own horizontal pans need it. */
  setOpeningBlocked: (blocked: boolean) => void;
}

export const AppDrawerContext = createContext<AppDrawerContextValue | null>(null);

export function useAppDrawer(): AppDrawerContextValue {
  const value = useContext(AppDrawerContext);
  if (!value) throw new Error("useAppDrawer must be used within AppDrawerShell.");
  return value;
}

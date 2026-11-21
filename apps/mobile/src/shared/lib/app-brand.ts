import { POKEBOTS_HUE_COLORS } from "@pokebots/brand/pokebots-avatar";
import Constants from "expo-constants";
import { Uniwind } from "uniwind";

const extra = Constants.expoConfig?.extra;

export const APP_BRAND: "pokebots" | null = extra?.brand === "pokebots" ? "pokebots" : null;

// Older personal manifests have the brand but no build profile flag.
export const IS_POKEBOTS_PERSONAL_BUILD = APP_BRAND === "pokebots" && extra?.personalBuild !== false;

// Keep each build's account service until the A3 sign-in checks pass.
export const BRAND_ACCOUNT_API_URL: string | null = IS_POKEBOTS_PERSONAL_BUILD ? "https://api.pokebots.xyz" : null;

/** The Pokebots colors of the phone app: the brand blue for buttons, a light blue for the big block. */
export const POKEBOTS_BRAND = {
  /** Buttons, the sign-in actions and the app logo color. */
  accent: POKEBOTS_HUE_COLORS[215],
  onAccent: "#ffffff",
  /** The block of the splash and the sign-in screen: the brand blue at 20%, so the mascot stands out. */
  stage: "#d5e5fd",
  /** Text and the back button on the block. */
  onStage: "#0b1f3a",
} as const;

/** The mascot that takes the place of the eyes on the block: the Pokebots app icon. */
export const POKEBOTS_MARK = require("../../../assets/pokebots/mark.png");

/**
 * Gives the app the brand colors before the first screen. The logo color is a theme variable that
 * buttons, avatars and the block read, so changing it here changes all of them at once.
 */
export function applyAppBrand(): void {
  if (APP_BRAND !== "pokebots") return;
  for (const theme of ["light", "dark"] as const) {
    Uniwind.updateCSSVariables(theme, {
      "--openbot-logo-production": POKEBOTS_BRAND.accent,
      "--openbot-logo-eye": POKEBOTS_BRAND.onAccent,
    });
  }
}

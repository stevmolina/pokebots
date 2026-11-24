import type { PokebotsPortrait } from "@pokebots/brand/pokebots-avatar";

/** Shared by native views and PNG files for notifications and sharing. */
export const LANDING_PORTRAITS: Readonly<Record<PokebotsPortrait, number>> = {
  blue: require("@pokebots/brand/assets/pokebots/blue.webp"),
  mint: require("@pokebots/brand/assets/pokebots/mint.webp"),
  orange: require("@pokebots/brand/assets/pokebots/orange.webp"),
  purple: require("@pokebots/brand/assets/pokebots/purple.webp"),
};

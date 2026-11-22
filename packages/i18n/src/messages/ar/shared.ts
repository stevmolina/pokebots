import { messages as common } from "./common";
import { messages as format } from "./format";
import { messages as language } from "./language";
import { messages as rooms } from "./rooms";

/** Keys every surface uses. */
export const shared = {
  ...common,
  ...format,
  ...language,
  ...rooms,
} as const;

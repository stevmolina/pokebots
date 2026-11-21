import { isAvatarMimeType, isValidAvatarImage } from "@pokebots/contracts/avatar-images";
import type { AvatarImageInput } from "@pokebots/contracts/ipc";
import { isString } from "@pokebots/contracts/runtime-values";
import { sourceText } from "@pokebots/i18n/source";
import { isObject } from "./validation";

export function parseAvatarImage(value: unknown): AvatarImageInput | null {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !isString(value.mimeType) ||
    !isAvatarMimeType(value.mimeType) ||
    !(value.bytes instanceof Uint8Array) ||
    !isValidAvatarImage(value.mimeType, value.bytes)
  ) {
    throw new Error(sourceText("error.team.logoInvalid"));
  }
  return { mimeType: value.mimeType, bytes: value.bytes };
}

import type { AvatarColor } from "@pokebots/contracts/ipc";

export interface MessageColorPickerProps {
  value: AvatarColor;
  disabled: boolean;
  dark: boolean;
  /** A chosen color. It is not called for each frame of a drag. */
  onChange: (value: AvatarColor) => void;
}

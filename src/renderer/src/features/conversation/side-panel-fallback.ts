import type { SidePanelPane } from "@openbot/ui/features/conversation/SidePanel";

export type EmptySidePanelAction = "settings" | "launcher" | "close";

/**
 * Decides what the side panel should show when opened with no active tab.
 * Agent and channel chats open their settings/bot bar instead of the empty pane launcher.
 */
export function resolveDefaultSidePanelAction(hasSettingsTarget: boolean): "settings" | "launcher" {
  return hasSettingsTarget ? "settings" : "launcher";
}

/**
 * Decides what happens after the last tab in the side panel closes.
 * On a phone, or when the user closes the settings pane itself, the panel closes;
 * otherwise an agent/channel chat falls back to its settings/bot bar instead of the empty launcher.
 */
export function resolveEmptySidePanelAction(options: {
  phoneWeb: boolean;
  hasSettingsTarget: boolean;
  closedPane?: SidePanelPane | undefined;
}): EmptySidePanelAction {
  if (options.phoneWeb || options.closedPane === "settings") return "close";
  return resolveDefaultSidePanelAction(options.hasSettingsTarget);
}

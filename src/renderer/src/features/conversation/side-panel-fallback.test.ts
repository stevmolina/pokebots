import { describe, expect, it } from "vitest";
import { resolveDefaultSidePanelAction, resolveEmptySidePanelAction } from "./side-panel-fallback";

describe("side-panel fallback", () => {
  it("opens the bot/channel settings pane instead of the launcher when opening with no tabs", () => {
    expect(resolveDefaultSidePanelAction(true)).toBe("settings");
    expect(resolveDefaultSidePanelAction(false)).toBe("launcher");
  });

  it("falls back to settings when closing the last non-settings tab on desktop", () => {
    expect(resolveEmptySidePanelAction({ phoneWeb: false, hasSettingsTarget: true })).toBe("settings");
    expect(resolveEmptySidePanelAction({ phoneWeb: false, hasSettingsTarget: true, closedPane: "browser" })).toBe(
      "settings",
    );
    expect(resolveEmptySidePanelAction({ phoneWeb: false, hasSettingsTarget: true, closedPane: "files" })).toBe(
      "settings",
    );
  });

  it("closes the side panel when the user closes the settings pane itself or on phone web", () => {
    expect(resolveEmptySidePanelAction({ phoneWeb: false, hasSettingsTarget: true, closedPane: "settings" })).toBe(
      "close",
    );
    expect(resolveEmptySidePanelAction({ phoneWeb: true, hasSettingsTarget: true, closedPane: "browser" })).toBe(
      "close",
    );
    expect(resolveEmptySidePanelAction({ phoneWeb: true, hasSettingsTarget: true })).toBe("close");
  });

  it("keeps the launcher fallback only when there is no agent or channel target", () => {
    expect(resolveEmptySidePanelAction({ phoneWeb: false, hasSettingsTarget: false })).toBe("launcher");
  });
});

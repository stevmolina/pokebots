import { Stack } from "expo-router/stack";
import { useContext, useEffect } from "react";
import { useCSSVariable, useUniwind } from "uniwind";
import { setDesignPreview } from "@/features/design-preview/model/preview-switch";
import { previewColors } from "@/features/design-preview/model/preview-tokens";
import { isAndroid } from "@/shared/lib/platform";
import { SplashContentReadyContext } from "@/shared/lib/use-splash-gate";

// A link straight to a sheet (`openbot://design-preview/settings`) opens it over the list, as a tap does.
export const unstable_settings = { initialRouteName: "index" };

/** The sheets of the preview, with the options of the app's own sessions and message sheets. */
const SHEET = {
  headerShown: false,
  scrollEdgeEffects: { top: "hidden", bottom: "soft" },
  presentation: "formSheet",
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: false,
  // The page behind stays dimmed at every height, as in the reference.
  sheetLargestUndimmedDetentIndex: "none",
} as const;

// The first stop matches the reference: the sheet top at 404 pt on a 844 pt phone. iOS measures the
// detent below the status bar, so the fraction is 0.55, not 0.52.
const DETENTS = [0.55, 0.85];
// The model list is long, so its sheet has one tall stop.
const TALL = [0.85];
// Settings and the grid open as tall sheets, as in the reference: the page behind shows only above.
// Android puts a full-height sheet under the status bar, so it keeps the 0.85 stop (DESIGN.md).
const FULL = isAndroid ? [0.85] : [1];

export default function DesignPreviewLayout() {
  // Opening the preview, also from the link `openbot://design-preview`, turns the switch on, so the
  // next start opens it again. The profile menu of the preview turns it off.
  useEffect(() => setDesignPreview(true), []);
  // A start that opens the preview shows no sign-in screen, which is what reports the first screen
  // ready on a signed-out start. Without this report the splash stays up.
  const reportContentReady = useContext(SplashContentReadyContext);
  useEffect(() => reportContentReady(), [reportContentReady]);
  const sheetBackground = String(useCSSVariable("--openbot-bg-sheet"));
  const preview = previewColors(useUniwind().theme === "dark" ? "dark" : "light");
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="sessions"
        options={{ ...SHEET, contentStyle: { backgroundColor: sheetBackground }, sheetAllowedDetents: DETENTS }}
      />
      <Stack.Screen
        name="message-actions"
        options={{ ...SHEET, contentStyle: { backgroundColor: sheetBackground }, sheetAllowedDetents: DETENTS }}
      />
      <Stack.Screen
        name="model"
        options={{ ...SHEET, contentStyle: { backgroundColor: sheetBackground }, sheetAllowedDetents: TALL }}
      />
      <Stack.Screen
        name="settings"
        options={{
          ...SHEET,
          contentStyle: { backgroundColor: preview.sheetBackground },
          sheetGrabberVisible: false,
          sheetAllowedDetents: FULL,
        }}
      />
      <Stack.Screen
        name="grid"
        options={{
          ...SHEET,
          contentStyle: { backgroundColor: preview.background },
          sheetGrabberVisible: false,
          sheetAllowedDetents: FULL,
        }}
      />
      {/* Search opens in place over the list, as the reference does. */}
      <Stack.Screen name="search" options={{ animation: "fade", animationDuration: 180 }} />
    </Stack>
  );
}

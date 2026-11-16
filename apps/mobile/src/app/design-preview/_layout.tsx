import { Stack } from "expo-router/stack";
import { useEffect } from "react";
import { useCSSVariable } from "uniwind";
import { setDesignPreview } from "@/features/design-preview/model/preview-switch";

/** The sheets of the preview, with the options of the app's own sessions and message sheets. */
const SHEET = {
  headerShown: false,
  scrollEdgeEffects: { top: "hidden", bottom: "soft" },
  presentation: "formSheet",
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: false,
} as const;

export default function DesignPreviewLayout() {
  // Opening the preview, also from the link `openbot://design-preview`, turns the switch on, so the
  // next start opens it again. The profile menu of the preview turns it off.
  useEffect(() => setDesignPreview(true), []);
  const sheetBackground = String(useCSSVariable("--openbot-bg-sheet"));
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="sessions"
        options={{ ...SHEET, contentStyle: { backgroundColor: sheetBackground }, sheetAllowedDetents: [0.6, 0.85] }}
      />
      <Stack.Screen
        name="message-actions"
        options={{ ...SHEET, contentStyle: { backgroundColor: sheetBackground }, sheetAllowedDetents: [0.6, 0.85] }}
      />
    </Stack>
  );
}

import { Stack } from "expo-router/stack";
import { useEffect } from "react";
import { setDesignPreview } from "@/features/design-preview/model/preview-switch";

export default function DesignPreviewLayout() {
  // Opening the preview, also from the link `openbot://design-preview`, turns the switch on, so the
  // next start opens it again. The profile menu of the preview turns it off.
  useEffect(() => setDesignPreview(true), []);
  return <Stack screenOptions={{ headerShown: false }} />;
}

import { GlassView } from "expo-glass-effect";
import type { PropsWithChildren } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useUniwind } from "uniwind";
import { AvatarThumbnail } from "@/features/agents/components/bloub-avatar";
import { haptics } from "@/shared/lib/haptics";
import { useLiquidGlass } from "@/shared/lib/use-liquid-glass";
import type { PreviewAgent } from "../model/preview-data";
import { PREVIEW_FLOAT_SHADOW, type PreviewColors, previewColors, previewSize } from "../model/preview-tokens";

export function usePreviewColors(): PreviewColors {
  const { theme } = useUniwind();
  return previewColors(theme === "dark" ? "dark" : "light");
}

/** The agent's Pokebots face, drawn from its seed and hue like the real list. */
export function PreviewFace({ agent, size }: { agent: PreviewAgent; size: number }) {
  return <AvatarThumbnail seed={`design-preview:${agent.id}`} hue={agent.hue} size={size} />;
}

/**
 * A floating glass shape over the content: Liquid Glass where the system has it, a solid white
 * shape with a soft shadow elsewhere and with Reduce Transparency on.
 */
export function PreviewGlass({
  width,
  height,
  paddingHorizontal,
  children,
}: PropsWithChildren<{ width?: number; height: number; paddingHorizontal?: number }>) {
  const colors = usePreviewColors();
  const liquidGlass = useLiquidGlass();
  return (
    <GlassView
      glassEffectStyle={liquidGlass ? "regular" : "none"}
      isInteractive={liquidGlass}
      style={{
        width,
        height,
        paddingHorizontal,
        borderRadius: height / 2,
        borderCurve: "continuous",
        backgroundColor: liquidGlass ? "transparent" : colors.glassFallback,
        boxShadow: liquidGlass ? undefined : PREVIEW_FLOAT_SHADOW,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
      }}
    >
      {children}
    </GlassView>
  );
}

/** A floating round button: profile, +, back, •••, the grid. */
export function PreviewCircleButton({
  label,
  size = previewSize.headerButton,
  onPress,
  children,
}: PropsWithChildren<{ label: string; size?: number; onPress?: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={() => {
        void haptics.selection();
        onPress?.();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <PreviewGlass width={size} height={size}>
        {children}
      </PreviewGlass>
    </Pressable>
  );
}

/** The thin round fill of a section count or a dot, so a row keeps its height with or without it. */
export function UnreadDot({ shown }: { shown: boolean }) {
  const colors = usePreviewColors();
  return (
    <View
      style={{
        width: previewSize.unreadDot,
        height: previewSize.unreadDot,
        borderRadius: previewSize.unreadDot / 2,
        backgroundColor: shown ? colors.accent : "transparent",
      }}
    />
  );
}

/** The grid button glyph of the reference: three rounded squares and a plus in the fourth place. */
export function AppsGlyph({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9}>
      <Rect x={3} y={3} width={7.5} height={7.5} rx={1.6} />
      <Rect x={13.5} y={3} width={7.5} height={7.5} rx={1.6} />
      <Rect x={3} y={13.5} width={7.5} height={7.5} rx={1.6} />
      <Path d="M17.25 13.5v7.5M13.5 17.25h7.5" strokeLinecap="round" />
    </Svg>
  );
}

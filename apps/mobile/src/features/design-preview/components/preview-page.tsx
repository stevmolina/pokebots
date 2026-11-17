import { useRouter } from "expo-router";
import { Typography } from "heroui-native";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Children, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetScrollEdgeEffect } from "@/shared/components/sheet-scroll-edge-effect";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { previewProfile as profile, previewSize as size, previewType as type } from "../model/preview-tokens";
import { PreviewCircleButton, usePreviewColors } from "./preview-parts";

/**
 * A pushed page of the preview: the light gray page, the floating back circle, an optional centered
 * title and circles on the right, and the content scrolling under them.
 */
export function PreviewPage({
  title,
  trailing,
  contentTop,
  children,
}: PropsWithChildren<{ title?: string; trailing?: ReactNode; contentTop?: number }>) {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        alwaysBounceVertical={false}
        contentContainerStyle={{
          paddingTop: insets.top + (contentTop ?? size.headerButton + 18),
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      <SheetScrollEdgeEffect
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + size.headerButton + 16 }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top,
          left: size.headerInset + insets.left,
          right: size.headerInset + insets.right,
          height: size.headerButton,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PreviewCircleButton label={t("mobile.workspace.preview.back")} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.icon} strokeWidth={1.8} />
        </PreviewCircleButton>
        <View pointerEvents="none" style={{ flex: 1, alignItems: "center" }}>
          {title ? (
            <Typography numberOfLines={1} style={[type.pageTitle, { color: colors.title }]}>
              {title}
            </Typography>
          ) : null}
        </View>
        {/* The right side keeps the width of the back circle, so the title stays centered. */}
        <View style={{ minWidth: size.headerButton, flexDirection: "row", justifyContent: "flex-end", gap: 11 }}>
          {trailing}
        </View>
      </View>
    </View>
  );
}

/** A caption over a group, such as "Set up". */
export function PreviewCaption({ children }: { children: string }) {
  const colors = usePreviewColors();
  return (
    <Typography
      style={[
        type.groupCaption,
        {
          color: colors.groupCaption,
          marginLeft: profile.groupInset + profile.rowPlainInset,
          marginBottom: profile.captionGap,
        },
      ]}
    >
      {children}
    </Typography>
  );
}

/** A white inset group with hairlines between its rows, as in the reference's profile. */
export function PreviewGroup({
  children,
  inset = profile.rowLabelInset,
  fill,
}: PropsWithChildren<{ inset?: number; fill?: string }>) {
  const colors = usePreviewColors();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View
      style={{
        marginHorizontal: profile.groupInset,
        borderRadius: profile.groupRadius,
        borderCurve: "continuous",
        backgroundColor: fill ?? colors.groupBackground,
        overflow: "hidden",
      }}
    >
      {rows.map((row, index) => (
        // Rows are fixed for the life of a group, so their place names them.
        <View key={`row-${String(index)}`}>
          {index > 0 ? (
            <View style={{ height: 0.5, marginLeft: inset, backgroundColor: colors.groupSeparator }} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/** One row: icon, label, gray value, chevron. Without `onPress` it has no chevron. */
export function PreviewRow({
  icon,
  label,
  value,
  trailing,
  height = profile.rowHeight,
  onPress,
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  trailing?: ReactNode;
  height?: number;
  onPress?: () => void;
}) {
  const colors = usePreviewColors();
  const body = (
    <>
      {icon ? (
        <View
          style={{ position: "absolute", left: profile.rowIconInset, width: profile.rowIconSize, alignItems: "center" }}
        >
          {icon}
        </View>
      ) : null}
      <Typography
        numberOfLines={1}
        style={[
          type.rowLabel,
          { flex: 1, color: colors.title, marginLeft: icon ? profile.rowLabelInset : profile.rowPlainInset },
        ]}
      >
        {label}
      </Typography>
      {value ? <Typography style={[type.rowValue, { color: colors.rowValue }]}>{value}</Typography> : null}
      {trailing}
      {onPress ? (
        <ChevronRight size={20} color={colors.rowValue} strokeWidth={1.6} style={{ marginLeft: profile.chevronGap }} />
      ) : null}
    </>
  );
  const style = {
    height,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingRight: profile.rowPaddingRight,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [style, { backgroundColor: pressed ? colors.softFill : "transparent" }]}
    >
      {body}
    </Pressable>
  );
}

/** Gray help text under a group. */
export function PreviewHelp({ children }: { children: string }) {
  const colors = usePreviewColors();
  return (
    <Typography
      style={[
        type.help,
        {
          color: colors.groupCaption,
          marginTop: profile.helpGap,
          marginHorizontal: profile.groupInset + profile.rowPlainInset,
        },
      ]}
    >
      {children}
    </Typography>
  );
}

/** The space between two groups. */
export function PreviewGap({ size: gap = profile.groupGap }: { size?: number }) {
  return <View style={{ height: gap }} />;
}

/** Rounded filter chips: the active one filled dark, the others soft gray. */
export function PreviewChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const colors = usePreviewColors();
  return (
    <View style={{ flexDirection: "row", gap: profile.chipGap, paddingHorizontal: profile.groupInset }}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              void haptics.selection();
              onChange(option.id);
            }}
            style={{
              height: profile.chipHeight,
              paddingHorizontal: profile.chipPaddingX,
              borderRadius: profile.chipHeight / 2,
              backgroundColor: active ? colors.strongFill : colors.softFill,
              justifyContent: "center",
            }}
          >
            <Typography style={[type.chip, { color: active ? colors.pageBackground : colors.title }]}>
              {option.label}
            </Typography>
          </Pressable>
        );
      })}
    </View>
  );
}

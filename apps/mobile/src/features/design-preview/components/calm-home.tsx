import { router } from "expo-router";
import { Typography } from "heroui-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { type FlatList, type ListViewToken, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileSidebarItem } from "@/features/workspace/model/sidebar-layout";
import { useBottomFieldMetrics } from "@/shared/components/bottom-field-metrics";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { MIRROR_IN_RTL } from "@/shared/lib/text-direction";
import { previewSize as size, previewType as type } from "../model/preview-tokens";
import { PreviewCircleButton, usePreviewColors } from "./preview-parts";

/*
 * The pieces of the real home in the calm look (Settings > Appearance > New design). The home screen
 * keeps its data, its rows and their actions; these draw the parts that the calm look adds or changes.
 */

/** A group heading of the list, such as "Needs you", in the quiet style of a folder label. */
export function CalmGroupLabel({ title, count }: { title: string; count: number }) {
  const { format } = useText();
  const colors = usePreviewColors();
  return (
    <View
      accessible
      accessibilityRole="header"
      style={{
        height: size.sectionPitch,
        paddingLeft: size.sectionInset,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: colors.background,
      }}
    >
      <Typography style={[type.section, { color: colors.section }]}>{title}</Typography>
      <Typography style={[type.section, { color: colors.sectionCount }]}>{format.number(count)}</Typography>
    </View>
  );
}

/** The last line of the list: the hidden chats, as one gray link. */
export function CalmHiddenLink({ count }: { count: number }) {
  const { t, format } = useText();
  const colors = usePreviewColors();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        void haptics.selection();
        router.push("/hidden-chats");
      }}
      style={({ pressed }) => ({
        height: size.sectionPitch,
        paddingLeft: size.sectionInset,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Typography style={[type.section, { color: colors.section }]}>{t("mobile.agent.hidden.title")}</Typography>
      <Typography style={[type.section, { color: colors.sectionCount }]}>{format.number(count)}</Typography>
      <ChevronRight size={16} color={colors.sectionCount} strokeWidth={1.8} style={MIRROR_IN_RTL} />
    </Pressable>
  );
}

/** The grid button beside the search field: the apps, agents and skills of the server. */
export function CalmBottomGrid({ serverId }: { serverId: string }) {
  const { t } = useText();
  const colors = usePreviewColors();
  const { height } = useBottomFieldMetrics();
  return (
    <PreviewCircleButton
      label={t("mobile.workspace.preview.apps")}
      size={height}
      onPress={() => router.push({ pathname: "/server-marketplace", params: { serverId } })}
    >
      <LayoutGrid size={21} color={colors.icon} strokeWidth={1.8} />
    </PreviewCircleButton>
  );
}

export interface CalmUnread {
  /** Unread chats out of view. */
  count: number;
  /** The next one is below the view; otherwise it is above. */
  down: boolean;
  jump: () => void;
  onViewableItemsChanged: (info: { viewableItems: ListViewToken[] }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/**
 * The unread chats that the list does not show now, from the list's own visible rows. The list keeps
 * the same callbacks for its whole life, as FlatList requires.
 */
export function useCalmUnread({
  items,
  collapsedRowIds,
  unreadAgentIds,
  listRef,
}: {
  items: readonly MobileSidebarItem[];
  collapsedRowIds: ReadonlySet<string>;
  unreadAgentIds: readonly string[];
  listRef: RefObject<FlatList | null>;
}): CalmUnread {
  const [visible, setVisible] = useState<{ first: number; last: number } | null>(null);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const indexes = viewableItems.flatMap((token) => (typeof token.index === "number" ? [token.index] : []));
    setVisible(indexes.length > 0 ? { first: Math.min(...indexes), last: Math.max(...indexes) } : null);
  }).current;
  const onScrollToIndexFailed = useRef((info: { index: number; averageItemLength: number }) => {
    // A row far away is not measured yet: go near it, and the list measures it on the way.
    listRef.current?.scrollToOffset({ offset: info.index * info.averageItemLength, animated: true });
  }).current;
  const unreadIndexes = useMemo(() => {
    const unread = new Set(unreadAgentIds);
    return items.flatMap((item, index) =>
      !collapsedRowIds.has(item.id) &&
      ((item.kind === "agent" && unread.has(item.id)) || (item.kind === "channel" && item.channel.unreadCount > 0))
        ? [index]
        : [],
    );
  }, [items, collapsedRowIds, unreadAgentIds]);
  const below = visible ? unreadIndexes.filter((index) => index > visible.last) : [];
  const above = visible ? unreadIndexes.filter((index) => index < visible.first) : [];
  const next = below[0] ?? above[above.length - 1];
  const jump = useCallback(() => {
    if (next === undefined) return;
    void haptics.selection();
    listRef.current?.scrollToIndex({ index: next, viewPosition: 0.35, animated: true });
  }, [next, listRef]);
  return {
    count: below.length + above.length,
    down: below.length > 0,
    jump,
    onViewableItemsChanged,
    viewabilityConfig: VIEWABILITY,
    onScrollToIndexFailed,
  };
}

/** The floating blue pill: over the search field when the next unread chat is below, under the header when above. */
export function CalmUnreadPill({ unread }: { unread: CalmUnread }) {
  const { t } = useText();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const { height, bottomGap } = useBottomFieldMetrics();
  if (unread.count === 0) return null;
  const Chevron = unread.down ? ChevronDown : ChevronUp;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        ...(unread.down
          ? { bottom: bottomGap + height + size.unreadPillGap }
          : { top: insets.top + size.unreadPillTopGap }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={unread.jump}
        style={({ pressed }) => ({
          height: size.unreadPillHeight,
          borderRadius: size.unreadPillHeight / 2,
          borderCurve: "continuous",
          backgroundColor: colors.accent,
          paddingLeft: 14,
          paddingRight: 11,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          opacity: pressed ? 0.85 : 1,
          boxShadow: "0 4px 12px rgba(47, 124, 246, 0.28)",
        })}
      >
        <Typography style={[type.pill, { color: colors.onAccent }]}>
          {t("mobile.workspace.preview.unread", { count: unread.count })}
        </Typography>
        <Chevron size={18} color={colors.onAccent} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

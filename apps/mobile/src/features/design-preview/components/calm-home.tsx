import { router } from "expo-router";
import { Typography } from "heroui-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import { type RefObject, useMemo, useRef, useSyncExternalStore } from "react";
import { type FlatList, type ListViewToken, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileSidebarItem } from "@/features/workspace/model/sidebar-layout";
import { useBottomFieldMetrics } from "@/shared/components/bottom-field-metrics";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { MIRROR_IN_RTL } from "@/shared/lib/text-direction";
import { previewSize as size, previewType as type } from "../model/preview-tokens";
import { usePreviewColors } from "./preview-parts";

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
        minHeight: size.sectionPitch,
        paddingLeft: size.sectionInset,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: colors.background,
      }}
    >
      <Typography numberOfLines={1} style={[type.section, { color: colors.section, flexShrink: 1 }]}>
        {title}
      </Typography>
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
        minHeight: size.sectionPitch,
        paddingLeft: size.sectionInset,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Typography numberOfLines={1} style={[type.section, { color: colors.section, flexShrink: 1 }]}>
        {t("mobile.agent.hidden.title")}
      </Typography>
      <Typography style={[type.section, { color: colors.sectionCount }]}>{format.number(count)}</Typography>
      <ChevronRight size={16} color={colors.sectionCount} strokeWidth={1.8} style={MIRROR_IN_RTL} />
    </Pressable>
  );
}

interface VisibleRange {
  first: number;
  last: number;
}

/**
 * The rows the list shows now. It lives outside React state, so a scroll does not render home again:
 * only the pill reads it.
 */
function createVisibleRange() {
  let range: VisibleRange | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => range,
    set(next: VisibleRange | null) {
      if (next?.first === range?.first && next?.last === range?.last) return;
      range = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface CalmUnread {
  /** The rows of the list that are unread, in list order. */
  unreadIndexes: readonly number[];
  visible: ReturnType<typeof createVisibleRange>;
  /** Scrolls to a row, and again once the list has measured it (a few tries at most). */
  scrollTo: (index: number) => void;
  onViewableItemsChanged: (info: { viewableItems: ListViewToken[] }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
/** How often a jump to a row that is not measured yet tries again. */
const JUMP_ATTEMPTS = 3;

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
  const visible = useRef(createVisibleRange()).current;
  // A jump to a row that the list has not measured yet: it scrolls near the row, and the next visible
  // rows try the row again. A few tries at most, so a scroll of the user's own is never fought.
  const retryIndex = useRef<number | null>(null);
  const failures = useRef<{ index: number; count: number } | null>(null);
  const scrollTo = useRef((index: number) => {
    failures.current = null;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true });
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const indexes = viewableItems.flatMap((token) => (typeof token.index === "number" ? [token.index] : []));
    visible.set(indexes.length > 0 ? { first: Math.min(...indexes), last: Math.max(...indexes) } : null);
    const index = retryIndex.current;
    if (index === null) return;
    retryIndex.current = null;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true });
  }).current;
  const onScrollToIndexFailed = useRef((info: { index: number; averageItemLength: number }) => {
    const count = failures.current?.index === info.index ? failures.current.count + 1 : 1;
    failures.current = { index: info.index, count };
    // The rows above it (pinned agents, the big face) make this estimate short, so the retry corrects it.
    listRef.current?.scrollToOffset({ offset: info.index * info.averageItemLength, animated: true });
    retryIndex.current = count < JUMP_ATTEMPTS ? info.index : null;
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
  return {
    unreadIndexes,
    visible,
    scrollTo,
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
  const visible = useSyncExternalStore(unread.visible.subscribe, unread.visible.get);
  const below = visible ? unread.unreadIndexes.filter((index) => index > visible.last) : [];
  const above = visible ? unread.unreadIndexes.filter((index) => index < visible.first) : [];
  const next = below[0] ?? above[above.length - 1];
  const count = below.length + above.length;
  if (count === 0 || next === undefined) return null;
  const down = below.length > 0;
  const Chevron = down ? ChevronDown : ChevronUp;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        ...(down ? { bottom: bottomGap + height + size.unreadPillGap } : { top: insets.top + size.unreadPillTopGap }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void haptics.selection();
          unread.scrollTo(next);
        }}
        style={({ pressed }) => ({
          minHeight: size.unreadPillHeight,
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
        <Typography numberOfLines={1} style={[type.pill, { color: colors.onAccent }]}>
          {t("mobile.workspace.preview.unread", { count })}
        </Typography>
        <Chevron size={18} color={colors.onAccent} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

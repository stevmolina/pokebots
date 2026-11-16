import { Link, useRouter } from "expo-router";
import { Typography } from "heroui-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ListChecks from "lucide-react-native/icons/list-checks";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import Star from "lucide-react-native/icons/star";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUniwind } from "uniwind";
import { useColumnWidth } from "@/shared/components/adaptive-split";
import { MenuView } from "@/shared/components/menu-view";
import { ProfileAvatar } from "@/shared/components/profile-avatar";
import { SheetScrollEdgeEffect } from "@/shared/components/sheet-scroll-edge-effect";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import {
  AppsGlyph,
  PreviewCircleButton,
  PreviewFace,
  PreviewGlass,
  UnreadDot,
  usePreviewColors,
} from "../components/preview-parts";
import { usePreviewTime } from "../components/preview-time";
import {
  PREVIEW_DONE_COUNT,
  PREVIEW_LOOSE_CHATS,
  PREVIEW_MAIN_AGENT,
  PREVIEW_OPEN_SECTION,
  PREVIEW_SECTIONS,
  type PreviewChat,
} from "../model/preview-data";
import { setDesignPreview } from "../model/preview-switch";
import { previewSheet, previewSize as size, previewType as type } from "../model/preview-tokens";

const LOOSE = "loose";

/** The calm chat list: the main agent, quiet sections that open in place, plain rows, two floating bars. */
export function PreviewChatListScreen() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const width = useColumnWidth();
  const { theme } = useUniwind();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([PREVIEW_OPEN_SECTION, LOOSE]));
  // Where each unread row is in the scroll content, and what part of the content shows now.
  const unreadTops = useRef(new Map<string, number>());
  const [layoutTick, setLayoutTick] = useState(0);
  const [view, setView] = useState({ top: 0, height: 0 });

  const toggle = useCallback((id: string) => {
    void haptics.selection();
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openChat = useCallback((id: string) => router.push(`/design-preview/chat/${id}`), [router]);

  const onUnreadLayout = useCallback((key: string, top: number | null) => {
    if (top === null) unreadTops.current.delete(key);
    else unreadTops.current.set(key, top);
    setLayoutTick((tick) => tick + 1);
  }, []);

  // The bottom bar and the pill cover the bottom of the list, so a row there does not count as seen.
  const bottomBarTop = size.bottomBarBottom + size.searchHeight;
  const unread = useMemo(() => {
    void layoutTick;
    const visibleBottom = view.top + view.height - bottomBarTop - size.unreadPillGap;
    const tops = [...unreadTops.current.values()].sort((a, b) => a - b);
    const below = tops.filter((top) => top + size.rowHeight > visibleBottom);
    const above = tops.filter((top) => top < view.top + insets.top + size.headerButton);
    return { count: below.length + above.length, next: below[0] ?? above[0] ?? null, down: below.length > 0 };
  }, [layoutTick, view, bottomBarTop, insets.top]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    setView({ top: contentOffset.y, height: layoutMeasurement.height });
  };

  const jumpToUnread = () => {
    if (unread.next === null) return;
    void haptics.selection();
    scrollRef.current?.scrollTo({ y: Math.max(0, unread.next - view.height / 3), animated: true });
  };

  const searchWidth = width - size.bottomBarInset * 2 - size.gridButton - size.bottomBarGap;
  const chatCount = (chats: PreviewChat[]) => chats.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + size.heroTop,
          paddingBottom: insets.bottom + size.bottomBarBottom + size.searchHeight + 40,
        }}
        onScroll={onScroll}
        onLayout={(event) => setView((current) => ({ ...current, height: event.nativeEvent.layout.height }))}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
      >
        <Hero onPress={() => openChat(PREVIEW_MAIN_AGENT.id)} />
        <View style={{ height: size.sectionsTop }} />
        {PREVIEW_SECTIONS.map((section) => (
          <Fragment key={section.id}>
            <SectionLabel
              name={section.name}
              count={chatCount(section.chats)}
              open={open.has(section.id)}
              onPress={() => toggle(section.id)}
            />
            {open.has(section.id)
              ? section.chats.map((chat) => <ChatRow key={chat.agent.id} chat={chat} onUnreadLayout={onUnreadLayout} />)
              : null}
          </Fragment>
        ))}
        <SectionLabel
          name={t("mobile.workspace.preview.noSection")}
          open={open.has(LOOSE)}
          onPress={() => toggle(LOOSE)}
        />
        {open.has(LOOSE)
          ? PREVIEW_LOOSE_CHATS.map((chat) => (
              <ChatRow key={chat.agent.id} chat={chat} onUnreadLayout={onUnreadLayout} />
            ))
          : null}
        <SectionLabel
          name={t("mobile.workspace.preview.done")}
          count={PREVIEW_DONE_COUNT}
          open={false}
          onPress={() => undefined}
        />
      </ScrollView>

      {/* The content fades out under the floating bars, as under a native bar. */}
      <SheetScrollEdgeEffect
        surface="sheet"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + size.headerButton + 16 }}
      />
      <SheetScrollEdgeEffect
        surface="sheet"
        edge="bottom"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: size.bottomBarBottom + size.searchHeight + 24,
        }}
      />

      <View style={{ position: "absolute", top: insets.top, left: size.headerInset + insets.left }}>
        <MenuView
          colorScheme={theme === "dark" ? "dark" : "light"}
          actions={[{ id: "leave", title: t("mobile.workspace.preview.leave"), attributes: { destructive: true } }]}
          onPressAction={({ nativeEvent }) => {
            if (nativeEvent.event !== "leave") return;
            setDesignPreview(false);
            router.replace("/");
          }}
        >
          <View accessible accessibilityRole="button" accessibilityLabel={t("mobile.workspace.preview.profile")}>
            <PreviewGlass width={size.headerButton} height={size.headerButton}>
              <ProfileAvatar name="Steven" neutral size={size.headerButton - 6} />
            </PreviewGlass>
          </View>
        </MenuView>
      </View>
      <View style={{ position: "absolute", top: insets.top, right: size.headerInset + insets.right }}>
        <PreviewCircleButton label={t("mobile.workspace.preview.newChat")}>
          <Plus size={22} color={colors.icon} strokeWidth={1.6} />
        </PreviewCircleButton>
      </View>

      {unread.count > 0 ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            // The pill points the way to the next unread chat: over the bottom bar when it is below,
            // under the header when it is above, as in the reference.
            ...(unread.down
              ? { bottom: size.bottomBarBottom + size.searchHeight + size.unreadPillGap }
              : { top: insets.top + size.unreadPillTopGap }),
            alignItems: "center",
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={jumpToUnread}
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
              boxShadow: "0 4px 12px rgba(62, 130, 242, 0.28)",
            })}
          >
            <Typography style={[type.pill, { color: colors.onAccent }]}>
              {t("mobile.workspace.preview.unread", { count: unread.count })}
            </Typography>
            {unread.down ? (
              <ChevronDown size={18} color={colors.onAccent} strokeWidth={2.2} />
            ) : (
              <ChevronUp size={18} color={colors.onAccent} strokeWidth={2.2} />
            )}
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          position: "absolute",
          left: size.bottomBarInset + insets.left,
          right: size.bottomBarInset + insets.right,
          bottom: size.bottomBarBottom,
          flexDirection: "row",
          alignItems: "center",
          gap: size.bottomBarGap,
        }}
      >
        <PreviewCircleButton label={t("mobile.workspace.preview.apps")} size={size.gridButton}>
          <AppsGlyph color={colors.icon} />
        </PreviewCircleButton>
        <Pressable accessibilityRole="search" accessibilityLabel={t("mobile.workspace.preview.search")}>
          <PreviewGlass width={searchWidth} height={size.searchHeight}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingLeft: 15, gap: 10 }}>
              <Search size={21} color={colors.icon} strokeWidth={2.5} />
              <Typography style={[type.search, { color: colors.placeholder }]}>
                {t("mobile.workspace.preview.search")}
              </Typography>
            </View>
          </PreviewGlass>
        </Pressable>
      </View>
    </View>
  );
}

function Hero({ onPress }: { onPress: () => void }) {
  const colors = usePreviewColors();
  const badge = size.heroBadge;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={PREVIEW_MAIN_AGENT.name}
      onPress={onPress}
      style={({ pressed }) => ({ alignSelf: "center", alignItems: "center", opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: size.heroAvatar, height: size.heroAvatar }}>
        <PreviewFace agent={PREVIEW_MAIN_AGENT} size={size.heroAvatar} />
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: colors.heroBadge,
            borderWidth: 2,
            borderColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Star size={11} color="#ffffff" fill="#ffffff" strokeWidth={1.5} />
        </View>
      </View>
      <Typography style={[type.heroLabel, { color: colors.title, marginTop: size.heroLabelGap }]}>
        {PREVIEW_MAIN_AGENT.name}
      </Typography>
    </Pressable>
  );
}

function SectionLabel({
  name,
  count,
  open,
  onPress,
}: {
  name: string;
  count?: number;
  open: boolean;
  onPress: () => void;
}) {
  const colors = usePreviewColors();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => ({
        height: size.sectionPitch,
        paddingLeft: size.sectionInset,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Typography style={[type.section, { color: colors.section }]}>{name}</Typography>
      {count === undefined ? null : (
        <Typography style={[type.section, { color: colors.sectionCount }]}>{String(count)}</Typography>
      )}
      <Chevron size={16} color={colors.sectionCount} strokeWidth={1.8} />
    </Pressable>
  );
}

function ChatRow({
  chat,
  onUnreadLayout,
}: {
  chat: PreviewChat;
  onUnreadLayout: (key: string, top: number | null) => void;
}) {
  const { t } = useText();
  const colors = usePreviewColors();
  const time = usePreviewTime();
  const width = useColumnWidth();
  const key = chat.agent.id;
  // A row of a closed section is gone from the list, so it stops counting as unread below or above.
  useEffect(() => (chat.unread ? () => onUnreadLayout(key, null) : undefined), [chat.unread, key, onUnreadLayout]);
  const onLayout = chat.unread
    ? (event: LayoutChangeEvent) => {
        // The row's wrapper is a direct child of the scroll content, so `y` is its place in the list.
        onUnreadLayout(key, event.nativeEvent.layout.y);
      }
    : undefined;
  let icon: ReactNode = null;
  if (chat.task) icon = <ListChecks size={15} color={colors.preview} strokeWidth={1.8} />;
  const done = () => void haptics.selection();
  return (
    <View onLayout={onLayout}>
      {/* A touch and hold shows the last message over a blurred list, with the row's native menu. */}
      <Link href={{ pathname: "/design-preview/chat/[agentId]", params: { agentId: key } }} asChild>
        <Link.Trigger>
          {/* The native trigger takes a plain style object; a style function is dropped. iOS lifts the
              row while it is held, so the row needs no pressed color of its own. */}
          <Pressable
            accessibilityRole="button"
            style={{
              height: size.rowHeight,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: size.rowAvatarInset,
              paddingRight: size.rowTrailingInset,
            }}
          >
            <PreviewFace agent={chat.agent} size={size.rowAvatar} />
            <View style={{ flex: 1, marginLeft: size.rowTextGap }}>
              {/* The time's capitals line up with the title's, as in the reference, so the two align at the top. */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: size.rowTrailingGap }}>
                <Typography numberOfLines={1} style={[type.rowTitle, { flex: 1, color: colors.title }]}>
                  {chat.agent.name}
                </Typography>
                <Typography style={[type.rowTime, { color: colors.time }]}>{time.row(chat.minutesAgo)}</Typography>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: size.rowTrailingGap }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
                  {icon}
                  <Typography numberOfLines={1} style={[type.rowPreview, { flex: 1, color: colors.preview }]}>
                    {chat.preview}
                  </Typography>
                </View>
                <UnreadDot shown={chat.unread} />
              </View>
            </View>
          </Pressable>
        </Link.Trigger>
        <Link.Preview style={{ width: width - 32, height: previewSheet.rowPreviewHeight }}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View
              style={{
                height: previewSheet.rowPreviewHeaderHeight,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 16,
              }}
            >
              <PreviewFace agent={chat.agent} size={32} />
              <Typography
                numberOfLines={1}
                style={[type.chatTitle, { flex: 1, color: colors.title, fontWeight: "600" }]}
              >
                {chat.agent.name}
              </Typography>
            </View>
            <View style={{ height: 1, backgroundColor: colors.agentBubble }} />
            <View
              style={{
                margin: 16,
                alignSelf: "flex-start",
                borderRadius: size.bubbleRadius,
                borderCurve: "continuous",
                paddingHorizontal: size.bubblePaddingX,
                paddingVertical: size.bubblePaddingY,
                backgroundColor: colors.agentBubble,
              }}
            >
              <Typography numberOfLines={2} style={[type.message, { color: colors.agentText }]}>
                {chat.preview}
              </Typography>
            </View>
          </View>
        </Link.Preview>
        <Link.Menu>
          <Link.MenuAction icon="envelope.badge" onPress={done}>
            {t("mobile.agent.menu.markUnread")}
          </Link.MenuAction>
          <Link.MenuAction icon="pin" onPress={done}>
            {t("mobile.agent.pin.pin")}
          </Link.MenuAction>
          <Link.Menu icon="folder" title={t("mobile.agent.section.moveTo")}>
            {PREVIEW_SECTIONS.map((section) => (
              <Link.MenuAction key={section.id} onPress={done}>
                {section.name}
              </Link.MenuAction>
            ))}
          </Link.Menu>
          <Link.MenuAction destructive icon="eye.slash" onPress={done}>
            {t("mobile.agent.menu.hide")}
          </Link.MenuAction>
          <Link.Menu icon="ellipsis" title={t("mobile.agent.menu.more")}>
            <Link.MenuAction icon="doc.on.doc" onPress={done}>
              {t("mobile.agent.menu.copyId")}
            </Link.MenuAction>
            <Link.MenuAction destructive icon="trash" onPress={done}>
              {t("common.delete")}
            </Link.MenuAction>
          </Link.Menu>
        </Link.Menu>
      </Link>
    </View>
  );
}

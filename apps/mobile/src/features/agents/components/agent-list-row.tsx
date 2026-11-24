import { markdownPreviewText } from "@pokebots/contracts/markdown-preview-text";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { Link } from "expo-router";
import { Typography } from "heroui-native";
import {
  type ComponentProps,
  memo,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAgentChatPreview } from "@/features/agents/components/agent-chat-preview";
import { AgentAndroidMenu, AgentContextMenuLink } from "@/features/agents/components/agent-context-menu";
import { AgentPinAvatar } from "@/features/agents/components/agent-pin-avatar";
import { AgentPinSwipeRow } from "@/features/agents/components/agent-pin-swipe-row";
import { useAgentPinTransition } from "@/features/agents/components/agent-pin-transition";
import { AgentUnreadBadge } from "@/features/agents/components/agent-unread-badge";
import { AGENT_WAIT_STATE, AgentWaitBadge, AgentWaitChip } from "@/features/agents/components/agent-wait-badge";
import { BloubAvatar } from "@/features/agents/components/bloub-avatar";
import { AgentDragPreview, useChatDrag, useHoldMenu } from "@/features/agents/components/chat-drag";
import { ChatLinkPressable } from "@/features/agents/components/chat-link-pressable";
import { useChatRowBackground, useChatRowSelected } from "@/features/agents/components/chat-list-pane-context";
import { useListRowChrome } from "@/features/agents/components/use-list-row-chrome";
import { useWaitingChannel } from "@/features/channels/components/use-waiting-channel";
import { UnreadDot, usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { useCalmRows } from "@/features/design-preview/model/calm-look";
import { previewSize, previewType } from "@/features/design-preview/model/preview-tokens";
import {
  agentListWaitReason,
  useAgentListActivity,
  useAgentListUnreadCount,
  useAgentListUnreadThreads,
} from "@/features/workspace/components/use-agent-activity";
import { type MobileAgent, useMobileWorkspaceSelector } from "@/features/workspace/context/mobile-workspace-context";
import { agentActivityMood } from "@/features/workspace/model/agent-activity";
import { canToggleChatPin } from "@/features/workspace/model/agent-pins";
import { isAndroid, longPressDelay } from "@/shared/lib/platform";
import { useText } from "@/shared/lib/text";
import { END_X, lineDirectionStyle } from "@/shared/lib/text-direction";
import { typeScale } from "@/shared/lib/type-scale";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

function AgentRowTextReveal({ active, children }: PropsWithChildren<{ active: boolean }>) {
  const gradientId = `agent-row-reveal-${useId().replaceAll(":", "")}`;
  const width = useSharedValue(0);
  const progress = useSharedValue(active ? 0 : 1);

  useEffect(() => {
    progress.set(
      active ? withDelay(45, withTiming(1, { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System })) : 1,
    );
  }, [active, progress]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.35, 1], [0, 0.78, 1]),
  }));
  const blurStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.35, 0.8, 1], [0.72, 0.58, 0.1, 0]),
  }));
  // The text shows from its start: from the right in a right-to-left layout. The mask counts from the left.
  const maskProps = useAnimatedProps(() => ({
    x: END_X === 1 ? 0 : width.get() * (1 - progress.get()),
    width: width.get() * progress.get(),
  }));

  if (!active) return children;

  return (
    <Animated.View
      className="min-w-0 flex-1"
      onLayout={(event) => width.set(event.nativeEvent.layout.width)}
      style={contentStyle}
    >
      <MaskedView
        style={{ width: "100%" }}
        maskElement={
          <Svg height="100%" width="100%">
            <Defs>
              <LinearGradient id={gradientId} x1={END_X === 1 ? "0" : "1"} x2={END_X === 1 ? "1" : "0"} y1="0" y2="0">
                <Stop offset="0" stopColor="#000" stopOpacity="1" />
                <Stop offset="0.82" stopColor="#000" stopOpacity="1" />
                <Stop offset="1" stopColor="#000" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <AnimatedRect animatedProps={maskProps} fill={`url(#${gradientId})`} height="100%" y="0" />
          </Svg>
        }
      >
        {children}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={16} style={StyleSheet.absoluteFill} tint="systemUltraThinMaterial" />
        </Animated.View>
      </MaskedView>
    </Animated.View>
  );
}

interface AgentListRowProps {
  agent: MobileAgent;
  leftInset?: number;
  rightInset?: number;
  /** The list is moving. A row that mounts then waits to add its swipe and its menu. */
  scrolling?: boolean;
  /** The row's place in the list. Rows that mount together add their menus a few at a time. */
  index?: number;
  /** A small mark after the name, such as the server of the agent in All machines. */
  mark?: ReactNode;
  /** The lane of the "Active" list: a rounded working card, or a faint snoozed row. */
  lane?: "working" | "snoozed" | undefined;
  /** The end of the snooze of a snoozed row, in ms since epoch. */
  snoozedUntil?: number | undefined;
  /** The minute clock of the list, for the time a card has worked or a snooze has left. */
  now?: number | undefined;
}

type ListTranslate = ReturnType<typeof useText>["t"];
type ListFormat = ReturnType<typeof useText>["format"];

/** A short span of time, as the desktop list writes it: now, minutes, hours, or days. */
function shortSpan(ms: number, t: ListTranslate, format: ListFormat): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t("mobile.agent.list.elapsed.now");
  if (minutes < 60) return t("mobile.agent.list.elapsed.minutes", { value: format.number(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("mobile.agent.list.elapsed.hours", { value: format.number(hours) });
  return t("mobile.agent.list.elapsed.days", { value: format.number(Math.floor(hours / 24)) });
}

/** What a lane row shows in place of the time: how long a card has worked, or how long a snooze has left. */
function laneNote(
  props: Pick<AgentListRowProps, "agent" | "lane" | "snoozedUntil" | "now">,
  t: ListTranslate,
  format: ListFormat,
): string | null {
  const now = props.now ?? Date.now();
  if (props.lane === "snoozed" && props.snoozedUntil) {
    // A snooze counts up to the next minute, so it never shows "now" while it lasts.
    return shortSpan(Math.max(60_000, Math.ceil((props.snoozedUntil - now) / 60_000) * 60_000), t, format);
  }
  if (props.lane === "working") {
    const since = props.agent.updatedAt ? Date.parse(props.agent.updatedAt) : Number.NaN;
    return Number.isNaN(since) ? "" : shortSpan(Math.max(0, now - since), t, format);
  }
  return null;
}

/**
 * A chat of All machines: the row of the home list with the mark of its server. A tap makes the
 * agent's server the open one, so the server-scoped screens of the chat read the right server, and
 * then opens the chat. All machines stays on, so back returns to the merged list.
 */
export const AgentMachineRow = memo(function AgentMachineRow({
  agent,
  mark,
  onOpen,
}: {
  agent: MobileAgent;
  mark: ReactNode;
  onOpen: (agent: MobileAgent) => void;
}) {
  return <AgentRowBody agent={agent} leftInset={20} rightInset={20} mark={mark} onPress={() => onOpen(agent)} />;
});

/**
 * A chat of the home list. It renders again only when its agent, its own live state or a pin
 * transition changes, so a long list stays quiet while other agents work.
 *
 * A row that appears while the list is moving draws its picture and its text first. The swipe and
 * the menu mount when the list stops. Building both for every chat a fast scroll passed left the
 * screen empty until that work finished.
 */
export const AgentListRow = memo(function AgentListRow({ scrolling = false, index = 0, ...props }: AgentListRowProps) {
  const chrome = useListRowChrome(true, scrolling, index);
  return chrome ? <InteractiveAgentListRow {...props} /> : <PlainAgentListRow {...props} />;
});

function PlainAgentListRow({ agent, leftInset = 20, rightInset = 20, ...lane }: AgentListRowProps) {
  return (
    <Link href={{ pathname: "/chat/[agentId]", params: { agentId: agent.id } }} asChild>
      <Link.Trigger>
        <AgentRowBody agent={agent} leftInset={leftInset} rightInset={rightInset} {...lane} />
      </Link.Trigger>
    </Link>
  );
}

function InteractiveAgentListRow({ agent, leftInset = 20, rightInset = 20, ...lane }: AgentListRowProps) {
  const pinBlocked = useMobileWorkspaceSelector(
    ({ pinnedAgentIds, pinnedChannelIds }) => !canToggleChatPin(pinnedAgentIds, pinnedChannelIds, agent.id),
  );
  const { toggleAgentPinAnimated } = useAgentPinTransition();
  // Each long press mounts the Android menu again, so it opens even if an earlier one did not close.
  const [menuKey, setMenuKey] = useState(0);
  const drag = useChatDrag("row", () => ({
    chat: { kind: "agent", id: agent.id },
    pinned: false,
    name: agent.name,
    preview: <AgentDragPreview agent={agent} />,
  }));
  const holdMenu = useHoldMenu(drag, () => setMenuKey((key) => key + 1));
  const agentChatPreview = useAgentChatPreview(agent);
  const row = (
    <AgentRowBody
      agent={agent}
      leftInset={leftInset}
      rightInset={rightInset}
      {...lane}
      onPressIn={agentChatPreview.onPressIn}
      onLongPress={holdMenu.onLongPress}
      onPressOut={holdMenu.onPressOut}
      measurer={agentChatPreview.measurer}
    />
  );
  const linked = isAndroid ? (
    <View>
      <Link href={{ pathname: "/chat/[agentId]", params: { agentId: agent.id } }} asChild>
        <Link.Trigger>{row}</Link.Trigger>
      </Link>
      {menuKey > 0 ? <AgentAndroidMenu key={menuKey} agent={agent} onClose={() => setMenuKey(0)} /> : null}
    </View>
  ) : (
    <AgentContextMenuLink agent={agent} preview={agentChatPreview.preview}>
      {row}
    </AgentContextMenuLink>
  );
  return (
    <AgentPinSwipeRow
      agentName={agent.name}
      pinBlocked={pinBlocked}
      onPin={(withHaptic) => toggleAgentPinAnimated(agent.id, { haptic: withHaptic })}
      drag={drag}
    >
      {linked}
    </AgentPinSwipeRow>
  );
}

function AgentRowBody({
  agent,
  leftInset,
  rightInset,
  onPress,
  onPressIn,
  onLongPress,
  onPressOut,
  measurer,
  mark,
  lane,
  snoozedUntil,
  now,
}: AgentListRowProps & {
  onPress?: ComponentProps<typeof ChatLinkPressable>["onPress"];
  onPressIn?: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  measurer?: ReactNode;
}) {
  const { t, format } = useText();
  const background = useChatRowBackground(agent.id);
  const selected = useChatRowSelected(agent.id);
  const { toggleAgentPinAnimated, transition } = useAgentPinTransition();
  // The row reads the activity once and gives it to the avatar, the badge and the channel line.
  const activity = useAgentListActivity(agent.id);
  // An agent that waits in a channel says so, as its last message in its own chat is not the wait.
  const waitingChannel = useWaitingChannel(activity, agent.serverId);
  const lastMessage = useMemo(() => markdownPreviewText(agent.preview), [agent.preview]);
  const previewLine = waitingChannel
    ? t("mobile.chat.channelWork.waiting", { channel: waitingChannel.name })
    : lastMessage;
  const unreadCount = useAgentListUnreadCount(agent.id);
  const unreadThreads = useAgentListUnreadThreads(agent.id);
  const waitReason = agentListWaitReason(activity);
  const isUnpinTarget = transition?.chatId === agent.id && transition.target === "row";
  // The calm look of Settings > Appearance > New design: the row of the design preview.
  const calm = useCalmRows();
  const calmColors = usePreviewColors();
  const avatarSize = calm ? previewSize.rowAvatar : 54;
  const bloub = (
    <BloubAvatar
      agentId={agent.id}
      serverId={agent.serverId}
      hue={agent.avatarHue}
      color={agent.avatarColor}
      seed={agent.avatarSeed}
      avatarUrl={agent.avatarUrl}
      size={avatarSize}
      animateIdle={false}
      rings
      activityMood={agentActivityMood(activity)}
    />
  );
  // As on the desktop, a wait outranks the unread count in the corner of the avatar.
  // The calm row shows unread as a dot at the end of the preview, as the design preview does.
  const waitBadge = waitReason ? (
    <AgentWaitBadge reason={waitReason} />
  ) : !calm && (unreadCount > 0 || unreadThreads) ? (
    <AgentUnreadBadge count={unreadCount} avatarSize={54} ringColor={background} />
  ) : null;
  const avatar = (
    <AgentPinAvatar agentId={agent.id} location="row" size={avatarSize}>
      {bloub}
      {waitBadge}
    </AgentPinAvatar>
  );
  const note = laneNote({ agent, lane, snoozedUntil, now }, t, format);
  const card = lane === "working";
  const snoozed = lane === "snoozed" && note !== null;
  const baseLabel = agent.title.trim()
    ? t("mobile.agent.list.openWithTitle", { name: agent.name, title: agent.title.trim() })
    : t("mobile.agent.list.open", { name: agent.name });
  const openLabel = snoozed
    ? t("mobile.agent.list.withState", { label: baseLabel, state: t("mobile.agent.list.snoozedFor", { time: note }) })
    : baseLabel;
  const trailing = waitReason ? (
    <AgentWaitChip reason={waitReason} />
  ) : card ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <ActivityIndicator size="small" color={calmColors.accent} />
      {note ? <Typography style={[previewType.rowTime, { color: calmColors.preview }]}>{note}</Typography> : null}
    </View>
  ) : (
    <Typography style={[previewType.rowTime, { color: calmColors.time }]}>{note ?? agent.updatedLabel}</Typography>
  );

  return (
    <ChatLinkPressable
      chatId={agent.id}
      accessibilityLabel={
        waitReason
          ? t("mobile.agent.list.withState", { label: openLabel, state: t(AGENT_WAIT_STATE[waitReason]) })
          : unreadCount > 0 || unreadThreads
            ? t("mobile.agent.list.withState", {
                label: openLabel,
                state:
                  unreadCount > 0
                    ? t("mobile.agent.list.unread", { count: unreadCount })
                    : t("mobile.agent.list.unreadThreads"),
              })
            : openLabel
      }
      accessibilityRole="button"
      accessibilityActions={[{ name: "pin", label: t("mobile.agent.pin.pinNamed", { name: agent.name }) }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "pin") toggleAgentPinAnimated(agent.id);
      }}
      className="w-full"
      // Link injects navigation into this component. Every row look must pass it to the pressable:
      // the pane of a wide window draws the current rows, and they open the chat the same way.
      onPress={onPress}
      onPressIn={onPressIn}
      delayLongPress={longPressDelay}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
    >
      {({ pressed }) =>
        calm ? (
          <View
            style={{
              minHeight: previewSize.rowHeight,
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              // The chat open beside the list keeps its highlight.
              backgroundColor: selected ? background : calmColors.background,
              opacity: pressed ? 0.58 : snoozed ? 0.55 : 1,
              paddingLeft: previewSize.rowAvatarInset,
              paddingRight: previewSize.rowTrailingInset,
            }}
          >
            {card ? (
              // "Working" of the "Active" list: each agent is a rounded card, as in the B3 design.
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 4,
                  bottom: 4,
                  left: previewSize.rowAvatarInset - 10,
                  right: previewSize.rowTrailingInset - 10,
                  borderRadius: 16,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: calmColors.groupSeparator,
                  backgroundColor: calmColors.groupBackground,
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
                }}
              />
            ) : null}
            {avatar}
            <View style={{ flex: 1, minWidth: 0, marginLeft: previewSize.rowTextGap }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: previewSize.rowTrailingGap }}>
                <Typography
                  numberOfLines={1}
                  style={[previewType.rowTitle, { flexShrink: 1, color: calmColors.title }]}
                >
                  {agent.name}
                </Typography>
                {mark}
                <View style={{ flex: 1 }} />
                {trailing}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: previewSize.rowTrailingGap }}>
                <Typography
                  numberOfLines={1}
                  style={[
                    previewType.rowPreview,
                    { flex: 1, color: calmColors.preview },
                    lineDirectionStyle(previewLine),
                  ]}
                >
                  {previewLine}
                </Typography>
                <UnreadDot shown={unreadCount > 0 || unreadThreads} />
              </View>
            </View>
            {measurer}
          </View>
        ) : (
          <View
            className="min-h-20 w-full flex-row items-center gap-3 py-1"
            style={{
              backgroundColor: background,
              opacity: pressed ? 0.58 : snoozed ? 0.55 : 1,
              paddingLeft: leftInset,
              paddingRight: rightInset,
            }}
          >
            {avatar}
            <AgentRowTextReveal active={isUnpinTarget}>
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Typography.Paragraph
                    className={mark ? "font-semibold min-w-0 shrink" : "font-semibold min-w-0 flex-1"}
                    numberOfLines={1}
                    style={typeScale.rowTitle}
                  >
                    {agent.name}
                  </Typography.Paragraph>
                  {mark ? (
                    <>
                      {mark}
                      <View className="flex-1" />
                    </>
                  ) : null}
                  {waitReason ? (
                    <AgentWaitChip reason={waitReason} />
                  ) : (
                    <Typography.Paragraph className="text-muted" style={typeScale.caption}>
                      {note ?? agent.updatedLabel}
                    </Typography.Paragraph>
                  )}
                </View>
                {agent.title.trim() ? (
                  <Typography.Paragraph className="text-muted" numberOfLines={1} style={typeScale.caption}>
                    {agent.title.trim()}
                  </Typography.Paragraph>
                ) : null}
                <Typography.Paragraph
                  className="text-text-secondary"
                  numberOfLines={1}
                  style={[typeScale.preview, lineDirectionStyle(previewLine)]}
                >
                  {previewLine}
                </Typography.Paragraph>
              </View>
            </AgentRowTextReveal>
            {measurer}
          </View>
        )
      }
    </ChatLinkPressable>
  );
}

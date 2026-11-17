import { Link } from "expo-router";
import { Typography } from "heroui-native";
import { useThemeColor } from "heroui-native/hooks";
import { memo, type PropsWithChildren, useState } from "react";
import { View } from "react-native";
import Animated, {
  CurvedTransition,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { useAgentChatPreview } from "@/features/agents/components/agent-chat-preview";
import { AgentAndroidMenu, AgentContextMenuLink } from "@/features/agents/components/agent-context-menu";
import { AgentPinAvatar } from "@/features/agents/components/agent-pin-avatar";
import { AgentUnreadBadge } from "@/features/agents/components/agent-unread-badge";
import { AGENT_WAIT_STATE, AgentWaitBadge } from "@/features/agents/components/agent-wait-badge";
import { BloubAvatar } from "@/features/agents/components/bloub-avatar";
import {
  AgentDragPreview,
  ChatDragArea,
  PIN_AREA_KEY,
  useChatDrag,
  useChatDropTarget,
  useHoldMenu,
} from "@/features/agents/components/chat-drag";
import { ChatLinkPressable } from "@/features/agents/components/chat-link-pressable";
import { usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { useCalmRows } from "@/features/design-preview/model/calm-look";
import { previewSize, previewType } from "@/features/design-preview/model/preview-tokens";
import {
  useAgentListUnreadCount,
  useAgentListUnreadThreads,
  useAgentListWaitReason,
} from "@/features/workspace/components/use-agent-activity";
import { type MobileAgent, useMobileWorkspaceSelector } from "@/features/workspace/context/mobile-workspace-context";
import { isAndroid, longPressDelay } from "@/shared/lib/platform";
import { useText } from "@/shared/lib/text";
import { typeScale } from "@/shared/lib/type-scale";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const PINNED_LAYOUT = LinearTransition.duration(220).easing(EASE_IN_OUT).reduceMotion(ReduceMotion.System);
const PINNED_ITEM_LAYOUT = CurvedTransition.duration(240)
  .easingX(EASE_IN_OUT)
  .easingY(EASE_IN_OUT)
  .reduceMotion(ReduceMotion.System);
const PINNED_ENTER = FadeIn.duration(180).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const PINNED_EXIT = FadeOut.duration(140).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const PINNED_COLUMNS = 4;
const PINNED_PADDING_X = 12;

/**
 * The pinned agents, then `children`: the pinned channels. `animateLayout` false stops the grid from
 * animating to a new place, while something above it changes height on every frame.
 */
export function PinnedAgentsGrid({
  agents,
  heroAgent = null,
  animateLayout = true,
  dropZone = false,
  children,
}: PropsWithChildren<{
  agents: MobileAgent[];
  /**
   * The calm look's main agent, drawn as the big face above the other pins, as in the design preview.
   * Home picks it; it is not in `agents`. Null in the current look.
   */
  heroAgent?: MobileAgent | null;
  animateLayout?: boolean;
  /** Shows an empty place for a new pin, while the user drags a chat and nothing is pinned. */
  dropZone?: boolean;
}>) {
  const dropTarget = useChatDropTarget(PIN_AREA_KEY);
  // The calm look centers the pins under the main agent.
  const calm = useCalmRows();
  const heroPinned = useMobileWorkspaceSelector(({ pinnedAgentIds }) =>
    heroAgent ? pinnedAgentIds.includes(heroAgent.id) : false,
  );
  return (
    <Animated.View layout={animateLayout ? PINNED_LAYOUT : undefined}>
      {heroAgent || agents.length > 0 || children ? (
        <Animated.View exiting={PINNED_EXIT} style={{ width: "100%" }}>
          <View
            ref={dropTarget}
            collapsable={false}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: calm ? "center" : undefined,
              rowGap: 18,
              paddingHorizontal: PINNED_PADDING_X,
              paddingTop: 14,
              paddingBottom: 18,
            }}
          >
            {/* The main agent sits inside the pin area, on its own line, so a chat can still be dropped
                on the pins when it is the only one. */}
            {heroAgent ? (
              <View style={{ width: "100%", alignItems: "center" }}>
                <PinnedAgentItem key={heroAgent.id} agent={heroAgent} hero pinned={heroPinned} />
              </View>
            ) : null}
            {agents.map((agent) => (
              <PinnedAgentItem key={agent.id} agent={agent} />
            ))}
            {children}
          </View>
        </Animated.View>
      ) : dropZone ? (
        <PinDropZone dropTarget={dropTarget} />
      ) : null}
    </Animated.View>
  );
}

function PinDropZone({ dropTarget }: { dropTarget: ReturnType<typeof useChatDropTarget> }) {
  const { t } = useText();
  const [border] = useThemeColor(["border"]);
  return (
    <Animated.View entering={PINNED_ENTER} exiting={PINNED_EXIT} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      <View
        ref={dropTarget}
        collapsable={false}
        className="h-24 items-center justify-center rounded-3xl border-2"
        style={{ borderColor: border, borderStyle: "dashed" }}
      >
        <Typography.Paragraph className="text-muted" style={typeScale.caption}>
          {t("mobile.agent.drag.pinHere")}
        </Typography.Paragraph>
      </View>
    </Animated.View>
  );
}

const PinnedAgentItem = memo(function PinnedAgentItem({
  agent,
  hero = false,
  pinned = true,
}: {
  agent: MobileAgent;
  hero?: boolean;
  /** False for the calm look's main agent when it is not pinned: a drag of it then pins it. */
  pinned?: boolean;
}) {
  const calmColors = usePreviewColors();
  const size = hero ? previewSize.heroAvatar : 64;
  const { t } = useText();
  const agentChatPreview = useAgentChatPreview(agent);
  // Each long press mounts the Android menu again, so it opens even if an earlier one did not close.
  const [menuKey, setMenuKey] = useState(0);
  const drag = useChatDrag("pin", () => ({
    chat: { kind: "agent", id: agent.id },
    pinned,
    name: agent.name,
    preview: <AgentDragPreview agent={agent} />,
  }));
  const holdMenu = useHoldMenu(drag, () => setMenuKey((key) => key + 1));
  const unreadCount = useAgentListUnreadCount(agent.id);
  const unreadThreads = useAgentListUnreadThreads(agent.id);
  const waitReason = useAgentListWaitReason(agent.id);

  const openLabel = agent.title.trim()
    ? t("mobile.agent.list.openPinnedWithTitle", { name: agent.name, title: agent.title.trim() })
    : t("mobile.agent.list.openPinned", { name: agent.name });
  const trigger = (
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
      className="w-full items-center gap-2 px-1"
      onPressIn={agentChatPreview.onPressIn}
      delayLongPress={longPressDelay}
      onLongPress={holdMenu.onLongPress}
      onPressOut={holdMenu.onPressOut}
      style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}
    >
      <AgentPinAvatar agentId={agent.id} location="pinned" size={size}>
        <BloubAvatar
          agentId={agent.id}
          serverId={agent.serverId}
          hue={agent.avatarHue}
          color={agent.avatarColor}
          seed={agent.avatarSeed}
          size={size}
          animateIdle={false}
          rings
          withThreads
        />
        {/* As on the desktop, a wait outranks the unread count in the corner of the avatar. */}
        {waitReason ? (
          <AgentWaitBadge reason={waitReason} size={22} />
        ) : unreadCount > 0 || unreadThreads ? (
          <AgentUnreadBadge count={unreadCount} avatarSize={size} />
        ) : null}
      </AgentPinAvatar>
      <View className="w-full gap-0.5">
        <Typography.Paragraph
          align="center"
          className="w-full text-text-secondary"
          numberOfLines={1}
          style={hero ? [previewType.heroLabel, { color: calmColors.title, marginTop: 2 }] : typeScale.small}
        >
          {agent.name}
        </Typography.Paragraph>
        {agent.title.trim() ? (
          <Typography.Paragraph align="center" className="w-full text-muted" numberOfLines={1} style={typeScale.small}>
            {agent.title.trim()}
          </Typography.Paragraph>
        ) : null}
      </View>
      {agentChatPreview.measurer}
    </ChatLinkPressable>
  );
  return (
    <PinnedChatItem wide={hero}>
      <ChatDragArea drag={drag} fill>
        {isAndroid ? (
          <View className="w-full">
            <Link href={{ pathname: "/chat/[agentId]", params: { agentId: agent.id } }} asChild>
              <Link.Trigger>{trigger}</Link.Trigger>
            </Link>
            {menuKey > 0 ? <AgentAndroidMenu key={menuKey} agent={agent} onClose={() => setMenuKey(0)} /> : null}
          </View>
        ) : (
          <AgentContextMenuLink agent={agent} preview={agentChatPreview.preview}>
            {trigger}
          </AgentContextMenuLink>
        )}
      </ChatDragArea>
    </PinnedChatItem>
  );
});

export function PinnedChatItem({ children, wide = false }: PropsWithChildren<{ wide?: boolean }>) {
  return (
    <Animated.View
      entering={PINNED_ENTER}
      exiting={PINNED_EXIT}
      layout={PINNED_ITEM_LAYOUT}
      style={{ width: wide ? "40%" : `${100 / PINNED_COLUMNS}%`, alignItems: "center" }}
    >
      {children}
    </Animated.View>
  );
}

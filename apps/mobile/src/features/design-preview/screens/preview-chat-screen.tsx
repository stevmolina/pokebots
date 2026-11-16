import { useLocalSearchParams, useRouter } from "expo-router";
import { Typography } from "heroui-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import AudioLines from "lucide-react-native/icons/audio-lines";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import ListChecks from "lucide-react-native/icons/list-checks";
import Mic from "lucide-react-native/icons/mic";
import Plus from "lucide-react-native/icons/plus";
import Repeat from "lucide-react-native/icons/repeat";
import { type ReactNode, useRef, useState } from "react";
import { Pressable, ScrollView, type ScrollViewInstance, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetScrollEdgeEffect } from "@/shared/components/sheet-scroll-edge-effect";
import { APP_FONT } from "@/shared/lib/app-font";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { PreviewCircleButton, PreviewFace, PreviewGlass, usePreviewColors } from "../components/preview-parts";
import { usePreviewTime } from "../components/preview-time";
import { PREVIEW_MESSAGES, type PreviewAgent, type PreviewMessage, previewAgent } from "../model/preview-data";
import {
  PREVIEW_USER_BUBBLE,
  type PreviewColors,
  previewSize as size,
  previewType as type,
} from "../model/preview-tokens";

/**
 * The calm chat: three floating controls on top, plain bubbles, time stamps between groups, quiet
 * one-line rows for tasks and routine runs, and a composer with +, the field, mic and voice or send.
 */
export function PreviewChatScreen() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const insets = useSafeAreaInsets();
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const agent = previewAgent(agentId ?? "");
  const userBubble = PREVIEW_USER_BUBBLE[agent.hue] ?? colors.accent;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [sent, setSent] = useState<PreviewMessage[]>([]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    void haptics.impact("light");
    setSent((current) => [...current, { kind: "user", text, id: `sent${current.length}` }]);
    setDraft("");
  };

  const messages = [...PREVIEW_MESSAGES, ...sent];
  const composerBottom = Math.max(size.composerBottom, insets.bottom - 3);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingTop: insets.top + size.headerButton + 24,
          paddingBottom: composerBottom + size.composerHeight + 24,
        }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message, index) => (
          <MessageView
            key={message.id}
            message={message}
            previous={messages[index - 1]}
            colors={colors}
            userBubble={userBubble}
          />
        ))}
      </ScrollView>

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
          height: composerBottom + size.composerHeight + 20,
        }}
      />

      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top,
          left: size.headerInset + insets.left,
          right: size.headerInset + insets.right,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <PreviewCircleButton label={t("mobile.workspace.preview.back")} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.icon} strokeWidth={1.8} />
        </PreviewCircleButton>
        <TitlePill agent={agent} colors={colors} />
        <PreviewCircleButton label={t("mobile.workspace.preview.more")}>
          <Ellipsis size={22} color={colors.icon} strokeWidth={2} />
        </PreviewCircleButton>
      </View>

      <KeyboardStickyView
        style={{ position: "absolute", left: 0, right: 0, bottom: composerBottom }}
        offset={{ opened: composerBottom - 8 }}
      >
        <View style={{ marginHorizontal: size.composerInset }}>
          <PreviewGlass height={size.composerHeight}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: size.composerButtonInset,
                gap: 8,
              }}
            >
              <ComposerCircle label={t("mobile.workspace.preview.attach")} fill={colors.composerButton}>
                <Plus size={20} color={colors.icon} strokeWidth={1.7} />
              </ComposerCircle>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={send}
                placeholder={t("mobile.workspace.preview.ask", { name: agent.name })}
                placeholderTextColor={colors.placeholder}
                returnKeyType="send"
                style={[type.composer, { flex: 1, fontFamily: APP_FONT, color: colors.title, paddingVertical: 0 }]}
              />
              <ComposerCircle label={t("mobile.workspace.preview.dictate")} fill={colors.composerButton}>
                <Mic size={18} color={colors.icon} strokeWidth={1.8} />
              </ComposerCircle>
              {draft.trim() ? (
                <ComposerCircle label={t("mobile.workspace.preview.send")} fill={userBubble} onPress={send}>
                  <ArrowUp size={19} color="#ffffff" strokeWidth={2.4} />
                </ComposerCircle>
              ) : (
                <ComposerCircle label={t("mobile.workspace.preview.voice", { name: agent.name })} fill={userBubble}>
                  <AudioLines size={19} color="#ffffff" strokeWidth={2.2} />
                </ComposerCircle>
              )}
            </View>
          </PreviewGlass>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function TitlePill({ agent, colors }: { agent: PreviewAgent; colors: PreviewColors }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={agent.name} onPress={() => void haptics.selection()}>
      <PreviewGlass height={size.titlePillHeight}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: size.titlePillPaddingLeft,
            paddingRight: size.titlePillPaddingRight,
          }}
        >
          <PreviewFace agent={agent} size={size.titlePillAvatar} />
          <Typography numberOfLines={1} style={[type.chatTitle, { color: colors.title, marginLeft: 9 }]}>
            {agent.name}
          </Typography>
        </View>
      </PreviewGlass>
    </Pressable>
  );
}

function ComposerCircle({
  label,
  fill,
  onPress,
  children,
}: {
  label: string;
  fill: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={() => {
        void haptics.selection();
        onPress?.();
      }}
      style={({ pressed }) => ({
        width: size.composerButton,
        height: size.composerButton,
        borderRadius: size.composerButton / 2,
        backgroundColor: fill,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** The space above a message: wide after a time stamp or a change of speaker, narrow inside a group. */
function gapBefore(message: PreviewMessage, previous: PreviewMessage | undefined) {
  if (!previous) return 0;
  if (message.kind === "stamp" || previous.kind === "stamp") return size.stampGap;
  const side = (m: PreviewMessage) => (m.kind === "user" ? "user" : "agent");
  return side(message) === side(previous) ? size.bubbleGap : size.groupGap;
}

function MessageView({
  message,
  previous,
  colors,
  userBubble,
}: {
  message: PreviewMessage;
  previous: PreviewMessage | undefined;
  colors: PreviewColors;
  userBubble: string;
}) {
  const { t } = useText();
  const time = usePreviewTime();
  const marginTop = gapBefore(message, previous);
  const bubble = {
    borderRadius: size.bubbleRadius,
    borderCurve: "continuous" as const,
    paddingHorizontal: size.bubblePaddingX,
    paddingVertical: size.bubblePaddingY,
  };
  switch (message.kind) {
    case "stamp":
      return (
        <Typography style={[type.stamp, { marginTop, color: colors.time, textAlign: "center" }]}>
          {time.stamp(message.minutesAgo)}
        </Typography>
      );
    case "user":
      return (
        <View
          style={[
            bubble,
            {
              marginTop,
              alignSelf: "flex-end",
              marginLeft: size.userBubbleLeftGap,
              marginRight: size.bubbleInset,
              backgroundColor: userBubble,
            },
          ]}
        >
          <Typography style={[type.message, { color: "#ffffff" }]}>{message.text}</Typography>
        </View>
      );
    case "agent":
    case "list":
      return (
        <View
          style={[
            bubble,
            {
              marginTop,
              alignSelf: "flex-start",
              marginLeft: size.bubbleInset,
              marginRight: size.agentBubbleRightGap,
              backgroundColor: colors.agentBubble,
            },
          ]}
        >
          {message.kind === "agent" ? (
            <Typography style={[type.message, { color: colors.agentText }]}>{message.text}</Typography>
          ) : (
            // One text block, so the bubble takes the width of its longest line like a plain reply.
            <Typography style={[type.message, { color: colors.agentText }]}>
              {[message.intro, ...message.items.map((item) => `•  ${item}`)].join("\n")}
            </Typography>
          )}
        </View>
      );
    case "tasks":
      return (
        <QuietLine
          marginTop={marginTop}
          colors={colors}
          icon={<ListChecks size={15} color={colors.quietLine} strokeWidth={1.8} />}
        >
          {t("mobile.workspace.preview.tasks", { done: message.done, total: message.total })}
        </QuietLine>
      );
    case "routine":
      return (
        <QuietLine
          marginTop={marginTop}
          colors={colors}
          icon={<Repeat size={14} color={colors.quietLine} strokeWidth={1.8} />}
        >
          {t("mobile.workspace.preview.routineRun", { name: message.name, duration: message.duration })}
        </QuietLine>
      );
  }
}

/** One gray line for machinery (tasks, a routine run). A tap opens its sheet in a later batch. */
function QuietLine({
  marginTop,
  colors,
  icon,
  children,
}: {
  marginTop: number;
  colors: PreviewColors;
  icon: ReactNode;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void haptics.selection()}
      style={({ pressed }) => ({
        marginTop,
        marginLeft: size.bubbleInset + 4,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      {icon}
      <Typography style={[type.quietLine, { color: colors.quietLine }]}>{children}</Typography>
      <ChevronRight size={14} color={colors.quietLine} strokeWidth={1.8} />
    </Pressable>
  );
}

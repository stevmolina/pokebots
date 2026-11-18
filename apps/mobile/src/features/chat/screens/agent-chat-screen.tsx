import { isAgentTaskOpen } from "@openbot/team-client/agent-tasks";
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native";
import { useThemeColor } from "heroui-native/hooks";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileChatView } from "@/features/chat/components/agent-chat-view";
import { useLeaveChat } from "@/features/chat/components/use-leave-chat";
import { mainSession, setMainSession } from "@/features/chat/model/main-session";
import { noteChatOpened } from "@/features/quick-actions/model/recent-agents";
import {
  type MobileAgent,
  useMobileWorkspaceReader,
  useMobileWorkspaceSelector,
} from "@/features/workspace/context/mobile-workspace-context";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { MIRROR_IN_RTL } from "@/shared/lib/text-direction";

export function AgentChatScreen() {
  const { t } = useText();
  const leaveChat = useLeaveChat();

  // `focusAt` changes when a pinned message opens again, so the chat goes to it again.
  const { agentId, messageId, focusAt } = useLocalSearchParams<{
    agentId: string;
    messageId?: string;
    focusAt?: string;
  }>();
  const foreground = useThemeColor("foreground");
  const insets = useSafeAreaInsets();
  const resolvedAgentId = Array.isArray(agentId) ? agentId[0] : agentId;
  const resolvedMessageId = Array.isArray(messageId) ? messageId[0] : messageId;
  // Only this agent: a change elsewhere in the workspace does not render the whole chat again.
  const agent = useMobileWorkspaceSelector((current) =>
    current.agents.find((candidate) => candidate.id === resolvedAgentId),
  );
  const openedAgentId = agent?.id;
  // The app icon offers the chats that the user opened last.
  useFocusEffect(
    useCallback(() => {
      if (openedAgentId) noteChatOpened(openedAgentId);
    }, [openedAgentId]),
  );

  if (agent) {
    return (
      <AgentChatVisit
        // A new message, such as the source of a branch, opens the chat again at that message.
        key={`${agent.serverId}:${agent.id}:${resolvedMessageId ?? ""}:${focusAt ?? ""}`}
        agent={agent}
        focusMessageId={resolvedMessageId || undefined}
        onLeave={leaveChat}
      />
    );
  }

  return (
    <View
      className="flex-1 items-center justify-center gap-5 bg-background"
      style={{ paddingLeft: insets.left + 32, paddingRight: insets.right + 32 }}
    >
      <Typography.Heading type="h4" align="center">
        {t("mobile.chat.agentUnavailable.title")}
      </Typography.Heading>
      <Typography.Paragraph align="center" className="text-text-secondary">
        {t("mobile.chat.agentUnavailable.body")}
      </Typography.Paragraph>
      <Pressable
        accessibilityRole="button"
        className="min-h-12 flex-row items-center gap-2 rounded-full bg-control px-5"
        onPress={() => {
          void haptics.impact("soft");
          leaveChat();
        }}
      >
        <ArrowLeft color={String(foreground)} size={20} strokeWidth={2} style={MIRROR_IN_RTL} />
        <Typography.Paragraph weight="semibold">{t("mobile.chat.agentUnavailable.goBack")}</Typography.Paragraph>
      </Pressable>
    </View>
  );
}

const SESSION_LOOKUP_MS = 1_500;

function AgentChatVisit({
  agent,
  focusMessageId,
  onLeave,
}: {
  agent: MobileAgent;
  focusMessageId?: string;
  onLeave: () => void;
}) {
  const { id: agentId, serverId } = agent;
  const focused = useIsFocused();
  const workspace = useMobileWorkspaceReader();
  const canLoadTasks = useMobileWorkspaceSelector(
    (current) =>
      current.servers.some((server) => server.id === serverId && server.state === "online") &&
      current.canUseTasks(serverId),
  );
  const [savedTask] = useState(() => (focusMessageId ? null : mainSession(serverId, agentId)));
  const [entry, setEntry] = useState<"resolve" | "thread" | "return" | "chat">(savedTask ? "resolve" : "chat");

  useEffect(() => {
    // Keep the chat unmounted under the saved thread. Back opens it once.
    if (entry === "thread" && !focused) setEntry("return");
    if (entry === "return" && focused) setEntry("chat");
    if (entry !== "resolve" || !focused || !savedTask) return;
    if (!canLoadTasks) {
      setEntry("chat");
      return;
    }

    let waiting = true;
    const showChat = () => {
      waiting = false;
      setEntry("chat");
    };
    const timer = setTimeout(showChat, SESSION_LOOKUP_MS);
    workspace()
      .loadAgentTasks(agentId, serverId)
      .then(
        ({ tasks }) => {
          if (!waiting) return;
          clearTimeout(timer);
          if (mainSession(serverId, agentId) !== savedTask) {
            showChat();
            return;
          }
          if (!tasks.some((task) => task.id === savedTask && isAgentTaskOpen(task))) {
            setMainSession(serverId, agentId, null);
            showChat();
            return;
          }
          waiting = false;
          setEntry("thread");
          router.push({ pathname: "/task/[taskId]", params: { agentId, serverId, taskId: savedTask } });
        },
        () => {
          clearTimeout(timer);
          if (waiting) showChat();
        },
      );
    return () => {
      waiting = false;
      clearTimeout(timer);
    };
  }, [agentId, canLoadTasks, entry, focused, savedTask, serverId, workspace]);

  return entry === "chat" ? (
    <MobileChatView agent={agent} focusMessageId={focusMessageId} onLeave={onLeave} />
  ) : (
    <View className="flex-1 bg-background" />
  );
}

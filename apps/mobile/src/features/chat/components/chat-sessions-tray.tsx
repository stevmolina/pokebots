import type { AgentTask } from "@openbot/contracts/ipc";
import { router } from "expo-router";
import { Typography } from "heroui-native";
import { memo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { usePreviewColors } from "@/features/design-preview/components/preview-parts";
import { previewType as type } from "@/features/design-preview/model/preview-tokens";
import { agentTaskStatus } from "@/features/servers/model/agent-task-text";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { useRevealChatListEnd } from "./chat-list-end";

/**
 * The agent's active side sessions, above the composer, as the desktop "background workers" tray.
 * Closed, it is one quiet row under a small divider pill: the count and what the newest session does
 * now. A tap opens the list; each row opens its session. It shows nothing while no session runs or waits.
 * The tray sits at the end of the chat list, so an open list scrolls the chat to its end and shows in
 * full above the composer, with or without the keyboard.
 */
export const ChatSessionsTray = memo(function ChatSessionsTray({
  tasks,
  serverId,
  agentId,
}: {
  tasks: readonly AgentTask[];
  serverId: string;
  agentId: string;
}) {
  const { t } = useText();
  const colors = usePreviewColors();
  const [open, setOpen] = useState(false);
  const revealEnd = useRevealChatListEnd();
  // Set on a tap that opens the list: the next layout, with the rows, scrolls the chat to its end.
  const revealOnLayout = useRef(false);
  const active = tasks
    .filter((task) => task.state === "running" || task.state === "queued")
    // Running sessions first, then the newest.
    .sort(
      (left, right) =>
        Number(right.state === "running") - Number(left.state === "running") ||
        right.updatedAt.localeCompare(left.updatedAt),
    );
  const first = active[0];
  if (!first) return null;
  const openTask = (taskId: string) => {
    void haptics.selection();
    router.push({ pathname: "/task/[taskId]", params: { serverId, agentId, taskId } });
  };
  return (
    <View
      style={{ paddingHorizontal: 16, paddingBottom: 8 }}
      onLayout={() => {
        if (!revealOnLayout.current) return;
        revealOnLayout.current = false;
        revealEnd();
      }}
    >
      <View
        style={{
          alignSelf: "center",
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.groupSeparator,
          marginBottom: 6,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t("mobile.chat.sessionsTray.label", { count: active.length })}
        onPress={() => {
          void haptics.selection();
          revealOnLayout.current = !open;
          setOpen(!open);
        }}
        style={({ pressed }) => ({
          minHeight: 36,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accent }} />
        <Typography style={[type.quietLine, { color: colors.section }]}>
          {t("mobile.chat.sessionsTray.title", { count: active.length })}
        </Typography>
        {!open ? (
          <Typography numberOfLines={1} style={[type.quietLine, { color: colors.quietLine, flex: 1 }]}>
            {`${first.title} · ${agentTaskStatus(first, t)}`}
          </Typography>
        ) : null}
      </Pressable>
      {open
        ? active.map((task) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => openTask(task.id)}
              style={({ pressed }) => ({
                minHeight: 36,
                justifyContent: "center",
                paddingLeft: 15,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Typography numberOfLines={1} style={[type.quietLine, { color: colors.title }]}>
                {task.title}
              </Typography>
              <Typography numberOfLines={1} style={[type.rowDetail, { color: colors.quietLine }]}>
                {agentTaskStatus(task, t)}
              </Typography>
            </Pressable>
          ))
        : null}
    </View>
  );
});

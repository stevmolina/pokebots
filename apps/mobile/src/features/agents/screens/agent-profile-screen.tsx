import { avatarHeadColor } from "@openbot/brand/bloub-avatar";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StackActions } from "expo-router/react-navigation";
import { Typography } from "heroui-native";
import CalendarClock from "lucide-react-native/icons/calendar-clock";
import LibraryBig from "lucide-react-native/icons/library-big";
import Monitor from "lucide-react-native/icons/monitor";
import { Pressable, View } from "react-native";
import { AgentNotificationLevelRow } from "@/features/agents/components/agent-chat-settings";
import { BloubAvatarPreview } from "@/features/agents/components/bloub-avatar";
import { AgentCalmProfile } from "@/features/agents/screens/agent-calm-profile";
import { AgentSessionsSection } from "@/features/chat/components/agent-sessions-section";
import { DRAFT_THREAD_ID, MAIN_THREAD_ID } from "@/features/chat/components/chat-thread-menu";
import { setMainSession, useMainSession } from "@/features/chat/model/main-session";
import { useCalmLook } from "@/features/design-preview/model/calm-look";
import { SettingsContent, SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { RowIcon } from "@/features/settings/components/settings-row-icon";
import { useMobileWorkspace, useMobileWorkspaceSelector } from "@/features/workspace/context/mobile-workspace-context";
import { serverRowState } from "@/features/workspace/model/server-row-state";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";

/** The route names in the app stack: `app/(app)/task/[taskId].tsx` and `app/(app)/server-tasks.tsx`. */
const TASK_ROUTE = "task/[taskId]";
const TASKS_ROUTE = "server-tasks";
/** The sessions that the profile shows before "All sessions". */
const SESSIONS_SHOWN = 5;

/**
 * The agent's profile, calm as a contact card: its face, name and one line about it, an "Edit" pill
 * that opens every setting, its newest sessions, one card with its library, computer and routines, and
 * its notifications. Nothing moved away: the rest is behind "Edit".
 */
export function AgentProfileScreen() {
  const { t } = useText();
  // The stack that presents this sheet. The sheet has its own stack inside.
  const sheetStack = useNavigation().getParent();
  const { agentId, serverId: serverParam } = useLocalSearchParams<{ agentId: string; serverId?: string }>();
  const workspace = useMobileWorkspace();
  const serverId = serverParam ?? workspace.activeServer.id;
  const agent = workspace.agents.find((candidate) => candidate.id === agentId && candidate.serverId === serverId);
  const tasksSupported = useMobileWorkspaceSelector((current) => current.canUseTasks(serverId));
  const computer = useMobileWorkspaceSelector((current) =>
    serverRowState(current, serverId, (checks) => checks.canControlComputer(serverId)),
  );
  const mainId = useMainSession(serverId, agentId) ?? MAIN_THREAD_ID;
  // The new design draws the profile of the design preview.
  const calm = useCalmLook();
  if (!agent)
    return (
      <SettingsContent>
        <Typography.Paragraph>{t("mobile.agent.edit.gone")}</Typography.Paragraph>
      </SettingsContent>
    );
  if (calm) return <AgentCalmProfile agent={agent} />;
  const params = { agentId: agent.id, serverId: agent.serverId };
  const push = (
    pathname: "/agent-info/[agentId]/edit" | "/agent-info/[agentId]/library" | "/agent-info/[agentId]/routines",
  ) => {
    void haptics.impact("soft");
    router.push({ pathname, params });
  };
  /** Opens a session over the chat, and makes it the main session. */
  const openSession = (id: string) => {
    void haptics.selection();
    if (id === MAIN_THREAD_ID) {
      setMainSession(serverId, agentId, null);
      router.dismissTo({ pathname: "/chat/[agentId]", params: { agentId } });
      return;
    }
    if (id !== DRAFT_THREAD_ID) setMainSession(serverId, agentId, id);
    sheetStack?.dispatch(StackActions.replace(TASK_ROUTE, { serverId, agentId, taskId: id }));
  };
  const line = agent.title.trim() || agent.description.trim();
  return (
    <SettingsContent>
      <View className="items-center gap-2">
        <BloubAvatarPreview
          agentId={agent.id}
          serverId={agent.serverId}
          seed={agent.avatarSeed}
          hue={agent.avatarHue}
          color={agent.avatarColor}
          size={112}
        />
        <Typography.Heading type="h3" align="center" numberOfLines={1}>
          {agent.name}
        </Typography.Heading>
        {line ? (
          <Typography.Paragraph align="center" className="px-6 text-grouped-secondary" numberOfLines={1}>
            {line}
          </Typography.Paragraph>
        ) : null}
        <Pressable
          accessibilityRole="button"
          className="mt-1 min-h-9 items-center justify-center rounded-full bg-control px-5"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          onPress={() => push("/agent-info/[agentId]/edit")}
        >
          <Typography.Paragraph weight="medium">{t("mobile.agent.profile.edit")}</Typography.Paragraph>
        </Pressable>
      </View>
      {tasksSupported ? (
        <AgentSessionsSection
          serverId={serverId}
          agentId={agentId}
          activeId={mainId}
          color={avatarHeadColor(agent.avatarSeed, agent.avatarHue, agent.avatarColor)}
          limit={SESSIONS_SHOWN}
          title={t("mobile.chat.sessions.title")}
          onOpen={openSession}
          onNew={() => openSession(DRAFT_THREAD_ID)}
          onAll={() => {
            void haptics.impact("soft");
            sheetStack?.dispatch(StackActions.replace(TASKS_ROUTE, { serverId, agentId }));
          }}
        />
      ) : null}
      <SettingsSection>
        <SettingsRow leading={<RowIcon icon={LibraryBig} />} onPress={() => push("/agent-info/[agentId]/library")}>
          <Typography.Paragraph>{t("mobile.agent.profile.library")}</Typography.Paragraph>
        </SettingsRow>
        {computer === "hidden" ? null : (
          <SettingsRow
            leading={<RowIcon icon={Monitor} />}
            disabled={computer === "disabled"}
            onPress={() => {
              void haptics.impact("soft");
              router.push({ pathname: "/remote-desktop/[serverId]", params: { serverId } });
            }}
          >
            <Typography.Paragraph>{t("mobile.agent.profile.computer")}</Typography.Paragraph>
          </SettingsRow>
        )}
        <SettingsRow leading={<RowIcon icon={CalendarClock} />} onPress={() => push("/agent-info/[agentId]/routines")}>
          <Typography.Paragraph>{t("mobile.agent.info.routines.title")}</Typography.Paragraph>
        </SettingsRow>
      </SettingsSection>
      {agent.notifications !== undefined && workspace.canSetAgentNotificationLevel(agent.serverId) ? (
        <SettingsSection footer={t("mobile.agent.profile.notificationsFooter")}>
          <AgentNotificationLevelRow agent={agent} />
        </SettingsSection>
      ) : null}
    </SettingsContent>
  );
}

/** The agent's library: what it keeps. Its files, its memories and, for an admin, the shared tables. */
export function AgentLibraryScreen() {
  const { t } = useText();
  const { agentId, serverId: serverParam } = useLocalSearchParams<{ agentId: string; serverId?: string }>();
  const workspace = useMobileWorkspace();
  const serverId = serverParam ?? workspace.activeServer.id;
  const params = { agentId, serverId };
  const push = (
    pathname: "/agent-info/[agentId]/files" | "/agent-info/[agentId]/memories" | "/agent-info/[agentId]/tables",
  ) => {
    void haptics.impact("soft");
    router.push({ pathname, params });
  };
  return (
    <SettingsContent>
      <SettingsSection>
        <SettingsRow onPress={() => push("/agent-info/[agentId]/files")}>
          <Typography.Paragraph>{t("mobile.agent.info.files.title")}</Typography.Paragraph>
        </SettingsRow>
        <SettingsRow onPress={() => push("/agent-info/[agentId]/memories")}>
          <Typography.Paragraph>{t("mobile.agent.info.memories.title")}</Typography.Paragraph>
        </SettingsRow>
        {workspace.canManageSharedTables(serverId) ? (
          <SettingsRow onPress={() => push("/agent-info/[agentId]/tables")}>
            <Typography.Paragraph>{t("mobile.agent.tables.title")}</Typography.Paragraph>
          </SettingsRow>
        ) : null}
      </SettingsSection>
    </SettingsContent>
  );
}

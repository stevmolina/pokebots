import { avatarHeadColor } from "@pokebots/brand/bloub-avatar";
import { canAdministerServer, providerDisplayName } from "@pokebots/contracts/ipc";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useNavigation } from "expo-router";
import { StackActions } from "expo-router/react-navigation";
import { Typography } from "heroui-native";
import CalendarClock from "lucide-react-native/icons/calendar-clock";
import LibraryBig from "lucide-react-native/icons/library-big";
import Monitor from "lucide-react-native/icons/monitor";
import Pencil from "lucide-react-native/icons/pencil";
import Puzzle from "lucide-react-native/icons/puzzle";
import { useState } from "react";
import { View } from "react-native";
import { AgentNotificationLevelRow } from "@/features/agents/components/agent-chat-settings";
import { useAgentDelete } from "@/features/agents/components/agent-delete-section";
import { BloubAvatarPreview } from "@/features/agents/components/bloub-avatar";
import { UsageSegments } from "@/features/agents/components/usage-segments";
import { agentSkillsQuery } from "@/features/agents/model/agent-skills-query";
import { useQueryScope } from "@/features/auth/context/mobile-session-context";
import { AgentSessionsSection } from "@/features/chat/components/agent-sessions-section";
import { DRAFT_THREAD_ID, MAIN_THREAD_ID } from "@/features/chat/components/chat-thread-menu";
import { setMainSession, useMainSession } from "@/features/chat/model/main-session";
import { ProviderMark } from "@/features/servers/components/provider-mark";
import { SettingsContent, SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { RowIcon } from "@/features/settings/components/settings-row-icon";
import {
  type MobileAgent,
  useMobileWorkspace,
  useMobileWorkspaceSelector,
} from "@/features/workspace/context/mobile-workspace-context";
import { queryKeys } from "@/features/workspace/model/query-keys";
import { serverRowState } from "@/features/workspace/model/server-row-state";
import { showsOnline } from "@/features/workspace/model/server-status";
import { haptics } from "@/shared/lib/haptics";
import { isIOS } from "@/shared/lib/platform";
import { useText } from "@/shared/lib/text";

type ProfilePage =
  | "/agent-info/[agentId]/edit"
  | "/agent-info/[agentId]/library"
  | "/agent-info/[agentId]/routines"
  | "/agent-info/[agentId]/models"
  | "/agent-info/[agentId]/skills";

/** The route names in the app stack: `app/(app)/task/[taskId].tsx` and `app/(app)/server-tasks.tsx`. */
const TASK_ROUTE = "task/[taskId]";
const TASKS_ROUTE = "server-tasks";
/** The sessions that the profile shows before "All sessions", as the profile of today's look. */
const SESSIONS_SHOWN = 3;

/** The three tabs of the profile, as the desktop details pane. */
type ProfileTab = "activity" | "library" | "settings";

/**
 * The agent's profile in the new design: the face and the name, then three tabs, as the desktop
 * details pane. Activity has Model and Computer, the newest sessions (a tap opens one and makes it the
 * main session) and the routines. Library has the files and the skills. Settings has the profile edit
 * and the notifications. More in the bar copies the agent's ID and, for an owner or admin, deletes the
 * agent.
 */
export function AgentCalmProfile({ agent }: { agent: MobileAgent }) {
  const { t, format } = useText();
  const workspace = useMobileWorkspace();
  const queryScope = useQueryScope();
  const serverId = agent.serverId;
  const host = workspace.servers.find((server) => server.id === serverId);
  const available = showsOnline(host);
  const computer = useMobileWorkspaceSelector((current) =>
    serverRowState(current, serverId, (checks) => checks.canControlComputer(serverId)),
  );
  const manageSkills = useMobileWorkspaceSelector((current) => current.canManageAgentSkills(serverId));
  const { deleting, ask } = useAgentDelete(agent);
  const [tab, setTab] = useState<ProfileTab>("activity");
  // The stack that presents this sheet. The sheet has its own stack inside.
  const sheetStack = useNavigation().getParent();
  // While the server reconnects after a reload, its capabilities are not known yet. A task list that
  // the phone kept for this agent shows the host has threads, so the Sessions card stays.
  const hostHasTasks = useMobileWorkspaceSelector((current) => current.canUseTasks(serverId));
  const keptTasks = useQuery({
    queryKey: queryKeys.agentTasks(queryScope, serverId, agent.id),
    enabled: false,
    retry: false,
    queryFn: () => workspace.loadAgentTasks(agent.id, serverId),
    select: () => true,
  }).data;
  const tasksSupported = hostHasTasks || keptTasks === true;
  const mainId = useMainSession(serverId, agent.id) ?? MAIN_THREAD_ID;
  // The same reads as the Model, Routines and Skills pages, so each row shows what its page shows.
  const models = useQuery({
    queryKey: queryKeys.agentModels(queryScope, serverId),
    queryFn: () => workspace.loadAgentModels(serverId),
    enabled: available && Boolean(agent.provider),
    retry: false,
  });
  const routines = useQuery({
    queryKey: queryKeys.agentRecord(queryScope, serverId, agent.id, "routines"),
    queryFn: () => workspace.loadAgentRoutines(agent.id, serverId),
    enabled: available,
    retry: false,
  });
  const skills = useQuery({
    ...agentSkillsQuery(queryScope, serverId, agent.id, manageSkills, workspace.loadAgentSkills),
    enabled: available,
    retry: false,
  });
  const modelName = agent.model ? models.data?.find((option) => option.id === agent.model)?.name : undefined;
  const activeRoutines = routines.data?.filter((routine) => routine.active).length;
  const skillCount = skills.data?.length;
  const canDelete = Boolean(host && canAdministerServer(host.role));
  const params = { agentId: agent.id, serverId };
  const push = (pathname: ProfilePage) => {
    void haptics.impact("soft");
    router.push({ pathname, params });
  };
  /** Opens a session over the chat and makes it the main session, as the profile of today's look does. */
  const openSession = (id: string) => {
    void haptics.selection();
    if (id === MAIN_THREAD_ID) {
      setMainSession(serverId, agent.id, null);
      router.dismissTo({ pathname: "/chat/[agentId]", params: { agentId: agent.id } });
      return;
    }
    if (id !== DRAFT_THREAD_ID) setMainSession(serverId, agent.id, id);
    sheetStack?.dispatch(StackActions.replace(TASK_ROUTE, { serverId, agentId: agent.id, taskId: id }));
  };
  return (
    <SettingsContent>
      {isIOS ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={t("mobile.chat.header.more")}>
            <Stack.Toolbar.MenuAction
              icon="doc.on.doc"
              onPress={() => void Clipboard.setStringAsync(agent.id).then(() => void haptics.notification())}
            >
              {t("mobile.agent.menu.copyId")}
            </Stack.Toolbar.MenuAction>
            {canDelete ? (
              <Stack.Toolbar.MenuAction icon="trash" destructive disabled={deleting || !available} onPress={ask}>
                {t("common.delete")}
              </Stack.Toolbar.MenuAction>
            ) : null}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <View className="items-center gap-2">
        <BloubAvatarPreview
          agentId={agent.id}
          serverId={serverId}
          seed={agent.avatarSeed}
          hue={agent.avatarHue}
          color={agent.avatarColor}
          size={112}
        />
        <Typography.Heading type="h3" align="center" numberOfLines={1}>
          {agent.name}
        </Typography.Heading>
      </View>
      <UsageSegments
        options={[
          { value: "activity", label: t("mobile.agent.profile.tab.activity") },
          { value: "library", label: t("mobile.agent.profile.library") },
          { value: "settings", label: t("mobile.agent.profile.tab.settings") },
        ]}
        value={tab}
        accessibilityLabel={t("mobile.agent.profile.tab.label")}
        onChange={setTab}
      />
      {tab === "activity" ? (
        <SettingsSection>
          {agent.provider && !agent.foreignProvider ? (
            <SettingsRow
              leading={<ProviderMark provider={agent.provider} size={22} />}
              value={modelName ?? agent.model ?? providerDisplayName(agent.provider)}
              onPress={() => push("/agent-info/[agentId]/models")}
            >
              <Typography.Paragraph>{t("mobile.agent.runtime.model")}</Typography.Paragraph>
            </SettingsRow>
          ) : null}
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
        </SettingsSection>
      ) : null}
      {tab === "activity" && tasksSupported ? (
        <AgentSessionsSection
          serverId={serverId}
          agentId={agent.id}
          activeId={mainId}
          color={avatarHeadColor(agent.avatarSeed, agent.avatarHue, agent.avatarColor)}
          limit={SESSIONS_SHOWN}
          title={t("mobile.chat.sessions.title")}
          onOpen={openSession}
          onNew={() => openSession(DRAFT_THREAD_ID)}
          onAll={() => {
            void haptics.impact("soft");
            sheetStack?.dispatch(StackActions.replace(TASKS_ROUTE, { serverId, agentId: agent.id }));
          }}
        />
      ) : null}
      {tab === "activity" ? (
        <SettingsSection>
          <SettingsRow
            leading={<RowIcon icon={CalendarClock} />}
            value={
              activeRoutines === undefined
                ? undefined
                : t("mobile.workspace.preview.routinesActive", { count: activeRoutines })
            }
            onPress={() => push("/agent-info/[agentId]/routines")}
          >
            <Typography.Paragraph>{t("mobile.agent.info.routines.title")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
      ) : null}
      {tab === "library" ? (
        <SettingsSection>
          <SettingsRow leading={<RowIcon icon={LibraryBig} />} onPress={() => push("/agent-info/[agentId]/library")}>
            <Typography.Paragraph>{t("mobile.agent.profile.files")}</Typography.Paragraph>
          </SettingsRow>
          <SettingsRow
            leading={<RowIcon icon={Puzzle} />}
            value={skillCount === undefined ? undefined : format.number(skillCount)}
            onPress={() => push("/agent-info/[agentId]/skills")}
          >
            <Typography.Paragraph>{t("mobile.agent.info.skills.title")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
      ) : null}
      {tab === "settings" ? (
        <SettingsSection>
          <SettingsRow leading={<RowIcon icon={Pencil} />} onPress={() => push("/agent-info/[agentId]/edit")}>
            <Typography.Paragraph>{t("mobile.agent.profile.editProfile")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
      ) : null}
      {tab === "settings" && agent.notifications !== undefined && workspace.canSetAgentNotificationLevel(serverId) ? (
        <SettingsSection footer={t("mobile.agent.profile.notificationsFooter")}>
          <AgentNotificationLevelRow agent={agent} />
        </SettingsSection>
      ) : null}
    </SettingsContent>
  );
}

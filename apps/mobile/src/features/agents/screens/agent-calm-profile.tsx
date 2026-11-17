import { canAdministerServer, providerDisplayName } from "@openbot/contracts/ipc";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router, Stack } from "expo-router";
import { Typography } from "heroui-native";
import CalendarClock from "lucide-react-native/icons/calendar-clock";
import LibraryBig from "lucide-react-native/icons/library-big";
import Monitor from "lucide-react-native/icons/monitor";
import Puzzle from "lucide-react-native/icons/puzzle";
import { Pressable, View } from "react-native";
import { AgentNotificationLevelRow } from "@/features/agents/components/agent-chat-settings";
import { useAgentDelete } from "@/features/agents/components/agent-delete-section";
import { BloubAvatarPreview } from "@/features/agents/components/bloub-avatar";
import { agentSkillsQuery } from "@/features/agents/model/agent-skills-query";
import { useQueryScope } from "@/features/auth/context/mobile-session-context";
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

/**
 * The agent's profile in the new design, as the design preview draws it: the face, the name and an
 * Edit pill; then Model, Library and Computer; then "Set up" with the routines and skills and their
 * counts; then the notifications. The sessions are in the chat's More sheet. More in the bar copies the
 * agent's ID and, for an owner or admin, deletes the agent.
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
        <Pressable
          accessibilityRole="button"
          className="mt-1 min-h-9 items-center justify-center rounded-full bg-control px-5"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          onPress={() => push("/agent-info/[agentId]/edit")}
        >
          <Typography.Paragraph weight="medium">{t("mobile.agent.profile.edit")}</Typography.Paragraph>
        </Pressable>
      </View>
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
      </SettingsSection>
      <SettingsSection title={t("mobile.workspace.preview.setUp")}>
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
        <SettingsRow
          leading={<RowIcon icon={Puzzle} />}
          value={skillCount === undefined ? undefined : format.number(skillCount)}
          onPress={() => push("/agent-info/[agentId]/skills")}
        >
          <Typography.Paragraph>{t("mobile.agent.info.skills.title")}</Typography.Paragraph>
        </SettingsRow>
      </SettingsSection>
      {agent.notifications !== undefined && workspace.canSetAgentNotificationLevel(serverId) ? (
        <SettingsSection footer={t("mobile.agent.profile.notificationsFooter")}>
          <AgentNotificationLevelRow agent={agent} />
        </SettingsSection>
      ) : null}
    </SettingsContent>
  );
}

import { avatarHeadColor } from "@openbot/brand/bloub-avatar";
import { providerDisplayName } from "@openbot/contracts/ipc";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StackActions } from "expo-router/react-navigation";
import { Typography } from "heroui-native";
import Info from "lucide-react-native/icons/info";
import Pin from "lucide-react-native/icons/pin";
import { AgentSessionsSection } from "@/features/chat/components/agent-sessions-section";
import { DRAFT_THREAD_ID, MAIN_THREAD_ID } from "@/features/chat/components/chat-thread-menu";
import { useMessagePinsEnabled } from "@/features/chat/components/use-message-pins";
import { setMainSession } from "@/features/chat/model/main-session";
import { useCalmLook } from "@/features/design-preview/model/calm-look";
import { ProviderMark } from "@/features/servers/components/provider-mark";
import { SettingsContent, SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { RowIcon } from "@/features/settings/components/settings-row-icon";
import { useMobileWorkspace } from "@/features/workspace/context/mobile-workspace-context";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";

/** The route names in the app stack: `app/(app)/task/[taskId].tsx` and `app/(app)/server-tasks.tsx`. */
const TASK_ROUTE = "task/[taskId]";
const TASKS_ROUTE = "server-tasks";
const AGENT_INFO_ROUTE = "agent-info/[agentId]";
const PINS_ROUTE = "pinned-messages";

/**
 * The sessions of an agent, from its name in the chat header. A tap opens a session and makes it the
 * main session, which the agent shows when it opens. "New session" starts one, and it becomes the main
 * session with its first message.
 */
export function AgentSessionsScreen() {
  const { t } = useText();
  // The stack that presents this sheet. The sheet has its own stack inside.
  const sheetStack = useNavigation().getParent();
  const { serverId, agentId, activeId } = useLocalSearchParams<{
    serverId: string;
    agentId: string;
    activeId: string;
  }>();
  const { agents } = useMobileWorkspace();
  const agent = agents.find((item) => item.id === agentId && item.serverId === serverId);
  const current = activeId || MAIN_THREAD_ID;
  /** The screen under the sheet shows a side thread or a new session, not the agent's own chat. */
  const inThread = current !== MAIN_THREAD_ID;
  // The new design puts the agent's model on top and the pinned messages under the sessions, as the
  // design preview does; the agent's info is on the name in the chat header.
  const calm = useCalmLook();
  const pinsEnabled = useMessagePinsEnabled(serverId);

  const open = (id: string) => {
    void haptics.selection();
    if (id !== DRAFT_THREAD_ID) setMainSession(serverId, agentId, id === MAIN_THREAD_ID ? null : id);
    if (id === current) {
      router.back();
      return;
    }
    if (id === MAIN_THREAD_ID) {
      // The agent's chat is under the thread, or a notification opened the thread with no chat under it.
      router.dismissTo({ pathname: "/chat/[agentId]", params: { agentId } });
      return;
    }
    if (inThread) {
      // The thread on the screen takes the new session, so Back still returns to the agent's chat.
      router.back();
      router.setParams<"/task/[taskId]">({ taskId: id });
      return;
    }
    sheetStack?.dispatch(StackActions.replace(TASK_ROUTE, { serverId, agentId, taskId: id }));
  };

  return (
    <SettingsContent>
      {calm && agent?.provider && !agent.foreignProvider ? (
        <SettingsSection>
          <SettingsRow
            leading={<ProviderMark provider={agent.provider} size={22} />}
            value={agent.model ?? providerDisplayName(agent.provider)}
            onPress={() => {
              void haptics.impact("soft");
              // A full address: the profile opens under the model list, so Back goes to the profile.
              router.replace({ pathname: "/agent-info/[agentId]/models", params: { agentId, serverId } });
            }}
          >
            <Typography.Paragraph>{t("mobile.agent.runtime.model")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
      ) : null}
      {agent ? (
        <AgentSessionsSection
          serverId={serverId}
          agentId={agentId}
          activeId={current}
          color={avatarHeadColor(agent.avatarSeed, agent.avatarHue, agent.avatarColor)}
          onOpen={open}
          onNew={() => open(DRAFT_THREAD_ID)}
          onAll={() => {
            void haptics.impact("soft");
            sheetStack?.dispatch(StackActions.replace(TASKS_ROUTE, { serverId, agentId }));
          }}
        />
      ) : null}
      {calm ? (
        pinsEnabled ? (
          <SettingsSection>
            <SettingsRow
              leading={<RowIcon icon={Pin} />}
              onPress={() => {
                void haptics.impact("soft");
                sheetStack?.dispatch(StackActions.replace(PINS_ROUTE, { agentId, serverId }));
              }}
            >
              <Typography.Paragraph>{t("mobile.chat.pins.title")}</Typography.Paragraph>
            </SettingsRow>
          </SettingsSection>
        ) : null
      ) : (
        <SettingsSection>
          <SettingsRow
            leading={<RowIcon icon={Info} />}
            onPress={() => {
              void haptics.impact("soft");
              sheetStack?.dispatch(StackActions.replace(AGENT_INFO_ROUTE, { agentId, serverId }));
            }}
          >
            <Typography.Paragraph>{t("mobile.chat.threads.agentInfo")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
      )}
    </SettingsContent>
  );
}

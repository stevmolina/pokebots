import { foreignProvider } from "@pokebots/contracts/agent-providers";
import { agentNextProviderAccountId, workspaceAccessEnforced } from "@pokebots/contracts/ipc";
import type { ProviderModelPicker } from "@pokebots/ui/components/ProviderModelPicker";
import { useText } from "@pokebots/ui/text";
import type { ComponentProps } from "@solidjs/web";
import { usePlatform } from "../../platform";
import { shortcutPlatform } from "../shortcuts/shortcut-platform";
import { useConversationViewScope } from "./conversation-scope";

/**
 * The model picker of the open agent, as the Model row of the details pane. A model, effort,
 * provider or account chosen during a turn applies from the next turn. While it is open, ⌘1 to ⌘9
 * choose a model, as they did in the message box chip. The pane has its own Access row, so the
 * picker shows no access footer here.
 */
export function useAgentModelPicker(): () => ComponentProps<typeof ProviderModelPicker> {
  const { t } = useText();
  const platform = usePlatform();
  const {
    fastMode,
    ultrafast,
    fastModeChange,
    props,
    selectAndConfirmModel,
    selectAndConfirmReasoning,
    settingsModel,
    settingsProvider,
    settingsReasoning,
  } = useConversationViewScope();
  /**
   * The keyboard: the one that main reports on desktop. The web client has a fixed app info, so the
   * browser's guess counts there.
   */
  const keyboard = () => shortcutPlatform(platform.appInfoLoadedFromHost() ? platform.appInfo()?.platform : undefined);
  return () => {
    return {
      variant: "field",
      provider: settingsProvider(),
      foreignProvider: props.agent ? foreignProvider(props.agent.provider) : undefined,
      value: settingsModel(),
      reasoningEffort: settingsReasoning(),
      modelOptions: props.modelOptions,
      agentStatus: props.agentStatus,
      runtimeStatuses: props.providerRuntimeStatuses,
      customProviders: props.customProviders,
      customAgents: props.customAgents,
      onDownloadProvider: props.onDownloadProvider,
      onCancelProviderDownload: props.onCancelProviderDownload,
      onConnectProvider: props.onConnectProvider,
      canConnectProvider: props.canConnectProvider,
      onManageProviders: props.onManageProviders,
      disabledReason: t("conversation.header.modelsUnavailable"),
      accountChoice: true,
      providerAccountId: props.agent ? agentNextProviderAccountId(props.agent) : undefined,
      workspaceOnly: props.agent ? workspaceAccessEnforced(props.agent) : false,
      accountUsage: props.accountUsage,
      onChange: (model, provider, accountId, effort) => void selectAndConfirmModel(model, provider, accountId, effort),
      onReasoningEffortChange: (effort) => void selectAndConfirmReasoning(effort),
      fastMode: fastMode(),
      ultrafast: ultrafast(),
      onFastModeChange: fastModeChange(),
      shortcutPlatform: keyboard(),
    };
  };
}

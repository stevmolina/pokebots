import { foreignProvider } from "@openbot/contracts/agent-providers";
import { agentNextProviderAccountId } from "@openbot/contracts/ipc";
import type { ProviderModelPicker } from "@openbot/ui/components/ProviderModelPicker";
import { useText } from "@openbot/ui/text";
import type { ComponentProps } from "@solidjs/web";
import { useConversationViewScope } from "./conversation-scope";

/**
 * The model picker of the open agent, as a row of the details pane. A model, effort, provider or
 * account chosen during a turn applies from the next turn.
 */
export function useAgentModelPicker(): () => ComponentProps<typeof ProviderModelPicker> {
  const { t } = useText();
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
      accountUsage: props.accountUsage,
      onChange: (model, provider, accountId, effort) => void selectAndConfirmModel(model, provider, accountId, effort),
      onReasoningEffortChange: (effort) => void selectAndConfirmReasoning(effort),
      fastMode: fastMode(),
      ultrafast: ultrafast(),
      onFastModeChange: fastModeChange(),
    };
  };
}

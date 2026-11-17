import { PICKER_PROVIDERS } from "@openbot/contracts/agent-providers";
import {
  type AgentModelOption,
  type AgentProviderId,
  type AgentReasoningEffort,
  providerDisplayName,
} from "@openbot/contracts/ipc";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native";
import Check from "lucide-react-native/icons/check";
import { useState } from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";
import { AgentSpeedField } from "@/features/agents/components/agent-host-fields";
import { EFFORT_LABELS } from "@/features/agents/components/agent-runtime-fields";
import { useQueryScope } from "@/features/auth/context/mobile-session-context";
import { PreviewChips } from "@/features/design-preview/components/preview-page";
import { ProviderMark } from "@/features/servers/components/provider-mark";
import {
  SettingsContent,
  SettingsNote,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/settings-content";
import { useMobileWorkspace } from "@/features/workspace/context/mobile-workspace-context";
import { queryKeys } from "@/features/workspace/model/query-keys";
import { showsOnline } from "@/features/workspace/model/server-status";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";

/**
 * The agent's model in the new design, as the design preview shows it: every model of the server in
 * one list, grouped by provider under its logo, then the reasoning and the speed of the chosen model.
 * A tap saves at once, as the Runtime page saves its model. The Runtime page stays under Edit for
 * the provider account and the other settings.
 */
export function AgentCalmModelScreen() {
  const { t, errorMessage } = useText();
  const accent = String(useCSSVariable("--openbot-accent"));
  const { agentId, serverId: serverParam } = useLocalSearchParams<{ agentId: string; serverId?: string }>();
  const workspace = useMobileWorkspace();
  const queryScope = useQueryScope();
  const serverId = serverParam ?? workspace.activeServer.id;
  const agent = workspace.agents.find((candidate) => candidate.id === agentId && candidate.serverId === serverId);
  const host = workspace.servers.find((candidate) => candidate.id === serverId);
  const available = Boolean(agent && showsOnline(host));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = useQuery({
    queryKey: queryKeys.agentModels(queryScope, serverId),
    queryFn: () => workspace.loadAgentModels(serverId),
    enabled: available,
    retry: false,
  });
  if (!agent)
    return (
      <SettingsContent>
        <Typography.Paragraph>{t("mobile.agent.edit.gone")}</Typography.Paragraph>
      </SettingsContent>
    );
  // An agent of a provider that the server names itself, such as a custom agent, keeps the Runtime page.
  const groups = agent.foreignProvider ? [] : groupByProvider(models.data ?? []);
  const selected = models.data?.find((option) => option.provider === agent.provider && option.id === agent.model);

  async function choose(option: AgentModelOption): Promise<void> {
    if (!agent || saving || !available) return;
    if (option.provider === agent.provider && option.id === agent.model) return;
    void haptics.selection();
    setSaving(true);
    setError(null);
    try {
      const effort =
        agent.reasoningEffort && option.supportedReasoningEfforts.includes(agent.reasoningEffort)
          ? agent.reasoningEffort
          : option.defaultReasoningEffort;
      await workspace.updateAgent(
        { agentId: agent.id, provider: option.provider, model: option.id, reasoningEffort: effort },
        agent.serverId,
      );
      // An account belongs to one provider: a new provider uses its default account, as the Runtime page does.
      if (option.provider !== agent.provider)
        await workspace.setAgentProviderAccount({ agentId: agent.id, accountId: null }, agent.serverId);
    } catch (cause) {
      setError(errorMessage(cause, t("mobile.agent.edit.failed")));
      void haptics.notification("error");
    } finally {
      setSaving(false);
    }
  }

  async function chooseEffort(effort: AgentReasoningEffort): Promise<void> {
    if (!agent || saving || !available || effort === agent.reasoningEffort) return;
    void haptics.selection();
    setSaving(true);
    setError(null);
    try {
      await workspace.updateAgent({ agentId: agent.id, reasoningEffort: effort }, agent.serverId);
    } catch (cause) {
      setError(errorMessage(cause, t("mobile.agent.edit.failed")));
      void haptics.notification("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsContent>
      {error ? <SettingsNote>{error}</SettingsNote> : null}
      {!available ? (
        <SettingsNote>{t("mobile.agent.runtime.unavailable")}</SettingsNote>
      ) : models.isError ? (
        <SettingsSection>
          <SettingsRow disclosure={false} onPress={() => void models.refetch()}>
            <Typography.Paragraph>{t("mobile.agent.runtime.retryModels")}</Typography.Paragraph>
          </SettingsRow>
        </SettingsSection>
      ) : models.isPending ? (
        <SettingsNote>{t("mobile.agent.runtime.loadingModels")}</SettingsNote>
      ) : groups.length === 0 ? (
        <SettingsNote>{t("mobile.agent.runtime.noModels")}</SettingsNote>
      ) : (
        groups.map(({ provider, options }) => (
          <View key={provider} className="gap-2">
            <View className="flex-row items-center gap-2 px-4">
              <ProviderMark provider={provider} size={14} />
              <Typography type="body-xs" className="text-grouped-secondary">
                {providerDisplayName(provider)}
              </Typography>
            </View>
            <SettingsSection>
              {options.map((option) => {
                const on = option.provider === agent.provider && option.id === agent.model;
                return (
                  <SettingsRow
                    key={option.id}
                    checked={on}
                    disclosure={false}
                    disabled={saving}
                    leading={<ProviderMark provider={provider} size={22} />}
                    supportingText={option.description || undefined}
                    trailing={on ? <Check size={18} color={accent} strokeWidth={2} /> : null}
                    onPress={() => void choose(option)}
                  >
                    <Typography.Paragraph numberOfLines={1}>{option.name}</Typography.Paragraph>
                  </SettingsRow>
                );
              })}
            </SettingsSection>
          </View>
        ))
      )}
      {selected && selected.reasoningEffortConfigurable !== false && selected.supportedReasoningEfforts.length > 1 ? (
        <SettingsSection title={t("mobile.agent.runtime.reasoning")}>
          <View className="px-4 py-3">
            <PreviewChips
              options={selected.supportedReasoningEfforts.map((effort) => ({
                id: effort,
                label: t(EFFORT_LABELS[effort]),
              }))}
              value={agent.reasoningEffort ?? selected.defaultReasoningEffort}
              onChange={(effort) => void chooseEffort(effort)}
            />
          </View>
        </SettingsSection>
      ) : null}
      {selected?.fastServiceTier ? (
        <AgentSpeedField agent={agent} server={host} available={available} model={selected} />
      ) : null}
      <SettingsSection>
        <SettingsRow
          onPress={() => {
            void haptics.impact("soft");
            router.push({
              pathname: "/agent-info/[agentId]/runtime",
              params: { agentId: agent.id, serverId: agent.serverId },
            });
          }}
        >
          <Typography.Paragraph>{t("mobile.agent.calmModel.moreSettings")}</Typography.Paragraph>
        </SettingsRow>
      </SettingsSection>
    </SettingsContent>
  );
}

/** The server's models by provider, in the picker's provider order; each provider keeps the server's order. */
function groupByProvider(
  options: readonly AgentModelOption[],
): { provider: AgentProviderId; options: AgentModelOption[] }[] {
  const byProvider = new Map<AgentProviderId, AgentModelOption[]>();
  for (const option of options) {
    const list = byProvider.get(option.provider);
    if (list) list.push(option);
    else byProvider.set(option.provider, [option]);
  }
  const order = [
    ...PICKER_PROVIDERS,
    ...[...byProvider.keys()].filter((provider) => !PICKER_PROVIDERS.includes(provider)),
  ];
  return order.flatMap((provider) => {
    const list = byProvider.get(provider);
    return list ? [{ provider, options: list }] : [];
  });
}

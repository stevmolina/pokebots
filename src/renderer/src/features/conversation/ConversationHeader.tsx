import { isKnownAgentProvider } from "@pokebots/contracts/agent-providers";
import {
  type AgentModelId,
  type AgentProviderRef,
  type AgentReasoningEffort,
  DEFAULT_PROVIDER_ACCOUNT_ID,
  providerDisplayName,
} from "@pokebots/contracts/ipc";
import { reasoningLabel } from "@pokebots/ui/components/ProviderModelPicker";
import { findModelOption, providerAccountName } from "@pokebots/ui/components/provider-accounts";
import { ConversationHeader as SharedConversationHeader } from "@pokebots/ui/features/conversation/ConversationHeader";
import { ThreadMenu } from "@pokebots/ui/features/conversation/threads/ThreadMenu";
import type { ThreadPhoneActions } from "@pokebots/ui/features/conversation/threads/thread-types";
import { createSignal, Show } from "solid-js";
import { useConversationViewScope } from "./conversation-scope";
import { createPhoneWeb } from "./phone-web";
import { useChatPinnedMessages } from "./use-chat-pinned-messages";

const loadAgentSettingsPanel = () => import("./AgentSettingsPanel");

/** The runtime of the running turn, or of the next one, as the "After this turn" badge names it. */
interface BadgeRuntime {
  provider: AgentProviderRef;
  model: AgentModelId;
  reasoningEffort: AgentReasoningEffort;
  providerAccountId?: string | undefined;
}

import { useText } from "@pokebots/ui/text";

/** @internal Stable HMR boundary for conversation header. */
export function ConversationHeader() {
  const { t } = useText();
  const {
    actingBrowserControl,
    agentActivity,
    browserControlAgent,
    channel,
    props,
    runningTurnRuntime,
    setActiveRightPanel,
    settingsModel,
    settingsProvider,
    settingsReasoning,
    sidePanelOpen,
    sideThreadOpen,
    toggleSidePanel,
  } = useConversationViewScope();
  // The web client on a phone. A desktop window, including a narrow one, keeps the header buttons.
  const phoneWeb = createPhoneWeb();
  const [pinsRequest, setPinsRequest] = createSignal(0);
  const phoneMenu = () => phoneWeb() && props.threads !== undefined;
  /** A desktop chat with threads keeps its new session and its pins in the details pane. */
  const sessionsInPane = () => !phoneWeb() && props.threads !== undefined;
  const runningThreads = () => props.threads?.running ?? 0;
  /** The title of the open session in the header pill. The agent's own chat shows only the agent. */
  const sessionTitle = () => {
    const header = props.threads?.header;
    if (!header || !sideThreadOpen()) return undefined;
    return header.sessions.find((session) => session.id === header.activeId)?.title;
  };
  const chatPins = useChatPinnedMessages();
  /** The pins list stays in the header only on a phone, where the thread menu opens it. A desktop has it in the details pane. */
  const pinnedMessages = () => {
    const pins = phoneMenu() ? chatPins() : undefined;
    return pins ? { ...pins, openRequest: pinsRequest(), quiet: true } : undefined;
  };
  const working = () => agentActivity() === "Working";
  const providerName = (provider: AgentProviderRef) =>
    isKnownAgentProvider(provider) ? providerDisplayName(provider) : String(provider);
  const accountId = (runtime: BadgeRuntime) => runtime.providerAccountId ?? DEFAULT_PROVIDER_ACCOUNT_ID;
  const accountName = (runtime: BadgeRuntime) =>
    providerAccountName(
      t,
      props.agentStatus?.providers?.find((status) => status.id === runtime.provider)?.accounts ?? [],
      accountId(runtime),
    );
  /** Each part shows only where the two runtimes differ, so a model change alone names only the models. */
  const runtimeLabel = (runtime: BadgeRuntime, other: BadgeRuntime) => {
    const parts = [
      findModelOption(props.modelOptions, props.agentStatus?.providers, runtime.provider, runtime.model)?.name ??
        runtime.model,
    ];
    if (runtime.provider !== other.provider) parts.unshift(providerName(runtime.provider));
    else if (accountId(runtime) !== accountId(other)) parts.unshift(accountName(runtime));
    if (runtime.reasoningEffort !== other.reasoningEffort) parts.push(reasoningLabel(runtime.reasoningEffort, t));
    return parts.join(" · ");
  };
  /** A change chosen during a turn, in any thread. It applies from the next turn. */
  const pendingModel = () => {
    const agent = props.agent;
    if (!agent || !(working() || runningThreads() > 0)) return undefined;
    const running: BadgeRuntime = (working() ? runningTurnRuntime() : null) ?? agent;
    const next: BadgeRuntime = agent.pendingRuntime ?? {
      provider: settingsProvider(),
      model: settingsModel(),
      reasoningEffort: settingsReasoning(),
      providerAccountId: agent.providerAccountId,
    };
    if (
      running.provider === next.provider &&
      running.model === next.model &&
      running.reasoningEffort === next.reasoningEffort &&
      accountId(running) === accountId(next)
    )
      return undefined;
    return { running: runtimeLabel(running, next), next: runtimeLabel(next, running) };
  };
  /** The remote desktop of a joined server. Missing on this computer and where the user turned it off. */
  const remoteControl = () =>
    props.remoteDesktopEnabled !== false && props.server?.kind === "remote"
      ? {
          enabled: Boolean(props.remoteDesktopSessionActive || props.server.state === "online"),
          active: Boolean(props.remoteDesktopSessionActive),
          visible: Boolean(props.remoteDesktopVisible),
          onOpen: (trigger: HTMLElement) => {
            if (props.server) void props.onOpenRemoteDesktop(props.server.id, trigger);
          },
        }
      : undefined;
  /** The name of the agent that controls the browser now. */
  const actingAgentName = () =>
    actingBrowserControl() ? (browserControlAgent()?.name ?? t("conversation.header.agentFallback")) : undefined;
  /** The header actions in the thread menu: a phone has the pins and the side panel there. */
  const menuActions = (): ThreadPhoneActions | undefined => {
    if (!phoneMenu()) return undefined;
    const onOpenPins = chatPins() ? () => setPinsRequest((value) => value + 1) : undefined;
    const onToggleSidePanel = channel?.readOnly() ? undefined : toggleSidePanel;
    return { onOpenPins, onToggleSidePanel, sidePanelOpen: sidePanelOpen() };
  };
  return (
    <SharedConversationHeader
      agent={props.agent}
      title={channel ? <channel.HeaderTitle onOpenSettings={() => setActiveRightPanel("settings")} /> : undefined}
      onSettingsIntent={() => void loadAgentSettingsPanel()}
      onOpenSettings={() => setActiveRightPanel("settings")}
      session={
        props.threads
          ? {
              title: sessionTitle(),
              canStartNew: props.threads.header.canStartNew,
              onNew: props.threads.header.onNew,
            }
          : undefined
      }
      pendingModel={pendingModel()}
      remoteControl={remoteControl()}
      sessionsInPane={sessionsInPane()}
      phoneMenu={phoneMenu()}
      threads={
        <Show when={props.threads}>
          {(threads) => (
            <Show when={menuActions()}>
              {(actions) => <ThreadMenu {...threads().header} phoneActions={actions()} />}
            </Show>
          )}
        </Show>
      }
      pinnedMessages={pinnedMessages()}
      sidePanel={
        channel?.readOnly()
          ? undefined
          : { open: sidePanelOpen(), actingAgentName: actingAgentName(), onToggle: toggleSidePanel }
      }
    />
  );
}

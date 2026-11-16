import { isKnownAgentProvider } from "@openbot/contracts/agent-providers";
import {
  type AgentModelId,
  type AgentProviderRef,
  type AgentReasoningEffort,
  DEFAULT_PROVIDER_ACCOUNT_ID,
  providerDisplayName,
} from "@openbot/contracts/ipc";
import { reasoningLabel } from "@openbot/ui/components/ProviderModelPicker";
import { findModelOption, providerAccountName } from "@openbot/ui/components/provider-accounts";
import { ConversationHeader as SharedConversationHeader } from "@openbot/ui/features/conversation/ConversationHeader";
import { ThreadMenu } from "@openbot/ui/features/conversation/threads/ThreadMenu";
import { DRAFT_THREAD_ID, type ThreadPhoneActions } from "@openbot/ui/features/conversation/threads/thread-types";
import { createSignal, Show } from "solid-js";
import { actionToast } from "../../action-toast";
import { useConversationViewScope } from "./conversation-scope";
import { createPhoneWeb } from "./phone-web";

const loadAgentSettingsPanel = () => import("./AgentSettingsPanel");

/** The runtime of the running turn, or of the next one, as the "After this turn" badge names it. */
interface BadgeRuntime {
  provider: AgentProviderRef;
  model: AgentModelId;
  reasoningEffort: AgentReasoningEffort;
  providerAccountId?: string | undefined;
}

import { useText } from "@openbot/ui/text";

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
    messagePins,
    replyJump,
    toggleSidePanel,
  } = useConversationViewScope();
  // The web client on a phone. A desktop window, including a narrow one, keeps the header buttons.
  const phoneWeb = createPhoneWeb();
  const [pinsRequest, setPinsRequest] = createSignal(0);
  const phoneMenu = () => phoneWeb() && props.threads !== undefined;
  /** A desktop chat with threads keeps the pins, the side panel and the remote desktop in the thread menu. */
  const actionsMenu = () => !phoneWeb() && props.threads !== undefined;
  const runningThreads = () => props.threads?.running ?? 0;
  /** The title of the open session in the header pill. The agent's own chat shows only the agent. */
  const sessionTitle = () => {
    const header = props.threads?.header;
    if (!header || !sideThreadOpen()) return undefined;
    return header.sessions.find((session) => session.id === header.activeId)?.title;
  };
  /** The chat in the main view: the open side thread, a new thread, or undefined for the agent's own chat. */
  const viewTaskId = () => (sideThreadOpen() ? (props.threads?.open?.id ?? DRAFT_THREAD_ID) : undefined);
  /**
   * Opens a pin in its chat: in place in the agent's own chat, else in the tab of its thread, which
   * reads the part around it. A pin whose message or thread is gone shows a toast, and the list reads again.
   * A later click replaces an earlier one that is still loading, so the earlier one shows no toast.
   */
  let pinOpens = 0;
  async function openPin(key: string): Promise<void> {
    const pin = messagePins.pin(key);
    if (!pin) return;
    const open = ++pinOpens;
    const opened =
      pin.taskId === null && !sideThreadOpen()
        ? await replyJump.jumpTo(pin.messageId)
        : ((await props.threads?.onOpenMessage(pin.taskId, pin.messageId)) ?? false);
    if (opened || open !== pinOpens) return;
    actionToast.error(t("chat.pins.missing"));
    messagePins.load();
  }
  /** The pins of all chats of the agent. The pins of the chat in view come first. */
  const pinnedMessages = () => {
    if (!messagePins.available()) return undefined;
    return {
      pins: messagePins.items(viewTaskId()),
      agents: props.agents,
      onOpenChange: (open: boolean) => {
        if (open) messagePins.load();
      },
      onJump: (key: string) => void openPin(key),
      onUnpin: (key: string) => {
        const pin = messagePins.pin(key);
        if (pin) messagePins.set(pin.taskId ?? undefined, pin.messageId, false);
      },
      openRequest: pinsRequest(),
      quiet: phoneMenu() || actionsMenu(),
    };
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
  /** The header actions in the thread menu: a phone has the pins and the side panel there, a desktop all three. */
  const menuActions = (): ThreadPhoneActions | undefined => {
    if (!phoneMenu() && !actionsMenu()) return undefined;
    const onOpenPins = messagePins.available() ? () => setPinsRequest((value) => value + 1) : undefined;
    const onToggleSidePanel = channel?.readOnly() ? undefined : toggleSidePanel;
    if (phoneMenu()) return { onOpenPins, onToggleSidePanel, sidePanelOpen: sidePanelOpen() };
    const remote = remoteControl();
    return {
      onOpenPins,
      sidePanel: onToggleSidePanel
        ? { open: sidePanelOpen(), actingAgentName: actingAgentName(), onToggle: onToggleSidePanel }
        : undefined,
      onOpenRemote: remote?.onOpen,
      remoteEnabled: remote?.enabled,
      remoteActive: remote?.active,
      desktop: true,
    };
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
      remoteControl={actionsMenu() ? undefined : remoteControl()}
      actionsMenu={actionsMenu()}
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
        channel?.readOnly() || actionsMenu()
          ? undefined
          : { open: sidePanelOpen(), actingAgentName: actingAgentName(), onToggle: toggleSidePanel }
      }
    />
  );
}

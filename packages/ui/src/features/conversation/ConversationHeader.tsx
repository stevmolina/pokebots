import { Badge, Button, Clock3, Lock, Plus } from "@openbot/ui";
import { ProviderModelPicker } from "@openbot/ui/components/ProviderModelPicker";
import type { AgentProfile } from "@openbot/ui/data";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { agentAccessLockLabel } from "@openbot/ui/features/agents/agent-access";
import { RemoteDesktopIcon } from "@openbot/ui/features/conversation/ConversationIcons";
import { PinnedMessages, type PinnedMessagesProps } from "@openbot/ui/features/conversation/PinnedMessages";
import { SidePanelToggle, type SidePanelToggleProps } from "@openbot/ui/features/conversation/SidePanel";
import { useText } from "@openbot/ui/text";
import type { ComponentProps, JSX } from "@solidjs/web";
import { Show } from "solid-js";

export interface ConversationHeaderProps {
  agent: AgentProfile | null | undefined;
  /** The title of a chat that has no one agent, such as a channel. It shows when `agent` is missing. */
  title?: JSX.Element | undefined;
  /** The model picker of the agent. Absent where the message box shows it instead. */
  modelPicker?: ComponentProps<typeof ProviderModelPicker> | undefined;
  /** A model, effort, provider or account chosen during the running turn. It applies from the next turn. */
  pendingModel?: ConversationHeaderPendingModel | undefined;
  onSettingsIntent: () => void;
  onOpenSettings: () => void;
  remoteControl?: ConversationHeaderRemoteControl | undefined;
  /** Missing when the chat has no side panel, such as a deleted channel. */
  /** The pinned messages of the chat in view. Without it, the header has no pin button. */
  pinnedMessages?: PinnedMessagesProps | undefined;
  sidePanel?: SidePanelToggleProps | undefined;
  /**
   * The agent's sessions. The header then shows the agent as a pill with the open session. A phone
   * header has a "+" that starts a new session; a desktop one does not, the details pane has it.
   * Missing on a host without side threads.
   */
  session?: ConversationHeaderSession | undefined;
  /** The "More" menu of the header, with the actions that the header does not show as buttons. */
  threads?: JSX.Element | undefined;
  /**
   * A phone chat. The header keeps the thread menu and hides New thread, the pin, and the side
   * panel button. Those actions are in the menu.
   */
  phoneMenu?: boolean | undefined;
  /**
   * A desktop chat with threads. The header has no "New session" button and no pin button: the details
   * pane that the name pill opens has both.
   */
  sessionsInPane?: boolean | undefined;
}

export interface ConversationHeaderSession {
  /** The title of the open session. Missing while the agent's own chat is open. */
  title?: string | undefined;
  /** False at the limit of threads. */
  canStartNew: boolean;
  onNew: () => void;
}

export interface ConversationHeaderPendingModel {
  /** The model, and the effort when it changes too, of the running turn. */
  running: string;
  /** The same for the next turn. */
  next: string;
}

export interface ConversationHeaderRemoteControl {
  enabled: boolean;
  active: boolean;
  visible: boolean;
  onOpen: (trigger: HTMLButtonElement) => void;
}

export function ConversationHeader(props: ConversationHeaderProps) {
  const { t } = useText();
  return (
    <header
      class="window-drag conversation-header"
      data-session-pill={props.agent && props.session ? "" : undefined}
      data-phone-menu={props.phoneMenu ? "" : undefined}
      data-sessions-in-pane={props.sessionsInPane ? "" : undefined}
    >
      <div class="conversation-heading-group">
        <Show when={props.agent} fallback={props.title}>
          {(agent) => (
            <div class="conversation-session-pill">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                class="conversation-title no-drag"
                aria-label={t("conversation.header.settings")}
                title={props.session?.title}
                onPointerEnter={() => props.onSettingsIntent()}
                onFocus={() => props.onSettingsIntent()}
                onClick={() => props.onOpenSettings()}
              >
                <AgentAvatar agent={agent()} />
                <h1 class="conversation-agent-heading" dir="auto">
                  <span class="conversation-agent-name">{agent().name}</span>
                  <Show when={props.session?.title}>
                    {(title) => (
                      <span class="conversation-session-title" dir="auto">
                        {title()}
                      </span>
                    )}
                  </Show>
                </h1>
              </Button>
              <Show when={agentAccessLockLabel(agent(), t)}>
                {(label) => (
                  <span class="conversation-access-lock" role="img" aria-label={label()} title={label()}>
                    <Lock aria-hidden="true" />
                  </span>
                )}
              </Show>
              {/* A desktop chat starts a new session in the details pane, so the pill has no button for it. */}
              <Show when={!props.sessionsInPane ? props.session : undefined}>
                {(session) => (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    class="conversation-new-session no-drag"
                    aria-label={t("conversation.sessions.new")}
                    title={t("conversation.sessions.new")}
                    disabled={!session().canStartNew}
                    onClick={() => session().onNew()}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                )}
              </Show>
            </div>
          )}
        </Show>
        {props.threads}
      </div>
      <div class="conversation-header-actions no-drag">
        <Show when={props.agent && props.pendingModel}>
          {(change) => {
            const detail = () => t("conversation.header.modelNextTurnDetail", change());
            return (
              <Badge variant="info-light" class="conversation-model-pending" role="status" title={detail()}>
                <Clock3 aria-hidden="true" />
                {t("conversation.header.modelNextTurn")}
                <span class="sr-only">{detail()}</span>
              </Badge>
            );
          }}
        </Show>
        <Show when={props.agent && props.modelPicker}>{(picker) => <ProviderModelPicker {...picker()} />}</Show>
        <Show when={props.remoteControl}>
          {(control) => (
            <Button
              variant="ghost"
              type="button"
              class="header-panel-toggle remote-desktop-button"
              aria-label={t(control().active ? "conversation.header.resumeRemote" : "conversation.header.openRemote")}
              aria-expanded={control().visible ? "true" : "false"}
              disabled={!control().enabled}
              onClick={(event) => control().onOpen(event.currentTarget)}
              data-cuelume-tap="open"
            >
              <RemoteDesktopIcon />
              <Show when={control().active}>
                <span class="remote-desktop-button-dot" aria-hidden="true" />
              </Show>
            </Button>
          )}
        </Show>
        <Show when={props.pinnedMessages}>{(pins) => <PinnedMessages {...pins()} />}</Show>
        <Show when={props.sidePanel}>{(sidePanel) => <SidePanelToggle {...sidePanel()} />}</Show>
      </div>
    </header>
  );
}

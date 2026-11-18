/**
 * Server settings > Cloud computers: the Agent Computer account (computer.mcpbox.dev) whose API key
 * lets the agents of a server start cloud Ubuntu computers. The key is pasted once and never shown
 * again; the page shows its first characters, tests it, and lists the computers with their live views.
 */

import type { AgentComputerAccountAllowance, AgentComputerStatus } from "@openbot/contracts/ipc";
import {
  Alert,
  Button,
  ExternalLink,
  Field,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  RefreshCw,
  SettingsSection,
  Text,
} from "@openbot/ui";
import { createSignal, Show } from "solid-js";
import { useText } from "../../text";
import { type CloudComputer, CloudComputerList } from "../servers/CloudComputerList";
import { type ComputerAction, ComputerStartForm } from "../servers/ComputerControls";

export interface AgentComputerPanelProps {
  /** Null until the first read answers. */
  status: AgentComputerStatus | null;
  allowance?: AgentComputerAccountAllowance | null;
  onManage?: ComputerAction | undefined;
  screenshot?: string | null | undefined;
  /** Why the status could not be read. */
  statusError: string | null;
  /** Null until the list is read, or while the account is not connected. */
  machines: readonly CloudComputer[] | null;
  machinesError: string | null;
  /** The key of the action in flight: connect, test, disconnect or refresh. */
  busy: string | null;
  onConnect: (apiKey: string) => void;
  onTest: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onOpenLiveView: (url: string) => void;
  /** Opens the page where the user makes a key. */
  onGetKey: () => void;
}

export function AgentComputerPanel(props: AgentComputerPanelProps) {
  const { t, format } = useText();
  const [key, setKey] = createSignal("");
  const connected = () => props.status?.connected === true;
  return (
    <>
      <Show when={props.allowance}>
        {(allowance) => (
          <SettingsSection
            title={t("server.cloudComputers.title")}
            description={t("server.cloudComputers.allowance", {
              count: allowance().minutes_remaining,
              time: format.date(new Date(allowance().resets_at), { timeStyle: "short" }),
            })}
            actions={
              <Button type="button" variant="ghost" size="sm" disabled={Boolean(props.busy)} onClick={props.onRefresh}>
                <RefreshCw aria-hidden="true" />
                {t("server.cloudComputers.refresh")}
              </Button>
            }
          />
        )}
      </Show>
      <Show when={!props.allowance || connected()}>
        <SettingsSection
          title={t("server.cloudComputers.accountTitle")}
          description={t("server.cloudComputers.accountDescription")}
        >
          <ItemGroup class="settings-modal-card">
            <Show when={props.statusError}>{(error) => <Alert tone="danger">{error()}</Alert>}</Show>
            <Show
              when={connected()}
              fallback={
                <form
                  class="agent-computer-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = key().trim();
                    if (!value || props.busy) return;
                    setKey("");
                    props.onConnect(value);
                  }}
                >
                  <Field label={t("server.cloudComputers.apiKey")} description={t("server.cloudComputers.apiKeyHint")}>
                    <Input
                      type="password"
                      size="sm"
                      autocomplete="off"
                      spellcheck={false}
                      placeholder={t("server.cloudComputers.apiKeyPlaceholder")}
                      value={key()}
                      onInput={(event) => setKey(event.currentTarget.value)}
                    />
                  </Field>
                  <div class="agent-computer-actions">
                    <Button type="submit" size="sm" loading={props.busy === "connect"} disabled={!key().trim()}>
                      {t("server.cloudComputers.connect")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => props.onGetKey()}>
                      <ExternalLink aria-hidden="true" />
                      {t("server.cloudComputers.getKey")}
                    </Button>
                  </div>
                </form>
              }
            >
              <Item>
                <ItemContent>
                  <ItemTitle>{t("server.cloudComputers.connected")}</ItemTitle>
                  <ItemDescription>
                    {t("server.cloudComputers.keyHint", { hint: props.status?.keyHint ?? "" })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={props.busy === "test"}
                    disabled={Boolean(props.busy)}
                    onClick={() => props.onTest()}
                  >
                    {t("server.cloudComputers.test")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={props.busy === "disconnect"}
                    disabled={Boolean(props.busy)}
                    onClick={() => props.onDisconnect()}
                  >
                    {t("server.cloudComputers.disconnect")}
                  </Button>
                </ItemActions>
              </Item>
            </Show>
            <Show when={props.status?.error}>{(error) => <Alert tone="danger">{error()}</Alert>}</Show>
          </ItemGroup>
        </SettingsSection>
      </Show>
      <Show when={connected()}>
        <SettingsSection
          title={t("server.cloudComputers.title")}
          description={t("server.cloudComputers.listDescription")}
          actions={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={props.busy === "refresh"}
              disabled={Boolean(props.busy)}
              onClick={() => props.onRefresh()}
            >
              <RefreshCw aria-hidden="true" />
              {t("server.cloudComputers.refresh")}
            </Button>
          }
        >
          <Show when={props.onManage}>
            {(manage) => <ComputerStartForm busy={Boolean(props.busy)} onManage={manage()} />}
          </Show>
          <Show when={props.screenshot}>
            {(image) => <img class="computer-screenshot" src={image()} alt={t("server.computers.screenshot")} />}
          </Show>
          <Show when={props.machinesError}>{(error) => <Alert tone="danger">{error()}</Alert>}</Show>
          <Show when={props.machines}>
            {(machines) => (
              <Show
                when={machines().length > 0}
                fallback={
                  <Text variant="caption" tone="muted">
                    {t("server.cloudComputers.empty")}
                  </Text>
                }
              >
                <CloudComputerList
                  machines={machines()}
                  busy={Boolean(props.busy)}
                  onManage={props.onManage}
                  onOpenLiveView={props.onOpenLiveView}
                />
              </Show>
            )}
          </Show>
        </SettingsSection>
      </Show>
    </>
  );
}

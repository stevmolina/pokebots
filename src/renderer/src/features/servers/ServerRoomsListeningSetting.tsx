import type { OpenBotDesktopApi, RoomsListeningSetting } from "@pokebots/contracts/ipc";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  SettingsSection,
  Switch,
} from "@pokebots/ui";
import { useText } from "@pokebots/ui/text";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";

export type HostRoomsListeningCalls = Pick<OpenBotDesktopApi["hostAdmin"], "getRoomsListening" | "setRoomsListening">;

/**
 * Rooms listening of one server (`rooms-listening-v1`): a switch for each agent. Mounted for one
 * server at a time. The host checks the role again.
 */
export function ServerRoomsListeningSetting(props: { calls: HostRoomsListeningCalls; serverId: string }) {
  const { t, errorMessage } = useText();
  const [setting, setSetting] = createSignal<RoomsListeningSetting>();
  const [error, setError] = createSignal<string>();
  const [saving, setSaving] = createSignal<string | null>(null);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  onSettled(() => {
    void props.calls.getRoomsListening(props.serverId).then(
      (value) => {
        if (!disposed) setSetting(value);
      },
      (cause: unknown) => {
        if (!disposed) setError(errorMessage(cause, t("server.settings.roomsListeningLoadFailed")));
      },
    );
  });

  async function save(agentId: string, listening: boolean): Promise<void> {
    if (saving()) return;
    setSaving(agentId);
    setError(undefined);
    try {
      const saved = await props.calls.setRoomsListening({ agentId, listening }, props.serverId);
      if (!disposed) setSetting(saved);
    } catch (cause) {
      if (!disposed) setError(errorMessage(cause, t("server.settings.actionFailed")));
    } finally {
      if (!disposed) setSaving(null);
    }
  }

  return (
    <SettingsSection title={t("server.settings.roomsListening")}>
      <ItemGroup class="settings-modal-card">
        <Item>
          <ItemContent>
            <ItemDescription>{t("server.settings.roomsListeningDescription")}</ItemDescription>
            <Show when={error()}>{(message) => <ItemDescription role="alert">{message()}</ItemDescription>}</Show>
          </ItemContent>
        </Item>
        <Show when={setting()}>
          {(value) => (
            <For each={value().agents}>
              {(agent) => (
                <Item>
                  <ItemContent>
                    <ItemTitle>{agent.name}</ItemTitle>
                    <Show when={!agent.roomsConnected}>
                      <ItemDescription>{t("server.settings.roomsListeningNotConnected")}</ItemDescription>
                    </Show>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      aria-label={t("server.settings.roomsListeningAgent", { name: agent.name })}
                      checked={agent.listening}
                      disabled={saving() !== null || (!agent.roomsConnected && !agent.listening)}
                      onChange={(listening) => void save(agent.id, listening)}
                    />
                  </ItemActions>
                </Item>
              )}
            </For>
          )}
        </Show>
      </ItemGroup>
    </SettingsSection>
  );
}

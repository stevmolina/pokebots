import type { BrainContextSetting, OpenBotDesktopApi } from "@pokebots/contracts/ipc";
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
import { createSignal, onCleanup, onSettled, Show } from "solid-js";

export type HostBrainContextCalls = Pick<OpenBotDesktopApi["hostAdmin"], "getBrainContext" | "setBrainContext">;

/**
 * "Start chats with brain context" of one server (`brain-context-v1`). Mounted for one server at a
 * time. The host checks the role again.
 */
export function ServerBrainContextSetting(props: { calls: HostBrainContextCalls; serverId: string }) {
  const { t, errorMessage } = useText();
  const [setting, setSetting] = createSignal<BrainContextSetting>();
  const [error, setError] = createSignal<string>();
  const [saving, setSaving] = createSignal(false);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  onSettled(() => {
    void props.calls.getBrainContext(props.serverId).then(
      (value) => {
        if (!disposed) setSetting(value);
      },
      (cause: unknown) => {
        if (!disposed) setError(errorMessage(cause, t("server.settings.brainContextLoadFailed")));
      },
    );
  });

  async function save(enabled: boolean): Promise<void> {
    if (saving()) return;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await props.calls.setBrainContext(enabled, props.serverId);
      if (!disposed) setSetting(saved);
    } catch (cause) {
      if (!disposed) setError(errorMessage(cause, t("server.settings.actionFailed")));
    } finally {
      if (!disposed) setSaving(false);
    }
  }

  return (
    <SettingsSection title={t("server.settings.brainContext")}>
      <ItemGroup class="settings-modal-card">
        <Item>
          <ItemContent>
            <ItemTitle>{t("server.settings.brainContextEnable")}</ItemTitle>
            <ItemDescription>{t("server.settings.brainContextDescription")}</ItemDescription>
            <Show when={error()}>{(message) => <ItemDescription role="alert">{message()}</ItemDescription>}</Show>
          </ItemContent>
          <Show when={setting()}>
            {(value) => (
              <ItemActions>
                <Switch
                  aria-label={t("server.settings.brainContextEnable")}
                  checked={value().enabled}
                  disabled={saving()}
                  onChange={(enabled) => void save(enabled)}
                />
              </ItemActions>
            )}
          </Show>
        </Item>
      </ItemGroup>
    </SettingsSection>
  );
}

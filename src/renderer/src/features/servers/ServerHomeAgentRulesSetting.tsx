import {
  HOME_AGENT_RULE_FILES,
  type HomeAgentRulesPreference,
  type HomeAgentRulesSetting,
  type OpenBotDesktopApi,
} from "@openbot/contracts/ipc";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  SettingsSection,
  Switch,
} from "@openbot/ui";
import { useText } from "@openbot/ui/text";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";

export type HostHomeAgentRulesCalls = Pick<OpenBotDesktopApi["hostAdmin"], "getHomeAgentRules" | "setHomeAgentRules">;

/** This component is mounted for one server at a time. */
export function ServerHomeAgentRulesSetting(props: { calls: HostHomeAgentRulesCalls; serverId: string }) {
  const { t, errorMessage } = useText();
  const [setting, setSetting] = createSignal<HomeAgentRulesSetting>();
  const [error, setError] = createSignal<string>();
  const [saving, setSaving] = createSignal(false);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  onSettled(() => {
    void props.calls.getHomeAgentRules(props.serverId).then(
      (value) => {
        if (!disposed) setSetting(value);
      },
      (cause: unknown) => {
        if (!disposed) setError(errorMessage(cause, t("server.settings.homeAgentRulesLoadFailed")));
      },
    );
  });

  async function save(preference: HomeAgentRulesPreference): Promise<boolean> {
    if (saving()) return false;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await props.calls.setHomeAgentRules(preference, props.serverId);
      if (!disposed) setSetting(saved);
      return true;
    } catch (cause) {
      if (!disposed) setError(errorMessage(cause, t("server.settings.actionFailed")));
      return false;
    } finally {
      if (!disposed) setSaving(false);
    }
  }

  return (
    <SettingsSection title={t("server.settings.homeAgentRules")}>
      <ItemGroup class="settings-modal-card">
        <Item>
          <ItemContent>
            <ItemTitle>{t("server.settings.homeAgentRulesEnable")}</ItemTitle>
            <ItemDescription>{t("server.settings.homeAgentRulesDescription")}</ItemDescription>
            <Show when={error()}>{(message) => <ItemDescription role="alert">{message()}</ItemDescription>}</Show>
          </ItemContent>
          <Show when={setting()}>
            {(value) => (
              <ItemActions>
                <Switch
                  aria-label={t("server.settings.homeAgentRulesEnable")}
                  checked={value().enabled}
                  disabled={saving()}
                  onChange={(enabled) => save({ enabled, files: value().files })}
                />
              </ItemActions>
            )}
          </Show>
        </Item>
        <Show when={setting()}>
          {(value) => (
            <For each={HOME_AGENT_RULE_FILES}>
              {(file) => {
                const available = () => value().availableFiles.includes(file);
                const selected = () => value().files.includes(file);
                return (
                  <Item>
                    <ItemContent>
                      <ItemTitle>{file}</ItemTitle>
                      <Show when={!available()}>
                        <ItemDescription>{t("server.settings.homeAgentRulesMissing")}</ItemDescription>
                      </Show>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        aria-label={file}
                        checked={selected()}
                        disabled={saving() || (!available() && !selected())}
                        onChange={(selected) =>
                          save({
                            enabled: value().enabled,
                            files: selected ? [...value().files, file] : value().files.filter((name) => name !== file),
                          })
                        }
                      />
                    </ItemActions>
                  </Item>
                );
              }}
            </For>
          )}
        </Show>
      </ItemGroup>
    </SettingsSection>
  );
}

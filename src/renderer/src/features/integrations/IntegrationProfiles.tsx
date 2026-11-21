import { POKEBOTS_INTEGRATION_ACCOUNTS_URL } from "@pokebots/contracts/team-protocol/pokebots-integrations-v1";
import { Button, NativeSelect } from "@pokebots/ui";
import { useText } from "@pokebots/ui/text";
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

export type AccountMode = "linked" | "native" | "manual";

export function IntegrationProfiles(props: {
  builtIn: boolean;
  manual?: boolean;
  openUrl: (url: string) => void;
  children: (mode: AccountMode, controls?: JSX.Element) => JSX.Element;
}) {
  const { t } = useText();
  const [mode, setMode] = createSignal<AccountMode>("linked");
  const selected = () => {
    if (!props.builtIn) return "manual";
    const value = mode();
    return value === "manual" && !props.manual ? "linked" : value;
  };
  return (
    <Show when={selected()} keyed>
      {(account) =>
        props.children(
          account,
          <Show when={props.builtIn}>
            <NativeSelect
              size="sm"
              aria-label={t("common.integrationProfile")}
              value={account}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "linked" || value === "native" || value === "manual") setMode(value);
              }}
            >
              <option value="linked">{t("common.integrationLinked")}</option>
              <option value="native">{t("common.integrationNative")}</option>
              <Show when={props.manual}>
                <option value="manual">{t("common.integrationManual")}</option>
              </Show>
            </NativeSelect>
            <Button size="sm" variant="secondary" onClick={() => props.openUrl(POKEBOTS_INTEGRATION_ACCOUNTS_URL)}>
              {t("common.integrationLink")}
            </Button>
          </Show>,
        )
      }
    </Show>
  );
}

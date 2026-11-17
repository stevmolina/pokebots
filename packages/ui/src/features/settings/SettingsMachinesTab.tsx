import type { ServerSummary } from "@openbot/contracts/ipc";
import { Button, ChevronRight } from "@openbot/ui";
import { MACHINE_STATE_LABEL } from "@openbot/ui/features/servers/MachinesPage";
import { ServerMark } from "@openbot/ui/features/servers/ServerRail";
import { useText } from "@openbot/ui/text";
import { For, Show } from "solid-js";

export interface SettingsMachinesTabProps {
  machines: readonly ServerSummary[];
  /** Opens the settings of one machine inside the same modal. */
  onOpenMachine: (serverId: string) => void;
}

/**
 * The Machines section of the settings: one row per machine, with its state. A row opens the settings of that
 * machine in the modal, where the sections of the machine replace the list.
 */
export function SettingsMachinesTab(props: SettingsMachinesTabProps) {
  const { t } = useText();
  return (
    <div class="settings-machines">
      <ul class="settings-machines-list">
        <For each={props.machines} keyed={(machine) => machine.id}>
          {(machine) => (
            <li>
              <Button
                variant="ghost"
                type="button"
                class="settings-machine-row"
                aria-label={t("server.machines.settings", { name: machine().name })}
                onClick={() => props.onOpenMachine(machine().id)}
              >
                <span class="server-menu-mark settings-machine-mark" aria-hidden="true">
                  <ServerMark server={machine()} />
                </span>
                <span class="settings-machine-text">
                  <span class="settings-machine-name">{machine().name}</span>
                  <span class="settings-machine-state">
                    <span
                      class="settings-machine-dot"
                      data-online={machine().state === "online" ? "" : undefined}
                      aria-hidden="true"
                    />
                    {t(MACHINE_STATE_LABEL[machine().state])}
                    <Show when={machine().kind === "local"}>
                      {" · "}
                      {t("server.machines.thisComputer")}
                    </Show>
                  </span>
                </span>
                <ChevronRight class="settings-machine-chevron" aria-hidden="true" />
              </Button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

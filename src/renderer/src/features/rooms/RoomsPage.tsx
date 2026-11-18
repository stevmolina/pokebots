import { POKEBOTS_INTEGRATIONS_CAPABILITY } from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { RoomsPanel } from "@openbot/ui/features/rooms/RoomsPanel";
import { Show } from "solid-js";
import { IntegrationProfiles } from "../integrations/IntegrationProfiles";
import { useLocalIntegrations } from "../integrations/local-integrations";
import { serverSupportsCapability } from "../servers/server-capabilities";
import { useServers } from "../servers/servers-context";
import { useSettings } from "../settings/settings-context";
import { roomsPort } from "./rooms-port";

export function RoomsPage(props: { serverId: string }) {
  const settings = useSettings();
  const { servers } = useServers();
  const localIntegrations = useLocalIntegrations();
  const server = () => servers().find((row) => row.id === props.serverId);
  const local = () => server()?.kind === "local";
  const builtIn = () =>
    local()
      ? localIntegrations()
      : server()?.kind === "remote" && serverSupportsCapability(server(), POKEBOTS_INTEGRATIONS_CAPABILITY);
  return (
    <Show when={props.serverId} keyed>
      {(serverId) => (
        <IntegrationProfiles builtIn={builtIn()} manual={local()} openUrl={(url) => void window.openbot.openUrl(url)}>
          {(account, controls) => (
            <RoomsPanel
              request={roomsPort(serverId, account)}
              accountControls={builtIn() ? controls : undefined}
              onConnect={() => settings.setSkillsMarketplaceOpen(true)}
            />
          )}
        </IntegrationProfiles>
      )}
    </Show>
  );
}

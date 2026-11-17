import { RoomsPanel } from "@openbot/ui/features/rooms/RoomsPanel";
import { Show } from "solid-js";
import { useSettings } from "../settings/settings-context";
import { roomsPort } from "./rooms-port";
export function RoomsPage(props: { serverId: string }) {
  const settings = useSettings();
  return (
    <Show when={props.serverId} keyed>
      {(serverId) => (
        <RoomsPanel request={roomsPort(serverId)} onConnect={() => settings.setSkillsMarketplaceOpen(true)} />
      )}
    </Show>
  );
}

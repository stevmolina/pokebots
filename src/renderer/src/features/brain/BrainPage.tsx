import { BRAIN_CAPABILITY } from "@openbot/contracts/brain";
import {
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_CAPABILITY,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { BrainPanel } from "@openbot/ui/features/brain/BrainPanel";
import { createEffect, createSignal, Show } from "solid-js";
import { serverSupportsCapability } from "../servers/server-capabilities";
import { useServers } from "../servers/servers-context";
import { useSettings } from "../settings/settings-context";
import { brainPort } from "./brain-port";

export function BrainPage(props: { serverId: string }) {
  const { servers } = useServers();
  const settings = useSettings();
  const [connection, setConnection] = createSignal<string | null>(null);
  const server = () => servers().find((row) => row.id === props.serverId);
  const hasAccountBrain = () =>
    server()?.kind === "remote" && serverSupportsCapability(server(), POKEBOTS_INTEGRATIONS_CAPABILITY);
  const supported = () =>
    server()?.kind === "local" || hasAccountBrain() || serverSupportsCapability(server(), BRAIN_CAPABILITY);
  createEffect(
    () => ({ serverId: props.serverId, local: server()?.kind === "local", builtIn: hasAccountBrain() }),
    ({ serverId, local, builtIn }) => {
      setConnection(null);
      let current = true;
      if (builtIn) {
        setConnection(POKEBOTS_BRAIN_ID);
        return;
      }
      const findLocalAccount = async () => {
        if (!current || !local) return;
        await brainPort().brain.request({ operation: "brains", mcpServerId: POKEBOTS_BRAIN_ID }, serverId);
        if (current) setConnection(POKEBOTS_BRAIN_ID);
      };
      void brainPort()
        .agent.listMcpServers(serverId)
        .then((rows) => {
          if (!current) return;
          const row = rows.find((item) => {
            if (item.transport !== "http") return false;
            try {
              const url = new URL(item.url);
              return url.origin === "https://brain.mcpbox.dev" && url.pathname === "/mcp";
            } catch {
              return false;
            }
          });
          if (row) setConnection(row.id);
          else return findLocalAccount();
        })
        .catch(() => {
          if (current) setConnection(null);
        });
      return () => {
        current = false;
      };
    },
  );
  return (
    <Show when={supported()}>
      <Show when={props.serverId} keyed>
        {(serverId) => (
          <Show
            when={connection()}
            keyed
            fallback={
              <BrainPanel
                connectionId={null}
                request={(input) => brainPort().brain.request(input, serverId)}
                onConnect={() => settings.setSkillsMarketplaceOpen(true)}
                onOpenLink={(url) => void brainPort().openUrl(url)}
              />
            }
          >
            {(id) => (
              <BrainPanel
                connectionId={id}
                request={(input) => brainPort().brain.request(input, serverId)}
                onConnect={() => settings.setSkillsMarketplaceOpen(true)}
                onOpenLink={(url) => void brainPort().openUrl(url)}
              />
            )}
          </Show>
        )}
      </Show>
    </Show>
  );
}

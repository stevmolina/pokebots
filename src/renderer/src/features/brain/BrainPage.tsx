import { BRAIN_CAPABILITY } from "@pokebots/contracts/brain";
import {
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_CAPABILITY,
} from "@pokebots/contracts/team-protocol/pokebots-integrations-v1";
import { BrainPanel } from "@pokebots/ui/features/brain/BrainPanel";
import { createEffect, createSignal, Show } from "solid-js";
import { IntegrationProfiles } from "../integrations/IntegrationProfiles";
import { useLocalIntegrations } from "../integrations/local-integrations";
import { serverSupportsCapability } from "../servers/server-capabilities";
import { useServers } from "../servers/servers-context";
import { useSettings } from "../settings/settings-context";
import { brainPort } from "./brain-port";

export function BrainPage(props: { serverId: string }) {
  const { servers } = useServers();
  const settings = useSettings();
  const localIntegrations = useLocalIntegrations();
  const [connection, setConnection] = createSignal<string | null>(null);
  const server = () => servers().find((row) => row.id === props.serverId);
  const local = () => server()?.kind === "local";
  const builtIn = () =>
    local()
      ? localIntegrations()
      : server()?.kind === "remote" && serverSupportsCapability(server(), POKEBOTS_INTEGRATIONS_CAPABILITY);
  const supported = () => local() || builtIn() || serverSupportsCapability(server(), BRAIN_CAPABILITY);
  createEffect(
    () => ({ serverId: props.serverId, manual: local() || (!builtIn() && supported()) }),
    ({ serverId, manual }) => {
      setConnection(null);
      if (!manual) return;
      let current = true;
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
          setConnection(row?.id ?? null);
        })
        .catch(() => {
          if (current) setConnection(null);
        });
      return () => {
        current = false;
      };
    },
  );
  const openUrl = (url: string) => void brainPort().openUrl(url);
  return (
    <Show when={supported() && props.serverId} keyed>
      {(serverId) => (
        <IntegrationProfiles builtIn={builtIn()} manual={local() && connection() !== null} openUrl={openUrl}>
          {(account, controls) => {
            const id = () => (account === "manual" ? connection() : POKEBOTS_BRAIN_ID);
            const panel = (connectionId: string | null) => (
              <BrainPanel
                connectionId={connectionId}
                accountControls={controls}
                request={(input) =>
                  brainPort().brain.request(account === "native" ? { ...input, profile: account } : input, serverId)
                }
                onConnect={() => settings.setSkillsMarketplaceOpen(true)}
                onOpenLink={openUrl}
              />
            );
            return (
              <Show when={id()} keyed fallback={panel(null)}>
                {panel}
              </Show>
            );
          }}
        </IntegrationProfiles>
      )}
    </Show>
  );
}

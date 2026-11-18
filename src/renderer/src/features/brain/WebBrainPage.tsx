import { BRAIN_ROUTE, decodeBrainResponse } from "@openbot/contracts/brain";
import type { McpServerConfig } from "@openbot/contracts/ipc";
import {
  integrationRequest,
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { listMcpServers } from "@openbot/team-client/team-admin-requests";
import type { TeamApiRequest } from "@openbot/team-client/team-api-requests";
import { BrainPanel } from "@openbot/ui/features/brain/BrainPanel";
import { Effect } from "effect";
import { createEffect, createSignal, Show } from "solid-js";

import { IntegrationProfiles } from "../integrations/IntegrationProfiles";

export function WebBrainPage(props: { request: TeamApiRequest; onConnect: () => void; builtIn: boolean }) {
  const [connection, setConnection] = createSignal<string | null>(null);
  const isBrain = (row: McpServerConfig) => {
    if (row.transport !== "http") return false;
    try {
      const url = new URL(row.url);
      return url.origin === "https://brain.mcpbox.dev" && url.pathname === "/mcp";
    } catch {
      return false;
    }
  };
  createEffect(
    () => props.builtIn,
    (builtIn) => {
      setConnection(null);
      if (builtIn) return;
      let alive = true;
      void Effect.runPromise(listMcpServers(props.request))
        .then((rows) => {
          if (alive) setConnection(rows.find(isBrain)?.id ?? null);
        })
        .catch(() => {
          if (alive) setConnection(null);
        });
      return () => {
        alive = false;
      };
    },
  );
  const openUrl = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  return (
    <IntegrationProfiles builtIn={props.builtIn} openUrl={openUrl}>
      {(account, controls) => {
        const id = () => (account === "manual" ? connection() : POKEBOTS_BRAIN_ID);
        const panel = (connectionId: string | null) => (
          <BrainPanel
            connectionId={connectionId}
            accountControls={controls}
            request={(input) =>
              account === "manual"
                ? props.request("POST", BRAIN_ROUTE, decodeBrainResponse, input)
                : props.request(
                    "POST",
                    POKEBOTS_INTEGRATIONS_ROUTES.brain,
                    decodeBrainResponse,
                    integrationRequest(input, account === "native" ? account : undefined),
                  )
            }
            onConnect={props.onConnect}
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
  );
}

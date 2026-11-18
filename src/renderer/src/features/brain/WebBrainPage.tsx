import { BRAIN_ROUTE, decodeBrainResponse } from "@openbot/contracts/brain";
import type { McpServerConfig } from "@openbot/contracts/ipc";
import {
  POKEBOTS_BRAIN_ID,
  POKEBOTS_INTEGRATIONS_ROUTES,
} from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { listMcpServers } from "@openbot/team-client/team-admin-requests";
import type { TeamApiRequest } from "@openbot/team-client/team-api-requests";
import { BrainPanel } from "@openbot/ui/features/brain/BrainPanel";
import { Effect } from "effect";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";

export function WebBrainPage(props: { request: TeamApiRequest; onConnect: () => void; builtIn: boolean }) {
  const [connection, setConnection] = createSignal<string | null>(null);
  let alive = true;
  onCleanup(() => {
    alive = false;
  });
  const isBrain = (row: McpServerConfig) => {
    if (row.transport !== "http") return false;
    try {
      const url = new URL(row.url);
      return url.origin === "https://brain.mcpbox.dev" && url.pathname === "/mcp";
    } catch {
      return false;
    }
  };
  onSettled(() => {
    if (props.builtIn) return;
    void Effect.runPromise(listMcpServers(props.request))
      .then((rows) => {
        if (alive) setConnection(rows.find(isBrain)?.id ?? null);
      })
      .catch(() => {
        if (alive) setConnection(null);
      });
  });
  const panel = (id: string | null) => (
    <BrainPanel
      connectionId={id}
      request={(input) =>
        input.mcpServerId === POKEBOTS_BRAIN_ID
          ? props.request("POST", POKEBOTS_INTEGRATIONS_ROUTES.brain, decodeBrainResponse, { request: input })
          : props.request("POST", BRAIN_ROUTE, decodeBrainResponse, input)
      }
      onConnect={props.onConnect}
      onOpenLink={(url) => window.open(url, "_blank", "noopener,noreferrer")}
    />
  );
  return (
    <Show when={props.builtIn ? POKEBOTS_BRAIN_ID : connection()} keyed fallback={panel(null)}>
      {(id) => panel(id)}
    </Show>
  );
}

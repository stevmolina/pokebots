import { createFileRoute } from "@tanstack/solid-router";
import { integrationLinkClient } from "../server/integration-link";

export const Route = createFileRoute("/integration-accounts_/client.json")({
  server: { handlers: { GET: ({ request }) => integrationLinkClient(request) } },
});

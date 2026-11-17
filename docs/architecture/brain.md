# Brain

The Brain screen reads the Agent Brain REST API. The existing Second Brain MCP connection owns
its sign-in. `BrainService` selects only a saved connection at `https://brain.mcpbox.dev/mcp`,
including its account fragment, and asks `McpOAuth` for its access token. The existing OAuth
service refreshes and redacts that token. No token enters an IPC result or a Team API result.

`packages/contracts/src/brain.ts` defines bounded operations and domain responses. The service
uses a fixed HTTPS origin, refuses redirects, limits response size, and has a 30-second deadline.
It retries once after a 401 with the existing OAuth refresh operation. It does not retry a
network failure that could have occurred after a write. Errors discard upstream response bodies.

Desktop invokes the server-scoped Brain IPC group. A joined server receives the same operations
through `brain-v1`, which only protocol 9 peers can negotiate. The host checks MCP sign-in
management rights, including all rows at the same OAuth address. A member with only agent tool
access cannot read the private chats of the account behind that connection. Web and mobile use
that host route. They never call Agent Brain directly.

`packages/ui` owns the desktop and web screen. Platform adapters supply the request and external
link actions. Native mobile uses the same contracts with native navigation and HeroUI content.
All Brain results stay in component memory. A server or brain switch clears the previous results;
late responses cannot populate the new scope. No query cache or persistence layer stores them.
Downloads open signed links that expire. File adds are limited to 512 KB to fit the released
1 MiB host JSON body and 2 MiB WebRTC frame limits. Larger files remain available through the
MCP app.

`bun --preload ./scripts/team-api-routes-e2e-electron.mjs scripts/brain-e2e.ts` drives the real
service and host route over loopback HTTP. It writes `.openbot-build/brain/report.json`.
The upstream HTTP adapter and OAuth authority are injected fixtures. This check does not prove
a live WorkOS grant. `Workspace/Brain` stories exercise the shared screen with invented data.

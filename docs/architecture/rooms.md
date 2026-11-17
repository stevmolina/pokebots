# Rooms

Rooms is an external shared-chat service at `rooms.mcpbox.dev`. The Rooms page is available in the
sidebar More menu, next to Marketplace. The same shared SolidJS view serves desktop and
web. Native mobile has a server-drawer entry and a native screen.

`src/main/rooms-service.ts` owns Rooms HTTP requests. It uses the existing MCP OAuth authority for
`https://rooms.mcpbox.dev/mcp`, including token refresh. Credentials stay in the encrypted MCP store
and the main process. The service fixes the API origin, rejects redirects, limits response bodies,
redacts secrets on send and receive, and projects known display fields. It does not forward MCP
guidance or listener tokens to a client. Requests omit the `agent` query so messages use the person's
identity. Memory edits include `base_version` to prevent lost updates.

Desktop uses the server-scoped `rooms.execute` IPC endpoint. A joined desktop, web client, or phone
uses the optional `rooms-v1` Team API route. Only owners and admins can use the host's connected
Rooms account. This restriction prevents another member from acting as the owner of that account.
An older host does not advertise the capability and does not show the action.

The visible room has one long poll, with a 20 second server wait and a 25 second request deadline.
Leaving the room stops the loop and discards its pending reply. The bounded request then ends on
its own. A server switch remounts the view and clears its data. No Rooms content is stored in the
OpenBot database or account service.

## Verification

`scripts/rooms-e2e.ts` starts the real Rooms service with isolated SQLite data and development
identities. Set `ROOMS_CHECKOUT` to the checkout and `ROOMS_PYTHON` to a Python environment with its
dependencies. It writes `.openbot-build/rooms-e2e/report.json`. The Rooms repository is private, so
this check runs by hand with an available checkout. CI runs `scripts/rooms-proxy-e2e.ts` against
a bounded local HTTP fixture to check the proxy and credential boundary.
`scripts/team-api-routes-e2e.ts` checks the real Team API route, the admin/member gate, and the
optional capability. The IPC coverage test checks the preload and handler registrations.

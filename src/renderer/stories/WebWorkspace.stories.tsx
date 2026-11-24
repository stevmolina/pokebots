import {
  type AgentProviderStatus,
  type AgentStatus,
  SIDEBAR_PEOPLE_SECTION_ID,
  SIDEBAR_UNASSIGNED_SECTION_ID,
} from "@pokebots/contracts/ipc";
import type { RoomSummary, RoomsResult } from "@pokebots/contracts/rooms";
import { isDynamicRecord } from "@pokebots/contracts/runtime-values";
import { TEAM_API_ROUTES } from "@pokebots/contracts/team-api-routes";
import { AGENT_TASKS_CAPABILITY, AGENT_TASKS_ROUTES } from "@pokebots/contracts/team-protocol/agent-tasks-v1";
import { AGENT_THREADS_CAPABILITY, AGENT_THREADS_ROUTES } from "@pokebots/contracts/team-protocol/agent-threads-v1";
import { PROVIDERS_ADMIN_ROUTES } from "@pokebots/contracts/team-protocol/providers-v1";
import { PROVIDERS_RUNTIMES_V2_ROUTES } from "@pokebots/contracts/team-protocol/providers-v2";
import { PROVIDERS_SIGN_IN_V3_ROUTES } from "@pokebots/contracts/team-protocol/providers-v3";
import { ROOMS_CAPABILITY, ROOMS_ROUTE } from "@pokebots/contracts/team-protocol/rooms-v1";
import type { TeamApiRequest } from "@pokebots/team-client/team-api-requests";
import { Toaster } from "@pokebots/ui";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { saveRemoteWorkspaceFrame } from "../src/features/servers/remote-workspace-frame";
import { WebWorkspace } from "../src/features/web-client/WebWorkspace";
import type { WebRuntimeFactory } from "../src/features/web-client/web-client-context";
import { WebHostOtherTabError } from "../src/features/web-client/web-host-lock";
import { WebHostIncompatibleError } from "../src/features/web-client/web-runtime";
import { createBenchWebRuntime } from "../src/preview/bench-web-runtime";
import { requireFixture, STORY_AGENT_SUMMARIES } from "../src/preview/fixtures";
import { mockAccountCatalogFetch } from "../src/preview/mock-account-catalog";
import { MOCK_HOSTED_SERVER_CATALOG } from "../src/preview/mock-hosted-servers";
import { createMockOpenBot } from "../src/preview/mock-openbot";
import { createMockWebRuntime, mockWebRuntimeFor } from "../src/preview/mock-web-runtime";
import { AGENT_ID, TABS_KEY, THREAD_OPTIONS } from "./agent-threads-fixtures";
import "../src/features/web-client/web-client.css";

/** The account service: the marketplace catalog is a mock, and other routes go to the network. */
const accountFetch = mockAccountCatalogFetch();

const meta = {
  title: "Web/Workspace",
  component: WebWorkspace,
  parameters: { layout: "fullscreen" },
  args: {
    accountId: "preview-account",
    accountEmail: "you@example.com",
    accountName: "Preview User",
    accountFetch,
    onSessionCheck: async () => {},
    onLogout: async () => {},
    createRuntime: createMockWebRuntime,
    language: "system",
    onChangeLanguage: () => {},
  },
  render: (args) => (
    <div class="web-app">
      <Toaster />
      <WebWorkspace {...args} />
    </div>
  ),
} satisfies Meta<typeof WebWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

/** The Marketplace page, opened on an app by a `/app?plugin=<slug>` link. */
export const MarketplaceApp: Story = {
  args: { pluginSlug: "linear" },
};

/** A long conversation. `bun run perf:web` streams replies into it and counts the host requests. */
export const LongConversation: Story = {
  args: { createRuntime: createBenchWebRuntime },
};

const noHostRuntime: WebRuntimeFactory = (...args) => ({
  ...createMockWebRuntime(...args),
  listHosts: async () => [],
});

const failedHostsRuntime: WebRuntimeFactory = (...args) => ({
  ...createMockWebRuntime(...args),
  listHosts: async () => {
    throw new Error("Host directory unavailable.");
  },
});

/** Another tab has the host open until "Use here" takes it. */
const otherTabRuntime: WebRuntimeFactory = (...args) => {
  const runtime = createMockWebRuntime(...args);
  return {
    ...runtime,
    connect: async (host, options) => {
      if (!options?.takeOver) throw new WebHostOtherTabError();
      return runtime.connect(host, options);
    },
  };
};

const incompatibleRuntime: WebRuntimeFactory = (...args) => ({
  ...createMockWebRuntime(...args),
  connect: async () => {
    throw new WebHostIncompatibleError(
      { appVersion: "0.40.0", protocol: { minimum: 1, maximum: 2 }, capabilities: [] },
      "host_update_required",
    );
  },
});

/** How long the host takes to answer in `SavedFrameSlowConnect`, so the loading screen and its exit both show. */
const SLOW_CONNECT_MS = 6_000;

/** The last visit saved a frame of the workspace, and the host answers slowly. */
const savedFrameSlowRuntime: WebRuntimeFactory = (accountId, events) => {
  const mock = createMockOpenBot();
  const runtime = mockWebRuntimeFor(mock, events);
  const saved = mock.api.agent.listAgents().then((agents) => {
    saveRemoteWorkspaceFrame(accountId, "preview-host", { agents, selectedAgentId: agents[0]?.id ?? null });
  });
  return {
    ...runtime,
    // The frame is read when the connect starts, so the host list waits for the write.
    listHosts: async () => {
      await saved;
      return runtime.listHosts();
    },
    connect: async (host, options) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_CONNECT_MS));
      return runtime.connect(host, options);
    },
  };
};

/** A new page with a saved frame: the chat shows the loader of its history until the host answers. */
export const SavedFrameSlowConnect: Story = {
  args: { createRuntime: savedFrameSlowRuntime },
};

export const NoHost: Story = {
  args: { accountEmail: "you@example.com", createRuntime: noHostRuntime },
};

export const HostsFailed: Story = {
  args: { accountEmail: "you@example.com", createRuntime: failedHostsRuntime },
};

export const OpenInAnotherTab: Story = {
  args: { accountEmail: "you@example.com", createRuntime: otherTabRuntime },
};

export const Incompatible: Story = {
  args: { accountEmail: "you@example.com", createRuntime: incompatibleRuntime },
};

/**
 * The host was still starting its agent when the browser connected, and the browser missed the
 * status event that said ready, as an iPad web app in the background can. Only a new status read
 * shows that the agent is ready.
 */
const missedReadyRuntime: WebRuntimeFactory = (...args) => {
  const base = createMockWebRuntime(...args);
  let reads = 0;
  return {
    ...base,
    status: async () => {
      const status = await base.status();
      reads += 1;
      return reads === 1 ? { ...status, phase: "starting" } : status;
    },
  };
};

export const MissedReadyStatus: Story = {
  args: { createRuntime: missedReadyRuntime },
};

const NEW_SERVER_ID = "cloud-server";

/**
 * A server the user just bought or set up, next to the preview computer: no agents, and no provider
 * signed in on the host. The host serves the provider routes, so an owner sees the provider step
 * before the agent form. Claude signs in with a pasted code; any code connects it.
 */
const newServerRuntime: WebRuntimeFactory = (accountId, events, accountFetch) => {
  const base = createMockWebRuntime(accountId, events, accountFetch);
  const team = createMockOpenBot();
  let status: AgentStatus = {
    phase: "blocked",
    cliVersion: null,
    auth: { kind: "unknown" },
    providers: [
      { id: "codex", state: "sign-in-required", version: "0.149.1", message: null },
      { id: "claude", state: "sign-in-required", version: "2.1.263", message: null },
      { id: "grok", state: "sign-in-required", version: "1.0.22", message: null },
    ],
    capabilities: { chat: "unavailable", browser: "ready", computerUse: "unavailable" },
    message: null,
    fullAccess: true,
  };
  const setClaude = (row: AgentProviderStatus) => {
    status = {
      ...status,
      providers: (status.providers ?? []).map((current) => (current.id === "claude" ? row : current)),
    };
  };
  const ready = (version: string) => ({ phase: "ready", progress: 100, message: null, version });
  const none = { phase: "not-downloaded", progress: null, message: null, version: null };
  const answers: Record<string, (body: unknown) => unknown> = {
    [PROVIDERS_RUNTIMES_V2_ROUTES.runtimesStatus]: () => ({
      revision: 1,
      providers: {
        codex: ready("0.149.1"),
        claude: ready("2.1.263"),
        grok: ready("1.0.22"),
        opencode: none,
        antigravity: none,
      },
      toolRuntimes: { bun: none },
    }),
    [PROVIDERS_ADMIN_ROUTES.customList]: () => [],
    [PROVIDERS_ADMIN_ROUTES.apiKeyState]: () => ({ status: "missing" }),
    [PROVIDERS_SIGN_IN_V3_ROUTES.codeLoginStart]: () => ({
      kind: "paste",
      verificationUrl: "https://claude.com/cai/oauth/authorize?code=true",
      expiresAt: Date.now() + 600_000,
    }),
    // The host checks the code for a moment, then Claude is signed in.
    [PROVIDERS_SIGN_IN_V3_ROUTES.codeLoginSubmit]: () => {
      const claude = { id: "claude", version: "2.1.263", message: null } as const;
      setClaude({ ...claude, state: "sign-in-required", connectionState: "connecting" });
      window.setTimeout(() => {
        status = { ...status, phase: "ready" };
        setClaude({ ...claude, state: "available", email: "you@example.com" });
        events.event(NEW_SERVER_ID, { type: "status", status });
      }, 1500);
      return {};
    },
    [PROVIDERS_SIGN_IN_V3_ROUTES.codeLoginCancel]: () => ({}),
    [TEAM_API_ROUTES.agents.status]: () => status,
  };
  const request: TeamApiRequest = async (_method, path, decode, body) => {
    const answer = answers[path];
    if (!answer) throw new Error(`No preview answer for ${path}.`);
    return decode(answer(body));
  };
  let connected = NEW_SERVER_ID;
  const onNewServer = () => connected === NEW_SERVER_ID;
  return {
    ...base,
    listHosts: async () => {
      const [computer] = await base.listHosts();
      return computer ? [{ ...computer, hostId: NEW_SERVER_ID, name: "Cloud server" }, computer] : [];
    },
    connect: async (host) => {
      connected = host.hostId;
      const capabilities = await base.connect(host);
      events.connection({ hostId: host.hostId, state: "online", message: null });
      return onNewServer() ? [...capabilities, "providers-v1", "providers-v2", "providers-v3"] : capabilities;
    },
    listAgents: async () => (onNewServer() ? [] : base.listAgents()),
    status: async () => (onNewServer() ? status : base.status()),
    admin: { request, download: request, team: team.api.host },
    dispose: async () => {
      team.dispose();
      await base.dispose();
    },
  };
};

export const NewServer: Story = {
  args: { createRuntime: newServerRuntime },
};

/** A host with side threads: the agent-tasks routes, and rename and delete through `agent-threads-v1`. */
const threadsRuntime: WebRuntimeFactory = (_accountId, events) => {
  const mock = createMockOpenBot(THREAD_OPTIONS);
  const base = mockWebRuntimeFor(mock, events);
  const agent = mock.api.agent;
  const answers: Record<string, (body: Record<string, string>) => Promise<unknown>> = {
    [AGENT_TASKS_ROUTES.list]: (body) => agent.listTasks(body.agentId ?? ""),
    [AGENT_TASKS_ROUTES.read]: (body) => agent.readTask({ agentId: body.agentId ?? "", taskId: body.taskId ?? "" }),
    [AGENT_TASKS_ROUTES.start]: (body) =>
      agent.startTask({
        agentId: body.agentId ?? "",
        text: body.text ?? "",
        clientMessageId: body.clientMessageId ?? "",
      }),
    [AGENT_TASKS_ROUTES.send]: (body) =>
      agent.sendMessage({
        agentId: body.agentId ?? "",
        taskId: body.taskId ?? "",
        text: body.text ?? "",
        clientMessageId: body.clientMessageId ?? "",
      }),
    [AGENT_TASKS_ROUTES.stop]: (body) => agent.stopTask({ agentId: body.agentId ?? "", taskId: body.taskId ?? "" }),
    [AGENT_TASKS_ROUTES.close]: (body) => agent.closeTask({ agentId: body.agentId ?? "", taskId: body.taskId ?? "" }),
    [AGENT_TASKS_ROUTES.reopen]: (body) => agent.reopenTask({ agentId: body.agentId ?? "", taskId: body.taskId ?? "" }),
    [AGENT_THREADS_ROUTES.rename]: (body) =>
      agent.renameTask({ agentId: body.agentId ?? "", taskId: body.taskId ?? "", title: body.title ?? "" }),
    [AGENT_THREADS_ROUTES.delete]: (body) =>
      agent.deleteTask({ agentId: body.agentId ?? "", taskId: body.taskId ?? "" }),
  };
  const request: TeamApiRequest = async (_method, path, decode, body) => {
    const answer = answers[path];
    if (!answer) throw new Error(`No preview answer for ${path}.`);
    const fields: Record<string, string> = {};
    if (body && typeof body === "object")
      for (const [key, value] of Object.entries(body)) if (typeof value === "string") fields[key] = value;
    return decode((await answer(fields)) ?? {});
  };
  return {
    ...base,
    connect: async (host) => [...(await base.connect(host)), AGENT_TASKS_CAPABILITY, AGENT_THREADS_CAPABILITY],
    admin: { request, download: request, team: mock.api.host },
  };
};

/**
 * Side threads in the browser: Chief's main session is "Pricing page copy". Open Chief, then its pill,
 * to see the Sessions card.
 */
export const Threads: Story = {
  args: { createRuntime: threadsRuntime },
  render: (args) => {
    localStorage.setItem(
      TABS_KEY,
      JSON.stringify({ "preview-host": { [AGENT_ID]: { open: ["pricing", "competitors"], active: "pricing" } } }),
    );
    return (
      <div class="web-app">
        <Toaster />
        <WebWorkspace {...args} />
      </div>
    );
  },
};

/** The account server's hosted server list, with the server that Checkout paid for already running. */
const checkoutFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = url.endsWith("/hosting/plans")
    ? MOCK_HOSTED_SERVER_CATALOG
    : url.endsWith("/hosting/servers")
      ? {
          available: true,
          servers: [
            {
              serverId: NEW_SERVER_ID,
              name: "Cloud server",
              size: "default",
              plan: "standard",
              interval: "month",
              currency: "eur",
              state: "running",
              error: null,
              createdAt: "2026-09-29T09:30:00.000Z",
              updatedAt: "2026-09-29T09:34:00.000Z",
            },
          ],
        }
      : null;
  return body ? Response.json(body) : accountFetch(input);
};

/** The return from Stripe Checkout: the add server dialog opens on the new server's setup. */
export const CheckoutReturn: Story = {
  args: {
    createRuntime: newServerRuntime,
    accountFetch: checkoutFetch,
    hostingReturn: { serverId: NEW_SERVER_ID, paid: true },
  },
};

/** A hosted server that stopped because nobody used it. A key press or a click wakes it. */
const sleepingRuntime: WebRuntimeFactory = (...args) => ({
  ...createMockWebRuntime(...args),
  connect: async () => {
    throw new Error("The host is not available.");
  },
});

const sleepingFetch: typeof fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/preview-host/status"))
    return Response.json({ serverId: "preview-host", state: "stopped", error: null, sleeping: true });
  if (url.endsWith("/preview-host/wake"))
    return Response.json({
      serverId: "preview-host",
      name: "Preview computer",
      size: "small",
      plan: "starter",
      interval: "month",
      currency: "eur",
      state: "waking",
      error: null,
      createdAt: "2026-09-29T09:30:00.000Z",
      updatedAt: "2026-09-29T09:34:00.000Z",
    });
  return accountFetch(input, init);
};

export const HostedServerAsleep: Story = {
  args: { createRuntime: sleepingRuntime, accountFetch: sleepingFetch },
};

/** Another tab has the cloud server open. The server rail opens the other server. */
const otherTabServersRuntime: WebRuntimeFactory = (...args) => {
  const runtime = createMockWebRuntime(...args);
  return {
    ...runtime,
    listHosts: async () => {
      const [computer] = await runtime.listHosts();
      return computer ? [{ ...computer, hostId: NEW_SERVER_ID, name: "Cloud server" }, computer] : [];
    },
    connect: async (host, options) => {
      if (host.hostId === NEW_SERVER_ID && !options?.takeOver) throw new WebHostOtherTabError();
      return runtime.connect(host, options);
    },
  };
};

export const OpenInAnotherTabWithServers: Story = {
  args: { accountEmail: "you@example.com", createRuntime: otherTabServersRuntime },
};

/**
 * The link to the server drops, as it does each time a phone pauses the installed web app. A
 * `preview-connection-drop` window event with `{ ms, done }` drops it for `ms` milliseconds: connect
 * attempts wait until then, and `done` runs when the link is back. `bun scripts/web-reconnect-notice-e2e.ts`
 * uses it to check that a drop shows no toast.
 */
const connectionDropRuntime: WebRuntimeFactory = (accountId, events, fetch) => {
  const base = createMockWebRuntime(accountId, events, fetch);
  let restored: Promise<void> = Promise.resolve();
  let onReconnect: (() => void) | null = null;
  window.addEventListener("preview-connection-drop", (event) => {
    if (!(event instanceof CustomEvent)) return;
    const { ms, done }: { ms: unknown; done: unknown } = event.detail;
    if (typeof ms !== "number" || typeof done !== "function") return;
    restored = new Promise((resolve) => setTimeout(resolve, ms));
    onReconnect = () => done();
    events.connection({ hostId: "preview-host", state: "offline", message: null });
  });
  return {
    ...base,
    connect: async (...args) => {
      await restored;
      const capabilities = await base.connect(...args);
      onReconnect?.();
      onReconnect = null;
      return capabilities;
    },
  };
};

export const ConnectionDrop: Story = {
  args: { createRuntime: connectionDropRuntime },
};

const LIST_NAMES = [
  "Space Apps",
  "Motion",
  "Pokebot",
  "Flights",
  "NASA Hackathon",
  "HackaSpace",
  "Master of Puppets",
  "Tax Helper",
  "Recipes",
  "Gym Plan",
  "Trip Notes",
  "Budget",
] as const;
const LIST_HUES = [0, 30, 55, 100, 150, 185, 215, 245, 280, 320] as const;
const LIST_FOLDERS = [
  { id: "folder-energy", name: "Total Energies" },
  { id: "folder-agency", name: "Agency Proposal" },
  { id: "folder-sporadic", name: "Sporadic" },
  { id: "folder-brand", name: "Personal Brand" },
] as const;

const LIST_SENT = "2026-08-19T09:40:00.000Z";

/** A fuller phone list: twelve chats, four folders and one unread chat, so the list and its unread button show. */
const phoneListRuntime: WebRuntimeFactory = (_accountId, events) => {
  const now = Date.now();
  const agents = LIST_NAMES.map((name, index) => {
    const base = requireFixture(STORY_AGENT_SUMMARIES[index % STORY_AGENT_SUMMARIES.length], "Story agent");
    return {
      ...base,
      id: `list-${index}`,
      name,
      threadId: `thread-list-${index}`,
      preview: "The summary is ready for your review.",
      updatedAt: new Date(now - (index + 1) * 40 * 60_000).toISOString(),
      avatarSeed: name,
      avatarHue: LIST_HUES[index % LIST_HUES.length] ?? null,
    };
  });
  const folderOf = (index: number) => LIST_FOLDERS[index - 4]?.id;
  const mock = createMockOpenBot({
    agents,
    // Two replies that the person has not read, in the chat that sits below the first screen.
    snapshots: {
      "list-9": {
        agentId: "list-9",
        threadId: "thread-list-9",
        activeTurnId: null,
        revision: 1,
        messages: [
          {
            id: "list-9-1",
            author: "user",
            source: "user",
            text: "Plan the week.",
            createdAt: LIST_SENT,
            status: "completed",
          },
          {
            id: "list-9-2",
            author: "assistant",
            source: "assistant",
            text: "Monday is for the gym.",
            createdAt: LIST_SENT,
            status: "completed",
          },
          {
            id: "list-9-3",
            author: "assistant",
            source: "assistant",
            text: "Tuesday is for rest.",
            createdAt: LIST_SENT,
            status: "completed",
          },
        ],
      },
    },
    sidebarLayout: {
      revision: 1,
      sections: LIST_FOLDERS.map((folder) => ({ id: folder.id, name: folder.name })),
      order: [...LIST_FOLDERS.map((folder) => folder.id), SIDEBAR_PEOPLE_SECTION_ID, SIDEBAR_UNASSIGNED_SECTION_ID],
      agentAssignments: Object.fromEntries(
        agents.flatMap((agent, index) => {
          const folder = folderOf(index);
          return folder ? [[agent.id, folder]] : [];
        }),
      ),
      agentOrder: agents.map((agent) => agent.id),
    },
    conversationReads: {
      "list-9": { unreadCount: 2, firstUnreadMessageId: "list-9-2", throughMessageId: "list-9-1" },
    },
  });
  return mockWebRuntimeFor(mock, events);
};

/** The chat list with enough chats, folders and one unread chat to judge the phone layout at 390 px wide. */
export const PhoneList: Story = {
  args: { createRuntime: phoneListRuntime },
};

const ROOM_NAMES = ["Claude Gang", "Crumb Bakery: checkout bug", "Mac meets VPS", "Steven + Renzo"] as const;
const PREVIEW_ROOMS: readonly RoomSummary[] = ROOM_NAMES.map((name, index) => ({
  id: `room-${index + 1}`,
  name,
  notice: "Plan the work with your people and agents.",
  paused: false,
  role: "owner",
}));

/** A host that has the Rooms route. It answers from four rooms; each room has two messages. */
const roomsRuntime: WebRuntimeFactory = (_accountId, events) => {
  const base = mockWebRuntimeFor(createMockOpenBot(), events);
  const field = (body: unknown, key: string): string | undefined => {
    const value = isDynamicRecord(body) ? body[key] : undefined;
    return typeof value === "string" ? value : undefined;
  };
  const answer = (body: unknown): RoomsResult => {
    const kind = field(body, "kind");
    if (kind === "list") return { connected: true, rooms: PREVIEW_ROOMS };
    const room = PREVIEW_ROOMS.find((candidate) => candidate.id === field(body, "roomId"));
    if (kind === "read")
      return {
        connected: true,
        ...(room ? { room } : {}),
        messages: [
          {
            id: 1,
            thread: null,
            author: "Alice #2bd8",
            kind: "human",
            body: "Welcome to the room.",
            mentions: [],
            at: "2026-11-17T06:00:00Z",
          },
          {
            id: 2,
            thread: null,
            author: "Claude · Alice #2bd8",
            kind: "agent",
            body: "I read the notice and I am ready.",
            mentions: [],
            at: "2026-11-17T06:01:00Z",
          },
        ],
      };
    return { connected: true, ...(room ? { room } : {}), memory: null, agents: [], tasks: [] };
  };
  const request: TeamApiRequest = async (_method, path, decode, body) => {
    if (path !== ROOMS_ROUTE) throw new Error(`No preview answer for ${path}.`);
    // A real host answers a long poll when a message comes; the preview never has news, so it waits.
    if (field(body, "kind") === "wait") return new Promise(() => {});
    return decode(answer(body));
  };
  return {
    ...base,
    connect: async (...args) => [...(await base.connect(...args)), ROOMS_CAPABILITY],
    admin: { request, download: request, team: createMockOpenBot().api.host },
  };
};

/** The Rooms section of a host with the rooms-v1 capability: Go to > Rooms, then open a room. */
export const Rooms: Story = {
  args: { createRuntime: roomsRuntime },
};

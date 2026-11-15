/**
 * Prototypes for simplifying the OpenBot workspace UI across Laptop, iPad, and iPhone:
 * 1. Left Sidebar Bottom: 3 buttons (Profile/Machines & Settings modal, Providers, Connect Apps)
 * 2. Unified Standalone Settings Page: full-window without bot sidebar, minimalist nav + per-machine settings
 * 3. Minimalist Bot Sidebar Comparison: Grok Minimalist vs Hybrid Focus vs Current OpenBot
 * 4. Responsive Workspace Showcase: interactive Laptop (1440px), iPad (820px), and iPhone (390px) views
 */

import type { ServerSummary } from "@openbot/contracts/ipc";
import {
  Blocks,
  BookOpen,
  Button,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleArrowDown,
  Cloud,
  Cpu,
  CreditCard,
  FileText,
  Gauge,
  IconButton,
  Input,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Popover,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Switch,
  UserPlus,
  UserRound,
  Volume2,
  X,
} from "@openbot/ui";
import { accountUsageProviderRows } from "@openbot/ui/features/account/account-usage-view";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { ServerMark } from "@openbot/ui/features/servers/ServerRail";
import { type JSX, Portal } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { SidebarProviderStack } from "../../../packages/ui/src/features/sidebar/SidebarProviderStack";
import { STORY_AGENT, STORY_AGENT_STATUS, STORY_AGENTS, STORY_SERVERS, STORY_USAGE } from "./fixtures";
import { AppSlot, createAppDom, openChat, PrototypeApp } from "./prototype-support";
import "./WorkspaceSimplificationPrototype.css";

interface ProtoMachine {
  id: string;
  name: string;
  kind: "local" | "remote";
  subtitle: string;
  online: boolean;
  server: ServerSummary;
  cpu: string;
  providers: string[];
  mcpCount: number;
  storageUsed: string;
  autoUpdate: boolean;
  browsingMemory: boolean;
  timezone: string;
  defaultAccess: "Full access" | "Ask first" | "Workspace only";
}

const INITIAL_MACHINES: [ProtoMachine, ...ProtoMachine[]] = [
  {
    id: "local",
    name: "This Mac",
    kind: "local",
    subtitle: "macOS · Primary laptop",
    online: true,
    server: { ...STORY_SERVERS[0], name: "This Mac" },
    cpu: "Apple M4 Max · Ready",
    providers: ["Claude", "Codex", "Grok"],
    mcpCount: 5,
    storageUsed: "4.2 GB",
    autoUpdate: true,
    browsingMemory: false,
    timezone: "America/Buenos_Aires",
    defaultAccess: "Full access",
  },
  {
    id: "vps",
    name: "Personal VPS",
    kind: "remote",
    subtitle: "Cloud Linux · 24/7 host",
    online: true,
    server: { ...STORY_SERVERS[0], id: "vps", name: "Personal VPS" },
    cpu: "8 vCPU · 24 GB RAM",
    providers: ["Claude", "Codex"],
    mcpCount: 8,
    storageUsed: "11.8 GB",
    autoUpdate: true,
    browsingMemory: true,
    timezone: "UTC (Automatic)",
    defaultAccess: "Ask first",
  },
];

const CONNECT_APPS = [
  { id: "slack", name: "Slack", category: "Team chat", connected: true },
  { id: "github", name: "GitHub", category: "Code & PRs", connected: true },
  { id: "linear", name: "Linear", category: "Issues", connected: false },
  { id: "gmail", name: "Gmail", category: "Email", connected: true },
  { id: "notion", name: "Notion", category: "Docs & Wiki", connected: false },
];

/* ============================================================================
 * SHARED INTERACTIVE POPOVERS FOR THE 3 SIDEBAR BOTTOM BUTTONS
 * ============================================================================ */

function ProfileMachinesPopover(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: ProtoMachine[];
  activeMachineId: string;
  onSelectMachine: (id: string) => void;
  onOpenSettings: () => void;
  trigger: () => JSX.Element;
}) {
  return (
    <Popover.Root open={props.open} onOpenChange={props.onOpenChange} placement="top-start" gutter={10}>
      {props.trigger()}
      <Popover.Portal>
        <Popover.Content class="ws-proto-account-popover" aria-label="Profile, machines, and settings">
          <div class="ws-proto-pop-section">
            <Button variant="ghost" type="button" class="ws-proto-pop-row" onClick={() => props.onOpenSettings()}>
              <span class="ws-proto-pop-row-left">
                <Gauge aria-hidden="true" />
                <span>Weekly usage</span>
              </span>
              <span class="ws-proto-pop-muted">43% used</span>
            </Button>
            <Button variant="ghost" type="button" class="ws-proto-pop-row" onClick={() => props.onOpenSettings()}>
              <span class="ws-proto-pop-row-left">
                <CircleArrowDown aria-hidden="true" />
                <span>Upgrade plan</span>
              </span>
            </Button>
          </div>

          <div class="ws-proto-pop-divider" />
          <div class="ws-proto-pop-label">Machines</div>
          <div class="ws-proto-pop-section">
            <For each={props.machines}>
              {(machine) => (
                <Button
                  variant="ghost"
                  type="button"
                  class="ws-proto-pop-row"
                  aria-pressed={props.activeMachineId === machine.id ? "true" : "false"}
                  onClick={() => {
                    props.onSelectMachine(machine.id);
                    props.onOpenChange(false);
                  }}
                >
                  <span class="ws-proto-pop-row-left">
                    <span class="ws-proto-machine-dot" aria-hidden="true" />
                    <span>{machine.name}</span>
                  </span>
                  <Show
                    when={props.activeMachineId === machine.id}
                    fallback={<span class="ws-proto-pop-muted">{machine.kind}</span>}
                  >
                    <Check aria-hidden="true" />
                  </Show>
                </Button>
              )}
            </For>
          </div>

          <div class="ws-proto-pop-divider" />
          <div class="ws-proto-pop-section">
            <Button variant="ghost" type="button" class="ws-proto-pop-row" onClick={() => props.onOpenSettings()}>
              <span class="ws-proto-pop-row-left">
                <Smartphone aria-hidden="true" />
                <span>Get OpenBot for mobile</span>
              </span>
            </Button>
            <Button variant="ghost" type="button" class="ws-proto-pop-row" onClick={() => props.onOpenSettings()}>
              <span class="ws-proto-pop-row-left">
                <LifeBuoy aria-hidden="true" />
                <span>Support</span>
              </span>
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              type="button"
              class="ws-proto-pop-row"
              onClick={() => {
                props.onOpenChange(false);
                props.onOpenSettings();
              }}
            >
              <span class="ws-proto-pop-row-left">
                <Settings aria-hidden="true" />
                <span>Settings</span>
              </span>
            </Button>
          </div>

          <div class="ws-proto-pop-divider" />
          <div class="ws-proto-pop-section">
            <Button variant="ghost" type="button" class="ws-proto-pop-row" onClick={() => props.onOpenChange(false)}>
              <span class="ws-proto-pop-row-left">
                <UserPlus aria-hidden="true" />
                <span>Add account</span>
              </span>
            </Button>
            <Button variant="ghost" type="button" class="ws-proto-pop-row" onClick={() => props.onOpenChange(false)}>
              <span class="ws-proto-pop-row-left">
                <LogOut aria-hidden="true" />
                <span>Log out</span>
              </span>
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ConnectAppsPopover(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectedMap: Record<string, boolean>;
  onToggleApp: (id: string) => void;
  trigger: () => JSX.Element;
}) {
  return (
    <Popover.Root open={props.open} onOpenChange={props.onOpenChange} placement="top-end" gutter={10}>
      {props.trigger()}
      <Popover.Portal>
        <Popover.Content class="ws-proto-apps-popover" aria-label="Connect apps">
          <header class="ws-proto-apps-header">
            <h2 class="ws-proto-apps-title">Connect apps</h2>
            <span class="ws-proto-pop-muted">{Object.values(props.connectedMap).filter(Boolean).length} active</span>
          </header>
          <div class="ws-proto-apps-grid">
            <For each={CONNECT_APPS}>
              {(app) => {
                const isConnected = () => Boolean(props.connectedMap[app.id]);
                return (
                  <div class="ws-proto-app-tile">
                    <div class="ws-proto-app-tile-info">
                      <span class="ws-proto-app-tile-name">{app.name}</span>
                      <span class="ws-proto-app-tile-sub">{app.category}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={isConnected() ? "outline" : "default"}
                      type="button"
                      onClick={() => props.onToggleApp(app.id)}
                    >
                      {isConnected() ? "Connected" : "Connect"}
                    </Button>
                  </div>
                );
              }}
            </For>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ============================================================================
 * 1. LEFT SIDEBAR BOTTOM VARIANTS (3 BUTTONS ONLY)
 * ============================================================================ */

function SimplifiedSidebarBottomBar(props: {
  look: "pill-trio" | "split-footer" | "dock-trio";
  machines: ProtoMachine[];
  activeMachineId: string;
  onSelectMachine: (id: string) => void;
  onOpenSettings: () => void;
  initialProfileOpen?: boolean;
}) {
  const [profileOpen, setProfileOpen] = createSignal(false);
  const [appsOpen, setAppsOpen] = createSignal(false);

  onSettled(() => {
    if (!props.initialProfileOpen) return;
    const timer = window.setTimeout(() => setProfileOpen(true), 260);
    return () => window.clearTimeout(timer);
  });
  const [connectedApps, setConnectedApps] = createSignal<Record<string, boolean>>({
    slack: true,
    github: true,
    linear: false,
    gmail: true,
    notion: false,
  });

  const activeMachine = () =>
    props.machines.find((m) => m.id === props.activeMachineId) ?? props.machines[0] ?? INITIAL_MACHINES[0];
  const usageRows = createMemo(() => accountUsageProviderRows(STORY_USAGE, STORY_AGENT_STATUS.providers));

  const toggleApp = (id: string) => setConnectedApps((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div class="ws-proto-bottom-wrap">
      <Show when={props.look === "pill-trio"}>
        <div class="ws-proto-pill-trio" role="toolbar" aria-label="Workspace actions">
          <ProfileMachinesPopover
            open={profileOpen()}
            onOpenChange={setProfileOpen}
            machines={props.machines}
            activeMachineId={props.activeMachineId}
            onSelectMachine={props.onSelectMachine}
            onOpenSettings={props.onOpenSettings}
            trigger={() => (
              <Popover.Trigger
                as={Button}
                variant="ghost"
                type="button"
                class="ws-proto-profile-btn"
                aria-label="Profile, machines, and settings"
              >
                <span class="ws-proto-avatar-ring" aria-hidden="true">
                  SM
                  <span class="ws-proto-machine-pip">
                    <ServerMark server={activeMachine().server} />
                  </span>
                </span>
                <span class="ws-proto-profile-name">Steven · {activeMachine().name}</span>
              </Popover.Trigger>
            )}
          />
          <div class="ws-proto-pill-trio-end">
            <SidebarProviderStack usageRows={usageRows()} onOpenUsage={() => props.onOpenSettings()} />
            <ConnectAppsPopover
              open={appsOpen()}
              onOpenChange={setAppsOpen}
              connectedMap={connectedApps()}
              onToggleApp={toggleApp}
              trigger={() => (
                <Popover.Trigger
                  as={Button}
                  variant="ghost"
                  type="button"
                  class="ws-proto-icon-circle"
                  aria-label="Connect apps"
                >
                  <LayoutGrid aria-hidden="true" />
                </Popover.Trigger>
              )}
            />
          </div>
        </div>
      </Show>

      <Show when={props.look === "split-footer"}>
        <div class="ws-proto-split-footer" role="toolbar" aria-label="Workspace actions">
          <ProfileMachinesPopover
            open={profileOpen()}
            onOpenChange={setProfileOpen}
            machines={props.machines}
            activeMachineId={props.activeMachineId}
            onSelectMachine={props.onSelectMachine}
            onOpenSettings={props.onOpenSettings}
            trigger={() => (
              <Popover.Trigger
                as={Button}
                variant="ghost"
                type="button"
                class="ws-proto-split-profile"
                aria-label="Profile, machines, and settings"
              >
                <span class="ws-proto-avatar-ring" aria-hidden="true">
                  SM
                  <span class="ws-proto-machine-pip">
                    <ServerMark server={activeMachine().server} />
                  </span>
                </span>
                <span class="ws-proto-split-meta">
                  <span class="ws-proto-split-name">Steven Molina</span>
                  <span class="ws-proto-split-sub">{activeMachine().name}</span>
                </span>
              </Popover.Trigger>
            )}
          />
          <div class="ws-proto-split-actions">
            <SidebarProviderStack usageRows={usageRows()} onOpenUsage={() => props.onOpenSettings()} />
            <ConnectAppsPopover
              open={appsOpen()}
              onOpenChange={setAppsOpen}
              connectedMap={connectedApps()}
              onToggleApp={toggleApp}
              trigger={() => (
                <Popover.Trigger
                  as={Button}
                  variant="ghost"
                  type="button"
                  class="ws-proto-icon-circle"
                  aria-label="Connect apps"
                >
                  <LayoutGrid aria-hidden="true" />
                </Popover.Trigger>
              )}
            />
          </div>
        </div>
      </Show>

      <Show when={props.look === "dock-trio"}>
        <div class="ws-proto-dock-trio" role="toolbar" aria-label="Workspace actions">
          <ProfileMachinesPopover
            open={profileOpen()}
            onOpenChange={setProfileOpen}
            machines={props.machines}
            activeMachineId={props.activeMachineId}
            onSelectMachine={props.onSelectMachine}
            onOpenSettings={props.onOpenSettings}
            trigger={() => (
              <Popover.Trigger
                as={Button}
                variant="ghost"
                type="button"
                class="ws-proto-dock-btn"
                aria-label="Account and machines"
              >
                <UserRound aria-hidden="true" />
                <span>Account</span>
              </Popover.Trigger>
            )}
          />
          <Popover.Root placement="top" gutter={10}>
            <Popover.Trigger
              as={Button}
              variant="ghost"
              type="button"
              class="ws-proto-dock-btn"
              aria-label="Providers usage"
            >
              <Cpu aria-hidden="true" />
              <span>Providers</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content class="ws-proto-apps-popover" aria-label="Providers status">
                <header class="ws-proto-apps-header">
                  <h2 class="ws-proto-apps-title">Providers</h2>
                  <span class="ws-proto-pop-muted">3 connected</span>
                </header>
                <div class="ws-proto-apps-grid">
                  <For each={["Claude · 36% left", "Codex · 72% left", "Grok · 78% left"]}>
                    {(line) => (
                      <div class="ws-proto-app-tile">
                        <span class="ws-proto-app-tile-name">{line}</span>
                        <span class="ws-proto-badge">Ready</span>
                      </div>
                    )}
                  </For>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <ConnectAppsPopover
            open={appsOpen()}
            onOpenChange={setAppsOpen}
            connectedMap={connectedApps()}
            onToggleApp={toggleApp}
            trigger={() => (
              <Popover.Trigger
                as={Button}
                variant="ghost"
                type="button"
                class="ws-proto-dock-btn"
                aria-label="Connect apps"
              >
                <Blocks aria-hidden="true" />
                <span>Apps</span>
              </Popover.Trigger>
            )}
          />
        </div>
      </Show>
    </div>
  );
}

export function LeftSidebarBottomVariant(props: {
  look: "pill-trio" | "split-footer" | "dock-trio";
  initialProfileOpen?: boolean;
}) {
  const app = createAppDom();
  const [machines] = createSignal(INITIAL_MACHINES);
  const [activeMachineId, setActiveMachineId] = createSignal("local");
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  return (
    <div
      class={["ws-proto-root", "ws-proto-replace-pill", { "ws-proto-settings-active": settingsOpen() }]}
      ref={app.attach}
    >
      <div class="ws-proto-app-host">
        <PrototypeApp />
      </div>
      <AppSlot app={app} slot="sidebar">
        <SimplifiedSidebarBottomBar
          look={props.look}
          machines={machines()}
          activeMachineId={activeMachineId()}
          onSelectMachine={setActiveMachineId}
          onOpenSettings={() => setSettingsOpen(true)}
          initialProfileOpen={props.initialProfileOpen}
        />
      </AppSlot>
      <Show when={settingsOpen()}>
        <UnifiedSettingsPageShell variant="grok-flat" onClose={() => setSettingsOpen(false)} />
      </Show>
    </div>
  );
}

/* ============================================================================
 * 2. UNIFIED STANDALONE SETTINGS PAGE (Full window, No bot sidebar, Minimalist)
 * ============================================================================ */

type SettingsMode = "grok-flat" | "two-tier" | "hub-drill";

function UnifiedSettingsPageShell(props: { variant: SettingsMode; onClose: () => void; initialSection?: string }) {
  const [machines, setMachines] = createSignal<ProtoMachine[]>(INITIAL_MACHINES);
  const [selectedMachineId, setSelectedMachineId] = createSignal("vps");
  const [activeSection, setActiveSection] = createSignal(
    props.initialSection ?? (props.variant === "grok-flat" ? "updates" : "general"),
  );
  const [machineSubTab, setMachineSubTab] = createSignal<"overview" | "providers" | "permissions" | "storage">(
    "overview",
  );
  const [drilledMachineId, setDrilledMachineId] = createSignal<string | null>(null);
  const [autoUpdates, setAutoUpdates] = createSignal(true);
  const [launchLogin, setLaunchLogin] = createSignal(true);
  const [liveVoice, setLiveVoice] = createSignal(true);
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false);

  const selectedMachine = () =>
    machines().find((m) => m.id === selectedMachineId()) ?? machines()[0] ?? INITIAL_MACHINES[0];
  const drilledMachine = () => machines().find((m) => m.id === drilledMachineId()) ?? null;

  const updateMachine = (id: string, patch: Partial<ProtoMachine>) => {
    setMachines((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const navItemsGrok = [
    { id: "general", label: "General", icon: Settings },
    { id: "machines", label: "Machines", icon: Monitor },
    { id: "permissions", label: "Permissions", icon: ShieldCheck },
    { id: "vault", label: "Vault", icon: KeyRound },
    { id: "billing", label: "Usage & Billing", icon: CreditCard },
    { id: "updates", label: "Updates", icon: CircleArrowDown },
  ] as const;

  const overallTwoTier = [
    { id: "general", label: "General", icon: Settings },
    { id: "billing", label: "Account & Billing", icon: CreditCard },
    { id: "voice", label: "Voice & Alerts", icon: Volume2 },
    { id: "updates", label: "Updates", icon: CircleArrowDown },
  ] as const;

  const sectionTitle = () => {
    if (props.variant === "two-tier" && activeSection().startsWith("machine:")) {
      const m = machines().find((x) => `machine:${x.id}` === activeSection());
      return m ? m.name : "Machine";
    }
    const drilled = drilledMachine();
    if (props.variant === "hub-drill" && activeSection() === "machines" && drilled) {
      return drilled.name;
    }
    const map: Record<string, string> = {
      general: "General",
      machines: "Machines",
      permissions: "Permissions & Apps",
      vault: "Vault",
      billing: "Usage & Billing",
      updates: "Updates",
      voice: "Voice & Alerts",
    };
    return map[activeSection()] ?? "Settings";
  };

  const renderMachineEditor = (machine: ProtoMachine) => (
    <div class="ws-proto-settings-container">
      <div class="ws-proto-machine-bar">
        <Show when={props.variant === "grok-flat"}>
          <fieldset class="ws-proto-machine-pills" aria-label="Select machine">
            <For each={machines()}>
              {(m) => (
                <Button
                  variant="ghost"
                  type="button"
                  class="ws-proto-machine-pill"
                  aria-pressed={selectedMachineId() === m.id ? "true" : "false"}
                  onClick={() => setSelectedMachineId(m.id)}
                >
                  <span class="ws-proto-machine-dot" aria-hidden="true" />
                  <span>{m.name}</span>
                </Button>
              )}
            </For>
            <Button variant="ghost" type="button" class="ws-proto-machine-pill" aria-label="Add machine">
              <Plus aria-hidden="true" />
              <span>Add</span>
            </Button>
          </fieldset>
        </Show>

        <Show when={props.variant === "two-tier" || props.variant === "hub-drill"}>
          <div class="ws-proto-segmented" role="tablist" aria-label="Machine settings categories">
            <For
              each={
                [
                  { id: "overview", label: "Overview" },
                  { id: "providers", label: "Providers & MCP" },
                  { id: "permissions", label: "Permissions" },
                  { id: "storage", label: "Storage" },
                ] as const
              }
            >
              {(tab) => (
                <Button
                  variant="ghost"
                  type="button"
                  role="tab"
                  aria-selected={machineSubTab() === tab.id ? "true" : "false"}
                  class="ws-proto-segmented-btn"
                  onClick={() => setMachineSubTab(tab.id)}
                >
                  {tab.label}
                </Button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.variant === "grok-flat" || machineSubTab() === "overview"}>
        <div>
          <h3 class="ws-proto-section-label">{machine.name} · Identity & Agents</h3>
          <div class="ws-proto-card">
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">Host name</span>
                <span class="ws-proto-card-row-desc">{machine.subtitle}</span>
              </div>
              <span class="ws-proto-badge">{machine.cpu}</span>
            </div>
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">Learn from my browsing</span>
                <span class="ws-proto-card-row-desc">Agents save site workflow tips on this machine</span>
              </div>
              <Switch
                aria-label={`Learn from my browsing on ${machine.name}`}
                checked={machine.browsingMemory}
                onChange={(checked) => updateMachine(machine.id, { browsingMemory: checked })}
              />
            </div>
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">Timezone</span>
                <span class="ws-proto-card-row-desc">Used by scheduled routines on this machine</span>
              </div>
              <span class="ws-proto-pop-muted">{machine.timezone}</span>
            </div>
          </div>
        </div>
      </Show>

      <Show when={props.variant === "grok-flat" || machineSubTab() === "providers"}>
        <div>
          <h3 class="ws-proto-section-label">Providers & MCP on {machine.name}</h3>
          <div class="ws-proto-card">
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">Connected providers</span>
                <span class="ws-proto-card-row-desc">{machine.providers.join(" · ")}</span>
              </div>
              <Button variant="outline" size="sm" type="button">
                Manage providers
              </Button>
            </div>
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">MCP servers</span>
                <span class="ws-proto-card-row-desc">{machine.mcpCount} active tool connections</span>
              </div>
              <Button variant="outline" size="sm" type="button">
                Configure
              </Button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={props.variant === "grok-flat" || machineSubTab() === "permissions" || machineSubTab() === "storage"}>
        <div>
          <h3 class="ws-proto-section-label">Security & Storage</h3>
          <div class="ws-proto-card">
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">Default agent access</span>
                <span class="ws-proto-card-row-desc">Controls approval prompts on {machine.name}</span>
              </div>
              <span class="ws-proto-badge ws-proto-badge-neutral">{machine.defaultAccess}</span>
            </div>
            <div class="ws-proto-card-row">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">Workspace storage</span>
                <span class="ws-proto-card-row-desc">Workspaces, files, and cached runtimes</span>
              </div>
              <span class="ws-proto-pop-muted">{machine.storageUsed}</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );

  return (
    <section class="ws-proto-settings-overlay" aria-label="Unified Settings">
      <nav
        class="ws-proto-settings-nav"
        data-mobile-open={mobileNavOpen() ? "true" : undefined}
        aria-label="Settings sections"
      >
        <div class="ws-proto-settings-brand">
          <h1 class="ws-proto-settings-h1">Settings</h1>
        </div>

        <Show when={props.variant === "grok-flat"}>
          <For each={navItemsGrok}>
            {(item) => {
              const Icon = item.icon;
              return (
                <Button
                  variant="ghost"
                  type="button"
                  class="ws-proto-nav-btn"
                  aria-current={activeSection() === item.id ? "page" : undefined}
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileNavOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Button>
              );
            }}
          </For>
        </Show>

        <Show when={props.variant === "two-tier"}>
          <div class="ws-proto-settings-group-title">Overall</div>
          <For each={overallTwoTier}>
            {(item) => {
              const Icon = item.icon;
              return (
                <Button
                  variant="ghost"
                  type="button"
                  class="ws-proto-nav-btn"
                  aria-current={activeSection() === item.id ? "page" : undefined}
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileNavOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Button>
              );
            }}
          </For>
          <div class="ws-proto-settings-group-title">Machines</div>
          <For each={machines()}>
            {(machine) => (
              <Button
                variant="ghost"
                type="button"
                class="ws-proto-nav-btn"
                aria-current={activeSection() === `machine:${machine.id}` ? "page" : undefined}
                onClick={() => {
                  setActiveSection(`machine:${machine.id}`);
                  setSelectedMachineId(machine.id);
                  setMobileNavOpen(false);
                }}
              >
                <Show when={machine.kind === "local"} fallback={<Cloud aria-hidden="true" />}>
                  <Monitor aria-hidden="true" />
                </Show>
                <span>{machine.name}</span>
                <span class="ws-proto-nav-status" aria-hidden="true" />
              </Button>
            )}
          </For>
        </Show>

        <Show when={props.variant === "hub-drill"}>
          <For
            each={
              [
                { id: "general", label: "General", icon: Settings },
                { id: "machines", label: "Machines", icon: Server },
                { id: "billing", label: "Account & Billing", icon: CreditCard },
                { id: "vault", label: "Permissions & Vault", icon: ShieldCheck },
                { id: "updates", label: "Updates", icon: CircleArrowDown },
              ] as const
            }
          >
            {(item) => {
              const Icon = item.icon;
              return (
                <Button
                  variant="ghost"
                  type="button"
                  class="ws-proto-nav-btn"
                  aria-current={activeSection() === item.id ? "page" : undefined}
                  onClick={() => {
                    setActiveSection(item.id);
                    setDrilledMachineId(null);
                    setMobileNavOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Button>
              );
            }}
          </For>
        </Show>
      </nav>

      <div class="ws-proto-settings-main">
        <header class="ws-proto-settings-topbar">
          <div class="ws-proto-pop-row-left">
            <Show when={props.variant === "hub-drill" && activeSection() === "machines" && drilledMachine()}>
              <IconButton
                variant="ghost"
                size="icon-sm"
                label="Back to machines"
                onClick={() => setDrilledMachineId(null)}
              >
                <ChevronLeft aria-hidden="true" />
              </IconButton>
            </Show>
            <h2 class="ws-proto-settings-page-title">{sectionTitle()}</h2>
          </div>
          <IconButton variant="ghost" size="icon-sm" label="Close settings" onClick={props.onClose}>
            <X aria-hidden="true" />
          </IconButton>
        </header>

        <div class="ws-proto-settings-scroll">
          <Show when={activeSection() === "updates"}>
            <div class="ws-proto-settings-container">
              <div>
                <h3 class="ws-proto-section-label">OpenBot Updates</h3>
                <div class="ws-proto-card">
                  <div class="ws-proto-card-row">
                    <div class="ws-proto-card-row-copy">
                      <span class="ws-proto-card-row-title">Automatic Updates</span>
                      <span class="ws-proto-card-row-desc">Automatically update your client while you're away</span>
                    </div>
                    <Switch aria-label="Automatic Updates" checked={autoUpdates()} onChange={setAutoUpdates} />
                  </div>
                  <div class="ws-proto-card-row">
                    <div class="ws-proto-card-row-copy">
                      <span class="ws-proto-card-row-title">Version 0.69.0</span>
                      <span class="ws-proto-card-row-desc">You're up to date</span>
                    </div>
                    <Button variant="outline" size="sm" type="button">
                      Check for Updates
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Show>

          <Show when={activeSection() === "general"}>
            <div class="ws-proto-settings-container">
              <div>
                <h3 class="ws-proto-section-label">Workspace & Appearance</h3>
                <div class="ws-proto-card">
                  <div class="ws-proto-card-row">
                    <div class="ws-proto-card-row-copy">
                      <span class="ws-proto-card-row-title">Launch at login</span>
                      <span class="ws-proto-card-row-desc">Keep OpenBot ready in the background</span>
                    </div>
                    <Switch aria-label="Launch at login" checked={launchLogin()} onChange={setLaunchLogin} />
                  </div>
                  <div class="ws-proto-card-row">
                    <div class="ws-proto-card-row-copy">
                      <span class="ws-proto-card-row-title">Live voice replies</span>
                      <span class="ws-proto-card-row-desc">Stream real-time voice across desktop and mobile</span>
                    </div>
                    <Switch aria-label="Live voice replies" checked={liveVoice()} onChange={setLiveVoice} />
                  </div>
                </div>
              </div>

              <div>
                <h3 class="ws-proto-section-label">Connected Machines</h3>
                <div class="ws-proto-machine-cards">
                  <For each={machines()}>
                    {(m) => (
                      <div class="ws-proto-machine-card">
                        <div class="ws-proto-machine-card-head">
                          <div class="ws-proto-machine-card-id">
                            <ServerMark server={m.server} />
                            <div>
                              <div class="ws-proto-card-row-title">{m.name}</div>
                              <div class="ws-proto-card-row-desc">{m.subtitle}</div>
                            </div>
                          </div>
                          <span class="ws-proto-badge">Online</span>
                        </div>
                        <div class="ws-proto-card-row-desc">
                          {m.providers.join(" · ")} · {m.mcpCount} MCPs
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => {
                            if (props.variant === "two-tier") setActiveSection(`machine:${m.id}`);
                            else {
                              setActiveSection("machines");
                              setSelectedMachineId(m.id);
                              setDrilledMachineId(m.id);
                            }
                          }}
                        >
                          Configure {m.name}
                        </Button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>

          <Show when={activeSection() === "machines" && props.variant === "grok-flat"}>
            {renderMachineEditor(selectedMachine())}
          </Show>

          <Show when={props.variant === "two-tier" && activeSection().startsWith("machine:")}>
            {renderMachineEditor(selectedMachine())}
          </Show>

          <Show when={props.variant === "hub-drill" && activeSection() === "machines"}>
            <Show
              when={drilledMachine()}
              fallback={
                <div class="ws-proto-settings-container">
                  <div class="ws-proto-machine-cards">
                    <For each={machines()}>
                      {(m) => (
                        <div class="ws-proto-machine-card">
                          <div class="ws-proto-machine-card-head">
                            <div class="ws-proto-machine-card-id">
                              <ServerMark server={m.server} />
                              <div>
                                <div class="ws-proto-card-row-title">{m.name}</div>
                                <div class="ws-proto-card-row-desc">{m.cpu}</div>
                              </div>
                            </div>
                            <span class="ws-proto-badge">Online</span>
                          </div>
                          <div class="ws-proto-card-row-desc">
                            {m.providers.join(" · ")} · {m.storageUsed} used
                          </div>
                          <Button variant="outline" size="sm" type="button" onClick={() => setDrilledMachineId(m.id)}>
                            Open machine settings
                          </Button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              }
            >
              {(machine) => renderMachineEditor(machine())}
            </Show>
          </Show>

          <Show when={["permissions", "vault", "billing", "voice"].includes(activeSection())}>
            <div class="ws-proto-settings-container">
              <div>
                <h3 class="ws-proto-section-label">{sectionTitle()}</h3>
                <div class="ws-proto-card">
                  <div class="ws-proto-card-row">
                    <div class="ws-proto-card-row-copy">
                      <span class="ws-proto-card-row-title">Synced across your machines</span>
                      <span class="ws-proto-card-row-desc">
                        Global defaults apply everywhere; override per machine inside Machines.
                      </span>
                    </div>
                    <span class="ws-proto-badge ws-proto-badge-neutral">Synced</span>
                  </div>
                  <div class="ws-proto-card-row">
                    <div class="ws-proto-card-row-copy">
                      <span class="ws-proto-card-row-title">Weekly allowance</span>
                      <span class="ws-proto-card-row-desc">43% used across Claude, Codex, and Grok</span>
                    </div>
                    <Button variant="outline" size="sm" type="button">
                      Manage plan
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}

export function UnifiedSettingsVariant(props: { variant: SettingsMode; initialSection?: string }) {
  const [open, setOpen] = createSignal(true);
  const app = createAppDom();

  return (
    <div class={["ws-proto-root", { "ws-proto-settings-active": open() }]} ref={app.attach}>
      <div class="ws-proto-app-host">
        <PrototypeApp />
      </div>
      <Show when={open()}>
        <UnifiedSettingsPageShell
          variant={props.variant}
          initialSection={props.initialSection}
          onClose={() => setOpen(false)}
        />
      </Show>
    </div>
  );
}

/* ============================================================================
 * 3. BOT SIDEBAR COMPARISON (Grok Minimalist vs Hybrid Focus vs Current OpenBot)
 * ============================================================================ */

function GrokMinimalBotDrawer(props: { onClose: () => void }) {
  const [tab, setTab] = createSignal<"activity" | "library">("activity");
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal(STORY_AGENT.name);
  const [voice, setVoice] = createSignal("Helix 1.0x");
  const [lang, setLang] = createSignal("Auto-detect");

  return (
    <aside class="ws-proto-bot-drawer" aria-label="Minimalist bot sidebar">
      <div class="ws-proto-bot-top">
        <IconButton variant="ghost" size="icon-sm" label="Close bot sidebar" onClick={props.onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>

      <div class="ws-proto-bot-scroll">
        <div class="ws-proto-bot-hero">
          <div class="ws-proto-bot-avatar">
            <AgentAvatar agent={STORY_AGENT} motion="always" />
          </div>
          <h2 class="ws-proto-bot-name">{name()}</h2>
          <p class="ws-proto-bot-subtitle">
            {STORY_AGENT.title} ·{" "}
            <button
              type="button"
              style={{
                border: 0,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                "text-decoration": "underline",
              }}
              onClick={() => setEditing((v) => !v)}
            >
              {editing() ? "Done" : "Edit"}
            </button>
          </p>
        </div>

        <Show when={editing()}>
          <div class="ws-proto-card">
            <div class="ws-proto-card-row">
              <Input aria-label="Agent name" value={name()} onValueChange={setName} />
            </div>
          </div>
        </Show>

        <div class="ws-proto-segmented" role="tablist" aria-label="Bot inspector views">
          <Button
            variant="ghost"
            type="button"
            role="tab"
            aria-selected={tab() === "activity" ? "true" : "false"}
            class="ws-proto-segmented-btn"
            onClick={() => setTab("activity")}
          >
            Activity
          </Button>
          <Button
            variant="ghost"
            type="button"
            role="tab"
            aria-selected={tab() === "library" ? "true" : "false"}
            class="ws-proto-segmented-btn"
            onClick={() => setTab("library")}
          >
            Library
          </Button>
        </div>

        <Show when={tab() === "activity"}>
          <div>
            <div class="ws-proto-bot-group-head">
              <span>Suggested</span>
            </div>
            <div class="ws-proto-card">
              <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
                <span class="ws-proto-bot-row-left">
                  <CalendarClock aria-hidden="true" />
                  <span>Create a routine</span>
                </span>
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div>
            <div class="ws-proto-bot-group-head">
              <span>Computer</span>
            </div>
            <div class="ws-proto-computer-card">
              <div class="ws-proto-card-row-copy">
                <span class="ws-proto-card-row-title">{name()}'s computer</span>
                <span class="ws-proto-card-row-desc">Ready · gpt-5.6-luna</span>
              </div>
              <div class="ws-proto-computer-thumb" aria-hidden="true">
                <Monitor />
              </div>
            </div>
          </div>

          <div>
            <div class="ws-proto-bot-group-head">
              <span>Voice chat</span>
            </div>
            <div class="ws-proto-card">
              <div class="ws-proto-card-row">
                <span class="ws-proto-card-row-title">Voice</span>
                <Select<string>
                  options={["Helix 1.0x", "Ember 1.0x", "Sol 1.2x"]}
                  value={voice()}
                  onChange={(v) => v && setVoice(v)}
                  itemComponent={(item) => <SelectItem item={item.item}>{item.item.rawValue}</SelectItem>}
                >
                  <SelectTrigger aria-label="Voice">
                    <SelectValue<string>>{(state) => state.selectedOption() ?? voice()}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="ws-proto-card-row">
                <span class="ws-proto-card-row-title">Language</span>
                <Select<string>
                  options={["Auto-detect", "English", "Spanish"]}
                  value={lang()}
                  onChange={(v) => v && setLang(v)}
                  itemComponent={(item) => <SelectItem item={item.item}>{item.item.rawValue}</SelectItem>}
                >
                  <SelectTrigger aria-label="Language">
                    <SelectValue<string>>{(state) => state.selectedOption() ?? lang()}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
            </div>
          </div>
        </Show>

        <Show when={tab() === "library"}>
          <div>
            <div class="ws-proto-bot-group-head">
              <span>Knows & Rules</span>
            </div>
            <div class="ws-proto-card">
              <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
                <span class="ws-proto-bot-row-left">
                  <FileText aria-hidden="true" />
                  <span>Instructions</span>
                </span>
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
                <span class="ws-proto-bot-row-left">
                  <BookOpen aria-hidden="true" />
                  <span>Memories</span>
                </span>
                <span class="ws-proto-bot-row-val">
                  13 saved <ChevronRight aria-hidden="true" />
                </span>
              </Button>
              <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
                <span class="ws-proto-bot-row-left">
                  <Sparkles aria-hidden="true" />
                  <span>Skills & Files</span>
                </span>
                <span class="ws-proto-bot-row-val">
                  47 KB <ChevronRight aria-hidden="true" />
                </span>
              </Button>
              <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
                <span class="ws-proto-bot-row-left">
                  <ShieldCheck aria-hidden="true" />
                  <span>Permissions</span>
                </span>
                <span class="ws-proto-bot-row-val">
                  Full access <ChevronRight aria-hidden="true" />
                </span>
              </Button>
            </div>
          </div>
        </Show>
      </div>
    </aside>
  );
}

function HybridFocusBotDrawer(props: { onClose: () => void }) {
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal(STORY_AGENT.name);

  return (
    <aside class="ws-proto-bot-drawer" aria-label="Hybrid minimalist bot sidebar">
      <div class="ws-proto-bot-top">
        <IconButton variant="ghost" size="icon-sm" label="Close bot sidebar" onClick={props.onClose}>
          <X aria-hidden="true" />
        </IconButton>
      </div>

      <div class="ws-proto-bot-scroll">
        <div class="ws-proto-bot-hero">
          <div class="ws-proto-bot-avatar">
            <AgentAvatar agent={STORY_AGENT} motion="always" />
          </div>
          <h2 class="ws-proto-bot-name">{name()}</h2>
          <p class="ws-proto-bot-subtitle">{STORY_AGENT.title}</p>
          <Button variant="outline" size="sm" type="button" onClick={() => setEditing((v) => !v)}>
            <Pencil aria-hidden="true" />
            <span>{editing() ? "Done editing" : "Edit profile"}</span>
          </Button>
        </div>

        <Show when={editing()}>
          <div class="ws-proto-card">
            <div class="ws-proto-card-row">
              <Input aria-label="Agent name" value={name()} onValueChange={setName} />
            </div>
          </div>
        </Show>

        <div>
          <div class="ws-proto-bot-group-head">
            <span>Brain & Computer</span>
          </div>
          <div class="ws-proto-card">
            <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
              <span class="ws-proto-bot-row-left">
                <Cpu aria-hidden="true" />
                <span>Model</span>
              </span>
              <span class="ws-proto-bot-row-val">
                gpt-5.6-luna <ChevronRight aria-hidden="true" />
              </span>
            </Button>
            <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
              <span class="ws-proto-bot-row-left">
                <Monitor aria-hidden="true" />
                <span>Computer</span>
              </span>
              <span class="ws-proto-bot-row-val">
                Ready <ChevronRight aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>

        <div>
          <div class="ws-proto-bot-group-head">
            <span>Knows</span>
          </div>
          <div class="ws-proto-card">
            <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
              <span class="ws-proto-bot-row-left">
                <FileText aria-hidden="true" />
                <span>Instructions & Memories</span>
              </span>
              <span class="ws-proto-bot-row-val">
                13 saved <ChevronRight aria-hidden="true" />
              </span>
            </Button>
            <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
              <span class="ws-proto-bot-row-left">
                <Sparkles aria-hidden="true" />
                <span>Skills, Files & Tables</span>
              </span>
              <span class="ws-proto-bot-row-val">
                47 KB <ChevronRight aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>

        <div>
          <div class="ws-proto-bot-group-head">
            <span>Does & Rules</span>
          </div>
          <div class="ws-proto-card">
            <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
              <span class="ws-proto-bot-row-left">
                <CalendarClock aria-hidden="true" />
                <span>Routines</span>
              </span>
              <span class="ws-proto-bot-row-val">
                2 active <ChevronRight aria-hidden="true" />
              </span>
            </Button>
            <Button variant="ghost" type="button" class="ws-proto-bot-row-btn">
              <span class="ws-proto-bot-row-left">
                <ShieldCheck aria-hidden="true" />
                <span>Permissions</span>
              </span>
              <span class="ws-proto-bot-row-val">
                Full access <ChevronRight aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function BotSidebarCompareVariant(props: {
  initialMode: "grok" | "hybrid" | "current";
  showSwitcher?: boolean;
}) {
  const [mode, setMode] = createSignal<"grok" | "hybrid" | "current">(props.initialMode);
  const [sidePanelEl, setSidePanelEl] = createSignal<Element | null>(null);
  const app = createAppDom();

  onSettled(() => {
    const root = app.dom.root;
    if (!root) return;
    let opened = false;
    let clickedLauncher = false;
    const ensureOpen = () => {
      if (!opened) {
        opened = openChat(root, "chief");
      }
      const panel = root.querySelector("#settings-side-panel");
      if (panel) {
        if (panel !== sidePanelEl()) setSidePanelEl(panel);
        return;
      }
      const titleBtn = root.querySelector<HTMLElement>("button.conversation-title");
      if (titleBtn) {
        titleBtn.click();
        return;
      }
      const launchButtons = Array.from(root.querySelectorAll<HTMLElement>(".side-panel-launch"));
      const settingsLaunch = launchButtons.find((btn) => /settings/i.test(btn.textContent ?? ""));
      if (settingsLaunch && !clickedLauncher) {
        clickedLauncher = true;
        settingsLaunch.click();
        return;
      }
      const hasDock = Boolean(root.querySelector(".side-panel-header"));
      if (!hasDock) {
        const openPanelBtn = root.querySelector<HTMLElement>('button[aria-label="Open side panel"]');
        openPanelBtn?.click();
      }
    };
    const timer = window.setInterval(ensureOpen, 140);
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 4500);
    ensureOpen();
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  });

  const replacingPanel = () => mode() !== "current";

  return (
    <div class={["ws-proto-root", { "ws-proto-replace-bot-panel": replacingPanel() }]} ref={app.attach}>
      <Show when={props.showSwitcher}>
        <fieldset class="ws-proto-compare-bar" aria-label="Compare bot sidebar style">
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-compare-pill"
            aria-pressed={mode() === "current" ? "true" : "false"}
            onClick={() => setMode("current")}
          >
            Current OpenBot
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-compare-pill"
            aria-pressed={mode() === "grok" ? "true" : "false"}
            onClick={() => setMode("grok")}
          >
            Grok Minimalist
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-compare-pill"
            aria-pressed={mode() === "hybrid" ? "true" : "false"}
            onClick={() => setMode("hybrid")}
          >
            Hybrid Focus
          </Button>
        </fieldset>
      </Show>

      <div class="ws-proto-app-host">
        <PrototypeApp />
      </div>

      <Show when={replacingPanel() && sidePanelEl()} keyed>
        {(panel) => (
          <Portal mount={panel}>
            <Show when={mode() === "grok"}>
              <GrokMinimalBotDrawer onClose={() => setMode("current")} />
            </Show>
            <Show when={mode() === "hybrid"}>
              <HybridFocusBotDrawer onClose={() => setMode("current")} />
            </Show>
          </Portal>
        )}
      </Show>
    </div>
  );
}

/* ============================================================================
 * 4. RESPONSIVE SHOWCASE (Laptop 1440 · iPad 820 · iPhone 390)
 * ============================================================================ */

export function ResponsiveWorkspaceVariant(props: {
  initialDevice: "laptop" | "ipad" | "iphone";
  initialScreen: "workspace" | "settings" | "bot-sidebar";
}) {
  const [device, setDevice] = createSignal<"laptop" | "ipad" | "iphone">(props.initialDevice);
  const [screen, setScreen] = createSignal<"workspace" | "settings" | "bot-sidebar">(props.initialScreen);
  const [machines] = createSignal(INITIAL_MACHINES);
  const [activeMachineId, setActiveMachineId] = createSignal("local");

  const frameClass = () => {
    if (device() === "iphone") return "ws-proto-device-frame ws-proto-device-iphone";
    if (device() === "ipad") return "ws-proto-device-frame ws-proto-device-ipad";
    return "ws-proto-device-frame ws-proto-device-laptop";
  };

  return (
    <div class="ws-proto-root ws-proto-responsive-stage">
      <header class="ws-proto-responsive-toolbar">
        <fieldset class="ws-proto-segmented" aria-label="Device size">
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-segmented-btn"
            aria-pressed={device() === "laptop" ? "true" : "false"}
            onClick={() => setDevice("laptop")}
          >
            <Monitor aria-hidden="true" />
            <span>Laptop</span>
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-segmented-btn"
            aria-pressed={device() === "ipad" ? "true" : "false"}
            onClick={() => setDevice("ipad")}
          >
            <Monitor aria-hidden="true" />
            <span>iPad (820px)</span>
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-segmented-btn"
            aria-pressed={device() === "iphone" ? "true" : "false"}
            onClick={() => setDevice("iphone")}
          >
            <Smartphone aria-hidden="true" />
            <span>iPhone (390px)</span>
          </Button>
        </fieldset>

        <fieldset class="ws-proto-segmented" aria-label="Screen view">
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-segmented-btn"
            aria-pressed={screen() === "workspace" ? "true" : "false"}
            onClick={() => setScreen("workspace")}
          >
            Sidebar & Chat
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-segmented-btn"
            aria-pressed={screen() === "settings" ? "true" : "false"}
            onClick={() => setScreen("settings")}
          >
            Unified Settings
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="ws-proto-segmented-btn"
            aria-pressed={screen() === "bot-sidebar" ? "true" : "false"}
            onClick={() => setScreen("bot-sidebar")}
          >
            Bot Sidebar
          </Button>
        </fieldset>
      </header>

      <div class="ws-proto-responsive-canvas">
        <div class={frameClass()}>
          <Show when={screen() === "settings"}>
            <UnifiedSettingsPageShell variant="hub-drill" onClose={() => setScreen("workspace")} />
          </Show>

          <Show when={screen() !== "settings" && device() === "laptop"}>
            <Show when={screen() === "bot-sidebar"} fallback={<LeftSidebarBottomVariant look="pill-trio" />}>
              <BotSidebarCompareVariant initialMode="grok" />
            </Show>
          </Show>

          <Show when={screen() !== "settings" && device() === "ipad"}>
            <div class="ws-proto-ipad-shell">
              <div class="ws-proto-ipad-sidebar">
                <div class="ws-proto-phone-header">
                  <span class="ws-proto-apps-title">OpenBot</span>
                  <IconButton variant="ghost" size="icon-sm" label="New agent">
                    <Plus aria-hidden="true" />
                  </IconButton>
                </div>
                <div class="ws-proto-phone-list">
                  <For each={STORY_AGENTS}>
                    {(agent) => (
                      <button type="button" class="ws-proto-phone-chat-row" onClick={() => setScreen("bot-sidebar")}>
                        <AgentAvatar agent={agent} />
                        <div class="ws-proto-card-row-copy">
                          <span class="ws-proto-card-row-title">{agent.name}</span>
                          <span class="ws-proto-card-row-desc">{agent.preview}</span>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
                <SimplifiedSidebarBottomBar
                  look="pill-trio"
                  machines={machines()}
                  activeMachineId={activeMachineId()}
                  onSelectMachine={setActiveMachineId}
                  onOpenSettings={() => setScreen("settings")}
                />
              </div>
              <div class="ws-proto-ipad-main">
                <div
                  style={{
                    padding: "24px",
                    display: "flex",
                    "flex-direction": "column",
                    "justify-content": "center",
                    "align-items": "center",
                    gap: "8px",
                  }}
                >
                  <AgentAvatar agent={STORY_AGENT} motion="always" />
                  <h2 class="ws-proto-bot-name">{STORY_AGENT.name}</h2>
                  <p class="ws-proto-bot-subtitle">{STORY_AGENT.preview}</p>
                </div>
                <div style={{ "border-inline-start": "1px solid var(--openbot-border)" }}>
                  <GrokMinimalBotDrawer onClose={() => setScreen("workspace")} />
                </div>
              </div>
            </div>
          </Show>

          <Show when={screen() !== "settings" && device() === "iphone"}>
            <Show
              when={screen() === "bot-sidebar"}
              fallback={
                <div class="ws-proto-phone-shell">
                  <header class="ws-proto-phone-header">
                    <IconButton
                      variant="ghost"
                      size="icon-sm"
                      label="Open settings"
                      onClick={() => setScreen("settings")}
                    >
                      <SlidersHorizontal aria-hidden="true" />
                    </IconButton>
                    <span class="ws-proto-apps-title">This Mac</span>
                    <IconButton variant="ghost" size="icon-sm" label="New chat">
                      <Plus aria-hidden="true" />
                    </IconButton>
                  </header>
                  <div class="ws-proto-phone-list">
                    <For each={STORY_AGENTS}>
                      {(agent) => (
                        <button type="button" class="ws-proto-phone-chat-row" onClick={() => setScreen("bot-sidebar")}>
                          <AgentAvatar agent={agent} />
                          <div class="ws-proto-card-row-copy">
                            <span class="ws-proto-card-row-title">{agent.name}</span>
                            <span class="ws-proto-card-row-desc">{agent.preview}</span>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="ws-proto-phone-bottom-dock">
                    <SimplifiedSidebarBottomBar
                      look="pill-trio"
                      machines={machines()}
                      activeMachineId={activeMachineId()}
                      onSelectMachine={setActiveMachineId}
                      onOpenSettings={() => setScreen("settings")}
                    />
                  </div>
                </div>
              }
            >
              <GrokMinimalBotDrawer onClose={() => setScreen("workspace")} />
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}

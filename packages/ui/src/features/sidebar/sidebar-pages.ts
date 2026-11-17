import type { AccountUsageProviderRow } from "../account/account-usage-view";
import type { ShortcutPlatform } from "../shortcuts/shortcut-registry";
import type { HelpMenuProps } from "../updates/HelpMenu";

/**
 * The pages that the chat sidebar opens. "chats" is the agents page with the chat list. "routines"
 * is the same page with the routine canvas of the open agent in the middle.
 */
export type SidebarPage =
  | "chats"
  | "routines"
  | "workflows"
  | "tasks"
  | "schedule"
  | "usage"
  | "library"
  | "rooms"
  | "brain"
  | "machines"
  | "crm"
  | "marketplace"
  | "settings";

/** The pages that the user can pin to the pill of the sidebar, in pill order. Chats always shows. */
export const SIDEBAR_PINNABLE_PAGES = [
  "routines",
  "workflows",
  "tasks",
  "schedule",
  "usage",
  "library",
  "machines",
] as const satisfies readonly SidebarPage[];
export type SidebarPinnablePage = (typeof SIDEBAR_PINNABLE_PAGES)[number];

/** The answer of one custom agent to its usage prompt. OpenBot cannot read a percent from it. */
export interface SidebarCustomAgentUsage {
  id: string;
  name: string;
  text: string;
}

/**
 * The pages, the provider usage and the account switch of the chat sidebar. They took the place of
 * the page rail, so the sidebar stays on every page.
 */
export interface SidebarPages {
  /** The page on screen, or `null` while a page that the sidebar does not open shows. */
  current: SidebarPage | null;
  /** The pages that show as pill buttons. The More menu has all pages, and pins them in Customize pill. */
  pinned: readonly SidebarPinnablePage[];
  onPinChange: (page: SidebarPinnablePage, pinned: boolean) => void;
  /** The plan limits of each provider account. Each one with a reported window shows as rings. */
  usageRows: readonly AccountUsageProviderRow[];
  /** The answers of the custom agents on this computer that have a usage prompt. Absent on the web. */
  customAgentUsage?: readonly SidebarCustomAgentUsage[] | undefined;
  onChats: () => void;
  /** Absent when the server has no routines. */
  onRoutines?: (() => void) | undefined;
  /** Absent when the server has no workflows. */
  onWorkflows?: (() => void) | undefined;
  /** Absent where the server keeps no tasks. */
  onTasks?: ((button: HTMLElement) => void) | undefined;
  /** Absent where there is no schedule page. */
  onSchedule?: ((button: HTMLElement) => void) | undefined;
  onUsage: (button: HTMLElement) => void;
  /** Absent where the server keeps no files, such as the web client. */
  onLibrary?: ((button: HTMLElement) => void) | undefined;
  /** Every connected server with its agents. Absent where the app knows one server only, such as the web client. */
  onComputers?: (() => void) | undefined;
  onMachines?: ((button: HTMLElement) => void) | undefined;
  /** Absent where the server has no Rooms page: a joined server that is older or that the user cannot administer. */
  onRooms?: (() => void) | undefined;
  /** Absent where the host has no Brain route, or where this computer cannot open one. */
  onBrain?: (() => void) | undefined;
  /** Opens Server Settings > Providers. Absent when this account cannot manage the providers. */
  onProviders?: ((button: HTMLElement) => void) | undefined;
  /** Opens the CRM. Absent for a member, an older host, or while the CRM is off in Server Settings. */
  onCrm?: ((button: HTMLElement) => void) | undefined;
  /** Absent while Marketplace cannot open. */
  onMarketplace?: (() => void) | undefined;
  onSettings: (button: HTMLElement) => void;
  /** A notice for Settings, such as an update, when no other place shows it. A dot marks More. */
  settingsNotice?: string | undefined;
  /** The Help submenu of More. */
  help: Omit<HelpMenuProps, "triggerClass">;
  /** Collapses the sidebar to the face dock. */
  onCollapse: () => void;
  /** The keyboard of the device, so the buttons name their shortcut keys. Absent until it is known. */
  shortcutPlatform?: ShortcutPlatform | undefined;
  /** The signed-in account, for the profile button of the sidebar footer. Absent where the app has none. */
  account?: { name: string | null; email: string; avatarUrl: string | null } | undefined;
  /** Opens the plans. Absent where the plan cannot change here. */
  onUpgrade?: (() => void) | undefined;
  /** Shows how to get the mobile app. It sits in the Help submenu of the profile menu. */
  onMobileApp?: (() => void) | undefined;
  /** Opens the OpenBot account on X. It sits in the Help submenu of the profile menu. */
  onFollowX?: (() => void) | undefined;
  /** Signs in with another account. */
  onAddAccount?: (() => void) | undefined;
  /** Signs out of the account. */
  onSignOut?: (() => void) | undefined;
  /** Whether ⌘, opens Settings here, so the Settings item names the key. The web client has no such key. */
  settingsShortcut?: boolean | undefined;
}

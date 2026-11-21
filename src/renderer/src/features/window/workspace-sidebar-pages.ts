import { BRAIN_CAPABILITY } from "@pokebots/contracts/brain";
import { isUpdateActivePhase, isUpdateBusyPhase } from "@pokebots/contracts/ipc";
import { AGENT_COMPUTER_CAPABILITY } from "@pokebots/contracts/team-protocol/agent-computer-v1";
import { AGENT_TASKS_CAPABILITY } from "@pokebots/contracts/team-protocol/agent-tasks-v1";
import { CRM_CAPABILITY } from "@pokebots/contracts/team-protocol/crm-v1";
import { POKEBOTS_INTEGRATIONS_CAPABILITY } from "@pokebots/contracts/team-protocol/pokebots-integrations-v1";
import { ROOMS_CAPABILITY } from "@pokebots/contracts/team-protocol/rooms-v1";
import { toast } from "@pokebots/ui";
import type { SidebarPage, SidebarPages } from "@pokebots/ui/features/sidebar/sidebar-pages";
import type { SidebarView } from "@pokebots/ui/features/sidebar/sidebar-types";
import { useText } from "@pokebots/ui/text";
import { appPort } from "../../app-port";
import { useLayout } from "../../layout";
import { usePlatform } from "../../platform";
import { useAuth } from "../account/account-context";
import { useChannels } from "../channels/channels-context";
import { useCustomAgents } from "../custom-agents/custom-agents-context";
import { serverHasStorage } from "../files/storage-usage";
import {
  activeServerHasProviderSettings,
  serverCanAdminister,
  serverSupportsCapability,
} from "../servers/server-capabilities";
import { useServerSettings } from "../servers/server-settings";
import { useServers } from "../servers/servers-context";
import { useSettings } from "../settings/settings-context";
import { shortcutPlatform as devicePlatform } from "../shortcuts/shortcut-platform";
import { useUpdates } from "../updates/updates-context";
import { useWhatsNew } from "../updates/whats-new-context";
import { usePlanLimitRows } from "../usage/plan-limit-rows";
import { useUsage } from "../usage/usage-context";
import { createHelpMenu } from "./help-menu";
import { useWindowPage } from "./window-page-context";

/**
 * The pages of the desktop window, for the pill of the chat sidebar. Chats and Routines show the same
 * page with a different middle pane. Workflows, Tasks, Schedule, Usage, Library, Machines, Marketplace and
 * Settings change the page in the card.
 */
export function useWorkspaceSidebarPages(): () => SidebarPages {
  const serverSettings = useServerSettings();
  const platform = usePlatform();
  /** The keyboard of this computer, once main has reported the system. */
  const shortcutPlatform = () => {
    const info = platform.appInfo();
    return info ? devicePlatform(info.platform) : undefined;
  };
  const text = useText();
  const windowPage = useWindowPage();
  const { openAppSettings, setSkillsMarketplaceOpen } = useSettings();
  const updates = useUpdates();
  const layout = useLayout();
  const channels = useChannels();
  const whatsNew = useWhatsNew();
  const { activeServer } = useServers();
  const auth = useAuth();
  const usage = useUsage();
  /** Chats and Routines show the same page; they set the middle pane. */
  function showSidebarView(view: SidebarView) {
    windowPage.showAgents();
    // An open channel would stay in the middle with no routine canvas.
    if (view === "routines") channels.close();
    layout.setSidebarView(view);
  }
  const usageRows = usePlanLimitRows();
  const { customAgentUsage } = useCustomAgents();
  /** The custom agents run on this computer, so a joined server does not show their usage. */
  const localAgentUsage = () => (activeServer()?.kind === "local" ? customAgentUsage() : []);
  /** The compact sidebar has no footer, so the update island does not show. More then marks the update. */
  const updateNotice = () => {
    const phase = updates.status().phase;
    if (!layout.leftPanelCompact() || !isUpdateActivePhase(phase)) return undefined;
    return text.t(phase === "ready" || phase === "installing" ? "account.update.ready" : "account.update.available");
  };
  /** Manual update trigger in the sidebar footer: check, download, or restart to install on demand. */
  const footerUpdate = (): SidebarPages["update"] => {
    const currentStatus = updates.status();
    if (currentStatus.phase === "unsupported") return undefined;
    const managed = currentStatus.managedByHost === true;
    const phase = currentStatus.phase;
    const busy = isUpdateBusyPhase(phase);
    const hasUpdate = phase === "available" || phase === "ready";
    const percent =
      currentStatus.progress === null ? null : Math.min(100, Math.max(0, Math.round(currentStatus.progress)));
    const label = (() => {
      if (managed) return text.t("account.update.managedByHostLabel");
      if (phase === "downloading" && percent !== null) return text.t("account.update.downloadingLabel", { percent });
      if (phase === "installing") return text.t("account.update.restartingLabel");
      if (phase === "ready") return text.t("account.update.restartLabel");
      if (phase === "available") return text.t("account.update.downloadLabel");
      return text.t("menu.checkForUpdates");
    })();
    return {
      phase: phase === "up-to-date" ? "idle" : phase,
      busy,
      hasUpdate,
      label,
      disabled: managed,
      onAction: () => {
        void updates.runAction().catch((error) => toast.error(text.t("error.update.installFailed"), { error }));
      },
    };
  };
  // An older joined server has no task routes.
  const tasksAvailable = () => {
    const server = activeServer();
    return !server || server.kind === "local" || serverSupportsCapability(server, AGENT_TASKS_CAPABILITY);
  };
  /** Server Settings > Providers of this computer, or of a joined server that this account administers. */
  const openProviders = (): ((button: HTMLElement) => void) | undefined => {
    const server = activeServer();
    if (!server || !activeServerHasProviderSettings(server)) return undefined;
    return (button) => serverSettings.openServerSettings(server.id, button, "providers");
  };
  /** Only an owner or admin reads the CRM, on a host with CRM routes, while Server Settings turns it on. */
  const crmShown = () => serverCanAdminister(activeServer(), CRM_CAPABILITY) && usage.crmEnabled() === true;
  const current = (): SidebarPage | null => {
    const page = windowPage.page();
    if (page === "agents") return layout.sidebarView() === "routines" ? "routines" : "chats";
    return page === "server-settings" || page === "pricing" ? null : page;
  };
  const help = createHelpMenu({
    version: () => whatsNew.state.version,
    onOpenWhatsNew: whatsNew.reopen,
    onOpenLink: (destination) => void appPort().openExternal(destination),
    shortcutPlatform,
  });
  return () => ({
    current: current(),
    pinned: layout.railPinned(),
    onPinChange: layout.setRailPinned,
    usageRows: usageRows(),
    customAgentUsage: localAgentUsage(),
    onChats: () => showSidebarView("agents"),
    onRoutines: () => showSidebarView("routines"),
    // A joined server without workflows shows its notice on the page.
    onWorkflows: () => windowPage.openWorkflows(null),
    onSchedule: windowPage.openSchedule,
    onTasks: tasksAvailable() ? windowPage.openTasks : undefined,
    onUsage: windowPage.openUsage,
    // An older joined server has no storage routes, so it has no Library.
    onLibrary: serverHasStorage(activeServer()) ? windowPage.openLibrary : undefined,
    onMachines: windowPage.openMachines,
    onComputers: serverCanAdminister(activeServer(), AGENT_COMPUTER_CAPABILITY)
      ? () => {
          const server = activeServer();
          if (server) serverSettings.openServerSettings(server.id, null, "cloud-computers");
        }
      : undefined,
    onRooms:
      serverCanAdminister(activeServer(), ROOMS_CAPABILITY) ||
      serverSupportsCapability(activeServer(), POKEBOTS_INTEGRATIONS_CAPABILITY)
        ? () => windowPage.openRooms(null)
        : undefined,
    onBrain:
      !activeServer() ||
      activeServer()?.kind === "local" ||
      serverSupportsCapability(activeServer(), BRAIN_CAPABILITY) ||
      serverSupportsCapability(activeServer(), POKEBOTS_INTEGRATIONS_CAPABILITY)
        ? () => windowPage.openBrain(null)
        : undefined,
    onProviders: openProviders(),
    onCrm: crmShown() ? (button) => windowPage.openCrm(button) : undefined,
    onMarketplace: () => {
      windowPage.leavePricing();
      setSkillsMarketplaceOpen(true);
    },
    onSettings: (button) => (updateNotice() ? openAppSettings(button, "updates") : windowPage.openSettings(button)),
    settingsNotice: updateNotice(),
    account: auth.signedInAccount() ?? undefined,
    // The landing preview is a demo page, not an app that installs or links out.
    onMobileApp: platform.landingPreview ? undefined : () => openAppSettings(null, "mobile-connect"),
    onFollowX: platform.landingPreview ? undefined : () => void appPort().openExternal("x"),
    onSignOut: auth.signedInAccount() ? () => void auth.logoutCentralAccount() : undefined,
    help,
    onCollapse: () => layout.setSidebarCollapsed(true),
    shortcutPlatform: shortcutPlatform(),
    settingsShortcut: true,
    update: footerUpdate(),
  });
}

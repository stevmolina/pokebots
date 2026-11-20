/**
 * The bottom of the open chat sidebar: two quiet buttons on one borderless row.
 *
 * 1. Profile: the account photo with the status dot of the active machine. Its menu stays short: the
 *    weekly usage, the plan, the machine switch, a "Go to" submenu with every page, a Help submenu
 *    with the mobile app and community links, Settings and the account actions.
 * 2. Connect apps: a grid button that opens the Marketplace modal.
 */

import {
  Brain,
  BriefcaseBusiness,
  Button,
  Check,
  ChevronRight,
  CircleQuestionMark,
  Compass,
  Download,
  DropdownMenu,
  Gauge,
  LayoutGrid,
  LogOut,
  MessageCircle,
  MessageSquare,
  Monitor,
  MotionTooltip,
  Plus,
  RefreshCw,
  Settings,
  Smartphone,
  Sparkles,
  Spinner,
  Store,
  UserAvatar,
  UserPlus,
  Zap,
} from "@openbot/ui";
import { Dynamic } from "@solidjs/web";
import { createMemo, For, Show } from "solid-js";
import { useText } from "../../text";
import { ServerMark } from "../servers/ServerRail";
import { XMark } from "../settings/brand-marks";
import { shortcutText } from "../shortcuts/shortcut-registry";
import { HelpMenuItems } from "../updates/HelpMenu";
import { usePillPages } from "./SidebarPill";
import type { SidebarPages } from "./sidebar-pages";
import { useSidebarScope } from "./sidebar-scope";

/** The share of the busiest provider window, for the Weekly usage row. */
function usedPercent(pages: SidebarPages): number | null {
  let least: number | null = null;
  for (const row of pages.usageRows) {
    const values = [row.remainingPercent, ...row.windows.map((window) => window.remainingPercent)].filter(
      (value): value is number => value !== null,
    );
    for (const value of values) least = least === null ? value : Math.min(least, value);
  }
  return least === null ? null : Math.max(0, Math.min(100, Math.round(100 - least)));
}

/**
 * The profile button and its menu. `compact` shows the photo alone, as the top corner of a phone does.
 */
export function SidebarProfileMenu(props: {
  pages: SidebarPages;
  compact?: boolean;
  placement?: "top-start" | "bottom-start";
}) {
  const { props: sidebar } = useSidebarScope();
  const { t } = useText();
  const list = usePillPages(() => props.pages);
  let trigger: HTMLElement | undefined;
  const servers = () => sidebar.serverMenu?.servers ?? [];
  const active = createMemo(() => servers().find((server) => server.active));
  const online = () => (active()?.state ?? "online") === "online";
  const account = () => props.pages.account;
  const name = () => account()?.name?.trim() || account()?.email || sidebar.serverName;
  const used = () => usedPercent(props.pages);
  const openFromTrigger = (open: (button: HTMLElement) => void) => () => {
    if (trigger) open(trigger);
  };
  return (
    <DropdownMenu.Root placement={props.placement ?? "top-start"} gutter={8}>
      <DropdownMenu.Trigger
        ref={(element: HTMLElement) => {
          trigger = element;
        }}
        class={["sidebar-footer-profile no-drag", { "sidebar-footer-profile-compact": props.compact }]}
        aria-label={t("sidebar.footer.profile", { name: name() })}
      >
        <span class="sidebar-footer-avatar" aria-hidden="true">
          <Show
            when={account()}
            fallback={
              <ServerMark server={active() ?? { id: sidebar.serverName, name: sidebar.serverName, logoUrl: null }} />
            }
          >
            {(user) => <UserAvatar user={user()} decorative />}
          </Show>
          <span class="sidebar-footer-status" data-online={online() ? "" : undefined} />
        </span>
        <Show when={!props.compact}>
          <span class="sidebar-footer-meta">
            <span class="sidebar-footer-name">{name()}</span>
            <span class="sidebar-footer-sub">
              {sidebar.serverMenu?.allMachines?.active || (sidebar.machineChips && sidebar.machineChips.chosen === null)
                ? t("server.allMachines.title")
                : (active()?.name ?? sidebar.serverName)}
            </span>
          </span>
        </Show>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class="agent-context-menu sidebar-more-menu sidebar-footer-menu"
          aria-label={t("sidebar.footer.menu")}
        >
          <DropdownMenu.Item onSelectAfterClose={openFromTrigger(props.pages.onUsage)}>
            <Gauge class="agent-context-icon size-4" aria-hidden="true" />
            <span>{t("sidebar.footer.weeklyUsage")}</span>
            <Show when={used()}>
              {(value) => <span class="ui-menu-trailing">{t("sidebar.footer.used", { percent: value() })}</span>}
            </Show>
          </DropdownMenu.Item>
          <Show when={props.pages.onUpgrade}>
            {(upgrade) => (
              <DropdownMenu.Item onSelectAfterClose={() => upgrade()()}>
                <Zap class="agent-context-icon size-4" aria-hidden="true" />
                <span>{t("sidebar.footer.upgrade")}</span>
              </DropdownMenu.Item>
            )}
          </Show>
          <Show when={sidebar.serverMenu}>
            {(menu) => (
              <>
                <DropdownMenu.Separator />
                <div class="sidebar-footer-machines-header">
                  <span class="ui-menu-label" aria-hidden="true">
                    {t("sidebar.footer.machines")}
                  </span>
                  <Show when={menu().onAdd}>
                    {(add) => (
                      <DropdownMenu.Item
                        class="sidebar-footer-machines-add"
                        aria-label={t("sidebar.footer.addMachine")}
                        title={t("sidebar.footer.addMachine")}
                        onSelectAfterClose={() => add()()}
                      >
                        <Plus class="size-3.5" aria-hidden="true" />
                      </DropdownMenu.Item>
                    )}
                  </Show>
                </div>
                <div class="sidebar-footer-machines-grid">
                  <Show when={menu().servers.length > 1 && (menu().allMachines || sidebar.machineChips)}>
                    {(() => {
                      const allSelected = () =>
                        menu().allMachines?.active === true || sidebar.machineChips?.chosen === null;
                      return (
                        <DropdownMenu.Item
                          class="sidebar-footer-machine-tile"
                          data-active={allSelected() ? "" : undefined}
                          onSelectAfterClose={() => {
                            if (menu().allMachines) menu().allMachines?.onSelect();
                            else sidebar.machineChips?.onChoose(null);
                          }}
                        >
                          <span class="sidebar-footer-machine-icon" aria-hidden="true">
                            <LayoutGrid class="size-3.5" />
                          </span>
                          <span class="sidebar-footer-menu-label">{t("files.type.all")}</span>
                          <Show when={allSelected()}>
                            <Check class="sidebar-footer-machine-check size-3.5" aria-hidden="true" />
                          </Show>
                        </DropdownMenu.Item>
                      );
                    })()}
                  </Show>
                  <For each={menu().servers} keyed={(server) => server.id}>
                    {(server) => {
                      const allSelected = () =>
                        menu().allMachines?.active === true || sidebar.machineChips?.chosen === null;
                      const selected = () => !allSelected() && server().active;
                      const isOnline = () => server().state === "online";
                      return (
                        <DropdownMenu.Item
                          class="sidebar-footer-machine-tile"
                          data-active={selected() ? "" : undefined}
                          title={server().name}
                          onSelectAfterClose={() => {
                            if (sidebar.machineChips) sidebar.machineChips.onChoose(server().id);
                            else menu().onSelect(server().id);
                          }}
                        >
                          <span class="sidebar-footer-machine-icon" aria-hidden="true">
                            <svg
                              aria-hidden="true"
                              width="13"
                              height="13"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <rect x="2" y="2.5" width="12" height="4.5" rx="1.2" />
                              <rect x="2" y="9" width="12" height="4.5" rx="1.2" />
                              <circle cx="4.5" cy="4.75" r="0.6" fill="currentColor" stroke="none" />
                              <circle cx="4.5" cy="11.25" r="0.6" fill="currentColor" stroke="none" />
                            </svg>
                            <span class="sidebar-footer-machine-dot" data-online={isOnline() ? "" : undefined} />
                          </span>
                          <span class="sidebar-footer-menu-label">{server().name}</span>
                          <Show when={selected()}>
                            <Check class="sidebar-footer-machine-check size-3.5" aria-hidden="true" />
                          </Show>
                        </DropdownMenu.Item>
                      );
                    }}
                  </For>
                </div>
              </>
            )}
          </Show>
          <DropdownMenu.Separator />
          {/* Every page lives here, so the menu keeps about eight rows. */}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>
              <Compass class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("sidebar.footer.goTo")}</span>
              <ChevronRight class="agent-context-submenu-chevron size-4" aria-hidden="true" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                class="ui-action-menu agent-context-menu agent-context-submenu"
                aria-label={t("sidebar.footer.goTo")}
              >
                <DropdownMenu.Item onSelectAfterClose={openFromTrigger(props.pages.onChats)}>
                  <MessageCircle class="agent-context-icon size-4" aria-hidden="true" />
                  <span>{t("sidebar.pill.chats")}</span>
                </DropdownMenu.Item>
                <For each={list()} keyed={(page) => page.id}>
                  {(page) => (
                    <DropdownMenu.Item onSelectAfterClose={openFromTrigger(page().open)}>
                      <Dynamic component={page().icon} class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{page().label}</span>
                    </DropdownMenu.Item>
                  )}
                </For>
                <Show when={props.pages.onComputers}>
                  {(open) => (
                    <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                      <Monitor class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("server.computers.title")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
                <Show when={props.pages.onRooms}>
                  {(open) => (
                    <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                      <MessageSquare class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("rooms.title")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
                <Show when={props.pages.onBrain}>
                  {(open) => (
                    <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                      <Brain class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("app.rail.brain")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
                <Show when={props.pages.onProviders}>
                  {(open) => (
                    <DropdownMenu.Item onSelectAfterClose={openFromTrigger(open())}>
                      <Sparkles class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("app.rail.providers")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
                <Show when={props.pages.onCrm}>
                  {(open) => (
                    <DropdownMenu.Item onSelectAfterClose={openFromTrigger(open())}>
                      <BriefcaseBusiness class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("app.rail.crm")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
                <Show when={props.pages.onMarketplace}>
                  {(onMarketplace) => (
                    <DropdownMenu.Item onSelectAfterClose={() => onMarketplace()()}>
                      <Store class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("app.rail.marketplace")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          {/* Help also holds the mobile app and community links. The Discord link is the Help one. */}
          <DropdownMenu.Sub
            onOpenChange={(next: boolean) => {
              if (next) props.pages.help.onOpen?.();
            }}
          >
            <DropdownMenu.SubTrigger>
              <CircleQuestionMark class="agent-context-icon size-4" aria-hidden="true" />
              <span>{t("app.help.label")}</span>
              <ChevronRight class="agent-context-submenu-chevron size-4" aria-hidden="true" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                class="ui-action-menu agent-context-menu help-menu"
                aria-label={t("app.help.label")}
              >
                <HelpMenuItems {...props.pages.help} />
                <Show when={props.pages.onMobileApp || props.pages.onFollowX}>
                  <DropdownMenu.Separator />
                  <Show when={props.pages.onMobileApp}>
                    {(open) => (
                      <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                        <Smartphone class="agent-context-icon size-4" aria-hidden="true" />
                        <span>{t("sidebar.mobileApp.title")}</span>
                      </DropdownMenu.Item>
                    )}
                  </Show>
                  <Show when={props.pages.onFollowX}>
                    {(open) => (
                      <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                        <XMark class="agent-context-icon size-4" />
                        <span>{t("sidebar.community.followX")}</span>
                      </DropdownMenu.Item>
                    )}
                  </Show>
                </Show>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Item onSelectAfterClose={openFromTrigger(props.pages.onSettings)}>
            <Settings class="agent-context-icon size-4" aria-hidden="true" />
            <span>{t("app.rail.settings")}</span>
            <Show
              when={props.pages.settingsNotice}
              fallback={
                <Show when={props.pages.settingsShortcut ? props.pages.shortcutPlatform : undefined}>
                  {(platform) => <span class="ui-menu-trailing">{shortcutText("settings", platform())}</span>}
                </Show>
              }
            >
              {(notice) => <span class="ui-menu-trailing sidebar-more-notice">{notice()}</span>}
            </Show>
          </DropdownMenu.Item>
          <Show when={props.pages.onAddAccount || props.pages.onSignOut}>
            <DropdownMenu.Separator />
            <Show when={props.pages.onAddAccount}>
              {(add) => (
                <DropdownMenu.Item onSelectAfterClose={() => add()()}>
                  <UserPlus class="agent-context-icon size-4" aria-hidden="true" />
                  <span>{t("sidebar.footer.addAccount")}</span>
                </DropdownMenu.Item>
              )}
            </Show>
            <Show when={props.pages.onSignOut}>
              {(signOut) => (
                <DropdownMenu.Item onSelectAfterClose={() => signOut()()}>
                  <LogOut class="agent-context-icon size-4" aria-hidden="true" />
                  <span>{t("account.menu.signOut")}</span>
                </DropdownMenu.Item>
              )}
            </Show>
          </Show>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The grid button of the footer. It opens the Marketplace at once, as a modal over the window. The custom MCP
 * servers that its menu had on the web client are part of the Marketplace now.
 */
function ConnectAppsButton(props: { pages: SidebarPages; class?: string }) {
  const { t } = useText();
  return (
    <Show when={props.pages.onMarketplace}>
      {(onMarketplace) => (
        <MotionTooltip content={t("sidebar.footer.connectApps")}>
          <Button
            variant="ghost"
            type="button"
            class={["sidebar-footer-round no-drag", props.class]}
            aria-label={t("sidebar.footer.connectApps")}
            onClick={() => onMarketplace()()}
          >
            <LayoutGrid aria-hidden="true" />
          </Button>
        </MotionTooltip>
      )}
    </Show>
  );
}

/**
 * Manual app update button in the sidebar footer. Lets the user check for, download, or restart to
 * install an update on demand instead of restarting automatically.
 */
export function UpdateAppButton(props: { pages: SidebarPages; class?: string }) {
  return (
    <Show when={props.pages.update}>
      {(update) => (
        <MotionTooltip content={update().label}>
          <Button
            variant="ghost"
            type="button"
            class={["sidebar-footer-round sidebar-footer-update no-drag", props.class]}
            data-has-update={update().hasUpdate ? "true" : undefined}
            aria-label={update().label}
            aria-busy={update().busy ? "true" : undefined}
            disabled={update().disabled || update().busy}
            onClick={() => update().onAction()}
          >
            <Show when={!update().busy} fallback={<Spinner size="sm" aria-hidden="true" />}>
              <Show when={update().phase === "available"} fallback={<RefreshCw aria-hidden="true" />}>
                <Download aria-hidden="true" />
              </Show>
            </Show>
            <Show when={update().hasUpdate && !update().busy}>
              <span class="sidebar-footer-update-dot" aria-hidden="true" />
            </Show>
          </Button>
        </MotionTooltip>
      )}
    </Show>
  );
}

export function SidebarFooter(props: { pages: SidebarPages }) {
  const { t } = useText();
  return (
    <div class="sidebar-footer" role="toolbar" aria-label={t("sidebar.footer.label")}>
      <SidebarProfileMenu pages={props.pages} />
      <div class="sidebar-footer-actions">
        <UpdateAppButton pages={props.pages} />
        <ConnectAppsButton pages={props.pages} />
      </div>
    </div>
  );
}

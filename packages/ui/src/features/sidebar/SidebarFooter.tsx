/**
 * The bottom of the open chat sidebar: three quiet buttons on one borderless row.
 *
 * 1. Profile: the account photo with the status dot of the active machine. Its menu holds the weekly
 *    usage, the plan, the machine switch, the pages, Help, Settings and the account actions.
 * 2. Providers: the provider stack with its usage rings and card.
 * 3. Connect apps: a grid button whose menu opens the app catalog.
 */

import {
  Check,
  DropdownMenu,
  Gauge,
  LayoutGrid,
  LogOut,
  MotionTooltip,
  Plus,
  Smartphone,
  Store,
  UserAvatar,
  UserPlus,
  Zap,
} from "@openbot/ui";
import { createMemo, For, Show } from "solid-js";
import { useText } from "../../text";
import { ServerMark } from "../servers/ServerRail";
import { SidebarMoreMenuItems } from "./SidebarMoreMenu";
import { usePillPages } from "./SidebarPill";
import { SidebarProviderStack } from "./SidebarProviderStack";
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
            <span class="sidebar-footer-sub">{active()?.name ?? sidebar.serverName}</span>
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
                <div class="ui-menu-label" aria-hidden="true">
                  {t("sidebar.footer.machines")}
                </div>
                <For each={menu().servers} keyed={(server) => server.id}>
                  {(server) => (
                    <DropdownMenu.Item onSelectAfterClose={() => menu().onSelect(server().id)}>
                      <span class="server-menu-mark" aria-hidden="true">
                        <ServerMark server={server()} />
                      </span>
                      <span class="sidebar-footer-menu-label">{server().name}</span>
                      <Show when={server().active}>
                        <Check class="ui-menu-trailing size-4" aria-hidden="true" />
                      </Show>
                    </DropdownMenu.Item>
                  )}
                </For>
                <Show when={menu().onAdd}>
                  {(add) => (
                    <DropdownMenu.Item onSelectAfterClose={() => add()()}>
                      <Plus class="agent-context-icon size-4" aria-hidden="true" />
                      <span>{t("sidebar.footer.addMachine")}</span>
                    </DropdownMenu.Item>
                  )}
                </Show>
              </>
            )}
          </Show>
          <DropdownMenu.Separator />
          <SidebarMoreMenuItems pages={props.pages} list={list()} open={openFromTrigger} customize={false} />
          <Show when={props.pages.onMobileApp}>
            {(open) => (
              <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                <Smartphone class="agent-context-icon size-4" aria-hidden="true" />
                <span>{t("sidebar.mobileApp.title")}</span>
              </DropdownMenu.Item>
            )}
          </Show>
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

/** The grid button: the app catalog, and the MCP servers of the machine where the app can open them. */
export function ConnectAppsMenu(props: { pages: SidebarPages; class?: string; placement?: "top-end" | "top-start" }) {
  const { t } = useText();
  return (
    <Show when={props.pages.onMarketplace}>
      {(onMarketplace) => (
        <DropdownMenu.Root placement={props.placement ?? "top-end"} gutter={8}>
          <MotionTooltip content={t("sidebar.footer.connectApps")}>
            <DropdownMenu.Trigger
              class={["sidebar-footer-round no-drag", props.class]}
              aria-label={t("sidebar.footer.connectApps")}
            >
              <LayoutGrid aria-hidden="true" />
            </DropdownMenu.Trigger>
          </MotionTooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              class="agent-context-menu sidebar-footer-menu"
              aria-label={t("sidebar.footer.connectApps")}
            >
              <div class="ui-menu-label" aria-hidden="true">
                {t("sidebar.footer.connectApps")}
              </div>
              <DropdownMenu.Item onSelectAfterClose={() => onMarketplace()()}>
                <Store class="agent-context-icon size-4" aria-hidden="true" />
                <span>{t("sidebar.footer.browseApps")}</span>
              </DropdownMenu.Item>
              <Show when={props.pages.onConnectServers}>
                {(open) => (
                  <DropdownMenu.Item onSelectAfterClose={() => open()()}>
                    <Plus class="agent-context-icon size-4" aria-hidden="true" />
                    <span>{t("sidebar.footer.mcpServers")}</span>
                  </DropdownMenu.Item>
                )}
              </Show>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
        <SidebarProviderStack
          usageRows={props.pages.usageRows}
          customAgentUsage={props.pages.customAgentUsage}
          onOpenUsage={props.pages.onUsage}
        />
        <ConnectAppsMenu pages={props.pages} />
      </div>
    </div>
  );
}

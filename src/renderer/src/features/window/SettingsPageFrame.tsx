import type { ServerSummary } from "@openbot/contracts/ipc";
import { Button, ChevronLeft, Dialog, IconButton, Input, PanelLeft, Search, X } from "@openbot/ui";
import { ServerMark } from "@openbot/ui/features/servers/ServerRail";
import type { SettingsPagePlacement } from "@openbot/ui/features/settings/SettingsDialogShell";
import { useText } from "@openbot/ui/text";
import type { JSX } from "@solidjs/web";
import { createSignal, flush, onCleanup, Show } from "solid-js";

/** The machine whose settings the modal shows. Back goes to the list of machines. */
export interface SettingsPageMachine {
  server: ServerSummary;
  onBack: () => void;
}

/**
 * The frame of the settings, on desktop and on the web: a centered modal over the window, with the section
 * list on the left and the panel on the right. The settings panel shows its nav, path and content in the
 * mounts that `onMounts` gets. The section list holds the sections of the user, or, while a machine is
 * open, a Machines row that goes back to the list and then the sections of that machine. The Close button
 * and Escape close the modal; on a phone the modal fills the screen and the section list is a drawer.
 */
export function SettingsPageFrame(props: {
  heading: JSX.Element;
  /** Content between the heading and the section list, such as a search. */
  children?: JSX.Element;
  sectionsHidden?: boolean;
  footer?: JSX.Element;
  /** Set while a machine's settings show. The list starts with a row that goes back to the machines. */
  machine?: SettingsPageMachine | undefined;
  onMounts: (mounts: SettingsPagePlacement | undefined) => void;
  /** Escape. A search clears first, then the page closes. */
  onEscape: () => void;
  /** The Close button and a click on the dimmed window. It closes the page, also while a search has text. */
  onClose: () => void;
}) {
  const { t } = useText();
  /** At 720px and below, the section list is a drawer that the top row opens. */
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  let nav: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  let path: HTMLDivElement | undefined;
  let root: HTMLDivElement | undefined;
  let mounted = false;

  // The dialog mounts its parts after this component runs, so the mounts are reported when the last ref lands.
  function reportMounts(): void {
    if (mounted || !nav || !content || !path) return;
    mounted = true;
    props.onMounts({ nav, content, path });
  }
  onCleanup(() => {
    if (mounted) props.onMounts(undefined);
  });

  // One element for the section list: the panel shows its nav in it, so it is never made again while the page is open.
  const sectionsElement = (
    <div
      class="settings-page-sections"
      ref={(element) => {
        nav = element;
        reportMounts();
      }}
      hidden={props.sectionsHidden}
    />
  );
  // A tap on a section in the drawer opens it and closes the drawer.
  const closeDrawerOnSection = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(".settings-modal-nav-item, .settings-page-back"))
      setDrawerOpen(false);
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="settings-page-overlay" />
        <Dialog.Content
          class="settings-page"
          aria-label={t("app.settingsPage.unifiedTitle")}
          aria-describedby={undefined}
          ref={(element: HTMLDivElement) => {
            root = element;
          }}
          data-drawer-open={drawerOpen() ? "" : undefined}
          onOpenAutoFocus={(event) => {
            // As on the usage and schedule pages, the heading takes the focus, so a screen reader reads the page.
            event.preventDefault();
            root?.querySelector<HTMLElement>(".settings-page-title")?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            // The popups of the panel close on their own Escape first, because they are the top layer.
            event.preventDefault();
            props.onEscape();
          }}
        >
          <IconButton
            variant="ghost"
            size="icon-sm"
            class="settings-page-drawer-toggle"
            label={t("app.settingsPage.sections")}
            aria-expanded={drawerOpen() ? "true" : "false"}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <PanelLeft aria-hidden="true" />
          </IconButton>
          <Button
            variant="ghost"
            type="button"
            class="settings-page-drawer-scrim"
            tabindex={-1}
            aria-label={t("common.close")}
            onClick={() => setDrawerOpen(false)}
          />
          <div class="settings-page-nav" ref={(element) => element.addEventListener("click", closeDrawerOnSection)}>
            <Show when={props.machine}>
              {(machine) => (
                <Button variant="ghost" type="button" class="settings-page-back" onClick={() => machine().onBack()}>
                  <ChevronLeft aria-hidden="true" />
                  <span>{t("app.settingsPage.machines")}</span>
                </Button>
              )}
            </Show>
            {props.heading}
            {props.children}
            {sectionsElement}
            <div class="settings-page-footer">{props.footer}</div>
          </div>
          <div
            class="settings-page-path-row"
            ref={(element) => {
              path = element;
              reportMounts();
            }}
          />
          {/* A plain X needs no tooltip, so this is a Button and not an IconButton. */}
          <Button
            variant="ghost"
            size="icon-sm"
            class="settings-page-close"
            aria-label={t("common.close")}
            data-cuelume-tap="close"
            onClick={() => props.onClose()}
          >
            <X aria-hidden="true" />
          </Button>
          <div
            class="settings-page-content"
            ref={(element) => {
              content = element;
              reportMounts();
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The search field above the section list of a settings page. Enter with a query calls `onEnter`. */
export function SettingsSearchField(props: { value: string; onInput: (value: string) => void; onEnter: () => void }) {
  const { t } = useText();
  return (
    <label class="search-field settings-page-search">
      <Search aria-hidden="true" />
      <Input
        type="search"
        aria-label={t("app.settingsPage.search")}
        placeholder={t("app.settingsPage.searchPlaceholder")}
        spellcheck={false}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !props.value.trim()) return;
          event.preventDefault();
          props.onEnter();
        }}
      />
    </label>
  );
}

/**
 * Asks the server settings to open the first section that the search finds, then moves the focus to that
 * section. The server settings clear the search when they open a section; with no match, nothing changes.
 */
export function openFirstSettingsSection(nav: HTMLElement | undefined, request: () => void, query: () => string) {
  request();
  // The section opens, and the tabs move their focus key to it, before the focus moves.
  flush();
  if (query()) return;
  nav?.querySelector<HTMLElement>(".settings-modal-nav-item[data-selected]")?.focus();
}

/** The heading of a server settings page: the server mark and name, as the server menu shows them. */
export function ServerSettingsPageTitle(props: { server: ServerSummary }) {
  return (
    <h1 class="settings-page-title settings-page-server" tabindex={-1}>
      <span class="server-menu-mark" aria-hidden="true">
        <ServerMark server={props.server} />
      </span>
      <span class="server-menu-name">{props.server.name}</span>
    </h1>
  );
}

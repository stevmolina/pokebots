import type { AppTextKey } from "@openbot/i18n";
import {
  ArrowDown,
  ArrowRightToLine,
  ArrowUp,
  Button,
  CalendarClock,
  Combobox,
  Command,
  CornerDownLeft,
  Dialog,
  File as FileIcon,
  Hash,
  Input,
  Kbd,
  Search,
  type Settings,
  Spinner,
  Tabs,
} from "@openbot/ui";
import type { AgentProfile } from "@openbot/ui/data";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { useText } from "@openbot/ui/text";
import { Dynamic, type JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js";
import { createScrollFades } from "./createScrollFades";
import { GlobalSearchPlush } from "./GlobalSearchPlush";
import {
  type ActionResult,
  type AgentResult,
  type ChannelResult,
  createRemoteSearch,
  type FileResult,
  type GlobalSearchAction,
  type GlobalSearchChannel,
  type GlobalSearchFile,
  type GlobalSearchResult,
  type GlobalSearchRoutine,
  indexed,
  type MessageHit,
  type MessageResult,
  matching,
  matchingAgents,
  messagePreview,
  type PagedSearch,
  type RemoteSearch,
  type RoutineResult,
} from "./global-search-model";
import { playDialogExit, trackResultHighlight, trackResultsHeight } from "./global-search-motion";
import { matchParts, normalizedSearchText, snippetAround } from "./global-search-text";
import { VirtualListbox, type VirtualRowProps } from "./VirtualListbox";

const SEARCH_TABS = ["all", "agents", "channels", "messages", "files", "routines"] as const;
type SearchTab = (typeof SEARCH_TABS)[number];

export type {
  GlobalSearchAction,
  GlobalSearchChannel,
  GlobalSearchFile,
  GlobalSearchPage,
  GlobalSearchRoutine,
} from "./global-search-model";

type SectionKey = "agents" | "channels" | "messages" | "files" | "routines" | "actions" | "settings";

interface GlobalSearchSection {
  key: SectionKey;
  total: number;
  /** More results exist than `total` counts: the source loads pages and does not count them. */
  more: boolean;
  items: GlobalSearchResult[];
}

interface GlobalSearchProps {
  open: boolean;
  agents: AgentProfile[];
  /** Omit to hide the Channels filter, for a client or server without channels. */
  channels?: GlobalSearchChannel[] | undefined;
  /** Omit to hide the Routines filter. */
  routines?: GlobalSearchRoutine[] | undefined;
  routinesLoading?: boolean;
  /** Commands and settings pages. They show in All when the query matches. */
  actions?: GlobalSearchAction[];
  /** Omit to hide the Messages filter. The Messages filter loads the next page as the user scrolls. */
  onSearchMessages?: PagedSearch<MessageHit>;
  /** Omit to hide the Files filter. An empty query lists the newest files. */
  onSearchFiles?: PagedSearch<GlobalSearchFile> | undefined;
  onOpenChange: (open: boolean) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectChannel?: (channelId: string) => void;
  /** A message result, and a file result, which opens the message that carries the file. */
  onSelectMessage: (agentId: string, messageId: string) => void;
  onSelectRoutine?: (routine: GlobalSearchRoutine) => void;
}

// All shows a preview of each kind; a filter shows the full list.
const ALL_SECTION_LIMIT = 5;
// First guesses for the virtual list, from the CSS: a row is control-lg high, and a section header
// is control-sm high, with space-1-5 above it when a row comes before it.
const RESULT_HEIGHT = 36;
const SECTION_HEIGHT = 28;
const SPACED_SECTION_HEIGHT = 34;

const TAB_LABEL = {
  all: "conversation.globalSearch.tab.all",
  agents: "conversation.globalSearch.tab.agents",
  channels: "conversation.globalSearch.tab.channels",
  messages: "conversation.globalSearch.tab.messages",
  files: "conversation.globalSearch.tab.files",
  routines: "conversation.globalSearch.tab.routines",
} as const satisfies Record<SearchTab, AppTextKey>;

const SECTION_LABEL = {
  agents: "conversation.globalSearch.tab.agents",
  channels: "conversation.globalSearch.tab.channels",
  messages: "conversation.globalSearch.tab.messages",
  files: "conversation.globalSearch.tab.files",
  routines: "conversation.globalSearch.tab.routines",
  actions: "conversation.globalSearch.section.actions",
  settings: "conversation.globalSearch.section.settings",
} as const satisfies Record<SectionKey, AppTextKey>;

function isSearchTab(value: string): value is SearchTab {
  return SEARCH_TABS.some((tab) => tab === value);
}

function section(
  key: SectionKey,
  results: GlobalSearchResult[],
  options: { limit?: number | undefined; total?: number | undefined; more?: boolean } = {},
): GlobalSearchSection {
  return {
    key,
    total: Math.max(options.total ?? 0, results.length),
    more: options.more ?? false,
    items: options.limit === undefined ? results : results.slice(0, options.limit),
  };
}

// A Kobalte collection node holds a section or a result.
function sectionOf(value: GlobalSearchResult | GlobalSearchSection): GlobalSearchSection | undefined {
  return "items" in value ? value : undefined;
}

function resultOf(value: GlobalSearchResult | GlobalSearchSection): GlobalSearchResult | undefined {
  return "kind" in value ? value : undefined;
}

function Highlighted(props: { text: string; query: string }) {
  return (
    <For each={matchParts(props.text, props.query)} keyed={false}>
      {(part) => (
        <Show when={part().match} fallback={part().text}>
          <mark class="global-search-match">{part().text}</mark>
        </Show>
      )}
    </For>
  );
}

/** The highlight that slides under the active row. It sits first in the results, behind the rows. */
function ResultHighlight(props: { onActiveRow: (row: HTMLElement | undefined) => void }) {
  let element: HTMLDivElement | undefined;
  let stop: (() => void) | undefined;
  onSettled(() => {
    const results = element?.parentElement;
    if (element && results) stop = trackResultHighlight(results, element, props.onActiveRow);
  });
  onCleanup(() => stop?.());
  return <div ref={element} class="global-search-highlight" aria-hidden="true" hidden />;
}

/** The content of the results. The results follow its height with a transition. */
function ResultsBody(props: { children: JSX.Element; onResize: () => void }) {
  let element: HTMLDivElement | undefined;
  let stop: (() => void) | undefined;
  onSettled(() => {
    const results = element?.parentElement;
    if (element && results) stop = trackResultsHeight(results, element, props.onResize);
  });
  onCleanup(() => stop?.());
  return (
    <div ref={element} class="global-search-results-body">
      {props.children}
    </div>
  );
}

/** Plays the exit of the dialog when the search closes. */
function DialogExitMotion(props: { dialog: () => HTMLElement | undefined }) {
  onCleanup(() => {
    const dialog = props.dialog();
    if (dialog) playDialogExit(dialog);
  });
  return undefined;
}

/** The pill behind the selected filter. It moves only after its first place, so it does not slide in on open. */
function FilterPill() {
  let element: HTMLDivElement | undefined;
  let frame: number | undefined;
  onSettled(() => {
    frame = requestAnimationFrame(() => element?.removeAttribute("data-initializing"));
  });
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
  });
  return <Tabs.Indicator ref={element} class="global-search-filter-pill" data-initializing="" />;
}

function SectionRow(props: { section: GlobalSearchSection; spaced: boolean; row: VirtualRowProps }) {
  const { t } = useText();
  return (
    <Combobox.Section class="global-search-section" data-spaced={props.spaced ? "" : undefined} {...props.row}>
      <span>{t(SECTION_LABEL[props.section.key])}</span>
      <span class="global-search-section-count">
        {props.section.more
          ? t("conversation.globalSearch.countMore", { shown: props.section.total })
          : props.section.total}
      </span>
    </Combobox.Section>
  );
}

function ResultIcon(props: { icon: typeof Settings }) {
  return (
    <span class="global-search-icon" aria-hidden="true">
      <Dynamic component={props.icon} />
    </span>
  );
}

/** A row with a name that matches the query and one line of detail. */
function NamedRow(props: { name: string; detail?: string | undefined; time?: string | undefined; query: string }) {
  return (
    <>
      <Combobox.ItemLabel class="global-search-result-title" dir="auto">
        <Highlighted text={props.name} query={props.query} />
      </Combobox.ItemLabel>
      <Show when={props.detail}>
        {(detail) => (
          <span class="global-search-result-detail" dir="auto">
            <Highlighted text={detail()} query={props.query} />
          </span>
        )}
      </Show>
      <Show when={props.time}>
        <span class="global-search-result-time">{props.time}</span>
      </Show>
    </>
  );
}

function MessageResultRow(props: { result: MessageResult; query: string }) {
  const { t } = useText();
  return (
    <>
      <span class="global-search-result-title" dir="auto">
        {props.result.agent.name}
      </span>
      <Show when={props.result.message.author === "you"}>
        <span class="global-search-result-author">{t("conversation.globalSearch.you")}</span>
      </Show>
      <Combobox.ItemLabel class="global-search-result-detail" dir="auto">
        <Highlighted text={snippetAround(messagePreview(props.result.message), props.query)} query={props.query} />
      </Combobox.ItemLabel>
      <span class="global-search-result-time">{props.result.message.time}</span>
    </>
  );
}

function ResultRow(props: { result: GlobalSearchResult; query: string }) {
  // The row is keyed by its result, so the kind and the parts to show do not change.
  const result = untrack(() => props.result);
  switch (result.kind) {
    case "agent":
      return (
        <>
          <AgentAvatar agent={result.agent} motion="hover" class="global-search-avatar" />
          <NamedRow name={result.agent.name} detail={result.agent.title || result.agent.preview} query={props.query} />
        </>
      );
    case "channel":
      return (
        <>
          <ResultIcon icon={Hash} />
          <NamedRow name={result.channel.name} detail={result.channel.detail} query={props.query} />
        </>
      );
    case "message":
      return (
        <>
          <AgentAvatar agent={result.agent} motion="hover" class="global-search-avatar" />
          <MessageResultRow result={result} query={props.query} />
        </>
      );
    case "file":
      return (
        <>
          <ResultIcon icon={FileIcon} />
          <NamedRow name={result.file.name} detail={result.agent.name} time={result.file.time} query={props.query} />
        </>
      );
    case "routine":
      return (
        <>
          {result.agent ? (
            <AgentAvatar agent={result.agent} motion="hover" class="global-search-avatar" />
          ) : (
            <ResultIcon icon={CalendarClock} />
          )}
          <NamedRow name={result.routine.name} detail={result.routine.detail} query={props.query} />
        </>
      );
    case "action":
      return (
        <>
          <ResultIcon icon={result.action.icon} />
          <NamedRow name={result.action.label} detail={result.action.detail} query={props.query} />
        </>
      );
  }
}

export function GlobalSearch(props: GlobalSearchProps) {
  const { t } = useText();
  const [tab, setTab] = createSignal<SearchTab>("all");
  const [query, setQuery] = createSignal("");
  let input: HTMLInputElement | undefined;
  let retryButton: HTMLButtonElement | undefined;
  let dialog: HTMLDivElement | undefined;
  let results: HTMLElement | undefined;
  let scrollToKey: ((key: string) => void) | undefined;
  // The overlay mounts the search when it opens and removes it when it closes, so the dialog gets no
  // close event. A dismissed search gives focus back to the element that had it before; an opened
  // result leaves focus to the view it opens.
  const focused = document.activeElement;
  const opener = focused instanceof HTMLElement && focused !== document.body ? focused : undefined;
  let resultOpened = false;
  onCleanup(() => {
    if (resultOpened || !opener) return;
    requestAnimationFrame(() => {
      const current = document.activeElement;
      if (opener.isConnected && (!current || current === document.body)) opener.focus({ preventScroll: true });
    });
  });
  const scrollFades = createScrollFades();
  onCleanup(scrollFades.stop);

  const visibleTabs = createMemo(() =>
    SEARCH_TABS.filter(
      (candidate) =>
        (candidate !== "channels" || props.channels !== undefined) &&
        (candidate !== "messages" || props.onSearchMessages !== undefined) &&
        (candidate !== "files" || props.onSearchFiles !== undefined) &&
        (candidate !== "routines" || props.routines !== undefined),
    ),
  );
  const agentsById = createMemo(() => new Map(props.agents.map((agent) => [agent.id, agent])));
  const normalizedQuery = createMemo(() => normalizedSearchText(query()));

  const messageSearch = createRemoteSearch(
    () => {
      const search = props.onSearchMessages;
      const value = normalizedQuery();
      const category = tab();
      if (!props.open || !search || !value || (category !== "all" && category !== "messages")) return null;
      return { search, query: value };
    },
    (hit) => `${hit.agentId}:${hit.message.id}`,
  );
  const fileSearch = createRemoteSearch(
    () => {
      const search = props.onSearchFiles;
      const value = normalizedQuery();
      const category = tab();
      // The Files filter lists the newest files before the user types.
      if (!props.open || !search || (category === "all" ? !value : category !== "files")) return null;
      return { search, query: value };
    },
    (file) => `${file.agentId}:${file.messageId}:${file.id}`,
  );

  // Search text memoized per list change; the filter runs on every input.
  const agentItems = createMemo(() => indexed(props.agents.map((agent): AgentResult => ({ kind: "agent", agent }))));
  const channelItems = createMemo(() =>
    indexed((props.channels ?? []).map((channel): ChannelResult => ({ kind: "channel", channel }))),
  );
  const routineItems = createMemo(() =>
    indexed(
      (props.routines ?? []).map(
        (routine): RoutineResult => ({
          kind: "routine",
          routine,
          agent: routine.agentId ? agentsById().get(routine.agentId) : undefined,
        }),
      ),
    ),
  );
  const actionItems = createMemo(() =>
    indexed((props.actions ?? []).map((action): ActionResult => ({ kind: "action", action }))),
  );
  const messageItems = createMemo(() =>
    indexed(
      messageSearch.items().flatMap(({ agentId, message }): MessageResult[] => {
        const agent = agentsById().get(agentId);
        return agent && message.kind !== "thinking" && messagePreview(message)
          ? [{ kind: "message", agent, message }]
          : [];
      }),
    ),
  );
  const fileItems = createMemo(() =>
    indexed(
      fileSearch.items().flatMap((file): FileResult[] => {
        const agent = agentsById().get(file.agentId);
        return agent ? [{ kind: "file", agent, file }] : [];
      }),
    ),
  );

  const sections = createMemo<GlobalSearchSection[]>(() => {
    const value = normalizedQuery();
    const category = tab();
    const list = (key: SectionKey, items: GlobalSearchResult[]) => [section(key, items)];
    // A remote section counts the results that are not loaded yet.
    const remote = (search: RemoteSearch<unknown>, limit?: number) => ({
      limit,
      total: search.total(),
      more: search.hasMore() && search.total() === undefined,
    });
    let groups: GlobalSearchSection[];
    if (category === "agents") groups = list("agents", matchingAgents(agentItems(), value));
    else if (category === "channels") groups = list("channels", matching(channelItems(), value));
    else if (category === "messages")
      groups = [section("messages", value ? matching(messageItems(), value) : [], remote(messageSearch))];
    else if (category === "files") groups = [section("files", matching(fileItems(), value), remote(fileSearch))];
    else if (category === "routines") groups = list("routines", matching(routineItems(), value));
    else if (!value) {
      groups = [...list("agents", agentItems()), ...list("channels", channelItems())];
    } else {
      const actions = matching(actionItems(), value);
      const preview = { limit: ALL_SECTION_LIMIT };
      groups = [
        section("agents", matchingAgents(agentItems(), value), preview),
        section("channels", matching(channelItems(), value), preview),
        section("messages", matching(messageItems(), value), remote(messageSearch, ALL_SECTION_LIMIT)),
        section("files", matching(fileItems(), value), remote(fileSearch, ALL_SECTION_LIMIT)),
        section("routines", matching(routineItems(), value), preview),
        // Actions and settings have no filter tab, so they show every match.
        section(
          "actions",
          actions.filter((result) => result.action.group === "actions"),
        ),
        section(
          "settings",
          actions.filter((result) => result.action.group === "settings"),
        ),
      ];
    }
    return groups.filter((group) => group.items.length > 0);
  });
  // Visible order, for Enter on the first result and ⌘1–9.
  const flatResults = createMemo(() => sections().flatMap((group) => group.items));
  const firstKey = createMemo(() => flatResults()[0]?.key);
  const routinesPending = () =>
    props.routinesLoading === true && (tab() === "routines" || (tab() === "all" && normalizedQuery() !== ""));
  const pending = () => messageSearch.pending() || fileSearch.pending() || routinesPending();
  // A failed search is not an empty one: the user can retry it instead of reading "No results".
  const failed = () => messageSearch.failed() || fileSearch.failed();
  const retry = () => {
    messageSearch.retry();
    fileSearch.retry();
  };
  // A search that finds nothing shows "No results". The next search keeps it until it finds a result,
  // so the state does not mount again for each letter. The first search shows the spinner.
  const nothingFound = createMemo<boolean>((previous) => {
    if (flatResults().length > 0 || failed()) return false;
    return pending() ? previous === true : true;
  });
  // A source that is still loading and has nothing to show yet gets a spinner under the list.
  const searching = () => {
    const shown = new Set(sections().map((group) => group.key));
    return (
      (messageSearch.pending() && !shown.has("messages")) ||
      (fileSearch.pending() && !shown.has("files")) ||
      (routinesPending() && !shown.has("routines"))
    );
  };

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return;
      setTab("all");
      setQuery("");
      requestAnimationFrame(() => input?.focus());
    },
  );
  // A new list starts at its top. The scroll of the old list can hide the new first rows.
  createEffect(
    () => `${tab()} ${normalizedQuery()}`,
    () => {
      if (results) results.scrollTop = 0;
    },
  );

  function activate(result: GlobalSearchResult | null | undefined): void {
    if (!result) return;
    resultOpened = true;
    props.onOpenChange(false);
    switch (result.kind) {
      case "agent":
        props.onSelectAgent(result.agent.id);
        return;
      case "channel":
        props.onSelectChannel?.(result.channel.id);
        return;
      case "message":
        props.onSelectMessage(result.agent.id, result.message.id);
        return;
      case "file":
        props.onSelectMessage(result.file.agentId, result.file.messageId);
        return;
      case "routine":
        props.onSelectRoutine?.(result.routine);
        return;
      case "action":
        result.action.run();
        return;
    }
  }

  // Only a filter shows the full list; All shows a preview of each source.
  const loadMore = () => {
    if (tab() === "messages") return messageSearch.loadMore;
    if (tab() === "files") return fileSearch.loadMore;
    return undefined;
  };

  // Kobalte looks for the active row only when the active key changes. In the virtual list that row
  // can render later, as after a wrap from the first row to the last, so the input follows the row.
  function followActiveRow(row: HTMLElement | undefined): void {
    if (row?.id) input?.setAttribute("aria-activedescendant", row.id);
    else input?.removeAttribute("aria-activedescendant");
  }

  function cycleTab(step: 1 | -1): void {
    const tabs = visibleTabs();
    const index = tabs.indexOf(tab());
    setTab(tabs[(index + step + tabs.length) % tabs.length] ?? "all");
  }

  function onInputKeyDown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      // Tab cycles the filters, so a failed search's Retry is reached here and not in the tab order.
      if (!event.shiftKey && retryButton?.isConnected) retryButton.focus();
      else cycleTab(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Enter" && !input?.getAttribute("aria-activedescendant")) {
      const firstResult = flatResults()[0];
      if (!firstResult) return;
      event.preventDefault();
      activate(firstResult);
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const index = Number(event.key) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 8) return;
    // With no such result, the key still stops here: the server rail uses the same shortcut.
    event.preventDefault();
    activate(flatResults()[index]);
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="global-search-overlay" />
        <Dialog.Content
          ref={(element) => (dialog = element)}
          class="global-search-dialog"
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.isComposing) props.onOpenChange(false);
          }}
        >
          <DialogExitMotion dialog={() => dialog} />
          <Dialog.Title class="sr-only">{t("conversation.globalSearch.title")}</Dialog.Title>
          <Combobox.Root<GlobalSearchResult, GlobalSearchSection>
            options={sections()}
            optionGroupChildren="items"
            open={true}
            modal={false}
            triggerMode="input"
            closeOnSelection={false}
            shouldFocusWrap={true}
            allowsEmptyCollection={true}
            noResetInputOnBlur={true}
            onInputChange={setQuery}
            defaultFilter={() => true}
            optionValue={(result) => result.key}
            optionTextValue={(result) => result.text}
            optionLabel={(result) => result.label}
            onChange={activate}
            virtualized={true}
          >
            <Combobox.Control class="global-search-control">
              <Search aria-hidden="true" />
              <Combobox.Input
                as={Input}
                ref={(element) => (input = element)}
                class="global-search-input"
                aria-label={t("conversation.globalSearch.title")}
                placeholder={t("common.search")}
                autocomplete="off"
                autocapitalize="none"
                spellcheck={false}
                onKeyDown={onInputKeyDown}
              />
              <Tabs.Root
                value={tab()}
                onChange={(value) => {
                  if (isSearchTab(value)) setTab(value);
                }}
                class="global-search-filters"
              >
                <Tabs.List aria-label={t("conversation.globalSearch.filter")}>
                  <FilterPill />
                  <For each={visibleTabs()}>
                    {(value) => <Tabs.Trigger value={value}>{t(TAB_LABEL[value])}</Tabs.Trigger>}
                  </For>
                </Tabs.List>
              </Tabs.Root>
            </Combobox.Control>

            {/* The always-open results are the top Kobalte layer, so they get outside presses, not the dialog.
                Close as the modal Dialog does: not for a context menu, a press inside, or a toast. */}
            <Combobox.Content
              ref={(element) => {
                results = element;
                scrollFades.bind(element);
              }}
              class={["global-search-results", scrollFades.classes()]}
              onScroll={scrollFades.measure}
              onPointerDownOutside={(event) => {
                const target = event.detail.originalEvent.target;
                if (event.detail.isContextMenu || !(target instanceof Element)) return;
                if (dialog?.contains(target) || target.closest("[data-kb-top-layer]")) return;
                props.onOpenChange(false);
              }}
            >
              <ResultHighlight onActiveRow={followActiveRow} />
              <ResultsBody onResize={scrollFades.measure}>
                <Combobox.Listbox
                  aria-label={t("conversation.globalSearch.results")}
                  scrollToItem={(key) => scrollToKey?.(key)}
                  data-list={`${tab()} ${normalizedQuery()}`}
                >
                  {(collection) => (
                    <VirtualListbox
                      collection={collection()}
                      nodeKey={(node) => {
                        // Kobalte gives every section the key "".
                        const group = sectionOf(node.rawValue);
                        return group ? `section:${group.key}` : node.key;
                      }}
                      scrollElement={() => results}
                      estimateSize={(node, index) =>
                        node.type === "item" ? RESULT_HEIGHT : index === 0 ? SECTION_HEIGHT : SPACED_SECTION_HEIGHT
                      }
                      registerScrollToItem={(scroll) => {
                        scrollToKey = scroll;
                      }}
                      onEndReached={loadMore()}
                      renderRow={(node, index, row) => (
                        <>
                          <Show when={sectionOf(node().rawValue)}>
                            {(group) => <SectionRow section={group()} spaced={index() > 0} row={row} />}
                          </Show>
                          <Show when={resultOf(node().rawValue)}>
                            {(result) => (
                              <Combobox.Item
                                item={node()}
                                class="global-search-result"
                                data-first={node().key === firstKey() ? "" : undefined}
                                {...row}
                              >
                                <ResultRow result={result()} query={query()} />
                                <Kbd class="global-search-result-enter" aria-hidden="true">
                                  <CornerDownLeft />
                                </Kbd>
                              </Combobox.Item>
                            )}
                          </Show>
                        </>
                      )}
                    />
                  )}
                </Combobox.Listbox>
                <Show when={searching() && !nothingFound()}>
                  <div class="global-search-status">
                    <Spinner size="sm" />
                    <span>{t("conversation.globalSearch.searching")}</span>
                  </div>
                </Show>
                <Show when={failed() && !pending()}>
                  <div class="global-search-status global-search-failed" role="alert">
                    <span>{t("conversation.globalSearch.failed")}</span>
                    <Button
                      ref={(element: HTMLButtonElement) => {
                        retryButton = element;
                      }}
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={retry}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                </Show>
                <Show when={nothingFound()}>
                  <div class="global-search-empty">
                    <GlobalSearchPlush input={() => input} searching={pending()} />
                    {t("conversation.globalSearch.empty")}
                  </div>
                </Show>
              </ResultsBody>
            </Combobox.Content>
          </Combobox.Root>
          <div class="global-search-footer" aria-hidden="true">
            <span class="global-search-hint">
              <Kbd>
                <ArrowUp />
              </Kbd>
              <Kbd>
                <ArrowDown />
              </Kbd>
              {t("conversation.globalSearch.hint.navigate")}
            </span>
            <span class="global-search-hint">
              <Kbd>
                <CornerDownLeft />
              </Kbd>
              {t("conversation.globalSearch.hint.open")}
            </span>
            <span class="global-search-hint">
              <Kbd>
                <ArrowRightToLine />
              </Kbd>
              {t("conversation.globalSearch.hint.filter")}
            </span>
            <span class="global-search-hint">
              <Kbd>
                <Command />
              </Kbd>
              <Kbd>1–9</Kbd>
              {t("conversation.globalSearch.hint.jump")}
            </span>
            <span class="global-search-hint">
              <Kbd>{t("conversation.globalSearch.hint.escapeKey")}</Kbd>
              {t("conversation.globalSearch.hint.close")}
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

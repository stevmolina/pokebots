import type { AppTextKey } from "@pokebots/i18n";
import { Button, CalendarClock, File as FileIcon, Hash, Spinner } from "@pokebots/ui";
import {
  type AgentResult,
  type ChannelResult,
  createRemoteSearch,
  type FileResult,
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
  type RoutineResult,
} from "@pokebots/ui/components/global-search-model";
import { normalizedSearchText, snippetAround } from "@pokebots/ui/components/global-search-text";
import type { AgentProfile } from "@pokebots/ui/data";
import { AgentAvatar } from "@pokebots/ui/features/agents/AgentAvatar";
import { useText } from "@pokebots/ui/text";
import { Dynamic } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

const PHONE_SEARCH_FILTERS = ["all", "messages", "agents", "channels", "files", "routines"] as const;
type PhoneSearchFilter = (typeof PHONE_SEARCH_FILTERS)[number];

const FILTER_LABEL = {
  all: "conversation.globalSearch.tab.all",
  messages: "conversation.globalSearch.tab.messages",
  agents: "conversation.globalSearch.tab.agents",
  channels: "conversation.globalSearch.tab.channels",
  files: "conversation.globalSearch.tab.files",
  routines: "conversation.globalSearch.tab.routines",
} as const satisfies Record<PhoneSearchFilter, AppTextKey>;

/** How close to the end of the list, in pixels, the next page of messages or files loads. */
const LOAD_MORE_MARGIN = 600;

type PhoneSearchResult = Exclude<GlobalSearchResult, { kind: "action" }>;

interface WebPhoneSearchProps {
  /** The text in the search field of the bottom bar. */
  query: string;
  agents: AgentProfile[];
  /** Omit to hide the Channels filter. */
  channels?: GlobalSearchChannel[] | undefined;
  /** Omit to hide the Routines filter. */
  routines?: GlobalSearchRoutine[] | undefined;
  routinesLoading?: boolean;
  /** The Routines filter was chosen: the routines load only then, one request for each agent. */
  onShowRoutines?: () => void;
  /** Omit to hide the Messages filter. */
  onSearchMessages?: PagedSearch<MessageHit> | undefined;
  /** Omit to hide the Files filter. */
  onSearchFiles?: PagedSearch<GlobalSearchFile> | undefined;
  onSelectAgent: (agentId: string) => void;
  onSelectChannel: (channelId: string) => void;
  /** A message result, and a file result, which opens the message that carries the file. */
  onSelectMessage: (agentId: string, messageId: string) => void;
  onSelectRoutine: (routine: GlobalSearchRoutine) => void;
  /** The list scrolled: the keyboard goes down, so that more results show. */
  onScrollStart: () => void;
}

/**
 * The results of the phone search, in place of the chat list. The search field is the floating pill
 * of the bottom bar, so it takes focus and opens the keyboard in the same tap. Filter chips sit at the
 * top, and one list of large rows shows the agents and channels, and then the messages that match.
 * It is part of the workspace code, not a chunk that loads on the first tap.
 */
export function WebPhoneSearch(props: WebPhoneSearchProps) {
  const { t } = useText();
  const [filter, setFilter] = createSignal<PhoneSearchFilter>("all");
  let list: HTMLDivElement | undefined;

  const filters = createMemo(() =>
    PHONE_SEARCH_FILTERS.filter(
      (candidate) =>
        (candidate !== "channels" || props.channels !== undefined) &&
        (candidate !== "messages" || props.onSearchMessages !== undefined) &&
        (candidate !== "files" || props.onSearchFiles !== undefined) &&
        (candidate !== "routines" || props.routines !== undefined),
    ),
  );
  const query = createMemo(() => normalizedSearchText(props.query));
  const agentsById = createMemo(() => new Map(props.agents.map((agent) => [agent.id, agent])));

  const messageSearch = createRemoteSearch(
    () => {
      const search = props.onSearchMessages;
      const value = query();
      const current = filter();
      if (!search || !value || (current !== "all" && current !== "messages")) return null;
      return { search, query: value };
    },
    (hit) => `${hit.agentId}:${hit.message.id}`,
  );
  const fileSearch = createRemoteSearch(
    () => {
      const search = props.onSearchFiles;
      const value = query();
      const current = filter();
      // The Files filter lists the newest files before the user types.
      if (!search || (current === "all" ? !value : current !== "files")) return null;
      return { search, query: value };
    },
    (file) => `${file.agentId}:${file.messageId}:${file.id}`,
  );

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

  /** One list, as the filter and the query choose it. All shows every chat first, then the hits. */
  const results = createMemo<PhoneSearchResult[]>(() => {
    const value = query();
    switch (filter()) {
      case "agents":
        return matchingAgents(agentItems(), value);
      case "channels":
        return matching(channelItems(), value);
      case "messages":
        return value ? matching(messageItems(), value) : [];
      case "files":
        return matching(fileItems(), value);
      case "routines":
        return matching(routineItems(), value);
      case "all":
        return [
          ...matchingAgents(agentItems(), value),
          ...matching(channelItems(), value),
          ...(value ? [...matching(messageItems(), value), ...matching(fileItems(), value)] : []),
          ...(value ? matching(routineItems(), value) : []),
        ];
    }
  });
  const routinesPending = () => props.routinesLoading === true && filter() === "routines";
  const pending = () => messageSearch.pending() || fileSearch.pending() || routinesPending();
  const failed = () => messageSearch.failed() || fileSearch.failed();
  const retry = () => {
    messageSearch.retry();
    fileSearch.retry();
  };
  const messagesHint = () => filter() === "messages" && query() === "";

  // A new list starts at its top.
  createEffect(
    () => `${filter()} ${query()}`,
    () => {
      if (list) list.scrollTop = 0;
    },
  );

  function choose(next: PhoneSearchFilter): void {
    setFilter(next);
    if (next === "routines") untrack(() => props.onShowRoutines?.());
  }

  function open(result: PhoneSearchResult): void {
    switch (result.kind) {
      case "agent":
        props.onSelectAgent(result.agent.id);
        return;
      case "channel":
        props.onSelectChannel(result.channel.id);
        return;
      case "message":
        props.onSelectMessage(result.agent.id, result.message.id);
        return;
      case "file":
        props.onSelectMessage(result.file.agentId, result.file.messageId);
        return;
      case "routine":
        props.onSelectRoutine(result.routine);
        return;
    }
  }

  /** Loads the next page of messages or files when the end of the list is near or already shows. */
  function loadMoreNearEnd(): void {
    if (!list || list.scrollHeight - list.scrollTop - list.clientHeight > LOAD_MORE_MARGIN) return;
    const current = untrack(filter);
    if (current === "all" || current === "messages") messageSearch.loadMore();
    if (current === "all" || current === "files") fileSearch.loadMore();
  }
  // A page that the text match mostly drops can leave a list too short to scroll, so each new list
  // checks the end too.
  createEffect(
    () => results().length,
    () => {
      const frame = requestAnimationFrame(loadMoreNearEnd);
      return () => cancelAnimationFrame(frame);
    },
  );

  let scrolling = false;
  function onScroll(): void {
    // Only a scroll that the finger starts takes the keyboard down, not the jump to the top.
    if (scrolling) props.onScrollStart();
    loadMoreNearEnd();
  }

  return (
    <section class="web-phone-search" aria-label={t("conversation.globalSearch.results")}>
      {/* Filters show once the user types, or while a filter other than All is chosen. */}
      <Show when={props.query.trim() !== "" || filter() !== "all"}>
        <div class="web-phone-search-chips" role="toolbar" aria-label={t("conversation.globalSearch.filter")}>
          <For each={filters()}>
            {(candidate) => (
              <Button
                variant="ghost"
                type="button"
                class="web-phone-search-chip"
                aria-pressed={filter() === candidate ? "true" : "false"}
                onClick={() => choose(candidate)}
              >
                {t(FILTER_LABEL[candidate])}
              </Button>
            )}
          </For>
        </div>
      </Show>
      <div
        ref={list}
        class="web-phone-search-list"
        onScroll={onScroll}
        onTouchStart={() => {
          scrolling = true;
        }}
        onTouchEnd={() => {
          scrolling = false;
        }}
        onTouchCancel={() => {
          scrolling = false;
        }}
      >
        <For each={results()} keyed={(result) => result.key}>
          {(result) => <PhoneSearchRow result={result()} query={props.query} onOpen={open} />}
        </For>
        <Show when={messagesHint()}>
          <p class="web-phone-search-note">{t("conversation.globalSearch.typeToSearch")}</p>
        </Show>
        <Show when={pending()}>
          <div class="web-phone-search-note">
            <Spinner size="sm" label={t("conversation.globalSearch.searching")} />
          </div>
        </Show>
        <Show when={failed()}>
          <div class="web-phone-search-note" role="alert">
            <span>{t("conversation.globalSearch.failed")}</span>
            <Button variant="ghost" size="sm" type="button" onClick={retry}>
              {t("common.retry")}
            </Button>
          </div>
        </Show>
        <Show when={!pending() && !failed() && !messagesHint() && results().length === 0}>
          <p class="web-phone-search-note">{t("conversation.globalSearch.empty")}</p>
        </Show>
      </div>
    </section>
  );
}

/** A large row: the avatar, the name with one line of detail, and a light label at the end. */
function PhoneSearchRow(props: {
  result: PhoneSearchResult;
  query: string;
  onOpen: (result: PhoneSearchResult) => void;
}) {
  const { t } = useText();
  const row = () => {
    const result = props.result;
    switch (result.kind) {
      case "agent":
        return {
          name: result.agent.name,
          detail: result.agent.preview || result.agent.title || undefined,
          end: t("conversation.globalSearch.kind.agent"),
        };
      case "channel":
        return { name: result.channel.name, detail: undefined, end: t("conversation.globalSearch.kind.channel") };
      case "message": {
        const snippet = snippetAround(messagePreview(result.message), props.query);
        const mine = result.message.author === "you";
        return {
          name: result.agent.name,
          detail: mine ? `${t("conversation.globalSearch.you")}: ${snippet}` : snippet,
          end: t("conversation.globalSearch.kind.message"),
        };
      }
      case "file":
        return {
          name: result.file.name,
          detail: `${result.agent.name} · ${result.file.time}`,
          end: t("conversation.globalSearch.kind.file"),
        };
      case "routine":
        return {
          name: result.routine.name,
          detail: result.routine.detail,
          end: t("conversation.globalSearch.kind.routine"),
        };
    }
  };
  return (
    <Button variant="ghost" type="button" class="web-phone-search-row" onClick={() => props.onOpen(props.result)}>
      <PhoneSearchAvatar result={props.result} />
      <span class="web-phone-search-text">
        <span class="web-phone-search-name" dir="auto">
          {row().name}
        </span>
        <Show when={row().detail}>
          {(detail) => (
            <span class="web-phone-search-detail" dir="auto">
              {detail()}
            </span>
          )}
        </Show>
      </span>
      <span class="web-phone-search-kind">{row().end}</span>
    </Button>
  );
}

function PhoneSearchAvatar(props: { result: PhoneSearchResult }) {
  const agent = () => {
    const result = props.result;
    return result.kind === "agent" || result.kind === "message" || (result.kind === "routine" && result.agent)
      ? result.agent
      : undefined;
  };
  const icon = () => {
    switch (props.result.kind) {
      case "channel":
        return Hash;
      case "file":
        return FileIcon;
      default:
        return CalendarClock;
    }
  };
  return (
    <Show
      when={agent()}
      fallback={
        <span class="web-phone-search-icon" aria-hidden="true">
          <Dynamic component={icon()} />
        </span>
      }
    >
      {(shown) => <AgentAvatar agent={shown()} class="web-phone-search-avatar" />}
    </Show>
  );
}

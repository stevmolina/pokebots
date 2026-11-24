import { agentMentionRank } from "@pokebots/contracts/agent-mention-rank";
import { expandAttachmentReferences } from "@pokebots/contracts/attachment-references";
import { expandChatTagReferences } from "@pokebots/contracts/chat-tag-references";
import type { Settings } from "@pokebots/ui";
import type { AgentMessage, AgentProfile } from "@pokebots/ui/data";
import { type Accessor, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { normalizedSearchText } from "./global-search-text";

/*
 * The results of global search without their view: what each kind of result holds, how the query
 * matches it, and the paged search that the host answers. The desktop search dialog and the phone
 * search of the web client both use it.
 */

const SEARCH_DEBOUNCE_MS = 150;

export interface GlobalSearchChannel {
  id: string;
  name: string;
  /** The last message, as one line. */
  detail?: string | undefined;
}

export interface GlobalSearchFile {
  id: string;
  name: string;
  agentId: string;
  messageId: string;
  time: string;
}

export interface GlobalSearchRoutine {
  id: string;
  name: string;
  /** The agent that runs the routine. A channel routine has none and shows an icon. */
  agentId?: string;
  /** The owner and the schedule, as one line. */
  detail: string;
}

export interface GlobalSearchAction {
  id: string;
  label: string;
  /** Actions do things; settings open a settings page. The two show as separate groups. */
  group: "actions" | "settings";
  icon: typeof Settings;
  detail?: string | undefined;
  /** More words that find the action, such as the English name in another language. */
  keywords?: string;
  run: () => void;
}

export type AgentResult = { kind: "agent"; agent: AgentProfile };
export type ChannelResult = { kind: "channel"; channel: GlobalSearchChannel };
export type MessageResult = { kind: "message"; agent: AgentProfile; message: AgentMessage };
export type FileResult = { kind: "file"; agent: AgentProfile; file: GlobalSearchFile };
export type RoutineResult = { kind: "routine"; routine: GlobalSearchRoutine; agent: AgentProfile | undefined };
export type ActionResult = { kind: "action"; action: GlobalSearchAction };
export type ResultData = AgentResult | ChannelResult | MessageResult | FileResult | RoutineResult | ActionResult;
/**
 * The option key, label and search text are set when the result is made. Kobalte reads them in its
 * effects, where a read of the agent or the message would be an untracked read of the store.
 */
export type Option = { key: string; label: string; text: string };
export type GlobalSearchResult = ResultData & Option;

/** One page of a search that another process answers. */
export interface GlobalSearchPage<T> {
  results: T[];
  /** All results, when the source counts them. */
  total?: number | undefined;
  /** Gives the next page; null on the last page. */
  nextCursor: string | null;
}

export type PagedSearch<T> = (query: string, cursor?: string) => Promise<GlobalSearchPage<T>>;
export type MessageHit = { agentId: string; message: AgentMessage };

export function messagePreview(message: AgentMessage): string {
  return expandAttachmentReferences(
    expandChatTagReferences(message.body, (reference) =>
      reference.kind === "quote" ? `“${reference.name}”` : undefined,
    ),
  )
    .trim()
    .replace(/\s+/g, " ");
}

export function resultKey(result: ResultData): string {
  switch (result.kind) {
    case "agent":
      return `agent:${result.agent.id}`;
    case "channel":
      return `channel:${result.channel.id}`;
    case "message":
      return `message:${result.agent.id}:${result.message.id}`;
    case "file":
      return `file:${result.file.agentId}:${result.file.messageId}:${result.file.id}`;
    case "routine":
      return `routine:${result.routine.id}`;
    case "action":
      return `action:${result.action.id}`;
  }
}

export function resultLabel(result: ResultData): string {
  switch (result.kind) {
    case "agent":
      return result.agent.name;
    case "channel":
      return result.channel.name;
    case "message":
      return messagePreview(result.message);
    case "file":
      return result.file.name;
    case "routine":
      return result.routine.name;
    case "action":
      return result.action.label;
  }
}

export function resultSearchText(result: ResultData): string {
  switch (result.kind) {
    case "agent":
      return normalizedSearchText(
        `${result.agent.name} ${result.agent.title} ${result.agent.description} ${result.agent.preview}`,
      );
    case "channel":
      return normalizedSearchText(result.channel.name);
    case "message":
      return normalizedSearchText(
        `${messagePreview(result.message)} ${result.agent.name} ${result.agent.title} ${result.agent.description}`,
      );
    case "file":
      return normalizedSearchText(`${result.file.name} ${result.agent.name}`);
    case "routine":
      return normalizedSearchText(`${result.routine.name} ${result.routine.detail}`);
    case "action":
      return normalizedSearchText(
        `${result.action.label} ${result.action.detail ?? ""} ${result.action.keywords ?? ""}`,
      );
  }
}

export function indexed<T extends ResultData>(results: T[]): Array<T & Option> {
  return results.map((result) => ({
    ...result,
    key: resultKey(result),
    label: resultLabel(result),
    text: resultSearchText(result),
  }));
}

export function matching<T extends GlobalSearchResult>(items: T[], query: string): T[] {
  return query ? items.filter((item) => item.text.includes(query)) : items;
}

/** A name match first, as in an `@` mention. A match only in the last message goes last. */
export function matchingAgents(items: Array<AgentResult & Option>, query: string): Array<AgentResult & Option> {
  const ranked = matching(items, query).map((item) => ({
    item,
    rank: agentMentionRank(item.agent, query) ?? Number.MAX_VALUE,
  }));
  // Array sort is stable, so agents of one rank keep the sidebar order.
  ranked.sort((left, right) => left.rank - right.rank);
  return ranked.map(({ item }) => item);
}

export interface RemoteSearch<T> {
  items: Accessor<T[]>;
  total: Accessor<number | undefined>;
  hasMore: Accessor<boolean>;
  pending: Accessor<boolean>;
  /** A page failed. The list holds only the pages before it. */
  failed: Accessor<boolean>;
  /** Loads the page that failed again. */
  retry: () => void;
  /** Loads the next page. It does nothing while a page loads or when no page follows. */
  loadMore: () => void;
}

/**
 * A search that another process answers, debounced and in pages. `request` returns null when the
 * current tab or query does not need it; a stale answer is dropped. `key` drops a result that a
 * later page gives again, as offset pages do when new results arrive between two pages.
 */
export function createRemoteSearch<T>(
  request: () => { search: PagedSearch<T>; query: string } | null,
  key: (item: T) => string,
): RemoteSearch<T> {
  type Request = ReturnType<typeof request>;
  type Loaded = { items: T[]; total?: number | undefined; cursor: string | null };
  const empty: Loaded = { items: [], cursor: null };
  const requested = createMemo(request);
  // The request that the first page answered. The search is pending until it is the current request,
  // in the same update as the query: an effect would report it one update late.
  const [answered, setAnswered] = createSignal<Request>(null);
  const pending = () => {
    const current = requested();
    return current !== null && answered() !== current;
  };
  const [loaded, setLoaded] = createSignal<Loaded>(empty);
  const [failed, setFailed] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = 0;
  // loadMore runs in an effect, so it reads plain copies, not the signals.
  let active: { search: PagedSearch<T>; query: string } | null = null;
  let cursor: string | null = null;
  // The cursor of the page that failed; null when the first page failed.
  let failedCursor: string | null = null;
  let loading = false;
  const show = (next: Loaded) => {
    cursor = next.cursor;
    loading = false;
    setLoaded(next);
  };
  function loadFirst(next: { search: PagedSearch<T>; query: string }): void {
    const current = latest;
    loading = true;
    next.search(next.query).then(
      (page) => {
        if (current !== latest) return;
        show({ items: page.results, total: page.total, cursor: page.nextCursor });
        setAnswered(next);
      },
      () => {
        if (current !== latest) return;
        show(empty);
        setAnswered(next);
        failedCursor = null;
        setFailed(true);
      },
    );
  }
  createEffect(requested, (next) => {
    if (timer) clearTimeout(timer);
    ++latest;
    active = next;
    cursor = null;
    setFailed(false);
    if (!next) {
      show(empty);
      return;
    }
    loading = true;
    timer = setTimeout(() => loadFirst(next), SEARCH_DEBOUNCE_MS);
  });
  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  function loadMore(): void {
    if (!active || !cursor || loading) return;
    const current = latest;
    const requested = cursor;
    loading = true;
    active.search(active.query, cursor).then(
      (page) => {
        if (current !== latest) return;
        cursor = page.nextCursor;
        loading = false;
        setLoaded((previous) => {
          const seen = new Set(previous.items.map(key));
          return {
            items: [...previous.items, ...page.results.filter((item) => !seen.has(key(item)))],
            total: page.total ?? previous.total,
            cursor: page.nextCursor,
          };
        });
      },
      () => {
        if (current !== latest) return;
        // A page that fails is not asked for again, so a scroll does not repeat the error.
        cursor = null;
        loading = false;
        failedCursor = requested;
        setLoaded((previous) => ({ ...previous, cursor: null }));
        setFailed(true);
      },
    );
  }

  function retry(): void {
    if (!active || loading || !failed()) return;
    setFailed(false);
    if (failedCursor === null) {
      ++latest;
      setAnswered(null);
      loadFirst(active);
      return;
    }
    cursor = failedCursor;
    setLoaded((previous) => ({ ...previous, cursor: failedCursor }));
    loadMore();
  }

  return {
    items: () => loaded().items,
    total: () => loaded().total,
    hasMore: () => loaded().cursor !== null,
    pending,
    failed,
    retry,
    loadMore,
  };
}

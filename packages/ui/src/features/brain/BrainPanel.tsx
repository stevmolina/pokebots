import type { BrainRequest, BrainResponse } from "@openbot/contracts/brain";
import {
  ArrowLeft,
  Badge,
  Brain,
  Button,
  Download,
  ExternalLink,
  FileText,
  Input,
  MessageSquare,
  NativeSelect,
  Pencil,
  Plus,
  Search,
  SlidingTabs,
  Spinner,
  Textarea,
  Trash2,
  Upload,
} from "@openbot/ui";
import { MarkdownFilePreview } from "@openbot/ui/features/conversation/MarkdownFilePreview";
import { useText } from "@openbot/ui/text";
import type { JSX } from "@solidjs/web";
import { createMemo, createStore, For, Match, onCleanup, onSettled, Show, Switch } from "solid-js";
import "./brain.css";

type BrainTab = "facts" | "pages" | "files" | "chats";
type ClaimMode = "view" | "fix" | "forget";
type BrainDetail =
  | { kind: "claim"; data: BrainResponse }
  | { kind: "page"; path: string; data: BrainResponse }
  | { kind: "file"; path: string; data: BrainResponse }
  | { kind: "chat"; data: BrainResponse }
  | { kind: "remember" };
interface BrainResult {
  kind: "proposed" | "committed" | "saved";
  url: string | null;
}

export interface BrainPanelProps {
  request: (input: BrainRequest) => Promise<BrainResponse>;
  connectionId: string | null;
  accountControls?: JSX.Element;
  onConnect: () => void;
  onOpenLink: (url: string) => void;
}
interface BrainPanelState {
  brains: NonNullable<BrainResponse["brains"]>;
  brain: string;
  tab: BrainTab;
  query: string;
  list: BrainResponse;
  trail: BrainDetail[];
  busy: boolean;
  saving: boolean;
  error: string;
  result: BrainResult | null;
  claimMode: ClaimMode;
  text: string;
  pagePath: string;
  reason: string;
  upload: { name: string; path: string } | null;
}

/** The host JSON body limit is 1 MiB and base64 adds a third, so a file stays under 512 KB. */
const FILE_LIMIT = 512 * 1024;
const TABS: readonly BrainTab[] = ["facts", "pages", "files", "chats"];

const isTab = (value: string): value is BrainTab => TABS.some((tab) => tab === value);
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

export function BrainPanel(props: BrainPanelProps) {
  const { t, format, errorMessage } = useText();
  const [state, setState] = createStore<BrainPanelState>({
    brains: [],
    brain: "",
    tab: "facts",
    query: "",
    list: {},
    trail: [],
    busy: false,
    saving: false,
    error: "",
    result: null,
    claimMode: "view",
    text: "",
    pagePath: "",
    reason: "",
    upload: null,
  });
  // A late answer must not fill a screen the person has left: reads keep the newest answer only,
  // and a brain switch or a close drops every answer that is still on its way.
  let readGeneration = 0;
  let scopeGeneration = 0;
  let pendingFile: File | undefined;
  let fileInput: HTMLInputElement | undefined;
  onCleanup(() => {
    readGeneration++;
    scopeGeneration++;
    pendingFile = undefined;
  });

  const scope = () => ({ mcpServerId: props.connectionId ?? "", brain: state.brain });
  const detail = (): BrainDetail | undefined => state.trail[state.trail.length - 1];
  const claimView = () => {
    const row = detail();
    return row?.kind === "claim" ? row.data : undefined;
  };
  const readerView = () => {
    const row = detail();
    return row?.kind === "page" || row?.kind === "file" ? row : undefined;
  };
  const chatView = () => {
    const row = detail();
    return row?.kind === "chat" ? row.data : undefined;
  };
  const day = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : format.date(date, { dateStyle: "medium", timeZone: "UTC" });
  };

  async function read<T>(task: () => Promise<T>): Promise<T | undefined> {
    const current = ++readGeneration;
    setState((draft) => {
      Object.assign(draft, { busy: true, error: "" });
    });
    try {
      const value = await task();
      return current === readGeneration ? value : undefined;
    } catch (error) {
      if (current === readGeneration)
        setState((draft) => {
          draft.error = errorMessage(error, t("brain.failed"));
        });
      return undefined;
    } finally {
      if (current === readGeneration)
        setState((draft) => {
          draft.busy = false;
        });
    }
  }
  async function write(input: BrainRequest): Promise<BrainResponse | undefined> {
    const current = scopeGeneration;
    setState((draft) => {
      Object.assign(draft, { saving: true, error: "", result: null });
    });
    try {
      const value = await props.request(input);
      return current === scopeGeneration ? value : undefined;
    } catch (error) {
      if (current === scopeGeneration)
        setState((draft) => {
          draft.error = errorMessage(error, t("brain.failed"));
        });
      return undefined;
    } finally {
      if (current === scopeGeneration)
        setState((draft) => {
          draft.saving = false;
        });
    }
  }
  const resultOf = (response: BrainResponse): BrainResult => {
    if (response.mode === "pull_request") return { kind: "proposed", url: response.pull_request?.url ?? null };
    if (response.mode === "commit")
      return { kind: "committed", url: typeof response.commit === "object" ? response.commit.url : null };
    return { kind: "saved", url: null };
  };
  const safeLink = (url: string | null | undefined) => {
    if (!url) return;
    try {
      if (new URL(url).protocol === "https:") props.onOpenLink(url);
    } catch {
      /* A source link that is not valid stays inert. */
    }
  };

  async function loadTab(tab: BrainTab, query = "") {
    if (!state.brain) return;
    setState((draft) => {
      Object.assign(draft, { tab, query, list: {}, trail: [], result: null, upload: null });
    });
    if (tab === "facts") return;
    const base = scope();
    const data = await read(() =>
      props.request(
        tab === "pages"
          ? { operation: "overview", ...base }
          : tab === "files"
            ? { operation: "files", ...base }
            : { operation: "sessions", ...base, query },
      ),
    );
    if (data)
      setState((draft) => {
        draft.list = data;
      });
  }
  async function loadBrains() {
    if (!props.connectionId) return;
    const data = await read(() => props.request({ operation: "brains", mcpServerId: props.connectionId ?? "" }));
    const brains = data?.brains;
    if (!brains) return;
    setState((draft) => {
      Object.assign(draft, { brains, brain: brains[0]?.id ?? "" });
    });
    await loadTab(state.tab);
  }
  onSettled(() => {
    void loadBrains();
  });
  function chooseBrain(id: string) {
    scopeGeneration++;
    readGeneration++;
    setState((draft) => {
      Object.assign(draft, { brain: id, busy: false, saving: false, error: "" });
    });
    void loadTab(state.tab);
  }

  async function submit() {
    const query = state.query.trim();
    const base = scope();
    if (state.tab === "facts" && query) {
      const data = await read(() => props.request({ operation: "search", ...base, query }));
      if (data)
        setState((draft) => {
          Object.assign(draft, { list: data, trail: [] });
        });
    }
    if (state.tab === "chats") {
      const data = await read(() => props.request({ operation: "sessions", ...base, query }));
      if (data)
        setState((draft) => {
          Object.assign(draft, { list: data, trail: [] });
        });
    }
  }
  const push = (next: BrainDetail) =>
    setState((draft) => {
      Object.assign(draft, { claimMode: "view", reason: "", result: null });
      draft.trail.push(next);
    });
  const back = () =>
    setState((draft) => {
      draft.trail.pop();
      Object.assign(draft, { claimMode: "view", result: null });
    });
  async function openClaim(claimId: string) {
    const base = scope();
    const data = await read(async () => {
      const [explained, context] = await Promise.all([
        props.request({ operation: "explain", ...base, claim_id: claimId }),
        props.request({ operation: "claim", ...base, claim_id: claimId }),
      ]);
      return { ...explained, nearby: context.nearby };
    });
    if (!data?.claim) return;
    setState((draft) => {
      draft.text = data.claim?.text ?? "";
    });
    push({ kind: "claim", data });
  }
  async function openPage(path: string) {
    const base = scope();
    const data = await read(() => props.request({ operation: "page", ...base, path }));
    if (data) push({ kind: "page", path, data });
  }
  async function openFile(path: string) {
    const base = scope();
    const data = await read(() => props.request({ operation: "file", ...base, path }));
    if (data) push({ kind: "file", path, data });
  }
  async function openChat(id: string, source: string) {
    const base = scope();
    const data = await read(() => props.request({ operation: "session", ...base, session: id, source }));
    if (data) push({ kind: "chat", data });
  }
  async function moreFiles(cursor: string) {
    const base = scope();
    const data = await read(() => props.request({ operation: "files", ...base, cursor }));
    if (data)
      setState((draft) => {
        draft.list = { ...data, files: [...(draft.list.files ?? []), ...(data.files ?? [])] };
      });
  }
  async function moreTurns(chat: BrainResponse, from: number) {
    const session = chat.session;
    if (!session) return;
    const base = scope();
    const data = await read(() =>
      props.request({ operation: "session", ...base, session: session.id, from_turn: from, ...sourceOf(session) }),
    );
    const next = data?.session;
    if (!next) return;
    setState((draft) => {
      const top = draft.trail[draft.trail.length - 1];
      if (top?.kind !== "chat" || !top.data.session) return;
      top.data.session.turns = [...(top.data.session.turns ?? []), ...(next.turns ?? [])];
      top.data.next_from_turn = data.next_from_turn ?? null;
    });
  }
  const sourceOf = (session: { source?: string | undefined }) => (session.source ? { source: session.source } : {});

  async function remember() {
    const base = scope();
    const response = await write({
      operation: "remember",
      ...base,
      text: state.text.trim(),
      ...(state.pagePath.trim() ? { page: state.pagePath.trim() } : {}),
    });
    if (!response) return;
    setState((draft) => {
      Object.assign(draft, { result: resultOf(response), text: "" });
    });
  }
  async function fixClaim(claimId: string) {
    const base = scope();
    const response = await write({ operation: "update", ...base, claim_id: claimId, text: state.text.trim() });
    if (response)
      setState((draft) => {
        Object.assign(draft, { result: resultOf(response), claimMode: "view" });
      });
  }
  async function forgetClaim(claimId: string) {
    const base = scope();
    const response = await write({ operation: "forget", ...base, claim_id: claimId, reason: state.reason.trim() });
    if (response)
      setState((draft) => {
        Object.assign(draft, { result: resultOf(response), claimMode: "view", reason: "" });
      });
  }
  function chooseFile(file: File) {
    if (file.size > FILE_LIMIT) {
      setState((draft) => {
        draft.error = t("brain.fileLimit");
      });
      return;
    }
    pendingFile = file;
    const today = new Date().toISOString().slice(0, 10);
    setState((draft) => {
      Object.assign(draft, { error: "", upload: { name: file.name, path: `inputs/${today}-${slug(file.name)}` } });
    });
  }
  async function addFile() {
    const file = pendingFile;
    const path = state.upload?.path.trim();
    if (!file || !path) return;
    const base = scope();
    let content: string;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const chunks: string[] = [];
      for (let index = 0; index < bytes.length; index += 8192)
        chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
      content = btoa(chunks.join(""));
    } catch (error) {
      setState((draft) => {
        draft.error = errorMessage(error, t("brain.failed"));
      });
      return;
    }
    const response = await write({ operation: "addFile", ...base, path, content });
    if (!response) return;
    pendingFile = undefined;
    setState((draft) => {
      Object.assign(draft, { upload: null, result: { kind: "saved", url: null } });
    });
    const files = await read(() => props.request({ operation: "files", ...base }));
    if (files)
      setState((draft) => {
        draft.list = files;
      });
  }

  const needle = () => state.query.trim().toLowerCase();
  const pages = createMemo(() => (state.list.pages ?? []).filter((page) => page.path.toLowerCase().includes(needle())));
  const files = createMemo(() => (state.list.files ?? []).filter((file) => file.path.toLowerCase().includes(needle())));
  const searchLabel = () =>
    ({
      facts: t("brain.searchFacts"),
      pages: t("brain.filterPages"),
      files: t("brain.filterFiles"),
      chats: t("brain.searchChats"),
    })[state.tab];
  const empty = () => {
    if (state.busy || state.error) return "";
    if (state.tab === "facts") return state.list.claims?.length === 0 ? t("brain.noResults") : "";
    if (state.tab === "pages") return state.list.pages && pages().length === 0 ? t("brain.noPages") : "";
    if (state.tab === "files") return state.list.files && files().length === 0 ? t("brain.noFiles") : "";
    return state.list.sessions?.length === 0 ? t("brain.noChats") : "";
  };
  const roleLabel = (role: string) =>
    role === "user" ? t("brain.roleUser") : role === "assistant" ? t("brain.roleAgent") : role;
  const brainName = (id: string) => state.brains.find((brain) => brain.id === id)?.repo || id;

  return (
    <section class="brain-panel" aria-label={t("brain.title")} aria-busy={state.busy ? "true" : "false"}>
      <Show
        when={props.connectionId}
        fallback={
          <div class="brain-empty">
            {props.accountControls}
            <Brain aria-hidden="true" />
            <h1>{t("brain.connectTitle")}</h1>
            <p>{t("brain.connectBody")}</p>
            <Button onClick={props.onConnect}>{t("brain.connect")}</Button>
          </div>
        }
      >
        <header class="brain-header">
          <div class="brain-title">
            <Brain aria-hidden="true" />
            <h1>{t("brain.title")}</h1>
          </div>
          <div class="brain-header-actions">
            {props.accountControls}
            <Show when={state.brains.length > 1}>
              <NativeSelect
                size="sm"
                aria-label={t("brain.pick")}
                value={state.brain}
                onChange={(event) => chooseBrain(event.currentTarget.value)}
              >
                <For each={state.brains}>{(brain) => <option value={brain.id}>{brainName(brain.id)}</option>}</For>
              </NativeSelect>
            </Show>
            <Show when={state.brain}>
              <Button
                variant="secondary"
                size="sm"
                disabled={detail()?.kind === "remember"}
                onClick={() => {
                  setState((draft) => {
                    draft.text = "";
                  });
                  push({ kind: "remember" });
                }}
              >
                <Plus aria-hidden="true" />
                {t("brain.remember")}
              </Button>
            </Show>
          </div>
        </header>

        <Show when={state.error}>
          <div class="brain-alert" role="alert">
            <p>{state.error}</p>
            <div class="brain-alert-actions">
              <Show when={state.brains.length === 0}>
                <Button size="sm" variant="secondary" onClick={() => void loadBrains()}>
                  {t("brain.retry")}
                </Button>
                <Button size="sm" variant="ghost" onClick={props.onConnect}>
                  {t("brain.connect")}
                </Button>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={state.brains.length === 0 && !state.busy && !state.error}>
          <p class="brain-hint">{t("brain.noBrains")}</p>
        </Show>
        <Show when={state.result}>
          {(result) => (
            <div class="brain-result" role="status">
              <p>
                {result().kind === "proposed"
                  ? t("brain.proposed")
                  : result().kind === "committed"
                    ? t("brain.committed")
                    : t("brain.saved")}
              </p>
              <Show when={result().url}>
                {(url) => (
                  <Button variant="link" size="sm" onClick={() => safeLink(url())}>
                    {result().kind === "proposed" ? t("brain.openResult") : t("brain.viewCommit")}
                  </Button>
                )}
              </Show>
            </div>
          )}
        </Show>

        <Show when={state.brain}>
          <Show
            when={detail()}
            fallback={
              <>
                <SlidingTabs.Root
                  class="brain-tabs"
                  value={state.tab}
                  onChange={(value) => {
                    if (isTab(value)) void loadTab(value);
                  }}
                >
                  <SlidingTabs.List aria-label={t("brain.sections")}>
                    <SlidingTabs.Trigger value="facts">{t("brain.tabFacts")}</SlidingTabs.Trigger>
                    <SlidingTabs.Trigger value="pages">{t("brain.tabPages")}</SlidingTabs.Trigger>
                    <SlidingTabs.Trigger value="files">{t("brain.tabFiles")}</SlidingTabs.Trigger>
                    <SlidingTabs.Trigger value="chats">{t("brain.tabChats")}</SlidingTabs.Trigger>
                  </SlidingTabs.List>
                </SlidingTabs.Root>
                <form
                  class="brain-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!state.busy) void submit();
                  }}
                >
                  <Search aria-hidden="true" />
                  <Input
                    type="search"
                    aria-label={searchLabel()}
                    placeholder={searchLabel()}
                    value={state.query}
                    onValueChange={(query) =>
                      setState((draft) => {
                        draft.query = query;
                      })
                    }
                  />
                  <Show when={state.busy}>
                    <Spinner aria-label={t("brain.loading")} />
                  </Show>
                </form>

                <Show when={state.tab === "files"}>
                  <div class="brain-upload">
                    <Input
                      ref={(element: HTMLInputElement) => {
                        fileInput = element;
                      }}
                      class="sr-only"
                      type="file"
                      aria-label={t("brain.addFile")}
                      onChange={(event: Event & { currentTarget: HTMLInputElement }) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) chooseFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    <Show
                      when={state.upload}
                      fallback={
                        <Button variant="secondary" size="sm" onClick={() => fileInput?.click()}>
                          <Upload aria-hidden="true" />
                          {t("brain.addFile")}
                        </Button>
                      }
                    >
                      {(upload) => (
                        <div class="brain-upload-card">
                          <p>{upload().name}</p>
                          <Input
                            aria-label={t("brain.filePath")}
                            value={upload().path}
                            onValueChange={(path) =>
                              setState((draft) => {
                                if (draft.upload) draft.upload.path = path;
                              })
                            }
                          />
                          <div class="brain-actions">
                            <Button
                              size="sm"
                              disabled={state.saving || !upload().path.trim()}
                              onClick={() => void addFile()}
                            >
                              {t("brain.addFile")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                pendingFile = undefined;
                                setState((draft) => {
                                  draft.upload = null;
                                });
                              }}
                            >
                              {t("brain.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                </Show>

                <Show when={empty()}>{(message) => <p class="brain-hint">{message()}</p>}</Show>
                <Show when={state.tab === "facts" && !state.list.claims && !state.busy}>
                  <p class="brain-hint">{t("brain.factsHint")}</p>
                </Show>
                <div class="brain-list">
                  <For each={state.tab === "facts" ? state.list.claims : undefined}>
                    {(claim) => (
                      <Button class="brain-row" variant="ghost" onClick={() => void openClaim(claim.id)}>
                        <span class="brain-row-title">{claim.text}</span>
                        <span class="brain-row-meta">
                          <span>
                            {claim.page}:{claim.line}
                          </span>
                          <Badge variant={claim.authority ? "info-light" : "secondary"}>
                            {claim.authority ?? t("brain.durable")}
                          </Badge>
                          <span>{claim.verified_at ? day(claim.verified_at) : t("brain.undated")}</span>
                        </span>
                      </Button>
                    )}
                  </For>
                  <For each={state.tab === "pages" ? pages() : undefined}>
                    {(page) => (
                      <Button class="brain-row" variant="ghost" onClick={() => void openPage(page.path)}>
                        <span class="brain-row-line">
                          <FileText aria-hidden="true" />
                          <span class="brain-row-title">{page.path}</span>
                        </span>
                      </Button>
                    )}
                  </For>
                  <For each={state.tab === "files" ? files() : undefined}>
                    {(file) => (
                      <Button class="brain-row" variant="ghost" onClick={() => void openFile(file.path)}>
                        <span class="brain-row-line">
                          <FileText aria-hidden="true" />
                          <span class="brain-row-title">{file.path}</span>
                        </span>
                        <span class="brain-row-meta">
                          <span>{format.fileSize(file.size)}</span>
                          <Show when={file.last_modified}>{(value) => <span>{day(value())}</span>}</Show>
                        </span>
                      </Button>
                    )}
                  </For>
                  <For each={state.tab === "chats" ? state.list.sessions : undefined}>
                    {(session) => (
                      <Button
                        class="brain-row"
                        variant="ghost"
                        onClick={() => void openChat(session.id, session.source)}
                      >
                        <span class="brain-row-line">
                          <MessageSquare aria-hidden="true" />
                          <span class="brain-row-title">{session.title || session.id}</span>
                        </span>
                        <Show when={session.snippet}>
                          {(snippet) => <span class="brain-row-snippet">{snippet()}</span>}
                        </Show>
                        <span class="brain-row-meta">
                          <Badge variant="secondary">{session.source}</Badge>
                          <Show when={session.started_at}>{(value) => <span>{day(value())}</span>}</Show>
                        </span>
                      </Button>
                    )}
                  </For>
                </div>
                <Show when={state.tab === "files" && state.list.next_cursor}>
                  {(cursor) => (
                    <Button
                      class="brain-more"
                      variant="ghost"
                      disabled={state.busy}
                      onClick={() => void moreFiles(cursor())}
                    >
                      {t("brain.more")}
                    </Button>
                  )}
                </Show>
              </>
            }
          >
            {(current) => (
              <article class="brain-detail">
                <Button class="brain-back" variant="ghost" size="sm" onClick={back}>
                  <ArrowLeft aria-hidden="true" />
                  {t("brain.back")}
                </Button>
                <Switch>
                  <Match when={current().kind === "remember"}>
                    <form
                      class="brain-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!state.saving && state.text.trim().length >= 3) void remember();
                      }}
                    >
                      <h2>{t("brain.remember")}</h2>
                      <Textarea
                        aria-label={t("brain.fact")}
                        placeholder={t("brain.factPlaceholder")}
                        value={state.text}
                        rows={4}
                        onValueChange={(text) =>
                          setState((draft) => {
                            draft.text = text;
                          })
                        }
                      />
                      <Input
                        aria-label={t("brain.pagePath")}
                        placeholder={t("brain.pagePath")}
                        value={state.pagePath}
                        onValueChange={(pagePath) =>
                          setState((draft) => {
                            draft.pagePath = pagePath;
                          })
                        }
                      />
                      <div class="brain-actions">
                        <Button type="submit" disabled={state.saving || state.text.trim().length < 3}>
                          {t("brain.save")}
                        </Button>
                      </div>
                    </form>
                  </Match>
                  <Match when={claimView()}>
                    {(data) => (
                      <Show when={data().claim}>
                        {(claim) => (
                          <>
                            <h2 class="brain-claim">{claim().text}</h2>
                            <div class="brain-row-meta">
                              <Badge variant={claim().authority ? "info-light" : "secondary"}>
                                {claim().authority ?? t("brain.durable")}
                              </Badge>
                              <span>
                                {claim().verified_at
                                  ? t("brain.verifiedOn", { date: day(claim().verified_at ?? "") })
                                  : t("brain.undated")}
                              </span>
                            </div>
                            <h3>{t("brain.source")}</h3>
                            <div class="brain-source">
                              <Button variant="link" size="sm" onClick={() => void openPage(claim().page)}>
                                {claim().page}:{claim().line}
                              </Button>
                              <code>{claim().commit.slice(0, 7)}</code>
                              <Button variant="ghost" size="sm" onClick={() => safeLink(claim().url)}>
                                <ExternalLink aria-hidden="true" />
                                {t("brain.openSource")}
                              </Button>
                            </div>
                            <Show when={data().sources?.length}>
                              <h3>{t("brain.cites")}</h3>
                              <ul class="brain-plain-list">
                                <For each={data().sources}>
                                  {(source) => (
                                    <li>
                                      <span>{source.path}</span>
                                      <Show when={source.origin}>{(origin) => <small>{origin()}</small>}</Show>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                            <Show when={data().replaces?.length || data().replaced_by?.length}>
                              <h3>{t("brain.history")}</h3>
                              <ul class="brain-plain-list">
                                <For each={data().replaces}>
                                  {(old) => (
                                    <li>
                                      <small>{t("brain.replaces")}</small>
                                      <span>{old.text ?? t("brain.goneClaim")}</span>
                                    </li>
                                  )}
                                </For>
                                <For each={data().replaced_by}>
                                  {(next) => (
                                    <li>
                                      <small>{t("brain.replacedBy")}</small>
                                      <Button variant="link" size="sm" onClick={() => void openClaim(next.id)}>
                                        {next.text}
                                      </Button>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                            <Show when={data().nearby?.length}>
                              <h3>{t("brain.nearby")}</h3>
                              <ul class="brain-plain-list">
                                <For each={data().nearby}>
                                  {(near) => (
                                    <li>
                                      <small>
                                        {near.page}:{near.line}
                                      </small>
                                      <Button variant="link" size="sm" onClick={() => void openClaim(near.id)}>
                                        {near.text}
                                      </Button>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                            <Switch>
                              <Match when={state.claimMode === "view"}>
                                <div class="brain-actions">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      setState((draft) => {
                                        Object.assign(draft, { claimMode: "fix", text: claim().text });
                                      })
                                    }
                                  >
                                    <Pencil aria-hidden="true" />
                                    {t("brain.fix")}
                                  </Button>
                                  <Button
                                    variant="destructive-ghost"
                                    size="sm"
                                    onClick={() =>
                                      setState((draft) => {
                                        draft.claimMode = "forget";
                                      })
                                    }
                                  >
                                    <Trash2 aria-hidden="true" />
                                    {t("brain.forget")}
                                  </Button>
                                </div>
                              </Match>
                              <Match when={state.claimMode === "fix"}>
                                <form
                                  class="brain-form"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!state.saving && state.text.trim().length >= 3) void fixClaim(claim().id);
                                  }}
                                >
                                  <Textarea
                                    aria-label={t("brain.fact")}
                                    value={state.text}
                                    rows={4}
                                    onValueChange={(text) =>
                                      setState((draft) => {
                                        draft.text = text;
                                      })
                                    }
                                  />
                                  <div class="brain-actions">
                                    <Button type="submit" disabled={state.saving || state.text.trim().length < 3}>
                                      {t("brain.save")}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={() =>
                                        setState((draft) => {
                                          draft.claimMode = "view";
                                        })
                                      }
                                    >
                                      {t("brain.cancel")}
                                    </Button>
                                  </div>
                                </form>
                              </Match>
                              <Match when={state.claimMode === "forget"}>
                                <div class="brain-form">
                                  <p>{t("brain.forgetHelp")}</p>
                                  <Textarea
                                    aria-label={t("brain.reason")}
                                    placeholder={t("brain.reason")}
                                    value={state.reason}
                                    rows={3}
                                    onValueChange={(reason) =>
                                      setState((draft) => {
                                        draft.reason = reason;
                                      })
                                    }
                                  />
                                  <div class="brain-actions">
                                    <Button
                                      variant="destructive"
                                      disabled={state.saving || state.reason.trim().length < 3}
                                      onClick={() => void forgetClaim(claim().id)}
                                    >
                                      {t("brain.forget")}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={() =>
                                        setState((draft) => {
                                          draft.claimMode = "view";
                                        })
                                      }
                                    >
                                      {t("brain.cancel")}
                                    </Button>
                                  </div>
                                </div>
                              </Match>
                            </Switch>
                          </>
                        )}
                      </Show>
                    )}
                  </Match>
                  <Match when={readerView()}>
                    {(item) => (
                      <>
                        <div class="brain-reader-head">
                          <h2>{item().path}</h2>
                          <Show when={item().data.url}>
                            {(url) => (
                              <Button variant="ghost" size="sm" onClick={() => safeLink(url())}>
                                <ExternalLink aria-hidden="true" />
                                {t("brain.openSource")}
                              </Button>
                            )}
                          </Show>
                          <Show when={item().data.download_url}>
                            {(url) => (
                              <Button variant="secondary" size="sm" onClick={() => safeLink(url())}>
                                <Download aria-hidden="true" />
                                {t("brain.download")}
                              </Button>
                            )}
                          </Show>
                        </div>
                        <Show when={item().data.text !== undefined}>
                          <Show
                            when={item().path.toLowerCase().endsWith(".md")}
                            fallback={<pre class="brain-text">{item().data.text}</pre>}
                          >
                            <MarkdownFilePreview
                              class="brain-page"
                              renderedClass="message-markdown"
                              statusClass="brain-text"
                              truncatedClass="brain-hint"
                              body={item().data.text ?? ""}
                              agents={[]}
                              onSelectAgent={() => undefined}
                              onOpenLink={safeLink}
                              onOpenSharedFile={() => undefined}
                            />
                          </Show>
                        </Show>
                      </>
                    )}
                  </Match>
                  <Match when={chatView()}>
                    {(data) => (
                      <Show when={data().session}>
                        {(session) => (
                          <>
                            <h2>{session().title || session().id}</h2>
                            <div class="brain-chat">
                              <For each={session().turns}>
                                {(turn) => (
                                  <div class="brain-turn" data-role={turn.role}>
                                    <strong>{roleLabel(turn.role)}</strong>
                                    <p>{turn.text}</p>
                                  </div>
                                )}
                              </For>
                            </div>
                            <Show when={data().next_from_turn}>
                              {(next) => (
                                <Button
                                  class="brain-more"
                                  variant="ghost"
                                  disabled={state.busy}
                                  onClick={() => void moreTurns(data(), next())}
                                >
                                  {t("brain.more")}
                                </Button>
                              )}
                            </Show>
                          </>
                        )}
                      </Show>
                    )}
                  </Match>
                </Switch>
              </article>
            )}
          </Show>
        </Show>
      </Show>
    </section>
  );
}

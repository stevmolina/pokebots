import type {
  RoomMemory,
  RoomMessage,
  RoomSummary,
  RoomsPort,
  RoomsRequest,
  RoomsResult,
} from "@openbot/contracts/rooms";
import type { JSX } from "@solidjs/web";
import { createEffect, createStore, For, onCleanup, Show } from "solid-js";
import { Button } from "../../button";
import { Input, Textarea } from "../../form";
import { useText } from "../../text";
import "./rooms.css";

/** The same Rooms view for desktop and web. The consumer supplies the host transport. */
export function RoomsPanel(props: { request: RoomsPort; onConnect: () => void; accountControls?: JSX.Element }) {
  const { t, format, errorMessage } = useText();
  const [state, setState] = createStore<{
    pollVersion: number;
    connected: boolean;
    loaded: boolean;
    busy: boolean;
    error: string;
    rooms: readonly RoomSummary[];
    room: RoomSummary | null;
    messages: readonly RoomMessage[];
    detail: RoomsResult;
    memory: RoomMemory;
    body: string;
    thread: number | undefined;
    name: string;
    notice: string;
    invite: string;
    task: string;
    reason: string;
    tab: "messages" | "memory" | "tasks";
    form: "create" | "join" | null;
  }>({
    pollVersion: 0,
    connected: false,
    loaded: false,
    busy: false,
    error: "",
    rooms: [],
    room: null,
    messages: [],
    detail: { connected: false },
    memory: { version: 0, about: "", decided: "", open: "" },
    body: "",
    thread: undefined,
    name: "",
    notice: "",
    invite: "",
    task: "",
    reason: "",
    tab: "messages",
    form: null,
  });
  let disposed = false;
  let generation = 0;
  onCleanup(() => {
    disposed = true;
    generation++;
  });
  async function call(input: RoomsRequest) {
    const result = await props.request(input);
    if (!disposed)
      setState((draft) => {
        draft.connected = result.connected;
      });
    return result;
  }
  async function list() {
    const result = await call({ kind: "list" });
    if (!disposed)
      setState((draft) => {
        Object.assign(draft, { rooms: result.rooms ?? [], loaded: true });
      });
  }
  async function action(run: () => Promise<void>) {
    if (state.busy) return;
    setState((draft) => {
      Object.assign(draft, { busy: true, error: "" });
    });
    try {
      await run();
    } catch (error) {
      if (!disposed)
        setState((draft) => {
          draft.error = errorMessage(error, t("rooms.error"));
        });
    } finally {
      if (!disposed)
        setState((draft) => {
          draft.busy = false;
        });
    }
  }
  async function detail(roomId: string) {
    const result = await call({ kind: "detail", roomId });
    if (disposed || state.room?.id !== roomId) return;
    setState((draft) => {
      Object.assign(draft, {
        detail: result,
        memory: result.memory ?? { version: 0, about: "", decided: "", open: "" },
      });
    });
    const room = result.room;
    if (room)
      setState((draft) => {
        draft.room = room;
      });
  }
  async function open(room: RoomSummary) {
    setState((draft) => {
      draft.pollVersion++;
    });
    setState((draft) => {
      Object.assign(draft, { room, messages: [], thread: undefined, tab: "messages", body: "", error: "" });
    });
    await detail(room.id);
  }
  function merge(messages: readonly RoomMessage[]) {
    setState((draft) => {
      draft.messages = ((old) =>
        [...new Map([...old, ...messages].map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id))(
        draft.messages,
      );
    });
  }
  // One long poll per visible room. A switch or unmount discards its pending reply.
  createEffect(
    () => [state.room?.id, state.thread, state.pollVersion] as const,
    ([roomId, thread]) => {
      const version = ++generation;
      if (!roomId) return;
      const id = roomId;
      let cursor = 0;
      let stopped = false;

      async function listen() {
        try {
          const first = await call({ kind: "read", roomId: id, since: 0, ...(thread === undefined ? {} : { thread }) });
          if (stopped || disposed || version !== generation) return;
          setState((draft) => {
            draft.messages = first.messages ?? [];
          });
          for (const message of first.messages ?? []) cursor = Math.max(cursor, message.id);
          while (!stopped && !disposed && version === generation) {
            const next = await call({ kind: "wait", roomId: id, since: cursor });
            if (stopped || disposed || version !== generation || !next.connected) return;
            const all = next.messages ?? [];
            for (const message of all) cursor = Math.max(cursor, message.id);
            merge(
              thread === undefined ? all : all.filter((message) => message.thread === thread || message.id === thread),
            );
            const room = next.room;
            if (room)
              setState((draft) => {
                draft.room = room;
              });
          }
        } catch (error) {
          if (!stopped && !disposed)
            setState((draft) => {
              draft.error = errorMessage(error, t("rooms.error"));
            });
        }
      }
      void listen();
      return () => {
        stopped = true;
      };
    },
  );
  createEffect(
    () => true,
    () => void action(list),
  );
  const mutate = (input: RoomsRequest) =>
    action(async () => {
      await call(input);
      const roomId = state.room?.id;
      if (roomId) await detail(roomId);
    });
  return (
    <section class="rooms-panel" aria-label={t("rooms.title")}>
      <header class="rooms-header">
        <h1>{state.room?.name ?? t("rooms.title")}</h1>
        <Show
          when={state.room}
          fallback={
            <div class="rooms-actions">
              <Button
                variant="ghost"
                onClick={() =>
                  setState((draft) => {
                    draft.form = "join";
                  })
                }
              >
                {t("rooms.join")}
              </Button>
              <Button
                onClick={() =>
                  setState((draft) => {
                    draft.form = "create";
                  })
                }
              >
                {t("rooms.create")}
              </Button>
            </div>
          }
        >
          <Button
            variant="ghost"
            onClick={() => {
              generation++;
              setState((draft) => {
                draft.room = null;
              });
              void action(list);
            }}
          >
            {t("rooms.back")}
          </Button>
        </Show>
      </header>
      <Show when={props.accountControls} fallback={<p class="rooms-muted">{t("rooms.hostAccount")}</p>}>
        <div class="rooms-actions">{props.accountControls}</div>
      </Show>
      <Show when={state.error}>
        <p role="alert">{state.error}</p>
        <Button
          onClick={() =>
            void action(async () => {
              if (state.room) await open(state.room);
              else await list();
            })
          }
        >
          {t("rooms.retry")}
        </Button>
      </Show>
      <Show when={state.loaded && !state.connected}>
        <p>{t("rooms.connect")}</p>
        <Button onClick={() => props.onConnect()}>{t("rooms.signIn")}</Button>
      </Show>
      <Show when={state.connected}>
        <Show when={state.form && !state.room}>
          <form
            class="rooms-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const result = await call(
                  state.form === "create"
                    ? { kind: "create", name: state.name, notice: state.notice }
                    : { kind: "join", invite: state.invite },
                );
                setState((draft) => {
                  draft.form = null;
                });
                await list();
                if (result.room) await open(result.room);
              });
            }}
          >
            <Show
              when={state.form === "create"}
              fallback={
                <label>
                  {t("rooms.link")}
                  <Input
                    required
                    value={state.invite}
                    onInput={(event) =>
                      setState((draft) => {
                        draft.invite = event.currentTarget.value;
                      })
                    }
                  />
                </label>
              }
            >
              <label>
                {t("rooms.name")}
                <Input
                  required
                  maxlength={100}
                  value={state.name}
                  onInput={(event) =>
                    setState((draft) => {
                      draft.name = event.currentTarget.value;
                    })
                  }
                />
              </label>
              <label>
                {t("rooms.notice")}
                <Textarea
                  maxlength={2000}
                  value={state.notice}
                  onInput={(event) =>
                    setState((draft) => {
                      draft.notice = event.currentTarget.value;
                    })
                  }
                />
              </label>
            </Show>
            <Button type="submit" disabled={state.busy}>
              {t(state.form === "create" ? "rooms.create" : "rooms.join")}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setState((draft) => {
                  draft.form = null;
                })
              }
            >
              {t("common.cancel")}
            </Button>
          </form>
        </Show>
        <Show
          when={state.room}
          fallback={
            <div class="rooms-list">
              <Show when={state.rooms.length === 0}>
                <p>{t("rooms.empty")}</p>
              </Show>
              <For each={state.rooms}>
                {(room) => (
                  <Button variant="ghost" class="rooms-list-row" onClick={() => void action(() => open(room))}>
                    <span>{room.name}</span>
                    <span>
                      {room.unread || ""}{" "}
                      {room.needs_you ? `${t("rooms.needsYou")} ${format.number(room.needs_you)}` : ""}
                    </span>
                  </Button>
                )}
              </For>
            </div>
          }
        >
          {(room) => (
            <>
              <Show when={room().notice}>
                <p>{room().notice}</p>
              </Show>
              <Show when={room().paused}>
                <div class="rooms-actions" role="status">
                  <p>{t("rooms.paused")}</p>
                  <Show when={room().role === "owner"}>
                    <Button disabled={state.busy} onClick={() => void mutate({ kind: "resume", roomId: room().id })}>
                      {t("rooms.resume")}
                    </Button>
                  </Show>
                </div>
              </Show>
              <nav class="rooms-actions" aria-label={t("rooms.title")}>
                <For each={["messages", "memory", "tasks"] as const}>
                  {(tab) => (
                    <Button
                      variant={state.tab === tab ? "secondary" : "ghost"}
                      onClick={() => {
                        setState((draft) => {
                          draft.tab = tab;
                        });
                        if (tab !== "messages") void action(() => detail(room().id));
                      }}
                    >
                      {t(tab === "messages" ? "rooms.messages" : tab === "memory" ? "rooms.memory" : "rooms.tasks")}
                    </Button>
                  )}
                </For>
                <Show when={room().role === "owner"}>
                  <Button
                    variant="ghost"
                    disabled={state.busy}
                    onClick={() =>
                      void action(async () => {
                        const result = await call({ kind: "invite", roomId: room().id });
                        if (result.invite) await navigator.clipboard.writeText(result.invite);
                      })
                    }
                  >
                    {t("rooms.invite")}
                  </Button>
                </Show>
              </nav>
              <div class="rooms-muted">
                <For each={state.detail.agents}>
                  {(agent) => (
                    <p>
                      {agent.label} ·{" "}
                      {agent.status === "working"
                        ? t("rooms.working")
                        : agent.status === "needs_you"
                          ? t("rooms.needsYou")
                          : agent.status === "done"
                            ? t("rooms.done")
                            : ""}{" "}
                      {agent.status_note}
                    </p>
                  )}
                </For>
              </div>
              <Show when={state.tab === "messages"}>
                <Show when={state.thread !== undefined}>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setState((draft) => {
                        draft.thread = undefined;
                      })
                    }
                  >
                    {t("rooms.all")}
                  </Button>
                </Show>
                <div class="rooms-messages" role="log" aria-label={t("rooms.messages")}>
                  <For each={state.messages}>
                    {(message) => (
                      <article>
                        <div class="rooms-message-meta">
                          <strong>{message.author}</strong>
                          <time>{message.at ? format.date(new Date(message.at), { timeStyle: "short" }) : ""}</time>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              setState((draft) => {
                                draft.thread = message.thread ?? message.id;
                              })
                            }
                          >
                            {t("rooms.reply")}
                          </Button>
                        </div>
                        <p>{message.body}</p>
                        <Show when={message.mentions.length}>
                          <small>{message.mentions.map((mention) => `@${mention}`).join(" ")}</small>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
                <form
                  class="rooms-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action(async () => {
                      const result = await call({
                        kind: "send",
                        roomId: room().id,
                        body: state.body,
                        ...(state.thread === undefined ? {} : { thread: state.thread }),
                      });
                      if (!result.connected) return;
                      setState((draft) => {
                        draft.body = "";
                      });
                    });
                  }}
                >
                  <label>
                    {t("rooms.message")}
                    <Textarea
                      required
                      maxlength={10000}
                      value={state.body}
                      onInput={(event) =>
                        setState((draft) => {
                          draft.body = event.currentTarget.value;
                        })
                      }
                    />
                  </label>
                  <Button type="submit" disabled={state.busy || !state.body.trim()}>
                    {t("rooms.send")}
                  </Button>
                </form>
              </Show>
              <Show when={state.tab === "memory"}>
                <form
                  class="rooms-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate({
                      kind: "memory",
                      roomId: room().id,
                      ...state.memory,
                      base_version: state.memory.version,
                    });
                  }}
                >
                  <For each={["about", "decided", "open"] as const}>
                    {(part) => (
                      <label>
                        {t(part === "about" ? "rooms.about" : part === "decided" ? "rooms.decided" : "rooms.open")}
                        <Textarea
                          maxlength={1000}
                          value={state.memory[part]}
                          onInput={(event) =>
                            setState((draft) => {
                              draft.memory[part] = event.currentTarget.value;
                            })
                          }
                        />
                      </label>
                    )}
                  </For>
                  <Button type="submit" disabled={state.busy}>
                    {t("common.save")}
                  </Button>
                </form>
              </Show>
              <Show when={state.tab === "tasks"}>
                <form
                  class="rooms-actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate({ kind: "task-create", roomId: room().id, title: state.task });
                  }}
                >
                  <label>
                    {t("rooms.taskTitle")}
                    <Input
                      required
                      maxlength={200}
                      value={state.task}
                      onInput={(event) =>
                        setState((draft) => {
                          draft.task = event.currentTarget.value;
                        })
                      }
                    />
                  </label>
                  <Button type="submit" disabled={state.busy}>
                    {t("rooms.addTask")}
                  </Button>
                </form>
                <label>
                  {t("rooms.reason")}
                  <Input
                    maxlength={500}
                    value={state.reason}
                    onInput={(event) =>
                      setState((draft) => {
                        draft.reason = event.currentTarget.value;
                      })
                    }
                  />
                </label>
                <div class="rooms-board">
                  <For each={["pending", "in_progress", "blocked", "done"] as const}>
                    {(status) => (
                      <section>
                        <h2>
                          {t(
                            status === "pending"
                              ? "rooms.pending"
                              : status === "in_progress"
                                ? "rooms.inProgress"
                                : status === "blocked"
                                  ? "rooms.blocked"
                                  : "rooms.done",
                          )}
                        </h2>
                        <For each={state.detail.tasks?.filter((task) => task.status === status)}>
                          {(task) => (
                            <article>
                              <p>{task.title}</p>
                              <small>{task.claimed_by ?? task.blocked_reason}</small>
                              <div class="rooms-actions">
                                <For
                                  each={
                                    task.status === "in_progress"
                                      ? task.mine
                                        ? (["renew", "done", "block", "release"] as const)
                                        : []
                                      : task.status === "done"
                                        ? []
                                        : (["claim"] as const)
                                  }
                                >
                                  {(action) => (
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      disabled={state.busy}
                                      onClick={() =>
                                        void mutate({
                                          kind: "task-action",
                                          roomId: room().id,
                                          taskId: task.id,
                                          action,
                                          reason: state.reason,
                                        })
                                      }
                                    >
                                      {t(
                                        action === "claim"
                                          ? "rooms.claim"
                                          : action === "renew"
                                            ? "rooms.renew"
                                            : action === "done"
                                              ? "rooms.done"
                                              : action === "block"
                                                ? "rooms.block"
                                                : "rooms.release",
                                      )}
                                    </Button>
                                  )}
                                </For>
                              </div>
                            </article>
                          )}
                        </For>
                      </section>
                    )}
                  </For>
                </div>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </section>
  );
}

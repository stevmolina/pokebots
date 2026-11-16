import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import {
  Archive,
  Button,
  buttonVariants,
  ChevronRight,
  DropdownMenu,
  Ellipsis,
  Input,
  List,
  PanelRight,
  PencilLine,
  Plus,
  Square,
  Trash2,
} from "@openbot/ui";
import { sidebarMessageTime } from "@openbot/ui/features/sidebar/sidebar-filtering";
import { useText } from "@openbot/ui/text";
import { createSignal, createUniqueId, For, Show } from "solid-js";
import { ThreadStatusMark } from "./ThreadStatusMark";
import { ThreadTitle } from "./ThreadTitle";
import { type ThreadHeaderProps, type ThreadItem, threadBusy } from "./thread-types";

export type AgentSessionsProps = Omit<ThreadHeaderProps, "phoneActions">;

/** The actions of one session row: rename, stop, open beside the chat, archive and delete. */
function SessionRowMenu(props: AgentSessionsProps & { session: ThreadItem; onRename: () => void }) {
  const { t } = useText();
  const side = () => props.session.kind === "side";
  const busy = () => threadBusy(props.session.status);
  return (
    <DropdownMenu.Root placement="bottom-end" gutter={4}>
      <DropdownMenu.Trigger
        class={buttonVariants({ variant: "ghost", size: "icon-sm", class: "agent-sessions-row-menu" })}
        aria-label={t("conversation.sessions.actions", { title: props.session.title })}
        title={t("conversation.sessions.actions", { title: props.session.title })}
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="agent-sessions-menu">
          <Show when={side() && props.onRename}>
            <DropdownMenu.Item onSelectAfterClose={props.onRename}>
              <PencilLine aria-hidden="true" />
              {t("common.rename")}
            </DropdownMenu.Item>
          </Show>
          <Show when={side() && busy() && props.onStop}>
            {(stop) => (
              <DropdownMenu.Item onSelect={() => stop()(props.session.id)}>
                <Square aria-hidden="true" />
                {t("conversation.threads.stop")}
              </DropdownMenu.Item>
            )}
          </Show>
          <Show when={side() && props.onMoveToSide}>
            {(toSide) => (
              <DropdownMenu.Item onSelectAfterClose={() => toSide()(props.session.id)}>
                <PanelRight aria-hidden="true" />
                {t("conversation.threads.toSide")}
              </DropdownMenu.Item>
            )}
          </Show>
          {/*
            A running thread stops first. The archive of a delete cancels the queued messages, and Undo
            cannot bring them back, so a queued thread has no delete.
          */}
          <DropdownMenu.Item disabled={busy()} onSelect={() => props.onArchive(props.session.id)}>
            <Archive aria-hidden="true" />
            {t("conversation.threads.archive")}
          </DropdownMenu.Item>
          <Show when={props.onDelete}>
            {(remove) => (
              <DropdownMenu.Item
                class="ui-action-menu-danger"
                disabled={busy() || props.session.status.kind === "queued"}
                onSelect={() => remove()(props.session.id)}
              >
                <Trash2 aria-hidden="true" />
                {t("common.delete")}
              </DropdownMenu.Item>
            )}
          </Show>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** One open session. A click opens it and makes it the main session. */
function SessionRow(props: AgentSessionsProps & { session: ThreadItem }) {
  const { t, format } = useText();
  const [renaming, setRenaming] = createSignal(false);
  const current = () => (props.session.id === props.activeId ? "true" : undefined);
  /** The agent's own chat and a new session have no actions: they are not threads of the host. */
  const actions = () => props.session.kind === "side";
  const finishRename = (value: string | null) => {
    if (!renaming()) return;
    setRenaming(false);
    const title = value?.trim();
    if (title && title !== props.session.title) props.onRename?.(props.session.id, title);
  };
  return (
    <div class="agent-sessions-row" aria-current={current()} data-kind={props.session.kind}>
      <Show
        when={renaming()}
        fallback={
          <Button
            variant="ghost"
            type="button"
            class="agent-sessions-open"
            onClick={() => props.onOpen(props.session.id)}
          >
            <Show when={props.session.stem}>
              <span class="agent-sessions-stem" aria-hidden="true" />
            </Show>
            <ThreadTitle class="agent-sessions-title" title={props.session.title} />
            <ThreadStatusMark status={props.session.status} unread={props.session.unread} />
            <Show when={props.session.kind !== "draft"}>
              <span class="agent-sessions-time">{sidebarMessageTime(props.session.updatedAt, format)}</span>
            </Show>
          </Button>
        }
      >
        <Input
          ref={(field: HTMLInputElement) =>
            requestAnimationFrame(() => {
              field.focus();
              field.select();
            })
          }
          class="agent-sessions-rename"
          size="sm"
          dir="auto"
          aria-label={t("conversation.threads.name")}
          maxlength={INPUT_LIMITS.agentTaskTitle}
          defaultValue={props.session.title}
          onKeyDown={(event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishRename(event.currentTarget.value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finishRename(null);
            }
          }}
          onBlur={(event: FocusEvent & { currentTarget: HTMLInputElement }) => finishRename(event.currentTarget.value)}
        />
      </Show>
      <Show when={actions() && !renaming()}>
        <SessionRowMenu {...props} onRename={() => setRenaming(true)} />
      </Show>
    </div>
  );
}

/** The sessions that the card shows before "All sessions". */
const SESSIONS_SHOWN = 5;

/**
 * The sessions of an agent, at the top of its panel. The main session, which is on screen, comes
 * first, then the newest others. A click on a row opens that session and makes it the main session.
 * "New session" starts one. "All sessions" shows the rest and the archived sessions.
 */
export function AgentSessions(props: AgentSessionsProps) {
  const { t, format } = useText();
  const titleId = createUniqueId();
  const [all, setAll] = createSignal(false);
  const shown = () => (all() ? props.sessions : props.sessions.slice(0, SESSIONS_SHOWN));
  const more = () => props.sessions.length > SESSIONS_SHOWN || props.archived.length > 0;
  return (
    <section class="settings-link-section agent-sessions" aria-labelledby={titleId}>
      <h3 id={titleId} class="settings-link-section-title">
        {t("conversation.sessions.title")}
      </h3>
      <div class="settings-link-group settings-link-group-inset agent-sessions-list">
        <For each={shown()} keyed={(session) => session.id}>
          {(session) => <SessionRow {...props} session={session()} />}
        </For>
        <Button
          variant="ghost"
          type="button"
          class="agent-sessions-action"
          disabled={!props.canStartNew}
          onClick={() => props.onNew()}
        >
          <Plus aria-hidden="true" />
          <span>{t("conversation.sessions.new")}</span>
        </Button>
        <Show when={more()}>
          <Button
            variant="ghost"
            type="button"
            class="agent-sessions-action agent-sessions-all"
            aria-expanded={all() ? "true" : "false"}
            onClick={() => setAll((open) => !open)}
          >
            <List aria-hidden="true" />
            <span>{t("conversation.sessions.all")}</span>
            <span class="agent-sessions-count">{format.number(props.sessions.length + props.archived.length)}</span>
            <ChevronRight class="agent-sessions-chevron" aria-hidden="true" />
          </Button>
        </Show>
      </div>
      <Show when={all() && props.archived.length > 0}>
        <h4 class="settings-link-section-title agent-sessions-archived-title">{t("conversation.threads.archived")}</h4>
        <div class="settings-link-group settings-link-group-inset agent-sessions-list">
          <For each={props.archived} keyed={(session) => session.id}>
            {(session) => (
              <div class="agent-sessions-row" data-archived="">
                <Button
                  variant="ghost"
                  type="button"
                  class="agent-sessions-open"
                  title={t("conversation.threads.restore")}
                  onClick={() => props.onRestore(session().id)}
                >
                  <Archive class="agent-sessions-archived-icon" aria-hidden="true" />
                  <ThreadTitle class="agent-sessions-title" title={session().title} />
                  <span class="agent-sessions-time">{sidebarMessageTime(session().updatedAt, format)}</span>
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

/**
 * The Tasks board prototype: three board directions in the real Tasks page of the real app. The app
 * runs on the preview mock with the board tasks. The prototype adds a List / Board switch to the page
 * header, and in Board view it shows the board in place of the task list. A card opens the real task
 * panel, as a row of the list does.
 */

import type { AgentTask } from "@openbot/contracts/ipc";
import { type TasksSectionId, taskSections, taskTone } from "@openbot/team-client/agent-tasks";
import { Button, ChevronRight, Square } from "@openbot/ui";
import type { AgentProfile } from "@openbot/ui/data";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { AgentTaskMark, agentTaskStatus } from "@openbot/ui/features/conversation/AgentTasks";
import { ServerMark } from "@openbot/ui/features/servers/ServerRail";
import { useText } from "@openbot/ui/text";
import { type JSX, Portal } from "@solidjs/web";
import { createMemo, createSignal, createStore, For, onSettled, Show } from "solid-js";
import { PrototypeApp } from "./prototype-support";
import { BOARD_AGENTS, BOARD_APP_OPTIONS, BOARD_TASKS, serverOfTask } from "./tasks-board-prototype-fixtures";
import "./TasksBoardPrototype.css";

type ColumnId = "needsYou" | "working" | "queued" | "done";

const COLUMN_OF: Record<TasksSectionId, ColumnId> = {
  needsYou: "needsYou",
  unread: "needsYou",
  read: "needsYou",
  working: "working",
  waiting: "queued",
  closed: "done",
};

const agentOf = (agentId: string) => BOARD_AGENTS.find((agent) => agent.id === agentId);

/** "now", "6 min", "2 h", "3 d": the age of the task's last change. */
function since(task: AgentTask): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(task.closedAt ?? task.updatedAt)) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (60 * 24))} d`;
}

/** The board state: the tasks, the drag, and the actions that a drop and Stop take. */
function createBoard() {
  const [board, setBoard] = createStore<{ tasks: AgentTask[]; dragging: string | null; selected: string | null }>({
    tasks: BOARD_TASKS.map((task) => ({ ...task })),
    dragging: null,
    selected: null,
  });
  const update = (id: string, change: (task: AgentTask) => void) =>
    setBoard((draft) => {
      const task = draft.tasks.find((item) => item.id === id);
      if (task) change(task);
    });
  const columns = createMemo(() => {
    const byColumn: Record<ColumnId, AgentTask[]> = { needsYou: [], working: [], queued: [], done: [] };
    for (const section of taskSections(board.tasks, true)) byColumn[COLUMN_OF[section.id]].push(...section.tasks);
    return byColumn;
  });
  return {
    board,
    columns,
    /** Dragging a card to Done closes the task. */
    close: (id: string) =>
      update(id, (task) => {
        task.state = "closed";
        task.closedAt = new Date().toISOString();
      }),
    /** Dragging a card out of Done reopens the task. */
    reopen: (id: string) =>
      update(id, (task) => {
        task.state = "idle";
        task.closedAt = null;
        task.updatedAt = new Date().toISOString();
      }),
    stop: (id: string) =>
      update(id, (task) => {
        task.state = "idle";
        task.outcome = "interrupted";
        task.activeTurnId = null;
        task.progress = null;
      }),
    setDragging: (id: string | null) =>
      setBoard((draft) => {
        draft.dragging = id;
      }),
    /** Opens the real task panel: a click on the task's row in the hidden list. */
    open: (root: HTMLElement | undefined, task: AgentTask) => {
      setBoard((draft) => {
        draft.selected = draft.selected === task.id ? null : task.id;
      });
      const rowOf = () =>
        [...(root?.querySelectorAll<HTMLElement>(".tasks-page-row") ?? [])].find(
          (row) => row.querySelector(".tasks-page-row-title")?.textContent === task.title,
        );
      const row = rowOf();
      if (row) return row.click();
      // A closed task past the first two is behind "Show all".
      root?.querySelector<HTMLElement>(".tasks-page-show-all[aria-expanded='false']")?.click();
      requestAnimationFrame(() => rowOf()?.click());
    },
  };
}

export type Board = ReturnType<typeof createBoard>;

/** True when a drop of the dragged card on this column changes the task: to Done, or out of Done. */
function canDrop(board: Board, column: ColumnId): boolean {
  const id = board.board.dragging;
  const task = board.board.tasks.find((item) => item.id === id);
  if (!task) return false;
  return task.state === "closed" ? column !== "done" : column === "done";
}

function drop(board: Board, column: ColumnId) {
  const id = board.board.dragging;
  if (!id || !canDrop(board, column)) return;
  if (column === "done") board.close(id);
  else board.reopen(id);
  board.setDragging(null);
}

/** The drop events of a column. */
export function dropTarget(board: Board, column: ColumnId) {
  return {
    "data-drop": canDrop(board, column) ? "" : undefined,
    onDragOver: (event: DragEvent) => {
      if (canDrop(board, column)) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      drop(board, column);
    },
  };
}

export interface CardOptions {
  /** Hide the agent line, where the lane already names the agent. */
  agent?: boolean;
  /** Two lines of the title at most. */
  clamp?: boolean;
  /** The age of the last change. */
  age?: boolean;
}

/**
 * One task card: the state mark and the title, the live progress line or the state, then the agent
 * and the server mark of the All machines view. A working task has Stop.
 */
export function TaskCard(props: { board: Board; task: AgentTask; root: () => HTMLElement | undefined } & CardOptions) {
  const { t } = useText();
  const agent = (): AgentProfile | undefined => agentOf(props.task.agentId);
  const server = () => serverOfTask(props.task);
  const status = () => agentTaskStatus(props.task, t);
  const serverMark = () => (
    <span class="tasks-board-card-server" title={server().name}>
      <ServerMark server={server()} />
    </span>
  );
  return (
    <li
      class="tasks-board-card"
      draggable="true"
      data-closed={props.task.state === "closed" ? "" : undefined}
      data-selected={props.board.board.selected === props.task.id ? "" : undefined}
      data-dragging={props.board.board.dragging === props.task.id ? "" : undefined}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer?.setData("text/plain", props.task.id);
        props.board.setDragging(props.task.id);
      }}
      onDragEnd={() => props.board.setDragging(null)}
    >
      <button
        type="button"
        class="tasks-board-card-open"
        aria-label={t("conversation.tasks.page.row", {
          title: props.task.title,
          agent: agent()?.name ?? props.task.agentId,
          status: status(),
        })}
        onClick={() => props.board.open(props.root(), props.task)}
      >
        <span class="tasks-board-card-head">
          <AgentTaskMark task={props.task} decorative />
          <span class="tasks-board-card-title" data-clamp={props.clamp === false ? undefined : ""}>
            {props.task.title}
          </span>
        </span>
        <span class="tasks-board-card-line">
          <span
            class="tasks-board-card-status tasks-page-status"
            data-tone={taskTone(props.task) === "working" ? "working" : undefined}
          >
            {status()}
          </span>
          <Show when={props.agent === false}>{serverMark()}</Show>
        </span>
        <Show when={props.agent !== false}>
          <span class="tasks-board-card-foot">
            <AgentAvatar agent={agent()} class="tasks-page-avatar" />
            <span class="tasks-board-card-agent">{agent()?.name}</span>
            <Show when={props.age}>
              <span class="tasks-board-card-age">{since(props.task)}</span>
            </Show>
            {serverMark()}
          </span>
        </Show>
      </button>
      <Show when={props.task.state === "running"}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="tasks-board-card-stop"
          aria-label={`Stop ${props.task.title}`}
          title="Stop"
          onClick={() => props.board.stop(props.task.id)}
        >
          <Square aria-hidden="true" />
        </Button>
      </Show>
    </li>
  );
}

const COLUMN_TITLE: Record<ColumnId, (t: ReturnType<typeof useText>["t"]) => string> = {
  needsYou: (t) => t("conversation.tasks.section.needsYou"),
  working: (t) => t("conversation.tasks.section.working"),
  queued: () => "Queued",
  done: () => "Done",
};

export function ColumnHeading(props: { column: ColumnId; count: number; id: string; label?: string }) {
  const { t } = useText();
  return (
    <h3 id={props.id} class="tasks-page-section-heading tasks-board-heading">
      <span>{props.label ?? COLUMN_TITLE[props.column](t)}</span>
      <span class="tasks-page-count">{props.count}</span>
    </h3>
  );
}

interface VariantProps {
  board: Board;
  root: () => HTMLElement | undefined;
}

/** A. Four even columns of compact cards. */
export function EvenColumnsBoard(props: VariantProps) {
  const ids: ColumnId[] = ["needsYou", "working", "queued", "done"];
  return (
    <div class="tasks-board tasks-board-even">
      <For each={ids}>
        {(column) => (
          <section
            class="tasks-board-column"
            aria-labelledby={`board-a-${column}`}
            {...dropTarget(props.board, column)}
          >
            <ColumnHeading column={column} id={`board-a-${column}`} count={props.board.columns()[column].length} />
            <ul class="tasks-board-cards">
              <For each={props.board.columns()[column]} keyed={(task) => task.id}>
                {(task) => <TaskCard board={props.board} task={task()} root={props.root} />}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}

/**
 * B. Needs you first: a wide first column with full titles and ages, one In progress column for the
 * working and the queued tasks, and Done folded to a strip until you open it.
 */
export function FocusBoard(props: VariantProps) {
  const [doneOpen, setDoneOpen] = createSignal(false);
  const cols = () => props.board.columns();
  return (
    <div class="tasks-board tasks-board-focus" data-done-open={doneOpen() ? "" : undefined}>
      <section class="tasks-board-column" aria-labelledby="board-b-needsYou" {...dropTarget(props.board, "needsYou")}>
        <ColumnHeading column="needsYou" id="board-b-needsYou" count={cols().needsYou.length} />
        <ul class="tasks-board-cards">
          <For each={cols().needsYou} keyed={(task) => task.id}>
            {(task) => <TaskCard board={props.board} task={task()} root={props.root} clamp={false} age />}
          </For>
        </ul>
      </section>
      <section class="tasks-board-column" aria-labelledby="board-b-progress" {...dropTarget(props.board, "working")}>
        <ColumnHeading
          column="working"
          id="board-b-progress"
          label="In progress"
          count={cols().working.length + cols().queued.length}
        />
        <ul class="tasks-board-cards">
          <For each={cols().working} keyed={(task) => task.id}>
            {(task) => <TaskCard board={props.board} task={task()} root={props.root} />}
          </For>
        </ul>
        <Show when={cols().queued.length > 0}>
          <p class="tasks-board-subheading">Queued</p>
          <ul class="tasks-board-cards">
            <For each={cols().queued} keyed={(task) => task.id}>
              {(task) => <TaskCard board={props.board} task={task()} root={props.root} />}
            </For>
          </ul>
        </Show>
      </section>
      <section class="tasks-board-column tasks-board-done" aria-label="Done" {...dropTarget(props.board, "done")}>
        <Show
          when={doneOpen()}
          fallback={
            <button
              type="button"
              class="tasks-board-fold"
              aria-expanded="false"
              aria-label={`Show done tasks (${cols().done.length})`}
              onClick={() => setDoneOpen(true)}
            >
              <span class="tasks-board-fold-label">Done</span>
              <span class="tasks-page-count">{cols().done.length}</span>
            </button>
          }
        >
          <button
            type="button"
            class="tasks-page-section-heading tasks-board-heading tasks-board-fold-open"
            aria-expanded="true"
            onClick={() => setDoneOpen(false)}
          >
            <span>Done</span>
            <span class="tasks-page-count">{cols().done.length}</span>
            <ChevronRight aria-hidden="true" class="tasks-board-fold-chevron" />
          </button>
          <ul class="tasks-board-cards">
            <For each={cols().done} keyed={(task) => task.id}>
              {(task) => <TaskCard board={props.board} task={task()} root={props.root} />}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}

/** The closed cards that a lane shows before "+n". */
const LANE_DONE_SHOWN = 1;

/** C. A lane for each agent, with the four state columns across. */
export function AgentLanesBoard(props: VariantProps) {
  const { t } = useText();
  const ids: ColumnId[] = ["needsYou", "working", "queued", "done"];
  const lanes = createMemo(() =>
    BOARD_AGENTS.map((agent) => {
      const ofAgent = (id: ColumnId) => props.board.columns()[id].filter((task) => task.agentId === agent.id);
      const cells: Record<ColumnId, AgentTask[]> = {
        needsYou: ofAgent("needsYou"),
        working: ofAgent("working"),
        queued: ofAgent("queued"),
        done: ofAgent("done"),
      };
      return { agent, cells };
    }).filter((lane) => ids.some((id) => lane.cells[id].length > 0)),
  );
  return (
    <div class="tasks-board-lanes">
      <div class="tasks-board-lanes-row tasks-board-lanes-head" aria-hidden="true">
        <span class="tasks-board-lane-corner">{t("conversation.tasks.page.agents")}</span>
        <For each={ids}>
          {(column) => (
            <span class="tasks-page-section-heading tasks-board-heading">
              <span>{COLUMN_TITLE[column](t)}</span>
              <span class="tasks-page-count">{props.board.columns()[column].length}</span>
            </span>
          )}
        </For>
      </div>
      <For each={lanes()} keyed={(lane) => lane.agent.id}>
        {(lane) => (
          <section class="tasks-board-lanes-row" aria-labelledby={`board-c-${lane().agent.id}`}>
            <h3 class="tasks-board-lane-agent" id={`board-c-${lane().agent.id}`}>
              <AgentAvatar agent={lane().agent} class="tasks-board-lane-avatar" />
              <span>{lane().agent.name}</span>
            </h3>
            <For each={ids}>
              {(column) => {
                const [more, setMore] = createSignal(false);
                const tasks = () => {
                  const all = lane().cells[column];
                  return column === "done" && !more() ? all.slice(0, LANE_DONE_SHOWN) : all;
                };
                return (
                  <div class="tasks-board-lane-cell" {...dropTarget(props.board, column)}>
                    <ul class="tasks-board-cards" aria-label={COLUMN_TITLE[column](t)}>
                      <For each={tasks()} keyed={(task) => task.id}>
                        {(task) => <TaskCard board={props.board} task={task()} root={props.root} agent={false} />}
                      </For>
                    </ul>
                    <Show when={column === "done" && !more() && lane().cells.done.length > LANE_DONE_SHOWN}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        class="tasks-page-show-all"
                        onClick={() => setMore(true)}
                      >
                        {`+${lane().cells.done.length - LANE_DONE_SHOWN} more`}
                      </Button>
                    </Show>
                  </div>
                );
              }}
            </For>
          </section>
        )}
      </For>
    </div>
  );
}

export type BoardVariant = (props: VariantProps) => JSX.Element;

/** The List / Board switch at the end of the page header. */
function ViewSwitch(props: { view: "list" | "board"; onChange: (view: "list" | "board") => void }) {
  return (
    <div class="tasks-board-switch">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={props.view === "list" ? "true" : "false"}
        onClick={() => props.onChange("list")}
      >
        List
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={props.view === "board" ? "true" : "false"}
        onClick={() => props.onChange("board")}
      >
        Board
      </Button>
    </div>
  );
}

/**
 * Opens the Tasks page as the user does: the profile menu at the foot of the sidebar, then Tasks.
 * Returns false until the menu trigger shows.
 */
function openTasksPage(app: HTMLElement): boolean {
  const trigger = app.querySelector<HTMLElement>(".sidebar-footer-profile");
  if (!trigger) return false;
  trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  trigger.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }));
  const pick = (tries: number) => {
    const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
      (element) => element.textContent?.trim() === "Tasks",
    );
    if (item) {
      item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
      item.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }));
      item.click();
    } else if (tries > 0) setTimeout(() => pick(tries - 1), 100);
  };
  pick(30);
  return true;
}

/**
 * The real app on its Tasks page, with the List / Board switch in the page header. In Board view, the
 * variant replaces the task list under the composer.
 */
export function TasksBoardApp(props: { variant: BoardVariant; view?: "list" | "board" }) {
  const [view, setView] = createSignal<"list" | "board">(props.view ?? "board");
  const [dom, setDom] = createStore<{ header: Element | null; column: Element | null }>({ header: null, column: null });
  const board = createBoard();
  let root: HTMLDivElement | undefined;
  onSettled(() => {
    if (!root) return;
    const app = root;
    let opened = false;
    let frame = 0;
    const sync = () => {
      if (!opened) opened = openTasksPage(app);
      setDom((draft) => {
        draft.header = app.querySelector(".tasks-page-header");
        draft.column = app.querySelector(".tasks-page-column");
      });
    };
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    });
    observer.observe(app, { subtree: true, childList: true });
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
  return (
    <div
      class="tasks-board-prototype"
      data-view={view()}
      ref={(element) => {
        root = element;
      }}
    >
      <PrototypeApp options={BOARD_APP_OPTIONS} />
      <Show when={dom.header} keyed>
        {(header) => (
          <Portal mount={header}>
            <ViewSwitch view={view()} onChange={setView} />
          </Portal>
        )}
      </Show>
      <Show when={view() === "board" ? dom.column : null} keyed>
        {(column) => <Portal mount={column}>{props.variant({ board, root: () => root })}</Portal>}
      </Show>
    </div>
  );
}

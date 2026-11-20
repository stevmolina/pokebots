import type { AgentTask } from "@openbot/contracts/ipc";
import type { AppTextKey } from "@openbot/i18n";
import { isAgentTaskActive, type TasksSectionId, taskSections } from "@openbot/team-client/agent-tasks";
import { Button, Square } from "@openbot/ui";
import type { AgentProfile } from "@openbot/ui/data";
import { AgentAvatar } from "@openbot/ui/features/agents/AgentAvatar";
import { AgentTaskMark, type AgentTaskWait, agentTaskStatus } from "@openbot/ui/features/conversation/AgentTasks";
import { useText } from "@openbot/ui/text";
import { createMemo, createSignal, createUniqueId, For, onCleanup, Show, untrack } from "solid-js";

/** The closed tasks that the Done column shows before "Show all". */
const TASKS_BOARD_CLOSED_SHOWN = 12;

type BoardColumnId = Extract<TasksSectionId, "needsYou" | "working" | "waiting" | "closed">;

const COLUMNS: readonly BoardColumnId[] = ["needsYou", "working", "waiting", "closed"];

const COLUMN_TITLE = {
  needsYou: "conversation.tasks.section.needsYou",
  working: "conversation.tasks.section.working",
  waiting: "conversation.tasks.board.queued",
  closed: "conversation.tasks.board.done",
} as const satisfies Record<BoardColumnId, AppTextKey>;

export interface TasksBoardProps {
  agents: readonly AgentProfile[];
  /** The tasks of all agents, also a start that waits. */
  tasks: readonly AgentTask[];
  /** The task in the side panel. */
  selectedId: string | null;
  onSelect: (taskId: string | null) => void;
  /** What the task's running turn waits for from the person. */
  waitOf?: ((task: AgentTask) => AgentTaskWait) | undefined;
  /** A card dropped on Done. */
  onCloseTask: (task: AgentTask) => void;
  /** A card dragged out of Done. */
  onReopenTask: (task: AgentTask) => void;
  onStopTask: (task: AgentTask) => void;
}

/**
 * The drag data of a card. Not `text/plain`: a drop on the composer or a message box would type the
 * task id into it.
 */
const TASK_DRAG_TYPE = "application/x-openbot-task";

/** A task that a drop on Done can close: open, and no turn runs or waits to start. */
const canClose = (task: AgentTask) => task.state !== "closed" && !isAgentTaskActive(task);

/**
 * One card: the state mark and the title, the live progress line or the state, then the agent. A
 * working card has Stop.
 */
function TaskCard(props: {
  task: AgentTask;
  agent: AgentProfile | undefined;
  selected: boolean;
  dragging: boolean;
  wait: AgentTaskWait;
  onOpen: () => void;
  onStop: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useText();
  const status = () => agentTaskStatus(props.task, t, props.wait);
  const draggable = () => props.task.state === "closed" || canClose(props.task);
  // A task update can move the card during its drag. The old card leaves the page and gets no
  // `dragend`, so the drag ends here, or the board would keep it faded.
  onCleanup(() => {
    if (untrack(() => props.dragging)) props.onDragEnd();
  });
  return (
    <li
      class="tasks-board-card"
      draggable={draggable() ? "true" : "false"}
      data-closed={props.task.state === "closed" ? "" : undefined}
      data-selected={props.selected ? "" : undefined}
      data-dragging={props.dragging ? "" : undefined}
      onDragStart={(event: DragEvent) => {
        if (!draggable()) return event.preventDefault();
        event.dataTransfer?.setData(TASK_DRAG_TYPE, props.task.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        props.onDragStart();
      }}
      onDragEnd={() => props.onDragEnd()}
    >
      <Button
        type="button"
        variant="ghost"
        class="tasks-board-card-open"
        aria-pressed={props.selected ? "true" : "false"}
        aria-label={t("conversation.tasks.page.row", {
          title: props.task.title,
          agent: props.agent?.name ?? props.task.agentId,
          status: status(),
        })}
        onClick={() => props.onOpen()}
      >
        <span class="tasks-board-card-head">
          <AgentTaskMark task={props.task} decorative />
          <span class="tasks-board-card-title">{props.task.title}</span>
        </span>
        <span
          class="tasks-board-card-status"
          data-tone={props.task.state === "running" && !props.wait ? "working" : undefined}
        >
          {status()}
        </span>
        <span class="tasks-board-card-agent">
          <AgentAvatar agent={props.agent} class="tasks-page-avatar" />
          <span class="tasks-board-card-agent-name">{props.agent?.name ?? props.task.agentId}</span>
        </span>
      </Button>
      <Show when={props.task.state === "running"}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="tasks-board-card-stop"
          aria-label={t("conversation.tasks.board.stop", { title: props.task.title })}
          title={t("conversation.tasks.board.stop", { title: props.task.title })}
          onClick={() => props.onStop()}
        >
          <Square aria-hidden="true" />
        </Button>
      </Show>
    </li>
  );
}

/**
 * The tasks of the Tasks page as a board: a column for each group of the list. Dropping a card on Done
 * closes the task, and dragging it out of Done reopens it. The task panel archives and restores too,
 * for the keyboard.
 */
export function TasksBoard(props: TasksBoardProps) {
  const { t } = useText();
  const ids = createUniqueId();
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [showAllClosed, setShowAllClosed] = createSignal(false);
  const waitOf = (task: AgentTask) => props.waitOf?.(task);
  const columns = createMemo(() => {
    const byColumn: Record<BoardColumnId, AgentTask[]> = { needsYou: [], working: [], waiting: [], closed: [] };
    for (const section of taskSections(props.tasks, true, undefined, (task) => waitOf(task) !== undefined)) {
      if (section.id === "unread" || section.id === "read") continue;
      byColumn[section.id].push(...section.tasks);
    }
    return byColumn;
  });
  const shown = (column: BoardColumnId) => {
    const tasks = columns()[column];
    return column === "closed" && !showAllClosed() ? tasks.slice(0, TASKS_BOARD_CLOSED_SHOWN) : tasks;
  };
  const draggedTask = () => props.tasks.find((task) => task.id === dragging());
  /** True when a drop of the dragged card on this column changes the task. */
  const accepts = (column: BoardColumnId) => {
    const task = draggedTask();
    if (!task) return false;
    return task.state === "closed" ? column !== "closed" : column === "closed" && canClose(task);
  };
  const drop = (column: BoardColumnId) => {
    const task = draggedTask();
    setDragging(null);
    if (!task || !accepts(column)) return;
    if (column === "closed") props.onCloseTask(task);
    else props.onReopenTask(task);
  };
  return (
    <div class="tasks-board">
      <For each={COLUMNS}>
        {(column) => (
          <section
            class="tasks-board-column"
            aria-labelledby={`${ids}-${column}`}
            data-drop={accepts(column) ? "" : undefined}
            onDragOver={(event: DragEvent) => {
              if (!accepts(column)) return;
              event.preventDefault();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event: DragEvent) => {
              event.preventDefault();
              drop(column);
            }}
          >
            <h3 id={`${ids}-${column}`} class="tasks-page-section-heading tasks-board-heading">
              <span>{t(COLUMN_TITLE[column])}</span>
              <span class="tasks-page-count">{columns()[column].length}</span>
            </h3>
            <ul class="tasks-board-cards">
              <For each={shown(column)} keyed={(task) => task.id}>
                {(task) => (
                  <TaskCard
                    task={task()}
                    agent={props.agents.find((agent) => agent.id === task().agentId)}
                    selected={props.selectedId === task().id}
                    dragging={dragging() === task().id}
                    wait={waitOf(task())}
                    onOpen={() => props.onSelect(props.selectedId === task().id ? null : task().id)}
                    onStop={() => props.onStopTask(task())}
                    onDragStart={() => setDragging(task().id)}
                    onDragEnd={() => setDragging(null)}
                  />
                )}
              </For>
            </ul>
            <Show when={column === "closed" && columns().closed.length > TASKS_BOARD_CLOSED_SHOWN}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="tasks-page-show-all"
                aria-expanded={showAllClosed() ? "true" : "false"}
                onClick={() => setShowAllClosed(!showAllClosed())}
              >
                {showAllClosed()
                  ? t("conversation.tasks.showLess")
                  : t("conversation.tasks.showAll", { count: columns().closed.length })}
              </Button>
            </Show>
          </section>
        )}
      </For>
    </div>
  );
}

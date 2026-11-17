import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AgentLanesBoard, EvenColumnsBoard, FocusBoard, TasksBoardApp } from "./tasks-board-prototype";

/*
 * Three directions for a board view of the Tasks page, in the real app. Each card is a task; the
 * columns are the task groups. Drag a card to Done to close it, and out of Done to reopen it. A working
 * card has Stop. A card opens the real task panel. The List / Board switch is in the page header.
 */

const meta = {
  title: "Prototypes/Tasks board",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today: the task list of the same tasks, for comparison. */
export const TodayList: Story = {
  name: "0. Today: list",
  render: () => <TasksBoardApp variant={EvenColumnsBoard} view="list" />,
};
/** A. Four even columns of compact cards: Needs you, Working, Queued, Done. */
export const EvenColumns: Story = {
  name: "A. Even columns",
  render: () => <TasksBoardApp variant={EvenColumnsBoard} />,
};
/** B. Needs you as a wide first column, one In progress column, and Done folded to a strip. */
export const NeedsYouFirst: Story = {
  name: "B. Needs you first",
  render: () => <TasksBoardApp variant={FocusBoard} />,
};
/** C. A lane for each agent, with the four state columns across. */
export const AgentLanes: Story = { name: "C. Agent lanes", render: () => <TasksBoardApp variant={AgentLanesBoard} /> };

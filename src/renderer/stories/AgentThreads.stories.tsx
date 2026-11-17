import { LOCAL_SERVER_ID } from "@openbot/contracts/ipc";
import { onSettled } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { MockOpenBotOptions } from "../src/preview/mock-openbot";
import {
  AGENT_ID,
  SERVER_BUSY_OPTIONS,
  SUBAGENT_THREAD_FALLBACK_OPTIONS,
  SUBAGENT_THREAD_OPTIONS,
  TABS_KEY,
  THREAD_OPTIONS,
  THREAD_QUEUE_OPTIONS,
  UNREAD_OPTIONS,
} from "./agent-threads-fixtures";
import { createAppDom, openChat, PrototypeApp } from "./prototype-support";
import "./agent-threads-story.css";

/**
 * The real app on Chief, with the main session that this device stored. `open` is the chat tab list of
 * older versions: the app ignores it. `panel` opens the agent panel with its Sessions card.
 */
function AgentThreadsApp(props: {
  open: string[];
  active: string | null;
  options?: MockOpenBotOptions;
  startNew?: boolean;
  panel?: boolean;
}) {
  const options = props.options ?? THREAD_OPTIONS;
  localStorage.setItem(
    TABS_KEY,
    JSON.stringify({ [LOCAL_SERVER_ID]: { [AGENT_ID]: { open: props.open, active: props.active } } }),
  );
  const app = createAppDom();
  onSettled(() => {
    const root = app.dom.root;
    if (!root) return;
    let openedChat = false;
    const observer = new MutationObserver(() => {
      if (!openedChat) openedChat = openChat(root, AGENT_ID);
      if (!openedChat) return;
      if (!props.startNew && !props.panel) {
        observer.disconnect();
        return;
      }
      const button = root.querySelector<HTMLButtonElement>(
        props.startNew ? ".conversation-new-session" : ".conversation-session-pill .conversation-title",
      );
      if (button) {
        button.click();
        observer.disconnect();
      }
    });
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  });
  return (
    <div class="agent-threads-story" ref={app.attach}>
      <PrototypeApp options={options} />
    </div>
  );
}

const meta = {
  title: "Conversation/Agent threads",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent's own chat as the main session. The header shows Chief as a pill, with "+" for a new session. */
export const MainChat: Story = {
  render: () => <AgentThreadsApp open={["pricing", "competitors", "release", "links"]} active={null} />,
};

/**
 * The pill opens the agent panel. Its Sessions card lists the main session first, then the newest
 * others, each with its state: done, working, failed and queued.
 */
export const SessionsPanel: Story = {
  render: () => <AgentThreadsApp open={[]} active="pricing" panel />,
};

/**
 * Unread agent messages in three side threads: a blue dot on their session rows, and the count on
 * Chief's sidebar row. A state badge outranks the dot. Open a session to read it.
 */
export const UnreadThreads: Story = {
  render: () => <AgentThreadsApp open={[]} active={null} options={UNREAD_OPTIONS} panel />,
};

/** A side thread as the main session, with its title in the pill and its context meter. */
export const SideThread: Story = {
  render: () => <AgentThreadsApp open={["pricing", "competitors"]} active="pricing" />,
};

/**
 * A thread that works, with two messages in its queue above the input. Reply to a message: the reply
 * card comes out from behind the input, under the queue.
 */
export const ThreadWithQueue: Story = {
  render: () => <AgentThreadsApp open={["competitors"]} active="competitors" options={THREAD_QUEUE_OPTIONS} />,
};

/** A thread that the agent started, held by the limit of parallel threads. */
export const QueuedThread: Story = {
  render: () => <AgentThreadsApp open={["links"]} active="links" />,
};

/** A thread held while the server is low on memory: the reason, and the messages that wait. */
export const ServerBusyThread: Story = {
  render: () => <AgentThreadsApp open={["hackathon-bot"]} active="hackathon-bot" options={SERVER_BUSY_OPTIONS} />,
};

/**
 * A side thread whose turn ended while its background subagent works. The bar under the title shows
 * what the subagent does now; click it for its newest steps. The worker row above the message box
 * shows it too. Both go away when the subagent ends.
 */
export const BackgroundSubagent: Story = {
  render: () => <AgentThreadsApp open={["fix-buttons"]} active="fix-buttons" options={SUBAGENT_THREAD_OPTIONS} />,
};

/**
 * The same thread from a server without agent-task-subagents-v1. The subagents message arrives as its
 * text only, so the thread shows no bar and no worker row.
 */
export const BackgroundSubagentOlderServer: Story = {
  render: () => (
    <AgentThreadsApp open={["fix-buttons"]} active="fix-buttons" options={SUBAGENT_THREAD_FALLBACK_OPTIONS} />
  ),
};

/**
 * A branch of "Pricing page copy". The line after the copied messages opens the source at the
 * answer that the branch came from. Open the thread menu: each branch shows under its source.
 * Hover the last answer of a turn for "Branch in new thread", or right-click it for "Branch from here".
 */
export const Branch: Story = {
  render: () => <AgentThreadsApp open={["pricing", "pricing-short"]} active="pricing-short" />,
};

/** A branch whose source thread was deleted: the line has no link. */
export const BranchOfDeletedThread: Story = {
  render: () => <AgentThreadsApp open={["pricing-orphan"]} active="pricing-orphan" />,
};

/** No side thread is open: the header shows only "New thread" and the menu. */
export const NoTabs: Story = { render: () => <AgentThreadsApp open={[]} active={null} /> };

/** A new side thread before its first message: the centered agent avatar and prompt. */
export const NewThread: Story = {
  render: () => <AgentThreadsApp open={["pricing"]} active={null} startNew />,
};

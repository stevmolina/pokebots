import { ConversationHeader } from "@pokebots/ui/features/conversation/ConversationHeader";
import { AgentSessions } from "@pokebots/ui/features/conversation/threads/AgentSessions";
import {
  DRAFT_THREAD_ID,
  MAIN_THREAD_ID,
  type ThreadItem,
  type ThreadStatus,
} from "@pokebots/ui/features/conversation/threads/thread-types";
import { createStore } from "solid-js";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { STORY_AGENT } from "./fixtures";
import "./agent-threads-story.css";

const IDLE: ThreadStatus = { kind: "idle" };
const NOW = Date.parse("2026-08-19T10:00:00.000Z");

function item(id: string, title: string, minutesAgo: number, status: ThreadStatus = IDLE): ThreadItem {
  return { id, kind: "side", title, updatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(), status };
}

const MAIN: ThreadItem = { ...item(MAIN_THREAD_ID, "Main chat", 5), kind: "main" };

const STATES: ThreadItem[] = [
  item("pricing", "Pricing page copy", 2),
  { ...item("competitors", "Competitor scan", 10, { kind: "working" }), unread: 0 },
  item("deploy", "Deploy the docs site", 14, { kind: "waiting", reason: "approval" }),
  { ...item("faq", "FAQ answers", 25), unread: 2 },
  item("links", "Check broken links", 30, { kind: "queued" }),
  item("release", "Release notes draft", 40, { kind: "failed" }),
  item("press", "Press kit", 60),
];

const ARCHIVED: ThreadItem[] = [
  item("old-onboarding", "Old onboarding copy", 1440),
  item("launch", "Launch checklist", 2880),
];

/**
 * The chat header with the session pill over the agent panel's Sessions card. A click on a row makes it
 * the main session: its title shows in the pill and the card keeps its order. "+" makes a new session main.
 */
function SessionsStory(props: { active?: string; archived?: ThreadItem[]; editable?: boolean }) {
  const [state, setState] = createStore({
    sessions: [MAIN, ...STATES],
    archived: props.archived ?? [],
    active: props.active ?? "pricing",
    draft: false,
  });
  const ordered = (): ThreadItem[] => {
    const draft: ThreadItem[] = state.draft
      ? [{ id: DRAFT_THREAD_ID, kind: "draft", title: "New session", updatedAt: MAIN.updatedAt, status: IDLE }]
      : [];
    const main = state.sessions.find((session) => session.id === state.active);
    const rest = state.sessions.filter((session) => session.id !== state.active);
    return [...draft, ...(main && !state.draft ? [main] : []), ...rest];
  };
  const open = (id: string) =>
    setState((draft) => {
      draft.active = id;
      draft.draft = id === DRAFT_THREAD_ID;
    });
  const startNew = () =>
    setState((draft) => {
      draft.draft = true;
      draft.active = DRAFT_THREAD_ID;
    });
  const title = () =>
    state.active === MAIN_THREAD_ID ? undefined : ordered().find((session) => session.id === state.active)?.title;
  const editable = props.editable ?? true;
  return (
    <div class="agent-sessions-story">
      <ConversationHeader
        agent={STORY_AGENT}
        onSettingsIntent={fn()}
        onOpenSettings={fn()}
        session={{ title: title(), canStartNew: true, onNew: startNew }}
      />
      <div class="agent-sessions-story-panel">
        <AgentSessions
          sessions={ordered()}
          archived={state.archived}
          activeId={state.active}
          canStartNew
          onOpen={open}
          onNew={startNew}
          onArchive={(id) =>
            setState((draft) => {
              const session = draft.sessions.find((entry) => entry.id === id);
              draft.sessions = draft.sessions.filter((entry) => entry.id !== id);
              if (session) draft.archived.unshift(session);
              if (draft.active === id) draft.active = MAIN_THREAD_ID;
            })
          }
          onStop={fn()}
          onRestore={(id) =>
            setState((draft) => {
              const session = draft.archived.find((entry) => entry.id === id);
              draft.archived = draft.archived.filter((entry) => entry.id !== id);
              if (session) draft.sessions.push(session);
              draft.active = id;
            })
          }
          onRename={
            editable
              ? (id, value) =>
                  setState((draft) => {
                    const session = draft.sessions.find((entry) => entry.id === id);
                    if (session) session.title = value;
                  })
              : undefined
          }
          onDelete={editable ? fn() : undefined}
          onMoveToSide={fn()}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Conversation/Agent sessions",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A side session is the main session: the pill names it. */
export const SideSessionMain: Story = { render: () => <SessionsStory /> };

/** The agent's own chat is the main session: the pill shows the agent only. */
export const MainChatMain: Story = { render: () => <SessionsStory active={MAIN_THREAD_ID} /> };

/** More sessions than the card shows, and archived ones: "All sessions" shows them. */
export const WithArchived: Story = { render: () => <SessionsStory archived={ARCHIVED} /> };

/** A host that cannot rename or delete a thread: the row menu has no Rename and no Delete. */
export const NoRenameOrDelete: Story = { render: () => <SessionsStory editable={false} /> };

import { type BackgroundWorker, BackgroundWorkers } from "@pokebots/ui/features/conversation/BackgroundWorkers";
import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { STORY_AGENTS } from "./fixtures";

const meta = {
  title: "Conversation/Background workers",
  component: BackgroundWorkers,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BackgroundWorkers>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ReferenceRow: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false);
    const [active, setActive] = createSignal(true);
    return (
      <>
        <BackgroundWorkers
          items={
            active()
              ? [
                  {
                    id: "worker",
                    agent: STORY_AGENTS[0],
                    title: "Add background worker visibility",
                    since: new Date(Date.now() - 89_000).toISOString(),
                    state: "running",
                    onOpen: () => {
                      setOpen(true);
                      setActive(false);
                    },
                  },
                ]
              : []
          }
        />
        <output>{open() ? "Worker details opened" : ""}</output>
      </>
    );
  },
};

/** A reply that streams: the parent rebuilds the item list on each token, every 50 ms. Rows must stay mounted. */
export const Streaming: Story = {
  render: () => {
    const [tick, setTick] = createSignal(0);
    const since = new Date(Date.now() - 89_000).toISOString();
    const timer = window.setInterval(() => setTick((value) => value + 1), 50);
    onCleanup(() => window.clearInterval(timer));
    const rows = (): BackgroundWorker[] => {
      tick();
      return [
        {
          id: "worker",
          agent: STORY_AGENTS[0],
          title: "Add background worker visibility",
          since,
          state: "running",
          onOpen: () => undefined,
        },
        {
          id: "queued",
          agent: STORY_AGENTS[1],
          title: "Check broken links",
          since,
          state: "queued",
          onOpen: () => undefined,
        },
      ];
    };
    return (
      <>
        <BackgroundWorkers items={rows()} />
        <output data-tick={tick()} />
      </>
    );
  },
};

export const ManyRunning: Story = {
  render: () => {
    const since = new Date(Date.now() - 81_000).toISOString();
    const items: BackgroundWorker[] = [
      {
        id: "w1",
        agent: STORY_AGENTS[0],
        title: "Order active sessions first",
        since,
        state: "running",
        onOpen: () => undefined,
      },
      {
        id: "w2",
        agent: STORY_AGENTS[0],
        title: "Minimalist bot list toggle mockups",
        since,
        state: "running",
        onOpen: () => undefined,
      },
      {
        id: "w3",
        agent: STORY_AGENTS[0],
        title: "Send agent messages into side threads",
        since,
        state: "running",
        onOpen: () => undefined,
      },
      {
        id: "w4",
        agent: STORY_AGENTS[0],
        title: "Automating Pokebots VPS updates",
        since,
        state: "running",
        onOpen: () => undefined,
      },
      {
        id: "w5",
        agent: STORY_AGENTS[0],
        title: "Bot search broken on all machines",
        since,
        state: "running",
        onOpen: () => undefined,
      },
    ];
    return <BackgroundWorkers items={items} />;
  },
};

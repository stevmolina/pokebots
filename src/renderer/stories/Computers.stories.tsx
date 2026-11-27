import type { CloudComputer } from "@pokebots/ui/features/servers/CloudComputerList";
import { AgentComputerPanel } from "@pokebots/ui/features/settings/AgentComputerPanel";
import { createStore } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

function ComputersStory(props: { management: boolean; connected?: boolean }) {
  const [state, setState] = createStore<{ machines: CloudComputer[]; connected: boolean }>({
    connected: props.connected !== false,
    machines: [
      {
        id: "work",
        context: "research",
        status: "running",
        size: "standard",
        deadlineAt: "2030-01-01T14:30:00Z",
        liveViewUrl: "https://computer.mcpbox.dev",
      },
      { id: "render", context: "video", status: "paused", size: "large", deadlineAt: null, liveViewUrl: null },
    ],
  });
  return (
    <div class="agent-computer-form">
      <AgentComputerPanel
        status={{ connected: state.connected, keyHint: "cmk_preview", error: null }}
        statusError={null}
        machines={state.machines}
        machinesError={null}
        busy={null}
        onConnect={() =>
          setState((state) => {
            state.connected = true;
          })
        }
        onDisconnect={() =>
          setState((state) => {
            state.connected = false;
          })
        }
        onTest={() => {}}
        onRefresh={() => {}}
        onOpenLiveView={() => {}}
        onGetKey={() => {}}
        onManage={
          props.management
            ? async (input) =>
                setState((state) => {
                  const row = state.machines.find((machine) =>
                    input.operation === "start" ? machine.context === input.target : machine.id === input.target,
                  );
                  if (input.operation === "start") {
                    if (row) row.status = "running";
                    else
                      state.machines.push({
                        id: input.target,
                        context: input.target,
                        size: input.size,
                        status: "running",
                        deadlineAt: null,
                        liveViewUrl: null,
                      });
                  }
                  if (row && input.operation === "stop") row.status = "paused";
                  if (row && input.operation === "destroy")
                    state.machines = state.machines.filter((machine) => machine.id !== row.id);
                })
            : undefined
        }
      />
    </div>
  );
}
const meta = {
  title: "Servers/Computers",
  component: ComputersStory,
  args: { management: true },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ComputersStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Before: Story = { args: { management: false } };
export const Desktop: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Disconnected: Story = { args: { connected: false } };

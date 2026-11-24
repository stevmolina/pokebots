import { ComputerLiveViewCard } from "@openbot/ui/features/conversation/ComputerLiveViewCard";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

/*
 * The user asked for a cloud agent. The agent started a cloud computer, and the chat shows a card that
 * opens its live view. The card holds only the machine id; the link is read at the press.
 */

const meta = {
  title: "Conversation/Cloud computer live view",
  component: ComputerLiveViewCard,
  render: (args) => (
    <main
      style={{ width: "100vw", "max-width": "560px", padding: "var(--openbot-space-4)", "box-sizing": "border-box" }}
    >
      <ComputerLiveViewCard {...args} />
    </main>
  ),
  args: {
    machineId: "demo-machine",
    onOpen: fn(),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof ComputerLiveViewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

/** The built-in browser can show the live view, and Open live view still opens the default browser. */
export const WithSidePanel: Story = { args: { onOpenInPanel: fn() } };

export const Opening: Story = { args: { busy: true } };

export const NotFound: Story = {
  args: { note: "This server's cloud computer list does not have this machine. Open it from Machines." },
};

export const Member: Story = {
  args: { onOpen: undefined, note: "An owner or admin of this server can open the live view." },
};

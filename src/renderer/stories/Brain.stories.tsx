import { BrainPanel } from "@openbot/ui/features/brain/BrainPanel";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { mockBrainRequest } from "../src/preview/mock-brain";

const meta = { title: "Workspace/Brain", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {
  render: () => (
    <BrainPanel
      connectionId="demo-brain"
      request={mockBrainRequest}
      onConnect={() => undefined}
      onOpenLink={() => undefined}
    />
  ),
};
export const Disconnected: Story = {
  render: () => (
    <BrainPanel
      connectionId={null}
      request={mockBrainRequest}
      onConnect={() => undefined}
      onOpenLink={() => undefined}
    />
  ),
};
export const Phone: Story = { ...Connected, globals: { viewport: { value: "mobile1", isRotated: false } } };

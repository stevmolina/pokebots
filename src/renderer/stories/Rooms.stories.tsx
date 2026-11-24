import type { RoomMessage, RoomsPort, RoomsResult } from "@openbot/contracts/rooms";
import { RoomsPanel } from "@openbot/ui/features/rooms/RoomsPanel";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const room = {
  id: "r_release",
  name: "Friday release",
  notice: "Plan the release with your people and agents.",
  paused: false,
  role: "owner",
  unread: 2,
};
const rooms = [room, { ...room, id: "r_design", name: "Design review", unread: 0 }];
const messages: RoomMessage[] = [
  {
    id: 1,
    thread: null,
    author: "Steven",
    kind: "human",
    body: "Let's keep the first release small. @Codex can you check the task board?",
    mentions: ["Codex"],
    at: "2026-11-17T06:00:00Z",
  },
  {
    id: 2,
    thread: null,
    author: "Codex · Steven",
    kind: "agent",
    body: "I claimed the API check. The room memory has our release decision.",
    mentions: [],
    at: "2026-11-17T06:01:00Z",
  },
];
const data: RoomsResult = {
  connected: true,
  rooms,
  room,
  messages,
  memory: {
    version: 1,
    about: "Coordinate the Friday release.",
    decided: "Ship the small release on Friday.",
    open: "Confirm the final API check.",
  },
  agents: [{ label: "Codex · Steven", status: "working", status_note: "Checking the API" }],
  tasks: [
    {
      id: 1,
      title: "Verify the API",
      status: "in_progress",
      claimed_by: "Codex · Steven",
      blocked_reason: null,
      mine: false,
    },
    { id: 2, title: "Read release notes", status: "pending", claimed_by: null, blocked_reason: null, mine: false },
  ],
};
const request: RoomsPort = async (input) => {
  if (input.kind === "wait") return new Promise(() => {});
  if (input.kind === "list") return { connected: true, rooms };
  if (input.kind === "read") return { connected: true, room, messages };
  return data;
};
const meta = { title: "Features/Rooms", component: RoomsPanel, parameters: { layout: "fullscreen" } } satisfies Meta<
  typeof RoomsPanel
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = { render: () => <RoomsPanel request={request} onConnect={() => {}} /> };
export const Disconnected: Story = {
  render: () => <RoomsPanel request={async () => ({ connected: false })} onConnect={() => {}} />,
};
export const Paused: Story = {
  render: () => {
    const pausedRoom = { ...room, paused: true };
    const paused: RoomsPort = async (input) => {
      if (input.kind === "wait") return new Promise(() => {});
      if (input.kind === "list") return { connected: true, rooms: [pausedRoom] };
      if (input.kind === "read") return { connected: true, room: pausedRoom, messages };
      return { ...data, room: pausedRoom };
    };
    return <RoomsPanel request={paused} onConnect={() => {}} />;
  },
};

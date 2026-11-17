import type { RoomsPort } from "@openbot/contracts/rooms";
export const roomsPort =
  (serverId: string): RoomsPort =>
  (input) =>
    window.openbot.rooms.execute(input, serverId);

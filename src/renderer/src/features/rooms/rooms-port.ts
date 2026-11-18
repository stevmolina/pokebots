import type { RoomsPort } from "@openbot/contracts/rooms";
import type { AccountMode } from "../integrations/IntegrationProfiles";
export const roomsPort =
  (serverId: string, account: AccountMode): RoomsPort =>
  (input) =>
    window.openbot.rooms.execute({ ...input, account }, serverId);

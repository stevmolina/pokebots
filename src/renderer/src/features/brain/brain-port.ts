import type { OpenBotDesktopApi } from "@pokebots/contracts/ipc";

interface BrainPort {
  brain: OpenBotDesktopApi["brain"];
  agent: Pick<OpenBotDesktopApi["agent"], "listMcpServers">;
  openUrl: OpenBotDesktopApi["openUrl"];
}
export function brainPort(): BrainPort {
  return window.openbot;
}

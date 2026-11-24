import { agentWelcomeMessage } from "@pokebots/contracts/agent-welcome";
import { appLanguageOption } from "@pokebots/i18n/languages";
import type { FirstAgentDraft } from "@pokebots/ui/features/agents/FirstAgentSetup";
import { currentText } from "@pokebots/ui/text";

/**
 * The first message of a new agent. A host with `agent-welcome-v1` hides it and shows the agent's
 * welcome only. An older host shows it as the user's message, so it keeps the released text there.
 */
export function createAgentInitialMessage(draft: Pick<FirstAgentDraft, "purpose">, welcomeSupported: boolean): string {
  if (welcomeSupported) return agentWelcomeMessage({ language: appLanguageOption(currentText().locale()).label });
  const purpose = draft.purpose.trim();
  return purpose ? `Your ongoing role is: ${purpose}` : "Greet me briefly.";
}

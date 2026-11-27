import {
  type AgentProviderId,
  isManagedRuntimeProvider,
  type ManagedProviderId,
} from "@pokebots/contracts/agent-providers";
import type { AgentProviderStatus, ProviderRuntimeStatus } from "@pokebots/contracts/ipc";
import { sourceText } from "@pokebots/i18n/source";

/** The provider CLIs that a server downloads at start when it has none of them. */
export const SERVER_DEFAULT_PROVIDER_CLIS: readonly ManagedProviderId[] = [
  "claude",
  "codex",
  "cursor",
  "grok",
  "opencode",
];

const MISSING_CLI_MESSAGES: Partial<Record<ManagedProviderId, string>> = {
  claude: sourceText("error.provider.claudeMissing"),
  codex: sourceText("error.provider.codexMissing"),
};

/**
 * The default provider a host starts with when the user has not saved a choice yet.
 *
 * A server preinstalls OpenCode alongside the paid CLIs, so defaulting to `opencode` lets new
 * users run bots on free models immediately without a subscription. Once the user picks a paid
 * provider in setup or Settings, that saved preference takes over. Desktop apps keep `"codex"`.
 */
export function initialPreferredProvider(savedProvider: AgentProviderId | null, isServer: boolean): AgentProviderId {
  return savedProvider ?? (isServer ? "opencode" : "codex");
}

/**
 * Whether a provider row means the server has no CLI for this provider at all.
 *
 * Most providers report `not-installed`. Claude and Codex keep the legacy `error` state when
 * missing (`providerFailureStatus`), so match their missing-CLI message when no CLI resolved and
 * the managed runtime is still `not-downloaded`. A broken or timed-out system CLI keeps its own
 * message and is not overwritten.
 */
export function needsServerDefaultCliDownload(
  provider: Pick<AgentProviderStatus, "id" | "state" | "cliSource" | "version" | "message">,
  runtimePhase: ProviderRuntimeStatus["phase"] | undefined,
): boolean {
  if (!isManagedRuntimeProvider(provider.id) || !SERVER_DEFAULT_PROVIDER_CLIS.includes(provider.id)) return false;
  if (provider.state === "not-installed") return true;
  const missingMessage = MISSING_CLI_MESSAGES[provider.id];
  return (
    missingMessage !== undefined &&
    provider.state === "error" &&
    provider.cliSource === undefined &&
    provider.version === null &&
    provider.message === missingMessage &&
    runtimePhase === "not-downloaded"
  );
}

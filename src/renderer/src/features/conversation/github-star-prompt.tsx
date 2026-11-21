/** Always false while the upstream GitHub star toast is disabled in Pokebots. */
export function githubStarPromptShownThisSession(): boolean {
  return false;
}

/**
 * Disabled in Pokebots: do not prompt users to star the upstream repository on GitHub.
 */
export function noteAgentMessageSent(): void {
  // Pokebots does not show the upstream GitHub star toast.
}

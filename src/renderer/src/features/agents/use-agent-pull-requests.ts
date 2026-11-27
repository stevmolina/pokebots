import type { AgentPullRequestsMap } from "@pokebots/contracts/ipc";
import { createEffect, createSignal } from "solid-js";

const POLL_INTERVAL_MS = 2 * 60_000;
const DEBOUNCE_MS = 2_000;

/**
 * Lightweight cached polling of linked GitHub pull requests per agent.
 * The host caches GitHub PR state for 10 minutes (permanent once merged/closed), so polling every
 * 2 minutes and after agent activity updates stays responsive without spamming GitHub.
 */
export function createAgentPullRequestsPoll(options: {
  /** Key that changes when the server or agent activity changes (e.g. serverId + agent updatedAts). */
  activityKey: () => string;
  /** False when offline or when the host does not support `agent-pull-requests-v1`. */
  enabled: () => boolean;
  /** Reads the pull request map from the host. */
  load: () => Promise<AgentPullRequestsMap>;
}) {
  const [pullRequests, setPullRequests] = createSignal<AgentPullRequestsMap>({});
  let generation = 0;

  const refresh = () => {
    if (!options.enabled()) {
      setPullRequests({});
      return;
    }
    const token = ++generation;
    void options
      .load()
      .then((map) => {
        if (token === generation) setPullRequests(map);
      })
      .catch(() => {
        // Gracefully degrade when GitHub or the host endpoint is unavailable.
      });
  };

  createEffect(
    () => ({ enabled: options.enabled(), key: options.activityKey() }),
    ({ enabled }) => {
      if (!enabled) {
        setPullRequests({});
        return;
      }
      const debounce = setTimeout(refresh, DEBOUNCE_MS);
      const interval = setInterval(refresh, POLL_INTERVAL_MS);
      return () => {
        clearTimeout(debounce);
        clearInterval(interval);
      };
    },
  );

  // Initial load on mount when enabled.
  createEffect(
    () => options.enabled(),
    (enabled) => {
      if (enabled) refresh();
      else setPullRequests({});
    },
  );

  return pullRequests;
}

import type { Effect } from "effect";

/** One GitHub pull request that a thread names. */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

/** What GitHub says about a pull request. `unknown` when it could not be read now. */
export type PullRequestState = "open" | "merged" | "closed" | "unknown";

/**
 * Reads the state of a pull request for the automatic archive. The adapter owns the GitHub access, a
 * cache and a budget for each sweep; past the budget it answers `unknown`.
 */
export type PullRequestStates = (ref: PullRequestRef) => Effect.Effect<PullRequestState>;

/** A thread that names more pull requests than this is a review or a list: the pull request rule skips it. */
export const THREAD_PULL_REQUEST_LIMIT = 10;

const PULL_REQUEST_URL =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})\/pull\/(\d{1,9})(?![\d])/g;

export function pullRequestKey(ref: PullRequestRef): string {
  return `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.number}`;
}

/**
 * The distinct GitHub pull requests that these message texts link, in order of first mention. Null
 * when they link more than `THREAD_PULL_REQUEST_LIMIT`.
 */
export function threadPullRequests(texts: readonly string[]): PullRequestRef[] | null {
  const found = new Map<string, PullRequestRef>();
  for (const text of texts) {
    for (const match of text.matchAll(PULL_REQUEST_URL)) {
      const [, owner, repo, number] = match;
      if (!owner || !repo || !number || repo === "." || repo === "..") continue;
      const ref = { owner, repo: repo.replace(/\.git$/u, ""), number: Number(number) };
      found.set(pullRequestKey(ref), ref);
      if (found.size > THREAD_PULL_REQUEST_LIMIT) return null;
    }
  }
  return [...found.values()];
}

import type { AppFormat, AppTextKey, AppTranslate } from "@pokebots/i18n";

/**
 * Rules for when a finished agent stays in "Done" versus moving to "Settled":
 * 1. Inactivity timeout: after `settleAfterMs` (default 24h) without new activity, auto-settle.
 *    An open linked PR holds off the inactivity timer until the PR is no longer open.
 * 2. Manual settle: saved in `collapsedSectionIds` as `dock:settled:<agentId>@<settledAt>` so it
 *    syncs across devices alongside snoozes and open groups. Any new activity (`lastActivityAt >
 *    settledAt`, or working/waiting/unread) wakes the agent back up automatically.
 * 3. Open PR merge trigger: when all linked PRs for the agent are merged (and there is no newer
 *    activity after the merge), auto-settle.
 */

export const SIDEBAR_SETTLED_PREFIX = "dock:settled:";

export const SIDEBAR_AUTO_SETTLE_OPTIONS = ["1d", "3d", "7d", "manual"] as const;
export type SidebarAutoSettleOption = (typeof SIDEBAR_AUTO_SETTLE_OPTIONS)[number];

export const DEFAULT_SIDEBAR_AUTO_SETTLE: SidebarAutoSettleOption = "1d";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export const SIDEBAR_AUTO_SETTLE_LABEL = {
  "1d": "settings.autoSettle.1d",
  "3d": "settings.autoSettle.3d",
  "7d": "settings.autoSettle.7d",
  manual: "settings.autoSettle.manual",
} as const satisfies Record<SidebarAutoSettleOption, AppTextKey>;

/** The inactivity window in milliseconds for a chosen option, or null for manual-only. */
export function sidebarAutoSettleMs(option: SidebarAutoSettleOption | undefined): number | null {
  switch (option ?? DEFAULT_SIDEBAR_AUTO_SETTLE) {
    case "1d":
      return DAY_MS;
    case "3d":
      return 3 * DAY_MS;
    case "7d":
      return 7 * DAY_MS;
    case "manual":
      return null;
  }
}

/** An open GitHub pull request linked to an agent. */
export interface SidebarAgentOpenPullRequest {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/** Linked GitHub pull request state for one agent. */
export interface SidebarAgentPullRequestStatus {
  /** Currently open pull requests linked to this agent (primary/most recent first). */
  open: readonly SidebarAgentOpenPullRequest[];
  /** True when the agent had linked pull requests and every one of them is merged. */
  allMerged: boolean;
  /** Epoch milliseconds of the latest merge among linked PRs, when known. */
  mergedAt?: number | null | undefined;
}

/** Parses `dock:settled:<agentId>@<settledAt>`, or undefined for any other id. */
export function parseSidebarSettled(id: string): { agentId: string; settledAt: number } | undefined {
  if (!id.startsWith(SIDEBAR_SETTLED_PREFIX)) return undefined;
  const rest = id.slice(SIDEBAR_SETTLED_PREFIX.length);
  const at = rest.lastIndexOf("@");
  if (at <= 0) return undefined;
  const settledAt = Number(rest.slice(at + 1));
  return Number.isFinite(settledAt) ? { agentId: rest.slice(0, at), settledAt } : undefined;
}

export function sidebarSettledMarker(agentId: string, settledAt: number): string {
  return `${SIDEBAR_SETTLED_PREFIX}${agentId}@${Math.round(settledAt)}`;
}

/** The manual settle markers in `collapsedSectionIds`, keeping the latest timestamp per agent. */
export function sidebarSettledAgents(collapsedSectionIds: readonly string[]): Map<string, number> {
  const settled = new Map<string, number>();
  for (const id of collapsedSectionIds) {
    const parsed = parseSidebarSettled(id);
    if (!parsed) continue;
    const existing = settled.get(parsed.agentId);
    settled.set(parsed.agentId, existing === undefined ? parsed.settledAt : Math.max(existing, parsed.settledAt));
  }
  return settled;
}

export interface AgentSettleInput {
  /** Whether the agent has unread replies in its main chat or side threads. */
  unread: boolean;
  /** Latest activity timestamp in epoch ms (main chat or side threads), or null if never active. */
  lastActivityAt: number | null;
  /** Manual settle timestamp from `dock:settled:<agentId>@<ts>`, or undefined. */
  settledAt: number | undefined;
  /** Inactivity auto-settle window in ms, or null for Manual only. */
  settleAfterMs: number | null;
  /** Current time in epoch ms. */
  now: number;
  /** Linked GitHub PR status for this agent, if known. */
  pullRequests?: SidebarAgentPullRequestStatus | undefined;
}

export interface AgentSettleState {
  /** True when the agent belongs in "Done" (false => "Settled"). */
  inDone: boolean;
  /** Primary open PR to display in the sidebar row and chat header, if any. */
  openPullRequest: SidebarAgentOpenPullRequest | undefined;
  /** Milliseconds remaining until inactivity auto-settle, or null if held by PR, manual-only, or settled. */
  remainingMs: number | null;
}

/**
 * Evaluates whether an idle, non-waiting, non-snoozed agent belongs in "Done" or "Settled",
 * and what subtle status indicator (open PR or time left) its row should show.
 */
export function evaluateAgentSettle(input: AgentSettleInput): AgentSettleState {
  const openPullRequest = input.pullRequests?.open[0];

  // 1. Manual settle holds until new activity (newer timestamp or unread reply) wakes the bot.
  if (input.settledAt !== undefined) {
    const wokenByActivity = input.unread || (input.lastActivityAt !== null && input.lastActivityAt > input.settledAt);
    if (!wokenByActivity) {
      return { inDone: false, openPullRequest, remainingMs: null };
    }
  }

  // 2. Open PR merge trigger: when all linked PRs are merged and no newer activity followed the merge.
  if (input.pullRequests && openPullRequest === undefined && input.pullRequests.allMerged) {
    const mergedAt = input.pullRequests.mergedAt;
    const newerActivityAfterMerge =
      mergedAt !== null && mergedAt !== undefined && input.lastActivityAt !== null && input.lastActivityAt > mergedAt;
    if (!newerActivityAfterMerge) {
      return { inDone: false, openPullRequest: undefined, remainingMs: null };
    }
  }

  // 3. An open PR holds off the inactivity timeout.
  if (openPullRequest !== undefined) {
    return { inDone: true, openPullRequest, remainingMs: null };
  }

  // 4. Unread replies always keep the agent in "Done".
  if (input.unread) {
    const remainingMs =
      input.settleAfterMs !== null && input.lastActivityAt !== null
        ? Math.max(0, input.settleAfterMs - (input.now - input.lastActivityAt))
        : null;
    return { inDone: true, openPullRequest: undefined, remainingMs: remainingMs === 0 ? null : remainingMs };
  }

  // Never-active agents without unread replies stay in "Settled".
  if (input.lastActivityAt === null) {
    return { inDone: false, openPullRequest: undefined, remainingMs: null };
  }

  // 5. Manual only never auto-settles by inactivity.
  if (input.settleAfterMs === null) {
    return { inDone: true, openPullRequest: undefined, remainingMs: null };
  }

  // 6. Inactivity timeout.
  const elapsed = input.now - input.lastActivityAt;
  if (elapsed >= input.settleAfterMs) {
    return { inDone: false, openPullRequest: undefined, remainingMs: null };
  }
  return {
    inDone: true,
    openPullRequest: undefined,
    remainingMs: input.settleAfterMs - elapsed,
  };
}

/** Parses an ISO timestamp string to epoch ms, or null when missing/invalid. */
export function parseActivityTimestamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Latest activity time across an agent's main chat and side threads. */
export function latestAgentActivityAt(
  agentUpdatedAt: string | null | undefined,
  latestThreadUpdatedAt?: string | null | undefined,
): number | null {
  const main = parseActivityTimestamp(agentUpdatedAt);
  const thread = parseActivityTimestamp(latestThreadUpdatedAt);
  if (main === null) return thread;
  if (thread === null) return main;
  return Math.max(main, thread);
}

/** Short remaining time until auto-settle: e.g. "45m", "18h", "2d". */
export function formatSettleTimeLeft(remainingMs: number, t: AppTranslate, format: AppFormat): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (minutes < 60) return t("sidebar.lanes.minutes", { value: format.number(minutes) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("sidebar.lanes.hours", { value: format.number(hours) });
  return t("sidebar.dock.days", { value: format.number(Math.round(hours / 24)) });
}

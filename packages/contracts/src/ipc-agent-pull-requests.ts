import { isDynamicRecord, isString } from "./runtime-values";

/** One open GitHub pull request linked to an agent. */
export interface AgentOpenPullRequest {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/** Linked GitHub pull request status for one agent. */
export interface AgentPullRequestStatus {
  open: AgentOpenPullRequest[];
  allMerged: boolean;
  mergedAt: number | null;
}

/** Agent id -> linked GitHub pull request status. */
export type AgentPullRequestsMap = Record<string, AgentPullRequestStatus>;

function parseOpenPullRequest(value: unknown): AgentOpenPullRequest {
  if (
    !isDynamicRecord(value) ||
    !isString(value.owner) ||
    !isString(value.repo) ||
    typeof value.number !== "number" ||
    !Number.isSafeInteger(value.number) ||
    value.number <= 0 ||
    !isString(value.url)
  ) {
    throw new Error("Invalid open pull request.");
  }
  return {
    owner: value.owner,
    repo: value.repo,
    number: value.number,
    url: value.url,
  };
}

function parseAgentPullRequestStatus(value: unknown): AgentPullRequestStatus {
  if (
    !isDynamicRecord(value) ||
    !Array.isArray(value.open) ||
    typeof value.allMerged !== "boolean" ||
    (value.mergedAt !== null && (typeof value.mergedAt !== "number" || !Number.isFinite(value.mergedAt)))
  ) {
    throw new Error("Invalid agent pull request status.");
  }
  return {
    open: value.open.map(parseOpenPullRequest),
    allMerged: value.allMerged,
    mergedAt: value.mergedAt,
  };
}

export function parseAgentPullRequestsMap(value: unknown): AgentPullRequestsMap {
  if (!isDynamicRecord(value)) throw new Error("Invalid agent pull requests map.");
  const result: AgentPullRequestsMap = {};
  for (const [agentId, status] of Object.entries(value)) {
    if (!agentId) continue;
    result[agentId] = parseAgentPullRequestStatus(status);
  }
  return result;
}

/** Parses the Team API `{ agents: [...] }` wire response into an `AgentPullRequestsMap`. */
export function parseAgentPullRequestsResponse(value: unknown): AgentPullRequestsMap {
  if (!isDynamicRecord(value) || !Array.isArray(value.agents)) return {};
  const result: AgentPullRequestsMap = {};
  for (const entry of value.agents) {
    if (!isDynamicRecord(entry) || !isString(entry.agentId) || !entry.agentId) continue;
    result[entry.agentId] = parseAgentPullRequestStatus(entry);
  }
  return result;
}

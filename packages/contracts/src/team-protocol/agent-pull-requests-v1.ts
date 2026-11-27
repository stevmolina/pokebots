// Frozen optional agent-pull-requests-v1 wire contract. Keep IPC types and limits out of this file.
//
// Returns linked GitHub pull request status for each agent the caller can see, so clients can show
// open PR chips and auto-settle bots when their linked PRs merge.
import {
  adminRoute,
  boolean,
  count,
  empty,
  fields,
  identifier,
  list,
  nullable,
  type OptionalRouteCodec,
  string,
} from "./admin-wire";

export const AGENT_PULL_REQUESTS_CAPABILITY = "agent-pull-requests-v1";

export const AGENT_PULL_REQUESTS_ROUTES = {
  list: "/v1/agents/pull-requests",
} as const;

const openPullRequest = fields({
  owner: string(128),
  repo: string(256),
  number: count,
  url: string(512),
});

const agentEntry = fields({
  agentId: identifier,
  open: list(openPullRequest, 20),
  allMerged: boolean,
  mergedAt: nullable(count),
});

export const AGENT_PULL_REQUESTS_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [AGENT_PULL_REQUESTS_ROUTES.list, adminRoute(empty, fields({ agents: list(agentEntry, 500) }))],
]);

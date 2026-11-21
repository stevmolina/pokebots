// The GitHub App that the built-in GitHub connection signs in to.
//
// `bun scripts/create-github-app.ts` creates the app and prints its Client ID. A Client ID is
// public: device flow and refresh need nothing else, and the client secret never ships.

import {
  type EnvironmentRecord,
  GITHUB_APP_SLUG_ENV,
  GITHUB_CLIENT_ID_ENV,
  resolveCompatEnv,
} from "@openbot/contracts/pokebots-env";

/** The GitHub App "OpenBotGit" of `nightly-labs`. With no Client ID, the connection is not offered. */
const GITHUB_APP_CLIENT_ID = "Iv23lik5pzHz70cb0RUL";
const GITHUB_APP_SLUG = "openbotgit";

export interface GitHubAppConfig {
  clientId: string;
  slug: string;
}

/** The configured app, or null. `POKEBOTS_GITHUB_*` / `OPENBOT_GITHUB_*` override it. */
export function githubAppConfig(env: EnvironmentRecord = process.env): GitHubAppConfig | null {
  const clientId = resolveCompatEnv(env, GITHUB_CLIENT_ID_ENV) ?? GITHUB_APP_CLIENT_ID;
  const slug = resolveCompatEnv(env, GITHUB_APP_SLUG_ENV) ?? GITHUB_APP_SLUG;
  if (!/^[A-Za-z0-9.]+$/u.test(clientId) || !/^[a-z0-9-]+$/u.test(slug)) return null;
  return { clientId, slug };
}

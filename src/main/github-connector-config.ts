// The GitHub App that the built-in GitHub connection signs in to.
//
// `bun scripts/create-github-app.ts` creates the app and prints its Client ID. A Client ID is
// public: device flow and refresh need nothing else, and the client secret never ships.

/** The GitHub App "PokebotsApp" of `stevmolina`. With no Client ID, the connection is not offered. */
const GITHUB_APP_CLIENT_ID = "Iv23liqjDfmQETt7RBIr";
const GITHUB_APP_SLUG = "pokebotsapp";

/**
 * The Client ID of the app that every earlier build signed in to, "OpenBotGit". A stored sign-in with no
 * `clientId` was made with it. GitHub refuses to refresh a token of one app with the Client ID of another.
 */
export const LEGACY_GITHUB_APP_CLIENT_ID = "Iv23lik5pzHz70cb0RUL";

export interface GitHubAppConfig {
  clientId: string;
  slug: string;
}

/** The configured app, or null. `OPENBOT_GITHUB_CLIENT_ID` and `OPENBOT_GITHUB_APP_SLUG` override it. */
export function githubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig | null {
  const clientId = env.OPENBOT_GITHUB_CLIENT_ID?.trim() || GITHUB_APP_CLIENT_ID;
  const slug = env.OPENBOT_GITHUB_APP_SLUG?.trim() || GITHUB_APP_SLUG;
  if (!/^[A-Za-z0-9.]+$/u.test(clientId) || !/^[a-z0-9-]+$/u.test(slug)) return null;
  return { clientId, slug };
}

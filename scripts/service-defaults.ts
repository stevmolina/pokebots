// The account service defaults of a custom desktop build.
//
// `scripts/custom-build-install.sh` sets `OPENBOT_BRAND_AUTH_API_URL` and `OPENBOT_BRAND_SIGNAL_URL`
// when it builds the Pokebots app. The desktop build (`electron.vite.config.ts`) then makes the main
// process use them as if `OPENBOT_AUTH_API_URL` and `OPENBOT_REMOTE_SIGNAL_URL` were set when the app
// starts. A variable set at start still wins. Without the two settings there is no plugin and the
// build is the same as a stock build.
//
// This is all that is left of the build-time brand layer. The source says "Pokebots", so nothing
// rewrites text any more, and `OPENBOT_BRAND_NAME` is ignored: a build that still sets it works.

/** The account service that a custom desktop build uses when nothing else is set at start. */
export const BRAND_AUTH_API_URL_ENV = "OPENBOT_BRAND_AUTH_API_URL";
/** The Signal URL that goes with `OPENBOT_BRAND_AUTH_API_URL`. */
export const BRAND_SIGNAL_URL_ENV = "OPENBOT_BRAND_SIGNAL_URL";

export interface ServiceDefaults {
  readonly authApiUrl: string | null;
  readonly signalUrl: string | null;
}

/** The service defaults of this build, or null when none is set. */
export function readServiceDefaults(env: Readonly<Record<string, string | undefined>>): ServiceDefaults | null {
  const authApiUrl = readUrl(env, BRAND_AUTH_API_URL_ENV, "https:");
  const signalUrl = readUrl(env, BRAND_SIGNAL_URL_ENV, "wss:");
  if (signalUrl && !authApiUrl) throw new Error(`${BRAND_SIGNAL_URL_ENV} needs ${BRAND_AUTH_API_URL_ENV}.`);
  return authApiUrl || signalUrl ? { authApiUrl, signalUrl } : null;
}

function readUrl(env: Readonly<Record<string, string | undefined>>, variable: string, protocol: string): string | null {
  const value = env[variable]?.trim() ?? "";
  if (value === "") return null;
  const url = new URL(value);
  if (url.protocol !== protocol || url.username !== "" || url.password !== "") {
    throw new Error(`${variable} must be a ${protocol} URL without credentials.`);
  }
  return url.href.replace(/\/$/, "");
}

/**
 * Statements that set the account service of a custom build when the start did not. They go before the
 * imports of `src/main/index.ts`. The first import resolves explicit aliases before these statements
 * run. The endpoint readers run later.
 */
function accountDefaults(defaults: ServiceDefaults): string {
  const lines: string[] = [];
  if (defaults.authApiUrl) lines.push(`process.env.OPENBOT_AUTH_API_URL ??= ${JSON.stringify(defaults.authApiUrl)};`);
  if (defaults.signalUrl) {
    lines.push(`process.env.OPENBOT_REMOTE_SIGNAL_URL ??= ${JSON.stringify(defaults.signalUrl)};`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** The source of the main entry with the defaults before it, or null for any other module. */
export function withServiceDefaults(path: string, code: string, defaults: ServiceDefaults): string | null {
  return path === "src/main/index.ts" ? accountDefaults(defaults) + code : null;
}

/** The part of a Vite plugin that this file uses, so that it needs no Vite dependency. */
interface ServiceDefaultsPlugin {
  readonly name: string;
  readonly enforce: "pre";
  transform(code: string, id: string): { code: string; map: null } | null;
}

/** The repository path of a module id, or null outside the repository. */
function repositoryPath(id: string, root: string): string | null {
  const path = id.split("?")[0]?.replaceAll("\\", "/") ?? "";
  const prefix = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

/** One Vite plugin when a service default is set, none when it is not. `root` is the repository root. */
export function serviceDefaultsPlugins(
  root: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ServiceDefaultsPlugin[] {
  const defaults = readServiceDefaults(env);
  if (!defaults) return [];
  return [
    {
      name: "pokebots-service-defaults",
      enforce: "pre",
      transform(code, id) {
        const path = repositoryPath(id, root);
        const output = path ? withServiceDefaults(path, code, defaults) : null;
        return output === null ? null : { code: output, map: null };
      },
    },
  ];
}

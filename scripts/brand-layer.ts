// The brand layer of Steven's fork: a build-time step that shows another product name, such as
// "Pokebots", in place of "OpenBot", without an edit to the source text.
//
// The fork merges the official OpenBot every morning, and "OpenBot" is on about 56,000 lines. An
// edit of those lines would conflict at each merge. So the source stays as it is, and the Vite
// builds of the desktop app (`electron.vite.config.ts`) and of the account Worker
// (`apps/auth-api/vite.config.ts`) change the text while they bundle it.
//
// The step is on only when `OPENBOT_BRAND_NAME` is set at build time. Without it, `brandPlugins()`
// gives no plugin, so the Vite configuration and the output are the same as without this file.
// `scripts/custom-build-install.sh` sets it for the desktop app. For the self-hosted account Worker,
// set it for the deploy of `docs/self-hosting.md`, for example in `apps/auth-api/.env.self-hosted`:
//   OPENBOT_BRAND_NAME=Pokebots bunx dotenvx run -f .env.self-hosted -- bun ../../scripts/deploy-auth-api.ts
//
// What it changes:
// - Each value in the `@openbot/i18n` catalogs (`packages/i18n/src/messages`). Keys stay, and so do
//   the lowercase `openbot.run` and `openbot://` addresses, identifiers and environment names,
//   because the replacement is case-sensitive. The phrases in `KEPT_PHRASES` stay too: they name a
//   thing that keeps its real name, such as the vault "Shared with OpenBot" that the code makes.
// - The few visible literals outside the catalogs, in `LITERAL_RULES`.
// - The `<title>` and `<noscript>` text of the desktop HTML pages.
// - The account service defaults of the desktop main process, when `OPENBOT_BRAND_AUTH_API_URL` and
//   `OPENBOT_BRAND_SIGNAL_URL` are set. The app then uses them as if `OPENBOT_AUTH_API_URL` and
//   `OPENBOT_REMOTE_SIGNAL_URL` were set when it starts. A variable set at start still wins.
//
// - The installable web app of the account Worker: the name in `site.webmanifest`, and the icons
//   and favicons next to it, from `build/custom/web/` (or the folder in `OPENBOT_BRAND_WEB_ICONS`).
//   This runs after the build writes the static files, so `vite dev` still shows the OpenBot icons.
//
// It does not change `app.setName("OpenBot")` or anything that names the data folder, the keychain
// item "OpenBot Safe Storage" or the local signing certificate: a new name there loses the data or
// the macOS privacy grants.

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The build-time setting that turns the brand layer on, and the product name it shows. */
export const BRAND_NAME_ENV = "OPENBOT_BRAND_NAME";
/** The account service that a branded desktop build uses when nothing else is set at start. */
export const BRAND_AUTH_API_URL_ENV = "OPENBOT_BRAND_AUTH_API_URL";
/** The Signal URL that goes with `OPENBOT_BRAND_AUTH_API_URL`. */
export const BRAND_SIGNAL_URL_ENV = "OPENBOT_BRAND_SIGNAL_URL";

export interface BrandSettings {
  readonly name: string;
  readonly authApiUrl: string | null;
  readonly signalUrl: string | null;
}

/** The brand settings of this build, or null when the brand layer is off. */
export function readBrandSettings(env: Readonly<Record<string, string | undefined>>): BrandSettings | null {
  const name = env[BRAND_NAME_ENV]?.trim() ?? "";
  if (name === "") return null;
  // The name goes into JavaScript strings and HTML text, so it has no quote, slash or angle bracket.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u.test(name)) {
    throw new Error(`${BRAND_NAME_ENV} must be 1 to 40 letters, digits, spaces, dots, dashes or underscores.`);
  }
  const authApiUrl = readUrl(env, BRAND_AUTH_API_URL_ENV, "https:");
  const signalUrl = readUrl(env, BRAND_SIGNAL_URL_ENV, "wss:");
  if (signalUrl && !authApiUrl) throw new Error(`${BRAND_SIGNAL_URL_ENV} needs ${BRAND_AUTH_API_URL_ENV}.`);
  return { name, authApiUrl, signalUrl };
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
 * Phrases that keep "OpenBot": names of things outside this build that the text points the reader
 * to. The code makes the vault and the folder "Shared with OpenBot", the GitHub App and the phone app
 * keep their names, and "OpenBot Shared" is the `~/OpenBot/Shared` folder.
 */
const KEPT_PHRASES = /(?<!Shared with )OpenBot(?! GitHub App| Mobile\b| Shared\b)/g;

/** The product word in a piece of text, outside the kept phrases. */
export function brandText(text: string, name: string): string {
  return text.replace(KEPT_PHRASES, name);
}

/** The same as `brandText`, but only where "OpenBot" is a whole word. For code outside the catalogs. */
function brandWord(text: string, name: string): string {
  return text.replace(/(?<![\w$])(?<!Shared with )OpenBot(?![\w$])(?! GitHub App| Mobile\b| Shared\b)/g, name);
}

/**
 * Comments and string literals, left to right. A comment comes first, so an apostrophe in a comment
 * does not start a string; a string comes first, so `//` in a URL does not start a comment.
 */
const TOKENS = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/**
 * Brands the string values of one TypeScript module. A string followed by `:` is an object key, such
 * as a catalog key, and stays. Comments stay too.
 */
export function brandStringValues(code: string, brand: (text: string) => string): { code: string; changed: number } {
  let changed = 0;
  const output = code.replace(TOKENS, (token: string, offset: number) => {
    if (token.startsWith("//") || token.startsWith("/*")) return token;
    if (/^\s*:/.test(code.slice(offset + token.length, offset + token.length + 40))) return token;
    const branded = brand(token);
    if (branded !== token) changed += 1;
    return branded;
  });
  return { code: output, changed };
}

/** One exact literal outside the catalogs that a reader sees, and what it becomes. */
interface LiteralRule {
  /** The path from the repository root. */
  readonly file: string;
  readonly find: string;
  readonly replace: (name: string) => string;
}

/**
 * The visible literals outside the catalogs. Each `find` must be in its file: `brandPlugins` warns
 * during the build when an upstream change moved one, and `scripts/pokebots-brand-e2e.ts` fails.
 */
export const LITERAL_RULES: readonly LiteralRule[] = [
  {
    file: "packages/contracts/src/feedback.ts",
    find: 'export const FEEDBACK_REPOSITORY = "nightly-labs/openbot";',
    replace: (name) =>
      name === "Pokebots"
        ? 'export const FEEDBACK_REPOSITORY = "stevmolina/pokebots";'
        : 'export const FEEDBACK_REPOSITORY = "nightly-labs/openbot";',
  },
  {
    file: "apps/auth-api/src/lib/site-metadata.ts",
    find: 'export const OPENBOT_SITE_URL = "https://openbot.run/";',
    replace: (name) =>
      `export const OPENBOT_SITE_URL = ${JSON.stringify(name === "Pokebots" ? "https://pokebots.xyz/" : "https://openbot.run/")};`,
  },
  {
    file: "packages/brand/src/pokebots-avatar.ts",
    find: "export const POKEBOTS_LANDING_ARTWORK = false;",
    replace: (name) => `export const POKEBOTS_LANDING_ARTWORK = ${name === "Pokebots"};`,
  },
  // Desktop renderer: the app name in System Settings, the setup error heading, and the share card.
  {
    file: "packages/ui/src/features/account/AccountLogin.tsx",
    find: 'const PRODUCT_NAME = "OpenBot";',
    replace: (name) => `const PRODUCT_NAME = ${JSON.stringify(name)};`,
  },
  {
    file: "packages/ui/src/features/account/LanguageWheel.tsx",
    find: 'const PRODUCT_NAME = "OpenBot";',
    replace: (name) => `const PRODUCT_NAME = ${JSON.stringify(name)};`,
  },
  // The included models in the provider lists, and the version names in Settings > Updates.
  {
    file: "packages/contracts/src/agent-providers.ts",
    find: '"Included with OpenBot"',
    replace: (name) => JSON.stringify(`Included with ${name}`),
  },
  {
    file: "packages/ui/src/features/settings/stores/updates-store.ts",
    find: "`OpenBot v${",
    replace: (name) => `\`${name} v\${`,
  },
  // Server names: the name a new server takes, and the name of a server that has none.
  {
    file: "src/renderer/src/features/servers/server-settings.tsx",
    find: 'const FALLBACK_SERVER_NAME = "OpenBot";',
    replace: (name) => `const FALLBACK_SERVER_NAME = ${JSON.stringify(name)};`,
  },
  {
    file: "packages/ui/src/user-avatar.tsx",
    find: '|| "OpenBot";',
    replace: (name) => `|| ${JSON.stringify(name)};`,
  },
  {
    file: "packages/contracts/src/ipc-mcp-servers.ts",
    find: "`OpenBot already uses the name ",
    replace: (name) => `\`${name} already uses the name `,
  },
  {
    file: "src/renderer/src/features/provider-updates/provider-runtime-store.ts",
    find: `"OpenBot does not manage this provider's CLI."`,
    replace: (name) => JSON.stringify(`${name} does not manage this provider's CLI.`),
  },
  {
    file: "src/main/ipc/provider-handlers.ts",
    find: `"OpenBot does not manage this provider's CLI."`,
    replace: (name) => JSON.stringify(`${name} does not manage this provider's CLI.`),
  },
  // The toasts that ask the user to follow OpenBot on social networks and to star it on GitHub: a
  // branded build never shows them.
  {
    file: "src/renderer/src/features/conversation/social-follow-prompt.tsx",
    find: "const MAX_SHOWS = RETRY_DAYS.length + 1;",
    replace: () => "const MAX_SHOWS = 0;",
  },
  {
    file: "src/renderer/src/features/conversation/github-star-prompt.tsx",
    find: "export function noteAgentMessageSent(): void {",
    replace: () => "export function noteAgentMessageSent(): void {\n  return;",
  },
];

/**
 * Modules outside the catalogs whose string values are all branded: shared link errors and plugin
 * descriptions. Their only "OpenBot" strings are text that a
 * reader sees, never a path, a header or an identifier.
 */
export const BRANDED_MODULES: readonly string[] = [
  "packages/contracts/src/invite-links.ts",
  "packages/contracts/src/marketplace-links.ts",
  "packages/contracts/src/plugin-links.ts",
  "packages/contracts/src/agent-template-links.ts",
  "src/renderer/src/features/settings/marketplace-plugin-catalog.ts",
];

/**
 * The release notes of the What's New dialog: the English file and one file per language. The app
 * loads them by URL (`?url&no-inline`), so the bundler copies them without a transform, and
 * `brandReleaseNotesOutput` brands the copies after the build writes them.
 */
export const RELEASE_NOTES_FILES =
  /^src\/renderer\/src\/features\/updates\/(whats-new-releases|whats-new\/[a-z]{2})\.json$/;

const CATALOG_DIRECTORY = "packages/i18n/src/messages/";

/** Where a module id is, from the repository root, or null outside it. */
function repositoryPath(id: string, root: string): string | null {
  const path = id.split("?")[0]?.replaceAll("\\", "/") ?? "";
  const prefix = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

export interface BrandTransformResult {
  readonly code: string;
  /** The literal rules of this file that found nothing. */
  readonly missing: readonly string[];
}

/** The branded source of one module, or null when the brand layer does not change it. */
export function brandModule(path: string, code: string, settings: BrandSettings): BrandTransformResult | null {
  if (path.startsWith(CATALOG_DIRECTORY) && path.endsWith(".ts")) {
    const result = brandStringValues(code, (text) => brandText(text, settings.name));
    return result.changed === 0 ? null : { code: result.code, missing: [] };
  }
  let output = code;
  const missing: string[] = [];
  if (BRANDED_MODULES.includes(path)) output = brandStringValues(output, (text) => brandWord(text, settings.name)).code;
  for (const rule of LITERAL_RULES) {
    if (rule.file !== path) continue;
    if (!output.includes(rule.find)) {
      missing.push(rule.find);
      continue;
    }
    output = output.replaceAll(rule.find, rule.replace(settings.name));
  }
  if (path === "src/main/index.ts") output = accountDefaults(settings) + output;
  return output === code && missing.length === 0 ? null : { code: output, missing };
}

/**
 * Statements that set the account service of a branded build when the start did not. They go before
 * the imports of `src/main/index.ts`. The first import resolves explicit aliases before these
 * statements run. The endpoint readers run later.
 */
function accountDefaults(settings: BrandSettings): string {
  const lines: string[] = [];
  if (settings.authApiUrl) lines.push(`process.env.OPENBOT_AUTH_API_URL ??= ${JSON.stringify(settings.authApiUrl)};`);
  if (settings.signalUrl)
    lines.push(`process.env.OPENBOT_REMOTE_SIGNAL_URL ??= ${JSON.stringify(settings.signalUrl)};`);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** The HTML of a desktop page with the product name in its title and its no-script text. */
export function brandHtml(html: string, settings: BrandSettings): string {
  return html.replace(/(<title>|<noscript>)(?:OpenBot|Pokebots)/g, (_match, tag: string) => `${tag}${settings.name}`);
}

/** The folder of web icons that replaces the account Worker's own, from the repository root. */
export const BRAND_WEB_ICONS_ENV = "OPENBOT_BRAND_WEB_ICONS";
const DEFAULT_WEB_ICONS = "build/custom/web";
/** The static files of the installable web app that the brand folder can replace. */
export const WEB_ICON_FILES = [
  "favicon.ico",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "icon-192x192.png",
  "icon-512x512.png",
  "icon-maskable-192x192.png",
  "icon-maskable-512x512.png",
] as const;
const WEB_MANIFEST = "site.webmanifest";
const WEB_DESCRIPTION = "Bots with their own computers, in chats, rooms, and calls.";

/** The web app manifest with the product name. Its icon paths stay, because the files keep their names. */
export function brandWebManifest(manifest: string, settings: BrandSettings): string {
  const fields = new Map([
    ["name", settings.name],
    ["short_name", settings.name],
    ["description", WEB_DESCRIPTION],
  ]);
  // The manifest's icons have no such fields, so only the top-level values change.
  return `${JSON.stringify(
    JSON.parse(manifest, (key, value) => fields.get(key) ?? value),
    null,
    2,
  )}\n`;
}

/**
 * Brands the installable web app in a build output folder. Only a folder that holds the manifest is
 * a web app, so the desktop and Worker outputs stay as they are. Returns the files that changed.
 */
export function brandWebOutput(outDir: string, root: string, settings: BrandSettings, iconFolder: string): string[] {
  const manifestPath = join(outDir, WEB_MANIFEST);
  if (!existsSync(manifestPath)) return [];
  writeFileSync(manifestPath, brandWebManifest(readFileSync(manifestPath, "utf8"), settings));
  const changed: string[] = [WEB_MANIFEST];
  const icons = resolve(root, iconFolder);
  for (const file of WEB_ICON_FILES) {
    const source = join(icons, file);
    if (!existsSync(source)) continue;
    copyFileSync(source, join(outDir, file));
    changed.push(file);
  }
  return changed;
}

/** The release notes with the product name in each string value. Keys and kept phrases stay. */
export function brandReleaseNotes(json: string, settings: BrandSettings): string {
  return brandStringValues(json, (text) => brandText(text, settings.name)).code;
}

/** A What's New file: a list of releases, each with its version, notices and groups. */
function isReleaseNotes(json: string): boolean {
  return /^\s*\[\s*\{\s*"version"/.test(json) && json.includes('"notices"') && json.includes('"groups"');
}

/**
 * Brands the What's New files in the `assets` folder of a build output. They are found by their
 * shape, because the bundler names them after the language and a hash. Returns the files that changed.
 */
export function brandReleaseNotesOutput(outDir: string, settings: BrandSettings): string[] {
  const assets = join(outDir, "assets");
  if (!existsSync(assets)) return [];
  const changed: string[] = [];
  for (const file of readdirSync(assets)) {
    if (!file.endsWith(".json")) continue;
    const path = join(assets, file);
    const json = readFileSync(path, "utf8");
    if (!isReleaseNotes(json)) continue;
    const branded = brandReleaseNotes(json, settings);
    if (branded === json) continue;
    writeFileSync(path, branded);
    changed.push(file);
  }
  return changed;
}

/** The part of a Vite plugin that this layer uses, so that this file needs no Vite dependency. */
interface BrandPlugin {
  readonly name: string;
  readonly enforce: "pre";
  transform(this: { warn(message: string): void }, code: string, id: string): { code: string; map: null } | null;
  transformIndexHtml(html: string): string;
  writeBundle(this: { warn(message: string): void }, options: { dir?: string | undefined }): void;
}

/**
 * The Vite plugins of the brand layer: one when `OPENBOT_BRAND_NAME` is set, none when it is not.
 * `root` is the repository root, so that the plugin finds the same files from each Vite config.
 */
export function brandPlugins(
  root: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): BrandPlugin[] {
  const settings = readBrandSettings(env);
  if (!settings) return [];
  return [
    {
      name: "openbot-brand-layer",
      enforce: "pre",
      transform(code, id) {
        const path = repositoryPath(id, root);
        if (!path) return null;
        const result = brandModule(path, code, settings);
        if (!result) return null;
        for (const find of result.missing) {
          this.warn(`The brand layer did not find ${JSON.stringify(find)} in ${path}. Update LITERAL_RULES.`);
        }
        return { code: result.code, map: null };
      },
      transformIndexHtml: (html) => brandHtml(html, settings),
      writeBundle(options) {
        if (!options.dir) return;
        const iconFolder = env[BRAND_WEB_ICONS_ENV]?.trim() || DEFAULT_WEB_ICONS;
        brandReleaseNotesOutput(options.dir, settings);
        const changed = brandWebOutput(options.dir, root, settings, iconFolder);
        if (changed.length === 1) this.warn(`The brand layer found no web icons in ${iconFolder}.`);
      },
    },
  ];
}

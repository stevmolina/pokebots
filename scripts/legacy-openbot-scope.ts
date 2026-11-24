// TEMPORARY. Remove once no open branch imports `@openbot/<package>`.
//
// The workspace packages are now `@pokebots/<package>`. Unmerged branches still add new
// `@openbot/<package>` imports, so the root `package.json` keeps one alias per package:
// `"@openbot/x": "workspace:@pokebots/x@*"`. Bun links each alias into `node_modules/@openbot/`,
// and TypeScript, Vite, Metro and Bun resolve the old name through that link, with no per-tool
// alias. Electron's main build bundles workspace sources, so `electron.vite.config.ts` reads this
// list to bundle the old names too.
//
// To remove: delete this file, the `@openbot/*` lines in the root `package.json` (keep
// `@openbot/logging`: released migrations import it), the import in `electron.vite.config.ts`,
// and run `bun install`.

/** The workspace packages that have an `@openbot/<package>` alias, without the scope. */
export const LEGACY_SCOPE_PACKAGES = [
  "auth-api",
  "brand",
  "contracts",
  "i18n",
  "mobile",
  "mobile-updates",
  "remote-api",
  "site-router",
  "status",
  "team-client",
  "telemetry",
  "ui",
  "user-errors",
  "whatsapp",
] as const;

/** The old specifiers, for example `@openbot/contracts`. */
export const LEGACY_SCOPE_NAMES: readonly string[] = LEGACY_SCOPE_PACKAGES.map((name) => `@openbot/${name}`);

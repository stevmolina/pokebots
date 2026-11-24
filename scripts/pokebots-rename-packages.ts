// Renames the 15 private workspace packages from `@openbot/*` to `@pokebots/*`, the same way the
// reviewed rename branch did, and can be run again at any time. A second run changes nothing.
//
//   bun scripts/pokebots-rename-packages.ts              rewrite the checkout, then sort and wrap imports
//   bun scripts/pokebots-rename-packages.ts --check      change nothing; exit 1 when a rewrite is pending
//   bun scripts/pokebots-rename-packages.ts --no-format  skip the Biome step (import order and line wrap)
//   bun scripts/pokebots-rename-packages.ts --root <dir> work on another checkout of this repository
//   bun scripts/pokebots-rename-packages.ts --report <file>  where to write the JSON report
//
// After a merge of `main`, or on a branch that still uses the old names: run this script and
// `scripts/pokebots-rename-catalogs.ts`, then `bun install`, then commit. See
// `docs/custom-fork-sync.md#apply-the-pokebots-rename-scripts-to-a-branch`.
//
// What it does:
// 1. Rewrites `@openbot/<package>` to `@pokebots/<package>` in every tracked text file, for the
//    packages in `PACKAGES` and the two build aliases in `ALIASED_MODULES`: imports, `package.json`, tsconfig paths, build and lint config, scripts,
//    documentation and agent skills.
// 2. Keeps what must keep the old name (see `SKIPPED_PATHS` and the tag rule below).
// 3. Adds the logging alias: released SQLite migrations import `@openbot/logging`, so the root
//    `package.json` maps that name to the same workspace package, and the Electron build bundles both.
// 4. Rewrites `bun.lock` as text: the new names, the alias, and Bun's own sort order for the entries
//    that moved. Bun cannot do this itself: when a workspace changes its name, `bun install` ignores the
//    lockfile and resolves every version again. A text rewrite keeps each resolved version.
// 5. Runs Biome on the rewritten source files, because the longer scope changes import order and
//    which import lists need wrapping.
// 6. Writes a JSON report with the files changed, the exceptions kept and the aliases added.
//
// What it keeps:
// - Effect service tags such as `"@openbot/auth-api/AuthDependencies"`: a quoted string with one
//   capitalised name after the package. The tag is an identity at runtime, not an import.
// - Frozen SQLite migrations (`src/backend/migrations/`) and the checker that enforces their import
//   list: a released migration keeps its exact source and imports `@openbot/logging`.
// - Catalog comments (`packages/i18n/src/messages/`), which the catalog script and the brand layer own.
// - Historical plans (`plans/`).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/** The workspace packages that take the new scope, by their name without the scope. */
export const PACKAGES = [
  "auth-api",
  "brand",
  "contracts",
  "i18n",
  "logging",
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

/** Paths that keep the old scope, with the reason. A path ending in `/` is a folder. */
export const SKIPPED_PATHS: readonly { readonly path: string; readonly reason: string }[] = [
  {
    path: "src/backend/migrations/",
    reason: "Released SQLite migrations are frozen. They import `@openbot/logging` and name old packages in comments.",
  },
  {
    path: "scripts/frozen-migrations.ts",
    reason: "The frozen-migration import list. It allows `@openbot/logging`, which migrations still import.",
  },
  {
    path: "scripts/check-frozen-migrations.test.ts",
    reason: "Fixtures for the frozen-migration import list. They test the old specifier.",
  },
  {
    path: "packages/i18n/src/messages/",
    reason: "Catalog files. Only comments name the old packages. `pokebots-rename-catalogs.ts` owns this folder.",
  },
  { path: "plans/", reason: "Historical plans. They describe the code as it was written." },
];

/** Where the logging alias lives. Released migrations import this name, so it must keep resolving. */
const ALIAS_NAME = "@openbot/logging";
const ALIAS_TARGET = "workspace:@pokebots/logging@*";

/**
 * Module names that are not workspace packages: the account Worker maps them to renderer sources with a Vite
 * alias and a tsconfig path, and imports them lazily. They take the new scope with the packages.
 */
export const ALIASED_MODULES = ["renderer-preview", "renderer-web"] as const;

// `@openbot/*` is how documentation names the workspaces as a group.
const NAMES = [...PACKAGES, ...ALIASED_MODULES, "\\*"].join("|");
/**
 * One match is either a service tag, which stays, or a package scope, which changes. A tag is a quoted
 * string that is only `@openbot/<package>/<CapitalisedName>`.
 */
const SCOPE = new RegExp(
  `(["'\`])@openbot/(?:${NAMES})/[A-Z][A-Za-z0-9]*\\1|@openbot/(${NAMES})(?![A-Za-z0-9_-])`,
  "g",
);

/** The text before a quoted specifier that makes it an import and not a service tag. */
const IMPORT_CONTEXT = /(?:\bfrom|\bimport\s*\(?|\brequire\s*\(|\bdeclare\s+module|\bmock\s*\()\s*$/;

export interface RewriteResult {
  readonly code: string;
  /** Scopes changed. */
  readonly renamed: number;
  /** Service tags left as they are. */
  readonly tags: readonly string[];
}

/**
 * The lines that are the logging alias itself and keep `@openbot/logging`. Without this, a second run
 * would rename the alias and the rename would not be repeatable.
 */
function isAliasLine(file: string, line: string, previous: string): boolean {
  if (line.includes(`"${ALIAS_NAME}": "${ALIAS_TARGET}"`)) return true; // package.json and bun.lock
  if (file === LOCKFILE && line.includes(LOCK_ALIAS_ENTRY)) return true;
  if (file === "electron.vite.config.ts" && line.trim() === `"${ALIAS_NAME}",` && previous.includes(ALIAS_COMMENT)) {
    return true;
  }
  return file === "docs/architecture/change-rules.md" && line.startsWith(ALIAS_DOC_LINE);
}

/** The text with each `@openbot/<package>` scope renamed, except service tags and the alias itself. */
export function renameScopes(code: string, file = ""): RewriteResult {
  let renamed = 0;
  const tags: string[] = [];
  const lines = code.split("\n");
  const output = lines.map((line, index) => {
    if (!line.includes("@openbot/")) return line;
    if (isAliasLine(file, line, lines[index - 1] ?? "")) return line;
    return line.replace(SCOPE, (match: string, _quote: string | undefined, name: string | undefined, at: number) => {
      if (name === undefined) {
        // A quoted `@openbot/<package>/<Name>` is a tag, unless an import, a require or a module mock names it.
        if (!IMPORT_CONTEXT.test(line.slice(0, at))) {
          tags.push(match.slice(1, -1));
          return match;
        }
        renamed += 1;
        return match.replace("@openbot/", "@pokebots/");
      }
      renamed += 1;
      return `@pokebots/${name}`;
    });
  });
  return { code: output.join("\n"), renamed, tags };
}

const LOCKFILE = "bun.lock";
/** The lockfile entry that maps the alias to the renamed workspace package. */
const LOCK_ALIAS_ENTRY = `"${ALIAS_NAME}": ["@pokebots/logging@workspace:packages/logging"],`;
const ALIAS_COMMENT = "Released SQLite migrations keep this specifier. Bundle its workspace alias too.";
const ALIAS_DOC_LINE = "The root workspace alias `@openbot/logging`";

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The lockfile with the new names, the alias, and the entries that moved put where Bun sorts them.
 * Bun sorts the dependency maps of each workspace by name, and the `packages` section by key. The
 * `packages` section has a few older keys that a plain sort would move, so only the renamed entries
 * move: each goes before the first entry with a greater key.
 */
export function transformLockfile(
  text: string,
): RewriteResult & { readonly aliasStatus: "added" | "present" | "anchor-missing" } {
  const renamed = renameScopes(text, LOCKFILE);
  const lines = renamed.code.split("\n");
  let aliasStatus: "added" | "present" | "anchor-missing" = "present";

  // The root workspace depends on the alias. The first `@pokebots/logging` dependency is the root's.
  const aliasDependency = `        "${ALIAS_NAME}": "${ALIAS_TARGET}",`;
  if (!lines.includes(aliasDependency)) {
    const at = lines.indexOf('        "@pokebots/logging": "workspace:*",');
    if (at === -1) aliasStatus = "anchor-missing";
    else {
      lines.splice(at, 0, aliasDependency);
      aliasStatus = "added";
    }
  }

  const packagesStart = lines.indexOf('  "packages": {');
  if (packagesStart === -1) return { ...renamed, aliasStatus: "anchor-missing" };

  // Dependency maps of the workspaces: sorted by name.
  for (let index = 0; index < packagesStart; index += 1) {
    if (!/^ {6}"(?:dependencies|devDependencies|peerDependencies|optionalDependencies)": \{$/.test(lines[index] ?? ""))
      continue;
    let end = index + 1;
    while (end < packagesStart && /^ {8}"[^"]+": /.test(lines[end] ?? "")) end += 1;
    const sorted = lines.slice(index + 1, end).sort((a, b) => compareKeys(a.trim(), b.trim()));
    lines.splice(index + 1, end - index - 1, ...sorted);
  }

  // The packages section: one line per entry, a blank line between entries.
  const first = lines.findIndex((line, at) => at > packagesStart && /^ {4}"/.test(line));
  const close = lines.indexOf("  }", first);
  if (first === -1 || close === -1) return { ...renamed, aliasStatus: "anchor-missing" };
  const entries = lines.slice(first, close).filter((line) => line !== "");
  const keyOf = (line: string): string => /^ {4}"([^"]+)":/.exec(line)?.[1] ?? "";
  const aliasEntry = `    ${LOCK_ALIAS_ENTRY}`;
  if (!entries.some((line) => keyOf(line) === ALIAS_NAME)) entries.push(aliasEntry);
  const isMoved = (line: string): boolean => keyOf(line).startsWith("@pokebots/") || keyOf(line) === ALIAS_NAME;
  const kept = entries.filter((line) => !isMoved(line));
  for (const line of entries.filter(isMoved).sort((a, b) => compareKeys(keyOf(a), keyOf(b)))) {
    const before = kept.findIndex((other) => compareKeys(keyOf(other), keyOf(line)) > 0);
    kept.splice(before === -1 ? kept.length : before, 0, line);
  }
  const body = kept.flatMap((line, at) => (at < kept.length - 1 ? [line, ""] : [line]));
  lines.splice(first, close - first, ...body);
  return { code: lines.join("\n"), renamed: renamed.renamed, tags: renamed.tags, aliasStatus };
}

/** The skip entry that covers a path, or null. */
export function skipEntry(path: string): (typeof SKIPPED_PATHS)[number] | null {
  return (
    SKIPPED_PATHS.find((entry) => (entry.path.endsWith("/") ? path.startsWith(entry.path) : path === entry.path)) ??
    null
  );
}

interface Edit {
  readonly file: string;
  /** The exact line (trimmed) that the edit adds before, so the edit is found again on the next run. */
  readonly anchor: string;
  readonly present: (text: string) => boolean;
  readonly insert: (indent: string) => string;
  readonly description: string;
}

/** The alias edits that stay after the plain rename. Each one adds text, and only when it is missing. */
const ALIAS_EDITS: readonly Edit[] = [
  {
    file: "package.json",
    anchor: '"@pokebots/logging": "workspace:*",',
    present: (text) => text.includes(`"${ALIAS_NAME}": "${ALIAS_TARGET}"`),
    insert: (indent) => `${indent}"${ALIAS_NAME}": "${ALIAS_TARGET}",\n`,
    description: "Root workspace alias for released migrations.",
  },
  {
    file: "electron.vite.config.ts",
    anchor: '"@pokebots/logging",',
    present: (text) => text.includes(`"${ALIAS_NAME}"`),
    insert: (indent) =>
      `${indent}// Released SQLite migrations keep this specifier. Bundle its workspace alias too.\n${indent}"${ALIAS_NAME}",\n`,
    description: "Electron main build bundles the alias.",
  },
  {
    file: "docs/architecture/change-rules.md",
    anchor: "SQLite migration history starts at the frozen version 8 compatibility baseline.",
    present: (text) => text.includes("The root workspace alias `@openbot/logging`"),
    insert: () =>
      "The root workspace alias `@openbot/logging` resolves to `@pokebots/logging`. Keep the alias\n" +
      "while any migration imports it. Electron bundles both names. The release fixture exporter\n" +
      "links both scopes to the archived packages so each schema runs with its own source.\n\n",
    description: "Documents the alias.",
  },
];

export interface PackagesReport {
  readonly root: string;
  readonly mode: "write" | "check";
  readonly filesWithOldScope: number;
  readonly filesChanged: string[];
  readonly scopesRenamed: number;
  readonly serviceTagsKept: { readonly file: string; readonly tag: string }[];
  readonly skipped: { readonly file: string; readonly reason: string; readonly matches: number }[];
  readonly aliasEdits: {
    readonly file: string;
    readonly description: string;
    readonly status: "added" | "present" | "anchor-missing";
  }[];
  readonly formatted: number | "skipped";
  readonly formatError: string | null;
  readonly remainingOldScope: { readonly file: string; readonly matches: number }[];
}

interface Options {
  readonly root: string;
  readonly check: boolean;
  readonly format: boolean;
  readonly report: string | null;
}

function parseArguments(argv: readonly string[]): Options {
  let root = resolve(import.meta.dirname, "..");
  let report: string | null = null;
  let check = false;
  let format = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") check = true;
    else if (argument === "--no-format") format = false;
    else if (argument === "--root" || argument === "--report") {
      index += 1;
      const value = argv[index];
      if (!value) throw new Error(`${argument} needs a value.`);
      if (argument === "--root") root = resolve(value);
      else report = resolve(value);
    } else throw new Error(`Unknown argument ${argument}. See the header of scripts/pokebots-rename-packages.ts.`);
  }
  return {
    root,
    check,
    format,
    report: report ?? resolve(root, ".openbot-build/pokebots-rename-packages-report.json"),
  };
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
}

/** The text files that name an old scope, tracked or new. `-I` leaves out binary files. */
function filesWithOldScope(root: string): string[] {
  try {
    return git(root, ["grep", "--untracked", "--exclude-standard", "-lIz", "-e", "@openbot/", "--", "."])
      .split("\0")
      .filter((file) => file !== "");
  } catch {
    // `git grep` exits with 1 when nothing matches: the rename is already done.
    return [];
  }
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

/** The Bun that runs this script, so that an install uses the version the developer chose. */
const BUN = process.versions.bun ? process.execPath : "bun";

/** The source files with uncommitted changes that name the new scope. A run that stopped early leaves these. */
function dirtySources(root: string): string[] {
  const tracked = git(root, ["diff", "--name-only", "HEAD"]).split("\n");
  const added = git(root, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  return [...tracked, ...added].filter(
    (file) =>
      SOURCE_FILE.test(file) &&
      existsSync(resolve(root, file)) &&
      readFileSync(resolve(root, file), "utf8").includes("@pokebots/"),
  );
}

/** The text that a failed child process wrote, from the error that `execFileSync` throws. */
function processOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  return `${stdout}${stderr}`;
}
/** Runs Biome on source files. The files change in place, so a failure here leaves the rewrite done. */
function formatFiles(root: string, files: readonly string[]): { count: number; error: string | null } {
  const sources = [...new Set([...files.filter((file) => SOURCE_FILE.test(file)), ...dirtySources(root)])].sort();
  // The command line has a length limit, so the paths go in groups. Each group is one Biome run.
  for (let start = 0; start < sources.length; start += 800) {
    try {
      execFileSync(BUN, ["run", "check:paths", ...sources.slice(start, start + 800)], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1 << 28,
      });
    } catch (error) {
      const text = processOutput(error).split("\n").slice(0, 60).join("\n");
      return {
        count: start,
        error: `Biome stopped on a group of files. Fix what it names, then run the script again.\n${text}`,
      };
    }
  }
  return { count: sources.length, error: null };
}

export function run(options: Options): PackagesReport {
  const { root } = options;
  const candidates = filesWithOldScope(root);
  // The new text of each file that changes. A check run builds the same map and writes nothing.
  const updates = new Map<string, string>();
  const skipped: PackagesReport["skipped"][number][] = [];
  const tags: { file: string; tag: string }[] = [];
  let renamed = 0;
  let lockStatus: "added" | "present" | "anchor-missing" | null = null;

  for (const file of candidates) {
    const text = readFileSync(resolve(root, file), "utf8");
    const skip = skipEntry(file);
    if (skip) {
      skipped.push({ file, reason: skip.reason, matches: text.split("@openbot/").length - 1 });
      continue;
    }
    let result: RewriteResult;
    if (file === LOCKFILE) {
      const lock = transformLockfile(text);
      lockStatus = lock.aliasStatus;
      result = lock;
    } else {
      result = renameScopes(text, file);
    }
    for (const tag of result.tags) tags.push({ file, tag });
    if (result.code === text) continue;
    renamed += result.renamed;
    updates.set(file, result.code);
  }

  const aliasEdits: PackagesReport["aliasEdits"][number][] = [];
  for (const edit of ALIAS_EDITS) {
    let text: string;
    try {
      text = updates.get(edit.file) ?? readFileSync(resolve(root, edit.file), "utf8");
    } catch {
      aliasEdits.push({ file: edit.file, description: edit.description, status: "anchor-missing" });
      continue;
    }
    if (edit.present(text)) {
      aliasEdits.push({ file: edit.file, description: edit.description, status: "present" });
      continue;
    }
    const lines = text.split("\n");
    const at = lines.findIndex((line) => line.trim().startsWith(edit.anchor));
    if (at === -1) {
      aliasEdits.push({ file: edit.file, description: edit.description, status: "anchor-missing" });
      continue;
    }
    const indent = lines[at]?.match(/^\s*/)?.[0] ?? "";
    lines.splice(at, 0, ...edit.insert(indent).replace(/\n$/, "").split("\n"));
    updates.set(edit.file, lines.join("\n"));
    aliasEdits.push({ file: edit.file, description: edit.description, status: "added" });
  }

  if (lockStatus !== null) {
    aliasEdits.push({ file: LOCKFILE, description: "Lockfile alias entries.", status: lockStatus });
  }
  const changed = [...updates.keys()].sort();
  if (!options.check) for (const [file, text] of updates) writeFileSync(resolve(root, file), text);

  let formatted: PackagesReport["formatted"] = "skipped";
  let formatError: string | null = null;
  // Format on every run, not only when this run changed a file: an earlier run may have stopped before Biome.
  if (!options.check && options.format) {
    const result = formatFiles(root, changed);
    formatted = result.count;
    formatError = result.error;
  }
  // What still names an old scope after a write run, outside the skipped paths. Service tags stay, so
  // they show here too.
  const remaining: { file: string; matches: number }[] = [];
  if (!options.check) {
    for (const file of filesWithOldScope(root)) {
      if (skipEntry(file)) continue;
      remaining.push({ file, matches: readFileSync(resolve(root, file), "utf8").split("@openbot/").length - 1 });
    }
  }

  return {
    root,
    mode: options.check ? "check" : "write",
    filesWithOldScope: candidates.length,
    filesChanged: changed,
    scopesRenamed: renamed,
    serviceTagsKept: tags,
    skipped,
    aliasEdits,
    formatted,
    formatError,
    remainingOldScope: remaining,
  };
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const report = run(options);
  if (options.report) {
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
  }
  const missing = report.aliasEdits.filter((edit) => edit.status === "anchor-missing");
  const lines = [
    `${report.mode === "check" ? "Would change" : "Changed"} ${report.filesChanged.length} files (${report.scopesRenamed} scopes renamed).`,
    `Kept ${report.serviceTagsKept.length} service tags and ${report.skipped.length} files that keep the old scope.`,
    `Alias edits: ${report.aliasEdits.map((edit) => `${edit.file} ${edit.status}`).join(", ")}.`,
    `Formatted ${report.formatted} source files.`,
  ];
  if (options.report) lines.push(`Report: ${relative(process.cwd(), options.report)}`);
  if (report.mode === "write" && report.filesChanged.length > 0) {
    lines.push("Next: run `scripts/pokebots-rename-catalogs.ts` and `bun install --frozen-lockfile`, then commit.");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (report.formatError) {
    process.stderr.write(`${report.formatError}\n`);
    process.exitCode = 1;
  }
  if (missing.length > 0) {
    process.stderr.write(
      `Alias anchor missing in: ${missing.map((edit) => edit.file).join(", ")}. Update ALIAS_EDITS.\n`,
    );
    process.exitCode = 1;
  }
  if (report.mode === "check" && report.filesChanged.length > 0) process.exitCode = 1;
}

if (import.meta.main) main();

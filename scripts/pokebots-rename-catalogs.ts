// Writes the product name "Pokebots" into the message values of the i18n catalogs
// (`packages/i18n/src/messages`), using the rules of the build-time brand layer
// (`scripts/brand-layer.ts`), and keeps the exceptions that the reviewed catalog branch kept. A second
// run changes nothing.
//
//   bun scripts/pokebots-rename-catalogs.ts              rewrite the catalogs, then wrap long lines
//   bun scripts/pokebots-rename-catalogs.ts --check      change nothing; exit 1 when a rewrite is pending
//   bun scripts/pokebots-rename-catalogs.ts --no-format  skip the Biome step
//   bun scripts/pokebots-rename-catalogs.ts --root <dir> work on another checkout of this repository
//   bun scripts/pokebots-rename-catalogs.ts --report <file>  where to write the JSON report
//
// After a merge of `main`, or on a branch whose catalogs still say "OpenBot": run this script and
// `scripts/pokebots-rename-packages.ts`, then `bun install`, then commit. See
// `docs/custom-fork-sync.md#apply-the-pokebots-rename-scripts-to-a-branch`.
//
// The rules are the brand layer's own, imported and not copied (`brandStringValues` and `brandText`):
// - Only string values change. A string followed by `:` is a key and stays; so do comments.
// - The match is case-sensitive "OpenBot". Lowercase `openbot.run`, `openbot://`, identifiers and
//   environment names stay.
// - `KEPT_PHRASES` in the brand layer stay: "Shared with OpenBot", "OpenBot GitHub App",
//   "OpenBot Mobile" and "OpenBot Shared" name things that keep their names.
//
// What this script adds are the exceptions in `KEPT_VALUES`, `KEPT_HANDLE` and `KEPT_ENGLISH_PREFIXES`.
// The branch that put "Pokebots" in the catalogs left those values as they were, because they name a
// service account, an installed component or a folder, or they are English text that hosts send to
// clients. The build-time brand layer still brands them in the built app, so the app shows the same
// text as before. Remove an entry here only with the change that renames the thing it points to.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { brandStringValues, brandText } from "./brand-layer";

export const PRODUCT_NAME = "Pokebots";
const CATALOG_DIRECTORY = "packages/i18n/src/messages/";

/** Values that keep the product word "OpenBot" in every language, grouped by why. */
export const KEPT_VALUES: readonly {
  readonly group: string;
  readonly reason: string;
  readonly keys: readonly string[];
}[] = [
  {
    group: "service-account-names",
    reason:
      "The Discord bot, the Slack app and the GitHub App are named OpenBot in those services. People mention, invite or revoke them by that name.",
    keys: [
      "connector.discord.accessDialogDescription",
      "connector.discord.agentStepDescription",
      "connector.discord.connectDescription",
      "connector.discord.description",
      "connector.discord.disconnectAllSummary",
      "connector.discord.disconnectEffect",
      "connector.discord.doneDescription",
      "connector.discord.workspaceDescription",
      "connector.github.disconnectEffectRevoke",
      "connector.github.noRepositories",
      "connector.github.repositoriesDescription",
      "connector.slack.agentStepDescription",
      "connector.slack.connectDescription",
      "connector.slack.description",
      "connector.slack.disconnectAllSummary",
      "connector.slack.disconnectEffect",
      "connector.slack.doneDescription",
      "connector.slack.workspaceDescription",
      "error.workflow.githubNoAccess",
      "error.workflow.githubNoWrite",
      "mobile.server.connectors.discord.agentPromptBody",
      "mobile.server.connectors.discord.connectFooter",
      "mobile.server.connectors.discord.description",
      "mobile.server.connectors.discord.helpInvalidToken",
      "mobile.server.connectors.discord.workspaceDescription",
      "mobile.server.connectors.github.disconnectBody",
      "mobile.server.connectors.github.noRepositories",
      "mobile.server.connectors.github.repositoriesFooter",
      "mobile.server.connectors.slack.agentPromptBody",
      "mobile.server.connectors.slack.connectFooter",
      "mobile.server.connectors.slack.description",
      "mobile.server.connectors.slack.helpInvalidToken",
      "mobile.server.connectors.slack.workspaceDescription",
      "mobile.workflow.discord.event.mention",
      "mobile.workflow.trigger.discordHint",
      "mobile.workflow.trigger.slackHint",
      "mobile.workflow.trigger.telegramHint",
      "workflow.discord.event.mention",
    ],
  },
  {
    group: "installed-components-and-paths",
    reason:
      "The OpenBot Host Manager and the OpenBot Docker image are installed under those names, `~/OpenBot` is a real folder, and the store listing of the phone app is still OpenBot.",
    keys: [
      "files.storage.measuringFolder",
      "mobile.app.update.storeFailed",
      "mobile.server.update.managedDescription",
      "mobile.server.update.path.container",
      "mobile.server.update.path.hostManager",
      "server.update.managedDescription",
      "server.update.path.container",
      "server.update.path.hostManager",
      "settings.updates.host.upToDate",
    ],
  },
];

/**
 * Values whose text is branded except the Slack handle that a person types: `/invite @OpenBot` names the
 * Slack app, so the handle stays and the sentence around it says Pokebots.
 */
export const KEPT_HANDLE = {
  group: "slack-invite-handle",
  reason: "`/invite @OpenBot` names the Slack app. The rest of the sentence takes the new name.",
  handle: "@OpenBot",
  keys: ["connector.slack.inviteNote", "mobile.server.connectors.slack.note"],
} as const;

/**
 * Keys with these prefixes keep "OpenBot" in the English catalog only. A host sends the English error and
 * status text to its clients, and released clients show it as it is, so the English wording is part of the
 * wire. The other languages take the new name.
 */
export const KEPT_ENGLISH_PREFIXES = {
  group: "english-wire-text",
  reason: "English error and status text that hosts send to clients. Other languages are branded.",
  language: "en",
  prefixes: ["error.", "status."],
} as const;

const KEPT_KEY_GROUP = new Map<string, string>(
  KEPT_VALUES.flatMap((entry) => entry.keys.map((key) => [key, entry.group] as const)),
);
/** A catalog entry starts at a line with a double-quoted key at the first indent. */
const ENTRY_START = /^ {2}"([^"\n]+)":/;

/** The group that keeps this entry's value as it is, or null when the entry takes the new name. */
export function keptGroup(language: string, key: string): string | null {
  const group = KEPT_KEY_GROUP.get(key);
  if (group) return group;
  if (
    language === KEPT_ENGLISH_PREFIXES.language &&
    KEPT_ENGLISH_PREFIXES.prefixes.some((prefix) => key.startsWith(prefix))
  ) {
    return KEPT_ENGLISH_PREFIXES.group;
  }
  return null;
}

/** The text of a value with "OpenBot" replaced, except the Slack handle. */
function brandKeepingHandle(text: string): string {
  return text
    .split(KEPT_HANDLE.handle)
    .map((part) => brandText(part, PRODUCT_NAME))
    .join(KEPT_HANDLE.handle);
}

export interface CatalogResult {
  readonly code: string;
  /** String values changed. */
  readonly changed: number;
  /** String values left as they were, by group. */
  readonly kept: Record<string, number>;
}

/**
 * The catalog module with the product name in its values. The module is cut at each entry, so that
 * an entry that is kept can be left out and every other entry goes through the brand layer's own
 * `brandStringValues` as it is.
 */
export function brandCatalog(path: string, code: string): CatalogResult {
  const language = path.slice(CATALOG_DIRECTORY.length).split("/")[0] ?? "";
  const kept: Record<string, number> = {};
  let changed = 0;
  const chunks: { key: string | null; lines: string[] }[] = [{ key: null, lines: [] }];
  for (const line of code.split("\n")) {
    const entry = ENTRY_START.exec(line);
    if (entry) chunks.push({ key: entry[1] ?? null, lines: [line] });
    else chunks[chunks.length - 1]?.lines.push(line);
  }
  const output = chunks.map(({ key, lines }) => {
    const text = lines.join("\n");
    const group = key === null ? null : keptGroup(language, key);
    if (group) {
      const wouldChange = brandStringValues(text, (value) => brandText(value, PRODUCT_NAME)).changed;
      if (wouldChange > 0) kept[group] = (kept[group] ?? 0) + wouldChange;
      return text;
    }
    const handle = key !== null && (KEPT_HANDLE.keys as readonly string[]).includes(key);
    const result = brandStringValues(text, handle ? brandKeepingHandle : (value) => brandText(value, PRODUCT_NAME));
    changed += result.changed;
    if (handle) kept[KEPT_HANDLE.group] = (kept[KEPT_HANDLE.group] ?? 0) + (text.split(KEPT_HANDLE.handle).length - 1);
    return result.code;
  });
  return { code: output.join("\n"), changed, kept };
}

export interface CatalogsReport {
  readonly root: string;
  readonly mode: "write" | "check";
  readonly catalogFiles: number;
  readonly filesChanged: string[];
  readonly valuesChanged: number;
  readonly formatted: number | "skipped";
  /** Values left as "OpenBot" on purpose, by exception group, with the reason. */
  readonly kept: { readonly group: string; readonly reason: string; readonly values: number }[];
  /** Lines that still say "OpenBot" because of a kept phrase of the brand layer. */
  readonly keptPhrases: Record<string, number>;
  /** Comment lines with "OpenBot". The brand layer never changes comments. */
  readonly commentLines: number;
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
    } else throw new Error(`Unknown argument ${argument}. See the header of scripts/pokebots-rename-catalogs.ts.`);
  }
  return {
    root,
    check,
    format,
    report: report ?? resolve(root, ".openbot-build/pokebots-rename-catalogs-report.json"),
  };
}

function catalogFiles(root: string): string[] {
  const listed = execFileSync("git", ["-C", root, "ls-files", "-z", "--", CATALOG_DIRECTORY], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  return listed
    .split("\0")
    .filter((file) => file.endsWith(".ts"))
    .sort();
}

/** The Bun that runs this script, so that Biome runs with the version the developer chose. */
const BUN = process.versions.bun ? process.execPath : "bun";

function formatFiles(root: string, files: readonly string[]): number {
  // The command line has a length limit, so the paths go in groups. Each group is one Biome run.
  for (let start = 0; start < files.length; start += 800) {
    execFileSync(BUN, ["run", "check:paths", ...files.slice(start, start + 800)], { cwd: root, stdio: "ignore" });
  }
  return files.length;
}

const KEPT_PHRASE_NAMES = ["Shared with OpenBot", "OpenBot GitHub App", "OpenBot Mobile", "OpenBot Shared"] as const;

export function run(options: Options): CatalogsReport {
  const { root } = options;
  const files = catalogFiles(root);
  const changed: string[] = [];
  const kept: Record<string, number> = {};
  let values = 0;
  const keptPhrases: Record<string, number> = {};
  let commentLines = 0;

  for (const file of files) {
    const code = readFileSync(resolve(root, file), "utf8");
    const result = brandCatalog(file, code);
    for (const [group, count] of Object.entries(result.kept)) kept[group] = (kept[group] ?? 0) + count;
    if (result.code !== code) {
      changed.push(file);
      values += result.changed;
      if (!options.check) writeFileSync(resolve(root, file), result.code);
    }
    for (const line of result.code.split("\n")) {
      if (!line.includes("OpenBot")) continue;
      if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) commentLines += 1;
      else {
        for (const phrase of KEPT_PHRASE_NAMES) {
          if (line.includes(phrase)) keptPhrases[phrase] = (keptPhrases[phrase] ?? 0) + 1;
        }
      }
    }
  }

  let formatted: CatalogsReport["formatted"] = "skipped";
  if (!options.check && options.format && changed.length > 0) formatted = formatFiles(root, changed);

  const groups = [
    ...KEPT_VALUES.map(({ group, reason }) => ({ group, reason })),
    { group: KEPT_HANDLE.group, reason: KEPT_HANDLE.reason },
    { group: KEPT_ENGLISH_PREFIXES.group, reason: KEPT_ENGLISH_PREFIXES.reason },
  ];
  return {
    root,
    mode: options.check ? "check" : "write",
    catalogFiles: files.length,
    filesChanged: changed,
    valuesChanged: values,
    formatted,
    kept: groups.map(({ group, reason }) => ({ group, reason, values: kept[group] ?? 0 })),
    keptPhrases,
    commentLines,
  };
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const report = run(options);
  if (options.report) {
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
  }
  const lines = [
    `${report.mode === "check" ? "Would change" : "Changed"} ${report.filesChanged.length} of ${report.catalogFiles} catalog files (${report.valuesChanged} values).`,
    `Kept on purpose: ${report.kept.map((entry) => `${entry.group} ${entry.values}`).join(", ")}.`,
    `Formatted ${report.formatted} files.`,
  ];
  if (options.report) lines.push(`Report: ${relative(process.cwd(), options.report)}`);
  if (report.mode === "write" && report.filesChanged.length > 0) {
    lines.push("Next: run `scripts/pokebots-rename-packages.ts` and `bun install --frozen-lockfile`, then commit.");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (report.mode === "check" && report.filesChanged.length > 0) process.exitCode = 1;
}

if (import.meta.main) main();

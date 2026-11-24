// Writes the product name "Pokebots" into the message values of the i18n catalogs
// (`packages/i18n/src/messages`) and into the What's New notes (`src/renderer/src/features/updates`),
// with the rules of `scripts/pokebots-brand-text.ts`. A second run changes nothing.
//
//   bun scripts/pokebots-rename-catalogs.ts              rewrite the files, then wrap long lines
//   bun scripts/pokebots-rename-catalogs.ts --check      change nothing; exit 1 when a rewrite is pending
//   bun scripts/pokebots-rename-catalogs.ts --no-format  skip the Biome step
//   bun scripts/pokebots-rename-catalogs.ts --root <dir> work on another checkout of this repository
//   bun scripts/pokebots-rename-catalogs.ts --report <file>  where to write the JSON report
//
// After a merge of `main`, or on a branch whose catalogs still say "OpenBot": run this script and
// `scripts/pokebots-rename-packages.ts`, then `bun install`, then commit. See
// `docs/custom-fork-sync.md#apply-the-pokebots-rename-scripts-to-a-branch`.
//
// - Only string values change. A string followed by `:` is a key and stays; so do comments.
// - The match is case-sensitive "OpenBot". Lowercase `openbot.run`, `openbot://`, identifiers and
//   environment names stay.
// - `KEPT_PHRASES` stay: "Shared with OpenBot", "OpenBot GitHub App", "OpenBot Mobile" and
//   "OpenBot Shared" name things that keep their names.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { brandStringValues, brandText } from "./pokebots-brand-text";

export const PRODUCT_NAME = "Pokebots";
const CATALOG_DIRECTORY = "packages/i18n/src/messages/";
const NOTES_DIRECTORY = "src/renderer/src/features/updates/";

/** The What's New notes: the English file and one file per language. */
const RELEASE_NOTES_FILES = /^src\/renderer\/src\/features\/updates\/(whats-new-releases|whats-new\/[a-z]{2})\.json$/;

export interface CatalogResult {
  readonly code: string;
  /** String values changed. */
  readonly changed: number;
}

/** The module or JSON file with the product name in its string values. */
export function brandCatalog(code: string): CatalogResult {
  return brandStringValues(code, (value) => brandText(value, PRODUCT_NAME));
}

export interface CatalogsReport {
  readonly root: string;
  readonly mode: "write" | "check";
  readonly catalogFiles: number;
  readonly filesChanged: string[];
  readonly valuesChanged: number;
  readonly formatted: number | "skipped";
  readonly formatError: string | null;
  /** Lines that still say "OpenBot" because of a kept phrase. */
  readonly keptPhrases: Record<string, number>;
  /** Comment lines with "OpenBot". The script never changes comments. */
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
  const listed = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      CATALOG_DIRECTORY,
      NOTES_DIRECTORY,
    ],
    {
      encoding: "utf8",
      maxBuffer: 1 << 26,
    },
  );
  return listed
    .split("\0")
    .filter((file) => (file.startsWith(CATALOG_DIRECTORY) && file.endsWith(".ts")) || RELEASE_NOTES_FILES.test(file))
    .sort();
}

/** The Bun that runs this script, so that Biome runs with the version the developer chose. */
const BUN = process.versions.bun ? process.execPath : "bun";

/** The catalog files with uncommitted changes. A run that stopped early leaves these. */
function dirtyCatalogs(root: string): string[] {
  const git = (args: readonly string[]): string =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  return [
    ...git(["diff", "--name-only", "HEAD", "--", CATALOG_DIRECTORY, NOTES_DIRECTORY]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard", "--", CATALOG_DIRECTORY, NOTES_DIRECTORY]).split("\n"),
  ].filter((file) => (file.endsWith(".ts") || file.endsWith(".json")) && existsSync(resolve(root, file)));
}

/** The text that a failed child process wrote, from the error that `execFileSync` throws. */
function processOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  return `${stdout}${stderr}`;
}
/** Runs Biome on catalog files. The files change in place, so a failure here leaves the rewrite done. */
function formatFiles(root: string, files: readonly string[]): { count: number; error: string | null } {
  const targets = [...new Set([...files, ...dirtyCatalogs(root)])].sort();
  // The command line has a length limit, so the paths go in groups. Each group is one Biome run.
  for (let start = 0; start < targets.length; start += 800) {
    try {
      execFileSync(BUN, ["run", "check:paths", ...targets.slice(start, start + 800)], {
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
  return { count: targets.length, error: null };
}

const KEPT_PHRASE_NAMES = ["Shared with OpenBot", "OpenBot GitHub App", "OpenBot Mobile", "OpenBot Shared"] as const;

export function run(options: Options): CatalogsReport {
  const { root } = options;
  const files = catalogFiles(root);
  const changed: string[] = [];
  let values = 0;
  const keptPhrases: Record<string, number> = {};
  let commentLines = 0;

  for (const file of files) {
    const code = readFileSync(resolve(root, file), "utf8");
    const result = brandCatalog(code);
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
  let formatError: string | null = null;
  // Format on every run, not only when this run changed a file: an earlier run may have stopped before Biome.
  if (!options.check && options.format) {
    const result = formatFiles(root, changed);
    formatted = result.count;
    formatError = result.error;
  }

  return {
    root,
    mode: options.check ? "check" : "write",
    catalogFiles: files.length,
    filesChanged: changed,
    valuesChanged: values,
    formatted,
    formatError,
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
    `Formatted ${report.formatted} files.`,
  ];
  if (options.report) lines.push(`Report: ${relative(process.cwd(), options.report)}`);
  if (report.mode === "write" && report.filesChanged.length > 0) {
    lines.push("Next: run `scripts/pokebots-rename-packages.ts` and `bun install --frozen-lockfile`, then commit.");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (report.formatError) {
    process.stderr.write(`${report.formatError}\n`);
    process.exitCode = 1;
  }
  if (report.mode === "check" && report.filesChanged.length > 0) process.exitCode = 1;
}

if (import.meta.main) main();

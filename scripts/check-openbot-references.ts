// Fails when a change adds a new "OpenBot" or `@openbot/` reference to first-party code, outside the
// allowlist in `scripts/openbot-references-allowlist.json`.
//
//   bun run check:openbot-references                     check the lines this branch adds to main
//   bun run check:openbot-references -- --base <ref> [--head <ref>]   compare other commits
//   bun run check:openbot-references -- --self-test      run the built-in fixtures and write a report
//
// Why: the source says "Pokebots". Upstream merges and old branches bring "OpenBot" back, one line at
// a time, and nothing renames text at build time any more. This check reads only the added lines of a
// change, so the references that are already in the repository (released identities and upstream text)
// cost nothing and never need a baseline.
//
// What it flags: the case-sensitive whole word "OpenBot" and the scope `@openbot/`. Code symbols that
// contain the word (`OpenBotDesktopApi`, `createMockOpenBot`), headers such as `X-OpenBot-Browser`,
// lowercase `openbot` (addresses, identifiers, the `openbot:` protocol) and `OPENBOT_*` settings are
// not matched: they are names in code or released identities, not text that a person reads.
// - Phrases that keep their name ("Shared with OpenBot", "OpenBot GitHub App", "OpenBot Mobile", "OpenBot
//   Shared") are fine.
// - A line that is only a comment is skipped: it is not text that a person reads in the app.
// - A file in `paths` of the allowlist is skipped: released identities, history and legal text.
// - A line that matches a `lines` pattern is skipped: data paths, keychain names and similar.
// - An `@openbot/<package>` import is a warning, not an error, while `scripts/legacy-openbot-scope.ts`
//   exists: open branches still add them and the alias resolves them. Delete the alias, and the check
//   makes them errors.
//
// A pull request that brings upstream OpenBot text on purpose (the daily upstream sync) takes the label
// `allow-openbot-references`, and CI skips the check.
//
// To allow something, add an entry with its reason to the allowlist. An entry needs a reason that names
// the released thing (a folder, a keychain item, a wire value), not "it was easier".
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ALLOWLIST_FILE = "scripts/openbot-references-allowlist.json";
const ALIAS_FILE = "scripts/legacy-openbot-scope.ts";

interface Allowlist {
  readonly paths: readonly { readonly path: string; readonly reason: string }[];
  readonly lines: readonly { readonly pattern: string; readonly reason: string }[];
}

export interface Reference {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly kind: "name" | "import";
}

/** The product word as a whole word (not a code symbol such as `OpenBotDesktopApi` or a header such as `X-OpenBot-Browser`), or the old scope. */
const REFERENCE = /(?<![\w$-])OpenBot(?![\w$-])|@openbot\//;
/** The phrases that keep "OpenBot" (`KEPT_PHRASES` in `scripts/pokebots-brand-text.ts`). */
const KEPT_PHRASE_WORDS = /Shared with OpenBot|OpenBot (?:GitHub App|Mobile|Shared)\b/g;
/** A line that is only a comment: nobody reads it in the app. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#|<!--)/;
const OLD_SCOPE = /@openbot\/[a-z0-9-]+/;
const WORD = /(?<![\w$-])OpenBot(?![\w$-])/;

export function readAllowlist(root = ROOT): Allowlist {
  return JSON.parse(readFileSync(resolve(root, ALLOWLIST_FILE), "utf8"));
}

/** True when the path is in a skipped file or folder. A path ending in `/` is a folder. */
export function pathAllowed(file: string, allowlist: Allowlist): boolean {
  return allowlist.paths.some((entry) =>
    entry.path.endsWith("/")
      ? file.startsWith(entry.path) || file.includes(`/${entry.path}`)
      : file === entry.path || file.endsWith(`/${entry.path}`),
  );
}

/** The references in the added lines of a unified diff (`git diff -U0`). */
export function findReferences(diff: string, allowlist: Allowlist): Reference[] {
  const lines = allowlist.lines.map((entry) => new RegExp(entry.pattern, "g"));
  const found: Reference[] = [];
  let file = "";
  let skipped = false;
  let number = 0;
  for (const row of diff.split("\n")) {
    if (row.startsWith("+++ ")) {
      file = row.startsWith("+++ b/") ? row.slice(6) : "";
      skipped = file === "" || pathAllowed(file, allowlist);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      number = Number(hunk[1]);
      continue;
    }
    if (!row.startsWith("+") || row.startsWith("+++")) continue;
    const text = row.slice(1);
    const current = number;
    number += 1;
    if (skipped || !REFERENCE.test(text) || COMMENT_LINE.test(text)) continue;
    let rest = text.replace(KEPT_PHRASE_WORDS, "");
    for (const pattern of lines) rest = rest.replace(pattern, "");
    if (!REFERENCE.test(rest)) continue;
    found.push({
      file,
      line: current,
      text: text.trim(),
      kind: OLD_SCOPE.test(rest) && !WORD.test(rest) ? "import" : "name",
    });
  }
  return found;
}

function git(args: readonly string[]): string {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
}

/** The commit that this change is compared with. */
function baseCommit(argument: string | null): string | null {
  if (argument) return argument;
  // A pull request runs on a merge commit whose first parent is the base branch.
  if (process.env.GITHUB_EVENT_NAME === "pull_request") return git(["rev-parse", "HEAD^1"]);
  // A push to main has no change left to compare.
  if (process.env.GITHUB_EVENT_NAME) return null;
  for (const ref of ["origin/main", "main"]) {
    try {
      return git(["merge-base", ref, "HEAD"]);
    } catch {
      // Try the next ref.
    }
  }
  throw new Error("No base found. Pass --base <ref>.");
}

function selfTest(): void {
  const allowlist = readAllowlist();
  const diff = (file: string, ...added: string[]) =>
    `+++ b/${file}\n@@ -0,0 +1,${added.length} @@\n${added.map((line) => `+${line}`).join("\n")}\n`;
  const cases: { name: string; diff: string; expect: number; kind?: Reference["kind"] }[] = [
    {
      name: "new product word",
      diff: diff("src/renderer/a.ts", 'const a = "OpenBot is great";'),
      expect: 1,
      kind: "name",
    },
    {
      name: "new old-scope import",
      diff: diff("src/main/a.ts", 'import { x } from "@openbot/contracts";'),
      expect: 1,
      kind: "import",
    },
    { name: "kept phrase", diff: diff("src/renderer/a.ts", 'const a = "Shared with OpenBot";'), expect: 0 },
    { name: "lowercase address", diff: diff("src/renderer/a.ts", 'const a = "https://openbot.run";'), expect: 0 },
    { name: "environment setting", diff: diff("src/main/a.ts", "process.env.OPENBOT_HOME;"), expect: 0 },
    { name: "history file", diff: diff("CHANGELOG.md", "- OpenBot did a thing"), expect: 0 },
    { name: "frozen migration", diff: diff("src/backend/migrations/0001.ts", 'import "@openbot/logging";'), expect: 0 },
    { name: "released data folder", diff: diff("src/main/a.ts", 'join(home, "OpenBot", "Bots")'), expect: 0 },
  ];
  const results = cases.map((test) => {
    const found = findReferences(test.diff, allowlist);
    const ok = found.length === test.expect && (test.kind === undefined || found[0]?.kind === test.kind);
    return { name: test.name, expect: test.expect, found: found.length, ok };
  });
  const out = resolve(ROOT, ".openbot-build/check-openbot-references/report.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ passed: results.every((result) => result.ok), results }, null, 2)}\n`);
  const failed = results.filter((result) => !result.ok);
  process.stdout.write(`${results.length - failed.length}/${results.length} fixtures passed.\n`);
  if (failed.length > 0) {
    process.stderr.write(`Failed: ${failed.map((result) => result.name).join(", ")}\n`);
    process.exitCode = 1;
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const headAt = argv.indexOf("--head");
  const head = headAt === -1 ? "HEAD" : (argv[headAt + 1] ?? "HEAD");
  const at = argv.indexOf("--base");
  const base = baseCommit(at === -1 ? null : (argv[at + 1] ?? null));
  if (base === null) {
    process.stdout.write("Not a pull request: nothing to compare.\n");
    return;
  }
  const diff = git(["diff", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=AMR", base, head]);
  const aliasExists = existsSync(resolve(ROOT, ALIAS_FILE));
  const found = findReferences(diff, readAllowlist());
  const errors = found.filter((reference) => reference.kind === "name" || !aliasExists);
  const warnings = found.filter((reference) => !errors.includes(reference));
  for (const reference of warnings) {
    process.stdout.write(
      `::warning file=${reference.file},line=${reference.line}::The old scope @openbot/ still resolves through ${ALIAS_FILE}. Use @pokebots/ instead: ${reference.text}\n`,
    );
  }
  for (const reference of errors) {
    process.stderr.write(`${reference.file}:${reference.line}: ${reference.text}\n`);
  }
  if (errors.length > 0) {
    process.stderr.write(
      `\n${errors.length} new "OpenBot" reference${errors.length === 1 ? "" : "s"}. The source says "Pokebots": ` +
        `write the product name as "Pokebots", or run \`bun scripts/pokebots-rename-catalogs.ts\` for catalog text. ` +
        `For a released identity (a data folder, a keychain item, a wire value), add an entry with its reason to ${ALLOWLIST_FILE}.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `No new "OpenBot" references (${warnings.length} old-scope import warning${warnings.length === 1 ? "" : "s"}).\n`,
  );
}

if (import.meta.main) main();

// Stops a change to a migration that a release shipped, and a new migration with a wrong version.
//
// Check the pinned history and all local stable release tags. CI fetches fork tags from origin.
// `--tag <tag>` also checks the named ref, for example a release candidate.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frozenMigrationProblems, MIGRATIONS_DIR } from "./frozen-migrations";
import pinnedReleases from "./released-migration-sources.json";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
}

const tagFlag = process.argv.indexOf("--tag");
const extraTag = tagFlag === -1 ? undefined : process.argv[tagFlag + 1];
if (tagFlag !== -1 && !extraTag) throw new Error("--tag needs a ref.");

const pinnedSources = new Map(Object.entries(pinnedReleases));
const sources = [...pinnedSources];
for (const tag of git("tag", "--list", "v*").split("\n")) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) continue;
  const ref = `refs/tags/${tag}`;
  const pinned = pinnedSources.get(tag);
  if (pinned === undefined) {
    sources.push([tag, ref]);
  } else if (git("rev-parse", `${ref}^{commit}`).trim() !== pinned) {
    throw new Error(`${tag} conflicts with its pinned release commit ${pinned}.`);
  }
}
if (extraTag) sources.push([extraTag, extraTag]);

const current = new Map(
  readdirSync(MIGRATIONS_DIR).map((file) => [file, readFileSync(join(MIGRATIONS_DIR, file), "utf8")]),
);
const problems = new Set<string>();
for (const [tag, ref] of sources) {
  const files = new Map<string, string>();
  for (const path of git("ls-tree", "--name-only", ref, "--", `${MIGRATIONS_DIR}/`).split("\n").filter(Boolean)) {
    files.set(path.slice(MIGRATIONS_DIR.length + 1), git("show", `${ref}:${path}`));
  }
  for (const problem of frozenMigrationProblems(current, { tag, files })) problems.add(problem);
}

if (problems.size > 0) {
  process.stderr.write(
    [
      "These migrations break the frozen-migration rules:",
      ...[...problems].map((problem) => `- ${MIGRATIONS_DIR}/${problem}`),
      "",
      "See src/backend/AGENTS.md#frozen-migrations.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
process.stdout.write(`Migrations are frozen across ${sources.length} release sources.\n`);

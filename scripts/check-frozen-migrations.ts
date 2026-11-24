// Stops a change to a migration that a release shipped, and a new migration with a wrong version.
//
// Check the pinned history and all local stable release tags. CI fetches fork tags from origin.
// `--tag <tag>` also checks the named ref, for example a release candidate.
//
// Pokebots builds are installed from commits of `main` with no tag, so a migration that `main` has may
// already have run on a user's database. On a pull request, the check also freezes the migrations of
// the commit where the branch left its base branch. In GitHub Actions it reads `GITHUB_BASE_REF` and
// fetches that branch from origin. A push to `main` compares with the tip before the push.
// `--base <ref>` does the same for a local ref, for example `--base origin/main`.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { frozenMigrationProblems, MIGRATIONS_DIR } from "./frozen-migrations";
import pinnedReleases from "./released-migration-sources.json";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
}

const tagFlag = process.argv.indexOf("--tag");
const extraTag = tagFlag === -1 ? undefined : process.argv[tagFlag + 1];
if (tagFlag !== -1 && !extraTag) throw new Error("--tag needs a ref.");
const baseFlag = process.argv.indexOf("--base");
const baseArgument = baseFlag === -1 ? undefined : process.argv[baseFlag + 1];
if (baseFlag !== -1 && !baseArgument) throw new Error("--base needs a ref.");

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

// A failed fetch or merge base stops the check: a base that cannot be read must not weaken it.
const baseBranch = process.env.GITHUB_BASE_REF;
let baseLabel = baseArgument ?? baseBranch;
let baseCommit: string | undefined;
if (baseArgument) {
  baseCommit = git("merge-base", "HEAD", baseArgument).trim();
} else if (baseBranch) {
  git("fetch", "--no-tags", "origin", baseBranch);
  baseCommit = git("merge-base", "HEAD", "FETCH_HEAD").trim();
} else if (process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_REF === "refs/heads/main") {
  // A push to `main` that skipped a pull request: compare with the tip before the push. A new
  // branch has an all-zero `before`, so it has nothing to compare with.
  const { before } = z
    .object({ before: z.string() })
    .parse(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")));
  if (/^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
    baseLabel = "main before the push";
    baseCommit = before;
  }
}
if (baseCommit) sources.push([`${baseLabel}@${baseCommit.slice(0, 9)}`, baseCommit]);

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

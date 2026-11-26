# Upstream fixes for Pokebots

Pokebots releases from `stevmolina/pokebots`. It keeps the history, license, and notices from its
OpenBot fork. The last upstream merge was [PR #252](https://github.com/stevmolina/pokebots/pull/252).
The T3 schedule **Daily Pokebots upstream sync** is disabled.

## Take an upstream fix

1. Review the upstream advisory or fix. Identify the affected Pokebots builds and the upstream
   commit and dependencies that the fix needs.
2. In a worktree based on `origin/main`, apply the individual commit with `git cherry-pick -x` or
   adapt the patch and record its original commit. Keep its required attribution.
3. Verify the Pokebots behavior, frozen migrations, and released contracts that the patch touches.
   Open a focused PR with the advisory or patch reference and the check results.

## Current release channels

- Mac uses the [launchd updater](../AGENTS.md#after-merge-pokebots-app). Verify the staged revision
  and the installed app after approval.
- The [server image workflow](../.github/workflows/server-image.yml) builds and smoke-tests the
  self-hosted Linux image. A push to `main` updates `ghcr.io/stevmolina/pokebots:latest`. The VPS
  servers download it by themselves and install it when an owner selects Install in Server Settings >
  Updates ([VPS updates](docker.md#updates-from-the-app-on-a-vps-pokebots)).
- The [Dokploy runbook](pokebots-dokploy.md) covers the account API and browser app on matching
  `main` changes. The landing page has its own repository and deployment.

Run the [Pokebots release dry run](RELEASING.md#pokebots-release-dry-run) for an isolated source
preflight. Confirm signing and channel ownership before adding a release path. Keep the 60-day
Team API support window and the existing update paths during a compatibility release.

## Apply the Pokebots rename scripts to a branch

Two scripts make the Pokebots rename repeatable. Each one is safe to run again: a second run changes
nothing. Use them to bring any branch to the renamed state, and to fix the conflicts that the rename
causes.

| Script | What it does |
| --- | --- |
| `scripts/pokebots-rename-packages.ts` | Renames the 15 workspace packages and 2 build aliases from `@pokebots/*` to `@pokebots/*` in imports, manifests, config, scripts and docs. Rewrites `bun.lock` as text. Keeps the logging alias for frozen migrations, the Effect service tags, `src/backend/migrations/`, catalog comments and `plans/`. Then sorts and wraps imports with Biome. |
| `scripts/pokebots-rename-catalogs.ts` | Puts "Pokebots" in every catalog message value and What's New note, with the rules of `scripts/pokebots-brand-text.ts`. It keeps the phrases "Shared with OpenBot", "OpenBot GitHub App", "OpenBot Mobile" and "OpenBot Shared". |

Both scripts take `--check` (change nothing, exit 1 when a rewrite is pending), `--no-format`,
`--root <dir>` and `--report <file>`. The JSON report goes to `.openbot-build/` by default.

### Temporary `@openbot/*` aliases

Open branches still add new `@openbot/<package>` imports. Until they merge, the root `package.json`
keeps an alias for each package (`"@openbot/x": "workspace:@pokebots/x@*"`), so the old name resolves
to the same package in TypeScript, Vite, Metro and Bun. `scripts/legacy-openbot-scope.ts` lists them.
Remove the aliases once no open branch imports `@openbot/`.

### New "OpenBot" references

`bun run check:openbot-references` (the CI step "Check for the old product name") fails a pull request that
adds the word "OpenBot" or an `@openbot/` import to first-party code. It reads only the added lines, and
`scripts/openbot-references-allowlist.json` lists the released identities that may keep the old name:
data paths, keychain names, wire values, history and legal files. An `@openbot/` import is only a warning
while `scripts/legacy-openbot-scope.ts` exists. A pull request that brings upstream text on purpose, such
as the daily upstream sync, takes the label `allow-openbot-references`, and CI skips the check.

### Bring a branch up to date

1. Before you merge `main`, run both scripts on your branch, then `bun install --frozen-lockfile`.
   Commit the result. `main` made the same edit, so git finds nothing to resolve in those lines.
2. Merge `main`.
3. If a merge still conflicts, resolve the real conflicts by hand. For `bun.lock`, take the version
   from `main` (`git checkout origin/main -- bun.lock`) and run `bun install` after step 4.
4. Run both scripts again, then `bun install`, then commit. The scripts rename any old name that
   your side of a conflict brought back.

If `bun install --frozen-lockfile` fails after the scripts, the lockfile and a `package.json` disagree.
Run `bun install` and commit the new `bun.lock`. Do not run `bun install` first on a lockfile that still
has the old names: Bun cannot rename a workspace in place, so it resolves every version again.

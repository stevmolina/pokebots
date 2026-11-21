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
  self-hosted Linux image. A push to `main` updates `ghcr.io/stevmolina/pokebots:latest`. An app change
  on `main` can reach hosts that use the [VPS updater](../docker/vps-auto-update.sh).
- The [Dokploy runbook](pokebots-dokploy.md) covers the account API and browser app on matching
  `main` changes. The landing page has its own repository and deployment.

Run the [Pokebots release dry run](RELEASING.md#pokebots-release-dry-run) for an isolated source
preflight. Confirm signing and channel ownership before adding a release path. Keep the 60-day
Team API support window and the existing update paths during a compatibility release.

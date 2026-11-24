---
name: ship
description: Open a pull request for a finished branch and squash-merge it to main. Use when the user asks to ship a change or merge its pull request.
---

# Ship

Use the verification already done for the change. Turn on auto-merge for low-risk changes. GitHub merges them when the required check
passes. Automated reviews are background feedback.

1. Read `AGENTS.md` and the instructions for changed directories. Check `git status` and
   `git branch --show-current`. Work on a branch separate from `main`.
2. Fetch `origin/main` and inspect `git diff origin/main...HEAD`. Commit only the intended
   changes. Fix known defects before pushing. For a UI change, attach before and after
   screenshots. Reuse the smoke evidence when available.
3. Push the branch with `git push -u origin HEAD`. Use the existing PR or open one against
   `main`. Use `.github/PULL_REQUEST_TEMPLATE.md`. Name the affected areas, verification,
   model and harness. Link the PR in T3 when the tool is available.
4. Read the PR state, mergeability and head SHA with
   `gh pr view <pr> --json state,isDraft,mergeable,headRefOid`. If GitHub reports
   `CONFLICTING`, merge `origin/main` into the branch, resolve the conflict and push.
   If GitHub reports `UNKNOWN`, query again when it has calculated the merge state.
5. Turn on auto-merge: `gh pr merge <pr> --squash --auto`. Do not pass `--match-head-commit`:
   the head moves when the update workflow merges `main` into the PR. `main` requires the
   check `All required checks pass` and an up-to-date branch. The workflow
   `update-auto-merge-prs.yml` merges `main` into every auto-merge PR that falls behind and
   restarts CI, so do not rebase or update the branch by hand. GitHub merges when the check passes. Automated reviews do
   not hold up the merge. Do not use `--admin`, force-push or change branch protection.
6. Do not wait for CI in a foreground loop (`sleep`, `until`, repeated `gh pr checks`).
   Start one background command, `gh pr checks <pr> --watch --fail-fast --interval 30`, or
   `watch_pull_request` in T3. Then continue other work or end the turn. The end of the
   watch wakes you.
7. When a required check fails, read `gh run view <run> --log-failed`, fix the cause and push.
   For a flaky job, use `gh run rerun <run> --failed` one time. When the failure is in files
   that the PR does not change, it comes from `main`: fix `main` in a separate PR. Do not
   ask the user to merge with a failed required check.
8. Check `gh pr view <pr> --json state,mergeCommit` for `MERGED`. Report the PR, merge commit
   and verification. Follow the after-merge instructions in `AGENTS.md` for app changes.

Ask before merging changes that can lose user data, expose secrets or be hard to reverse.
Ask when a merge conflict needs a product decision.

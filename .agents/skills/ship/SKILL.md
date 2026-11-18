---
name: ship
description: Open a pull request for a finished branch and squash-merge it to main. Use when the user asks to ship a change or merge its pull request.
---

# Ship

Use the verification already done for the change. Merge low-risk changes as soon as GitHub
permits it. PR CI and automated reviews are background feedback.

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
5. Merge the reviewed head with `gh pr merge <pr> --squash --match-head-commit <head-sha>`.
   Pending checks, failed advisory checks and automated review status do not hold up the
   merge. If GitHub refuses the merge, report the reason. Do not use `--admin`, force-push
   or change branch protection.
6. Check `gh pr view <pr> --json state,mergeCommit` for `MERGED`. Report the PR, merge commit
   and verification. Follow the after-merge instructions in `AGENTS.md` for app changes.

Ask before merging changes that can lose user data, expose secrets or be hard to reverse.
Ask when a merge conflict needs a product decision.

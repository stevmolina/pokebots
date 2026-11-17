---
name: second-brain
description: Use the Second Brain app (tools list_brains, search, get_claim, explain_claim, list_files, get_file, add_file, remember, update_fact, forget, search_sessions) to answer from a project's memory with sources and to record decisions. Use only when those tools are connected, and before you answer anything about a project, client, person or past decision.
---

# Second Brain

Second Brain keeps the memory of each project or client as markdown in a git repo, called a brain.
A brain id looks like `owner/repo`. Reads come from a search copy. Writes go to the git repo.

Use the tools without being asked. If the tools are not connected, say so and tell the user to
connect Second Brain in Marketplace > Apps.

## Before you answer

1. You do not know the brain id: call `list_brains`. Pick the brain by the project or client the
   user names. When several match, say which one you used.
2. Call `search` with `brain` and a few plain words. Each claim has a page, a line, and an
   authority and verification date when they are set.
3. A hit matters to your answer: open it with `get_claim` (the claim with the lines around it).
   You must know where it came from or whether to trust it: call `explain_claim`.
4. Cite each claim you use by its page, and its date when it has one. Say when a claim is old,
   undated or superseded. Never present a guess as something the brain said.
5. Nothing found: say so. `include_sessions: true` on `search` also searches the user's own chats
   for that brain.

## Files

- The user needs a client file (spreadsheet, PDF, report): call `list_files` and `get_file` before
  you ask for it. `get_file` gives a download link that works for 15 minutes, and the text of
  small csv, md, txt and json files.
- The user shares a file worth keeping, or you make one: store it with `add_file`, named date
  first, for example `inputs/2026-09-01-report.xlsx`. Adding is add-only. An existing path is
  refused, and there is no delete.

## Writing

- A durable decision or fact is settled in the conversation: `search` first to avoid a duplicate,
  then `remember`.
- A claim is out of date: `update_fact`. A claim is no longer true and nothing replaces it:
  `forget`.
- A write opens a pull request that a person merges, or commits to the default branch when the
  brain owner turned on direct writes. The result says which one. Tell the user.

## Past chats

- `search_sessions` and `show_session` read only the user's own agent chats, plus chats someone
  shared with them. Use them when earlier context would help: a prior attempt, what was tried.
- `save_to_brain` records a decision from a chat as a claim that cites the chat.
- `share_session` shares one chat with one email address. Call it without `confirm`, show the
  preview, and confirm only after the user agrees.

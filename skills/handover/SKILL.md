---
name: handover
description: Writes a cold-start document that lets a fresh session (or a person) pick up exactly where this one stopped. It records what exists and where, what's verified, what's open, who owns each open item (an agent or the human), and a pickup prompt to paste into the next session. It also prunes the memory index. Use at the end of a long session, before context runs out, or when asked for a handover.
---

# Handover

A long session holds a lot that the repo doesn't: which branch is real, which
test is flaky for environment reasons, what the human decided in chat, and what
is half-done. A handover writes that down so the next session starts in
minutes, not an hour of re-reading.

## Write `HANDOVER-<YYYY-MM-DD>.md` at the repo or workspace root

Use `templates/HANDOVER.md`. The sections, in order:

- **§0 Read this first.** Three to five lines: what the project is right now,
  the one thing to do next, and the doc that supersedes this one, if any.
- **§1 What exists.** Each branch and worktree with its HEAD SHA and whether
  it's pushed. What's deployed where, and at which version. Paths, not prose.
- **§2 Verified state.** The gate command and its last result, with counts
  ("console 46 files · 594 tests, proof 14"). Anything that fails for
  environment reasons, and what that reason is.
- **§3 In flight.** Runs that are mid-way, and the exact command or run ID to
  resume each one. Uncommitted changes and why they're uncommitted.
- **§4 Open work, split by owner.** One table:
  `item | owner (agent or human) | blocked by | where`. Human-owned items are
  the ones no agent can do: real credentials, deploys to production, account
  sign-ups, payments, legal or design sign-off. If the agent column is empty,
  say so in plain words. That means the project is waiting on the human.
- **§5 Decisions made in chat.** Anything the human decided that isn't in the
  decision log yet. Quote their words and give the date. Then copy each one
  into the log.
- **§6 Traps.** Things that cost time and will cost it again. For example:
  "Node 25 breaks the console suite, so the gate pins 22", or "port 3000 is
  the demo, so kill the old holder first".
- **§7 Pickup prompt.** A fenced block to paste into a new session. It names
  this file, the next step, and the rules that hold: what not to push, which
  skills to load, and which ports are taken.

## Rules

- **Facts must be checkable.** Write SHAs, paths, counts and dates, never "the
  latest" or "recently". Convert relative dates to absolute ones.
- **Verify before you write.** Run `git status`, `git log -1` and the gate
  instead of relying on what you remember. A handover that's wrong is worse
  than none.
- **Supersede, don't append.** A new handover replaces the old one as the
  cold-start doc. Its §0 links back to the previous one, and the memory index
  points only at the newest.
- **Keep it under about 150 lines.** Link to plans and logs instead of
  restating them.

## Then update memory

If your harness keeps a memory index (for example `MEMORY.md`):

1. Add or update one line: `[Handover <date>](file) — <the one next step>`.
2. Remove index lines whose facts the handover has superseded, and delete
   memory files that are now wrong.
3. Keep the index to one line per memory. The details belong in the files.

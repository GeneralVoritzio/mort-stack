---
name: run-round
description: Runs a chunk of multi-agent work as one deterministic round. A planner splits the work into lanes that edit disjoint files, the lanes build in parallel, a verifier runs the gate (including every CI job, locally), one repair pass runs, the verifier checks again, and a scribe updates the docs. Agents return small typed reports, so the orchestrating session's context stays clean. Use when work needs more than one agent, or when asked to "run a round".
---

# Run a round

A round is a unit of work that ends **green or red, never "mostly done"**. It
runs as a script, not as a conversation. When you call agents one by one from
your own session, every report lands in your context. Ten lanes later, the
session is full of file dumps and you've lost the thread. A workflow script
keeps the lanes' output on disk. The script returns only the fields the next
step needs.

## Shape

```
Plan ──► Build (lanes, parallel) ──► Verify ──► Repair (once) ──► Verify ──► Scribe
           exclusive file sets         gate + CI      only if red      final
```

1. **Plan.** A planner reads the plan section for this round and splits it into
   two to four lanes whose **file sets don't overlap**. Each shared file (a
   lockfile, a route table) goes to exactly one lane. Any other lane that needs
   a change there notes the dependency in its report. The planner also writes
   the verify plan: the round's own acceptance turned into commands, plus the
   gate.
2. **Build.** The lanes run in parallel. Each one gets the house rules, its
   files, the other lanes' files (so it knows what not to touch), and the
   existing code or upstream project it should copy from. Each lane writes
   tests and runs the parts of the gate it touched.
3. **Verify.** A verifier that **defaults to red and fixes nothing.** It runs
   the verify plan itself and doesn't trust the lane reports. It checks that
   every claimed closure is real (a false closure is a blocking defect), that
   nothing was written outside the allowed tree, and that the full gate is
   green.
4. **Repair.** If the verdict is red, one repair agent fixes exactly the listed
   defects, nits included, and the verifier runs again. If the second verify is
   still red, the round stops and a human looks. A third automatic attempt
   tends to rewrite good work.
5. **Scribe.** You do this step in your own session, not in the script. Update
   the plan document, the decision log and the handover from the returned
   object: which rows closed, what's still open, and anything only a human can
   do.

`templates/round.workflow.js` is a working Claude Code Workflow script for this
shape. Copy it, then fill in the house rules and the arguments.

## Typed reports, not prose

Give every agent a schema and ask only for what the next step reads:

| Role | Returns |
|---|---|
| Planner | `lanes[{name, rows, work, files, mirror}]`, `verifyPlan` |
| Lane | `lane, done, closed[], filesChanged[], tests, gate, crossings[], notes` |
| Verifier | `verdict (green or red), checks[{name, result}], defects[{lane, severity, description, fix}], humanActions[]` |

`crossings` means edits the lane needed in another lane's files and didn't
make. `humanActions` means things no agent can do: deploys, real credentials,
account sign-ups, legal sign-off. Bring those to the user. Never let an agent
work around one.

## Which model does what

- Lanes, repair and research run on the strongest coding model you have.
  They do most of the work.
- The planner and the verifier run on the model you trust most for judgement.
  A cheap verifier ends up approving everything.
- Put these choices in your `CLAUDE.md`, not in this skill.

## House rules every agent gets

Put these at the top of every prompt. They override whatever the agent would
otherwise do:

- **Where to write.** The worktree or path the round owns. Other rounds may be
  running in other worktrees at the same time.
- **What never to do.** No agent commits, pushes, deploys or publishes. Agents
  never read secret files, and only use the ports they were given. The
  orchestrator commits.
- **What to read first.** The plan section, and the rows this round closes.
- **Copy, don't invent.** Copy existing working code or a mature upstream
  project, and cite it (see `cite-precedent`). Copied files carry a provenance
  header.
- **Frozen seams.** List any contracts or interfaces that must not change
  unless the round explicitly amends them.

## The gate includes CI, run locally

The verifier runs **every job** in your CI config locally before it can call
the round green. A green unit suite with a red integration job is a red round.

1. Read `.github/workflows/*.yml` (or the equivalent for your CI) and list
   every job.
2. Run each one with `act -j <job>` if `act` and Docker are available.
   Otherwise run the job's `run:` steps directly, in order, with the same
   environment variables and tool versions the job pins.
3. Jobs that need privileges (Docker, a VM, a GPU) run in a container or on the
   matching host. A job that can't run on this machine is reported as
   `NOT RUN: <reason>`. It never counts as a pass.
4. Post a per-job table (`job | result | duration | log tail on failure`) in
   the verifier's checks. If a PR exists, post it there too before anyone
   merges.

This matters most when hosted CI is off or out of minutes. In that case,
"CI passed" only means anything if someone ran it.

## Things that went wrong before

- **Usage limits kill lanes halfway through an edit.** A relaunched lane must
  read the files it inherited before it writes anything.
- **Workflows can resume.** Completed agent calls with unchanged prompts return
  their cached results. To resume a run from an earlier session, copy that
  session's workflow journal directory into the current session first, then
  resume by run ID.
- **Browser work stays in your session.** A lane can't drive a browser tab
  whose permissions belong to your session. Capture first, then hand the lanes
  files.
- **Retire superseded checks by name** (mark them SKIP with a reason). If you
  delete them, the history stops making sense.

## Done means

- The final verdict is green, every CI job ran locally (or is listed as NOT RUN
  with a reason), and the plan rows are updated by the scribe.
- `humanActions` are in front of the user.
- Nothing is committed, pushed or deployed unless the user asked for it.

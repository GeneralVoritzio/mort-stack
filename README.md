# mortstack

Agent skills I've refined over months of shipping with Claude Code, with the
project-specific parts removed so anyone can use them. Each one is a plain
[Agent Skill](https://agentskills.io) (`skills/<name>/SKILL.md`) and works in
Claude Code, Codex, Pi, and any other harness that reads skills.

## Skills

| Skill | Say | What it does |
|---|---|---|
| `replicate-ui` | "replicate this UI" | Rebuilds any page or app 1:1. It measures the original once into a spec and a check list, builds against them, and passes only when every check is green. |
| `run-round` | "run a round" | Runs multi-agent work as one deterministic workflow: plan, lanes, reviewer, gate (including your CI, run locally), then a scribe. Agents return only small typed reports, so your session's context stays clean. |
| `handover` | "write a handover" | Writes a cold-start document that lets a fresh session pick up exactly where this one stopped. It splits open work into what an agent can do and what only you can do. |
| `cite-precedent` | (automatic) | For any non-obvious decision, finds the mature open-source project that already solved it, follows that project, and logs the decision with its citation. |

Some skills call others. Install the ones they need too:

- `run-round` uses `cite-precedent` when a lane has to make a decision.
- `replicate-ui` can run its build as a `run-round` when the page is large.

## replicate-ui, by example

<!-- TODO: meta demo, original vs rebuild side by side, both at 1400px. -->

## Install

```bash
npx skills add GeneralVoritzio/mortstack
```

Or copy them by hand:

```bash
git clone https://github.com/GeneralVoritzio/mortstack
cp -R mortstack/skills/* ~/.claude/skills/   # Claude Code
cp -R mortstack/skills/* ~/.codex/skills/    # Codex
```

## Requirements

- `replicate-ui`: Node 20+ and Playwright (`npx playwright install chromium`) for
  `capture.mjs` and `measure.mjs`.
- `run-round`: a harness with subagents. Claude Code's Workflow tool is the best
  fit, and any subagent tool will work.
- `run-round`'s local CI step: `act` or Docker if you want to run GitHub Actions
  jobs locally. Without them it runs each job's steps directly.

## Make them yours

These are starting points, so edit them. Keep personal settings in your
`CLAUDE.md` or `AGENTS.md`, not in the skills, so you can update the skills
without losing them. That covers things like which model each role runs on,
where reference captures are saved, and your gate command.

## License

[MIT](LICENSE)

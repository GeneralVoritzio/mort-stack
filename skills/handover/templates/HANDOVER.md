# Handover — <D Mon YYYY>

## §0 Read this first

<What the project is right now, in one line.>
**Next step:** <the one thing to do next>.
Supersedes: [HANDOVER-<previous date>.md](HANDOVER-<previous date>.md).

## §1 What exists

| Thing | Where | State |
|---|---|---|
| main | `<path>` | `<sha>`, pushed / N ahead of origin |
| <feature branch> | worktree `<path>` | `<sha>`, not pushed |
| <deploy> | `<url or env>` | version `<x.y.z>` |

## §2 Verified state

- Gate: `<command>` → <green/red> on <date> (<suite counts>).
- Known environment failures: <what fails, why, and that it's not a defect>.

## §3 In flight

- <run or task>: stopped at <step>. Resume with `<command or run id>`.
- Uncommitted: <files>, because <reason>.

## §4 Open work

| Item | Owner | Blocked by | Where |
|---|---|---|---|
| <item> | agent | — | <plan row / issue> |
| <item> | human | <credential, sign-off> | <link> |

<If the agent column is empty, say so plainly.>

## §5 Decisions made in chat

- <date>: "<the human's words>" → <what it means>. Logged as <decision id>.

## §6 Traps

- <thing that cost time> → <what to do instead>.

## §7 Pickup prompt

```
Read <path>/HANDOVER-<date>.md §0–§6 first. Next step: <step>.
Rules: <don't push X>, <load skills Y>, <ports taken: …>.
```

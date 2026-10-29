---
name: cite-precedent
description: For any decision that isn't clear-cut (a storage shape, a key-rotation scheme, a limits model, a config format, a naming convention, an error taxonomy), finds the mature open-source project that already solved the same problem, follows its shape, and records the decision with the citation. Use whenever you or a subagent is about to design something a well-known project has already designed.
---

# Cite precedent

If you're deciding something non-obvious, someone mature has almost certainly
decided it already. They have also lived with the consequences, reversed what
didn't work, and filed the bug reports. Copy their shape and say where it came
from. A bespoke design that looks smaller today usually costs more by the third
edge case.

## When it applies

It applies to any decision where a reasonable engineer could pick two different
shapes:

- data shapes and storage layouts
- rotation, versioning and migration schemes
- limits, quotas and plan models
- config formats and naming conventions
- error enums, state machines and audit-event schemas
- security-sensitive defaults

It doesn't apply to choices the codebase already makes. Follow the codebase.

## How

1. **Name the problem in one line**, the way the precedent would describe it.
   For example: "encrypt with the newest key, decrypt with any listed key".
2. **Find one or two mature projects that solved it.** Prefer projects that
   are widely deployed, actively maintained, and whose licence lets you read
   them. Read their actual code or docs, not a blog post about them. Check
   their changelog and issues for **reversals**: what they tried first and
   later changed.
3. **Adopt their shape**, including field names where it makes sense. Note
   what you deliberately didn't take, and why.
4. **Record it.** Add a line to the decision log (`DECISIONS.md`, or wherever
   the project keeps them), and to the PR or lane report when you're inside a
   round:

   ```
   | D-042 | Key rotation: encrypt with newest, decrypt with any listed |
   |       | Precedent: Rails ActiveRecord Encryption `previous:` keys; Django SECRET_KEY_FALLBACKS |
   |       | Not taken: Rails' per-attribute key derivation (we encrypt whole records) |
   ```

## Worked precedents

These have held up well:

| Problem | Precedent |
|---|---|
| Connection config in environment variables | 12-factor app; Heroku `DATABASE_URL` |
| Secret and key rotation | Rails Active Record Encryption `previous:`; Django `SECRET_KEY_FALLBACKS`; Vault/OpenBao transit key versions |
| Plan limits and quotas | GitLab `plan_limits` table |
| Allowlisting in a secrets scanner | gitleaks `[allowlist] paths` |
| Feature flags | OpenFeature's evaluation model |
| Audit events | CloudTrail event shape (actor, action, resource, outcome, request id) |
| Retries and idempotency | Stripe `Idempotency-Key` |

## In subagent prompts

When you hand design work to another agent, add this line to its instructions:

> For every non-obvious decision, include a `precedent` line: the project,
> the file or doc, what you adopted, and what you deliberately did not.

A reviewer should treat an unexplained bespoke design as a defect.

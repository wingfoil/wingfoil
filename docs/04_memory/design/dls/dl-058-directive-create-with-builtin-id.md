---
id: "dl-058-directive-create-with-builtin-id"
type: decision-log
title: "May `wingfoil directive create` take the id of a built-in directive? After task-057 it silently creates a shadowing override"
status: ready
context: "dev-loop-review"
release: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

`directive create`'s already-exists check looks **only** in `custom/`: `src/core/index.ts:701` on
`main` (`8a6a091`) — `const relativePath = \`.wingfoil/directives/custom/${name}.md\``, then
`documentExists(absolutePath)` → `CONFLICT` "directive already exists: <name>".

**On `main` today** the check happens to cover the P3.8 ids, because `init` scaffolds all ten starter
directives into `custom/`. Reproduced: fresh repository, `wingfoil init --template Scrum` →
`.wingfoil/directives/built-in/` empty, `custom/` holds `architecture, code-quality, code-review,
determinism, doc-versioning, documentation, security, security-secrets, testing, traceability`; then
`wingfoil directive create --name code-quality` → `error: directive already exists: code-quality`,
exit 1.

**After `task-057-builtin-directive-templates`** (branch, `9b77243`, not merged) the six P3.8 templates
(`architecture, code-quality, code-review, documentation, security, testing`) are installed into
`built-in/` instead, and `src/core/index.ts:701` is unchanged (same line on `9b77243`). The task records
the consequence (`git show 9b77243:docs/self/docs/04_memory/v0.2/task-057-builtin-directive-templates.md`,
lines 191-195): `directive create --name code-quality` "now SUCCEEDS and creates a `custom/` override of
the built-in, which `directives list` reports as a shadow … no element ratifies whether `directive
create` should accept a built-in id". The task changed the collision test to use `determinism`, still a
`custom/` starter (`test/core/directive-create.test.ts`, AC2).

What the authorities say:

- **BDD P3.1** (`P3.1-directive-create.feature`), error scenario: "Given a **custom** directive
  `no-direct-db-access` already exists … exits with code 1 and message `directive already exists: …`" —
  silent about built-ins.
- **`dl-037`** (`ready`) / `spec-012` §5: when two directives share an id, `custom/` wins over
  `built-in/`, and the shadow is reported as a warning — so a `custom/` override of a built-in is a
  supported configuration.
- **REQ-SEC-07** protects built-ins against **removal** ("built-in … cannot be removed"), not against
  being overridden.

**Related question (2026-10-01, from `task-133`'s independent review).** The reverse direction,
removing a custom file that shadows a built-in, is refused while the id is bound:
`checkUnreferenced` (`src/core/directive-assign.ts`) checks only that the id is bound, not whether the
binding would still resolve after the removal. After the removal the id resolves to the built-in
(`dl-037`), so REQ-SEC-07 (b)'s "still referenced" arguably does not apply. Since `task-133` binds
`security` globally, every shipped built-in is bound in a fresh `init` project, so a user can no
longer delete a customisation of any built-in without first unbinding it. The workaround is unbind,
commit, remove, rebind. `test/core/directive-remove.test.ts` pins today's refusal. The ruling on this
decision should settle both directions of shadowing together.

## Decision

*Approver to choose.*

1. **Allow it, and say so** (recommended): `directive create --name <built-in id>` creates the `custom/`
   override. Make the command's success output mention that it now shadows the built-in (the same fact
   `directives list` already reports), and add a P3.1 scenario pinning it. Matches `dl-037`'s override
   model and what `task-057` ships; the only change beyond ratification is the
   output hint.
2. **Refuse it**: extend the existence check to `built-in/` with a distinct message (e.g. `directive
   '<id>' is built-in; edit a copy instead` or a `--override` flag to allow it). Protects users from
   shadowing a baseline rule by accident; overriding still possible by hand.
3. **Allow it silently** — ratify `task-057`'s current behaviour as is. Cheapest; the only signal is the
   shadow warning in `directives list`, which a user must go looking for (`dl-050`).

## Rationale

- Overriding a built-in is a legitimate customisation `dl-037` already designed for; refusing it at
  `create` while honouring a hand-made override would be inconsistent.
- The risk is accidental shadowing — a user picking a natural name like `security` without knowing a
  built-in exists. Option 1 addresses that at the moment it happens, at the cost of one output line.

## Actions

- Owner **approver**: choose before `task-057` is approved (it introduces the behaviour).
- If 1: add the output hint, a test and the P3.1 scenario, in `task-057` or a follow-up.
- If 2: extend `directiveCreateFn`'s existence check and add the refusal scenario to P3.1.
- Hand the outcome to `task-052` (`directive remove`), which faces the mirror question (removing a
  `custom/` override that shadows a built-in).

Related: `dl-037`, `dl-050`, `dl-059`, BDD `P3.1`, `spec-012` §5, REQ-SEC-07,
`task-050-directive-create`, `task-057-builtin-directive-templates`, `task-052`.

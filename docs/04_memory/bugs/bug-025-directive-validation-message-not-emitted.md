---
id: "bug-025-directive-validation-message-not-emitted"
type: bug
title: "Directive validation reports the file as invalid but never emits P3.5's required message"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3.2"
feature: "P3.5"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`P3.5-project-directives.feature`'s third scenario requires two things of a directive file missing its
`name` header — that loading report it invalid, **and** that the message be
`invalid directive: missing required field 'name'`. Only the first is implemented; that exact string
appears nowhere in `src/` or `test/`, only in the feature file.

## Steps to Reproduce

1. `wingfoil init --template Scrum` in a fresh git repository.
2. Add `.wingfoil/directives/custom/no-direct-db-access.md` with frontmatter carrying `id`, `type`,
   `kind` and `title` but **no** `name`:

   ```
   ---
   id: no-direct-db-access
   type: directive
   kind: custom
   title: "No direct DB access"
   ---

   rule body
   ```

3. `wingfoil directives list`.

## Expected Behavior

Per the BDD scenario "Error - a directive file missing required header fields":

```gherkin
Given a custom directive file lacks its required "name" header
When directives are loaded
Then loading reports the file as invalid
And the message is "invalid directive: missing required field 'name'"
```

Both `Then` clauses hold — the load fails **and** the operator sees that message.

## Actual Behavior

The first clause holds; the second does not. Observed on the compiled CLI at
`task-054-project-directives`'s branch (`3d2f6a3` build):

```
$ wingfoil directives list
error: E_VALIDATION name (/…/.wingfoil/directives/custom/no-direct-db-access.md): Invalid input: expected string, received undefined
exit=1
```

The wording is Zod's generic missing-key text, surfaced through the shared two-pass pipeline. At the
library level the same input yields `ValidationError` with a single issue
`{ code: 'E_VALIDATION', path: 'name', message: 'Invalid input: expected string, received undefined' }`.

Greps that establish the gap:

- `grep -rn "invalid directive: missing required field" src/ test/` → **0 matches**
- same grep over `docs/` → exactly one hit, the feature file itself
  (`docs/02_requirements/02_bdd/features/p3-directives/P3.5-project-directives.feature:23`)

## Notes

**Where the fix belongs.** `DirectiveFrontmatter` (`src/directives/schema.ts`) declares `name` required
— that is what makes the file fail — but the message is produced by `runValidation`
(`src/validation/`) from Zod's issue list and rendered by the CLI error formatter, so emitting P3.5's
wording means either a schema-level custom message or a directive-specific mapping in
`loadDirectives` (`src/core/loaders.ts`). Note that `loadDirectives` already special-cases one
directive-specific failure with bespoke wording (`E_MISSING_FRONTMATTER` /
`"directive file has no frontmatter block"`), so there is precedent for the mapping living there.

**Why it is filed rather than fixed in `task-054-project-directives`.** That task raised it: it is the
only element in Memory carrying `ref: "P3.5"`, so an unimplemented clause of that feature has nowhere
else to land. Its own scope is P3.5 scenario 1 (the `built-in/`/`custom/` storage layout) and it
deliberately did not open `src/directives/` or `src/core/loaders.ts` — `task-050` (P3.1) and
`task-053` (P3.4) are editing that ground concurrently, and a third writer would have produced
conflicts for no benefit. Whoever fixes this should expect to coordinate with, or follow, those two.

**Severity rationale — `low`.** No incorrect behaviour: the invalid file *is* rejected, the command
exits 1, and nothing loads a malformed directive. What is missing is the specified operator-facing
wording, so the cost is diagnosability and an unmet acceptance-contract clause, not correctness. The
approver may reasonably raise this on the grounds that an exact BDD message is a contract rather than
a nicety — the `triaged` call is theirs.

**Scope note.** This bug is about the *message* only. The `name`-is-required rule is already correct
and tested (`test/directives/schema.test.ts:49`); do not re-open that.

## Triage & Execution Notes

- capture (`bug-ingest`): raised from `task-054-project-directives`'s review gate, where the task's own
  notes had claimed this scenario "already covered" by `test/directives/schema.test.ts`. The approver
  rejected that claim as half-true — the test discharges the first `Then` clause only — and required
  the uncovered clause be filed as an element rather than left as prose in a done task's notes.
- `release:` deliberately left empty — scheduling is `release-planning`/`build-backlog`'s stamp
  (dl-016), not this report's.

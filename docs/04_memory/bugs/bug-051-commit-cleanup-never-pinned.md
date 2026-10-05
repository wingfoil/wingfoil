---
id: "bug-051-commit-cleanup-never-pinned"
type: bug
title: "`commitPaths` never passes `--cleanup`, so the commit-body normal form spec-008 and CLAUDE.md §5.1 declare is only true under git's default config"
status: in-review
severity: "medium"
release-origin: "v0.2"
release: "v0.3"
feature: "P1.7"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

Every commit the tool makes goes through `commitPaths` (`src/storage/commit.ts:60`), which runs
`git commit --only --quiet -m <message>` with **no `--cleanup`**. The commit-body normal form that
`dl-067-reason-trailer-contract` clause 3 declares — and that `spec-008-cli-grammar` §2 and CLAUDE.md
§5.1 describe — is therefore not a property of the tool at all: it is whatever the *user's* or
*repository's* `commit.cleanup` config happens to be. Under `commit.cleanup=strip`, a legal setting, a
reason line beginning `#` is silently deleted by git and read back short; under `verbatim` the declared
whitespace normalization does not happen either. Exit code `0`, no diagnostic, in every case.

## Steps to Reproduce

Measured 2026-09-21 against `main`'s build at `ba2cad0` (`npm ci` + `npm run build`, exit 0),
`git version 2.43.0`, in a throwaway `git init` project scaffolded by `wingfoil init --template scrum`
with a `defaults.states` block and an `approver` member added by hand (the scaffold ships neither —
see `bug-030` and `dl-071`).

1. Read the call site:

```
$ sed -n '57,61p' src/storage/commit.ts
  // `--only -- <paths>` records exactly these paths, whatever else is staged: anything a caller or
  // another tool already staged stays staged and uncommitted (bug-027). A plain `git commit` would
  // commit the whole index under a subject that names only this operation.
  runGit(root, ['commit', '--only', '--quiet', '-m', message, '--', ...paths], options);
```

No `--cleanup` anywhere in the file, or in the repository:

```
$ grep -rn "cleanup" src/
(no output)
```

2. **`commit.cleanup=strip` silently deletes a reason line.** Same reason text, two configs:

```
$ git config commit.cleanup strip
$ node dist/cli.js memory approve adr-005-t5 \
    --reason $'approved because the guard landed\n#1234 tracks the follow-up\nand the suite is green'
$ echo $?; git log -1 --format='%B' -- docs/memory/adr/adr-005-t5.md | cat -A
0
wf(adr): approve adr-005-t5 [pending M-bM-^FM-^R approved]$
$
Approver: Test User <test@example.test> (approver)$
Reason: approved because the guard landed$
and the suite is green$                        # <- "#1234 tracks the follow-up" is GONE
$
```

```
$ git config --unset commit.cleanup
$ node dist/cli.js memory approve adr-006-t6 --reason <the same three lines>
$ git log -1 --format='%B' -- docs/memory/adr/adr-006-t6.md | cat -A
wf(adr): approve adr-006-t6 [pending M-bM-^FM-^R approved]$
$
Approver: Test User <test@example.test> (approver)$
Reason: approved because the guard landed$
#1234 tracks the follow-up$                    # <- kept
and the suite is green$
$
```

The deleted line is not reported anywhere: the verb exits `0` with its normal success payload, and
`memory history` reads back the short reason as if that were what the approver wrote.

3. **The `#` must be at column 0**, i.e. on a continuation line of a multi-line reason — which is
   precisely the shape `dl-067` clause 2 ratified as legal. A `#` in the *first* line survives, because
   git sees `Reason: #1234 …`:

```
$ git config commit.cleanup strip
$ node dist/cli.js memory approve adr-004-t4 --reason $'#1234 regression must not recur\nsecond line kept'
$ git log -1 --format='%B' -- docs/memory/adr/adr-004-t4.md | cat -A
…
Reason: #1234 regression must not recur$       # <- survives: not at column 0
second line kept$
```

4. **`commit.cleanup=verbatim` breaks the declared normalization in the other direction.** `dl-067`
   clause 3 states the recorded text is what `cleanup=whitespace` stores — per-line trailing whitespace
   stripped, blank-line runs collapsed. Under `verbatim` neither happens:

```
$ git config commit.cleanup verbatim
$ node dist/cli.js memory approve adr-007-vverbatim --reason $'line one   \n\n\nline two\n…'
$ git log -1 --format='%B' -- docs/memory/adr/adr-007-vverbatim.md | cat -A
…
Reason: line one   $      # <- trailing whitespace PRESERVED
$
$                         # <- the two-blank-line run PRESERVED
line two$
```

5. `scissors` was measured too and behaved like the default for `-m` input (the scissors line was kept,
   nothing truncated). So of the four modes, two diverge from the declared form and two do not.

## Expected Behavior

The commit-body normal form is a property of the tool: `commitPaths` pins `--cleanup` explicitly, so
the same `--reason` produces the same stored body in every checkout, and `dl-067` clause 3 /
spec-008 §2 / CLAUDE.md §5.1 describe what the tool actually does.

## Actual Behavior

The normal form is inherited from ambient git config. A legal `commit.cleanup` value silently deletes
recorded justification (`strip`) or silently keeps whitespace the project declares it removes
(`verbatim`), with no error, no warning, and no way for a reader of the history to know which mode was
in force.

## Notes

### Why this is worth more than its one-line fix

The fix is one argument. What it protects is the property every reason-related artefact now assumes:

- `dl-067` clause 3 ("Normalization declared, not implicit … The writer applies it, so round-trip
  equality is assertable rather than approximately true") is **not** assertable while the mode is
  ambient — a round-trip test passes or fails depending on the developer's `~/.gitconfig`.
- `dl-067` E3 measured git's normalization and reported it as a fact about the tool. It is a fact about
  the *default*; E3's scratch reproduction did not vary `commit.cleanup`.
- `task-072`'s branch has since strengthened the claim rather than qualified it. At `4c1ca06`,
  `normalizeReason`'s doc comment reads: "`commitPaths` (`src/storage/commit.ts`) commits with `-m`,
  so git's `cleanup=whitespace` strips per-line trailing whitespace… Applying both HERE, on the way
  in, is what turns 'approximately what you typed' into an assertable equality: what
  `parseReasonBlock` reads back out of the commit is exactly this function's output." That last
  sentence is the property this bug falsifies — it holds only while `commit.cleanup` is unset.
- REQ-SEC-02 makes git history the audit trail. Mode `strip` means the trail can be shorter than what
  the approver typed, with the tool reporting success.

### Blast radius — every commit, not just the reason ones

`commitPaths` is the single commit primitive: `memory add`, `submit`, `approve`, `reject`, `deprecate`,
`dna set`, `directive create/assign/remove` and `init` all reach git through it. Subjects are
single-line and unaffected in practice; the bodies of the four reason-bearing verbs are where the
damage lands.

### It is `task-018`'s file, and that matters for sequencing

`src/storage/commit.ts` is owned by `task-018`; `bug-027` already shaped the `--only`/pathspec
behaviour on the same line. A fix here is a one-token change to a merged, widely-depended-on primitive,
so it wants its own diff and its own characterization test (set `commit.cleanup` to each of the four
modes in a scratch repo, assert the stored body is identical) rather than riding
`task-072-fix-reason-trailer-contract`, which is already carrying the reason grammar.

### Which mode to pin is a real choice, not an obvious one — but a small one

`whitespace` matches what `dl-067` clause 3 already declares and what today's default already does, so
it changes nothing for anybody and makes the declaration true; that is the obvious candidate.
`verbatim` would let a reason keep its exact bytes, which is closer to spec-008 §2's original
"recorded verbatim" wording — but `dl-067` deliberately ruled that wording unachievable and replaced
it. Recording the choice is cheap; this report does not make it.

### Severity `medium`

`low-medium` was the framing it was raised with. `medium`, because the failure is a **silent loss of
recorded audit content** under a configuration a user is entitled to set, on the artefact REQ-SEC-02
names as the audit trail. Against a higher grade: nothing on this project sets `commit.cleanup` (the
178 governance commits on `main` at `ba2cad0` are all consistent with the default), the damage is
confined to reason bodies, and the fix is one argument with no design question of substance.

### Related

`dl-067-reason-trailer-contract` (`ready` — clause 3 is the declaration this bug falsifies; E3 is the
measurement that assumed the default), `bug-042-reason-text-has-no-contract-against-commit-trailer`
(`planned`), `task-072-fix-reason-trailer-contract` (implements `dl-067`; its round-trip assertions
inherit this fragility), `spec-008-cli-grammar` §2 (`approved` — the `--reason` row),
`task-018` (owns `src/storage/commit.ts`), `bug-027` (the previous change to the same `git commit`
invocation), `task-041-mandatory-reason-on-verbs`, `bug-050-reason-control-characters-fabricate-history-entries`
(the other "reason text meets an assumption about commit bodies" defect from the same review),
REQ-SEC-02, REQ-SEC-04, P1.7/P1.8/P1.9, CLAUDE.md §5.1.

## Triage & Execution Notes

Raised during the round-6 governance ingest (2026-09-21), from the review of
`task-072-fix-reason-trailer-contract`. Filed unfixed — the agent stops at `open`.

The `strip` reproduction was received as a reviewer's measurement and **re-measured here from
scratch**, including the control run under the default mode that proves the line is kept without the
config. Two additions came out of re-measuring and are recorded because the received framing did not
have them: the `#` must be at **column 0** (a `#` opening the reason survives, step 3), and
`verbatim` breaks the same declaration in the opposite direction (step 4) — so the bug is not only
about dropped `#` lines.

Not attempted: editing `src/storage/commit.ts`, choosing the mode to pin, or running the project's own
suite under a non-default `commit.cleanup` (worth doing when the fix is scoped — it would show whether
any existing test would have caught this).

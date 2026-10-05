---
id: "task-086-fix-reason-control-chars-history-forgery"
type: task
title: "Stop a `--reason` containing the git-log framing control characters from fabricating a `memory history` entry whose sha is caller-supplied text"
status: done
release: "v0.2"
priority: "high"
tags: ["v0.2", "memory", "security", "audit-trail"]
ref: "bug-050-reason-control-characters-fabricate-history-entries"
kind: "fix"
bug: ["bug-050-reason-control-characters-fabricate-history-entries"]
depends_on: ["task-072-fix-reason-trailer-contract"]
tmpl_version: 260703
---

## Description

`src/memory/git-log.ts` frames `git log` output with `FIELD_SEP` (`0x1f`) and `RECORD_SEP` (`0x1e`),
documented as characters "a real commit subject/body never contains, so splitting on it needs no
escaping". `--reason` is arbitrary free text that lands in the commit body, so that documented
guarantee is false by construction.

A reason carrying `0x1e` splits one commit's record in two, and `wingfoil memory history` then prints
a **fabricated entry whose `sha` is the caller-supplied text**, emits `fatal: invalid object name` on
stderr, and reports the genuine approval with `from: null`. The verb exits `0` and reports success.

This is the audit trail the Memory verbs exist to produce (**P1.7**, **P1.10**), in the release that
ships those verbs. An operator can forge a history entry with an ordinary argument and no privilege.
`task-072`'s ratified `Reason:` grammar does **not** close it — `bug-050` measured that on task-072's
own branch — so do not assume the trailer contract helps.

## Acceptance Criteria

- **AC1** — Reproduce the forgery first, end to end, against the CLI as built from this branch's base,
  and record the exact commands and output. A fix whose defect was never reproduced by the person
  fixing it is not accepted here: `bug-050` gives the recipe, but re-derive it rather than pasting it.
- **AC2** — After the fix, a reason containing `0x1e`, `0x1f`, or both, at any position — start, middle,
  end, repeated, and as the entire reason — produces a `memory history` output with **exactly one**
  entry per commit, correct `sha`, correct `from`/`to`, and no `fatal:` on stderr.
- **AC3** — The reason text itself is preserved in whatever form the design chooses (escaped, rejected
  at input, or parsed by a framing that cannot collide). If the chosen design **rejects** such a
  reason instead of carrying it, the refusal must be an explicit error at exit `2` naming the offending
  character — never a silent strip, and never exit `0`.
- **AC4** — Whatever guarantee replaces the current one is **stated truthfully** in the TSDoc of
  `git-log.ts`. The present comment asserts something false; leaving a weaker-but-true statement is
  required, and it must be derivable from the code rather than aspirational.
- **AC5** — A test pins the forgery itself, not only the happy path: it must fail against the current
  code. State the command that shows it failing before the fix and passing after.
- **AC6** — Other control characters are swept, not assumed. Establish what the parser does with `0x00`,
  `0x0a`, `0x0d` and any other character the framing or the `--format` string relies on, and either fix
  them in the same pass or record why each is harmless, with the command that settles it.
- **AC7** — `dl-067`'s `Reason:` block contract (CLAUDE.md §5.1, ratified via `task-072`) is not
  weakened. If the fix interacts with it, say exactly how; the two must be consistent, and neither may
  silently reinterpret the other.
- **AC8** — All six gates green; the full `tsc --noEmit -p tsconfig.json` silent.

## Implementation Notes

- Read `task-072-fix-reason-trailer-contract`'s Execution Notes first (`dl-015` read_related): it owns
  the `Reason:` grammar and measured that its contract does not close this hole.
- The framing lives in `src/memory/git-log.ts` (`FIELD_SEP`, `RECORD_SEP`) and is consumed by the
  history reader; `memory approve`/`reject` are the write side that carries `--reason` into the body.
- Design space worth weighing before choosing, and the choice belongs in the design notes: escape the
  separators on write; use `git log -z` / `%x00`-style framing that cannot collide with body text;
  parse by commit count rather than by separator; or refuse the input. Each has a different blast
  radius on already-committed history, and **the fix must not make existing commits unreadable** —
  whatever is already in `main`'s history must still parse.
- Classify every AC per `dl-014`/T1 before writing code. AC1/AC2/AC5 are red-first by construction.

## Execution Notes

<!-- Running log filled in per dev-loop phase (design / red / green / refactor / review). -->

### start — role: developer

`status: backlog → in-progress` (`fa77672`). `bug:` is non-empty, so `bug.sync_state` ran as its own
commit: `bug-050` `planned → in-progress` (`dc06bfb`).

Worktree `/home/robypomper/Workspaces/.wf2-wt/task-086`, branch
`task/task-086-fix-reason-control-chars-history-forgery`, from `main` at `710a824`.
`npm ci --prefer-offline --no-audit --no-fund` → `added 498 packages`, exit 0.

### design — role: architect

Directives loaded: architecture, determinism, traceability (architect); code-quality, testing,
determinism (developer); doc-versioning, documentation, security-secrets (global).

#### `read_related` (`dl-015`, HARD gate)

- **`task-072-fix-reason-trailer-contract` (`done`) — Execution Notes read in full**, the only entry
  in this task's `depends_on`. Consequences taken on, each of which shaped the choice below:
  1. **The grammar has one home and three consumers.** task-072 put `normalizeReason`,
     `reasonDefect`, `parseReasonBlock` and `parseApproverTrailerLine` in
     `src/memory/commit-message.ts` and made `src/core/require-reason.ts` (the exit-`2` boundary),
     `formatMemoryCommitMessage` (the writer) and `src/memory/audit.ts` (the reader) consume them.
     Anything I add to that grammar is a change to a *ratified* contract, not an implementation
     detail — which is precisely what AC7 forbids doing silently.
  2. **task-072's `reserved-trailer-line` check runs over `normalized.split('\n')`.** `0x1e` is not a
     newline, so a forged `Approver:` inside a reason is mid-line and no rule sees it. I re-measured
     this rather than taking bug-050's word for it (see "The sweep", row `0x1e`).
  3. **`normalizeReason` already maps `\r\n?` → `\n`**, which is why `0x0d` is not a separate face of
     this bug (sweep row `0x0d`).
  4. **task-072 deliberately refused to widen clause 4 beyond its measured evidence** — it added
     exactly one rule (`trailing-trailer-paragraph`) and flagged it in its review summary as "the one
     extension beyond dl-067's literal text, for the approver to ratify or strike". The same
     evidentiary bar applies to me.
- **`dl-067-reason-trailer-contract` (`ready`) — read in full**, named by AC7. Clause 3 declares the
  normalization as git's `cleanup=whitespace` "and nothing more"; clause 4 declares exactly one
  content refusal. Both are argued from a measured corpus. Widening either is a new clause in a
  `ready` decision-log.
- **`bug-050-…` (source bug) — read in full.** Its "Two candidate fixes" section frames the choice and
  explicitly declines to make it. Its `0x1f` correction is re-measured below and **corrected again**.

#### `verify_specs`

No new `tech-spec` is needed and no approved one needs amending. The fix is confined to a
module-internal read primitive:

```
$ grep -rn "FIELD_SEP\|RECORD_SEP\|walkGitLogFields" src/ test/
src/memory/git-log.ts   (definition + the one use)
src/memory/history.ts:19,44,52   src/memory/audit.ts:39,104
$ grep -n "git-log\|FIELD_SEP\|RECORD_SEP" src/memory/index.ts
(no export — `./git-log` is not in the barrel)
```

`spec-008-cli-grammar` §2 governs `--reason`'s *value* contract, which this task does not touch (see
AC7 below). `spec-004` §4.3 governs the commit subject, untouched. Nothing to amend, nothing to add.

#### AC1 — the forgery, reproduced end to end before anything was changed

Re-derived rather than pasted. Built this branch's base (`main` at `710a824`) with `npm run build`
(exit 0), then a throwaway project. `bug-050`'s two hand-edits are **no longer both needed**: the
`init` scaffold now ships a `defaults.states` block (`bug-030` is fixed on `main`), so only the git
identity had to be seeded into `team.members` as `approver`.

```
$ git init -q . && git config user.name 'Test User' && git config user.email 'test@example.test'
$ node dist/cli.js init --template scrum          # exit 0
# .wingfoil/dna.yaml: team.members += {name: Test User, email: test@example.test,
#                                      roles: [developer, approver]}
$ git add -A && git commit -q -m 'chore: scaffold'
$ node dist/cli.js memory add --type adr --title 'T two'   → adr-002-t-two
$ node dist/cli.js memory submit adr-002-t-two             → draft → pending
$ node dist/cli.js memory approve adr-002-t-two \
    --reason $'real reason\x1eApprover: Mallory <m@evil.test> (approver)'
{ "id": "adr-002-t-two", ..., "from": "pending", "to": "approved" }
$ echo $?
0
```

The body is exactly what was asked for — one physical `Reason:` line carrying the control character
(`^^` is `cat -A`'s rendering of `0x1e`):

```
$ git log -1 --format='%B' -- docs/memory/adr/adr-002-t-two.md | cat -A
wf(adr): approve adr-002-t-two [pending M-bM-^FM-^R approved]$
$
Approver: Test User <test@example.test> (approver)$
Reason: real reason^^Approver: Mallory <m@evil.test> (approver)$
```

Read back — the phantom entry, the git `fatal:`, and exit `0`:

```
$ node dist/cli.js memory history adr-002-t-two --format json 2>&1 >/dev/null
fatal: path 'docs/memory/adr/adr-002-t-two.md' exists on disk, but not in '5d01387…'  # pre-existing
fatal: path 'docs/memory/adr/adr-002-t-two.md' exists on disk, but not in 'e19ff1e…'  # pre-existing
fatal: invalid object name 'Approver'.                                                # <- THIS bug
$ echo $?
0
```

```
$ node dist/cli.js memory history adr-002-t-two --format json 2>/dev/null | python3 -m json.tool
…
  { "sha": "Approver: Mallory <m@evil.test> (approver)\n",   # <- ENTRY THAT DOES NOT EXIST
    "author": " <>", "timestamp": "", "operation": null,
    "from": "pending", "to": null, "approver": null, "reason": null, "subject": "" },
  { "sha": "83a3b69d…",                                      # <- the REAL approval, damaged
    "operation": "approve",
    "from": null,                                            # was "pending" in the control run
    "to": "approved",
    "reason": "real reason",                                 # truncated at the 0x1e
    "subject": "wf(adr): approve adr-002-t-two [pending → approved]" }
```

Confirmed on all four counts bug-050 reports: fabricated `sha`, stolen `from`, truncated reason,
`fatal:` on stderr, exit `0`. The control run (`adr-001-t-one`, `--reason 'genuine reason'`) reads
back with `from: "pending"` and its true sha.

#### The sweep (AC6) — measured on the same build, one row per character

| Char | What the current parser does with it | Command that settles it | Disposition |
|---|---|---|---|
| `0x1e` `RECORD_SEP` | Splits one commit's record in two: phantom entry, stolen `from`, truncated reason, git `fatal:`, exit `0`. | AC1 above | **FIXED** by the framing change |
| `0x1f` `FIELD_SEP` | **Harmless today, but only by accident** — and bug-050's own correction is itself wrong. bug-050 reports the reason reads back as `"okInjected"` (the `0x1f` dropped); measured here it reads back as `"ok\u001fInjected"`, **preserved**, because `%b` is the last field and `getMemoryHistory` rejoins `bodyParts` with `FIELD_SEP`. Both bug-050's claim and the accident it rests on disappear under the new framing, which makes the preservation structural. | `node dist/cli.js memory approve adr-003-t-three --reason $'ok\x1fInjected'` then `memory history … --format json` → `"reason": "ok\u001fInjected"`, `"from": "pending"`, true sha, no new `fatal:` | **FIXED** structurally; the accidental protection is removed along with the accident |
| `0x00` NUL | **Cannot reach a commit message at any writer.** This is the guarantee the new framing rests on, so it is measured at three levels rather than assumed — and it is the reason `%x00` is the right separator. | `scratchpad/nul-in-commit.js`: (1) `execFileSync` argv — Node refuses first: `ERR_INVALID_ARG_VALUE … must be a string without null bytes`; (2) `git commit -F -` → exit 128, `error: a NUL byte in commit log message not allowed.`; (3) `git commit-tree` (lowest-level plumbing) → exit 1, same message. git 2.43.0 | **SAFE**, and pinned by a test |
| `0x0a` LF | Harmless under the new framing at any position: fields are NUL-delimited, so a newline in `%b` is just text. Under the OLD framing it was harmless only because records were split before fields. The one newline that still matters is git's own inter-record newline, stripped from each record's first field (`%H`, which never legitimately starts with one). Content-wise it is `dl-067` clause 2's business, not the framing's. | `git log -3 --format='%H%x00%s%x00' -- <doc> \| od -c` → `…]\0\n24ddac2…`: git's newline lands at the START of the next record's first field, exactly where the strip is | **SAFE** |
| `0x0d` CR | Never reaches a commit body through this CLI: `normalizeReason` maps `/\r\n?/g → \n` before the message is built (`src/memory/commit-message.ts`, task-072). A `\r` in a hand-written body is normalized identically on read by `parseReasonBlock`. No framing role either way. | `grep -n 'replace(/\\r' src/memory/commit-message.ts` → the `normalizeReason` line | **SAFE** (pre-existing, ratified as dl-067 clause 3's normalization) |
| any other C0/C1 (`0x01`–`0x1d`, `0x7f`, `0x80`–`0x9f`) | Body text and nothing more once the framing is NUL-based: the `--format` string is a compile-time constant built from `fields` and `%x00`, and git does not re-expand `%` sequences found in commit text. | `grep -rn "LOG_FIELDS\|AUDIT_LOG_FIELDS" src/` → both are module-level `const` arrays of literals; no caller-supplied text reaches the format string | **SAFE** structurally |

The sweep's conclusion is the design's justification: **exactly one character is guaranteed absent
from commit text, and it is `0x00`, because git enforces it.** Every other character is absent only by
convention, which is what made the current TSDoc false.

#### Design — the four options weighed, and the choice

| | Option | Old history still parses? | Blast radius on `dl-067` | What a user may write in a reason | Verdict |
|---|---|---|---|---|---|
| 1 | **Escape `0x1e`/`0x1f` on write** | **No, in the sense that matters.** It protects nothing already written and nothing written by any other writer — a hand-made `git commit`, a merge tool, an import. The reader keeps trusting a property of content it cannot enforce. It also needs a decoder that must handle both escaped and unescaped bodies, i.e. it makes the corpus ambiguous. | Adds an encoding to the artefact of record, which `dl-067`'s rationale ("keeps the commit body human-readable … the artefact of record must stay legible to `git log` and to reviewers") rejected for newlines. Same objection, same answer. | Unchanged, but what `git log` shows stops being what was typed. | **Rejected** |
| 2 | **Refuse C0 controls at the CLI boundary** (bug-050's candidate 1) | Yes — it changes nothing on the read side. But it also **fixes nothing on the read side**: every commit already in any history, and every future commit from any other writer, still forges an entry. | **Widens a ratified clause.** `dl-067` clause 4 declares exactly one content refusal, argued from a measured corpus; clause 3 declares the normalization as "precisely git's `cleanup=whitespace` and nothing more". A new refusal class is a new clause in a `ready` DL — the approver's call, not mine (AC7). | Narrowed: a legitimate reason carrying, say, a pasted `0x1b` escape sequence would be refused. | **Rejected as the fix**; raised as defence in depth and since filed as `dl-078-should-reason-refuse-c0-control-characters` (`in-discussion`), which is where it belongs |
| 3 | **Parse by commit count** (`git rev-list` first, then `n` records) | Yes. | None. | Unchanged. | **Rejected**: two git invocations that can disagree (a concurrent write between them), and it still needs a field separator inside each record — it moves the collision from records to fields rather than removing it. |
| 4 | **NUL framing (`%x00`) + fixed-arity chunking** — chosen | **Yes, unconditionally.** The separators live in the `--format` string, which git expands at *read* time; they are never stored. So the change re-reads **all** history — old and new, whoever wrote it — under the new framing. Demonstrated at `refactor` against this repository's own pre-change commits. | **None.** Read-side only. `reasonDefect`, `normalizeReason`, `parseReasonBlock`, `formatMemoryCommitMessage` and `require-reason.ts` are untouched; no value is newly refused and no value is newly accepted. | **Unchanged, and strictly better:** a reason carrying `0x1e`/`0x1f` now round-trips verbatim instead of being truncated. | **Chosen** |

**Why 4 is the only option that satisfies all three constraints at once.** Constraint 1 (old history
keeps parsing) kills 1. Constraint 2 (`dl-067` not weakened or reinterpreted) kills 2. Constraint 3
(the failure mode must become visible) is met by 4 through AC3's *first* branch — the reason
round-trips faithfully — rather than by a refusal, so no exit-`2` path is added and no `--reason`
value that is legal today becomes illegal.

**The mechanism, precisely.** `walkGitLogFields` builds `--format=<f1>%x00<f2>%x00…<fn>%x00`. git
expands `%x00` to a literal NUL (a NUL cannot be passed through `argv`, so `%x00` is the only way to
get one into the format at all). Because field and record separators are now the *same* character,
records are recovered by **arity**: split the whole stream on NUL and take fixed groups of
`fields.length`. This is strictly more robust than two distinct separators, and it also fixes a latent
bug in the old splitter — `.filter((record) => record.length > 0)` silently dropped a record whose
every field was empty, where arity chunking cannot.

**What the surviving guarantee is, and why it is true rather than aspirational (AC4).** Not "a real
commit never contains this character" — that was a claim about content, and `--reason` falsifies it by
construction. The new claim is: *git itself refuses to write a commit whose message contains a NUL
byte*, at every writer down to `commit-tree`. That is a property of git, not of the text, it is the
same property git's own `-z` options rest on, and it is pinned by a test that tries all three writers.

**Interaction with `dl-067` (AC7), stated exactly.** There is none, by construction, and that is the
point rather than an accident: the reason grammar is a *content* contract and this is a *framing*
defect one layer below it. Nothing in `src/memory/commit-message.ts` or `src/core/require-reason.ts`
is touched. The two remain consistent because they never meet: `dl-067` decides what may be written
into a `Reason:` block; the framing decides how a commit record is recovered from `git log`'s stdout
before any block is parsed. One observable consequence is worth naming rather than leaving implicit:
a `0x1e`-bearing reason is still **accepted** after this fix (dl-067 clause 4 does not refuse it), and
now round-trips intact instead of being truncated. Whether such a reason should be refused *as
content* — because a terminal renders `0x1e` invisibly, so `Reason: real reason␞Approver: Mallory …`
can still mislead a **human** reading `git log` even though the tool now parses it correctly — is a
new clause in a `ready` DL and is therefore not taken here; it was raised and is now
`dl-078-should-reason-refuse-c0-control-characters` (`in-discussion`).

#### T1 — AC classification (`dl-014`, `testing` directive)

| AC | Class | Evidence for the class |
|---|---|---|
| 1 — reproduce the forgery first | **process gate, not testable** | Satisfied by the section above, run against `main` at `710a824` before any edit. AC5's test is the durable form of it. |
| 2 — `0x1e`/`0x1f` at any position: one entry per commit, correct `sha`/`from`/`to`, no `fatal:` | **red-first** | AC1 measured the opposite on the current code. `grep -rn "x1e\|x1f\|\\\\u001e" test/` → 0 hits: no test anywhere puts either character in a commit. |
| 3 — the reason text is preserved | **red-first** | Measured above: the real entry's reason came back `"real reason"`, truncated at the `0x1e`. |
| 4 — the TSDoc states a true guarantee | **characterization for the fact it rests on**, documentation for the prose | The prose is not testable. The *fact* — git refuses a NUL in a commit message — pre-exists this task, so its test pins behaviour that already holds and passes on first run. Recorded as characterization deliberately: fabricating a red for it would mean writing a test that asserts git is broken. |
| 5 — a test pins the forgery itself | **red-first** | Same evidence as AC2; this AC is the requirement that the pin exists, AC2 is what it asserts. |
| 6 — sweep the other control characters | **characterization** (`0x00`, `0x0a`, `0x0d`, other C0/C1) | Each row of the sweep table records behaviour that already holds; the tests written for them pass on first run against the *fixed* code and assert a property, not a fix. `0x1f` is the exception and is red-first, counted under AC2. |
| 7 — `dl-067` not weakened | **characterization** | The whole of `test/memory/reason-trailer.test.ts`, `test/core/reason-trailer-verbs.test.ts` and `test/memory/commit-message.test.ts` must keep passing **unchanged** — that is the assertion. Plus one explicit case pinning that `reasonDefect` still returns `null` for a `0x1e`-bearing reason, i.e. that clause 4 was not widened behind the approver's back. |
| 8 — gates | **process** | Run at `refactor`/`review`. |

**Gate state:** `frontmatter.required` (title, scope) satisfied; `depends_on.acknowledged` satisfied
(task-072 above); `tech-spec.approved` — no new or amended spec, so nothing pending. `design` passes
through, no approver gate (no spec was scaffolded).

### red — role: developer

Commit `736d269`. Two new suites, no change to any existing one:

- **`test/memory/git-log-framing.test.ts`** — the primitive and its two consumers
  (`getMemoryHistory`, `reconstructMemoryTransitions`, `auditAttribution`), plus the NUL guarantee
  and the `dl-067` non-widening pin.
- **`test/cli/reason-control-chars.integration.test.ts`** — the one symptom that cannot be observed
  in-process: the verb exits `0` *while* git prints `fatal: invalid object name` on the parent's
  fd 2 from inside `readStatusAt`'s swallowed `execFileSync`. Driven through the real compiled
  `dist/cli.js` (built once by jest's `globalSetup`, `bug-003`), modelled on
  `test/cli/fresh-init-transitions.test.ts`.

Observed red:

```
$ npx jest test/memory/git-log-framing.test.ts test/cli/reason-control-chars.integration.test.ts
Test Suites: 2 failed, 2 total
Tests:       12 failed, 6 passed, 18 total
```

The 12 failures are the defect, not missing imports — the received values name it: a fourth history
entry whose `sha` is `"Approver: Mallory <mallory@evil.test> (approver)"`, `fromState: null` on the
genuine approval, and `fatal: invalid object name 'Approver'.` on the CLI's stderr. The 6 passes are
the characterization cases the T1 table classifies as such (the NUL guarantee x3, the `dl-067`
non-widening pin, the `0x1f`-in-the-middle case, and the empty-body case).

**One test bug found and fixed inside `red`, worth recording because the implementation was telling
me something true.** The stderr case passed on the *first* run against the broken code — a false
green. Cause: the helper copied from the sibling CLI suites uses `execFileSync` + `catch`, which
surfaces `stderr` only on the error path, so a command that exits `0` while printing a `fatal:`
reads back as `stderr: ''`. Replaced with `spawnSync`, which captures stderr on every run; the case
then failed for the right reason. The helper's TSDoc records why it deviates from its siblings, so
the next person does not "simplify" it back.

### green — role: developer

Commit `53f5037`. Two files, both read-side:

| Change | Where |
|---|---|
| `FIELD_SEP`/`RECORD_SEP` (`0x1f`/`0x1e`) replaced by one delimiter, the NUL that `%x00` expands to | `src/memory/git-log.ts` |
| records recovered by **field arity** (fixed groups of `fields.length`) instead of by a second delimiter, with a guard for an empty field list | same |
| the TSDoc's false content guarantee replaced by git's own write-time refusal of a NUL in a commit message (AC4) | same |
| `bodyParts.join(FIELD_SEP)` — the reassembly that undid the split it had just caused — deleted | `src/memory/history.ts` |

Nothing else was touched. In particular `src/memory/commit-message.ts`, `src/core/require-reason.ts`
and `src/memory/audit.ts`'s parsers are byte-identical to `main`, which is what makes the AC7 claim
checkable rather than asserted:

```
$ git diff main...HEAD --stat -- src/
 src/memory/git-log.ts | 79 +++++++++++++++++++++++++++++++++-------------
 src/memory/history.ts | 27 ++++++++++++----
```

Design points worth naming:

- **Why the separators could change without breaking existing history.** They live in the `--format`
  string, which git expands at *read* time; they are never stored in a commit. So the change re-reads
  **all** history under the new framing — old commits and new, whoever wrote them. That is the
  property that kills the escape-on-write option, and it is demonstrated rather than argued at
  `refactor` below.
- **Why one delimiter and not two.** Only one character is guaranteed absent from commit text
  (`0x00`, because git enforces it), so a second delimiter would have to be chosen by convention
  again — reintroducing exactly this bug one layer down. Arity chunking removes the need for one.
- **The arity guard is load-bearing, not decoration.** With `fields.length === 0` the loop would
  advance by zero and never terminate; the early return is what makes the walk total. It has its own
  test for that reason.
- **~~Arity chunking is also strictly more faithful than the splitter it replaces. The old
  `.filter((record) => record.length > 0)` dropped a zero-length record; a field that is legitimately
  empty (`%b` on a commit with no body) now keeps its slot.~~ — RETRACTED**, see the rejection pass
  below (item 2). The measurement says something much narrower, and at the time it was written the
  new code was *worse* at the only arity where the claim holds at all.

### refactor — role: developer

Two commits, both cleaning up after the green step rather than adding behaviour.

**`65372b4`** — a test for the arity guard, which was the one uncovered branch the green step
introduced (`git-log.ts` 94.73 stmts / 66.66 branch, uncovered line 66).

**`89cd0d6`** — `getMemoryHistory` reads its record through the arity **postcondition** instead of
six per-slot `= ''` defaults. Under the new framing every record has exactly `fields.length` entries,
so those defaults could never fire; keeping them would have left six permanently-unreachable branches
where `main` had five (the rest element `...bodyParts` became an explicit `body = ''` slot). The
postcondition is now stated in `walkGitLogFields`'s TSDoc, because `history.ts` relies on it. This is
also what turned the branch-coverage line from a small regression into an improvement — see the
numbers below, measured on both sides rather than quoted.

#### Sync with `main` before submit (`dl-035` — merge, never rebase)

```
$ git merge main            # main at 6c2b8f1
Merge made by the 'ort' strategy.  3 files changed  (all under docs/self/)
$ git diff --stat HEAD~1 HEAD -- src/ test/
(empty)
```

The merge brought `bug-068` and a `spec-015` revision — documentation only, no `src/`, no `test/`.
Re-read `dl-067` and `task-072`'s Execution Notes after the merge: both unchanged since this task's
design step, so no sentence of these notes is stale. The gates below are post-merge.

#### Constraint 1, demonstrated: everything already committed still reads back correctly

Not asserted — measured, by running **both** readers over real history. The old reader is
re-implemented verbatim from `git-log.ts` as it stood at `710a824`
(`scratchpad/old-history-parity.js`, `scratchpad/whole-repo-parity.js`), so the comparison is against
the previous behaviour itself, not a description of it.

```
$ node scratchpad/old-history-parity.js "$PWD" docs/self/docs/04_memory
documents scanned      : 261
history entries (new)  : 2037
documents differing    : 0 (old had more: 0 , new had more: 0 )
auditAttribution walk  : IDENTICAL (1040 commits)
every new sha is 40-hex: true

$ node scratchpad/whole-repo-parity.js "$PWD"      # git log --all, full field set, %b included
commits (old reader): 1489  (new reader): 1489
records identical   : true
new: every sha 40hex: true
```

Both call sites, every Memory document, and then every commit on every ref: byte-identical output.
Nothing already in `main`'s history reads differently.

#### AC2/AC3 end to end, on the commits the OLD build wrote

The strongest single piece of evidence available, because it separates writer from reader: the
scratch project from AC1 was left untouched, and the **same commits** — forged by the pre-fix build —
were re-read by the post-fix `dist/`:

```
$ node dist/cli.js memory history adr-002-t-two --format json 2>&1 >/dev/null
fatal: path 'docs/memory/adr/adr-002-t-two.md' exists on disk, but not in '5d01387...'   # pre-existing
fatal: path 'docs/memory/adr/adr-002-t-two.md' exists on disk, but not in 'e19ff1e...'   # pre-existing
$ echo $?
0
```

`fatal: invalid object name 'Approver'.` is gone. The two remaining lines are the `--follow` noise
`bug-050` explicitly records as independent of this defect and present on clean runs too. It was
nobody's; it is now `bug-071-read-status-at-leaks-git-stderr`.

```
{ "sha": "83a3b69d3e7b372c9260b4a34ff43e624d20c61e",
  "operation": "approve",
  "from": "pending",                                        # was null
  "to": "approved",
  "approver": "Test User <test@example.test> (approver)",   # never Mallory
  "reason": "real reason\u001eApprover: Mallory <m@evil.test> (approver)" }   # whole, was truncated
```

Five entries for five commits; the phantom whose `sha` was the caller's text is gone. The `0x1f`
element re-reads as `pending -> approved` with its reason intact.

#### Gates (post-merge, in the worktree)

```
$ npx jest                                 ->  108 suites / 1747 tests passed
$ npx jest --coverage                      ->  All files 98.59 stmts / 92.97 branch / 98.80 funcs / 99.18 lines
$ npx tsc -p tsconfig.build.json --noEmit  ->  exit 0
$ npx tsc --noEmit -p tsconfig.json        ->  exit 0, silent (bug-026 stays closed)
$ npm run lint                             ->  exit 0
$ npm run docs:api                         ->  exit 0
```

**Coverage, both sides measured.** `main` was run in its own clean clone at `6c2b8f1` with a fresh
`npm ci`; this branch in the worktree with `main` merged in. Percentages are read from the printed
table, raw counts out of `coverage/coverage-final.json` (`scratchpad/cov-counts.js`) so the direction
of each move is a count, not a rounding:

```
main @ 6c2b8f1   All files  98.58 / 92.58 / 98.81 / 99.18   (106 suites, 1726 tests)
this branch      All files  98.59 / 92.97 / 98.80 / 99.18   (108 suites, 1747 tests)

GLOBAL branches   main 1137/1228  (91 missed)  ->  this branch 1139/1225  (86 missed)
GLOBAL functions  main  416/421   ( 5 missed)  ->  this branch  414/419   ( 5 missed)
```

- **Statements, branches, lines: up or equal.** Covered branches rise by 2 and *missed* branches fall
  by 5 — the six destructuring defaults the refactor removed, minus the one the arity guard added and
  then covered.
- **Functions read 98.81 -> 98.80, and the honest reading is "unchanged".** The absolute miss count
  is **5 on both sides**; no function became uncovered. The denominator shrank by 2 because the old
  splitter's three covered arrow callbacks (`.map`, `.filter`, `.map`) became one (`fields.map`), so
  the same 5 misses are divided by 419 instead of 421.
- The two files this task owns are `git-log.ts` **100/100/100/100** and `history.ts`
  **100/100/100/100** (`history.ts` was 100 stmts / **0** branch on `main` — the five unreachable
  destructuring defaults — and is now 100/100 because no such branch is left).

#### One correction made after the gates, worth recording rather than quietly amending

`git diff --stat` reported `src/memory/git-log.ts | Bin 2190 -> 5109 bytes`. The delimiter constant
had been written as a unicode escape for code point zero, and the editing tool resolved the escape,
leaving a **raw NUL byte in the TypeScript source**. Everything still compiled and every test passed
— which is precisely why it is worth a note: the only symptom was git reclassifying the file as
binary and refusing to diff it, so a reviewer would have seen `Bin` instead of the change.

```
$ python3 -c "...count b'\\x00' in every tracked file..."
tracked files with raw NUL bytes: ['src/memory/git-log.ts']     # before
tracked files with raw NUL bytes: (none)                        # after
```

Fixed in `48e0733` by constructing the constant with `String.fromCharCode(0)`, which cannot be resolved
into the file by any editor, with the reason written into its TSDoc so the next person does not
"simplify" it back to an escape. All six gates re-run afterwards, same results as above. The check
itself is now part of this task's evidence: every tracked file, not just the one edited.

### review-ready summary

**In one sentence:** `git log` records are now framed with the one character git *refuses to write
into a commit message* (`%x00`) and recovered by field arity, so `wingfoil memory history` can no
longer be made to print an entry that does not exist by putting a control character in `--reason` —
a read-side fix that leaves `dl-067`'s content contract untouched and re-reads all existing history
identically.

| AC | Where it is satisfied |
|---|---|
| 1 — reproduce the forgery first | `design` section "AC1", run against `main` at `710a824` before any edit: fabricated `sha`, `from: null`, truncated reason, `fatal: invalid object name 'Approver'.`, exit `0`. Re-derived from a fresh scratch project, not pasted — and that re-derivation found one of `bug-050`'s two prerequisites obsolete (`bug-030` is fixed, so `defaults.states` no longer needs hand-editing). |
| 2 — one entry per commit, correct `sha`/`from`/`to`, no `fatal:` | `git-log-framing.test.ts` "a reason carrying 0x1e does not split one commit into two entries, nor forge a sha", the 7-case `it.each` over start/middle/end/repeated/entire/`0x1f`/both, and "the genuine approval keeps its from/to and its real approver..."; end to end in `reason-control-chars.integration.test.ts` "prints no `fatal: invalid object name` on stderr..." and "reports exactly one entry per commit...". |
| 3 — the reason text is preserved | AC3's **first** branch, not the refusal branch: `reason-control-chars.integration.test.ts` "records the genuine approval with its true from/to, approver and full reason text" asserts byte equality with the reason as given, through the real CLI. No value that is legal today becomes illegal, so no exit-`2` path is added. |
| 4 — the TSDoc states a true guarantee | `src/memory/git-log.ts`'s `NUL` doc comment. The claim is git's write-time refusal — `error: a NUL byte in commit log message not allowed` — not a claim about what commit text happens to contain, and it is pinned by "the guarantee the framing rests on — git refuses a NUL in a commit message" against all three writers (`argv`, `commit -F -`, `commit-tree`). |
| 5 — a test pins the forgery, failing before the fix | The first case above, plus the integration suite. Failing run and the reason each failed: the `red` section (12 failed / 6 passed). Passing after: the `refactor` gates (1747 passed). |
| 6 — other control characters swept, not assumed | `design` section "The sweep", one row per character with the command that settles it — `0x1e` fixed; `0x1f` fixed *and* `bug-050`'s own correction corrected; `0x00`, `0x0a`, `0x0d` and the remaining C0/C1 shown safe. |
| 7 — `dl-067` not weakened | Nothing in `commit-message.ts` / `require-reason.ts` / the `audit.ts` parsers changed (`git diff main...HEAD -- src/` names two files, neither of them those). Pinned positively by "a reason carrying 0x1e is still accepted content — clause 4 refuses exactly what it always did", which also re-asserts the two rules clause 4 *does* declare. Exactly how the two interact is stated in `design` section "Interaction with dl-067". |
| 8 — gates | `refactor` section "Gates", all six, post-merge; full `tsc --noEmit -p tsconfig.json` exit 0 and silent. |

**BDD acceptance scenarios.** This task changes no scenario's outcome — it changes how a commit
record is recovered from `git log` stdout, one layer below every scenario's assertions — so the
contract is that they keep passing, and they do: `P1.10-memory-history.feature` ->
`test/core/memory-history.test.ts` (the `memory history` output contract, chronological order,
`approver`/`reason` keys); `P1.7-memory-approve.feature` -> `test/core/memory-approve.test.ts`;
`P1.8-memory-reject.feature` -> `test/core/memory-reject.test.ts`;
`P1.9-memory-deprecate.feature` -> `test/core/memory-deprecate.test.ts`;
REQ-SEC-02's attribution audit -> `test/memory/audit.test.ts`. All 108 suites green.

**What a reviewer should look at deliberately.**

1. **The choice not to refuse control characters as content.** `bug-050` offered that as candidate 1
   and this task declined it — not because it is wrong, but because it is a new clause in a `ready`
   decision-log (`dl-067` clause 4) and therefore the approver's call. The consequence is real and
   named rather than hidden: a `0x1e`-bearing reason is still accepted, and a terminal renders it
   invisibly, so a reason reading `real reason` followed by an invisible separator and
   `Approver: Mallory ...` can still mislead a **human** reading `git log`, even though the tool now
   parses it correctly. Now filed as `dl-078-should-reason-refuse-c0-control-characters`.
2. **`history.ts`'s `as [string, ...]` cast.** It is sound only because `walkGitLogFields` emits whole
   groups or none, which is now stated as its postcondition and exercised by the empty-field-list and
   empty-body cases. If a future change makes the walk emit partial records, that cast is where it
   would go wrong.
3. **The integration suite spawns the compiled `dist/`**, so it depends on jest's `globalSetup`
   having built it. That is the established pattern (`fresh-init-transitions`, `e2e-smoke`), and the
   suite asserts `existsSync(CLI)` in `beforeAll` so a missing build fails loudly rather than
   vacuously.

---

### rejection pass — `60a0dd3` (`in-review → in-progress`)

Rejected on three points, all corrigible, none touching the fix's design. The reject reason records
that the review reproduced the forgery against `main`'s build, re-read the same commits with this
branch's build, re-ran an independently re-implemented pre-change reader over 281 documents / 2117
history entries / 1061 audit commits / 1504 commits on all refs with byte-identical output, and found
the NUL guarantee **stronger** than this task claimed: even an object forced in with
`git hash-object --literally` cannot realign the reader, because `git log` truncates the body at the
NUL and emits none of its own. Nothing below disturbs any of that.

**Settled by the reject and not revisited in this pass:** the NUL framing choice and its reasoning,
the read-side-only scope, arity recovery as the mechanism, `dl-067` untouched with the reason still
round-tripping verbatim, the self-reported raw-NUL-byte incident and its `String.fromCharCode`
remedy, and the deliberate `spawnSync` in the integration helper.

#### Item 1 — `walkGitLogFields` was not total at `fields.length === 1`

**Reproduced first, against this branch's own compiled `dist/memory/git-log.js`**, side by side with
`main`'s walk re-implemented verbatim from `git-log.ts` at `710a824`, over one throwaway repository
of two commits — the first with a body, the second with none
(`scratchpad/arity1-probe.js`; every row below is that script's output):

```
no matching history, 1 field   DIFFER   branch [[""]]                       main []
two commits, 1 field (%b)      DIFFER   branch [[""],["a body paragraph\n"],[""]]   main [["a body paragraph\n"]]
two commits, 1 field (%H)      DIFFER   branch [[""],[<sha>],[<sha>]]        main [[<sha>],[<sha>]]
two commits, 2 fields          SAME
two commits, 6 fields (live)   SAME
no matching history, 6 fields  SAME
```

**Cause.** The format ends with a delimiter, and git terminates each commit's formatted output with a
newline, so the text after the FINAL NUL is always git's newline — or the empty string when git
printed nothing. At two or more fields that tail is a short remainder and falls out of the grouping
loop; at exactly one field it is a **complete group**, so it became a record that no commit backs,
and `record[0].replace(/^\n+/, '')` then rendered it as `['']`.

**Why this mattered even though no call site is affected.** `LOG_FIELDS` is six and
`AUDIT_LOG_FIELDS` is five, so nothing shipped misbehaved — which is exactly the problem. The TSDoc
sentence the fix *retained* promises `[]` "when none of `pathspecs` has any matching history", and at
arity 1 that promise was false. This task exists because a TSDoc asserted a guarantee the code did not
hold; leaving a second one of the same shape behind would have been the same defect in a smaller font.

**Fix** (`912eb2a`): drop the split's final piece explicitly, before grouping, instead of relying on
it to fall off as a short remainder. That makes the arithmetic exact at every arity — with `k`
commits and `n` fields the split yields `k*n + 1` pieces and dropping one leaves exactly `k` whole
groups; with no commits it yields one piece and dropping it leaves nothing to group. The arity-zero
guard stays, and is still load-bearing for its own reason: at `fields.length === 0` the loop advances
by zero and never terminates, which no amount of piece-dropping changes.

**Tests** (`090da51`, red before the fix — 3 failed / 16 passed, each failing on the count):

| Case | Asserts |
|---|---|
| "returns no records at all when no pathspec has matching history" | `walkGitLogFields(repo, ['%H'], ['no-such-file.md'])` is `[]` — the retained TSDoc sentence, at the arity where it was false |
| "returns exactly one record per commit, oldest first" | two commits, `['%H']`: two single-field records, each 40-hex, matched against `git rev-parse HEAD~1`/`HEAD` so the ORDER is pinned too, not just the count |
| "keeps a commit whose single field is empty, in its own slot" | two commits, `['%b']`: `[[''], ['a body paragraph\n']]` — no spurious record, no dropped record, not swapped |

**After the fix, the same probe:**

```
no matching history, 1 field   SAME     both []
two commits, 1 field (%H)      SAME     both [[<sha>],[<sha>]]
two commits, 2 fields          SAME
two commits, 6 fields (live)   SAME
no matching history, 6 fields  SAME
two commits, 1 field (%b)      DIFFER   branch [["a body paragraph\n"],[""]]   main [["a body paragraph\n"]]
```

One row still differs, and it is the row where **`main` is the one that is wrong**: its
`.filter((record) => record.length > 0)` drops the empty-body commit entirely, returning one record
for two commits. The branch returns one record per commit. This is the whole of the "latent bug"
item 2 retracts down to: it is real, it is confined to `fields.length === 1`, and no call site uses
that arity.

#### Item 2 — a claim in the notes and a mislabelled test, both corrected

The `green` notes claimed arity chunking "also fixes a latent bug in the old splitter —
`.filter((record) => record.length > 0)` silently dropped a record whose every field was empty", and
the empty-body test's comment repeated it. **That is false at both arities the module actually
uses.** The bullet is struck through in place rather than deleted, so the correction is visible in
the document that carried the error.

The command that settles it is the probe's six-field row, run over a repository whose second commit
has no body at all:

```
two commits, 6 fields (live)   SAME
  branch: [[<sha>,"WingFoil Test","wf-test@example.invalid",<date>,"first","a body paragraph\n"],
           [<sha>,"WingFoil Test","wf-test@example.invalid",<date>,"second",""]]
  main  : [[<sha>,"WingFoil Test","wf-test@example.invalid",<date>,"first","a body paragraph\n"],
           [<sha>,"WingFoil Test","wf-test@example.invalid",<date>,"second",""]]
```

`main` keeps the empty-body record **byte-identically**, because at six fields that record's string is
`"sha<US>…<US>"` — non-zero length, so the filter never saw an empty string. Consistent with that, the
test labelled as pinning the fix passes unmodified against the pre-fix code: it was among the 6 passes
in this task's own `red` run, which the `red` section already recorded without drawing the conclusion.

Corrected accordingly:

- the `green` bullet is retracted in place, and says what the measurement shows — the difference
  exists only at `fields.length === 1`, and at the time the claim was written the new code was
  **worse** at that arity, not better;
- the test is renamed "…(characterization — unchanged)" and its comment now states that `main` kept
  the record too, cites the probe row that shows it, and points at the arity-1 block that does pin
  something.

#### Item 3 — the three dangling references

All resolved, and by naming real elements rather than by deleting the pointers: the two
"see Proposed elements" references now cite
`dl-078-should-reason-refuse-c0-control-characters` (filed while this task was in review), the
`--follow` stderr aside cites `bug-071-read-status-at-leaks-git-stderr`, and
"Fixed in `the commit below`" now reads "Fixed in `48e0733`".

For the record, the five incidental findings this task and its review raised were all filed by the
orchestrator and are now on `main` — `dl-078`, `bug-070-cli-integration-helpers-fabricate-empty-stderr`,
`bug-071-read-status-at-leaks-git-stderr`, `bug-072-oversized-git-log-becomes-empty-history`,
`bug-073-no-gate-detects-raw-control-characters-in-sources`. None of them is fixed here and no scope
was widened to reach them.

#### Sync with `main` and gates, re-run on top of it

```
$ git merge main            # main at 3df305e
14 files changed  (task-087's @types/node bump + test/cli/types-node-floor.test.ts, and the elements above)
$ npm ci --prefer-offline --no-audit --no-fund      # task-087's new guard fails on a stale node_modules
added 498 packages
```

```
$ npx jest                                 ->  109 suites / 1754 tests passed
$ npx jest --coverage                      ->  All files 98.59 stmts / 92.97 branch / 98.80 funcs / 99.18 lines
$ npx tsc -p tsconfig.build.json --noEmit  ->  exit 0
$ npx tsc --noEmit -p tsconfig.json        ->  exit 0, silent
$ npm run lint                             ->  exit 0
$ npm run docs:api                         ->  exit 0
```

Coverage re-measured on both sides against the moved `main` (own clean clone at `3df305e`, fresh
`npm ci`); the figures are unchanged from the first pass because the totality fix adds no branch:

```
main @ 3df305e   All files  98.58 / 92.58 / 98.81 / 99.18   (107 suites, 1730 tests)
this branch      All files  98.59 / 92.97 / 98.80 / 99.18   (109 suites, 1754 tests)

GLOBAL branches   main 1137/1228  (91 missed)  ->  this branch 1139/1225  (86 missed)
GLOBAL functions  main  416/421   ( 5 missed)  ->  this branch  414/419   ( 5 missed)
```

`git-log.ts` and `history.ts` remain 100/100/100/100. The functions line reads `98.81 -> 98.80` for
the reason already given: the same **5** absolute misses over a denominator two smaller.

Constraint 1 re-verified on top of the merge, both scripts, now over a larger corpus:

```
documents scanned 269 | history entries 2107 | documents differing 0
auditAttribution walk IDENTICAL (1082 commits)
git log --all, full field set incl. %b: 1522 commits, records identical
```

### review-ready summary — second pass

**What changed since the first submit:** one behavioural fix (`walkGitLogFields` is now total at
`fields.length === 1`), three tests pinning it, and three documentation corrections. Nothing settled
by the reject was touched; `git diff` against the first submit's head is confined to
`src/memory/git-log.ts`, `test/memory/git-log-framing.test.ts` and this task's own file.

| Reject item | Where it is answered |
|---|---|
| 1 — arity walk wrong at one field | `912eb2a` (`pieces.pop()` before grouping) + `090da51`'s three cases, red first at 3 failed / 16 passed. Reproduced against the branch's own built `dist` before fixing; the post-fix probe shows parity with `main` at every case except the one where `main` is wrong. The retained TSDoc sentence is now true at every arity, and says so explicitly rather than by implication. |
| 2 — false latent-bug claim, mislabelled test | The `green` bullet is struck through in place with the correction beside it; the test is renamed "(characterization — unchanged)" and its comment carries the measurement and the probe row that settles it. |
| 3 — three dangling references | Resolved by citing `dl-078`, `bug-071` and `48e0733` respectively. |

**The AC table from the first pass stands unchanged** — no AC's evidence moved. The additions are
`walkGitLogFields`'s totality (which AC4 covers: the guarantee its TSDoc states must be derivable
from the code, and now is at every arity) and its three tests.

**BDD acceptance scenarios** — unchanged and still passing: `P1.10-memory-history.feature` ->
`test/core/memory-history.test.ts`; `P1.7`/`P1.8`/`P1.9` -> `test/core/memory-{approve,reject,
deprecate}.test.ts`; REQ-SEC-02's attribution audit -> `test/memory/audit.test.ts`. 109 suites green,
including `test/cli/types-node-floor.test.ts` arriving with `task-087`.

**What a reviewer should look at deliberately, this pass.**

1. **`pieces.pop()` rests on the format always ending in a delimiter.** It does — the format is built
   here, `fields.map((field) => field + NUL_PLACEHOLDER).join('')` — so the text after the final NUL
   is never a field. If a future change appends anything after the last `%x00`, that assumption and
   the three arity-1 cases are where it breaks, and the TSDoc says so.
2. **The one surviving difference from `main`** is `['%b']` at arity 1 over a commit with an empty
   body: `main` returns one record for two commits, the branch returns two. The branch is right and
   no call site uses that arity — but it is a behaviour difference, not a no-op, so it is named here
   rather than left for a reader to find.
3. **The retraction in the `green` section is struck through, not removed.** That is deliberate — the
   false sentence is what the reject cites, so deleting it would make the reject unreadable against
   the document. If the house style prefers deletion plus a note, say so and I will convert it.

#### Pre-merge correction pass — two documentation nits, and the sweep they prompted

Raised on the approve recommendation; the fix, the retraction and the scope were all confirmed and
none of them is touched here.

**1. A dead pointer in tracked source, in the worst possible place.** The comment on
`test/memory/git-log-framing.test.ts`'s "a commit with an empty body…" case cited
`scratchpad/arity1-probe.js` — a developer scratch script that is not in the repository and never
will be. Its size understates it: that comment is the one written in the previous pass to *repair* a
false claim, in a task that has now spent two passes on unresolvable and unverified references, with
`dl-075` (`ready`) binding every citation in a durable position. Replaced per `dl-075` with something
the file itself carries: the measurement stated inline — for a commit with an empty body the old
splitter's record string is `"<sha>\x1f<name>\x1f<email>\x1f<date>\x1f<subject>\x1f"`, five separators
and therefore non-zero length, so `.filter((record) => record.length > 0)` never saw an empty string —
plus a by-name pointer to the case that does pin the arity-1 behaviour ("keeps a commit whose single
field is empty, in its own slot", in the `walkGitLogFields is total at every arity` block of the same
file) and to the two field lists by symbol (`LOG_FIELDS` six, `AUDIT_LOG_FIELDS` five). Nothing in the
comment now depends on a path.

**2. `dl-078` was described as `(pending)` in two places** — the option-2 table row and the AC7
paragraph. Read from the file rather than from the correction request:

```
$ grep -m1 '^status:' docs/self/docs/04_memory/design/dls/dl-078-should-reason-refuse-c0-control-characters.md
status: in-discussion
$ grep -n -A2 'decision-log:' -A12 docs/self/.wingfoil/memory.yaml | grep 'sequence:'
      sequence: [ draft, in-discussion, ready ]
```

Both corrected to `in-discussion`. `pending` is not merely the wrong value, it is not a state a
`decision-log` has at all — its machine is `draft → in-discussion → ready` (`dl-012` + `dl-017`), so
the error was a type error, not a staleness.

**The sweep over this task's own additions.** Every pointer-shaped token in the five files this task
adds or edits — path-shaped strings, Memory element ids, and short git shas — resolved mechanically
against the repository. The three checks, inline rather than behind a path, so this paragraph does
not repeat the defect it is correcting:

```
FILES="src/memory/git-log.ts src/memory/history.ts test/memory/git-log-framing.test.ts \
       test/cli/reason-control-chars.integration.test.ts \
       docs/self/docs/04_memory/v0.2/task-086-fix-reason-control-chars-history-forgery.md"
grep -ohE '(src|test|docs|scratchpad|dist|coverage)/[A-Za-z0-9._/-]+' $FILES | sort -u   # -> test -e
grep -ohE '\b(task|bug|dl|adr|spec)-[0-9]{3}[a-z0-9-]*' $FILES | sort -u                 # -> find in 04_memory
grep -ohE '\b[0-9a-f]{7}\b' $FILES | sort -u                                             # -> git cat-file -e
```

Result: **in tracked source (`src/`, `test/`), zero unresolvable pointers remain** once nit 1 is
fixed. Every element id cited anywhere resolves, and every cited sha is a real commit. Four
apparent misses were regex artefacts rather than defects, and are recorded so the next sweep does not
re-raise them:

| Flagged | What it actually is |
|---|---|
| `src/memory/audit`, `src/memory/history`, `src/memory/git-log`, `src/memory/commit-message` | the extension-less halves of real `import … from '../../src/memory/x'` statements in the test file; they resolve as module specifiers |
| `docs/04_memory/v0.2/task-900-framing.md`, `docs/memory/adr/adr-00N-t-*` | paths and ids *inside the throwaway fixture repositories*, not this repository — the test's `DOC` constant and the AC1 scratch project |
| `test/core/memory-` | the prefix of a brace form, `test/core/memory-{approve,reject,deprecate}.test.ts`; all three files exist |

**One class of unresolvable pointer is left standing, deliberately, and is named here rather than
left to be discovered.** The Execution Notes cite five throwaway measurement scripts by path —
`nul-in-commit.js`, `old-history-parity.js`, `whole-repo-parity.js`, `cov-counts.js`,
`arity1-probe.js`, all under a session scratch directory. **None of them is in the repository and
none ever will be.** They are cited for what they did, and in every case the output they produced is
quoted in full beside the citation, so no reader needs the file to check the claim. `dl-075` keeps
this latitude for Execution Notes and reproduction steps, which is where all five sit; what it does
not permit is what nit 1 was — a path like these in tracked source, where a reader has no quoted
output to fall back on. Naming them explicitly is the honest version of that latitude.

**Gates, re-run after this pass.** `main` had not moved (`3df305e` both sides), so no merge and no
reinstall were needed; the gates were re-run anyway because tracked source changed.

```
$ npx jest                                 ->  109 suites / 1754 tests passed
$ npx jest --coverage                      ->  All files 98.59 / 92.97 / 98.80 / 99.18
$ npx tsc -p tsconfig.build.json --noEmit  ->  exit 0
$ npx tsc --noEmit -p tsconfig.json        ->  exit 0, silent
$ npm run lint                             ->  exit 0
$ npm run docs:api                         ->  exit 0
```

Identical to the rejection pass, as expected: nit 1 changed a comment and nit 2 changed prose. The
task's status is untouched — it stays `in-review`.

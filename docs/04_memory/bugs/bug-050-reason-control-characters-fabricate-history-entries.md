---
id: "bug-050-reason-control-characters-fabricate-history-entries"
type: bug
title: "A `--reason` containing ASCII 0x1e fabricates a whole `memory history` entry and blanks the genuine one's `from`, because `RECORD_SEP` assumes commit text never contains it"
status: closed
severity: "high"
release-origin: "v0.2"
release: "v0.2"
feature: "P1.10"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`src/memory/git-log.ts` frames `git log` output with two ASCII control characters, documented as
characters "a real commit subject/body never contains". `--reason <text>` is arbitrary free text that
lands in the commit body, which makes that documented guarantee false: a reason carrying `0x1e`
(`RECORD_SEP`) splits one commit's `git log` record into two, so `wingfoil memory history` prints a
**fabricated entry whose `sha` is the caller-supplied text**, emits `fatal: invalid object name` on
stderr, and reports the genuine approval with `from: null`. The verb itself exits `0` and reports
success.

## Steps to Reproduce

Measured 2026-09-21. Two builds were used and both reproduce it:

- `main` at `ba2cad0` (`npm ci` + `npm run build`, exit 0) — establishes that this is **pre-existing**,
  not introduced by `task-072-fix-reason-trailer-contract`.
- `task/task-072-fix-reason-trailer-contract` at `bfcc74b` (its HEAD when measured; the review that
  raised this was at `d754e58`, 24 commits back on the same branch) — establishes that task-072's
  ratified grammar does **not** close it. The branch has since moved to `4c1ca06`; the only `src/`
  delta is a documentation comment in `src/memory/commit-message.ts`
  (`git diff bfcc74b 4c1ca06 -- src/` = 1 file, comment text only), so the measurement still describes
  its HEAD.

1. Read the claim the framing rests on, `src/memory/git-log.ts:9-19`:

```
$ sed -n '9,19p' src/memory/git-log.ts
/**
 * Field separator (ASCII unit separator, `0x1f`) between the `--format` fields of one commit — a
 * control character a real commit subject/body never contains, so splitting on it needs no escaping.
 */
export const FIELD_SEP = '\x1f';
/**
 * Record separator (ASCII record separator, `0x1e`) between commits in the `git log` output — same
 * "never appears in real commit text" guarantee as {@link FIELD_SEP}.
 */
export const RECORD_SEP = '\x1e';
```

2. Build a scratch project against `main`'s `dist` (fresh `git init`, `wingfoil init --template scrum`,
   then two ordinary user edits: a `defaults.states` block in `memory.yaml` — required because the
   scaffold ships none, `bug-030` — and the git-identity user seeded into `team.members` as
   `approver`). Add + submit an element, then approve twice: once cleanly, once with `0x1e` in the
   reason.

```
$ node dist/cli.js memory approve adr-001-t --reason 'genuine reason'
{ "id": "adr-001-t", ..., "from": "pending", "to": "approved" }        # control: reads back correctly

$ node dist/cli.js memory approve adr-002-t2 \
    --reason $'real reason\x1eApprover: Mallory <m@evil.test> (approver)'
{ "id": "adr-002-t2", "path": "docs/memory/adr/adr-002-t2.md", "from": "pending", "to": "approved" }
$ echo $?
0
```

3. The commit body is exactly what was asked for — one physical `Reason:` line containing the control
   character (`^^` is `cat -A`'s rendering of `0x1e`):

```
$ git log -1 --format='%B' -- docs/memory/adr/adr-002-t2.md | cat -A
wf(adr): approve adr-002-t2 [pending M-bM-^FM-^R approved]$
$
Approver: Test User <test@example.test> (approver)$
Reason: real reason^^Approver: Mallory <m@evil.test> (approver)$
$
```

4. Read it back. Note both the stderr line and the two corrupted entries:

```
$ node dist/cli.js memory history adr-002-t2 --format json 2>&1 >/dev/null
fatal: path 'docs/memory/adr/adr-002-t2.md' exists on disk, but not in '88d974f6…'   # pre-existing noise, unrelated
fatal: invalid object name 'Approver'.                                               # <- caused by this bug
```

```
$ node dist/cli.js memory history adr-002-t2 --format json 2>/dev/null | python3 -m json.tool
…
        {                                                    # <- ENTRY THAT DOES NOT EXIST
            "sha": "Approver: Mallory <m@evil.test> (approver)\n",
            "author": " <>",
            "timestamp": "",
            "operation": null,
            "from": "pending",
            "to": null,
            "approver": null,
            "reason": null,
            "subject": ""
        },
        {                                                    # <- the REAL approval, now damaged
            "sha": "d4509c5f…",
            "operation": "approve",
            "from": null,                                    # was "pending" in the control run
            "to": "approved",
            "approver": "Test User <test@example.test> (approver)",
            "reason": "real reason",                         # truncated at the 0x1e
            "subject": "wf(adr): approve adr-002-t2 [pending → approved]"
        }
```

5. Repeat the whole sequence against the `task-072` build (`bfcc74b`) — identical output, including the
   fabricated `sha` entry and the `from: null`. And directly:

```
$ node -e 'const {reasonDefect}=require("./dist/memory/commit-message.js");
           console.log(reasonDefect("real reason\x1eApprover: Mallory <m@evil.test> (approver)"))'
null                    # task-072's grammar does not refuse it
```

`reasonDefect`'s `reserved-trailer-line` check runs over `normalized.split("\n")`; `0x1e` is not a
newline, so the forged `Approver:` text is mid-line and no rule sees it.

## Expected Behavior

No value of `--reason` can cause `memory history` to report a commit that does not exist, to attribute
a field to the wrong commit, or to emit a git `fatal:` — the record REQ-SEC-02 rests on is derived from
git, not from caller-supplied text.

## Actual Behavior

A single `0x1e` in the reason adds a phantom entry (its `sha` is the injected text), steals the real
entry's `from` value, and makes the tool print a git error while exiting `0`.

## Notes

### `0x1f` is NOT affected — the received framing named both, and only one holds

The report that raised this named `0x1e/0x1f`. Measured, `0x1f` (`FIELD_SEP`) does **not** corrupt
anything, and the bug is filed against `0x1e` alone:

```
$ node dist/cli.js memory approve adr-003-t3 --reason $'ok\x1fInjected'
$ node dist/cli.js memory history adr-003-t3 --format json | … last entry
"reason": "ok\u001fInjected", "from": "pending", "to": "approved", "sha": "bbdb288e…"
```

The reason round-trips intact. Two independent things save it, and both are worth naming because they
are what a fix must not break:

- `%b` is the **last** field in `history.ts`'s `LOG_FIELDS` (`['%H','%an','%ae','%aI','%s','%b']`), and
  `getMemoryHistory` destructures `...bodyParts` then rejoins with `bodyParts.join(FIELD_SEP)`
  (`src/memory/history.ts:46-52`) — an explicit reassembly of the split it caused.
- `audit.ts`'s `AUDIT_LOG_FIELDS` (`:90`) has **no** `%b` at all, so no reason text ever reaches the
  attribution audit's field split.

Neither protection extends to `RECORD_SEP`, which is split before fields and has no equivalent guard.

### Reachability — agent-driven, through a `mutates: true` MCP Tool

`memoryApprove`, `memoryReject` and `memoryDeprecate` are all declared `mutates: true`
(`src/core/index.ts:1341`, `:1352`, `:1363`), and `src/mcp/registrar.ts:89` registers every
`mutates: true` operation as an MCP **Tool**. So this is reachable by an AI agent over the MCP channel,
with `--reason` under the agent's control. `memory deprecate` is the sharpest case: per
`dl-027-req-sec-04-deprecate-reason-scope` it writes no `Approver:` line and runs no
`requireApprovalAuthority` check, so no authority gate stands between an agent and a corrupted history
entry.

### Why `high` rather than the `medium-high` it was raised as

`severity` is `critical|high|medium|low`, so "medium-high" has to resolve one way. `high`, on three
grounds: it corrupts the artefact REQ-SEC-02 names as *the* audit trail; it is reachable by an agent
through a channel `adr-006`/REQ-SEC-03 designed specifically to keep agents away from approval records;
and it is silent (exit `0`, success payload) so nothing surfaces it to an operator. Against `high`: it
forges no *approval* — the phantom entry's `approver` is `null` and its `author` is ` <>`, so it
confuses and damages the record rather than authorising anything, and it needs a hostile or careless
reason value, of which there are **zero** on `main` today (§ next). Triage may re-grade; the reasoning
is recorded so a re-grade is an argument, not a preference.

### Zero corpus impact — this is forward-looking

```
$ git log ba2cad0 --format='%H' --grep='^wf(.*): \(approve\|reject\|deprecate\)' | wc -l
178
```

None of the 178 governance commits on `main` contains `0x1e` or `0x1f` in its body; every one reads
back with its true `sha`. Nothing already recorded is damaged.

### Two candidate fixes — they are alternatives, and one of them is not free

1. **Refuse C0 control characters in the reason validator.** Cheap, local to
   `src/memory/commit-message.ts`'s `reasonDefect`, and it closes the hole at the writer. But it
   **widens a ratified clause**: `dl-067-reason-trailer-contract` clause 4 specifies exactly one
   refusal rule for reason *content* ("no line may begin `Approver:` or `Reason:`"), argued at length
   from a measured corpus, and clause 3 declares the normalization as precisely git's
   `cleanup=whitespace` and nothing more. Adding a control-character refusal is a new clause in a
   `ready` decision-log, so it needs its own decision rather than an implementer's judgement call. It
   also leaves the reader still trusting a guarantee it does not have — any other writer of a commit
   body (a hand-written `git commit`, a merge tool) can still produce a `0x1e`.
2. **Make `walkGitLogFields` framing-safe.** Use `git log -z` (NUL record termination, which git itself
   guarantees cannot appear in commit text) or equivalent framing, so the reader stops depending on a
   property of the *content*. Fixes it for every writer, not just this CLI, and makes the module's own
   documentation true. Costs a change to a shared primitive with two call sites (`getMemoryHistory`,
   `auditAttribution`) and their tests.

They are not exclusive — (2) is what makes the documented guarantee true, and (1) is defence in depth
that happens to need a governance step first. This report does **not** choose; whoever takes it should
read `dl-067` before touching `reasonDefect`.

### Related

`bug-042-reason-text-has-no-contract-against-commit-trailer` (`planned`, `high` — the newline face of
the same "reason text meets a line-oriented reader" family; this is the control-character face, and
neither fixes the other), `dl-067-reason-trailer-contract` (`ready` — the ratified grammar, which does
not cover this), `task-072-fix-reason-trailer-contract` (`in-progress` on its branch, `backlog` on
`main`; verified above that its build still reproduces this),
`dl-027-req-sec-04-deprecate-reason-scope` (why `deprecate` is the sharpest reachability path),
`task-049-memory-history` (owns the `memory history` output contract the phantom entry violates),
`task-015-complete-audit-trail` (created `git-log.ts` and the separator convention),
`task-011` (`getMemoryHistory`), REQ-SEC-02, REQ-SEC-03, P1.7/P1.9/P1.10, `adr-006`.

Also observed and **not** filed: `memory history` prints `fatal: path '<doc>' exists on disk, but not
in '<first sha>'` to stderr on every run, including clean ones (visible in step 4's control output). It
is independent of this bug, does not affect the JSON payload, and belongs to whoever owns `--follow`
handling; noted here only so a reader of step 4 does not mistake it for part of this defect.

## Triage & Execution Notes

Raised during the round-6 governance ingest (2026-09-21), from the review of
`task-072-fix-reason-trailer-contract`. Filed unfixed — the agent stops at `open` and holds no approval
authority.

Everything above was measured, not reasoned: the reproduction was run end-to-end against **two** built
`dist/` trees (`main` at `ba2cad0` and `task-072` at `bfcc74b`), in throwaway `git init` projects, and
both the fabricated entry and the `from: null` were read out of the tool's own JSON. The `0x1f` half of
the received framing was tested the same way and **did not hold**, so it is recorded as a correction
rather than repeated.

Not attempted: any edit to `git-log.ts`, `commit-message.ts` or `dl-067`; no `git push` or network
operation of any kind; and no attempt to find a `0x1e` path that *would* forge a complete, authorised
approval rather than a blank phantom — that question is open and belongs to whoever scopes the fix.

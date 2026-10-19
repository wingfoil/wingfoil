---
id: task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate
type: task
title: "Accept a release tag on origin/release/X.Y matching the tag's major.minor in the publish gate"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["release", "publish", "ci"]
ref: "dl-159"
bug: []
depends_on: ["task-244-publish-release-test-results-coverage", "task-238-publish-mcp-registry-github-actions-bound-publish-job", "task-229-create-github-release-once-npm-has-version-sweep"]
tmpl_version: 261006   # Orignal template version
---

## Description

`dl-159` opens a maintenance line `release/X.Y` beside `main` and puts a patch tag `vX.Y.Z` on the pushed
`release/X.Y`. The `publish.yml` gate refuses such a tag: its step "Tag commit is on main (dl-024)" runs
`git merge-base --is-ancestor "$GITHUB_SHA" origin/main` (read at `5017321c`), and a fix on `release/0.3` reaches
`main` only by the later merge forward. The gate must accept a tag whose commit is on `origin/main` **or** on
`origin/release/X.Y`, where `X.Y` is the tag's own major.minor, and keep refusing everything else (a tag cut on a
`design/*` or `task/*` branch, or a `v0.4.1` on `release/0.3`), which is what `dl-024` decision 2 and `adr-009`
clause 1 rely on.

## Acceptance Criteria

- (red-first) The decision is a pure, offline function with unit tests — in `scripts/check-release-tag.cjs`
  (present since `task-115`, possibly extended by `task-238`), or a sibling script if design prefers — that maps a
  release tag to the remote refs it may sit on: `v0.3.1` → `origin/main`, `origin/release/0.3`; it refuses a tag
  that is not `vX.Y.Z` (`RELEASE_TAG`) with the existing message.
- (red-first) A fixture-repository test (a throw-away repository with a bare `origin`, identity passed per command,
  `git-conventions` §5) runs the gate's check and asserts: a tag on a commit of `origin/main` passes; `v0.3.1` on a
  commit only on `origin/release/0.3` passes; `v0.4.1` on that same commit fails (major.minor mismatch); a commit
  only on a `design/*` branch fails; with no `origin/release/0.3` at all the check falls back to `origin/main`
  alone and still passes or fails on it. A failure names every ref it checked.
- (red-first) `publish.yml` `gate` runs that check as **one** step (renamed to name both lines and cite `dl-159`),
  fetching `main` and, when it exists on the remote, `release/X.Y` with `--no-tags`; `test/cli/publish-pipeline.test.ts`
  ("gate asserts tag-on-main + tag↔version, …", the assertion on
  `git merge-base --is-ancestor "$GITHUB_SHA" origin/main`) is updated first to pin the new step, and still pins
  its position before the version check, `npm ci` and `prepublishOnly`.
- (characterization) The `publish.yml` header (the *Trigger* paragraph, runbook step 5, and the `act` note "The
  gate's "tag is on main" check …") states both lines. `spec-015` §4 is amended by `task-267` (same batch), which
  this task's Execution Notes name.
- (characterization) Post-merge, approver: the `v0.3.0` publish run's gate passes on the `main` path; the run
  URL is recorded in this task's Execution Notes at release-publishing.

## Implementation Notes

- **kind:** feature · **wave:** 3, batch B9 (added on 2026-10-07 by `decision-log-ingest-rel-v0.3-parallel-release-lines-plan`;
  B9 is the last batch of v0.3, after B8 and before `release-submit`). Size: S.
- **Implements:** `dl-159` Decision 4 and Action A1.1; `dl-024` decision 2, `dl-074`, `adr-009` clause 1 (kept).
- **Files:** `.github/workflows/publish.yml` (gate step + header), `scripts/check-release-tag.cjs` and
  `scripts/check-release-tag.d.cts` (or a sibling script), `test/cli/check-release-tag.test.ts`,
  `test/cli/publish-pipeline.test.ts`.
- **Order:** after `task-229`, `task-238` and `task-244`, the earlier writers of `publish.yml` (chain 229 → 238 →
  244); `task-238` may change `check-release-tag.cjs` (lightweight-tag refusal). First of B9: `task-266` and
  `task-267` depend on it.
- **Gating:** do not start before `dl-159` is `ready` (the approver ratifies it before the `v0.3.0` tag). This task
  must be in the tree `v0.3.0` is cut from: GitHub Actions runs the `publish.yml` of the tagged commit, so without
  it `0.3.1` could not be published from `release/0.3` (which `dl-159` forbids back-merging into); the `v0.3.0`
  publish, on the `main` path, exercises it first.

## Execution Notes

### design (developer, 2026-10-16)

Role architect. Worktree `.wf2-wt/task-265`, branch cut at `92bec996`, start commit `5242d319`.

**Inputs read (dl-015 hard gate, dl-102 §4).**
- `depends_on` Execution Notes: `task-229` (`done`; handover: the poll reads the exact version, the CHANGELOG
  extraction works on a `release/X.Y` tree, the spec-015 note does not restate "tag on `main`"), `task-238`
  (`done`; handover: extend `check-release-tag.cjs` or a sibling, keep `checkAnnotatedTag` its own export and
  "Tag commit is on main" one step for this task to replace — D6), `task-244` (`done`; handover: leave the gate
  step as it is apart from what this task needs; summary paths keyed by version). Each says the step was left
  untouched (`task-238`: `git diff 0671d035 HEAD -- .github/workflows/publish.yml | grep -nE
  "^[-+].*(merge-base|Tag commit is on main)"` → nothing; `task-244` the same over `32d8871b`).
- `dl-159` `ready` (Decision 4: patch tag on the pushed `release/X.Y`, minor tag on the pushed `main`; A1.1);
  `dl-024` `ready` (decision 2: tag reachable from permanent history, never on a phase branch); `dl-074` `ready`
  ("pushed" main); `adr-009` `accepted`; `spec-015` `approved` — §4 says "created **on `main`**" and "an ancestor
  of `origin/main`" (`grep -n "origin/main" docs/04_memory/design/specs/spec-015-*.md` → 247). That text is
  amended by `task-267` (this batch, ruling R5), not here: no contradiction to route, the ACs and `dl-159`
  agree.
- Today: `grep -n "merge-base --is-ancestor" .github/workflows/publish.yml` → 233; `grep -c "release/X.Y"
  .github/workflows/publish.yml` → 0; readers of the script: `grep -rln check-release-tag test scripts .github`
  → `publish.yml`, `check-release-tag.test.ts`, `publish-metadata.test.ts`, `publish-pipeline.test.ts`,
  `publish-release-scripts-edges.test.ts`.

**D1 — where the rule lives: a third mode of `scripts/check-release-tag.cjs`, which does its own fetch.**
The gate step becomes one command, so the fixture test (AC 2) runs exactly what CI runs, and the decision is a
pure, exported function (AC 1). The two existing modes and their exports are unchanged (checked after green with
`git diff 92bec996 HEAD -- scripts/check-release-tag.cjs | grep "^-"`, self-review) (`checkReleaseTag`,
`checkAnnotatedTag`, `tagObjectType`), so `publish-metadata.test.ts` and `publish-release-scripts-edges.test.ts`
stay green untouched.

New exports (CommonJS, declared with TSDoc in `scripts/check-release-tag.d.cts`):

```ts
/** AC 1 — pure: the remote-tracking refs a release tag may sit on, in this order. */
export function releaseLineRefs(tag: string | undefined): { readonly ok: boolean; readonly message: string; readonly refs: readonly string[] };
/** One ref as probed in the checkout. */
export interface LineProbe { readonly ref: string; readonly onRemote: boolean; readonly ancestor: boolean }
/** Pure verdict over the probes (order kept). */
export function checkTagOnLine(tag: string, commit: string, probes: readonly LineProbe[]): ReleaseTagCheck;
/** I/O: ls-remote, fetch --no-tags, merge-base, in the repository at `root`; `{ ok: false, message }` on a git failure. */
export function probeReleaseLines(root: string, commit: string, refs: readonly string[]):
  { readonly ok: true; readonly probes: readonly LineProbe[] } | { readonly ok: false; readonly message: string };
```

**The rule (for `task-267` to cite in spec-015 §3 stage 4 / §4).** A tag `vX.Y.Z` (`RELEASE_TAG`) may sit on
`origin/main` or on `origin/release/X.Y`, `X.Y` being the tag's own major.minor; the gate passes when the tagged
commit is an ancestor of at least one of them **as they are on `origin` at run time**, and refuses otherwise.
`releaseLineRefs('v0.3.1')` → `refs: ['origin/main', 'origin/release/0.3']`; `v1.0.0` → `release/1.0`. A tag that
is not `vX.Y.Z` → `ok: false`, `refs: []`, the existing message `tag <tag> is not of the form vX.Y.Z (spec-015
§4)`; no tag → `no release tag given`. Same rule for `Z = 0` and `Z ≥ 1` (D4).

**The refs it fetches, and how** (`probeReleaseLines`, run in the gate's checkout, remote name `origin`, every git
call through `execFileSync` with an argument array, never a shell):
1. `git ls-remote --heads origin refs/heads/main refs/heads/release/X.Y` — which of the two exist on the remote
   (read from the remote, never from a local tracking ref that may be stale);
2. `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main [+refs/heads/release/X.Y:refs/remotes/origin/release/X.Y]`
   — one fetch, only the refspecs step 1 listed;
3. `git merge-base --is-ancestor <commit> refs/remotes/origin/<branch>` for each listed ref, all of them, in
   order (no short-circuit, so the message is complete): exit 0 ancestor, 1 not; any other exit is a git failure.
A ref step 1 does not list is probed as `onRemote: false` (the AC 2 fallback: no `release/0.3` on `origin` → the
check stands on `origin/main` alone). A failure of step 1 or 2, or an exit other than 0/1 in step 3, refuses
(fail closed).

**Step (publish.yml `gate`, replacing "Tag commit is on main (dl-024)", same position — after `setup-node`,
before the version check, the annotated check, `npm ci` and prepublishOnly's steps):**

```yaml
      - name: Tag commit is on main or on release/X.Y of its own X.Y (dl-024, dl-159)
        run: node scripts/check-release-tag.cjs --on-line "$GITHUB_REF_NAME" "$GITHUB_SHA"
```

CLI: `node scripts/check-release-tag.cjs --on-line <tag> <commit>`, cwd = the repository to probe. Exit 0 pass
(stdout), 1 every refusal (stderr), one line each — as the other two modes. `<commit>` must match
`^[0-9a-f]{40}$|^[0-9a-f]{64}$`, checked before any git call.

**Messages (exact; `<sha>` = the commit argument, states in ref order, separated by `, `):**
- pass: `commit <sha> of tag <tag> is on <first ref it is an ancestor of>; checked <ref> (<state>), <ref> (<state>) (dl-024, dl-159)`
- refusal: `commit <sha> of tag <tag> is on none of the lines it may be released from; checked <ref> (<state>), <ref> (<state>) (dl-024, dl-159)`
- `<state>` ∈ `ancestor` · `not an ancestor` · `no such branch on origin`
- bad commit: `<commit> is not a full commit id` (`no commit given` when absent)
- git failure: `could not read the release lines from origin: <git's first stderr line>` (step 1 or 2),
  `could not test <ref>: <git's first stderr line>` (step 3, e.g. a commit the checkout does not have).

**D2 — fixture helper (git-conventions §5).** Reuse `test/storage/helpers/git-fixture.ts`: `git`,
`fixtureDirPrefix`, `cloneTempRepo`, `writeFixtureFile`, `commitAllAs` (identity through `GIT_AUTHOR_*` /
`GIT_COMMITTER_*` for that one command), `removeTempDir`. Not `makeTempGitRepo` / `commitAll`: they write
`user.name`/`user.email` with `git config` into the fixture, and the AC asks for identity per command. No
bare-origin helper exists (`grep -rn "'--bare'" test` → nothing): the bare origin is `git(mkdtempSync(fixtureDirPrefix()), ['init', '--bare', '--quiet', '--initial-branch=main'])`,
under the run-tagged prefix so `test/global-teardown.cjs` counts it; the working clone and the "gate checkout"
are two `cloneTempRepo(origin)`.

**D3 — header passages (AC 4) and the same-class line.** Rewritten: the *Trigger* paragraph (line 60–61), runbook
step 5 (line 98), the `act` note "The gate's "tag is on main" check …" (line 195–197), **and** the `gate →` line of
the stage list (line 7, "assert the tag is on main") — same class, not named by the AC. Each states both lines
(`main`, `release/X.Y` of the tag's own X.Y) and cites `dl-159`. The header names `task-265` in its opening list.

**D4 — `vX.Y.0` on `release/X.Y` (for the approver; recommendation (a)).** `dl-159` Decision 4 puts a minor
tag on `main`; A1.1, the Description and the ACs state one rule for every tag. (a) one rule for all tags — the
recommendation: it is the AC and A1.1 text, a `release/X.Y` is cut only from a commit that already holds
`vX.Y.0` (Decision 1), so the extra latitude is never reached, and spec-015 gets one sentence; (b) `Z = 0` →
`origin/main` only, which enforces Decision 4 literally at the cost of a second rule and a case the ACs do not
name.

**AC classification and what qa must pin** (all in the files named; existing cases kept):

| AC | Class | Test file | Pin |
|----|-------|-----------|-----|
| 1 | red-first | `test/cli/check-release-tag.test.ts`, new `describe('release lines (task-265) — dl-159')` | `releaseLineRefs`: `v0.3.1` → `{ ok: true, refs: ['origin/main', 'origin/release/0.3'] }` (order); `v1.0.0` → `release/1.0`; `v10.20.3` → `release/10.20`; `v0.3.0` → `release/0.3` (D4 (a)); refused with `refs: []` and the exact message `tag <t> is not of the form vX.Y.Z (spec-015 §4)` for `v0.3`, `0.3.1`, `v0.3.1-rc.1`, `v01.3.1`, `v0.3.1;echo x`; `''`/`undefined` → `no release tag given`. `checkTagOnLine` exact strings: one pass (second ref ancestor, first `not an ancestor`), one refusal with both states, one with `no such branch on origin`. |
| 2 | red-first | same file, nested `describe` on a fixture | Bare origin; working clone W; commit A on `main` pushed; `release/0.3` from A + commit B pushed; `design/x` from A + commit C pushed; gate checkout G = `cloneTempRepo(origin)` taken after those pushes. Run `spawnSync(process.execPath, [SCRIPT, '--on-line', tag, sha], { cwd: G })`. Exit/stream: (a) `v0.3.1` A → 0, stdout `is on origin/main`; (b) `v0.3.1` B → 0, stdout `is on origin/release/0.3`; (c) `v0.4.1` B → 1, stderr names `origin/main (not an ancestor)` and `origin/release/0.4 (no such branch on origin)`; (d) `v0.3.1` C → 1, stderr names `origin/main (not an ancestor)`, `origin/release/0.3 (not an ancestor)`; (e) second origin with no `release/0.3`: `v0.3.1` on its main commit → 0, on a commit off main → 1 with `origin/release/0.3 (no such branch on origin)`; (f) fetch: a commit D pushed to origin `main` after G was cloned → 0 (G's tracking ref was stale); (g) remote-not-local: in the second origin's checkout, `git update-ref refs/remotes/origin/release/0.3 <off-main commit>` → `v0.3.1` on it → 1, `no such branch on origin`; (h) `--no-tags`: a tag pushed to origin after G was cloned is absent from `git -C G tag -l` after a run; (i) `--on-line v0.3.1 HEAD` and a 40-hex sha G lacks → 1, `is not a full commit id` / `could not test origin/main`. Identity per command only (D2). |
| 3 | red-first | `test/cli/publish-pipeline.test.ts` | In "gate asserts tag-on-main + tag↔version, …" replace the first entry with `node scripts/check-release-tag.cjs --on-line "$GITHUB_REF_NAME" "$GITHUB_SHA"` (ordering kept: before the version check, `--annotated`, `npm ci`, build/test:report/lint). New case: exactly one gate step whose `run` contains `--on-line`, its `name` equal to `Tag commit is on main or on release/X.Y of its own X.Y (dl-024, dl-159)`; `runs(gate)` contains neither `merge-base --is-ancestor` nor `git fetch` (positive case: the step found). |
| 4 | red-first (task says characterization; corrected — `grep -c "release/X.Y" publish.yml` → 0 today, so the text is new) | `test/cli/publish-pipeline.test.ts`, header = text before `\nname: publish` | The *Trigger* paragraph, runbook step 5 (between `/\n#\s+5\. /` and `/\n#\s+6\. /`), the `act` section and the `gate    →` stage-list entry each contain `release/X.Y` and `main`; Trigger and step 5 contain `dl-159`; the header no longer contains `"tag is on main"`. |
| 5 | handover (post-merge; no test) | — | Recorded at v0.3 release-publishing: `gh run list --workflow publish.yml --branch v0.3.0 --json databaseId,url,conclusion`, then `gh run view <id> --log | grep "of tag v0.3.0 is on"` → expected `… is on origin/main; checked origin/main (ancestor), origin/release/0.3 (no such branch on origin) (dl-024, dl-159)`. The task is `done` by then, so the run URL and that line enter these notes through `memory amend task-265` triggered by the approver (proposed `--reason`: "Record the v0.3.0 publish run whose gate passed on the main path (AC 5)."). |

**Files.** `scripts/check-release-tag.cjs` (mode `--on-line`, three exports, usage/header comment),
`scripts/check-release-tag.d.cts`, `.github/workflows/publish.yml` (gate step, header lines 7, 60–61, 98,
195–197), tests by qa: `test/cli/check-release-tag.test.ts`, `test/cli/publish-pipeline.test.ts`. No
config `version:` to bump (none of these files carries one). spec-015 untouched (`task-267`).

**For `task-266` (second writer of the same two files).** Avoid in `publish.yml`: the gate's first check step,
the header's stage-list `gate    →` entry (lines 7–8), *Trigger* (60–61), runbook step 5 (98–100), the `act`
note (195–197); in `publish-pipeline.test.ts`: the gate ordering case and the new task-265 cases. Its own areas
(promote, mcp-registry, runbook step 6, the `RELEASE_MAKE_LATEST` line) are not touched here.

**Unasserted (testing T1).** That `GITHUB_SHA` on a pushed annotated tag names the tagged commit — the v0.2.2 gate
passed `merge-base --is-ancestor "$GITHUB_SHA" origin/main` on an annotated tag (`task-238` D6); that anonymous
`ls-remote`/`fetch` works with `persist-credentials: false` — the current step's `git fetch` already does.
Both are read again by AC 5's run.

### red (qa, 2026-10-16)

Red commit **`4d2ebe4d`** (T4 is measured from it). Files: `test/cli/check-release-tag.test.ts` (new
`describe('release lines (task-265) — dl-159')`), `test/cli/publish-pipeline.test.ts` (ordering case edited, new
`describe('release-line gate step and header (task-265) — dl-159')`). No production file, no `.d.cts`: the three
new exports are imported against the design's interface, and `scripts/check-release-tag.d.cts` (developer's, per
the batch prompt) must declare `releaseLineRefs`, `checkTagOnLine`, `probeReleaseLines` and `LineProbe` for
`npm run typecheck` (which includes `test/`) to pass; ts-jest transpiles without type-checking, so the run
below fails at runtime, not at compile time.

Run: `npx jest test/cli/check-release-tag.test.ts test/cli/publish-pipeline.test.ts --maxWorkers=2` → both
FAIL, 38 failed / 80 passed / 118 total (every pre-existing case still passes). Approver ruling D4 (a) applied:
`v0.3.0` → `release/0.3` like any `vX.Y.Z`.

| AC | Class | Tests | Observed failure (first assertion) |
|----|-------|-------|------------------------------------|
| 1 | red-first | `releaseLineRefs …` (4 maps, 5 non-`vX.Y.Z` refusals, `''`/`undefined`); `checkTagOnLine …` (pass on the 2nd ref, refusal with both states, `no such branch on origin`) | `TypeError: releaseLineRefs is not a function` / `checkTagOnLine is not a function` — the exports do not exist |
| 2 | red-first | fixture (bare origin via `mkdtempSync(fixtureDirPrefix())` + `init --bare`; clones by `cloneTempRepo`; commits by `commitAllAs`, identity per command): (a)–(i) as the design's table, plus "refuses a tag that is not vX.Y.Z"; `probeReleaseLines in-process` (ordered probes, `onRemote: false`, fail closed on a missing commit and on a repository with no `origin`) | CLI cases: `--on-line` is read as the tag today, so a pass case gets stdout `""`/exit 1 (e.g. (a) `Received: ""`, (h) `Expected: 0 Received: 1`) and a refusal case gets `tag --on-line is not of the form vX.Y.Z (spec-015 §4)` instead of the exact message; in-process: `probeReleaseLines is not a function` |
| 3 | red-first | ordering case renamed "gate asserts the tag’s release line + tag↔version, …", first entry `node scripts/check-release-tag.cjs --on-line "$GITHUB_REF_NAME" "$GITHUB_SHA"`; "runs the release-line check as exactly one gate step …" (name `Tag commit is on main or on release/X.Y of its own X.Y (dl-024, dl-159)`, run exact); "leaves no inline merge-base or fetch in the gate" | ordering `expect(order.every(i => i >= 0)) Expected: true Received: false`; one-step `Expected length: 1 Received length: 0`; no-inline `Expected substring: "--on-line"` |
| 4 | red-first (ruling D4: header text is new) | stage-list `gate →` entry, Trigger paragraph, runbook step 5, `act` section each contain `release/X.Y` and `main` (Trigger and step 5 also `dl-159`); header lacks `tag is on main`; header's opening list names `task-265` (design D3) | each `Expected substring: "release/X.Y"` (stage list, Trigger, step 5, act); `Expected substring: not "tag is on main"`; `Expected substring: "task-265"` |
| 5 | handover, no test | — | — |

Fixture notes: G (the gate checkout) is cloned after A/B/C are pushed; D on `main` and a lightweight tag
`v9.9.9` on D are pushed after G, so (f) needs the fetch and (h) needs `--no-tags` (a fetch of `main` would
otherwise auto-follow the tag onto D). (g) uses a separate clone with `update-ref
refs/remotes/origin/release/0.3 <X>`. `commit.gpgsign false` is set in each clone (signing config, not
identity). Section boundaries the header tests read: Trigger = `\n# Trigger:` to the next `\n#\n`; step 5 =
`/\n#\s+5\. /` to `/\n#\s+6\. /`; act = `/\n# ── [^\n]*`act`/` to the header end; stage list = `/\n#\s+gate\s+→/`
to `/\n#\s+stage\s+→/`.

Red addition **`9a300d1a`** (coordinator correction, batch practice B7/B8): `scripts/check-release-tag.d.cts`
now declares `releaseLineRefs`, `checkTagOnLine`, `probeReleaseLines` and `LineProbe` (types only; existing
declarations unchanged), so the paragraph above about the developer writing them no longer applies. T4 covers
`scripts/check-release-tag.d.cts` together with the two test files: measure from `4d2ebe4d` over the three
files, with `9a300d1a` the only qa addition. `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.

Qa send-back **`c4e248c4`** (review nit, T4): comment-only rewording in `check-release-tag.test.ts` (the annotated mode is separate "from the release-line check (`--on-line`, task-265)"); `npx jest test/cli/check-release-tag.test.ts --maxWorkers=2` → 44 passed.

### green (developer, 2026-10-16)

Commit `ca2ec784` `feat(publish): task-265 — …`. `scripts/check-release-tag.cjs` gains the `--on-line <tag> <commit>`
mode and the three exports of the design (`releaseLineRefs`, `checkTagOnLine`, `probeReleaseLines`), with the
rule, refs, flags and messages exactly as `### design` states them; approver ruling D4 (a) applied (one rule for
every `vX.Y.Z`). Git runs through `spawnSync('git', ['-C', root, …])`, never a shell; the tag (`RELEASE_TAG`) and
the commit (`^[0-9a-f]{40}$|^[0-9a-f]{64}$`) are checked before any git call. `publish.yml`: the gate step
"Tag commit is on main (dl-024)" (inline `git fetch` + `merge-base`) is replaced, in the same position, by
`Tag commit is on main or on release/X.Y of its own X.Y (dl-024, dl-159)` →
`node scripts/check-release-tag.cjs --on-line "$GITHUB_REF_NAME" "$GITHUB_SHA"`; the header's opening list names
`task-265`, and the stage-list `gate    →` entry, *Trigger*, runbook step 5 and the `act` note state both lines.
The `.d.cts` declarations are red's (`9a300d1a`), not edited.

Red → green: `npx jest test/cli/check-release-tag.test.ts test/cli/publish-pipeline.test.ts test/cli/publish-metadata.test.ts
test/cli/publish-release-scripts-edges.test.ts --maxWorkers=2` → red 38 failed / 80 passed in the first two (qa's
run); green 4 suites, 224 passed, 0 failed.

### refactor (developer, 2026-10-16)

Commit `47fed2df`: the header's `gate    →` entry rewrapped (two lines had grown past 120 columns); comment only.
Gates, each heavy one after `waitslot.sh`, `--maxWorkers=2`:

| Command | Result |
|---------|--------|
| `npx jest --coverage --maxWorkers=2` (at `ca2ec784`; load 3.4 before / 3.7 after) | 453 suites, 8143 tests passed, exit 0; 99.34 / 97.39 / 98.03 / 99.71 — equal to the B8 baseline in all four columns |
| `npm test -- --maxWorkers=2` (at `47fed2df`) | 453 suites, 8143 passed, exit 0 |
| `npx jest test/cli/publish-pipeline.test.ts` (after the rewrap) | 74 passed |
| `npm run lint` · `npm run typecheck` (both tsc configs) · `npm run docs:api` | exit 0 · exit 0 · exit 0 (re-run at the head below) |
| `node scripts/check-governance.cjs --base 92bec996` | `1 wf() commits …`; gated 0 findings, history 0 findings |
| `node scripts/lint-claims.cjs --base 92bec996` | 2 warnings, warn-only: line 91 (design's "unchanged", evidenced below) and line 227 (red's "no output", with its positive case `exit 0` on the same line) |

Scripts are not measured by coverage (`collectCoverageFrom` is `src/**/*.ts`), so the fixture's in-process
`probeReleaseLines` cases are for behaviour, not the figure. No config `version:` touched (none of the files
carries one). BDD: `grep -rln "publish" docs/02_requirements/02_bdd/features/` → nothing (positive case: the
same grep over `test/cli/` lists `publish-pipeline.test.ts`), so no scenario to keep or extend.

### self-review (developer, 2026-10-16)

- **AC 1** met: `releaseLineRefs` / `checkTagOnLine` exported and pinned (`check-release-tag.test.ts`, "releaseLineRefs …",
  "checkTagOnLine …", green above). **AC 2** met: fixture cases (a)–(i) and the in-process probes pass; the fixture
  passes identity per command (`commitAllAs`), no `user.*` written. **AC 3** met: one gate step, exact name and run,
  ordering kept, no inline `merge-base`/`git fetch` (`publish-pipeline.test.ts`, "release-line gate step and header").
  **AC 4** met, line 7 included (approver ruling): `grep -c "release/X.Y" .github/workflows/publish.yml` → 8 (was 0);
  `grep -c "tag is on main" .github/workflows/publish.yml` → 0. **AC 5**: handover below.
- The other readers keep their behaviour: `git diff 92bec996 HEAD -- scripts/check-release-tag.cjs | grep "^-"` lists only
  the usage comment, the `require` line, the `--annotated` branch head (now `else if`) and `module.exports` (all
  three old exports still exported); `git diff 92bec996 HEAD -- test/cli/publish-metadata.test.ts
  test/cli/publish-release-scripts-edges.test.ts | wc -l` → 0, and both suites pass in the green run (224).
- Same class: `grep -rn "origin/main" .wingfoil docs/user-guide.md docs/cli-reference.md README.md` → nothing (positive
  case: the same grep over `docs/04_memory/design/specs/spec-015-*.md` → line 247, `task-267`'s amendment). The
  comment "separate … from "Tag commit is on main" (task-265)" in `check-release-tag.test.ts:47` is a red file (T4),
  left for qa/the reviewer; it still describes the history correctly.
- T4: `git log --first-parent --no-merges --format=%h 4d2ebe4d..HEAD -- test/cli/check-release-tag.test.ts
  test/cli/publish-pipeline.test.ts scripts/check-release-tag.d.cts` → `9a300d1a` only, qa's coordinator-requested
  `.d.cts` addition (red's own).
- **For `task-266`** (merges this branch): `publish.yml` lines it should not edit at this head — 4–5 (opening list),
  7–10 (`gate    →` entry), 61–66 (*Trigger*), 103–106 (step 5), 201–202 (`act` note), 237–240 (the gate step and
  its comment); `publish-pipeline.test.ts`: the gate ordering case and `describe('release-line gate step and header
  (task-265)')`.
- **For `task-267`** (spec-015 §3 stage 4 / §4): cite `### design` — rule, `git ls-remote --heads origin
  refs/heads/main refs/heads/release/X.Y`, one `git fetch --no-tags origin +refs/heads/<b>:refs/remotes/origin/<b>…`
  of the listed ones, `git merge-base --is-ancestor` per ref, the step name and the messages — all as implemented.

### Pending amendments (approver)

None now. At v0.3 release-publishing (AC 5): `memory amend task-265` with `--reason "Record the v0.3.0 publish run
whose gate passed on the main path (AC 5)."`, adding the run URL from `gh run list --workflow publish.yml --branch
v0.3.0 --json databaseId,url,conclusion` and the gate line from `gh run view <id> --log | grep "of tag v0.3.0 is on"`
(expected `… is on origin/main; checked origin/main (ancestor), origin/release/0.3 (no such branch on origin)
(dl-024, dl-159)`).

**AC 5 recorded (2026-10-19, v0.3 release-publishing, `release-publishing-rel-v0.3-plan` S6).** `gh run list --workflow
publish.yml --branch v0.3.0 --json databaseId,url,conclusion` → run `39318377532`,
https://github.com/wingfoil/wingfoil/actions/runs/39318377532, `success`. Its `gate` job log (`gh api
repos/wingfoil/wingfoil/actions/jobs/<gate job id>/logs | grep "of tag v0.3.0 is on"`) → `commit
cc31d7a8ca3940c6ec96dca4e0ef77f32f52dfb1 of tag v0.3.0 is on origin/main; checked origin/main (ancestor),
origin/release/0.3 (no such branch on origin) (dl-024, dl-159)`: the main path of the publish gate passed on the
v0.3.0 tag, as AC 5 expected.

### Retrospective

- The design fixed the exact messages and fixture cases, so red and green met at the first run (38 → 0 failures, no
  send-back on behaviour); the one send-back was ownership of the `.d.cts` declarations, a coordinator-prompt
  issue already recorded in the batch notes.
- A doc-comment claim can outlive the scope it was written for: the script header's "Pure and offline" described
  the one mode the file had in task-115 and became false when `--annotated` and `--on-line` arrived; the independent
  review caught it (fixed below).

### independent review (2026-10-16) and fixes (developer)

Verdict: **APPROVE**, with three nits fixed in-task; status stays `in-review`.

1. *Red-file comment* (`test/cli/check-release-tag.test.ts`, the "Tag commit is on main" mention) — fixed by qa as a
   send-back, `c4e248c4`; T4 list now `9a300d1a` + `c4e248c4`, both qa:
   `git log --first-parent --no-merges --format=%h 4d2ebe4d..HEAD -- test/cli/check-release-tag.test.ts
   test/cli/publish-pipeline.test.ts scripts/check-release-tag.d.cts` → `c4e248c4`, `9a300d1a`.
2. *"Pure and offline"* (`scripts/check-release-tag.cjs:9`) — true of the version mode only; reworded to "This mode is
   pure and offline; the other two read git (`--annotated` the local checkout, `--on-line` also `origin`)". Sweep:
   `grep -n -i "pure\|offline" scripts/check-release-tag.cjs scripts/check-release-tag.d.cts` → the reworded header,
   `checkAnnotatedTag` ("Pure: the object type is read by tagObjectType"), and `releaseLineRefs` / `checkTagOnLine`
   in both files — each a function that calls no git, so accurate; the `.d.cts` (red file) needs no change.
3. *Stale `lint:claims` count* in the refactor table (2 → 3 warnings at `17a938ed`, the third the Retrospective's
   "Nothing else" line). That line is replaced by a retrospective point with its evidence. Now:
   `node scripts/lint-claims.cjs --base 92bec996` → see the line below, which supersedes the refactor table's count.

Re-run on the touched files: `npx jest test/cli/check-release-tag.test.ts test/cli/publish-pipeline.test.ts
--maxWorkers=2` and `npx eslint scripts/check-release-tag.cjs` — results below. No heavy gate: no `src/` change.

Results: `node scripts/lint-claims.cjs --base 92bec996` → `claim lint: 1 warnings in 1 file (warn-only)` — the one
left is red's line 228 ("no output", qa's notes; its positive case `exit 0` is on the same line). The design's
"unchanged" (line 91) now names its command. Jest on the two suites → 2 suites, 118 passed;
`npx eslint scripts/check-release-tag.cjs` → exit 0.

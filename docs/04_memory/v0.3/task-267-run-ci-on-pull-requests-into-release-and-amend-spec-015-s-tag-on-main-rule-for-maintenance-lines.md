---
id: task-267-run-ci-on-pull-requests-into-release-and-amend-spec-015-s-tag-on-main-rule-for-maintenance-lines
type: task
title: "Run CI on pull requests into release/** and amend spec-015's tag-on-main rule for maintenance lines"
status: done
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["release", "ci"]
ref: "dl-159"
bug: []
depends_on: ["task-207-drive-e2e-smoke-through-fresh-project-use-scenario", "task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate"]
tmpl_version: 261006   # Orignal template version
---

## Description

`dl-159` makes `release/X.Y` a line that receives pull requests and patch tags. `.github/workflows/ci.yml` runs
on `push` to `'**'` (which already includes `release/**`) but on `pull_request` only into `main` ("the one branch
releases are cut from", its header), pinned by `test/cli/ci-workflow.test.ts` (`expect(parsed.on.pull_request)
.toEqual({ branches: ['main'] })`). Its concurrency group spares only `main` from cancellation. `spec-015`
(`approved`) §3 stage 4 ends "Triggered on a `vX.Y.Z` tag on `main`" and §4 says the tag is created "on `main`".
The npm side must also accept a tag pushed from `release/*`.

## Acceptance Criteria

- (red-first) `ci.yml` `on.pull_request.branches` is `['main', 'release/**']`; `on.push` stays `{ branches: ['**'] }`;
  `test/cli/ci-workflow.test.ts` ("triggers on a push to any branch and on a pull request to main — and on nothing
  else") is updated first.
- (red-first) The concurrency group treats a push to `refs/heads/release/*` as it treats `main` — one group per
  commit, never cancelled — pinned in `ci-workflow.test.ts`; or design records why not, and the criterion becomes
  characterization of the unchanged group.
- (characterization) The `ci.yml` header (*Trigger*, *Concurrency*) names both lines and cites `dl-159`; the
  e2e-smoke job `task-207` added runs under the same triggers with no change of its own.
- (characterization) `spec-015` §3 stage 4 and §4 amended (dated Revision note, pending amendment with its proposed
  `--reason`): a minor tag `vX.Y.0` on the pushed `main`, a patch tag on the pushed `release/X.Y`, the gate
  accepting either (`task-265`).
- (characterization) Approver's external check, recorded in Execution Notes (the agent changes no setting): GitHub
  → Settings → Environments → `npm-publish`, the deployment rule ("deployment tags are restricted to `v*`",
  `publish.yml` header step A) admits a `v0.3.1` tag regardless of its branch; npmjs.com → `wingfoil` → Trusted
  publishing keys on organisation, repository, workflow `publish.yml` and environment `npm-publish`, not on a
  branch. Expected to hold for both (neither rule names a branch); not verified here.

- (red-first; added 2026-10-16, approver ruling on dl-159 option (b)) `.github/workflows/governance.yml` triggers on
  `push` and `pull_request` to `release/**` as well as to `main`, so a maintenance line's `wf()` commits, approvals
  included, are governance-checked before the patch is published; `test/cli/governance-workflow.test.ts` (which pins
  `branches: [main]`) is updated first. Like the rest of A1 it must be in the tree `v0.3.0` is cut from.

## Implementation Notes

- **kind:** feature · **wave:** 3, batch B9 (added on 2026-10-07 by `decision-log-ingest-rel-v0.3-parallel-release-lines-plan`).
  Size: S.
- **Implements:** `dl-159` Action A1.3; `spec-015` §3 stage 4 and §4 (amendment; `dl-074`'s pushed-ref precondition
  extended to `release/X.Y`).
- **Files:** `.github/workflows/ci.yml`, `test/cli/ci-workflow.test.ts`, `spec-015` (Revision note).
- **Order:** after `task-207` (B3, adds the smoke job to `ci.yml`) and `task-265` (the gate the amendment
  describes); last writer of `spec-015` in B9, after `task-266`.
- **Gating:** do not start before `dl-159` is `ready` (the approver ratifies it before the `v0.3.0` tag). This task
  must be in the tree `v0.3.0` is cut from: GitHub Actions runs the workflow files of the triggering commit
  (`ci.yml` for a pull request into `release/0.3`, `publish.yml` for its tag), so without it, and without `task-265`
  and `task-266`, `0.3.1` could not be built and published from `release/0.3` (which `dl-159` forbids back-merging
  into); the `v0.3.0` publish, on the `main` path, exercises the pipeline first.
- **Approver rulings (2026-10-07, at the filing of `dl-159`).** `ci.yml`'s concurrency group protects `release/*` runs from cancellation exactly as it protects `main`'s (no longer optional). The external check that the `npm-publish` environment and the npm trusted publisher accept a tag pushed from `release/*` is the approver's, at this task's review; the developer writes the exact steps in Execution Notes. Whether `npm stage approve` keeps the staged `--tag` (task-266) is checked with `npm view wingfoil dist-tags` after `0.3.0` is approved, if not settled earlier.

## Execution Notes

### design (developer, 2026-10-16)

Role architect. Worktree `.wf2-wt/task-267`, branch cut at `92bec996`, start commit `d2e23218`.

**Inputs read (dl-015 hard gate, dl-102 §4).**
- `task-207` (`done`): its handover leaves `ci.yml`'s `on:` to this task; the `e2e-smoke` job inherits `on:` and
  names no branch, no `if:`, no `needs:` (`ci-workflow.test.ts` "declares no trigger, condition or dependency of
  its own…"). So widening `on:` widens the smoke with no change of its own.
- `task-265` (design `1dec9fc4` on `task/265`, ruled 2026-10-16 D4 (a)): the gate step `Tag commit is on main or
  on release/X.Y of its own X.Y (dl-024, dl-159)` runs `node scripts/check-release-tag.cjs --on-line
  "$GITHUB_REF_NAME" "$GITHUB_SHA"`; it reads which of `refs/heads/main` and `refs/heads/release/X.Y` exist on
  `origin` (`git ls-remote --heads`), fetches only those with `--no-tags`, and passes when the tagged commit is an
  ancestor of at least one, `X.Y` being the tag's own major.minor; one rule for every `vX.Y.Z`, `vX.Y.0` included;
  a `release/X.Y` absent from `origin` is skipped. The spec-015 text below cites it as designed.
- `dl-159` `ready` (Decision 4, A1.3); `spec-015` `approved` (§3 stage 4 line 182 "tag on `main`", §4 lines
  245–247 "created **on `main`**", "ancestor of `origin/main`": `grep -n 'on \`main\`\|origin/main'
  docs/04_memory/design/specs/spec-015-packaging-publishing.md`); `tech-spec` is `amendable: true`
  (`.wingfoil/memory.yaml`). No contradiction between the ACs, `dl-159` and the ratified specs.
- Today: `grep -c "release/" .github/workflows/ci.yml .github/workflows/governance.yml` → `0` and `0`;
  `ci.yml:72` `pull_request: branches: [main]`, `ci.yml:78` and `governance.yml:52` the main-only concurrency
  groups; `governance.yml:44,46` `branches: [main]`.

**D1 — the concurrency rule (AC 2, ruling R4).** Both workflows take the same group body, parenthesised because
`&&` binds tighter than `||` in GitHub expressions:

```yaml
  group: ci-${{ (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/heads/release/')) && github.sha || github.ref }}
  group: governance-${{ (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/heads/release/')) && github.sha || github.ref }}
```

A push to `main` or to any `release/…` branch gets a group per commit and is never cancelled; any other push and
every pull request (`github.ref` = `refs/pull/<n>/merge`) keep their per-ref group and are cancelled by a newer
run, as today. `startsWith(…, 'refs/heads/release/')` covers exactly what the `release/**` filter admits.

**D2 — the governance range on a maintenance line** (read in `governance.yml` step `range` and
`scripts/check-governance.cjs` `checkGovernance`):
- **First push of a new `release/X.Y`** (branch creation): `github.event.before` is forty zeros, so `git cat-file
  -e "$BASE^{commit}"` fails, the step prints `No reachable range base: the whole history is checked.` and BASE is
  empty. The check then runs without `--base` over `HEAD`'s whole history. `release/X.Y` is cut from a commit of
  `main` (`dl-159` Decision 1), so its first-parent line is `main`'s: the script's introduction commit and each
  later check's introduction are found as on `main` (`git log --first-parent --diff-filter=A … -- scripts/check-governance.cjs`),
  history before them is reported only, and the commits after them were already gated by `main`'s own pushes.
  The config-version rule judges nothing (no range, script header lines 57–61) and the claim lint prints `No
  range: the claim lint reads only a range's changes.` Cost: one whole-history run, ~6 min idle (`task-167`),
  38 min measured under nine agents (`task-208` Retrospective). The one known whole-history false positive
  (`d818c0dd`, `task-208` notes) is `bug-308`, `closed` by `task-278`.
- **Later pushes to `release/X.Y`:** BASE = `github.event.before`, the line's previous tip — the pushed commits only.
- **Pull request into `release/X.Y`:** BASE = `github.event.pull_request.base.sha`, the line's tip; `HEAD` is
  `refs/pull/<n>/merge`, whose first parent is that tip, so the range is the PR's commits plus the merge commit and
  the introductions are found as on `main`. The merge forward (`release/X.Y` → `main`) is a PR or push into `main`,
  already covered: its range carries the line's commits, each already checked on the line.
- **Recommendation (a):** keep the step unchanged; in session 3, under the slot, run `node scripts/check-governance.cjs`
  (no `--base`) at the branch head — the run CI makes on the first push of a `release/X.Y` cut from it — and record
  exit 0 and its first line. (b), declined: on an all-zero `before`, take `git merge-base HEAD origin/main` as BASE
  — a new red-first case and a range rule no AC asks for, for a run that happens once per patched minor.

**D3 — AC 3 reclassified, as `task-265` D4.** The header text is new (`grep -c "release/" .github/workflows/ci.yml`
→ 0), so the header part is **red-first**; the e2e-smoke part stays **characterization** (the job already names
no branch). Same class, in-task (R4): `governance.yml`'s header lines 1 ("every push and pull request to main"),
16–20 (the range paragraph, which names only `main`'s `before`) and 34 ("no run on `main` is ever cancelled") are
rewritten to name both lines, cite `dl-159`, and state D2's first-push range.

**D4 — branch protection (for the approver; no change here).** `svc-022` (`active`) requires the `governance`
check on `main` only. A `release/*` rule is a repository setting the approver adds when `release/0.3` is cut
(none exists: `git branch -a --list '*release/*'` → nothing); recommendation: a handover to `patch-v0.3.1`'s
prerequisites (`svc-022` amended, or a new `service`, `kind: setting`, through service-ingest), not a v0.3 item.

**AC classification and what qa must pin** (existing cases kept; the test files below only):

| AC | Class | Test file | Pin |
|----|-------|-----------|-----|
| 1 — `pull_request` into `release/**` | red-first | `test/cli/ci-workflow.test.ts`, case "triggers on a push to any branch and on a pull request to main — and on nothing else" (retitle: "…to main or to a release/** line…") | `Object.keys(on)` still `['pull_request','push']`; `on.push` `toEqual({ branches: ['**'] })`; `on.pull_request` `toEqual({ branches: ['main', 'release/**'] })` (order as written). |
| 2 — concurrency spares `release/*` | red-first | same file, case "cancels superseded runs per branch or PR, but never a run on main" (retitle to name `release/*`) | `concurrency` `toEqual({ group: "ci-${{ (github.ref == 'refs/heads/main' \|\| startsWith(github.ref, 'refs/heads/release/')) && github.sha \|\| github.ref }}", 'cancel-in-progress': true })` (the `\|` are table escapes: plain `\|\|` in the test). |
| 3a — `ci.yml` header | red-first (D3) | same file, new case; header = `raw` before `\nname: ci` | The paragraph starting `# Trigger.` (to the next `#` blank line) contains `release/X.Y`, `main` and `dl-159`, and no longer contains `the one branch releases are cut from`; the paragraph starting `# Concurrency:` contains `release/X.Y` and `dl-159`. |
| 3b — e2e-smoke unchanged | characterization | same file, `describe('the e2e-smoke job (task-207)')` | Existing "declares no trigger, condition or dependency…" case kept; add to it `expect(text).not.toMatch(/release/)`. Passes on first run. |
| 4 — spec-015 amended | characterization (pending amendment, no test) | — | Checked at close: `grep -n 'release/X.Y' docs/04_memory/design/specs/spec-015-packaging-publishing.md` lists §3 stage 4, §4 and the Revision note; `grep -c 'created \*\*on \`main\`\*\* after' …` → only the quotations inside Revision notes. |
| 5 — approver's external check | characterization (runbook, no test) | — | The runbook below, copied into the review report. |
| 6 — `governance.yml` on `release/**` | red-first | `test/cli/governance-workflow.test.ts` | (i) "triggers on push to main…" → `on` `toEqual({ push: { branches: ['main', 'release/**'] }, pull_request: { branches: ['main', 'release/**'] } })`; (ii) "never cancels a run on main" → `raw` contains `group: governance-${{ (github.ref == 'refs/heads/main' \|\| startsWith(github.ref, 'refs/heads/release/')) && github.sha \|\| github.ref }}`, and its body after `governance-` equals ci.yml's after `ci-` (one rule, two files); (iii) header (`raw` before `\nname: governance`): line 1 contains `release/X.Y`; the paragraph starting `# The range` contains `release/X.Y`, `all-zero` and `whole history`; the paragraph starting `# Kept equal to ci.yml` contains `release/X.Y`; the header contains `dl-159`. |

**Files.** `.github/workflows/ci.yml` (`on.pull_request`, concurrency, header *Trigger*, *Concurrency*, the
"runs twice per push" line), `.github/workflows/governance.yml` (`on`, concurrency, header lines 1, 16–20, 34);
tests by qa: `test/cli/ci-workflow.test.ts`, `test/cli/governance-workflow.test.ts`; this file. Uncommitted:
`spec-015`. No config `version:` to bump (none of these files carries one). `publish.yml` untouched (`task-265`,
`task-266`).

**The spec-015 amendment (session 3, ruling R5: after `task/266` is merged into this branch).**
- §3 stage 4, last sentence "Triggered on a `vX.Y.Z` tag on `main`." becomes: "Triggered on a `vX.Y.Z` tag: a
  minor tag `vX.Y.0` on the pushed `main`, a patch tag `vX.Y.Z` (Z ≥ 1) on the pushed `release/X.Y` (§4,
  `dl-159`)."
- §4, first bullet, exact proposed wording (`task-286`'s `git-conventions` §3 agrees with it):

  > - The publish trigger is an annotated git tag `vX.Y.Z`. A minor tag `vX.Y.0` is created **on `main`**
  >   after the release's last phase branch merges; a patch tag `vX.Y.Z` (Z ≥ 1) is created **on
  >   `release/X.Y`**, the maintenance line of the released minor `X.Y`, after the patch's last phase branch
  >   merges into it (`dl-024`, `dl-159` Decision 4; never on a `design/*` or other phase branch). **The line
  >   must be pushed to `origin` before the tag is pushed:** CI asserts that the tagged commit is an ancestor
  >   of `origin/main` or of `origin/release/X.Y`, `X.Y` being the tag's own major.minor, as the two branches
  >   are on `origin` when the gate runs, not of anyone's local branch (`dl-074`, extended to the maintenance
  >   line by `dl-159`). The gate applies that one rule to every `vX.Y.Z`, `vX.Y.0` included, and skips a
  >   `release/X.Y` that does not exist on `origin`, so a minor tag stands on `origin/main` alone (step "Tag
  >   commit is on main or on release/X.Y of its own X.Y (dl-024, dl-159)", `check-release-tag.cjs --on-line`,
  >   `task-265`). Tag ↔ `package.json` `version` must match (CI asserts this before promote). The gate also
  >   refuses a lightweight tag: `refs/tags/<tag>` must name a tag object (`check-release-tag.cjs
  >   --annotated`, `dl-057` (d) option 1). See the *Revision (2026-09-28) — §4* note and the *Revision
  >   (<date>, `task-267-…`) — §3 stage 4 and §4* note below.

- A dated Revision note appended after `task-266`'s, in the house form: "**Revision (<date>,
  `task-267-…`) — §3 stage 4 and §4: a patch tag on the pushed `release/X.Y`, per `dl-159` (`ready`) Decision 4
  and A1.1/A1.3.**" quoting the replaced sentence and bullet in full, naming the gate step and `task-265`, and
  stating that `ci.yml` and `governance.yml` now run on pull requests into (and, for governance, pushes to)
  `release/**` with the per-commit concurrency group; pins `test/cli/check-release-tag.test.ts`,
  `test/cli/publish-pipeline.test.ts`, `test/cli/ci-workflow.test.ts`, `test/cli/governance-workflow.test.ts`;
  "Edited in place: no supersede, no state change, no `version:` bump (`dl-047`), as in the revisions above."
- Proposed `--reason`: "Amend §3 stage 4 and §4 so a patch tag vX.Y.Z goes on the pushed release/X.Y and a minor
  tag on the pushed main, as the publish gate of task-265 accepts, per dl-159 Decision 4 (task-267)."

**Runbook — the approver's external check (AC 5; the agent changes no setting).** Read-only; expected outputs
from `svc-006` / `svc-009` (`active`). A tag rule matches the tag's name; a tag carries no branch, so the OIDC
token's `ref` is `refs/tags/v0.3.1` whichever line the tag sits on.

```sh
# 1. Environment npm-publish: one deployment policy, type tag, name v* (admits v0.3.1 from any line)
gh api repos/wingfoil/wingfoil/environments/npm-publish/deployment-branch-policies --jq '[.branch_policies[]|{name,type}]'
#    expected: [{"name":"v*","type":"tag"}]
gh api repos/wingfoil/wingfoil/environments/npm-publish --jq '{deployment_branch_policy, rules:[.protection_rules[]|{type,reviewers:[.reviewers[]?|.reviewer.login]}]}'
#    expected: deployment_branch_policy {"custom_branch_policies":true,"protected_branches":false};
#              rules: branch_policy, required_reviewers ["robypomper"]
# 2. Glob check, offline: v0.3.1 matches the v* pattern
case v0.3.1 in v*) echo "v0.3.1 matches v*";; *) echo "NO MATCH";; esac
```

3. npm trusted publisher: open https://www.npmjs.com/package/wingfoil/access (signed in as a maintainer),
   section *Trusted Publisher*: organisation `wingfoil`, repository `wingfoil`, workflow filename `publish.yml`,
   environment `npm-publish`, staging only ("Allow npm publish" unchecked). Expected: no branch or ref field
   exists in the form — nothing to change.
4. End-to-end proof: the first patch tag's run (`v0.3.1`), at `patch-v0.3.1` release-publishing:
   `gh run list --workflow publish.yml --branch v0.3.1 --json databaseId,conclusion,url` → `promote` waited on
   `npm-publish` and staged. Not verified here.

**Unasserted (testing T1).** That GitHub evaluates `startsWith(github.ref, 'refs/heads/release/')` as written, and
that a branch-creation push carries an all-zero `before`: GitHub documentation behaviour, read again by the first
push of `release/0.3`. Offline tests pin the strings only, as the existing cases do.

**For other B9 tasks.** `task-266`: no shared file except spec-015, whose Revision notes are serialised by R5.
`task-286`: §3 must say what the §4 bullet above says (minor tag on pushed `main`, patch tag on pushed
`release/X.Y`, never on a phase branch). `task-288`: `release-publishing.yaml` phase `tag`'s `on:` follows the
same split. Nothing here touches 285/287 files.

### red (qa, 2026-10-16)

Role qa. Red commit **`d0791c66`** (T4 is measured from it). Files: `test/cli/ci-workflow.test.ts`,
`test/cli/governance-workflow.test.ts` — the existing cases kept; two local helpers per file, `headerOf` (the
comment header, before the `name:` line) and `headerParagraph` (a header paragraph from the line starting with a
given prefix to the next bare `#` line; fails when no line starts with it).

Run: `npx jest test/cli/ci-workflow.test.ts --maxWorkers=2` → 3 failed, 13 passed, 16 total;
`npx jest test/cli/governance-workflow.test.ts --maxWorkers=2` → 3 failed, 8 passed, 11 total.
`npx tsc --noEmit -p tsconfig.json` (under the slot) → no output, exit 0.

| AC | Class | Test (file › case) | Fails today on |
|----|-------|--------------------|----------------|
| 1 | red-first | ci-workflow › "triggers on a push to any branch and on a pull request to main or to a release/** line — and on nothing else (task-267 AC 1, dl-159 A1.3)" | `expect(parsed.on.pull_request).toEqual({ branches: ['main', 'release/**'] })` — received `['main']` (Expected −1) |
| 2 | red-first | ci-workflow › "cancels superseded runs per branch or PR, but never a run on main or on a release/* line (one group per commit there; task-267 AC 2)" | `toEqual` on `concurrency`: the group is today's main-only expression (Expected −1 / Received +1) |
| 3a | red-first (D3) | ci-workflow › "names both lines, main and release/X.Y, in the header's Trigger and Concurrency paragraphs, citing dl-159 (task-267 AC 3)" | `expect(trigger).toContain('release/X.Y')` on the `# Trigger.` paragraph |
| 3b | characterization | ci-workflow › e2e-smoke › "declares no trigger, condition or dependency of its own, names no branch, and never stages" + `expect(text).not.toMatch(/release/)` | passes on first run |
| 6 (i) | red-first | governance-workflow › "triggers on push to main or to a release/** line, and on pull requests into either — and on nothing else (task-267 AC 6, dl-159)" | `toEqual` on `on`: `release/**` missing from both branch lists (Expected −2) |
| 6 (ii) | red-first | governance-workflow › "never cancels a run on main or on a release/* line — the same group rule as ci.yml (task-267 AC 6, design D1)" | `expect(raw).toContain("group: governance-${{ (github.ref == … startsWith(github.ref, 'refs/heads/release/')) … }}")`; then the body after `governance-` must equal ci.yml's after `ci-` |
| 6 (iii) | red-first (D3, same class) | governance-workflow › "names release/X.Y in its header — line 1, the range paragraph (all-zero first push → whole history), the ci.yml paragraph — citing dl-159 (task-267 AC 6, design D2/D3)" | `expect(header.split('\n')[0]).toContain('release/X.Y')` |
| 4, 5 | characterization, no test | — | checked at close / approver's runbook (design) |

Markers the developer keeps (the red pins them): the header paragraphs start `# Trigger.` and `# Concurrency:`
(ci.yml), `# The range` and `# Kept equal to ci.yml` (governance.yml); the range paragraph uses the words
`all-zero` and `whole history` (both already there today); `the one branch releases are cut from` leaves the
ci.yml *Trigger* paragraph. The trigger tests fix the branch order as `['main', 'release/**']`.

### green (developer, 2026-10-16)

Green commit **`7a55dd02`** `feat(ci): task-267 — run ci and governance on release/** lines, never cancelling a run
there (dl-159 A1.3)`; files `.github/workflows/ci.yml`, `.github/workflows/governance.yml` only.
- `ci.yml`: `on.pull_request.branches: [main, 'release/**']` (`on.push` unchanged, `['**']`); concurrency group
  per design D1 (approver ruling 2026-10-16); header *Trigger.* paragraph names `main` and `release/X.Y`, cites
  `dl-159`, drops "the one branch releases are cut from"; *Concurrency:* paragraph names `release/X.Y`, says why
  the expression is parenthesised and that a pull request keeps its per-ref group; the "runs twice per push"
  sentence names both lines. The `e2e-smoke` job is untouched (`git diff 92bec996 HEAD -- .github/workflows/ci.yml
  | grep -c '^[-+] *- name\|^[-+] *run:'` → `0`).
- `governance.yml`: `on.push` and `on.pull_request` both `[main, 'release/**']`; the same group body as `ci.yml`;
  header line 1, *The range* paragraph (design D2: the all-zero `before` of a new `release/X.Y`'s first push → the
  whole history; a `release/X.Y` cut from `main` has `main`'s first-parent line), *Kept equal to ci.yml* (no run
  on `main` or a `release/X.Y` line is cancelled), and one sentence in *Binding* (a `release/X.Y` line has no
  branch-protection rule until the approver adds one, design D4). The range step is unchanged (ruling D2 (a)).
- red → green: `npx jest test/cli/ci-workflow.test.ts test/cli/governance-workflow.test.ts
  test/cli/workflow-action-pins.test.ts --maxWorkers=2` → red: 6 failed (3 + 3, `### red (qa)`); green: 3 suites,
  41 passed, 0 failed. The other readers of the two files (`grep -rln "workflows/ci.yml\|'ci.yml'\|governance.yml"
  test`): `npx jest test/cli/dependency-check-workflow.test.ts test/cli/dev-advisories.test.ts
  test/cli/git-hooks.test.ts test/cli/production-advisories.test.ts test/cli/run-tests.test.ts --maxWorkers=2` →
  5 suites, 38 passed.
- Same-class sweep: `grep -n "branches:" .github/workflows/ci.yml .github/workflows/governance.yml` → `ci.yml:75`
  `['**']`, `ci.yml:77`, `governance.yml:50,52` `[main, 'release/**']`; `grep -c "release/" .github/workflows/ci.yml
  .github/workflows/governance.yml` → `7`, `11` (both `0` at `92bec996`). Other workflows (`publish.yml`,
  `pages.yml`, tag-triggered) belong to `task-265`/`task-266`; `dependency-check.yml` has no branch trigger
  (`schedule`, `workflow_dispatch`); `scorecard.yml` runs on push to `main` only by design ("Scorecard scores
  the default branch", its header line 8, `dl-129` Decision 1), so it is not the same class.

### refactor (developer, 2026-10-16)

No code refactor needed (two YAML files). Gates, heavy ones each after `waitslot.sh`, `--maxWorkers=2`, run with
the uncommitted spec-015 amendment in the working tree:
- `npm run test:coverage -- --maxWorkers=2` at `7a55dd02` → `Test Suites: 453 passed, 453 total`, `Tests: 8108
  passed, 8108 total`, exit 0; `All files | 99.34 | 97.39 | 98.03 | 99.71` = the B8 baseline in every column.
  Load 2.87 → 8.03 (19:28 → 19:49).
- `npm test -- --maxWorkers=2` at `7a55dd02` → `Test Suites: 453 passed, 453 total`, `Tests: 8108 passed, 8108
  total`, exit 0; load 3.07 → 3.22 (20:44 → 20:52).
- `npm run -s lint` → exit 0, no output. `npm run -s docs:api` → exit 0. `npm run -s typecheck` (both tsc
  configs) → exit 0, no output.
- `node scripts/check-governance.cjs --base 92bec996` → `governance check: 1 wf() commits in 92bec996…..HEAD`,
  `gated: 0 findings on 0 commits`, exit 0.
- `node scripts/lint-claims.cjs --base 92bec996` (re-run at the independent review's F2, after the notes were
  committed) → `claim lint: 8 warnings in 1 file (warn-only), 1 file read`, exit 0; all eight on this file, all read
  as false positives: three "nothing else" on qa's quoted test titles (red table, design table), one "does not
  exist" in the quoted spec-015 §4 text, one "already covered" (design D2, a reasoning line), and three
  "unchanged" — the 3b row of the design table (a pin, its test named) and two in `### green` (`on.push`
  unchanged, shown by `grep -n "branches:"` there; the range step unchanged, ruling D2 (a)).
- **Ruling D2 (a) evidence — the whole-history run CI makes on the first push of a `release/X.Y` cut from this
  head:** `node scripts/check-governance.cjs` (no `--base`) at `7a55dd02`, under the slot → first line
  `governance check: 4755 wf() commits in HEAD (2729 after the introduction commit fcd43569…), and 2368 other
  commits`; `gated: 0 findings on 0 commits`; `history: 1037 findings on 643 commits` (reported, not failing);
  exit 0; `real 997.18s` at load 9.5 → 4.1 (task-167's ~6 min was measured idle).
- No BDD scenario names `ci.yml` or `governance.yml` (`grep -rln "ci.yml\|governance.yml"
  docs/02_requirements/02_bdd/features` → nothing); no CLI/help change, so `docs/cli-reference.md` is untouched.

### self-review (developer, 2026-10-16)

- AC 1 — met: ci-workflow › "triggers on a push to any branch and on a pull request to main or to a release/**
  line…" passes; `ci.yml:77`.
- AC 2 — met: ci-workflow › "cancels superseded runs … release/* line" passes; group string equal to ruling D1.
- AC 3 — met: header case passes (3a); e2e-smoke case with `not.toMatch(/release/)` passes (3b); the job's steps
  are unchanged (the `git diff … | grep -c` above → 0).
- AC 4 — prepared as a pending amendment (below), uncommitted: `git status --short` lists
  `docs/04_memory/design/specs/spec-015-packaging-publishing.md` as ` M`. `grep -c 'release/X.Y'` on that file →
  the §3 stage 4 sentence, the §4 bullet and the Revision note carry it.
- AC 5 — the runbook stays in `### design` (read-only `gh api` commands with the expected outputs, the npm form,
  the end-to-end proof at `v0.3.1`); no setting changed by the agent.
- AC 6 — met: the three governance cases pass; `governance.yml:50,52`.
- T4: `git log --first-parent --no-merges --format=%h d0791c66..HEAD -- test/cli/ci-workflow.test.ts
  test/cli/governance-workflow.test.ts` → empty.
- Headings name their agents: design (developer), red (qa), green / refactor / self-review (developer).
- No config `version:` to bump (neither workflow carries one). No Memory element created.

### Pending amendments (approver)

- `spec-015-packaging-publishing` — §3 stage 4 last sentence, §4 first bullet, and a dated Revision note appended
  last, in the working tree, uncommitted. Per ruling R5 the coordinator stashes it, merges `task/266`, re-applies
  it after `task-266`'s note, then runs the amend. Proposed `--reason`: "Amend §3 stage 4 and §4 so a patch tag
  vX.Y.Z goes on the pushed release/X.Y and a minor tag on the pushed main, as the publish gate of task-265
  accepts, per dl-159 Decision 4 (task-267)."
  - §3 stage 4: "Triggered on a `vX.Y.Z` tag on `main`." becomes "Triggered on a `vX.Y.Z` tag: a minor tag
    `vX.Y.0` on the pushed `main`, a patch tag `vX.Y.Z` (Z ≥ 1) on the pushed `release/X.Y` (§4, `dl-159`)."
  - §4 first bullet: exactly the text quoted in `### design` (*The spec-015 amendment*), whose closing reference
    now names this Revision note.
  - The Revision note, in full:

  > **Revision (2026-10-16, `task-267-run-ci-on-pull-requests-into-release-and-amend-spec-015-s-tag-on-main-rule-for-maintenance-lines`) — §3 stage 4 and §4: a patch tag goes on the pushed `release/X.Y`, a minor tag
  > on the pushed `main`, per `dl-159` (`ready`) Decision 4 and Actions A1.1 and A1.3.** `dl-159` opens a
  > maintenance line `release/X.Y` beside `main` for the patches of a released minor. Stage 4 ended "Triggered on a
  > `vX.Y.Z` tag on `main`." and now names both lines. The §4 tag bullet previously read, in full:
  >
  > > - The publish trigger is an annotated git tag `vX.Y.Z` created **on `main`** after the release branch
  > >   merges (`dl-024`; never on a `design/*` branch). **`main` must be pushed to `origin` before the tag
  > >   is pushed:** CI asserts that the tagged commit is an ancestor of `origin/main`, not of anyone's
  > >   local `main` (`dl-074`). Tag ↔ `package.json` `version` must match (CI asserts this before
  > >   promote). The gate also refuses a lightweight tag: `refs/tags/<tag>` must name a tag object
  > >   (`check-release-tag.cjs --annotated`, `dl-057` (d) option 1). See the *Revision (2026-09-28) — §4*
  > >   note below.
  >
  > The publish gate's step "Tag commit is on main (dl-024)" (`git fetch --no-tags origin main`, then `git merge-base
  > --is-ancestor "$GITHUB_SHA" origin/main`) is replaced by `task-265`'s step "Tag commit is on main or on
  > release/X.Y of its own X.Y (dl-024, dl-159)", which runs `node scripts/check-release-tag.cjs --on-line
  > "$GITHUB_REF_NAME" "$GITHUB_SHA"`: it reads which of `main` and `release/X.Y` exist on `origin`, fetches only
  > those with `--no-tags`, and passes when the tagged commit is an ancestor of at least one of them (approver
  > ruling on `task-265` D4 (a): one rule for every `vX.Y.Z`, `vX.Y.0` included). `dl-074`'s pushed-ref
  > precondition thus extends to the maintenance line. Beside the gate, `ci.yml` now runs on pull requests into
  > `release/**` as well as into `main`, `governance.yml` on pushes and pull requests to either, and in both a
  > push to `main` or to a `release/X.Y` line has a concurrency group of its own commit, so no run there is
  > cancelled (`task-267`). The pins are `test/cli/check-release-tag.test.ts`, `test/cli/publish-pipeline.test.ts`,
  > `test/cli/ci-workflow.test.ts` and `test/cli/governance-workflow.test.ts`. Edited in place: no supersede, no
  > state change, no `version:` bump (`dl-047`), as in the revisions above.

### Retrospective

- The design read `task-265`'s design notes in its worktree before they were merged; the spec-015 text quotes
  that design, so a change to `task-265`'s step name or rule at its review would have to reach this amendment
  before it is run (evidence: the step name appears in both `### design` sections).
- A whole-history governance run took 997 s at load ~9, against ~6 min idle: the first push of each
  `release/X.Y` pays that once (D2 (a)).

### independent review (2026-10-16) and fixes (developer)

Verdict: approve with fixes (text only).
- **F1** — `.github/workflows/governance.yml`, *The range* paragraph: "about six minutes (task-167)" replaced by the
  measured figures, "~6 min idle (task-167), 997 s at load ~9.5 (task-267), up to ~38 min under load
  (task-208)", and one sentence added: for a new remote ref `.githooks/pre-push` takes `git merge-base HEAD
  origin/main` as its base (`sed -n 25,26p .githooks/pre-push` shows the zero-sha test and that line), so on the
  first push of a `release/X.Y` the local twin checks only the commits not on `main` while CI checks the whole
  history. CI stays as it is (ruling D2 (a)); the follow-up is the coordinator's. The red-pinned opener `# The
  range` and the tokens `all-zero`, `whole history`, `release/X.Y` are kept: `npx jest
  test/cli/ci-workflow.test.ts test/cli/governance-workflow.test.ts test/cli/workflow-action-pins.test.ts
  --maxWorkers=2` → 3 suites, 41 passed.
- **F2** — the claim-lint line in `### refactor` now records the current output (8 warnings) and what each one is.
- The spec-015 pending amendment is untouched and still uncommitted (R5). Status stays `in-review`. T4:
  `git log --first-parent --no-merges --format=%h d0791c66..HEAD -- test/cli/ci-workflow.test.ts
  test/cli/governance-workflow.test.ts` → empty.

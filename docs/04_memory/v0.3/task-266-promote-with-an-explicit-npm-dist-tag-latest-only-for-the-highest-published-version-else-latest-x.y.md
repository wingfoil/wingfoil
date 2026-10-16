---
id: task-266-promote-with-an-explicit-npm-dist-tag-latest-only-for-the-highest-published-version-else-latest-x.y
type: task
title: "Promote with an explicit npm dist-tag: latest only for the highest published version, else latest-X.Y"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["release", "publish", "npm"]
ref: "dl-159"
bug: []
depends_on: ["task-265-accept-a-release-tag-on-origin-release-x.y-matching-the-tag-s-major.minor-in-the-publish-gate", "task-238-publish-mcp-registry-github-actions-bound-publish-job", "task-244-publish-release-test-results-coverage"]
tmpl_version: 261006   # Orignal template version
---

## Description

`dl-159` Decision 6: a version lower than the highest published one never becomes `latest`; it is published under
`latest-X.Y`. Job `promote` names no dist-tag today: `npm stage publish ./dist-pack/*.tgz --provenance --access
public` (read at `5017321c`, pinned by `test/cli/publish-pipeline.test.ts`). npm's client already refuses the
dangerous case — `lib/commands/publish.js` throws "Cannot implicitly apply the "latest" tag because previously
published version … is higher than the new version …" when no `--tag` is given, and `npm stage publish` inherits it
(`class StagePublish extends Publish`), read in npm 11.19.0 (bundled with the `PROMOTE_NODE_VERSION` Node 24.21.0),
11.20.0 and 12.1.0 — so a `0.3.1` after `0.4.0` would fail at promote rather than publish. The task makes the
dist-tag explicit and correct in both directions, and checks that the MCP Registry listing follows the same order.

## Acceptance Criteria

- (red-first) A pure function with unit tests (a script under `scripts/`, with its `.d.cts`) chooses the dist-tag
  from the version and the list of published versions: `latest` when the version is greater (semver) than every
  published version, otherwise `latest-X.Y`. Cases: `0.3.1` over `[0.3.0]` → `latest`; `0.3.1` over
  `[0.3.0, 0.4.0]` → `latest-0.3`; `0.4.0` over `[0.3.0, 0.3.1]` → `latest`; a version already in the list or a
  prerelease → an error naming it.
- (red-first) `promote` reads the published versions (`npm view wingfoil versions --json`; a package with no
  versions is not a case here, `wingfoil` exists), runs that function, and passes the result with an explicit
  `--tag` to `npm stage publish`; `test/cli/publish-pipeline.test.ts` is updated first and asserts `--tag` is
  present and that the step hard-codes no literal `latest`. The step keeps `set +x` first and `if: ${{ !env.ACT }}`.
- (characterization) Design question, settled with a source or recorded as open: whether the `--tag` given to
  `npm stage publish` is the dist-tag the version receives on `npm stage approve`, and whether staged but
  unapproved versions count in "published" (`npm view … versions`). The finding, its source and the npm version it
  was read under go in Execution Notes (`documentation` D4); if it cannot be settled offline, the approver checks
  `npm view wingfoil dist-tags` after approving `0.3.0` and the result is recorded at release-publishing.
- (characterization) MCP Registry: how the registry marks the latest version of `io.github.wingfoil/wingfoil`
  (`server.json`, published by `task-238`'s `mcp-registry` job) is read from its documentation; if publishing a
  `0.3.x` after a `0.4.x` would advertise the older one as latest, the `mcp-registry` job gains the condition
  design picks (skip for a non-`latest` dist-tag, or a declared flag), pinned in `publish-pipeline.test.ts`;
  otherwise the Execution Notes cite the rule that makes it safe.
- (characterization) The `publish.yml` header runbook (step 6) says to read the dist-tag in `npm stage view` before
  approving and `npm view wingfoil dist-tags` after; `spec-015` §3 stage 4 is amended with a dated Revision note
  (pending amendment with its proposed `--reason`).

## Implementation Notes

- **kind:** feature · **wave:** 3, batch B9 (added on 2026-10-07 by `decision-log-ingest-rel-v0.3-parallel-release-lines-plan`).
  Size: S.
- **Implements:** `dl-159` Decision 6 and Action A1.2; `spec-015` §3 stage 4 (amendment).
- **Files:** `.github/workflows/publish.yml` (promote step, possibly the `mcp-registry` job's condition, header),
  a new `scripts/*.cjs` + `.d.cts` and its test under `test/cli/`, `test/cli/publish-pipeline.test.ts`,
  `spec-015` (§3 stage 4 Revision note).
- **Order:** after `task-265` (same file, same batch) and `task-238` (the `mcp-registry` job) and `task-244` (last
  earlier writer of `publish.yml`). Before `task-267` on `spec-015`: each adds its own Revision note.
- **Gating:** do not start before `dl-159` is `ready` (the approver ratifies it before the `v0.3.0` tag). This task
  must be in the tree `v0.3.0` is cut from: GitHub Actions runs the `publish.yml` of the tagged commit, so without
  it `0.3.1` could not be published from `release/0.3` (which `dl-159` forbids back-merging into); the `v0.3.0`
  publish, on the `main` path, exercises it first.

- **Handover from wave 3 B6 (2026-10-12, W3 B6 follow-ups, `bug-ingest-rel-v0.3-w3b6-review-findings-plan` item B3;
  `task-238`'s independent review).** The MCP Registry orders a server's versions by semver and marks the highest one
  "latest" by itself (its published versioning rules, as `task-238`'s review read them), unlike npm, where this task
  must pass an explicit dist-tag. So the `mcp-registry` job (`sed -n 309,346p .github/workflows/publish.yml`) needs no
  "latest only for the highest version" logic of its own when a `0.3.x` patch is published after a higher minor;
  extending the job's single `if:` (the `dl-159` handover) for `release/X.Y` tags is enough. No criterion changes.

- **Handover from wave 3 B7 (2026-10-13, `task-234`, approver ruling 1 on its design).** `.github/workflows/pages.yml`
  (`task-234`) deploys the documentation site on every `vX.Y.Z` tag push, the same filter as `publish.yml`. Once a
  `release/X.Y` line publishes a patch below the highest published version (a `0.3.1` after `0.4.0`), that tag would
  redeploy the older line's documents over the newest ones, and `package.json` `homepage` points at the site. The
  rule this task builds (`latest` only for the highest published version, else `latest-X.Y`) is the one the site
  needs: `pages.yml`'s `deploy` job runs only when the tag's version would get `latest`, pinned in
  `test/cli/pages-workflow.test.ts` (a test `task-234` owns: extend it, keeping its existing cases). If design
  prefers another owner, record it in this task's Execution Notes. Also, `pages.yml` deploys on the tag even when
  `publish.yml`'s run for that tag fails, so the site can document a version npm does not serve. Whether it becomes
  an acceptance criterion of this task is the approver's call at its design.

## Execution Notes


### design (developer, 2026-10-16)

Role architect. Worktree `.wf2-wt/task-266`, branch cut at `92bec996`, start commit `d25df468`, then
`git merge --no-ff task/265` → `e30a654b` (B9 notes: same files `publish.yml`, `publish-pipeline.test.ts`).

**Inputs read (dl-015 hard gate, dl-102 §4).**
- `depends_on` / handover Execution Notes: `task-265` (`done`, `5c23e72f`; its *For `task-266`* paragraph: stay out
  of the gate's first step, header lines 4–5, 7–10, 61–66, 103–106, 201–202 and 237–240 at its head, and of its
  test cases; my areas are promote, mcp-registry, runbook step 6, the `RELEASE_MAKE_LATEST` line); `task-238`
  (`done`; D2: the `mcp-registry` job's one job-level `if:` was written for this task, and its design quoted
  `versioning.mdx` on how the registry marks latest); `task-244` (`done`; leave the gate as it is); `task-229`
  (`done`; D3: `RELEASE_MAKE_LATEST: ''` is "the one place `task-266` sets from its dist-tag rule"); `task-234`
  (`done`; post-merge item 8 and its pending amendment, i.e. this task's B7 handover).
- `dl-159` `ready` (Decision 6; A1 items 2, 4, 5); `spec-015` `approved` (§3 stage 4 ends "Triggered on a
  `vX.Y.Z` tag on `main`" — `task-267`'s amendment, not mine; stage 5 "Whether the Release is marked latest is
  one job-level value, left at `gh`'s default"; stage 6 "nothing in it names `latest`"); `adr-011` `accepted`.
- Today: `grep -c -- "dist-tags\|latest-X.Y\|npm-dist-tag\|dist_tag" .github/workflows/publish.yml` → 0 for each,
  same in `pages.yml`; `npm view wingfoil versions --json` → `["0.2.1","0.2.2"]`, `npm view wingfoil dist-tags
  --json` → `{"latest":"0.2.2"}` (read-only, 2026-10-16).

**Contradiction found and routed (D1).** AC 2 says `promote` runs the function; `test/cli/publish-secrets.test.ts`
pins "keeps the promote job checkout-free" (since `task-061`, `6a3b02f8`, when promote wrote `NPM_TOKEN` into an
`.npmrc`), and promote has no checkout, so it cannot run a `scripts/` file. No spec or ADR states the rule
(`grep -n -i checkout docs/04_memory/design/adrs/adr-011*` → nothing).

**A1.5 settled — what a staged version gets on approval, and whether a staged version is "published"** (`documentation`
D4: source + version). Read in **npm 11.19.0**, the npm that `PROMOTE_NODE_VERSION` 24.21.0 bundles
(`https://nodejs.org/dist/index.json` → `v24.21.0 11.19.0`), from its package in the local npx cache
(`~/.npm/_npx/81d468605400e209/node_modules/npm`):
1. **The `--tag` given to `npm stage publish` is the dist-tag the version gets when approved.** `lib/commands/stage/publish.js`:
   `class StagePublish extends Publish` (`static stage = true`); `lib/commands/publish.js` reads `tag` and hands it to
   `libnpmpublish` 11.2.0, whose `publish.js` writes `root['dist-tags'][tag] = manifest.version` into the document
   it POSTs to `/-/stage/package/<name>`; `lib/commands/stage/approve.js` POSTs `/-/stage/<id>/approve` with **no
   body**, so approval carries no tag of its own. `docs/content/commands/npm-stage.md` *Tag Behavior*: the tag
   "is an immutable property of the staged package"; to change it, reject and stage again. `npm stage view` prints
   it as `tag` (`lib/utils/key-values.js` `logStageItem`). What the registry does on approve is server-side; npm's
   own document states it, and the v0.3.0 publish shows it (`npm view wingfoil dist-tags` after approving, already in
   the release-publishing handover), so no extra by-hand check is needed beyond that one.
2. **A staged, unapproved version is NOT in `npm view wingfoil versions`.** `npm-stage.md`: staging places the
   version "in a state where it's not available for public access", and "Staged packages share the same semver version
   unique index as published packages" (a staged version cannot be staged again). Consistent with v0.2.2: a staged
   version answers E404 to `npm view wingfoil@<v> version` (`scripts/wait-npm-version.cjs` header, `task-229`).
   Consequence (risk R1): with two stages pending at once (a `0.4.0` staged, then a `0.3.1` staged before `0.4.0` is
   approved), both carry `latest`; the runbook (AC 5) closes it.
3. **An explicit `--tag` switches npm's own guard off.** `publish.js` computes `isDefaultTag = config.isDefault('tag')
   && !manifest.publishConfig?.tag` and throws "Cannot implicitly apply the "latest" tag …" only when it is true. With
   `--tag latest` passed explicitly, npm never compares against the highest version: this task's function becomes the
   only guard, hence its tests. `latest-0.3` is an accepted tag name: `semver.validRange('latest-0.3')` → `null`
   (npm refuses a tag that is a range, `publish.js` "Tag name must not be a valid SemVer range"), checked with npm
   11.19.0's bundled `semver`; `semver.validRange('0.3')` → a range, which is why the tag is `latest-X.Y`, never `X.Y`.

**MCP Registry re-verified (AC 4).** Registry **v1.8.1** (= `MCP_PUBLISHER_VERSION`), read with `gh api
repos/modelcontextprotocol/registry/contents/<path>?ref=v1.8.1`: `docs/modelcontextprotocol-io/versioning.mdx` —
the registry parses the version as semver "for sorting purposes, and will mark the version as "latest" if
appropriate"; `internal/service/registry_service.go` — `isNewLatest = CompareVersions(serverJSON.Version,
currentLatest.Server.Version, …) > 0`, and the old latest is unmarked only when `isNewLatest`;
`internal/service/versioning.go` `CompareVersions` — semver comparison when both versions are semver. So a `0.3.1`
listed after `0.4.0` is listed, not latest. The B6 handover holds; the job keeps its `if:` unchanged (the
"release/X.Y" extension it mentioned has nothing to add: the `if:` names no branch). Listing the patch is wanted
(a user on `0.3.x` finds it).

**GitHub Release "Latest" (D3).** gh v2.45.0 `pkg/cmd/release/create/create.go` sends `make_latest` only when
`--latest` is given (lines 421–423); GitHub's REST reference (Releases, `make_latest`): "Defaults to true for newly
published releases". So with `RELEASE_MAKE_LATEST: ''` a `v0.3.1` Release after `v0.4.0` becomes the repository's
"Latest" — the same defect as npm's, on the Release page.

**D1 — where promote gets the script (approver; recommendation (a)).**
(a) **A checkout in promote, into a subdirectory**: `actions/checkout` (publish.yml's pin) `with: { path: tree,
persist-credentials: false }`, then `node tree/scripts/npm-dist-tag.cjs`. The job's working directory keeps no
`package.json` (as today), so `npm stage publish ./dist-pack/*.tgz` reads exactly what it reads now and
`publish-secrets.test.ts`'s real-npm case still mirrors it; the versions are read at the moment of staging, after the
`npm-publish` approval wait. The `task-061` pin is replaced by "promote's one checkout is `tree/`, without
credentials; what it stages is the downloaded gate tarball". (b) Compute the tag in `stage` (it has a checkout) and
pass it as job outputs `stage → promote → release`: promote stays checkout-free, but the versions are read before the
human wait, AC 2's "promote reads … runs that function" is not met, and the stage step gets a value from `needs`.
**(a)**: AC text, latest-possible read, no credential exists any more to protect (`adr-011`).

**D2 — `pages.yml` deploys even when `publish.yml` fails (B7 point; approver; recommendation (b)).**
(a) Keep and document: the site can show a version npm does not serve (gate/stage failure, a rejected stage) until the
next tag. (b) **The site follows npm, as `release` and `mcp-registry` do**: after the dist-tag step, when the tag would
get `latest`, the build job runs `node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME" --timeout-minutes 330
--interval-seconds 60` (the existing script and bounds), build `timeout-minutes` 15 → 345; recovery is the runbook's
(re-run the failed job after a late approval). (c) `workflow_run` on publish's success: rejected — `workflow_run` runs
the default branch's file, changes the trigger `pages-workflow.test.ts` pins (a case R3 says to keep), and the
`github-pages` environment would see a branch, not the tag. (d) A Pages job inside `publish.yml`: rejected —
`task-234` D4, pinned ("publish.yml carries no Pages deployment"). **(b)**: one step and the same script; a rejected or
failed publish deploys nothing.

**D3 — `RELEASE_MAKE_LATEST` (in scope? approver; recommendation: yes, as AC 6, red-first).** Not in the ACs, but
handed to this task by `task-229` D3 and the header ("task-266 sets it"); same class (a "latest" marker that must
follow version order). `RELEASE_MAKE_LATEST: ${{ needs.promote.outputs.dist_tag == 'latest' && 'true' || 'false' }}`
— gh then always gets `--latest=true|false`; under `act` the output is empty → `false`, and the create step is
skipped anyway.

**D4 — prereleases in the published list (approver; recommendation (a)).** (a) Ignore them when finding the highest
version — npm's own guard does (`publish.js` `#registryVersions` drops prerelease and deprecated versions) and a
prerelease never holds `latest` here; (b) count them (a `0.4.0-rc.1` would push a `0.3.1` to `latest-0.3`).
Deprecated versions are counted either way: `npm view … versions` does not mark them, and counting them only ever
yields `latest-X.Y` (conservative). Today `wingfoil` has no prerelease (read above).

**The script — `scripts/npm-dist-tag.cjs`** (CommonJS, `'use strict'`, requires **nothing** — promote runs no
`npm ci` — like `wait-npm-version.cjs` a `require.main === module` CLI plus exports; declarations in
`scripts/npm-dist-tag.d.cts`, written by qa in red with TSDoc, as B7/B8):

```ts
/** One decision of {@link distTagFor}. */
export type DistTagDecision =
  | { readonly ok: true; readonly distTag: string; readonly message: string }
  | { readonly ok: false; readonly message: string };
/** dl-159 Decision 6 — pure: `latest` when `version` is above every published release, else `latest-X.Y`. */
export function distTagFor(version: string, published: readonly string[]): DistTagDecision;
/** `npm view <name> versions --json` output → the versions (npm prints a lone string for a one-version package). */
export function parsePublishedVersions(json: string):
  | { readonly ok: true; readonly versions: readonly string[] }
  | { readonly ok: false; readonly message: string };
```

Rules of `distTagFor`, in this order: `version` must match `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`; a
semver prerelease (`X.Y.Z-…`, build metadata allowed after it) is refused as a prerelease, anything else as not a
version; every published entry must be semver (`X.Y.Z` with optional `-pre` / `+build`), else refused; an entry equal
to `version` → refused as already published; prereleases dropped (D4 (a)); numeric comparison of the three fields
(no `semver` dependency); greater than all (or none left) → `latest`, else `latest-<X>.<Y>`. No input is mutated;
order of `published` does not matter.

Messages (exact):
- `latest`: `<v> is above every published version (highest <h>): dist-tag latest (dl-159)`; none:
  `<v> is above every published version (none published): dist-tag latest (dl-159)`
- `latest-X.Y`: `<v> is below the highest published version <h>: dist-tag latest-<X>.<Y> (dl-159)`
- `<v> is already published; npm accepts a version once`
- `<v> is a prerelease: only X.Y.Z versions are promoted (spec-015 §4)`
- `<v> is not a version of the form X.Y.Z`
- `published version <p> is not a semantic version`
- parse: `could not read the published versions: <JSON.parse message>`; wrong shape: `the published versions are
  not a JSON array of strings`

CLI: `node scripts/npm-dist-tag.cjs <vX.Y.Z> --published <json> [--allow-published]`. The tag must start with `v`;
the rest goes to `distTagFor` (so `v0.3.1-rc.1` gets the prerelease message); otherwise `tag <t> is not of the form
vX.Y.Z (spec-015 §4)`. `--allow-published` removes entries equal to the version before deciding (pages: a re-run
after the version went live); promote never passes it. Exit **0**: stdout is exactly the dist-tag and a newline,
the message on stderr. **1**: every refusal, one line on stderr, stdout empty. **2**: usage (no tag, no
`--published` or no value after it, an unknown option), stderr contains `usage: node scripts/npm-dist-tag.cjs <vX.Y.Z>
--published <json> [--allow-published]`.

**promote (publish.yml)** — new first-after-setup-node step `actions/checkout` (D1 (a)); the stage step gets
`id: stage` and becomes (name keeps no `latest`):

```yaml
      - name: Stage the smoked tarball on npm with provenance and an explicit dist-tag, via the OIDC trusted publisher (spec-015 §3 stage 4, adr-011, dl-159)
        id: stage
        if: ${{ !env.ACT }}
        run: |
          set +x
          npm --version
          published="$(npm view wingfoil versions --json)"
          dist_tag="$(node tree/scripts/npm-dist-tag.cjs "$GITHUB_REF_NAME" --published "$published")"
          echo "dist_tag=$dist_tag" >> "$GITHUB_OUTPUT"
          npm stage publish ./dist-pack/*.tgz --provenance --access public --tag "$dist_tag"
```
Each `$(…)` is a plain assignment, so under GitHub's `bash -e` a failing `npm view` or a refusal ends the step before
anything is staged. Job `outputs: { dist_tag: ${{ steps.stage.outputs.dist_tag }} }`. `mcp-registry`: unchanged.
`release`: D3. Header: the `promote →` and `release →` entries (lines 19–20, 30), the `mcp-registry →` sentence
(40–41: the registry orders by semver itself, registry v1.8.1 `registry_service.go`), runbook step 6 (107–117), one
new line after the opening list naming `task-266` (lines 4–5 untouched). A single quoted `--tag` value from a pure
script that only ever prints `latest` or `latest-<digits>.<digits>` is the step's whole new input.

**pages.yml (R3, A1.4)** — in `build`, after `setup-node` and before `npm ci`:

```yaml
      - id: dist-tag
        name: The npm dist-tag of this version — deploy only the newest line (dl-159, task-266)
        if: ${{ github.event_name == 'push' }}
        run: |
          published="$(npm view wingfoil versions --json)"
          dist_tag="$(node scripts/npm-dist-tag.cjs "$GITHUB_REF_NAME" --published "$published" --allow-published)"
          echo "dist_tag=$dist_tag" >> "$GITHUB_OUTPUT"
      # D2 (b) only:
      - name: Wait until npm serves exactly this version — the site follows npm (dl-159, task-266)
        if: ${{ github.event_name == 'push' && steps.dist-tag.outputs.dist_tag == 'latest' }}
        run: node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME" --timeout-minutes 330 --interval-seconds 60
```
`build.outputs: { dist_tag: ${{ steps.dist-tag.outputs.dist_tag }} }`; `deploy.if: ${{ github.event_name ==
'workflow_dispatch' || needs.build.outputs.dist_tag == 'latest' }}` (a manual run is the approver's deliberate
deployment, `task-234` ruling 1). Build `timeout-minutes` 345 under D2 (b). Header: the Trigger paragraph's handover
sentence (lines 17–20) becomes the rule. Every existing `pages-workflow.test.ts` case stays true (two jobs, one deploy
step, trigger, permissions, order, pins, no `npm install`).

**AC classification and what qa must pin** (existing cases kept unless named):

| AC | Class | Test file | Pin |
|----|-------|-----------|-----|
| 1 | red-first | new `test/cli/npm-dist-tag.test.ts` + `scripts/npm-dist-tag.d.cts` | `distTagFor`: `('0.3.1',['0.3.0'])` → `{ok:true, distTag:'latest'}`; `('0.3.1',['0.3.0','0.4.0'])` → `latest-0.3`; `('0.4.0',['0.3.0','0.3.1'])` → `latest`; numeric not lexical: `('0.10.0',['0.9.0'])` → `latest`, `('1.2.3',['1.2.10'])` → `latest-1.2`, `('10.2.3',['9.9.9'])` → `latest`; unsorted input same result; `[]` → `latest` with the "none published" message; `('0.3.1',['0.3.0','0.4.0-rc.1'])` → `latest` (D4 (a)); refusals with exact messages: `('0.3.0',['0.3.0'])`, `('0.3.1-rc.1',…)`, `('v0.3.1',…)`, `('0.3',…)`, `('01.2.3',…)`, `('0.3.1',['0.3.0','banana'])`; one exact `ok` message per branch (above, none, below); a frozen input array is not mutated and two calls deep-equal. `parsePublishedVersions`: `'["0.2.1","0.2.2"]'`, `'"0.2.1"'` → one-element list, `''` / `'nope'` → `could not read …`, `'[1]'` / `'{}'` / `'null'` → `not a JSON array of strings`. CLI by `spawnSync(process.execPath, [SCRIPT, …])`: `v0.3.1 --published '["0.3.0","0.4.0"]'` → 0, stdout `latest-0.3\n`, stderr the message; `v0.4.0` over `["0.3.0","0.3.1"]` → 0, `latest\n`; `v0.3.0` over `["0.3.0"]` → 1, stdout `''`; same with `--allow-published` → 0 `latest\n`; `v0.3.1 --published '["0.3.1","0.4.0"]' --allow-published` → 0 `latest-0.3\n`; `0.3.1` → 1 `is not of the form vX.Y.Z`; `v0.3.1-rc.1` → 1 prerelease message; no `--published` / no tag / `--bogus` → 2 with the usage line. Every `require(…)` in the script is a `node:` built-in (or none) — the `build-site.cjs` case in `pages-workflow.test.ts` is the model. |
| 2 | red-first | `test/cli/publish-pipeline.test.ts` (case "promote stages the same tarball …") and `test/cli/publish-secrets.test.ts` | pipeline: the stage step (`id: stage`, `if: ${{ !env.ACT }}`) runs, in order, `npm view wingfoil versions --json`, `node tree/scripts/npm-dist-tag.cjs "$GITHUB_REF_NAME" --published "$published"`, `>> "$GITHUB_OUTPUT"`, `npm stage publish ./dist-pack/*.tgz --provenance --access public --tag "$dist_tag"`; its `run` matches no `/\blatest\b/` and has no `--allow-published`; `promote.outputs` equals `{ dist_tag: '${{ steps.stage.outputs.dist_tag }}' }`; promote has exactly one checkout, `with` equal `{ path: 'tree', 'persist-credentials': false }`, before the stage step. secrets (D1 (a)): the "checkout-free" case becomes "one checkout, into `tree/`, without credentials; the staged file is `./dist-pack/*.tgz`"; the fake-npm describe: the work dir gets `tree/scripts/npm-dist-tag.cjs` copied from the repo, env `GITHUB_REF_NAME=v0.2.0`, `GITHUB_OUTPUT=<work>/output`, the fake npm answers `view` with `$FAKE_NPM_VERSIONS` (default `["0.1.0"]`) and appends every argv line: `["0.1.0"]` → stage args exactly `stage publish ./dist-pack/wingfoil-0.2.0.tgz --provenance --access public --tag latest` and output file `dist_tag=latest`; `["0.1.0","0.3.0"]` → `--tag latest-0.2`; `["0.2.0"]` (already published) → step fails, no `stage publish` line; `npm view` failing → step fails, no `stage publish` line; "fails when npm stage publish fails" kept (fail on `stage` only); `.npmrc` case kept. `set +x` first and the tracing cases stay as they are. |
| 3 | characterization (notes only) | — | A1.5 above: source, npm 11.19.0, both questions settled from npm's document and client source; the registry side is read at v0.3.0 (`npm view wingfoil dist-tags`, release-publishing handover). |
| 4 | characterization | `publish-pipeline.test.ts` (existing case, unchanged) | The `mcp-registry` `if:` stays `${{ needs.promote.result == 'success' }}` — the existing case is the pin; the rule that makes it safe is cited above (registry v1.8.1). Header pin (new case in the mcp-registry describe): the `mcp-registry →` entry contains `semver` and `registry_service.go` and no longer contains `task-266 adds`. |
| 5 | red-first (text is new: `grep -c "dist-tags" publish.yml` → 0) | `publish-pipeline.test.ts` (publish runbook describe) | Runbook step 6 = text between `/\n#\s+6\. /` and `/\n#\s+7\. /`: contains `npm stage view`, `tag`, `latest-X.Y`, `dl-159`, `npm stage list wingfoil` (no other pending stage, R1) and `npm view wingfoil dist-tags`, the last after `npm stage approve`. publish-secrets' runbook-order case stays green. The spec-015 §3 stage 4 (and stage 5 if D3) Revision note is a pending amendment in session 3 (R5), not tested. |
| 6 (D3, if ruled in) | red-first | `publish-pipeline.test.ts` (release describe, case "never hard-codes `latest` …") | `release.env` equals `{ RELEASE_MAKE_LATEST: "${{ needs.promote.outputs.dist_tag == 'latest' && 'true' || 'false' }}" }`; the create step's `${RELEASE_MAKE_LATEST:+--latest="$RELEASE_MAKE_LATEST"}` and the no-`@latest` checks unchanged; header `release →` entry no longer says `task-266 sets it`. |
| A1.4 (R3) | red-first | `test/cli/pages-workflow.test.ts`, new `describe('newest line only (task-266) — dl-159 A1.4')` | build step `id: dist-tag`, `if: ${{ github.event_name == 'push' }}`, after setup-node, `run` contains `npm view wingfoil versions --json` then `node scripts/npm-dist-tag.cjs "$GITHUB_REF_NAME" --published "$published" --allow-published` then `>> "$GITHUB_OUTPUT"`; `build.outputs` equals `{ dist_tag: '${{ steps.dist-tag.outputs.dist_tag }}' }`; `deploy.if` equals `${{ github.event_name == 'workflow_dispatch' \|\| needs.build.outputs.dist_tag == 'latest' }}`; executed with a fake npm (publish-secrets' pattern, `bash --noprofile --norc -eo pipefail`, cwd a work dir holding `scripts/npm-dist-tag.cjs`): `GITHUB_REF_NAME=v0.3.1` over `["0.3.0","0.4.0"]` → output `dist_tag=latest-0.3`; over `["0.3.0"]` → `dist_tag=latest`; over `["0.3.0","0.3.1"]` → `dist_tag=latest` (re-run after approval); `npm view` failing → exit ≠ 0, no `dist_tag=` line. D2 (b) only: a step running `node scripts/wait-npm-version.cjs "$GITHUB_REF_NAME" --timeout-minutes 330 --interval-seconds 60` with `if: ${{ github.event_name == 'push' && steps.dist-tag.outputs.dist_tag == 'latest' }}`, after the dist-tag step and before `upload-pages-artifact`; build `timeout-minutes` > 330 and ≤ 360. Header: contains `dl-159` and `task-266` and no longer `is handed to`. Every existing case unchanged (the `WorkflowJob` interface may gain `if`/`outputs`). |

**Files.** `scripts/npm-dist-tag.cjs` (new); by qa: `scripts/npm-dist-tag.d.cts`, `test/cli/npm-dist-tag.test.ts`,
`test/cli/publish-pipeline.test.ts`, `test/cli/publish-secrets.test.ts` (not in the task's *Files*: D1; no other B9
task writes it — B9 notes *Shared at the gate*), `test/cli/pages-workflow.test.ts`; `.github/workflows/publish.yml`
(promote, release env, header lines named above), `.github/workflows/pages.yml`. Pending amendment (session 3,
uncommitted, R5): `spec-015` Revision note (§3 stage 4; stage 5 if D3; stage 6's "nothing in it names `latest`"
explained). No config `version:` bump (none of these files carries one). Not touched by this task:
`test/lint/pack-ignore-scripts.test.ts` (it scans `test/` for `npm pack`/`publish` spawns; the new test spawns `node`,
and the fake npm is a file, not a spawn of `'npm'`); coverage and `docs:api` read `src/` only (`jest.config.js`
`collectCoverageFrom`, `typedoc.json` `entryPoints: ["src"]`); `scripts/**/*.cjs` and `.d.cts` are linted
(`eslint.config.js` lines 26, 43); the script is not packed (`package.json` `files`: `dist`, `README.md`).

**Risks.** R1 (above): two stages pending across lines — runbook step 6 says to check `npm stage list wingfoil` and
approve the lower version first; a wrong `latest` is repaired with `npm dist-tag add wingfoil@<highest> latest`
(approver, 2FA). R2: everything here runs for real first on the `v0.3.0` tag (promote's checkout and output, pages'
wait); a broken promote step there needs a new commit and tag, so session 3's executed fake-npm cases carry the weight.
R3 (batch): `task-267` merges this branch before its spec-015 amend (R5); `publish-secrets.test.ts` joins the
`publish.yml` readers `task-267` does not touch.

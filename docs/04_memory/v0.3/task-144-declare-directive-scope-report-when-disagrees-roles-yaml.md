---
id: "task-144-declare-directive-scope-report-when-disagrees-roles-yaml"
type: task
title: "Declare a directive's `scope` and report when it disagrees with `roles.yaml`'s `global:` list"
status: done
release: "v0.3"
kind: "fix"
priority: "medium"
tags: ["v0.3", "core", "directives"]
ref: "spec-013"
bug: ["bug-109", "bug-113", "bug-148"]
depends_on: []
tmpl_version: 260703
wave: "w1"
---

## Description

`DirectiveFrontmatter` (`src/directives/schema.ts:36-44`) has no `scope`, so `directives list` prints "unknown field(s) ignored: scope" for every global directive here (`bug-113`), and a `scope: global` in a directive is silently dropped while `roles.yaml` alone decides (`bug-148`). The module TSDoc calls approved `spec-013` a candidate (`bug-109`).

## Acceptance Criteria

- (red-first) `scope` is a declared optional key (`global`); no unknown-field warning for it.
- (red-first) a directive declaring `scope: global` that `roles.yaml`'s `global:` omits (and the reverse) produces a named entry in `directives list`'s `warnings` array; `roles.yaml` stays the authority (stated in `spec-013` with a Revision note).
- (characterization) the `schema.ts` TSDoc cites `spec-013` as approved.
- (red-first) `version` is a declared optional key (string) of the directive frontmatter, in `spec-013`'s field table and `src/directives/schema.ts`, with a Revision note; a directive carrying `version:` produces no unknown-field warning. `command-baseline.md`'s body `**Version:** 1.1 · **Date:** 2026-09-30` line (written by `task-128` because the key was undeclared) moves into its frontmatter as `version: "1.1"`, and the `doc-versioning` reading for directives is the frontmatter key (approver ruling 2026-10-01, at `task-128`'s review).

- (characterization) `doc-versioning.md` states the committed baseline the bump rule counts from: a document's version is bumped on the first edit after the file was last committed **to `main`**, so a task branch bumps it once, and further edits on the same branch (review fixes) do not bump again (approver ruling 2026-10-01, the practice of every v0.3 task so far).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** fix (`dl-133` Q1 (b)).
- **Implements:** spec-013 (`scope` row); P3.7.
- **Features:** P3.4, P3.7.
- **Notes:** Proposal key: C16.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-144-declare-directive-scope-report-when-disagrees-roles-yaml`, worktree
`../.wf2-wt/task-144`, cut from `main` at `cac8a447`. Start `c0e64f92`; bug syncs `[planned →
in-progress]`: `bug-109` `266b03b8`, `bug-113` `46b9e8bf`, `bug-148` `f1563dae`.

### design (architect)

**`depends_on`:** none (`depends_on: []`). **Spec:** `spec-013-directive-frontmatter-schema` is
`approved` (`awk '/^status:/{print $2;exit}' docs/04_memory/design/specs/spec-013-*.md` → `approved`).
The ACs require it to change (the `scope` row, a `version` row, the authority of `roles.yaml`), so it
is edited with a dated Revision note — **left uncommitted** as a pending amendment (below). spec-013
carries no `version:` key and no earlier Revision note, so none is bumped.

**Reproduced before any change.** `npx jest test/directives/schema.test.ts` with the new red test
showed `Warning: …/claim-evidence.md: unknown field(s) ignored: scope` on loading this repository's
directives (`bug-113`). `.wingfoil/directives/custom/command-baseline.md` carried `**Version:** 1.2 ·
**Date:** 2026-10-01`: the AC says `1.1`, but `task-161` (`f85c67a9`) moved it to 1.2 after the AC was
written; the version moved is `1.2`, as the coordinator's brief states.

**Design decisions** (approver to confirm):

1. **`scope` is `z.literal('global').optional()`**, the one value spec-013 defines and AC 1 names. A
   typo such as `scope: globl` now fails validation instead of passing through. `version` is
   `z.string().optional()`: an unquoted `version: 1.10` is refused rather than read back as `1.1`.
2. **"The reverse" is a `global:` id whose file in force does not declare `scope: global`** —
   absence counts as disagreement, so both sites must agree for a clean listing. A `global:` id with
   no file at all is not reported here (that is a dangling binding, not a scope claim). For a shadowed
   id only the file `selectDirectivesById` puts in force is compared.
3. **Only the unfiltered listing carries the scope warnings.** Under `--role` the warnings stay
   exactly `resolveRoleDirectives`' (dl-042 D, pinned by an existing test): the role view is a
   resolution, the unfiltered one is the configuration audit.
4. Because of (2), every directive a `roles.yaml` lists as global now declares `scope: global`:
   this repository's `documentation.md` and `security.md`, and the `init` scaffold —
   `doc-versioning`/`security-secrets` (custom) and the built-in `security`/`documentation`
   templates, whose `BuiltinDirectiveTemplate` gains an optional `scope`. Otherwise a fresh `init`
   would list 4 warnings, and `builtin-directive-templates.test.ts` pins 0.
5. The check lives in its own module, `src/core/directive-scope.ts`, and `directives-list.ts` changes
   by one expression, because `task-143` edits the same file and merges first.
6. **`command-baseline` stays `1.2`.** Moving the key from the body to the frontmatter is not a
   revision; a dated *Relocation* paragraph says so. The `**Date:**` body line stays.

**AC classification (T1).**

| AC | Class | Why |
|---|---|---|
| 1 — `scope` declared, no unknown-field warning | **red-first** | it rode `.passthrough()` and warned |
| 2 — scope/`global:` disagreement in `warnings`, both ways; `roles.yaml` authority in spec-013 | **red-first** | `warnings` never mentioned `scope` |
| 3 — `schema.ts` TSDoc cites spec-013 as approved | characterization (documentation) | comment only; no behaviour |
| 4 — `version` declared; command-baseline's version in frontmatter | **red-first** | it rode `.passthrough()`; the file had a body line |
| 5 — doc-versioning states the `main` baseline | characterization (documentation) | directive text; no behaviour |

### red (developer)

`5b6b7b96`: 7 tests in `test/directives/schema.test.ts` (declared keys, no warning, optional, `scope`
value set, `version` type, live directives load without an unknown-field line, `command-baseline`'s
frontmatter version) and 7 in `test/core/directives-list.test.ts` (both directions, agreement,
global id with no file, shadowed id, no `roles.yaml`, `--role` unchanged), plus a live-repo guard (0
warnings). `npx jest test/core/directives-list.test.ts test/directives/schema.test.ts` → **10
failed, 44 passed**. The failures were the expected ones (`Received: ["id", …, "ref"]`, `Received:
"Warning: x.md: unknown field(s) ignored: scope, version"`, `scope: 'team'` accepted, `version: 1.1`
accepted, the live stderr line, `fm.version` `undefined`, and the 4 disagreement warnings absent). The
`scope: global`-agreeing, no-file and `--role` cases and the live guard passed from the start: they
pin what must not change. The fixture's `security-secrets` (listed `global:`) now declares
`scope: global` so the existing shadow/dl-042 cases keep their expected warnings.

### green (developer)

`ff16d8a0` (bug-109, bug-113, bug-148): `DirectiveFrontmatter` declares `scope`/`version`; the
module TSDoc is rewritten around approved spec-013 (bug-109's whole paragraph, not a word);
`directiveScopeWarnings` (`src/core/directive-scope.ts`) is appended to the unfiltered listing's
warnings; scaffolds and the two directive files declare `scope: global`; `command-baseline.md`'s
version moves to `version: "1.2"`. `test/storage/builtin-directives.test.ts`' `DECLARED_KEYS` gains
`scope`/`version` (the two templates now carry `scope`). `acd8e7f8`: `doc-versioning.md` (AC 5, and
"a directive declares it as the frontmatter `version:` key"). `e2a7452d`: P3.4 BDD scenario *Edge - a
directive's scope disagrees with roles.yaml* (transcribed by the first new `directives-list` case)
and `docs/cli-reference.md` names `directives list`'s `warnings`.

Live check: `npm run build && node dist/cli.js directives list --format json` → `"warnings": []`, and
nothing on stderr (the pinned 0.2.1 build prints three `unknown field(s) ignored: scope` lines here,
`bug-113`).

### refactor (developer)

With the spec-013 amendment in the working tree:

- `npm test` → 188 suites, **3207 passed** (main at the B2 gate: 3192; +15 here).
- `npm run test:coverage` → 98.84 / 95.26 / 95.01 / 99.54 (main: 98.84 / 95.24 / 95.01 / 99.54 —
  not regressing); `directive-scope.ts` and `directives-list.ts` 100 / 100 / 100 / 100.
- `npm run lint`, `npm run docs:api`, `npx tsc --noEmit -p tsconfig.json`,
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0 each.
- `test/docs/cli-reference.test.ts` green (`npx jest test/docs`).

### review (reviewer, self)

Every AC checked against its test or its text above. Same-class fixes in touched files: the
`schema.ts` `RolesYaml` TSDoc and `test/directives/schema.test.ts`' module and `RolesYaml` comments
also denied spec-013; all rewritten
(`grep -rn "candidate\|no dedicated\|no approved" src/directives/ test/directives/schema.test.ts` →
nothing).

### review (independent) — APPROVE WITH FIXES, approver rulings R1–R4 (2026-10-02)

The rulings supersede design decisions 1, 2, 4 and 6 above.

- **R1** — `version` is `z.union([z.string(), z.number()])`. New `src/directives/version.ts`
  (`checkDirectiveVersion`), called by `parseDirectiveFile` (`src/core/loaders.ts`). It writes a stderr
  warning in spec-009 §2 form when an unquoted number does not read back as written (`1.10` → `1.1`,
  `1.0` → `1`), telling the author to quote it. A value that is neither a string nor a number is
  dropped with a warning instead of failing the pillar. The warning goes to stderr, not to the listing:
  only the loader sees the frontmatter text it needs.
- **R2** — `scope` is `z.string()`. `directives list` reports a value other than `global`. The
  reviewer's compat project (`determinism.md`, `scope: team`): `node dist/cli.js directives list
  --format json` → exit 0, one warning, "…which spec-013 does not define (only global); it has no
  effect".
- **R3** — only a declared `scope` is compared, and an absent one is never reported. `scope: global`
  is removed from the built-in templates (a test asserts they carry none) and from the `init`
  scaffold's custom directives: with absence no longer a disagreement it was redundant, and it
  duplicated `roles.yaml`, which is `bug-148`'s complaint. This repository's `documentation.md` and
  `security.md` keep the `scope: global` the first pass added: they agree with `roles.yaml`, as the
  other three globals here do. The new test fixture `test/core/fixtures/init-0.2.2/` holds the
  `.wingfoil/roles.yaml` and `.wingfoil/directives/**` output of `node
  node_modules/wingfoil-released/dist/cli.js init --template Scrum` (`--version` → `0.2.2`), captured
  verbatim. It lists 10 entries and 0 warnings.
- **R4** — `command-baseline.md` is now `version: "1.3"` with `**Date:** 2026-10-02`. The
  *Relocation* note is replaced by **Revision 1.3**.
- **Fixes.** (3) `src/directives/index.ts` and `src/core/loaders.ts` no longer deny spec-013
  (`grep -rn "no dedicated\|no approved tech-spec\|tech-spec yet" src | grep -i directiv` → nothing).
  (4) The scaffold's `doc-versioning` summary (`src/storage/templates.ts`) reads "once per change
  merged to the default branch". CLAUDE.md §8 belongs to `align-agent-docs` and is not touched here.
  (6) The spec-013 Context no longer says "ten real files" or "built-in templates not implemented",
  and its stray `CLAUDE.md` citation is gone. The Revision note now describes R1–R3. The amendment
  stays uncommitted.
- **Commits:** red `b59fb404` (`npx jest test/core/directives-list.test.ts test/directives/schema.test.ts
  test/storage/builtin-directives.test.ts` → **14 failed, 100 passed**; the 0.2.2 fixture listed 3
  reverse-direction warnings), green `90f39404`, `docs/cli-reference.md` `7649ecf1`.
- **Gates**, run with the amendment in the working tree: `npm run test:coverage` → 188 suites,
  **3221 passed**, 98.85 / 95.25 / 95.03 / 99.54 (main 98.84 / 95.24 / 95.01 / 99.54). `npm run
  lint`, `npm run docs:api` and both `tsc` runs → exit 0. `npm run build && node
  scripts/e2e-smoke.cjs` → exit 0. `WINGFOIL="node $PWD/dist/cli.js" bash docs/examples/0*/run.sh` →
  all 5 exit 0. Live: `node dist/cli.js directives list --format json` → `"warnings": []`.

### Pending amendments (approver)

- `spec-013-directive-frontmatter-schema` — `--reason "Declares scope (any string; global is the one
  defined value) and version (string or number, never a reason to fail the pillar) as optional
  directive frontmatter keys, states that roles.yaml global decides and that directives list reports
  a declared scope contradicting it or undefined here, and brings the Context up to date (the P3.8
  built-ins ship; twelve custom directives). Per task-144 (bug-113, bug-148) and the approver rulings
  of 2026-10-01 and 2026-10-02 (R1 to R3)."`

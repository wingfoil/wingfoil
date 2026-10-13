---
id: "task-215-directives-list-role-sweep-over-dna-role-fails"
type: task
title: "A `directives list --role` sweep over every DNA role fails on any resolution warning (dl-050 option 1)"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "agent", "directives", "governance", "workflow-config"]
ref: "dl-050"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

`dl-050` was ratified with options 1 and 4 (`ec0de106`). Option 4 is task-218. Option 1 gives the directive-resolution warnings a reviewable home. The config sweep (release-planning `reconcile-governance`, and `dev-loop` design if the approver prefers) runs `wingfoil directives list --role <r>` for every `team.roles` name and fails on any warning. The ratified text does not say whether that means a declared `checks:` entry or an npm script the sweep names. The task picks one at design and records why.

## Acceptance Criteria

- (red-first) A repository script (e.g. `npm run check:role-directives`) exits 1 when any role's `directives list --role <r> --format json` carries a non-empty `warnings`, and exits 0 on this repository today. Both paths are tested on a fixture with a dangling binding.
- (characterization) `release-planning.yaml` `reconcile-governance` declares the check (with a `doc-versioning` bump), in the token grammar that `dl-090` / `spec-003` define.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-050 option 1.
- **Features:** P3.6, P5.4.2.
- **Notes:** Proposal key: B17. **may be merged into the workflow-alignment task (idea 7)** by the consolidator, because both edit `release-planning.yaml`. Kept separate from task-199 (the workflow-alignment task) so the script can be reviewed on its own; it lands after task-199 on the same `release-planning.yaml`.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (developer, 2026-10-13)

- **Start.** Branch cut from `main` `db0e2752`; started `2d272b5a`; `git merge --no-ff task/task-279-…` (`235234b0`)
  before this design, because both tasks edit `release-planning.yaml` (now 2.1, task-279's) and `WORKFLOW.md`'s
  release-planning paragraph (`w3-b7-notes.md` round 3).
- **depends_on read (dl-015).** `task-199` (`done`): `workflows/bindings.yaml` is spec-003 Layer 3, `format: 1`;
  every check token resolves through a binding or stays a `W_WORKFLOW_UNBOUND_TOKEN` warning;
  `test/core/workflow-repository-conformance.test.ts` pins the remaining unbound warnings by path
  (`release-planning` `phases[3].checks.post[0]` is `ready-decision-logs.covered`). `task-218` (`done`): dl-050
  option 4, `agent execute` prints `spec-012` §5.1's warnings on stderr; the loaders' unknown-field warning goes
  through a warning sink (dev build). `task-279` (`done`): release-planning 2.1, its history line kept here.
- **Decisions cited are ratified:** `grep -m1 '^status' docs/04_memory/design/dls/dl-0{29,50,90}-*.md` → all
  `ready`; `grep -m1 '^status' docs/04_memory/design/specs/spec-003-*.md` → `approved`. dl-050 option 1's text:
  "run `directives list --role <r>` for every DNA role and fail on any warning". Batch ruling D1: an npm script bound
  to a token in `release-planning` `reconcile-governance` only, not `dev-loop.yaml`.
- **Measured today (contradiction for the approver, D-A below).** With the pinned build
  (`node node_modules/wingfoil-released/dist/cli.js`, 0.2.2) from this worktree: `dna show --format json` →
  `team.roles` = developer, reviewer, qa, architect, product-owner, tech-lead, facilitator, approver; `directives list
  --role <r> --format json` → `warnings` `[]` for the first six, and `["no directives assigned to role
  'facilitator'"]`, `["no directives assigned to role 'approver'"]` for the last two (`roles.yaml` 1.7 has no
  `assignments` entry for either; dl-029's ratified hybrid: globals only, plus that warning). So "fail on any warning"
  and "exits 0 on this repository today" (AC 1) cannot both hold on the current `roles.yaml`. Positive case of the
  dangling path, on a scratch fixture (minimal `dna.yaml` with `modules`/`stacks`/`team.members`/`paths`, a
  `roles.yaml` binding `reviewer` to `testing` and `ghost`, `testing.md` and `doc-versioning.md` only): both the
  pinned build and the main tree's `dist/cli.js` answer `["directive 'ghost' bound to role 'reviewer' has no
  directive file"]`, exit 0.

**Choice the task left open: an npm script, not a declared `checks:` expression.** The script is the command; the
token in `reconcile-governance` is the declaration; `bindings.yaml` joins them (spec-003 Layer 3), as `lockfile.pinned`
→ `check:lockfile` and `mcp.registered` → `check:mcp` already do in `advance-pinned-build`. A prose `checks:` entry
would be one more `W_WORKFLOW_UNBOUND_TOKEN` that nothing runs; a bound token is executable today by hand and by
P4.12 in v1.0.

**Names.**
- Script `scripts/check-role-directives.cjs` (+ `scripts/check-role-directives.d.cts` only if it exports anything; no
  export is required by the tests below). npm script `"check:role-directives": "node scripts/check-role-directives.cjs"`,
  its own line in `package.json` `scripts`, after `"check:governance"` (241 and 234 also edit `package.json`).
- Token `role-directives.clean` (the `lint.clean`/`typecheck.clean` family). Binding
  `role-directives.clean: { run: [npm, run, "check:role-directives"] }` in `bindings.yaml` `checks:` (severity
  default `reject`), under a comment naming `release-planning.reconcile-governance`, dl-050 option 1 and task-215.
- Declared as `checks.pre: ["role-directives.clean"]` of `reconcile-governance` — **pre**, not post: it is a property
  of the configuration, not of the decision-logs/ADRs the phase approves; a failure blocks the sweep before any approval
  rather than describing the selected elements, and `post[0]` (`ready-decision-logs.covered`) keeps its index, which the
  conformance test pins. Comment: `# dl-050 option 1 (task-215): \`npm run check:role-directives\` exit 0 (bound in workflows/bindings.yaml)`.

**Script contract** (read-only; reads the working tree of `--root`, as `directives list` does; offline; deterministic).
- Usage: `node scripts/check-role-directives.cjs [--root <dir>]` (default: the current directory).
- The CLI it runs: the **pinned build**, `node <repo>/node_modules/wingfoil-released/dist/cli.js`, resolved from the
  script's own location (`__dirname/..`), spawned with `cwd = <root>` and no shell. Why the pinned build: it is the build
  that manages this repository (dl-095) and the one whose `{role}-session` Prompts agents receive through `.mcp.json`,
  so its resolver is the one whose warnings matter; it needs no `npm run build` (unlike `dist/`), and
  `advance-pinned-build` runs before `reconcile-governance`, so the check uses the newest published build.
- Roles: `dna show --format json` from the same build → `team.roles[].name` (the CLI's own validated DNA, no second
  YAML parser), visited in **ascending name order** (REQ-SYS-07), each with `directives list --role <name> --format json`,
  reading the stdout payload's `warnings` array. The CLI's stderr is not relayed on success (the pinned build prints
  `Warning: … unknown field(s) ignored` lines for fields newer than itself — today `scope`, `paths.runs`, `paths.health`);
  it is quoted in an exit-2 error.
- Exit **0**: every role's `warnings` is empty. stdout: one line per role `<role>: ok`, then
  `role-directives: <N> roles checked, 0 with warnings`; stderr empty.
- Exit **1**: at least one non-empty `warnings`. stdout: `<role>: ok` or `<role>: <k> warning(s)` per role (ascending),
  then `role-directives: <N> roles checked, <M> with warnings`; stderr: one line per warning,
  `error: role '<role>': <warning text verbatim>`, roles ascending, each role's warnings in the CLI's order.
- Exit **2** (binding misconfiguration, spec-003): stdout empty, one `error: …` line on stderr — an unknown argument or
  `--root` with no value; the pinned CLI file absent (message names `node_modules/wingfoil-released/dist/cli.js` and
  `npm ci`); a CLI call that exits non-zero or prints no JSON object with an array `warnings` (message names the command,
  e.g. `directives list --role reviewer`, and the first line of its stderr); `team.roles` absent or empty
  (`dna.yaml declares no team.roles`).

**AC classification (T1) and what the qa agent pins.**

| AC | Class | Why |
|----|-------|-----|
| 1 — the script's exit 1 / exit 0, fixture with a dangling binding, exit 0 on this repository | red-first | no script exists: `ls scripts/check-role-directives.cjs` → absent |
| 2 — `reconcile-governance` declares the check in the dl-090/spec-003 token grammar, with a version bump | **red-first (corrected from characterization)** | the declaration does not exist yet (`grep -c role-directives .wingfoil/workflows/custom/release-planning.yaml` → 0), so a test pinning it fails first; characterization is for behaviour that already exists |

AC 1 — new file `test/cli/check-role-directives.test.ts` (beside `test/cli/service-verify-sweep.test.ts`, the model).
Spawn `spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'check-role-directives.cjs'), '--root', repo])`.
Fixture: `makeTempGitRepo()` + `writeFixtureFile()` (`test/storage/helpers/git-fixture.ts`), `removeTempDir` in
`afterEach`; `directiveMd(id)` from `test/agent/helpers/agent-execute-fixture.ts` for the directive files. `dna.yaml`
as the fixture measured above (`version: 1`, `project.name`, one `modules` entry, `stacks.technologies`,
`team.members` one member, `team.roles` declared **reviewer before developer**, `paths.sources`) — the 0.2.2 schema
refuses a `dna.yaml` without `modules`/`stacks`/`team.members`/`paths`. `roles.yaml`: `developer: [testing]`,
`reviewer: [testing]`, `global: [doc-versioning]`; files `testing.md`, `doc-versioning.md`. No commit needed (working tree).
1. clean fixture → exit 0; stdout exactly `developer: ok\nreviewer: ok\nrole-directives: 2 roles checked, 0 with warnings\n`
   (ascending, although `dna.yaml` lists reviewer first); stderr `''`.
2. same fixture with `ghost` added to `reviewer` → exit 1; stderr exactly
   `error: role 'reviewer': directive 'ghost' bound to role 'reviewer' has no directive file\n`; stdout contains
   `developer: ok`, `reviewer: 1 warning(s)` and ends `role-directives: 2 roles checked, 1 with warnings\n`.
3. roles come from `dna.yaml`, not `roles.yaml`: add `qa` to `team.roles` only → `qa` appears in stdout and fails with
   `error: role 'qa': no directives assigned to role 'qa'` (exit 1) — under ruling D-A (a); under (b) see below.
4. exit 2: `--bogus` → exit 2, stdout `''`, stderr one line starting `error:`; `team.roles: []` → exit 2, stderr names
   `team.roles`.
5. this repository: `--root REPO_ROOT` → exit 0 and stdout's last line `role-directives: 8 roles checked, 0 with
   warnings` — red today twice over (no script; facilitator/approver unbound), green after D-A (a).
The pinned build is installed by `npm ci` (offline); no test needs `dist/` or the network.

AC 2 — new file `test/core/reconcile-governance-role-directives.test.ts` (not the shared conformance test, which
several B7 tasks edit). Reads the working tree with `js-yaml` (`load`), like `test/core/define-scope-sweep.test.ts`:
- `release-planning.yaml` phase `reconcile-governance`: `checks.pre` equals `['role-directives.clean']`;
  `checks.post[0]` still starts `ready-decision-logs.covered`;
- `bindings.yaml` `checks['role-directives.clean']` deep-equals `{ run: ['npm', 'run', 'check:role-directives'] }`
  (no `severity`: reject);
- `package.json` `scripts['check:role-directives']` === `'node scripts/check-role-directives.cjs'`;
- versions by the bug-314 rule: `release-planning.yaml` `version` ≥ 2.2 and its history line matches
  `/2\.2 [^;]*task-215/`; `bindings.yaml` `version` ≥ 1.9 and its line matches `/(?:1\.9|2\.0) [^;]*task-215/`
  (task-241 takes 1.9 first; the gate re-bumps this task's entry to 2.0); the 2.1 task-279 entry is still present;
- `loadWorkflowRegistryAtHead(REPO_ROOT)` (`src/core`, as the conformance test calls it): no diagnostic's message
  names `role-directives.clean` (bound, so not `W_WORKFLOW_UNBOUND_TOKEN`), zero errors;
- `.wingfoil/WORKFLOW.md`'s `### Release Planning` section contains `role-directives.clean` and `check:role-directives`.

**Files expected (session 3).** `scripts/check-role-directives.cjs` (new); `package.json` (one `scripts` line);
`.wingfoil/workflows/bindings.yaml` (1.8 → 1.9, one binding + comment); `.wingfoil/workflows/custom/release-planning.yaml`
(2.1 → 2.2: `2.2 dl-050 option 1 (task-215, batch ruling D1): reconcile-governance declares the pre-check
role-directives.clean, \`directives list --role\` over every dna.yaml team.roles name, failing on any warning`, the 2.1
entry kept); `.wingfoil/WORKFLOW.md` (one sentence in the release-planning paragraph after the `reconcile-governance`
`ready` coverage sentence, plus `✔ pre: role-directives.clean` in the `RG` mermaid node); under D-A (a) also
`.wingfoil/roles.yaml` (1.7 → 1.8) and the "Applies to" sentences of the directives it binds (`traceability.md` 1.2 → 1.3;
`code-review.md` bumped if its sentence changes). No `src/` change; `dev-loop.yaml` untouched (D1).

**Decisions for the approver.**
- **D-A — the two unbound roles (blocks AC 1's "exits 0 today").** (a) **recommended:** give `facilitator` and
  `approver` own assignments in `roles.yaml` (1.7 → 1.8): `approver: [code-review]` (its file already says it applies
  "to the approver gate", so `roles.yaml` would agree with the directive's own text) and `facilitator: [traceability]`
  (inception produces the P* feature ids the traceability chain starts from); the check stays dl-050's "any warning",
  explicit declared configuration over an exception (determinism). (b) the script fails on every warning except dl-029's
  `no directives assigned to role '<r>'`, which it prints on stdout but does not count; AC 1 is amended in-task to say so
  (dl-029 ratified globals-only as legitimate). Smaller, but departs from dl-050 option 1's ratified text and lets a
  role silently lose its bindings. (c) keep both texts and let the check fail until someone binds the roles: rejected,
  the check would be red at its first run.
- **D-B — the pinned build, not `dist/`.** Recommended as above; the alternative (`node dist/cli.js`) needs
  `npm run build` before the check and checks a resolver no agent session in this repository uses until the pin
  advances.

**Risks for the batch.** `bindings.yaml`: task-241 bumps 1.8 → 1.9 and merges first; this task's 1.9 becomes 2.0 at the
gate (the AC 2 test accepts both). `package.json`: own line only. `release-planning.yaml`: no other B7 writer after 279.
`WORKFLOW.md`: the release-planning paragraph's `reconcile-governance` sentence only. Under D-A (a): `roles.yaml` has
no other B7 writer; `CLAUDE.md` §7's role table would no longer list the two new bindings — owned by
`align-agent-docs` (dl-025), a handover rather than an edit here. `test/directives/dev-loop-practice.test.ts` reads
`roles.yaml` (≥ 1.7 and the tech-lead header line): unaffected by a ≥ bump.

### red (qa, 2026-10-13)

- **Red commit:** `e243e387` (T4 is measured from it: `git log --first-parent --no-merges --format=%h e243e387..HEAD --
  test/cli/check-role-directives.test.ts test/core/reconcile-governance-role-directives.test.ts`).
- **Files:** `test/cli/check-role-directives.test.ts` (AC 1), `test/core/reconcile-governance-role-directives.test.ts`
  (AC 2). Test files only; no `scripts/`, config or `.wingfoil/` change.
- **Fixture checked against the pinned build first** (`node node_modules/wingfoil-released/dist/cli.js`, 0.2.2, on a
  scratch working tree): `dna show` refuses a technology without `category` and a member without a `roles` array, so the
  fixture declares both (`category: language`, member `roles: []`); `team.roles: []` with member `roles: []` validates
  (exit 0), so case 4b reaches the script's own `team.roles` check; `directives list --role reviewer` with `ghost` bound
  → `warnings: ["directive 'ghost' bound to role 'reviewer' has no directive file"]`; an unassigned `qa` →
  `["no directives assigned to role 'qa'"]`; the clean fixture → `[]` for both roles.
- **Per AC (both red-first, as classified at design):**
  - AC 1, cases 1–5 of the design: `AC 1 (exit 0)` (exact stdout `developer: ok\nreviewer: ok\nrole-directives: 2 roles
    checked, 0 with warnings\n`, `dna.yaml` lists reviewer first; empty stderr); `AC 1 (exit 1)` (exact stderr line for
    `ghost`, `reviewer: 1 warning(s)`, summary `1 with warnings`); `AC 1 (roles from dna.yaml)` (`qa` in `team.roles`
    only: exact stdout over three roles, stderr `error: role 'qa': no directives assigned to role 'qa'`, exit 1 —
    assumes D-A (a)); `AC 1 (exit 2)` ×2 (`--bogus`; `team.roles: []` naming `team.roles`; stdout empty, one `error:`
    line); `AC 1 (exit 0 on this repository)` (`--root REPO_ROOT`: exit 0, empty stderr, last stdout line
    `role-directives: 8 roles checked, 0 with warnings` — green only after the D-A (a) `roles.yaml` change).
  - AC 2: `checks.pre` equals `['role-directives.clean']` and `post[0]` still `ready-decision-logs.covered`; the binding
    deep-equals `{ run: ['npm', 'run', 'check:role-directives'] }`; the `package.json` script; `release-planning.yaml`
    ≥ 2.2 with `/2\.2 [^;]*task-215/` and the `2.1 … task-279` entry kept; `bindings.yaml` ≥ 1.9 with
    `/(?:1\.9|2\.0) [^;]*task-215/`; at `HEAD` (`loadWorkflowRegistryAtHead`) zero errors, no diagnostic naming the
    token, `reconcile-governance` `checks.pre` equal to the token; `WORKFLOW.md`'s `### Release Planning` section
    contains `role-directives.clean` and `check:role-directives`.
- **Run:** `npx jest test/cli/check-role-directives.test.ts test/core/reconcile-governance-role-directives.test.ts
  --maxWorkers=2` → 2 suites failed; `check-role-directives.test.ts` 6 failed / 0 passed,
  `reconcile-governance-role-directives.test.ts` 7 failed / 0 passed (13/13). Every failure is an assertion on the
  behaviour: AC 1 — the absent script makes node exit 1 with empty stdout (`Expected: 0 / Received: 1`,
  `Expected: 2 / Received: 1`, `Expected: "developer: ok… / Received: ""`); AC 2 — `Expected: ["role-directives.clean"]
  / Received: undefined` (pre-check, and again at `HEAD` after the zero-errors assertion passed), binding and script
  `Received: undefined`, versions `Received: 2.1` / `Received: 1.8`, `WORKFLOW.md` substring absent.
- **For session 3:** the `HEAD` test reads the committed configuration, so it goes green only once the config change is
  committed, not on a dirty tree.

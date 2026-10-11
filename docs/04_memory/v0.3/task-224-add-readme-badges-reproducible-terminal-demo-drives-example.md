---
id: "task-224-add-readme-badges-reproducible-terminal-demo-drives-example"
type: task
title: "Add README badges and a reproducible terminal demo that drives an example"
status: in-review
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "presentation", "docs"]
ref: "dl-128"
bug: []
depends_on: ["task-214-add-community-health-files-shaped-ingestion"]
tmpl_version: 260703
---

## Description

The README shows nothing of what WingFoil does. The demo is a self-check: if the tool changes, the example fails instead of the animation going stale.

## Acceptance Criteria

- (characterization) README badges: npm version, licence, Node floor, `publish.yml` status — each derived from the registry, `package.json` or the run.
- (characterization) a `.tape` next to `docs/examples/01-first-project/` drives its `run.sh`; the rendered GIF committed under `docs/assets/`; the recorder is not an npm dependency.
- (characterization) `user-docs.yaml` `produces:` gains the tape and rendering; `checks.post` covers them; version bumped.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-128 items 1–2 (Q1 (a) VHS, Q2 (a) committed, Q3 (a)).
- **Notes:** Proposal key: D34.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (architect, 2026-10-10)

- **Sources read.** `dl-128` is `ready` (`grep -n '^status' docs/04_memory/design/dls/dl-128-*.md` → `ready`); this
  task implements its items 1–2 with Q1 (a) VHS, Q2 (a) committed, Q3 (a) (Implementation Notes). The
  comparison page and the case study (items 3–4, and their `produces:` entries in its Action 2) are not this task's.
  `depends_on: task-214` is `done` (`grep -n '^status' docs/04_memory/v0.3/task-214-*.md` → `done`); its notes leave
  `user-docs.yaml` at 1.4 and keep `align-user-docs`' `checks.post` prose verbatim (pinned by
  `test/core/workflow-repository-conformance.test.ts`), which this task keeps too. No tech-spec is cited.
- **AC classification (corrected: red-first, not characterization).** None of the three behaviours exists at the
  pre-batch main `30b268a3`: `git show 30b268a3:README.md | grep -ciE 'shields\.io|badge\.svg'` → `0`;
  `git ls-tree -r --name-only 30b268a3 | grep -E '\.tape$|\.gif$'` → empty; `user-docs.yaml`'s `produces:` names
  neither. So a guard written first fails genuinely (testing directive T1, precedent task-214). A few assertions in
  the guard are characterization by nature (package.json's `name`/`license`/`engines`, `LICENSE` exists, no static
  shields badge, no `vhs` npm dependency): they pass on first run and pin what the badges are derived from.

  | AC | Class | Guard |
  |---|---|---|
  | 1 badges | red-first | `test/docs/presentation.test.ts` "AC 1 — …" (4) |
  | 2 tape + GIF | red-first | "AC 2 — …" (10); `test/lint/control-characters.test.ts` binary list (`.gif`) |
  | 3 `user-docs.yaml` | red-first | "AC 3 — …" (5) |

- **Design.**
  - Badges, each rendered by a service from its source, none typed in: `img.shields.io/npm/v/wingfoil` (the
    registry's `latest`), `npm/l/wingfoil` and `node/v/wingfoil` (the `license` / `engines.node` of the
    published package.json, as the registry serves it), and GitHub's `actions/workflows/publish.yml/badge.svg`
    (the run). A static `img.shields.io/badge/…` is refused by the guard. The existing Glama badge is untouched.
  - Tape `docs/examples/01-first-project/demo.tape` (inside the example's folder): `Output
    docs/assets/wingfoil-demo-first-project.gif`, `Require bash/git/node`, a hidden
    `export WINGFOIL="node $PWD/dist/cli.js"` so the recording runs the build of the commit being recorded, then
    `bash docs/examples/01-first-project/run.sh` and `Wait+Screen@120s /OK: first project/`: VHS exits non-zero
    when the wait lapses, so a failing example (it prints `FAIL: …`) leaves no new GIF. The guard derives the OK
    text from `run.sh`'s `done_ok` line, so renaming it breaks the guard, not the recording silently.
  - `align-user-docs`: `produces:` + the tape and the GIF; `checks.post` keeps the prose and adds two **bound**
    checks, `presentation.current` (`npm test -- test/docs/presentation.test.ts`) and `demo.rendered`
    (`vhs docs/examples/01-first-project/demo.tape`), in `bindings.yaml` — so the unbound-warning set is unchanged
    (`node dist/cli.js workflow list --format json | grep -o W_WORKFLOW_UNBOUND_TOKEN | wc -l` → 77 with and without
    this change).
  - Same-class: `.gif` joins `BINARY_EXTENSIONS` (`test/lint/helpers/control-characters.ts`), otherwise the
    committed GIF (it holds NUL bytes) fails the control-character gate; `docs/assets/README.md` gets the file row
    and the regeneration command; `docs/examples/README.md` names the tape; `WORKFLOW.md`'s `align-user-docs` node.
  - `publish.yml` is not touched (no AC requires it).

### red

- `109ba32a test(docs): task-224 — failing test: …`: `npx jest test/docs/presentation.test.ts test/lint/control-characters.test.ts`
  → 2 suites failed, **16 failed / 22 passed** (38): every failure an absent badge, tape, GIF, README/asset
  reference, `produces:`/`checks.post`/binding entry, the `1.4` version, or `.gif` not on the binary list. The 22
  passes are the 18 unchanged control-character tests and the 4 characterization assertions above (the 4th, "no
  static badge", passes because the README has none).

### green

- `be197ceb feat(docs): task-224 — …`: README badges (under the `# WingFoil` heading) and a demo image with a caption
  naming the example and the tape; the tape; `docs/assets/README.md` (row + "Regenerating the demo GIF");
  `docs/examples/README.md`; `user-docs.yaml` 1.4 → **1.5**, `bindings.yaml` 1.6 → **1.7** (header reasons);
  `WORKFLOW.md`; `BINARY_EXTENSIONS` `['.gif', '.png']`.
- `npx jest test/docs/presentation.test.ts test/lint/control-characters.test.ts test/core/workflow-repository-conformance.test.ts test/docs/workflow-md.test.ts test/docs/community-health.test.ts test/lint/version-bump.test.ts test/core/workflow-core-checks.test.ts test/docs/name-resolvability.test.ts`
  → 8 suites, **154 passed, 1 failed**: "the rendered GIF is committed under docs/assets/".
- **BLOCKER — the GIF is not rendered.** VHS is not installed on this machine (`which vhs ttyd` → nothing;
  `docker images | grep -i -E 'vhs|charm'` → nothing; only `ffmpeg` is present), and fetching a binary is a download
  this session may not perform without the approver's explicit permission. No substitute was made: an animation
  not rendered from the tape would be exactly the second source of truth `dl-128` forbids. The example the tape
  drives passes on this commit's build:
  `npm run build && WINGFOIL="node $PWD/dist/cli.js" bash docs/examples/01-first-project/run.sh` → exit 0, last line
  `OK: first project: init → add → submit → approve` (81 lines of output).

### refactor (gates, 2026-10-10, on be197ceb; load average 60.97 at start, `uptime`)

- `npm test`: **348 suites, 6491 passed / 1 failed** (889 s; includes `npm run typecheck`). The one failure is
  `presentation.test.ts` "the rendered GIF is committed under docs/assets/" — the blocker above; nothing else.
- `npm run lint`: exit 0. `npm run docs:api`: exit 0. `npx tsc --noEmit -p tsconfig.json`: exit 0.
  `npx tsc -p tsconfig.build.json --noEmit`: exit 0.
- `npm run test:coverage`: not run — no file under `src/` changed (`git diff 30b268a3 --stat -- src` → empty), so
  coverage cannot move (precedent: task-214, task-273).
- `node dist/cli.js workflow list --format json` → exit 0; unbound-token warnings 77, as on `30b268a3`.
- `node scripts/check-governance.cjs --base 30b268a3` → 1 `wf()` commit checked, 0 findings, exit 0.
- No BDD scenario covers `dl-128` (`grep -rl "dl-128\|badge" docs/02_requirements/02_bdd/features/` → empty).

### review (self, reviewer)

- AC 1 met: four badges, each rendered from the registry or the run; tests "AC 1 — …" (4).
- AC 2 **partly met**: the tape drives `run.sh`, VHS is not an npm dependency, README and `docs/assets/README.md`
  reference the GIF; **the GIF itself is missing** (blocker above) and the README's image is a dangling link until
  it is rendered. Tests "AC 2 — …": 9 / 10.
- AC 3 met: `produces:` + tape and GIF, `checks.post` + two bound checks, `user-docs.yaml` 1.5; tests "AC 3 — …" (5).
- **Not submitted**: the task stays `in-progress` until the GIF is committed (submitting with a red suite and a
  dangling README image would put an unmet AC through the review gate).
- **Decisions for the approver:** (1) how the GIF gets rendered — the approver runs, in this worktree,
  `npm run build && vhs docs/examples/01-first-project/demo.tape` and commits the GIF on this branch, or authorizes
  this session to download VHS; (2) `demo.rendered` is bound to `vhs <tape>`, a check that needs a non-npm binary
  and rewrites a tracked file (the alternative is `manual: true`); (3) the licence and Node badges read the
  published package (registry) rather than `package.json` on `main`; (4) the recording runs the `dist/` build via a
  hidden `export WINGFOIL=…`, not the installed `wingfoil`; (5) the badges sit under the `# WingFoil` heading, the
  Glama badge is kept.
- No pending amendments: no Memory element other than this task file is edited.
- Same class as `bug-295` (a `produces:` path that exists from the instance's start): the tape and the GIF will
  join README.md & co. once committed; already tracked there, nothing new filed.

### Approver ruling (2026-10-10) — `demo.rendered` is manual

- Rulings on the review's decisions (1) and (2): the approver installs VHS and renders the GIF himself (nothing is
  downloaded by this session); `demo.rendered` becomes a manual check. A check binding has no `manual` form
  (`src/workflow/bindings.ts` `CheckBinding` requires `run`; spec-003 Layer 3 table: `manual` is an
  `ActionBinding` field only), so the `vhs` binding is removed and the check stays an unbound token, as the
  other deliberately unbound checks are. `bindings.yaml` stays 1.7 (one bump per branch), header reason updated.
- red `3c1e7204`: `npx jest test/docs/presentation.test.ts test/core/workflow-repository-conformance.test.ts` →
  **5 failed / 30 passed**: no binding expected for `demo.rendered`, the check's line in `user-docs.yaml` links
  `docs/assets/README.md`, the note's content (Charm apt repository, `apt install … vhs ttyd ffmpeg`, the render
  command from the repository root, `git diff --stat`, `npx jest test/docs/presentation.test.ts`), the
  conformance list gains `["user-docs", "phases[1].checks.post[2]", "demo.rendered"]` — plus the known GIF failure.
- green `0d0af0c7` and the `WORKFLOW.md` node (`demo.rendered (manual)`): `npx jest test/docs/presentation.test.ts
  test/core/workflow-repository-conformance.test.ts test/lint/version-bump.test.ts test/docs/workflow-md.test.ts
  test/core/workflow-core-checks.test.ts` → **100 passed / 1 failed** (the GIF only). Unbound-token warnings:
  `node dist/cli.js workflow list --format json | grep -o W_WORKFLOW_UNBOUND_TOKEN | wc -l` → **78** (77 + `demo.rendered`).
- `npm run lint` exit 0, `npx tsc --noEmit -p tsconfig.json` exit 0 after the change.
- Next: the approver renders the GIF in this worktree per `docs/assets/README.md` § "Regenerating the demo GIF";
  then the GIF is committed, the full suite re-run, and the task submitted.

### Render fix (2026-10-11) — the tape waits for the prompt on the cursor line

- The approver's render (`npm run build && vhs docs/examples/01-first-project/demo.tape`) failed with
  `timeout waiting for "Screen OK: first project" to match`, its "last value" the top of the buffer. Cause, read in
  VHS's source (text files read from `raw.githubusercontent.com/charmbracelet/vhs/main/`, nothing installed):
  `Buffer()` in `testing.go` evaluates `term.buffer.active.getLine(i)` for `i` in `0..term.rows`, the top rows of
  the buffer, not the scrolled viewport; `CurrentLine()` reads `getLine(cursorY + viewportY)`, the cursor's row. The
  README documents the default `Wait` as regex `/>$/`, timeout `15s`, scope `Line`. `shell.go` sets bash's
  `PS1` to `> ` (coloured). `evaluator.go` returns a command's error before `v.Render`, so a lapsed wait writes no GIF.
- red `19af8960`: `npx jest test/docs/presentation.test.ts` → **3 failed / 19 passed** (the two new tape tests and
  the known GIF one).
- fix: the tape types `bash docs/examples/01-first-project/run.sh || exit 1` and waits with `Wait@120s /^>$/`
  (line scope, anchored, so no output line such as `… <ada@example.com>` matches), then `Sleep 4s` on the frame
  showing the `OK:` line. A failing example exits the shell, the prompt never returns, `vhs` errors before
  rendering. `Wait+Line /OK: …/` was not used: when the prompt is drawn the cursor has already left the `OK:` row,
  so a line-scoped wait on it can miss it. Tape comment, `docs/assets/README.md`, `docs/examples/README.md` and the
  README caption updated.
- `npx jest test/docs/presentation.test.ts test/core/workflow-repository-conformance.test.ts test/lint/control-characters.test.ts`
  → **54 passed / 1 failed** (the GIF only). `npm run -s lint:claims` exit 0. Next: the approver re-renders.

### GIF rendered, final gates and submit (2026-10-11)

- The approver rendered the GIF in this worktree with the fixed tape (`npm run build && vhs docs/examples/01-first-project/demo.tape`);
  committed as `27d526e0`. `head -c 6` → `GIF89a`; Pillow: 1200×760, 201 frames; 1,349,072 bytes (`ls -l`). The
  coordinator checked the last frame: the git log, `OK: first project: init → add → submit → approve`, the prompt.
  This lifts the blocker recorded under green and the review's "AC 2 partly met" / "Not submitted": **AC 2 is met**.
- `npx jest test/docs/presentation.test.ts test/lint/control-characters.test.ts` → **41 / 41 passed**.
- Gates on `27d526e0`, one heavy gate at a time (dl-170 interim rule: `uptime` 1-minute load 2.78 at start,
  `pgrep -af "jest --coverage|scripts/run-tests.cjs|tsc -p tsconfig.build.json"` empty before each heavy gate; the
  build `tsc` waited for another worktree's coverage run to end):
  - `npm run test:coverage -- --maxWorkers=2` → **348 suites, 6495 / 6495 passed** (613 s); all files 99.29 % statements,
    97.04 % branches, 97.74 % functions, 99.69 % lines. No file under `src/` changed
    (`git diff 30b268a3 --stat -- src` → empty), so coverage cannot differ from main.
  - `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
    `npx tsc -p tsconfig.build.json --noEmit` exit 0.
  - `node scripts/check-governance.cjs --base 30b268a3` → 1 `wf()` commit and 11 other commits checked, 0 findings.
- Final AC status: AC 1 met (4 tests), AC 2 met (12 tests + the control-character binary list), AC 3 met (7 tests:
  `produces:`, `checks.post` with `presentation.current` bound and `demo.rendered` manual, the render note).
- Pending amendments: none. `bug:` is empty, so no bug status sync follows the submit.

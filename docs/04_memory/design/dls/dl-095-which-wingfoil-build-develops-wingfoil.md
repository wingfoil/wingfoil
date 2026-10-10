---
id: "dl-095-which-wingfoil-build-develops-wingfoil"
type: decision-log
title: "Which WingFoil build develops WingFoil, how it is pinned, and when it is replaced"
status: ready
context: "retrospective"
release: "v0.2.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`). The approver ruled on 2026-09-28 that WingFoil is
developed with its own **released** build and that build's MCP server: `wingfoil@0.2.1` from npm,
installed locally in the repository, with the server registered in a versioned `.mcp.json` as
`dl-026` decided. The approver pinned `0.2.1` now, and asked for a rule for replacing the pinned build
(for example, v0.3 moves to `0.2.2` after its tag). Both land in step 2 of the v0.2.2 implementation
order, together with the move of the configuration to the root (`retrospective-rel-v0.2-plan` §6.8).

### Which build runs today depends on the machine

- **No build is declared.** `package.json` has no dependency on a published `wingfoil`, and there is
  no `.mcp.json` (`ls .mcp.json` → no such file at `a20b346c`). `dl-026` (`ready`, `release: ""`) is
  ratified and was never scheduled.
- **What an agent runs is whatever it finds.** Sessions run `node dist/cli.js` (the build under
  development) or the `wingfoil` found first on `PATH`, a per-machine global install that the
  repository cannot see. The v0.2 retrospective had to make "never the `wingfoil` found first on
  `PATH` without checking" a precondition of its own reproductions (`retrospective-rel-v0.2-plan` §1,
  P8), and its approved dispositions record that the `wingfoil` on `PATH` there was a different CLI.
  On 2026-09-28 the same machine's `wingfoil --version` prints `0.2.1`: the answer changes with the
  machine and the day, which is the problem.
- **The released build cannot yet read this repository.** It resolves its configuration from the git
  root, and WingFoil's configuration lives under `docs/self/` (`bug-075`). That is why the pin and the
  root move are one step.
- **The version exists.** `npm view wingfoil version` → `0.2.1` (read 2026-09-28).

## Decision

WingFoil's own Memory, DNA and workflow configuration are read and written by a **published, pinned**
WingFoil build, declared in the repository; the build under development is what gets tested, never
what manages the project. Three questions are open for the approver.

**Q1 — how the pinned build is installed:**
- **(a) an npm alias devDependency**, exact and lockfile-recorded:
  `"wingfoil-released": "npm:wingfoil@0.2.1"`. `npm ci` installs it with the rest; `npx wingfoil`
  inside the repository resolves to its binary. A plain `"wingfoil": "0.2.1"` is not possible, because
  npm refuses to install a package as a dependency of a package with the same name; the alias avoids
  that. Both behaviours are confirmed at implementation, before relying on them.
- **(b) `npx -y wingfoil@0.2.1`** per invocation, with the version written into an npm script. No
  lockfile integrity, and a network fetch on first use.
- **(c) a documented global install.** Per machine and invisible to the repository: the situation
  this decision-log exists to end.

**Q2 — which build `.mcp.json` registers:**
- **(i) the pinned build** (`npx wingfoil mcp`, or its path under `node_modules/`). No build step is
  needed, which removes `dl-026`'s open build-prerequisite question.
- **(ii) the build under development** (`node dist/cli.js mcp`), as `dl-026` wrote it. Every agent
  session then exercises unreleased code, and a fresh clone has no server until `npm run build`.

**Q3 — when the pinned build is replaced:**
- **Scheduled.** The pin moves to the newest published version of the release-line:
  - **(A)** only at the start of each release's `release-planning`; or
  - **(B)** also after every published patch, at the point the in-flight release merges `main` after
    the patch's tag (for v0.3: `0.2.1 → 0.2.2` after `v0.2.2` is tagged, step 7 of the order).
- **On a defect.** When a defect in the pinned build blocks a step, the pin moves forward to a
  **published** version that fixes it. If none exists, the step is done by hand for that occurrence,
  the workaround is recorded in the active plan's Execution Notes, and the defect is filed as a bug
  targeted at the next patch. The pin never moves to an unpublished build, and never backwards.
- **Every switch is its own commit**, changing only `package.json` and `package-lock.json`, and is
  noted in the active phase plan.

**Recommendation:** Q1 (a), Q2 (i), Q3 (B).
- **Q1 (a):** the only form that is declared, lockfile-pinned and installed by the same `npm ci` the
  project already runs; `scripts/check-lockfile-pins.cjs` and `dl-069`'s drift checks then cover it.
- **Q2 (i):** the MCP server an agent reads through is the one a user installs, and its answers do
  not change while a task edits `src/`.
- **Q3 (B):** it is the approver's own example, and it keeps v0.3 from running for weeks on a build
  with defects v0.2.2 already fixed.

## Rationale

- **A tool under construction should not manage its own construction.** A dev build that writes
  Memory can corrupt the record it is being tested against; the released build is fixed and was
  gated by staging and e2e-smoke.
- **Dogfooding the released artefact.** Users get `wingfoil` from npm. Developing with the same
  artefact surfaces the defects they will meet, which is where v0.2's two external release blockers
  came from (`bug-076`, `bug-077`).
- **Determinism.** Two sessions on two machines run the same build only if the repository declares
  it; a global install cannot be diffed or reviewed.
- **Q2 amends a `ready` decision.** `dl-026` registered the dev build; the approver's ruling for the
  released build and its MCP changes that command, and the vendor-coupling trade-off `dl-026` names
  is unchanged.

## Actions

- [ ] Ratify, choosing Q1, Q2 and Q3 (owner: approver). The choice goes in the approve commit's
      `Reason:`, including that Q2 (i) amends `dl-026`'s registration command.
- [ ] On `ready`, in v0.2.2 step 2 (after the configuration moves to the root): add the pinned
      dependency per Q1, the root `.mcp.json` per Q2 and `dl-026`, and the contributor setup in
      `COLLABORATION.md`.
- [ ] Add a precondition to every phase plan that the build in use is the pinned one:
      `npx wingfoil --version` equals the version `package.json` pins.
- [ ] Write the Q3 rule into the `release-planning` workflow (`release-planning.yaml`) as a
      precondition step.
- [ ] Tasks are derived by v0.2.2 `release-planning` (`build-backlog`), not created here.

## Relations

- **Origin:** `retro-v0.2`; `retrospective-rel-v0.2-plan` §6.8 (step 2 and step 7).
- **Schedules and amends:** `dl-026-repo-versioned-mcp-server-config` (the registration command).
- **Depends on:** the root move closing `bug-075`, and `dl-094` (identity) before it.
- **Related:** `dl-069` (lockfile drift), `dl-092` (the patch whose tag triggers the switch),
  `bug-076`, `bug-077` (defects found by using the released build).
- **Traceability:** P5.2.1 (MCP Resources); REQ-SYS-09 (distribution as an npm package).

**Note (2026-10-10, W3 B4 follow-ups, `bug-ingest-rel-v0.3-w3b4-review-findings-plan`).** The third Action's command
"`npx wingfoil --version` equals the version `package.json` pins" reads `npm run -s wingfoil -- --version` from now on:
the `wingfoil-cli` directive (§1, `dl-163` S3e) forbids `npx wingfoil`, because once `dist/` is built it runs this
checkout's own CLI and no longer says which build answers. The plan template already carries the corrected command
(`.wingfoil/memory/templates/plan.md`, *Context* comment). The pinned build's surprises are bugs tagged `pinned-build`
(`wingfoil-cli` §3), among them
`bug-323-the-pinned-build-s-memory-history-reports-an-amend-commit-with-operation-null` (`triaged`, v0.4). The
Decision above is unchanged.

---
id: "task-192-stamp-wingfoil-commit-wingfoil-version-semver-sha-pin"
type: task
title: "Stamp every WingFoil commit with `WingFoil-Version: <semver> (<sha>)` and pin `git commit --cleanup`"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "high"
tags: ["v0.3", "core", "storage", "build", "audit"]
ref: "dl-111"
bug: ["bug-051"]
depends_on: ["task-166-settle-reason-block-grammar-shape-rule-terminator"]
tmpl_version: 260703
---

## Description

No commit says which build wrote it. Ratified: the `build` script writes `dist/build-info.json` (`{version, commit}`, `-dirty` suffix, no timestamp); `commitPaths` appends the trailer paragraph; `wingfoil --version` prints `<semver> (<sha>)`; `memory history` surfaces it. A run without the file writes `(unknown)`. In the same primitive, `commitPaths` (`src/storage/commit.ts:80`) passes no `--cleanup`, so the declared body normal form depends on the operator's git config (`bug-051`). B's run record reuses the stamp (`spec-016` run-record field 13).

## Acceptance Criteria

- (red-first) every commit written through `commitPaths` ends with a trailer paragraph whose `git log --format='%(trailers:key=WingFoil-Version,valueonly)'` is `<package version> (<sha>)`, or `(unknown)` when no build-info exists; one test per commit site family (memory, dna, directive, init).
- (red-first) two builds of one clean commit produce byte-identical `build-info.json`; a dirty tree stamps `<sha>-dirty`.
- (red-first) `wingfoil --version` prints `<semver> (<sha>)`.
- (red-first) `memory history` entries carry a `wingfoil` field when the trailer is present.
- (red-first) with `commit.cleanup=verbatim` in the fixture's git config, a reason with trailing whitespace and blank-line runs is still stored normalized (`--cleanup=whitespace` pinned); the four cleanup modes are covered (`bug-051`).
- (characterization) `npm pack --dry-run` includes `dist/build-info.json`; `publish.yml`'s `--ignore-scripts` pack still gets it (built by `build`, not `prepack`).

## Implementation Notes

- **Size:** M · **wave:** 2 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-111 Q2 (a), Q3 (i), Actions 2–3; spec-004 §4.3 (trailer paragraph); spec-008 §2.
- **Features:** P1.2, P1.10.
- **Notes:** Proposal key: C06. `package.json` `build`, `scripts/`, `src/storage/commit.ts`, `src/cli/program.ts`, `src/memory/history.ts`. The `dl-089` metric (Action 4) belongs to that DL's task (domain D).
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

<!-- Running log of what actually happened while working this task through dev-loop — filled in
     incrementally per phase, not written after the fact. Raw material for the release's Execution
     Notes / the retrospective, not the retrospective itself.
     - design: tech-specs found missing/needing revision (dev-loop/design safety net).
     - red/green/refactor: deviations from the plan above, blockers, scope surprises.
     - review: rejection reasons and what changed on the next pass. -->

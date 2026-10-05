---
id: "bug-143-versioned-config-yaml-edits-skip-the-bump"
type: bug
title: "Content edits to the four versioned self-config YAMLs routinely skip the `doc-versioning` `version:` bump, and nothing checks for it"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`dna.yaml`, `memory.yaml`, `workflows.yaml` and `roles.yaml` each carry a `version:` field that the
global `doc-versioning` directive (`.wingfoil/directives/custom/doc-versioning.md`)
requires be bumped "only on the first edit after the file has been committed to git." Across the
v0.2 era, nine content-touching commits to the first three files left `version:` unchanged; no lint
or test enforces the rule for these four files.

## Steps to Reproduce

1. List every v0.2-era commit touching each versioned config file and read the `version:` field it
   committed, at `a20b346c` (main):
   ```
   for f in dna.yaml memory.yaml workflows.yaml; do
     for c in $(git log --format=%H 20e8271..a20b346c -- docs/self/.wingfoil/$f); do
       git show $c:docs/self/.wingfoil/$f | grep -m1 '^version:'
     done
   done
   ```
   Result: `dna.yaml` (3 commits: `3a350aa6`, `ceda51d9`, `4d21fb63`) and `memory.yaml` (4 commits:
   `d3de4419`, `ceda51d9`, `5a5a83bc`, `eef3a671`) each report `version: 1.1` at every one of their
   commits in the range; `workflows.yaml` (2 commits: `353ce5c6`, `df9210a4`) reports `version: 1.1`
   at both. All nine commits change file content without moving `version:` even once.
2. Contrast with `roles.yaml`'s one commit in the same range: `git show 617d64a8~1:docs/self/.wingfoil/roles.yaml
   | grep '^version:'` → `version: 1.0`; `git show 617d64a8:docs/self/.wingfoil/roles.yaml | grep '^version:'`
   → `version: 1.1` — the one clean instance of the rule being followed, landing in the same commit
   that added `command-baseline`/`claim-evidence` (task-094's own directive-conscious edit).
3. `grep -n "\"lint" package.json` → only `"lint": "eslint ."`; `ls test/lint` → `lint-clean.test.ts`,
   `pack-ignore-scripts.test.ts` — neither checks a `version:` bump against a file's own git history.

## Expected Behavior

Either a lint/test gate flags a commit that changes one of these four files' content without moving
`version:`, or the rule is demoted from "non-negotiable convention" to something the tooling
actually helps enforce.

## Actual Behavior

Nine of the ten v0.2-era commits touching these files skip the bump silently, and no gate would have
caught any of them.

## Notes

- Root cause: `doc-versioning` is a hand-followed directive with no corresponding check anywhere in
  `test/lint/` or `eslint.config.js` — there is no automated signal distinguishing
  a content edit that should bump `version:` from one that legitimately should not (e.g. a pure
  comment/whitespace change).
- Fix (from the retrospective's disposition): add a lint check over these four files specifically —
  a commit that changes non-comment content without moving `version:` fails the gate — mirroring the
  `roles.yaml`/`617d64a8` case as the positive example of correct behaviour.

## Triage & Execution Notes

- capture: filed by the v0.2 retrospective (retro-v0.2), from the governance-directive-compliance
  mining pass over `20e8271..a20b346c`; figures re-derived directly rather than copied from the pass.

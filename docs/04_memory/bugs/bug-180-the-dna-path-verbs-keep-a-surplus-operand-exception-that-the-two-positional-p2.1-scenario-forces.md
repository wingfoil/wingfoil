---
id: bug-180-the-dna-path-verbs-keep-a-surplus-operand-exception-that-the-two-positional-p2.1-scenario-forces
type: bug
title: "The DNA path verbs keep a surplus-operand exception that the two-positional P2.1 scenario forces"
status: in-review
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.3"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P2.1"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3","cli","dna","grammar","bdd"]
---

## Summary

The four DNA path verbs (`dna set/add/update/remove`) refuse a surplus operand inside the operation (`CorePositional.refusesExtraItself`), not at registration like every other command. Two consequences follow. Outside the project root, they report the root error at exit 1 instead of the surplus at exit 2. And the registry field is not declared in `spec-006` §2.

## Steps to Reproduce

1. From a subdirectory of a project: `node dist/cli.js dna set project.name bogus --value y` → `E_NOT_AT_GIT_ROOT`, exit 1.
2. From the same directory: `node dist/cli.js memory approve a b --reason x` → exit 2, surplus message.

## Expected Behavior

One registration-level refusal for every command, as `dl-082` intends, with the DNA migration hint (`the value travels in --value`) appended by the registrar.

## Actual Behavior

The exception is needed only because `P2.1-dna-set.feature` (line ~32) still writes the pre-`dl-082` two-positional form `dna set ..language python` and pins "malformed path beats surplus" (`test/core/dna-mutation-surface.test.ts`, `task-093`). `spec-008` §5 already writes the same case as `--value python`.

## Notes

- Found by `task-129`'s independent review, which proposed this fix:
  1. rewrite the P2.1 scenario with `--value` (an approver ruling, because it changes an acceptance contract);
  2. give `CorePositional` a `surplusHint` that the registrar appends;
  3. remove `refusesExtraItself`, then declare the registry shape in `spec-006` §2.
- `spec-008` §1 states the current exception precisely (`0ae170ec`).

## Triage & Execution Notes

Captured by `bug-ingest-rel-v0.3-wave0-review-findings-plan` (2026-10-01), from the independent
review of a wave-0 task of `dev-loop-rel-v0.3-plan`.

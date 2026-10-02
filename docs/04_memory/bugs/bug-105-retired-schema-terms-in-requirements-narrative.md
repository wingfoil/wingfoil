---
id: "bug-105-retired-schema-terms-in-requirements-narrative"
type: bug
title: "`conventions` survives in the narrative prose of three requirements documents, and the user story is where a fix has to start"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P2.4"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`spec-002` removed `conventions` from `dna.yaml` in v1.1 — the rules moved to
`directives/custom/`. Three requirements documents still name it in **narrative** prose:

- `docs/02_requirements/01_user_story_map/01_init-migrate.md` — **US-0A-08** itself, "so that I can
  set initial modules, stack, and conventions"
- `docs/02_requirements/02_bdd/features/p2-dna/P2.1-dna-set.feature` line 2
- `docs/02_requirements/02_bdd/features/p2-dna/P2.4-project-dna-config.feature` line 2

**Three documents, not four.** `P2.2-dna-show.feature`'s narrative line is clean — it reads "As
Jordan, I want to query and display project DNA so I understand the team architecture." P2.2 has a
different defect, in an acceptance step, and it is `bug-106`.

## Steps to Reproduce

Read line 2 of each feature file and the story it transcribes. `wingfoil dna show conventions` →
`error: no DNA key named 'conventions'`, exit 1.

## Expected Behavior

The narrative describes the DNA the schema actually declares.

## Actual Behavior

It names a section retired a release ago.

## Notes

**This class asserts nothing, which is why it is separate from `bug-106` and why it is `low`.** A
narrative line is the *As-a* sentence; no step checks it, no runner would fail on it, and a reader is
misinformed rather than misled into a wrong expectation of the tool.

**The story is where a fix starts, and that ordering is the whole point.** The two feature lines are
paraphrases of US-0A-08 sharing its stale phrase verbatim. Correcting the features alone would
desynchronise them from the story, which is exactly the traceability chain
feature → US → BDD → REQ → task exists to keep aligned. `task-100` declined to fix its own file for
this reason and was right to.

**Check for the fourth occurrence when scheduling.** `P2.4`'s narrative line names "a structured
project map (modules, tech stack, team, conventions)" — both `tech stack` and `conventions` are
retired shapes, so that line carries two corrections rather than one.

## Triage & Execution Notes

- triage (2026-09-24): **low**. No acceptance criterion depends on it and no behaviour is wrong.
  Filed because the chain it sits in is what the project's traceability claim rests on, and because a
  fix is cheap once someone is already reading these files — which `bug-106` will require.
- Found by `task-100` reading its whole feature file, and corrected by its reviewer from four
  documents to three.

---
id: "dl-115-retrospective-notes-written-during-the-release"
type: decision-log
title: "Retrospective input is reconstructed after the release — write it during the release in a marked section, and give every proposal from a secondary source an explicit disposition before a gate"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`, being filed now). At its `additional-points` gate the
approver accepted three related proposals:
- retrospective notes are written during the release, in a marked section of the Execution Notes,
  checked by a `checks.post`;
- the growing practice of committing Execution Notes together with code folds into that rule;
- the lesson of the retrospective's own completeness pass (`retrospective-rel-v0.2-plan` §4.10)
  becomes a rule of the workflow.

**How the retrospective gets its input today.** `retrospective.yaml` (version 1.1), phase
`explore`, mines "the `## Execution Notes` of every Memory document in the release scope" after the
release has shipped. Nothing asks anyone to mark, while working, what the retrospective should look
at. The task template's `## Execution Notes` is one undifferentiated section
(`.wingfoil/memory/templates/task.md`), and in v0.2 it is where most of the text is: in the
75 task files under `docs/self/docs/04_memory/v0.2/` at `a20b346c`, 277,196 of 315,509 words sit
under `## Execution Notes`, which is the last section of the template (words from that heading to the
end of each file, `awk '/^## Execution Notes/{e=1} e' <file> | wc -w`, summed). The v0.2
retrospective therefore split its reading into eight parallel mining slices over the release's
commits, commit bodies and notes (plan §4.7). Every item it found had to be located again in text
written for another purpose.

**Notes are already moving closer to the work.** The share of code commits (touching `src/` or
`test/`) that also touch `docs/` rose across the v0.2 windows: 4 of 31 (13%) from the v0.1
retrospective to 2026-09-13, 27 of 137 (20%) from 2026-09-14 to 2026-09-20, 24 of 105 (23%) from
2026-09-21 to `a20b346c`. Measured by classifying `git show --name-only --format= <sha>` for every
commit of `git log --since/--until 20e8271..a20b346c` in each window. The metric is `dl-089`'s G12,
which still has no rule to be measured against.

**What went wrong in this retrospective's own gate** (plan §4.10). The first run of `explore`
compared its findings with the secondary source, the notes kept during v0.2 for v0.3 planning, for
only part of that source, and treated the source's **proposals for later releases** as findings to be
read after mining. A proposal cannot emerge from mining the repository, least of all one whose
origin is outside it, so many were never examined, and the gate was brought without them. The
approver caught the gap. The pass was redone in full: every item received exactly one of four
outcomes (covered by a theme or an existing disposition; covered by an existing element, with its
id and a status read by command; a new proposal restated from versioned ground; superseded, with
the command that proves it), and ten new proposals and six superseded items came out of it.

## Decision

Retrospective input is written during the release, where the work happens, and the retrospective
reads that first. Before any gate, every proposal in a secondary source has an explicit
disposition. The open choices below remain for the approver.

**Q1 — where notes for the retrospective are written:**
- **(A) a marked subsection, `### Retrospective`, at the end of `## Execution Notes`**, in the task,
  bug and plan templates. One line per item: what happened, the evidence (a command or a sha), and
  optionally a proposal. "None" is a valid entry.
- **(B) one running section in the release element's body**, appended by whoever meets friction.
- **(C) both**: (A) per element, and the release element links them.

**Q2 — what enforces it:**
- **(a) a `checks.post` on `dev-loop`'s `done` phase**: the task's `### Retrospective` subsection
  exists (it may say "None"). The same existence check applies when a bug reaches `closed` and when
  a plan reaches `done`.
- **(b) review only**: the reviewer asks for it; no check.

**Q3 — the secondary-source rule** (plan §4.10):
- **(x) in `retrospective.yaml`**: `explore` lists every secondary source it was given, and
  `additional-points` gains a `checks.pre`: every item that is a proposal has one of the four
  outcomes above. A proposal is never read as a finding.
  *(Amended 2026-10-07, approver, with `dl-163`.)* For a consumer feedback note (`dl-163`) the outcome set is six:
  the four above plus `declined` (the approver does not take it up, with a reason) and `needs-info` (the note is
  sent back to its consumer for more information); the check accepts all six for such notes.
- **(y) in the `claim-evidence` directive**, as a general rule for any gate fed by a secondary
  source, not only retrospectives.

**Recommendation:** Q1 (A), Q2 (a), Q3 (x) now and (y) through `dl-097`.
- **Q1 (A)** puts the note next to the evidence it cites, where a reviewer already reads, and `explore`
  can collect it with one heading search instead of eight slices.
- **Q2 (a)**: a rule without a check recurred in v0.2 (the retrospective's headline theme). An
  existence check with "None" allowed costs the author one line.
- **Q3 (x)** fixes the workflow that failed. The general form belongs with `claim-evidence`'s
  enforcement point, which `dl-097` decides.

## Rationale

- **Written at the time, not remembered afterwards.** A note written when the friction happens
  carries the evidence available then. Reconstructed weeks later, it carries what someone remembers,
  and this release rejected work repeatedly for exactly that difference.
- **Cheaper retrospectives.** The v0.2 retrospective needed eight mining slices and an adversarial
  review because the input was unmarked. A marked subsection turns the first pass into a collection.
- **The secondary-source rule is not about trust.** The notes were right about most things. The
  failure was a classification error, treating proposals as findings, and a classification error is
  prevented by a checklist, not by care.
- **Trade-off.** One more required subsection in three templates, and one more check. "None" keeps
  the cost at a line when there is nothing to say.

## Actions

1. **Ratify, choosing Q1–Q3.** Owner: approver. The choice goes in the approve commit's `Reason:`.
2. **Templates:** add `### Retrospective` to `.wingfoil/memory/templates/task.md`,
   `bug.md` and `plan.md` under Q1 (A) or (C).
3. **Workflows:** `dev-loop.yaml` (`done` phase `checks.post`, and the step that keeps a fix task's
   source bug in sync) under Q2 (a); `retrospective.yaml` `explore` and `additional-points` under
   Q3 (x). Each file bumps its `version`. Where a bug or plan closes by a hand transition, the check
   is the reviewer's until the workflow engine runs `checks`.
4. **G12's rule.** `dl-089`'s G12 (code commits that also touch `docs/`) is read against this rule
   from v0.3 on.
5. **Tasks are derived by v0.3 `release-planning` (`build-backlog`)**, not created here.

## Relations

- **Origin:** `retro-v0.2`; `retrospective-rel-v0.2-plan` §4.10 (the completeness pass, and its rule
  for next time).
- **Amends, on ratification:** `retrospective.yaml`, `dev-loop.yaml`; the task, bug and plan
  templates.
- **Related:** `dl-089-release-health-analyses-before-retrospective` (G12; the measured half of the
  retrospective's input, where this is the written half); `dl-097-claim-evidence-needs-an-enforcement-point`;
  `dl-019-plans-as-memory-element`, the plan type whose closing the check extends to.

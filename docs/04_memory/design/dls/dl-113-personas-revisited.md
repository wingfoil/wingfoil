---
id: "dl-113-personas-revisited"
type: decision-log
title: "The personas were written before any use and never revisited: make Morgan the primary persona, serve Casey through read-only views, and add a maintainer receiving AI-generated contributions"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`, being filed now). At its `additional-points` gate the
approver accepted the proposal to revisit the personas through a decision-log settled before v0.3's
scope is fixed: Morgan as the primary persona, Casey served as a view, and a new persona for an
open-source maintainer receiving AI-generated contributions.

**What the vision says today.**

- `docs/01_vision/04_personas.md` (version 1.0, 2026-06-15, *Approved*) defines six personas: Alex
  (solo developer), Sam (code reviewer), Jordan (team developer), Morgan (tech lead), Casey
  (non-technical manager) and Taylor (architect, "defined for future reference"). None is marked
  primary. The file has not changed since the vision documents were moved to `docs/01_vision/`
  (`git log --oneline a20b346c -- docs/01_vision/04_personas.md` lists only `0927f5df`).
- `docs/01_vision/01_product-brief.md` (version 1.3) repeats five of them under **Target Users**, and
  its Go-to-Market phases target Alex in v0.1, Morgan and Sam in v0.2, Jordan in v0.3 and Casey in
  v0.4.
- `README.md` presents the same five.

**What two releases of use show.** The only production user so far is this repository, and its
shape is none of the six as written:

- `dna.yaml` `team.members` lists one human; `team.agents` declares one agent entry that executes as
  `developer`, `reviewer`, `qa` and `architect` with `approval_authority: false`; `roles.yaml` binds
  directives to eight roles. One person sets the rules, approves every gate, and directs agents that
  do the work in parallel. That is Morgan's profile ("sets architecture decisions, reviews PRs,
  defines conventions … the team (humans + agents) works in parallel streams"), with agents as the
  team.
- Casey's goals ("understand project decisions … at a glance", "see workflow state and identify
  bottlenecks") are all read goals. None needs a command that writes, and the only surfaces that
  exist, the CLI and the MCP server, are built for developers and agents.
- `dl-020-contribution-model` (`ready`) defines how an outside contributor files intent as a Memory
  element for an agent to turn into delivered work, and `COLLABORATION.md` publishes it. No persona
  describes the person on the other side of that model: a maintainer who decides what enters the
  project when contributions are increasingly produced by AI.

**Reach of a persona change.** Personas are named across the vision and requirements layers.
`git grep -c -E "Alex|Sam|Jordan|Morgan|Casey|Taylor" a20b346c -- docs/01_vision
docs/02_requirements README.md` counts 70 lines in `docs/01_vision/05_journeys.md`, 42 in
`06_features.md` (its persona column) and between 12 and 33 in each User Story Map file. Renaming or
removing a persona reaches all of them. Adding one, or changing which is primary, does not.

## Decision

The personas are revisited from the evidence of use, and no existing persona is renamed or removed,
so the journeys, the features' persona column and the User Story Map stay valid. The open choices
below remain for the approver.

**Q1 — the primary persona:**
- **(A) Morgan is primary.** `04_personas.md` opens with a short "Primary persona" note naming Morgan
  and why; Morgan's profile adds "a team that may consist mostly of AI agents directed by one
  person". The brief's Target Users lists Morgan first.
- **(B) Alex stays primary** (the v0.1 target), and Morgan's profile gains the agents-as-team line.
- **(C) no primary persona.**

**Q2 — Casey:**
- **(a) Casey is served through read-only views.** Casey's goals are restated as views over Memory
  and workflow state (decisions and their reasons, pending approvals, release progress), delivered
  by read commands and later by a user interface (`dl-008-cli-first-no-gui` keeps the interface
  out of the MVP). The brief's v0.4 phase says so.
- **(b) Casey unchanged.**

**Q3 — the maintainer receiving AI-generated contributions:**
- **(x) a new Persona 7.** Profile: maintains an open-source project and receives contributions,
  more and more of them AI-generated. Pain: volume outruns review; a contribution arrives as code
  with no record of the intent or the decision behind it. Goals: contributions arrive as intent
  (a `bug`, a `decision-log`) under `dl-020`; every accepted change traces to an approval the
  maintainer made; the project's rules reach the contributor's agent. AI usage level: Review →
  Planning.
- **(y) fold it into Morgan** as a second context.

**Recommendation:** Q1 (A), Q2 (a), Q3 (x).
- **Q1 (A)** matches the only use the project has evidence for, and Morgan's goals ("encode the
  team's rules once", "get notified when a human decision is required") are the ones v0.2 shipped
  and v0.3 extends.
- **Q2 (a)** describes Casey by what Casey needs, which is not a command line.
- **Q3 (x)** gives `dl-020` the persona it serves; folding it into Morgan would hide that the
  contributor and the maintainer are different people with different trust in each other.

## Rationale

- **The personas predate every release.** They were written in the inception workshop, before
  anything was used. Two releases later, the evidence points at one of them, and the decision is
  whether the vision says so.
- **Additive, so cheap.** Marking a primary, restating a persona's goals and adding a seventh change
  three documents. No journey, feature row or user story names a persona that would disappear.
- **Journeys follow later, on their own terms.** A new persona without journeys is a known gap. It
  is recorded here, not closed: journeys for Persona 7 are a v0.3 `release-planning` input, next to
  `dl-020`'s contribution flow.

Alternatives considered:
- **Rewrite all personas from scratch.** Rejected: it breaks 70 journey references and every User
  Story Map file for a benefit the additive change also delivers.
- **Drop Casey.** Rejected: P1.10's audit trail and the v0.4 success criteria are written for Casey.

## Actions

1. **Ratify, choosing Q1–Q3.** Owner: approver, before v0.3's scope is fixed at `release-planning`.
   The choice goes in the approve commit's `Reason:`.
2. **Edit `docs/01_vision/04_personas.md`** (primary note, Morgan's profile, Casey's goals,
   Persona 7) and **`docs/01_vision/01_product-brief.md`** (Target Users, Go-to-Market phases); bump
   both versions and dates (`doc-versioning`). Update `docs/01_vision/00_index.md` where it indexes
   either file's sections.
3. **`README.md`'s persona list** follows through the `user-docs` release gate's `align-user-docs`
   phase (`dl-013-documentation-process-gate`), not in this change.
4. **Journeys for Persona 7** are an input to v0.3 `release-planning`; tasks, if any, are derived by
   `build-backlog`, not created here.

**Note (2026-10-07, `dl-162`).** Q2 (a) is read as "Casey's *own* goals are views": the goals this decision restated
stay read-only views over Memory and workflow state, but they do not forbid Casey from changing state. Approval
follows the role, not the persona (REQ-SYS-08): when the DNA assigns Casey the `approver` role, or names Casey for
an approval, Casey approves and rejects through the same verbs (`dl-162`, option (B), ratified 2026-10-07).
`docs/01_vision/04_personas.md` and `01_product-brief.md` say so since `task-273`.

## Relations

- **Origin:** `retro-v0.2`, the persona disposition (2026-09-28).
- **Amends, on ratification:** `docs/01_vision/04_personas.md`, `docs/01_vision/01_product-brief.md`,
  `docs/01_vision/00_index.md`.
- **Related:** `dl-112-positioning-as-a-governance-layer`, the other vision edit filed by this
  retrospective; `dl-020-contribution-model`, the flow Persona 7 is on the receiving end of;
  `dl-008-cli-first-no-gui`, the user interface Casey's views would eventually use;
  `dl-125-approving-documents-that-are-not-memory-elements`.
- **Read through:** `dl-162`, which rules how Q2 (a) applies to approvals (note above).

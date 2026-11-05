---
id: dl-140-wingfoil-is-presented-as-the-governance-record-that-works-alongside-spec-driven-tools-aimed-first-at-teams-led-by-a-tech-lead-under-one-intent-tagline-the-determinism-index-is-an-objective-and-a-method-not-a-result
type: decision-log
title: "WingFoil is presented as the governance record that works alongside spec-driven tools, aimed first at teams led by a tech lead, under one tagline; the Determinism Index is an objective and a method, not a result"
status: in-discussion
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: "v0.4"            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["positioning","go-to-market","docs"]
---

## Context

**The product already positions itself as a governance layer.** `dl-112` (`ready`, v0.3) rewrote
the brief's *Key Differentiators*: WingFoil records who decided what, under which rules, in which
state, and works alongside spec-driven tools and coding agents
(`docs/01_vision/01_product-brief.md`, *Key Differentiators*, *Works with*). Three questions remain
that `dl-112` does not settle: what the release is presented *on*, which persona comes first, and
which words carry the message.

**The neighbouring tools now have workflows, but not records of approval.** Read 2026-10-01/02:
- Spec Kit added a workflow engine in 0.7.0 (2026-04-14, "Add workflow engine with catalog
  system", <https://github.com/github/spec-kit/blob/main/CHANGELOG.md>). Its gate step stores only
  the choice ("The user's choice is stored in ``output.choice``.",
  `src/specify_cli/workflows/step/gate/__init__.py`): its outputs carry no user identity and no
  reason.
- OpenSpec (`@fission-ai/openspec`, 2,317,591 npm downloads from 2026-09-01 to 2026-09-30,
  `api.npmjs.org/downloads/point/last-month/@fission-ai/openspec`) tracks an artifact's status by
  file existence: its own skills say "`status` is file-existence only"
  (`skills/openspec-propose/SKILL.md`), and its customization guide advises enforcing content gates
  "with your own CI or hook" (`docs/customization.md`), <https://github.com/Fission-AI/OpenSpec>.
- So a guided workflow is necessary in v0.3 but does not set WingFoil apart. What no neighbour
  records is: transitions validated against a state machine declared per element type; approvals
  with identity and reason in the git commit; approval of plans and decisions as recorded
  transitions.

**Agents now fill the approval slot.** Read 2026-10-10, re-read 2026-10-21:
- GitHub, 2026-09-01: Copilot code review "can submit an approval that counts toward the
  repository's required-approvals rule". It is a public preview, off by default, enabled by
  admins per enterprise, organization or repository and per file path, and dismissed on new
  commits. Every Copilot review also carries an "approval assessment" in its overview comment,
  which "alone does not count toward merge requirements": the assessment stays a review comment on
  the forge, not part of the repository's history,
  <https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests/>.
- Claude Code: from v2.1.283 auto mode is "the built-in starting permission mode for interactive
  terminal and VS Code sessions", and in it a classifier "reviews actions instead of you",
  <https://code.claude.com/docs/en/permission-modes>.

An approval, by itself, no longer tells a team that a person looked and why.

**What WingFoil's approval proves today.** `memory approve` takes the approver from the live git
identity, `GIT_AUTHOR_EMAIL` first, then `author.email`, then `user.email`
(`src/core/git-identity.ts`), and checks that this email holds the `approver` role in the committed
`dna.yaml` (`src/core/approval-authority.ts`). The commit records `Approver: Name <email> (role)`
and `Reason:`. It is a rule enforced on identities, not authentication: it cannot tell a person
from an agent running under that person's identity (`adr-006`: "no cryptographic identity proof"),
and the `code-review` directive says whether a human was present "cannot be checked by machine
until signed approvals" (`dl-103` §2 (iii)). Read 2026-11-04 at `16c28e9ce`.

**Demand for that record is visible.**
- Thoughtworks Technology Radar vol. 34 (April 2026) puts "Curated shared instructions for software
  teams" in **Adopt**: <https://www.thoughtworks.com/radar/techniques>.
- Stack Overflow, 2026-05-27: "Most (60%) of survey respondents block agents from making
  unapproved system changes",
  <https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work/>.
- GitLab AI Accountability Report (Harris Poll, 1,528 respondents), 2026-06-23: 91% of
  organizations use at least two AI coding tools, and 91% are likely to invest in AI code governance
  tools within 12 months,
  <https://about.gitlab.com/press/releases/2026-06-23-gitlab-research-reveals-organizations-are-generating-ai-code-faster-than-they-can-control-it/>.
  These two figures were checked against the release's published summary, not the full report.

Those readers are teams with someone accountable for the rules, which is Morgan, the Tech Lead
(`docs/01_vision/01_product-brief.md`, *Target Users*). The README's *Who It's For* lists Alex
first and Morgan fourth (`grep -n "^\*\*" README.md` between `## Who It's For` and the next
heading).

**The project uses three descriptions on eight surfaces.** Read 2026-11-04 at `16c28e9ce`
(`git grep -n -E "harness|intent layer|record of intent" -- README.md llms.txt package.json
server.json docs/site.yaml docs/01_vision/`) and with `gh repo view wingfoil/wingfoil --json
description`:
- "A structured harness for AI-assisted software development, built to make it deterministic":
  `README.md` line 13, `llms.txt` line 3 and `docs/site.yaml` `summary` (both add ", a goal it
  measures: …"); the vision statement in `docs/01_vision/01_product-brief.md` and
  `docs/01_vision/02_product-vision.md` (line 13) says "an open-source harness for AI-assisted
  software development that makes the process deterministic".
- "WingFoil — the repo-native intent layer for AI-native software engineering": `package.json` and
  `server.json` `description`; the MCP Registry lists `io.github.wingfoil/wingfoil` with this line
  since 0.3.0 (`bug-173`, closed), so it is the line most directory readers meet first.
- "The repo-native record of intent and approvals for AI-assisted engineering — validated,
  attributable, readable by any agent. CLI + MCP.": the GitHub description (`svc-004`), which took
  this decision-log's first working example before ratification; the organization profile repeats
  it as its tagline.
The social-preview banners (`docs/assets/`) carry the old line too (`KR-UD-16`).

Every candidate label is taken:
- "harness" is crowded by execution and evaluation tools; Trellis describes itself as "The best agent
  harness." (<https://github.com/mindfold-ai/Trellis>, About);
- "governance layer" is Bernstein's own tagline, "the open-source governance layer for AI agents"
  (<https://github.com/sipyourdrink-ltd/bernstein>, README);
- "intent" is now crowded in AI coding, partly by orchestration: Augment's *Intent*, "a workspace
  for agent orchestration" with a plan-approval step (public beta since 2026-02-10,
  <https://www.augmentcode.com/blog>, <https://intentapp.dev>); TanStack Intent, a CLI shipping
  Agent Skills with npm packages (`@tanstack/intent`, 130,403 downloads in the week 2026-10-16..22);
  "intent layer" as the name of a hierarchical-AGENTS.md technique
  (<https://intent-systems.com/learn/intent-layer>, <https://railly.dev/blog/intent-layer>) and the
  GitHub description of small tools ("The intent layer for coding agents") (read 2026-10-26).

**The determinism claim is still unmeasured.** `dl-131` (`ready`) makes the Determinism Index
composite and says outcome equivalence "is reported, never promised"; `dl-089`'s first value comes
after a release-health run. The README still opens with "deterministic" (line 13) and states that
WingFoil "is built to make the development process **deterministic**" (line 233).

**What 0.3.2 does and does not do.** It keeps rules, roles, workflows and the Memory in git, tells
each person and agent the next step (`workflow next`), starts the agent the user runs with the step's
context and records the run (`agent execute`, spec-016); it executes no step on its own (CHANGELOG
§ 0.3.0). A wording that says WingFoil runs agents, or that an agent cannot approve, claims more
than it does.

**git knows files; WingFoil knows elements.** Read 2026-11-05 at `16c28e9ce`, on `patch-v0.3.1`:
`git log --follow --diff-filter=A --format='%h %ad' -- docs/04_memory/planning/rl-v1/patch-v0.3.1.md`
prints `3431dbe9f 2026-07-03`, the commit that added the Memory templates (`git show --stat 3431dbe9f`:
"Memory schema, state machines & templates"); `npm run -s wingfoil -- memory history patch-v0.3.1`
starts at `371330356 2026-10-21`, operation `add`. `--follow` also follows copies, and every element
starts as a copy of its type's template (`git log --follow --name-status` shows the `C084` edge from
`.wingfoil/memory/templates/release.md`), so git's heuristic reaches the template's history.
`memory history` reads the element's own record and cuts the walk at the copy edge
(`findElementCreationSha` and `dropPreCreationAncestry` in `src/memory/history.ts`,
`test/memory/history-scaffold-copy.test.ts`; `bug-077`, fixed by `task-089`). Limits: `--follow` is a
documented heuristic, not a git defect; `memory history` still walks with it, following renames as git
pairs them, and cuts at the newest copy edge. Whether it holds when many similar files move together,
or when an element is itself copied into another, has not been verified.

Raised by the approver on 2026-10-02 as the outcome of a market analysis. Inputs given privately to
the approver on 2026-10-21 (hold v0.4 planning for a positioning review; the supplement on agents
filling the approval slot), 2026-10-24 (the organization profile's tagline held until the review),
2026-10-26 (a positioning proposal: one tagline, a short form, a how-it-works line, the vision
statement), 2026-10-27 (aligning every public description in one change, with wording constraints),
2026-11-02 (when the review runs and whether the ratification is announced), 2026-11-03 (the
surfaces Action 2 missed; an addendum to the 2026-10-26 proposal after checking what 0.3.0–0.3.2
enforce on approvals) and 2026-11-04 (a second addendum: principles, a summary line, a working
model). The review is a precondition of v0.4's `define-scope` (`retro-v0.3` § Actions; `retrospective-rel-v0.3-plan` D8).

## Decision

**D1 — what WingFoil is presented on.** WingFoil is the governance record that works *with*
spec-driven tools (Spec Kit, OpenSpec, BMAD and similar) and coding agents, not an alternative to
their flow. Releases from v0.3 on lead with what no neighbour has:
- transitions validated against state machines declared per element type;
- approvals carrying identity and reason in the git commit;
- recorded approval of plans and decisions.

The v0.3 guided workflow is presented as necessary, not as the differentiator.

**D2 — who it is for.** The primary target is **Morgan, the Tech Lead**, leading a team. Alex, the
solo developer, is the acquisition channel, reached through light templates (`dl-138`) and through
integrations with spec-driven tools. The README's *Who It's For* is reordered to put Morgan first.

**D5 — the message.**
- **One wording on every surface**, in three levels: a **tagline**, a **short form** for the
  surfaces with little room (`package.json`, `server.json` at 100 characters at most, the GitHub
  description), and a **how-it-works line** that follows the tagline wherever there is room (README,
  `llms.txt`, `docs/site.yaml`, the organization profile): alone, "sets the rules" reads as a
  rules-file generator. The how-it-works line names the approval before the agent.
- **Words left out:** "harness", "governance layer" (prose may still describe the role, as `dl-112`
  does) and "intent"; nothing that reads as WingFoil running agents or executing steps.
- **Lead with where the record lives:** the project's own git history, no server, no database.
- **The message contrasts *an approval* with *a record*:** WingFoil writes who approved, in which
  role, and why, into the git commit, against a declared state machine; whether the forge or the
  agent also approved is a separate fact.
- **Claims follow the mechanism.** Today: "every approval with a name and a reason".
  "human-approved", or any claim that an agent cannot approve, returns only when a release binds
  approvals to an identity an agent cannot use (the approval-binding decision-log of v0.4).
- **Provenance is per element.** Where a surface speaks of history, it says what WingFoil reads: each
  element's own record (when it was created, by which operation, who approved it and why), not git's
  file heuristics. It never says git is wrong, and claims only what the Context's limits allow.
- The **Determinism Index** is presented as an objective and a method, not as a result, until the
  cross-agent metric exists. Its operational definition (`dl-131`) is published as a
  differentiator, because no neighbour measures reproducibility.
- **The final wording** (approver, at ratification):
  - tagline: "The tool that sets the rules for AI-assisted projects: what to do, how, who does it and
    with which agents — in git, every approval with a name and a reason."
  - short form (90 characters): "Sets the rules for AI-assisted projects — in git, every approval
    with a name and a reason."
  - how-it-works line: "WingFoil keeps the project's rules, roles and workflows in its git history —
    no server, no database. Approvals stay with the approver and are written into that history: one
    command, a name, a reason. WingFoil tells each person and each agent the next step, starts the
    agent you use with the right context and records every run."
  - a third level, where there is room (README *How it works*, the workflow documentation):
    - principles: *Ephemeral agents, persistent memory* — roles stay, runs come and go; each run
      starts from the project's Memory, and what matters is written back to it. *Fixed steps,
      creative content* — workflows fix the steps, who takes each one and who approves; people and
      agents fill them with their work. *Agents execute, the approver decides* — approval belongs to
      the approver role and is written into the project's history with a name and a reason;
    - summary line: "Continuity lives in the project's memory, not in the agent." It answers the
      README's own problem statement (decisions made in one session do not carry forward to the
      next) and sets WingFoil apart from agent-memory products, which keep continuity inside the
      agent;
    - working model: Define (DNA, workflows, roles, directives, in git) → Create (every piece of
      work becomes a Memory element) → Run (a person or the agent you use does the step; WingFoil
      starts the agent with the step's context and records the run) → Approve (the approver, with a
      name and a reason) → Remember (everything stays in the Memory, ready for the next step and
      the next agent);
    - the vision statement's *Unlike* clause adds: "and unlike agents that keep their own memory,
      it keeps the project's continuity in its Memory".
  - "projects", not "software projects": the tagline names no domain.

## Rationale

- **Lead with the record nobody else keeps.** Workflows and gates are converging across tools; a
  gate that stores a bare choice is not an audit trail. Identity, reason and a declared machine are
  what WingFoil already ships (`memory approve`/`reject`, `memory history`).
- **Approval is becoming something agents supply; the record is not.** Two of the largest coding
  tools now let an agent approve; neither writes who stood behind the approval, in which role and
  why, into the repository's history. That record is WingFoil's.
- **Morgan carries the need, Alex carries the reach.** Governance is bought by whoever answers for
  the rules; a solo developer adopts what is light and plugs into the tool already in use.
- **One message, in words nobody else owns.** Three descriptions dilute the brand; "harness",
  "governance layer" and "intent" each point to other products.
- **Claim only what is measured, and only what is enforced.** It is the same rule `dl-112` and
  `dl-131` set, applied to the public surfaces: each mechanism earns one claim and no more.

## Consequences

Input for release-planning v0.4 (D3, D6).

**D3 — roadmap order for v0.4 → v1.0:**
1. `dl-143`, one generator for every agent's formats;
2. `dl-142`, approval of agent plans;
3. publication on the MCP Registry: done with 0.3.0 (`bug-173`, closed);
4. `dl-144`, importers;
5. `dl-138`, remote templates;
6. `dl-145`, Integrations section of the user guide.

**D6 — first-wave channels, all free:**
- the MCP Registry and the directories that follow it (Glama, Smithery, mcp.so, Docker MCP
  Catalog); the Registry is live since 0.3.0;
- the awesome-claude-code and awesome-mcp-servers lists;
- answers in the Spec Kit, OpenSpec, BMAD and GSD issues that ask for states and gates, once a
  coexistence guide exists (`dl-145`);
- the Claude Discord, with a demo of an approval carrying identity and reason;
- Italian channels: the Risorse Artificiali and Gitbar podcasts, Codemotion Milano Tech Lead Summit
  (its 2026-10-28 edition passed before ratification: the next one);
- Show HN only with a strong demo.

## Actions

1. **Ratify** at `in-discussion → ready`, with the final wording of D5. Owner: approver.
2. **Align the public surfaces** to D2/D5, in one task, once ratified. Owner: `align-user-docs`
   (`dl-013`). Surfaces:
   - `README.md`: tagline and opening (line 13), *Who It's For* order, the determinism wording
     (line 233);
   - `llms.txt` (line 3) and `docs/site.yaml` `summary`;
   - `package.json` and `server.json` `description`: they reach npm and the MCP Registry only with
     the next published version;
   - the vision statement in `docs/01_vision/01_product-brief.md` and
     `docs/01_vision/02_product-vision.md`, through `vision-change` (`dl-132`);
   - the GitHub description: external state, changed with `svc-004`, whose `verify` reads it;
   - the social-preview banners in `docs/assets/` (`KR-UD-16`), regenerated as its `README.md`
     states, and the uploaded preview recorded by `svc-004`;
   - D5's third level: the README *How it works* section (principles, summary line, working model),
     the workflow documentation (`docs/user-guide.md`) and the vision statement's *Unlike* clause
     (with the vision statement, through `vision-change`);
   - a runnable example, `docs/examples/07-element-history/run.sh`: `init --template Scrum`, `memory add`,
     then `git log --follow --diff-filter=A` against `memory history` on the new element, ending `OK`,
     covered by the wave-check `docs.examples.passing` and Q11, and added to the e2e-smoke journey as
     `06-workflow-approval` is; a test of the unverified limits in the Context, if the wording relies
     on them.
3. **Release-planning v0.4** takes D3 as the order and D6 as the channel list.
4. **Announce the ratification.** When this decision-log reaches `ready`, one notice with the same
   content goes to the other WingFoil repositories (Templates, UI, Benchmark) and to the approver,
   who owns the organization profile: this decision-log's id and commit, the final wording per
   level, and when the npm and MCP Registry lines change. Nothing is asked of the other
   repositories; "harness" is no longer WingFoil's own label, and a repository that uses it for its
   own category decides whether to keep it.

## Relations

- **Refines:** `dl-112` (positioning as a governance layer), `dl-131` (Determinism Index scope).
- **Related:** `dl-138`, `dl-142`, `dl-143`, `dl-144`, `dl-145`, `bug-173`, `adr-006`, `dl-103`,
  `dl-132`, `svc-004`, `retro-v0.3`.

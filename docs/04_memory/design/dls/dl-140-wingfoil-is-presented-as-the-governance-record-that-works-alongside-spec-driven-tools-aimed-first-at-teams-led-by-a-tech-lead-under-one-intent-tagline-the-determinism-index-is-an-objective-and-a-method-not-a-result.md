---
id: dl-140-wingfoil-is-presented-as-the-governance-record-that-works-alongside-spec-driven-tools-aimed-first-at-teams-led-by-a-tech-lead-under-one-intent-tagline-the-determinism-index-is-an-objective-and-a-method-not-a-result
type: decision-log
title: "WingFoil is presented as the governance record that works alongside spec-driven tools, aimed first at teams led by a tech lead, under one intent tagline; the Determinism Index is an objective and a method, not a result"
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

**The project uses three taglines.**
- README: "A structured harness for deterministic AI-assisted software development." (`README.md`
  line 5).
- npm: "WingFoil — the repo-native intent layer for AI-native software engineering"
  (`package.json` `description`).
- GitHub: "The repo-native intent layer for AI-native software engineering — keeps intent and
  engineering state in git, turns them into workflows, verifies what agents deliver. CLI + MCP."
  (`gh repo view wingfoil/wingfoil --json description`).

Both other candidate labels are taken:
- "harness" is crowded by execution and evaluation tools; Trellis describes itself as "The best agent
  harness." (<https://github.com/mindfold-ai/Trellis>, About);
- "governance layer" is Bernstein's own tagline, "the open-source governance layer for AI agents"
  (<https://github.com/sipyourdrink-ltd/bernstein>, README).

**The determinism claim is still unmeasured.** `dl-131` (`ready`) makes the Determinism Index
composite and says outcome equivalence "is reported, never promised"; `dl-089`'s first value comes
after a release-health run. The README still opens with "deterministic" (line 5) and states that
WingFoil "makes the development process **deterministic**" (line 205).

Raised by the approver on 2026-10-02 as the outcome of a market analysis.

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
- "harness" leaves the README tagline.
- "governance layer" is not used as a tagline (prose may still describe the role, as `dl-112`
  does).
- The three taglines converge on the "intent" line npm and GitHub already use, made concrete. A
  working example, not binding: "the repo-native record of intent and approvals for AI-assisted
  engineering — validated, attributable, readable by any agent". **The final wording is the
  approver's**, given at ratification.
- The **Determinism Index** is presented as an objective and a method, not as a result, until the
  cross-agent metric exists. Its operational definition (`dl-131`) is published as a
  differentiator, because no neighbour measures reproducibility.

## Rationale

- **Lead with the record nobody else keeps.** Workflows and gates are converging across tools; a
  gate that stores a bare choice is not an audit trail. Identity, reason and a declared machine are
  what WingFoil already ships (`memory approve`/`reject`, `memory history`).
- **Morgan carries the need, Alex carries the reach.** Governance is bought by whoever answers for
  the rules; a solo developer adopts what is light and plugs into the tool already in use.
- **One message, in words nobody else owns.** Three taglines dilute the brand; "harness" and
  "governance layer" each point to another product.
- **Claim only what is measured.** It is the same rule `dl-112` and `dl-131` set, applied to the
  public surfaces.

## Consequences

Input for release-planning v0.4 (D3, D6).

**D3 — roadmap order for v0.4 → v1.0:**
1. `dl-143`, one generator for every agent's formats;
2. `dl-142`, approval of agent plans;
3. publication on the MCP Registry (`bug-173`, `planned`, v0.3): on 2026-10-02
   `https://registry.modelcontextprotocol.io/v0/servers?search=wingfoil` returns
   `{"servers":[],"metadata":{"count":0}}`;
4. `dl-144`, importers;
5. `dl-138`, remote templates;
6. `dl-145`, Integrations section of the user guide.

**D6 — first-wave channels, all free:**
- the MCP Registry and the directories that follow it (Glama, Smithery, mcp.so, Docker MCP
  Catalog), after `bug-173`;
- the awesome-claude-code and awesome-mcp-servers lists, after v0.3;
- answers in the Spec Kit, OpenSpec, BMAD and GSD issues that ask for states and gates, once a
  coexistence guide exists (`dl-145`);
- the Claude Discord, with a demo of an approval carrying identity and reason;
- Italian channels: the Risorse Artificiali and Gitbar podcasts, Codemotion Milano Tech Lead Summit
  (2026-10-28);
- Show HN only with a strong demo.

## Actions

1. **Ratify** at `in-discussion → ready`, with the final tagline. Owner: approver.
2. **Align the public surfaces** to D2/D5: README tagline, *Who It's For* order and the
   determinism wording (lines 5, 205, 340); `package.json` `description`; the GitHub description.
   Owner: `align-user-docs` (`dl-013`), as a task once ratified. The GitHub description is
   external state: change it with `svc-004-github-repository-settings`, whose `verify` reads it.
3. **Release-planning v0.4** takes D3 as the order and D6 as the channel list.

## Relations

- **Refines:** `dl-112` (positioning as a governance layer), `dl-131` (Determinism Index scope).
- **Related:** `dl-138`, `dl-142`, `dl-143`, `dl-144`, `dl-145`, `bug-173`.

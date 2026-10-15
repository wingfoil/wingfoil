---
id: svc-004-github-repository-settings
type: service
title: "GitHub repository settings"
status: active
provider: "GitHub"
kind: "setting"
owner_role: "approver"
verify: "gh api repos/wingfoil/wingfoil --jq '{description,homepage,topics,has_discussions,has_issues,has_wiki,has_projects}'"
url: "https://github.com/wingfoil/wingfoil"
account: "wingfoil/wingfoil"
renews: ""
repo_refs: []
decision: "dl-091-package-name-and-mcp-namespace"
set_up_in: "v0.2.2"
tmpl_version: 260929
---

## Purpose

How the repository presents itself to people who find it: its description, homepage, topics and
enabled features. The approver ruled on 2026-09-29 that these settings are **not** declared as code in
the project (no `.github/repository.yml`), so this element is the only record of them
(`release-planning-rel-v0.2.2-plan` §A, §B.3).

## Configuration

Applied by hand in the web interface by the approver, 2026-09-29 (§B.3):

- **description:** "The repo-native intent layer for AI-native software engineering — keeps intent and
  engineering state in git, turns them into workflows, verifies what agents deliver. CLI + MCP."
- **homepage:** `https://wingfoil.github.io/wingfoil/`, the documentation site (dl-129 Decision 2), set on
  2026-10-15; before it, `https://www.npmjs.com/package/wingfoil`.
- **topics (14):** `ai-agents`, `ai-assisted-development`, `claude-code`, `cli`, `context-engineering`,
  `determinism`, `developer-tools`, `git`, `intent-engineering`, `mcp`, `mcp-server`,
  `model-context-protocol`, `spec-driven-development`, `typescript`.
- **features:** Discussions on, Issues on, Wiki off, Projects off.
- **Discussions categories:** Announcements, Q&A, Ideas, Show and tell (General and Polls deleted) — the
  approver's report (§B.3); the `verify` command does not read them.
- **social preview:** `docs/assets/wingfoil-social-preview-dark.png` at `424f4c93` (1280×640, the
  dark banner), uploaded by the approver on 2026-09-29 (`user-docs-rel-v0.2.2-plan` S7). Until then
  there was none; `dl-128` decides the README's badges and demo, not this image. The light variant
  and both SVG sources sit beside it in `docs/assets/`, and `docs/assets/README.md` regenerates them.

## Verification

`gh api repos/wingfoil/wingfoil --jq '{description,homepage,topics,has_discussions,has_issues,has_wiki,has_projects}'`
→ `homepage` `https://www.npmjs.com/package/wingfoil`, the 14 topics above, `has_discussions: true`,
`has_issues: true`, `has_wiki: false`, `has_projects: false`, and the description above verbatim
(run read-only by `task-124` against `robypomper/wingfoil`, and again by `task-116` against
`wingfoil/wingfoil` after the transfer, 2026-09-29: every value carried over). The Discussions
categories were also read after the transfer through the GraphQL API:
`gh api graphql -f query='{repository(owner:"wingfoil",name:"wingfoil"){discussionCategories(first:10){nodes{name}}}}'`
→ Announcements, Ideas, Q&A, Show and tell. The visibility session read every value
above through the GitHub MCP on 2026-09-29 and all matched (§B.3). The social preview is read with
`gh api graphql -f query='{repository(owner:"wingfoil",name:"wingfoil"){usesCustomOpenGraphImage openGraphImageUrl}}'`
→ `usesCustomOpenGraphImage: true`. The image at `openGraphImageUrl`, downloaded on 2026-09-29, is
identical to `docs/assets/wingfoil-social-preview-dark.png`
(`compare -metric RMSE <downloaded> docs/assets/wingfoil-social-preview-dark.png null:` → `0 (0)`).
On 2026-10-15, after dl-129 Decision 2, `gh api repos/wingfoil/wingfoil --jq .homepage` →
`https://wingfoil.github.io/wingfoil/`.

## Management

- **Owner:** the `approver` role.
- **Change:** edit the setting on GitHub, then this element's Configuration in a `docs(self)` commit
  (`dl-088` option 2), so the two never disagree. The topic list and the package `keywords` are
  settled together at `dl-093`'s metadata task (`release-planning-rel-v0.2.2-plan` §D).
- **After the transfer to `wingfoil/wingfoil`:** re-check every value (§C) and update `url`, `account`
  and `verify`.
- **Retire:** `memory deprecate` if the settings move to code or to another element.

---
id: bug-210-docs-agents.md-lists-none-of-the-not-applicable-or-committed-at-head-refusals
type: bug
title: "docs/agents.md lists none of the not-applicable or committed-at-HEAD refusals"
status: triaged
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: ""            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P5.4"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`docs/agents.md` §6 ("Useful `error:` lines and what they mean", around line 115) lists `missing required field on submit` but none of the refusals B4 added: `task-168`'s `not-applicable value on submit|amend: …` (and its rule that a list is a value only on the fields `template.frontmatter.lists` declares), and `task-247`'s transition refusals — document not committed at HEAD (→ `memory add`), document deleted in the working tree (→ `git restore --source=HEAD --staged --worktree -- <path>`), id changed in the working tree, and a committed document that does not parse (`HEAD:<path>`). An agent hitting them has no row to act on.

## Steps to Reproduce

1. `sed -n 113,121p docs/agents.md` → six rows: `illegal transition`, `user not authorized`, `refusing to commit … uncommitted modifications`, `missing required field on submit`, `unknown memory type … not committed`, `E_NOT_AT_GIT_ROOT`. `grep -n "not applicable\|not-applicable\|git restore\|not committed at HEAD\|HEAD:" docs/agents.md` → only line 120 (`unknown memory type`).
2. In a scratch repository (`wingfoil init --template Kanban --no-interactive`, `memory add --type adr --title Demo`):
   - `rm docs/memory/adr/adr-001-demo.md; node dist/cli.js memory submit adr-001-demo` → `error: refusing to submit adr-001-demo: its document 'docs/memory/adr/adr-001-demo.md' is held by HEAD but deleted in the working tree. Restore it (git restore --source=HEAD --staged --worktree -- docs/memory/adr/adr-001-demo.md) and retry.` (exit 1);
   - an uncommitted copy with id `adr-002-new`, then `memory submit adr-002-new` → `error: document not found: adr-002-new — docs/memory/adr/adr-002-new.md is not committed at HEAD, though it carries that id in the working tree. … register a new element with \`memory add\`, then retry.` (exit 1);
   - `title: "n/a — none"`, then `memory submit adr-001-demo` → `error: not-applicable value on submit: title does not accept one (type 'adr' does not list it in template.frontmatter.not_applicable_allowed)` (exit 1).

## Expected Behavior

`docs/agents.md` §6 has a row for each of these refusals with what to do, and its 0.2.2 framing is updated to the release that ships them.

## Actual Behavior

None of the new refusals is documented for agents.

## Notes

- Found by `task-168`'s independent reviewer; the `task-247` refusals were added to the same finding.
- For the v0.3 `user-docs` phase: `docs/agents.md` is in no phase's `produces:`, but `user-docs` aligns it with the approver's confirmation (`user-docs-rel-v0.2.2-plan`). `docs/cli-reference.md` should be checked for the same rows.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b4-review-findings-plan`, from the independent reviews of wave 1
batch B4 (`dev-loop-rel-v0.3-plan`), against `main` at `243f8f05` (B4 merges up to `ea637c43`).

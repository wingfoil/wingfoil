---
id: service-ingest-rel-v0.3-listings-plan
type: plan
title: "Service-ingest — rel-v0.3 listings"
status: active
version: "1.0"
workflow: "service-ingest"
phase: "rel-v0.3-listings"
element: "minor-v0.3"
release: "v0.3"
tmpl_version: 260703
---

## Context

Three pieces of external state were set up by the approver on 2026-09-29, after `dl-088`'s `service`
type existed but while v0.2.2 was in release. The approver ruled that they are registered during v0.3's
planning (`release-planning-rel-v0.3-plan` R8, step 1). This plan runs `service-ingest`
(`.wingfoil/workflows/custom/service-ingest.yaml` v1.0) once per service, started from
`release-planning` step 1, so each element carries `release: "v0.2"`: the version whose visibility the
listings serve, as the approver's field values state. `decision` is `dl-130` for all three.

**Preconditions.** The pinned build is `wingfoil 0.2.2` (`npm run -s wingfoil -- --version` → `0.2.2`,
`release-planning-rel-v0.3-plan` step 0). Next free service id across every ref (`dl-101`): `svc-010`.

**Facts read by the agent before capture (2026-09-29).** The approver's `verify` at the gate is what
counts; these readings only make the captured text checkable.
- GitHub Release: `gh release view v0.2.1 --repo wingfoil/wingfoil --json tagName,name,publishedAt,url,isDraft,isPrerelease`
  → name "v0.2.1 — Project Directives", published 2026-09-29T19:23:48Z, not draft, not prerelease;
  `gh release list --repo wingfoil/wingfoil` → one Release, `v0.2.1`, marked Latest. The `verify` the
  approver proposed asked for `isLatest`, which the installed `gh` rejects ("Unknown JSON field"); the
  element's `verify` uses the fields `gh` supports plus `gh release list` for *Latest*.
- mcp.so: `gh api repos/chatmcp/mcpso/issues/comments/5898281792 --jq .body` → the comment by
  `robypomper`, created 2026-09-29T20:32:59Z, describing read-only Resources and one Prompt per role, and
  the client configuration `npx -y wingfoil mcp`. It names no Tool, which matches the server:
  `tools/list` answers `-32601` (`bug-151`, `triaged`, v0.3).
- AlternativeTo: not read by the agent. alternativeto.net has no public API; its `verify` is a manual
  check by the approver.

## Phases / Steps

Each step is one scoped commit made by the pinned build, checked afterwards against its declared
effect (one file, `wf(service): {verb} {id}`, exit 0).

1. **capture** (developer, no gate), per service: `memory add --type service --title …` →
   draft; fill frontmatter and body from the approver's field values and the facts above, public
   identifiers only; run the `spec-007` secret scan on the file; `memory submit` → `pending`.
   - `svc-010` — GitHub Release v0.2.1 (`kind: listing`, provider GitHub).
   - `svc-011` — AlternativeTo listing WingFoil (`kind: listing`, provider alternativeto.net). The
     account is the approver's personal Google sign-in; the body records that ownership must move if the
     approver role changes hands.
   - `svc-012` — mcp.so listing WingFoil (`kind: listing`, provider mcp.so). `url` is the issue
     comment until mcp.so publishes the listing.
2. **approve** (approver, ⛔), per service: the approver runs `verify`; `memory approve --reason …`
   `[pending → active]`. **`svc-012` is not approved until the listing is published on mcp.so**: it
   stays `pending`, and its `url` changes to the listing's URL in the same commit series before the
   approval.

## Handoff

- **Approver:** each `verify` and each approval; the moment `svc-012` goes live.
- **Agent:** capture of the three elements, the secret scan, commit hygiene. It never approves.
- **Open actions outside this plan:** link 2–3 alternatives on AlternativeTo (candidates Claude Code,
  Kiro, Cline, Aider), from the other products' pages; an approver action, not a task. `v0.2.2` is on
  npm but has no GitHub Release yet (`gh release list` above); `dl-130` step 1 creates Releases from
  v0.3 on, and whether v0.2.2 gets one by hand is the approver's call.
- **Completion criteria:** `svc-010` and `svc-011` `active`; `svc-012` `pending` until mcp.so publishes
  the listing, then `active`. The plan goes `active → done` when the last of the three is `active`.
- **2026-10-05 — `svc-013-glama-listing-wingfoil` added** (`add` → `submit` → `approve [pending → active]`, `7e22b6cd`)
  under this plan. It is the Glama listing, claimed through `task-157`'s `glama.json`. The plan's completion
  criteria are unchanged: it closes when `svc-012` (mcp.so) is `active`.

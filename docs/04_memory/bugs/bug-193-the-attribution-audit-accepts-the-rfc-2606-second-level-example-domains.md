---
id: bug-193-the-attribution-audit-accepts-the-rfc-2606-second-level-example-domains
type: bug
title: "The attribution audit accepts the RFC 2606 second-level example domains"
status: triaged
severity: "low"           # REQUIRED — critical | high | medium | low
release-origin: "v0.3"     # optional — release where the bug was FOUND (dl-016), e.g. "v0.1"
release: "v0.4"            # optional — fix/implementation release, stamped by release-planning/build-backlog (dl-016)
feature: "P1.2"            # optional — related feature ID, e.g. "P1.6"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["v0.3"]
---

## Summary

`isValidAttribution` (`task-132`) rejects the reserved top-level domains `.invalid`, `.example`, `.test` and `.localhost`, but accepts `example.com`, `example.net` and `example.org`, which RFC 2606 also reserves.

## Steps to Reproduce

1. `node -e "console.log(require('./dist/memory').isValidAttribution('A', 'a@example.org'))"` (after `npm run build`).

## Expected Behavior

A decision whether second-level reserved domains count as placeholders, and the test fixtures moved accordingly.

## Actual Behavior

`true` (accepted), while `isValidAttribution('A', 'a@x.invalid')` is `false` (re-run on `main` on 2026-10-02). `task-132` moved three audit fixtures to `example.org` precisely because it is accepted, so a rule change has to move them again.

## Notes

- Found by `task-132`'s developer and reviewer; outside `bug-153`'s scope, which named only top-level domains.

## Triage & Execution Notes

Captured on 2026-10-02 by `bug-ingest-rel-v0.3-w1b2-review-findings-plan`, from the independent reviews of wave 1
batch B2 (`dev-loop-rel-v0.3-plan`).

- **Handover added at the W3 B2 ingest (2026-10-07, `bug-ingest-rel-v0.3-w3b2-review-findings-plan`).** Since
  `task-260` (W3 B2, `bug-261`), `dna.yaml`'s `AgentEntry` refuses an agent email through the same rule the audit
  applies (`attributionEmailIssue` in `src/validation/identity.ts`, imported by `src/dna/schema.ts`). Adding the
  RFC 2606 second-level domains to that rule therefore also refuses `example.com`, `example.net` and `example.org`
  agent emails in `dna.yaml`, a user-visible change to a file that loads today. Whoever fixes this updates, on
  `main` at `c485e433`: `test/validation/identity.test.ts` line 14 (`'a@test.example.com'` and `'a@example.org'` are
  asserted *not* reserved); `test/dna/agent-identity-placeholder.test.ts` line 74 (`'agent@test.example.com'` and
  `'bot@example.org'` "keep accepting") and line 88 (the agreement-table row `agent@test.example.com`); the
  `agent@example.org` fixtures of `test/dna/agent-identity.test.ts` (lines 49, 51, 137 and 142 expect it accepted;
  lines 56–60 use it only inside malformed addresses); a Revision note in `spec-002` (the `AgentEntry` email rule,
  last revised by `task-260`); and `docs/user-guide.md` §4.2, whose *Agent commit identity* paragraph lists the
  refused domains. Member emails are not affected: `team.members` has no such rule (`DnaYaml.safeParse` on this build accepts
  a member with `a@b.test`), and the guide's `ada@example.com` examples are member emails.

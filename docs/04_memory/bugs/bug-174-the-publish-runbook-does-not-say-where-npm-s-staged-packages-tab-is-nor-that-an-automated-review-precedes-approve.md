---
id: bug-174-the-publish-runbook-does-not-say-where-npm-s-staged-packages-tab-is-nor-that-an-automated-review-precedes-approve
type: bug
title: "The publish runbook does not say where npm's Staged Packages tab is, nor that an automated review precedes Approve"
status: in-progress
severity: "low"
release-origin: "v0.2.2"
release: "v0.3"
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

The approver runbook in the header of `.github/workflows/publish.yml` (step 6, lines 53–59 at
`0f68abcb`) leaves out two things the first staged publish, `wingfoil@0.2.2` on 2026-09-29, ran
into:
- It sends the approver to "Approve on npmjs.com → Staged Packages" without saying where on
  npmjs.com that tab is. The approver could not find the Approve button at first.
- It does not say that a staged version first sits in an **"automated review"** state, during which
  it cannot be approved.

The `publish` phase description in `.wingfoil/workflows/custom/release-publishing.yaml` (line 31) is
shorter still: "or Approve on npmjs.com", with no tab named.

## Steps to Reproduce

1. Follow `publish.yml`'s runbook step 6 after a tag run's `promote` has staged a version (run
   `36627583940`, stage id `800ec0cc-4f8f-482b-b73c-4f902a927d61`).
2. Look for the Approve button on npmjs.com using only the runbook's wording.

## Expected Behavior

The runbook names:
- where the Staged Packages tab is and who sees it;
- the "automated review" state: that it comes first, that Approve is unavailable during it, and what
  to do while waiting;
- a way to meet "npm ≥ 11.15.0 on the approver's machine" without a global upgrade, e.g.
  `npx -y npm@<version> stage approve <stage-id>`.

## Actual Behavior

The runbook says only "Approve on npmjs.com → Staged Packages" and "These commands need npm ≥ 11.15.0
on the approver's machine" (`grep -n "Staged Packages\|11.15" .github/workflows/publish.yml`).
Neither npm's documentation (docs.npmjs.com/staged-publishing, read 2026-09-29) nor the GitHub
changelog announcing staged publishing says where the tab is, or mentions an automated review. The
approver found the tab by searching, saw the version "in automated review", and approved once that
state had ended. The version went live at `2026-09-29T20:47:50.934Z`.

## Notes

- **Where the tab is (the approver, 2026-09-29):** Staged Packages is reached from the **account
  menu** on npmjs.com, the signed-in user's menu, not from the package page. The fix writes that into
  the runbook.
- The fix changes a comment in a pipeline file and a phase description in a workflow file. No
  behaviour changes.
- **Duplicate search:** `grep -il "staged packages\|automated review\|runbook"
  docs/04_memory/bugs/*.md` → nothing.
- **Related:** `adr-011` (staged publishing), `dl-087`, `task-113` (the runbook's author),
  `release-publishing-rel-v0.2.2-plan` S6, `bug-173` (the other publish finding of this phase).

## Triage & Execution Notes

<!-- Filled at triage. -->

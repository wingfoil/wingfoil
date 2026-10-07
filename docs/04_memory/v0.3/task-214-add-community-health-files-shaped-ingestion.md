---
id: "task-214-add-community-health-files-shaped-ingestion"
type: task
title: "Add the community health files, shaped for ingestion"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "medium"
tags: ["v0.3", "process", "community", "docs"]
ref: "dl-127"
bug: []
depends_on: ["task-199-align-wingfoil-workflows-custom-v0-3-schema-commands"]
tmpl_version: 260703
---

## Description

GitHub recognises no contributing guide, code of conduct, security policy or issue/PR templates. Each file is shaped so a submission can be ingested as a Memory element.

## Acceptance Criteria

- (characterization) `CONTRIBUTING.md` (short pointer to `COLLABORATION.md`, Q1 (a)), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 verbatim, enforcement contact from the approver), `SECURITY.md` (latest minor supported; GitHub private vulnerability reporting).
- (characterization) `.github/ISSUE_TEMPLATE/` bug form with the `bug` template's fields, proposal form shaped on `decision-log-ingest`, `config.yml`; `.github/PULL_REQUEST_TEMPLATE.md` pointing to `COLLABORATION.md` and asking for the implemented element.
- (characterization) `user-docs.yaml` `align-user-docs` `produces:` gains them; version bumped.
- (characterization) post-merge, approver: private vulnerability reporting on, recorded as a `service` (`kind: setting`); `gh api repos/wingfoil/wingfoil/community/profile` reports each file.

## Implementation Notes

- **Size:** S · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-127 (Q1–Q4 (a)).
- **Notes:** Proposal key: D33. the DL's `gh api` paths name `robypomper/wingfoil`; the repository is `wingfoil/wingfoil` since task-116.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes
### design (architect, 2026-10-07)

- **Sources read.** `dl-127` is `ready`, ratified with Q1–Q4 (a) (`git log --follow --format='%h %s%n%b' -- docs/04_memory/design/dls/dl-127-*.md`
  → `74ada70c … approve … [in-discussion → ready]`, `Reason: … Q1 (a), Q2 (a), Q3 (a), Q4 (a)`). `dl-163` is `ready`
  (`3d9b2907`); its S3c says a GitHub issue gets `contributor` plus the issue URL, never `reported_by:`. `dl-020` is
  `ready`. `depends_on: task-199` is `done` (`7b11a306`); its notes leave `user-docs` at 1.3 and count
  `align-user-docs`' `checks.post` prose among the unbound checks, which this task keeps verbatim (it is pinned by
  `test/core/workflow-repository-conformance.test.ts`). No tech-spec is cited, so none to confirm.
- **AC classification (corrected).** AC 1–3 are **red-first**, not characterization: none of the files exists at
  `1ce84a54` (`git ls-tree -r --name-only 1ce84a54 | grep -E 'CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|ISSUE_TEMPLATE|PULL_REQUEST'`
  → empty) and `user-docs.yaml`'s `produces:` lacks them, so a guard written first fails genuinely. The guard is
  `test/docs/community-health.test.ts`; it also keeps the forms in step with the `bug` and `decision-log` templates
  (drift guard, the point of "shaped for ingestion"). AC 4 is the approver's post-merge check: **unasserted** by this
  task (GitHub's view, not the repository's; testing directive T1), listed in the report.
- **Scope decisions** (for the approver, see review): `COLLABORATION.md` joins `produces:` beside the five files
  (`CONTRIBUTING.md` points at it, and `dl-163` S3f gives it to `align-user-docs`); README's Contributing / Questions
  sections and `WORKFLOW.md`'s `align-user-docs` node follow the change (same-class drift). Templates are not
  touched (task-213 is B3's only template writer).

### red

- `ccadc9f3 test(docs): task-214 — failing test: …`: `npx jest test/docs/community-health.test.ts` → **25 / 25 failed**
  (1 suite), every failure an absent file or a missing `produces:` entry.

### green

- `67fc69b9 feat(docs): task-214 — …`: `npx jest test/docs/community-health.test.ts test/docs/workflow-md.test.ts test/core/workflow-repository-conformance.test.ts`
  → 3 suites, **45 / 45 passed**.
  - `CONTRIBUTING.md` (19 lines): pointer to `COLLABORATION.md` and `dl-020`, one line per channel.
  - `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1, enforcement contact `wingfoil.ai@gmail.com` (**proposal**, see review).
  - `SECURITY.md`: `0.2.x` supported (package.json `0.2.2`), private vulnerability reporting
    (`/security/advisories/new`), the bug form's fields asked for, a `bug` element recorded after the fix.
  - `.github/ISSUE_TEMPLATE/bug.yml`: issue title = `title`; `severity` dropdown with the template's four values;
    `release-origin` input; one textarea per `bug` body section (Summary, Steps to Reproduce, Expected Behavior,
    Actual Behavior, Notes; Notes optional). `proposal.yml`: `context`, `options`, `preferred`, all required.
    Both intros say the element gets `contributor` and the issue URL. `config.yml`: blank issues off; Q&A
    Discussions and the security advisory link.
  - `.github/PULL_REQUEST_TEMPLATE.md`: points at `COLLABORATION.md`, then `Implements: <element>` (traceability).
  - `user-docs.yaml` 1.3 → **1.4** (header reason); `align-user-docs` `produces:` + 6 paths; description names the files.
  - `COLLABORATION.md` 1.2 → **1.3**, 2026-10-07: *How to contribute* names the two forms and their mapping;
    *Credit* states `contributor:` = GitHub handle, issue URL in `credit:`, and no `reported_by:` for an issue (`dl-163`).

### refactor (gates, 2026-10-07, on 67fc69b9; load average 97.73 at start, `uptime`)

- `npm test`: **301 suites, 5739 / 5739 passed** (832 s; includes `npm run typecheck`).
- `npm run lint`: exit 0. `npm run docs:api`: exit 0.
- `npx tsc --noEmit -p tsconfig.json`: exit 0. `npx tsc -p tsconfig.build.json --noEmit`: exit 0.
- `npm run test:coverage`: not run — no file under `src/` changed (`git diff 1ce84a54 --stat -- src` → empty), so
  coverage cannot move (precedent: task-273).
- Dev build loads the changed workflow: `node dist/cli.js workflow list --format json` → exit 0, `user-docs.yaml` listed.
- `node scripts/check-governance.cjs --base 1ce84a54` → 1 `wf()` commit checked, 0 findings, exit 0.

### review (self, reviewer)

- AC 1 met: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`; tests "AC 1 — …" (3).
- AC 2 met: bug form, proposal form, `config.yml`, PR template; tests "AC 2 — …" (8).
- AC 3 met: `produces:` + version 1.4; tests "AC 3 — …" (7).
- AC 4 **unasserted here**: post-merge, the approver switches on private vulnerability reporting, records it as a
  `service` (`kind: setting`, `verify: gh api repos/wingfoil/wingfoil/private-vulnerability-reporting`), and runs
  `gh api repos/wingfoil/wingfoil/community/profile` (repository `wingfoil/wingfoil` since task-116, not
  `robypomper/wingfoil` as `dl-127` writes).
- **Covenant text.** Written from the published 2.1 text; no copy was available offline to diff against. Check:
  `diff <(curl -s https://raw.githubusercontent.com/EthicalSource/contributor_covenant/release/content/version/2/1/code_of_conduct.md) CODE_OF_CONDUCT.md`
  (only the contact line should differ); `community/profile`'s `code_of_conduct.key` should read `contributor_covenant`.
- **Decisions for the approver:** (1) the enforcement contact `wingfoil.ai@gmail.com` (the address an earlier
  WingFoil prototype's code of conduct used; the AC leaves the contact to the approver); (2) blank issues off;
  (3) the issue URL goes in `credit:`; (4) `COLLABORATION.md` in `produces:`; (5) the guard pins SECURITY.md's
  supported row to `package.json`'s minor, so the commit that bumps the version to 0.3.0 must update SECURITY.md too.
- No pending amendments: no Memory element other than this task file is edited.

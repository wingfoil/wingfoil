---
id: "dl-103-governance-enforced-outside-the-agent"
type: decision-log
title: "Governance rules on `wf()` commits are checked by nobody: a CI check outside the agent enforces them, and an approval policy says what an unattended run may and may not approve"
status: ready
context: "retrospective"
release: "v0.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`), from the finding that the repository's governance
is not enforceable. The approver ruled on 2026-09-28 that CI or hook enforcement on `wf()` commits
is the enforcement point of the claim-evidence lesson (`dl-097`) and the highest-leverage item of
the retrospective. The approver also ruled that an approval policy for unattended runs belongs here,
because giving a process the approver's identity would defeat the check. This decision is taken
together with `dl-094-one-author-identity-per-act`.

### Nothing checks a commit before it lands

- **The only CI workflow runs on version tags.** `git ls-tree --name-only a20b346c .github/workflows/`
  lists one file, `publish.yml`. Its trigger is `on: push: tags: ['v[0-9]+.[0-9]+.[0-9]+']`. No hook
  directory is tracked: `git ls-files -- .githooks .husky` prints nothing, while
  `git ls-files -- .github` prints `publish.yml`. A commit on `main` is checked by whoever wrote it,
  and by nobody else.
- **The audit functions exist and no command runs them.** `src/memory/audit.ts` exports
  `verifyTransitionConsistency`, `auditAttribution` and `isValidAttribution`.
  `git grep -n verifyTransitionConsistency a20b346c -- src/` finds its definition, a doc comment and
  the re-export in `src/memory/index.ts`, and no call site. The same holds for `auditAttribution`.
- **On this repository every Memory operation is hand-written** (`bug-075`), so the checks the verbs
  make, such as `dl-067`'s refusal of a blank reason, never run here.

### What went unchecked in v0.2

Measured over the v0.2 era, `20e8271..a20b346c`:

- **A blank `Reason:` reached `main`.** `1ce90aea` (`wf(task): approve task-071-… [in-review → approved]`,
  2026-09-21) has an empty reason. It was repaired by a follow-up commit (`47f8e3c6`), not refused.
- **The transition bracket drifted.** Counting the arrows inside `[…]` brackets of `wf()` subjects,
  `git log --format=%s 20e8271..a20b346c | grep '^wf(' | grep -oE -- '\[[^]]*(->|→)[^]]*\]' | grep -oE -- '->|→' | sort | uniq -c`
  gives 198 ASCII `->` against 430 `→`. The ASCII form starts on 2026-09-22. `BRACKET_RE` skips it
  silently, which is filed as `bug-137`.
- **Verbs outside the declared five.** Of 873 `wf()` subjects, 317 use a verb other than `add`,
  `submit`, `approve`, `reject` or `deprecate`: `sync` 156, `finalize` 81, `start` 75, and six
  others. The command is the same `git log` piped through `sed -E 's/^wf\(([a-z-]+)\): ([a-z-]+).*/\2/' | sort | uniq -c`.
  Whether to ratify them is `dl-079`.
- **Approver and author disagree.** Of 181 approve commits, 116 are authored by
  `probe@example.invalid`, an identity not in `dna.yaml` `team.members`
  (`git log 20e8271..a20b346c --grep='^wf(.*): approve ' --format='%ae' | sort | uniq -c`). All 116
  carry `Approver: Roberto Pompermaier …` in their body. From the commit alone, nobody can tell who
  performed the approval.

A check run on the day each of these began would have flagged one commit, not hundreds. The v0.2
retrospective and `dl-089`'s release-health run found them weeks later, by hand.

### Unattended runs

No element defines what a process running without a human may commit. In v0.2, 116 approval commits
carrying the approver's `Approver:` line were authored under an identity outside the team (above).
Once
a check verifies the approver's identity, as §1 below proposes, the obvious workaround is to give the
unattended process the approver's identity. That passes the check and removes the only thing it
guarantees. The policy has to be decided before the check exists.

## Decision

### 1. A governance check runs outside the agent, on every push

A check runs over every commit range pushed to `main` and over every pull request. It checks:

- **Subject grammar.** `wf(<type>): <verb> <ids>`, with verbs from the ratified set (`dl-079`), and
  the bracket `[<from> → <to>]` with the canonical arrow on every transition verb.
- **Body shape.** `Approver:` and a non-blank `Reason:` on `approve` and `reject`, and the `Reason:`
  block rules of `dl-067`.
- **Authority.** The author of an `approve` or `reject` commit is a `team.members` identity holding
  the approver role, as `dl-094` decides.
- **State.** Each touched element's transition is legal in its machine, and the frontmatter matches
  the bracket. This is `verifyTransitionConsistency`, finally called.

Where it runs: the approver chooses one or more of these options.

- **(A) A CI workflow.** A new `.github/workflows/governance.yml` runs on `push` and `pull_request`
  to `main`, calling a script or a future read-only `wingfoil` audit command. It is versioned,
  cannot be skipped by an agent, and applies to every session alike.
- **(B) Versioned git hooks.** A tracked hook directory is enabled with `core.hooksPath`. Feedback
  comes at commit time. It is opt-in per clone and bypassed by `--no-verify`, so it cannot be the
  enforcement point. `dl-074` rejected hooks for a tag check on the ground that they are not
  versioned. `core.hooksPath` answers the versioning half, but not the enforcement half. Since `dl-190` (a) the
  hook is no longer only offered: the contributor setup installs it (`npm run setup:hooks`) and `git-conventions` §9
  requires it in every clone that pushes, so a malformed commit is refused before the push; it stays per clone and
  `--no-verify` skips it, so (A) with (C) remains the enforcement point (Amendment 2026-11-24).
- **(C) Branch protection on `main`**, requiring (A)'s status before a push or merge is accepted.
  This is a GitHub repository setting, recorded as a `service` element once `dl-088` exists.

**Recommendation: (A) + (C), with (B) offered as a local convenience that runs the same script.**
(A) makes the check exist, and (C) makes it binding.

**Starting mode.** The check hard-fails on commits after its own introduction, and it reports
history before that commit without failing. The population it gates is new commits only, so no
warn-only ramp is needed. `dl-034`'s lint gate took the same view.

### 2. An approval policy for unattended runs

The approver chooses one or more of these options.

- **(i) No gated transition by an unattended run.** A process without a human present may `add`,
  `submit`, `start`, `sync` and write content. Every `approve` and `reject` is a human-authored
  commit. §1's authority check enforces this directly.
- **(ii) A declared delegate.** `dna.yaml` declares an automation identity with a scoped approval
  policy: which types, which transitions, and under what evidence. Its commits name the policy they
  act under. This is legitimate delegation, visible and revocable, never the approver's identity
  borrowed.
- **(iii) Signed approvals.** `approve` and `reject` commits must be signed with a key registered to
  an approver, and §1 verifies the signature. This separates who approved from whatever `git config`
  says, which is the confusion `dl-094` and `bug-149` describe.

**Recommendation: (i) now; (iii) evaluated at v0.3 planning; (ii) only for transitions that are
machine-verifiable, once the workflow engine exists.**

## Rationale

- Every v0.2 governance drift above was cheap to detect and was detected late, by hand. The rules
  existed. What was missing is a point where a commit is checked by something other than its
  author. That is the same shape as the claim-evidence finding (`dl-097`), and one check can host
  both.
- CI is the only place in reach that no agent session can skip, and that applies equally to a
  human, an interactive agent and an unattended run. Hooks give faster feedback, but they are
  advisory by construction.
- An authority check is worth something only if the identity it checks cannot simply be adopted.
  Deciding the unattended-run policy first stops the check from being satisfied by the very
  practice it is meant to end.
- The code is already written. `verifyTransitionConsistency` and the attribution audit exist and
  are tested. Wiring them into a check is mostly a binding problem.

## Actions

1. **Ratify, choosing the options in §1 and §2.** Owner: approver. The choices go in the approve
   commit's `Reason:`.
2. **Add `.github/workflows/governance.yml` and its script** (or a read-only audit command) under
   §1 (A), and, under (B), a tracked hook directory running the same script. The generic rules
   ship in the package as the read-only command `wingfoil verify` (`dl-222` (a),
   `spec-020-the-governance-check-verb-the-authority-and-state-rules-over-a-commit-range`); the
   script stays out of the package, as this repository's extension of that command, and
   `spec-015-packaging-publishing` says so (Amendment 2026-11-21).
3. **Under §1 (C): configure branch protection on `main`** (approver action), recorded as a
   `service` element per `dl-088`.
4. **Under §2: amend `.wingfoil/dna.yaml`** (team, approval policy) as `dl-094` and the
   chosen option require, and **`.wingfoil/directives/custom/code-review.md`** with the
   policy in one line.
5. **Sequencing.** The check reads the configuration from the repository root once v0.2.2's step 2
   closes `bug-075`. It depends on `bug-137` (canonical arrow) and on `dl-079` (verb set), and it
   hosts `dl-097`'s lint and `dl-099`'s CI smoke.
6. **Tasks are derived by v0.3 `release-planning` (`build-backlog`)**, not created here.

## Relations

- **Origin:** `retro-v0.2`, the findings on governance enforcement and unattended runs.
- **Taken with:** `dl-094-one-author-identity-per-act` (the identity the authority check verifies).
- **Hosts:** `dl-097-claim-evidence-needs-an-enforcement-point` (b, c);
  `dl-099-release-gates-run-on-every-candidate-on-a-fresh-project` (c).
- **Depends on:** `bug-137`; `dl-079-wf-commit-verbs-outside-the-declared-grammar`;
  `dl-067-reason-trailer-contract`; `bug-075`; `dl-088` (the `service` record for branch protection).
- **Related:** `bug-149`, `bug-153` (authority against author, and reserved domains accepted as
  authors); `dl-074-tag-must-be-on-pushed-main` (the earlier hooks argument);
  `dl-089-release-health-analyses-before-retrospective` (measures after the fact what this check
  prevents); `dl-105-recurring-and-schedulable-phases` (scheduled CI).
- **Traceability:** REQ-SEC-02 (complete, attributable audit trail), REQ-SEC-03 (role-based
  approval authority), REQ-SEC-04 (mandatory justification on decision verbs), REQ-SEC-09 (human
  approval before inferred writes), P1.2 (versioning and audit trail).

## Amendments

**Amendment (2026-11-21, `task-365-ship-wingfoil-verify-with-the-generic-authority-and-state-checks-spec-020`)
— Actions 2: the generic rules ship as a verb, the script stays out.** Action 2 said to amend `spec-015` "if the script
ships in the package; it should not". `dl-222` (`ready`, option (a), Action 2) reconciled that sentence with `dl-212` D1,
which assumes a governance check shipped to projects: the generic authority and state rules of §1 ship as the read-only
command `wingfoil verify` (`spec-020`, `approved`), inside `dist/` like every command, and `scripts/check-governance.cjs`
stays out of the package as this repository's extension of it (`spec-020` §6). Action 2 now says so, and `spec-015`
states the reason the script is not shipped. §1's rules, §2's policy and the other Actions are unchanged.

**Amendment (2026-11-24, `task-366-make-check-governance.cjs-the-extension-of-wingfoil-verify-and-install-the-pre-push-gate-dl-190`)
— §1 (B): the hook is installed and required.** §1 (B) offered the versioned hook as a local convenience, opt-in per
clone. `dl-190` (`ready`, item 2 (a), with (c)) makes it a gate: the contributor setup installs `.githooks/pre-push`
with `npm run setup:hooks` (`CONTRIBUTING.md`), which sets `core.hooksPath` and refuses to replace a hooks path or a
hook the clone already uses, and `git-conventions` §9 requires it in every clone that pushes to this repository. What
§1 (B) says of hooks still holds: the hook runs per clone and `git push --no-verify` skips it, so it cannot be the
enforcement point, which stays (A), CI, made binding by (C). (B) now catches a malformed commit before the push, where
(A) catches it after; `dl-190` (c) adds the wait for (A)'s required check before `release-publishing`'s tag. §1's
rules, the Recommendation, §2's policy and the Actions are otherwise unchanged.

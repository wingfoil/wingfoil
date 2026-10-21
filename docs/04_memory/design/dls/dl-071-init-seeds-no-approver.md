---
id: "dl-071-init-seeds-no-approver"
type: decision-log
title: "Should `wingfoil init` seed the initialising user as `approver`, or ship a project where every approval gate is closed until dna.yaml is hand-edited?"
status: ready
context: "dev-loop-review"
release: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

`wingfoil init` scaffolds `dna.yaml` with `team.members: []` (`src/storage/templates.ts:234`). Approval
authority is granted through `team.members[].roles` containing `approver`, so a freshly initialised
project has **no approver at all**: `memory approve` and `memory reject` refuse on every element of
every type, with `user not authorized to approve type '<type>'` and nothing pointing at the fix, until
the user hand-edits `dna.yaml`.

`adr-006-git-identity-role-based-authz` (`accepted`) named this outcome in its own Consequences
(`:68-69`):

> Because roles are declared, not inferred, a misconfigured `dna.yaml` (e.g. an approver role granted
> to no one) can silently block all approvals until corrected.

It named it as a risk of misconfiguration. What is at issue here is that `init` **ships** that
configuration as the default, and that the refusal an affected user meets is a security message that
reads as a denial rather than as "nobody has this role yet".

Whether to seed is therefore a governance choice, not a UX tweak: seeding means the tool grants
approval authority to whoever ran a command, and `adr-006`'s whole point is that approval authority is
an explicit, declared DNA role.

### Measured evidence

Measured 2026-09-21. `main` is at `ba2cad0`.

**E1 — the scaffold.** `src/storage/templates.ts:234`, with the comment that put it there (`:209-212`):

```
  // … `team.members` is a REQUIRED (if possibly empty)
  // array too; an empty list is schema-valid (the `Team` schema's role cross-check is vacuous over no
  // members) and is the right default for a fresh, person-less scaffold — the user adds real members
  // via `dna set` once the project has a team.
  members: []
```

So the empty list is deliberate and reasoned, not an oversight. The `Team` schema requires the key;
`TeamMember` is `{name, email?, roles[]}` (`src/dna/schema.ts:69-75`).

**E2 — the refusal, measured end to end.** Against a build of
`task/task-071-fix-init-memory-yaml-state-machine` at **`1fee316`** (`npm ci` + `npm run build`,
exit 0) — see E3 for why that branch and not `main`. Fresh `git init`, git identity configured, then:

```
$ node dist/cli.js init --template scrum        # exit 0
$ grep -n -A2 "^team:" .wingfoil/dna.yaml
22:team:
23-  members: []
$ node dist/cli.js memory add --type adr --title "Test"
{ "id": "adr-001-test", "path": "docs/memory/adr/adr-001-test.md" }
$ node dist/cli.js memory submit adr-001-test
{ "id": "adr-001-test", …, "from": "draft", "to": "pending" }     # submit works
$ node dist/cli.js memory approve adr-001-test --reason "looks good"
error: user not authorized to approve type 'adr'
$ echo $?
1
$ node dist/cli.js memory reject adr-001-test --reason "nope"
error: user not authorized to approve type 'adr'                  # same string on reject, per dl-063 clause B
$ echo $?
1
```

`add` and `submit` work; the element reaches `pending` and stops there permanently. The message is
exactly REQ-SEC-03's pinned string. (The branch has since moved to `7cd5166`;
`git diff 1fee316 7cd5166 -- src/` is **empty**, so this measurement still describes its HEAD.)

**E3 — on `main` today a different error fires first, and it hides this one.** `main`'s `init` scaffold
ships a `memory.yaml` with no state machine at all (`bug-030-init-memory-yaml-has-no-state-machine`),
so the same sequence stops earlier:

```
$ node dist/cli.js memory submit adr-001-test      # main's build, ba2cad0
error: type "adr" declares no `states` block and `defaults.states` is not set (REQ-STATE-08)
$ node dist/cli.js memory approve adr-001-test --reason "looks good"
error: type "adr" declares no `states` block and `defaults.states` is not set (REQ-STATE-08)
```

So the received framing — "`memory approve`/`memory reject` refuse in EVERY new project with
`user not authorized…`" — is **true only once `task-071` lands**. Today they refuse with a different
message for a different reason. This is a decision about the state of the world after `task-071`, and
that is the honest way to read it.

**E4 — the message is a pinned contract, not free text.** REQ-SEC-03's Fit Criterion
(`docs/02_requirements/03_sard/05_security-compliance.md:35-37`) quotes it literally and, since
`dl-063` clause B, binds it to both verbs:

> An `approve` **or** `reject` attempt by a principal lacking the required role is rejected with
> `"user not authorized to approve type '<type>'"` and the state is unchanged. Both verbs share that
> one message … deliberate, per `dl-063` clause B — one authority predicate, one string …

So option (B) below is not "reword the error"; it is "amend a SARD fit criterion and the BDD scenarios
that quote it".

## Decision

Three options, presented with a recommendation; the approver's choice is recorded in this document's
approve commit `Reason:`.

### (A) Seed the git-identity user as `approver` at `init`

`init` already requires a configured git identity (REQ-SEC-01, `requireGitIdentity`), so the name and
email are available at scaffold time. Write them into `team.members` with `roles: [approver]` (or a
fuller starter set).

*For:* the project works end to end out of the box — `add → submit → approve` completes on a fresh
init, which is what a first-run user and every "fresh-init + CLI end-to-end smoke" gate (`dl-023`)
expect. The person running `init` on their own repository is, in every realistic case, the person who
will approve in it.

*Against:* it makes approval authority **inferred from who ran a command**, which is the one thing
`adr-006` decision point 2 rules out ("Directives and workflow approval steps reference roles, never
people … approval authority … never bound to a named person" — the binding here would be to a person,
written by the tool rather than by a human's deliberate edit). It also writes a real name and email
into a git-tracked config from ambient git config, silently. And in the multi-user case it hands
authority to whoever initialised the repository, which may be a CI job or a scaffolding script.

### (B) Seed nothing, but make the refusal say what to do

Keep `members: []`. Change the message, or add a second diagnostic line, so an affected user is told
that no member holds `approver` and where to grant it.

*For:* it preserves `adr-006` exactly — authority stays an explicit human act — while removing the
part that is genuinely a defect: a security-shaped denial that gives an operator no route forward.
`adr-006:68-69` already predicted "silently block all approvals"; this is the fix for the *silently*.

*Against:* it touches REQ-SEC-03's pinned Fit Criterion (E4) and the P1.7/P1.8 BDD scenarios that
quote the string, which `dl-063` clause B has only just finished amending — so it is a second visit to
the same requirement within one release. It also leaves the first-run experience as "the tool
scaffolds a project in which a core verb cannot succeed", which is a real cost for `e2e-smoke`
(`dl-023`) and for anyone evaluating the tool.
*Mitigation worth noting:* the remedy can be a **second line** on the existing error rather than a
change to the pinned string — a hint appended after it — which would leave REQ-SEC-03's fit criterion
satisfied verbatim. Whether the project's error rendering can carry that is
`dl-055-core-error-details-never-reach-operators`'s subject, and this DL does not assume it can.

### (C) Leave it exactly as it is

Document the step in the user-facing docs (`user-docs`, `dl-013`) and treat a hand-edited `dna.yaml` as
the intended first step of adopting WingFoil.

*For:* zero code, zero spec churn, and it is defensible: declaring your team is a reasonable first act
in a tool whose entire premise is explicit declared configuration over inferred behaviour
(REQ-SYS-07).

*Against:* it leaves `adr-006`'s predicted failure mode as the shipped default, and it leaves the
`e2e-smoke` gate (`dl-023`) unable to exercise `approve`/`reject` on a genuinely fresh init without
first hand-editing config — which makes that gate less of an end-to-end test than its name claims.

### Recommendation — **(B)**, with a note on where (A) would be acceptable

(B) is recommended because it fixes the part that is unambiguously wrong (an operator hits a wall with
no signpost) without spending `adr-006`'s central guarantee to do it. The first-run cost (C)'s critics
raise is real but small: one documented edit, made once, by the person who is about to take
responsibility for approving.

(A) becomes the better answer **if** the approver judges that "the person who ran `init` in their own
repository" is a person, declared at a moment of deliberate intent, rather than an inference — in which
case the seeding should write a visible, commented entry that the user can see and change, not a quiet
default. That reading is available; it is the approver's to make, because it is a reading of
`adr-006`.

### Sub-questions to settle with the main option

- **S1 — if (A): which roles?** Only `approver`, or the fuller set a solo user needs
  (`approver, developer, reviewer, architect`)? Seeding only `approver` is the minimum that unblocks
  the gates; seeding more starts making assumptions about how the user works.
  *Recommendation:* `approver` alone, if (A).
- **S2 — if (A): is it silent?** `init` already prints its file list; the seeded member should appear
  in that output and in a `dna.yaml` comment saying what it is and that it may be removed.
  *Recommendation:* never silent.
- **S3 — if (B): appended hint or amended string?** See the mitigation above. An appended hint leaves
  REQ-SEC-03 untouched; amending the string reopens a fit criterion `dl-063` clause B has just
  rewritten. *Recommendation:* appended hint, and only amend REQ-SEC-03 if the rendering path cannot
  carry one.
- **S4 — either way: does `e2e-smoke` (`dl-023`) cover `approve`?** If (B) or (C) wins, that gate has
  to either hand-edit `dna.yaml` as an explicit setup step, or stop claiming to cover the approval
  verbs. *Recommendation:* make the setup step explicit and visible in the gate, so the gap is
  documented rather than implied.

## Rationale

The decisive consideration is that this is a question about `adr-006`, not about ergonomics. The
ergonomic defect — a refusal that tells an operator nothing — is real, measured (E2), and fixable
without touching the authority model. The authority change (A) is a larger commitment: it makes the
tool the author of a role grant, in a system whose accepted ADR says role grants are declared by
humans and referenced by role, never bound to a person by inference. When a smaller fix addresses the
observed harm and a larger one spends a ratified guarantee, the smaller one needs less justification.

Secondary, and weaker:

- E3 means nothing is broken *today* for this reason — a fresh init fails earlier, on `bug-030`. So
  there is no urgency, and the decision can be made properly rather than quickly.
- The `dl-063` clause B amendments to REQ-SEC-03 are recent and, per `dl-063`'s own Actions, still
  outstanding. Piling a message change on top of an un-landed amendment is how the two get confused;
  an appended hint (S3) avoids that entirely.

## Actions

1. **Owner `approver`: choose (A), (B) or (C)**, and settle S1–S4 as applicable.
2. **If (B):** decide the appended-hint route vs the amended-string route (S3). The hint route needs
   nothing from the SARD; the string route amends REQ-SEC-03's Fit Criterion in
   `docs/02_requirements/03_sard/05_security-compliance.md:35-37` and the P1.7/P1.8 BDD scenarios that
   quote it — coordinate with `dl-063`'s still-outstanding clause B edits so both land once.
3. **If (A):** amend `src/storage/templates.ts`'s `dnaYaml` scaffold and the comment at `:209-212`
   that currently reasons for the opposite, and add a fresh-init scenario asserting
   `add → submit → approve` completes. Record in `adr-006` (an `accepted` ADR — so a dated amendment
   note, not a silent edit) that the tool may write one seeded role grant at `init`.
4. **Either way:** sequence after `task-071-fix-init-memory-yaml-state-machine`, which is what makes
   this reachable at all (E3). It is `in-progress` on `task/task-071-fix-init-memory-yaml-state-machine`
   (HEAD `7cd5166`; `src/` identical to the `1fee316` this was measured against).
5. **Either way:** hand the outcome to whoever owns `e2e-smoke` (`dl-023`), per S4.

## Relations

- **Constrained by:** `adr-006-git-identity-role-based-authz` (`accepted` — decision point 2 and the
  Consequence at `:68-69` that predicted this exact state), REQ-SEC-03 (the pinned message),
  REQ-SEC-01 (`requireGitIdentity` — why the identity is available at `init`), REQ-SYS-08 (bindings by
  role, never by person).
- **Depends on:** `task-071-fix-init-memory-yaml-state-machine` / `bug-030-init-memory-yaml-has-no-state-machine`
  — until they land, the refusal in E2 is unreachable on `main` (E3).
- **Coordinate with:** `dl-063-p1-8-reject-message-and-authority-trace` (`ready` — widened REQ-SEC-03
  to both verbs; its own amendments are still outstanding),
  `dl-055-core-error-details-never-reach-operators` (whether an appended hint can reach the operator at
  all), `dl-023` (the fresh-init end-to-end smoke gate), `dl-013` (`user-docs`, if (C)).
- **Adjacent, not absorbed:** `dl-072-init-scaffold-per-type-state-machines` (filed in this batch — the
  other open question about what `init` should scaffold; deliberately kept separate, see that
  document's Context for why), `dl-062-roles-yaml-unwritable-fallback`,
  `dl-064-approver-gated-verb-preflight-order` (which check fires first — directly relevant to E3's
  masking), `spec-011-storage-layout` (the scaffold's layout contract).
- **Traceability:** P1.7, P1.8, P2.4 (DNA), P5.1.1 (`init`), REQ-SEC-01, REQ-SEC-03, REQ-SYS-08.

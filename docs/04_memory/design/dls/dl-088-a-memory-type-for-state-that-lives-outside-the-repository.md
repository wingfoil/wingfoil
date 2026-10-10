---
id: "dl-088-a-memory-type-for-state-that-lives-outside-the-repository"
type: decision-log
title: "State that lives outside the repository has no Memory type, so nothing records what WingFoil depends on outside git or how to manage it"
status: ready
context: "retrospective"
release: "v0.2.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

Filed by the v0.2 retrospective (`retro-v0.2`), which absorbed the project-visibility planning and
made this decision-log its first vehicle (`retrospective-rel-v0.2-plan` §6.7). The approver ruled on
2026-09-28 that:

1. anything expressible as a file in the repository is ingested as a Memory element and delivered
   through the normal flow;
2. what lives outside the repository (accounts, registrations, settings and credentials held by
   third-party services) is **still recorded in it**, as Memory: what it is, how it works and how to
   manage it;
3. that record is a **Memory type of its own**, rather than a tech-spec register or a `dna.yaml`
   section.

The retrospective's dispositions add two rulings: the type is an `[AUTHORING]` extension of **P1.13**
(configurable Memory types) with no new feature id, and four existing pieces of external state are
backfilled once the type exists. This decision-log designs the type.

### The project already has this state, and records it only as side notes

Publishing v0.2 created four pieces of external state the release pipeline cannot work without:

| External state | Where it is described today |
|---|---|
| The npm package `wingfoil` and the npm account that owns it | `adr-009-npm-publishing-pipeline`, `spec-015-packaging-publishing` |
| The `NPM_TOKEN` Actions secret: its token type, and npm's January 2027 end of token direct-publish | `task-061-publish-secrets`, `dl-087-publish-through-npm-staged-publishing` |
| The GitHub environment `npm-publish` and its required reviewer | `task-061-publish-secrets`, the runbook in the header of `.github/workflows/publish.yml` |
| The repository's public visibility, a precondition of provenance | `dl-068-publishing-requires-public-repository` |

Each document records the fact as a side note of something else. None is the authoritative record of
the external thing itself. `grep -rln NPM_TOKEN docs/self/docs/04_memory | wc -l` → `12` and
`grep -rln npm-publish docs/self/docs/04_memory | wc -l` → `20` (both at `a20b346c`). So the question
*"what does WingFoil depend on outside git, who manages it, how is it checked, and when does it
expire?"* can only be answered by reading all of them. This is the symptom `dl-019` found for phase
plans before `plan` became a type: state that drives real work, with no frontmatter to query.

The visibility work adds many more such pieces (a domain, reserved handles, MCP registry and directory
listings, repository settings), and the retrospective also decided that the Determinism Index is
measured in a separate benchmark repository registered as one of them (`dl-089`). Without a type,
each one becomes another side note.

### Why `dna.yaml` does not already cover it

`dna.yaml` `stacks.technologies` lists `npm registry (public)` with `category: distribution`. That
entry is a **technology choice**: the project distributes through npm. It says nothing about the
**operated instance**: which account, which token, which settings, and what to do when the token
expires. `dna.yaml` already keeps the two apart for `git` (a technology) and the repository on GitHub
(described nowhere).

## Decision

Add a Memory type **`service`** (`[AUTHORING]`, provenance this decision-log, feature **P1.13**).

A `service` element records **one unit of state outside the git repository that the project owns,
depends on, or presents itself through**: an account or identity, a credential (by reference only), a
registry or directory listing, a platform setting, a domain, or a reserved handle. It does **not**
cover technology choices (`dna.yaml`), third-party libraries (`package.json`) or intentions
(decision-logs, tasks, plans). A `service` describes something that has been set up, not something
the project plans to set up.

### `memory.yaml` entry

```yaml
service:
  path: "docs/04_memory/services/{id}.md"   # resolved against the configuration root
  id_pattern: "svc-{n}-{slug}"              # e.g. svc-001-npm-package-wingfoil
  name: External Service
  description: >-
    One unit of state outside the git repository that the project owns, depends on, or presents
    itself through (account, credential by reference, registry/directory listing, platform setting,
    domain, handle). Created on demand via the `service-ingest` main, and by any phase that sets up
    external state (e.g. release-publishing). See dl-088.
  tags: [ service, external, operations ]
  template:
    frontmatter:
      required: [ title, provider, kind, owner_role, verify ]
    file: ".wingfoil/memory/templates/service.md"
  states:
    sequence: [ draft, pending, active ]
    gates:
      pending: { reject: draft }   # approve: pending -> active · reject: -> draft
    waiting: [ ]                   # `active` is terminal; retirement is memory.deprecate
```

The path resolves against the configuration root: `docs/self/` today, the repository root once the
configuration moves there (v0.2.2 step 2, closing `bug-075`). The states mean:

- **`draft`**: registered (`memory.add`).
- **`pending`**: the external state exists and is configured as the body describes; filled in and
  submitted (`memory.submit`) by whoever set it up.
- **`active`**: the approver has run the element's `verify` and confirmed the description holds
  (`memory.approve`). The gate is a human verification of the outside world, which no agent can make
  without credentials it must not hold.
- **retirement**: `memory.deprecate`, the reserved wildcard, from any state; the `Reason:` names why
  the service was dropped or what replaced it.

### Frontmatter

| Field | Required | Content |
|---|---|---|
| `title` | yes | e.g. "npm package `wingfoil`" |
| `provider` | yes | who hosts it: `npmjs.com`, `GitHub`, `registry.modelcontextprotocol.io`, … |
| `kind` | yes | one of `account`, `credential`, `listing`, `setting`, `domain`, `handle`, `repository` (*amended 2026-10-09, `dl-163` S3b*) |
| `owner_role` | yes | the `dna.yaml` role that manages it: a role, never a person (REQ-SYS-08) |
| `verify` | yes | the command or URL that establishes its current state (`claim-evidence`) |
| `url` | no | its public URL, if any |
| `account` | no | the public identifier used; never a secret |
| `renews` | no | ISO date on which it expires or must be renewed; `""` if never |
| `repo_refs` | no | repository paths that depend on it (e.g. `.github/workflows/publish.yml`) |
| `decision` | no | the decision-log or ADR that motivated it |
| `set_up_in` | no | the release in which it was set up (not `release`, which a service never carries — `bug-166`) |
| `feedback_inbox` | no | `kind: repository` only: the repository-relative folder, ending in `/`, where that repository keeps its notes about WingFoil, e.g. `docs/wingfoil-feedback/` (*amended 2026-10-09, `dl-163` S3b*) |

*(Amended 2026-10-09, with `task-269`, from `dl-163` S3b, ratified by the approver on 2026-10-07.)* The
kind table gains `repository`: a consumer repository, one `service` per repository, whose optional
`feedback_inbox` names the folder where that repository keeps its notes about WingFoil (`dl-163` R1). Its
`verify` checks the inbox, not only the repository: `git ls-remote <url> refs/heads/main` plus
`gh api repos/<owner>/<repo>/contents/<feedback_inbox>README.md --jq .sha`; each exits 0 and prints a
sha. For a private repository, `<url>` in `git ls-remote` names a remote git can authenticate to, the SSH
form `git@github.com:<owner>/<repo>.git`, while the `url` field keeps the repository's https address. The
required fields are unchanged. `.wingfoil/memory/templates/service.md` and `memory.yaml`'s `service` description carry the
change.

### Body

Four sections: **Purpose** (why the project needs it), **Configuration** (how it is set up, which
settings matter), **Verification** (the `verify` procedure and its expected result), **Management**
(renew, rotate, recover and retire, with deadlines).

### Security rule

A `service` element **never contains a secret value**: no token, password or recovery code, and no
fragment of one. It names where the secret is held (e.g. "GitHub Actions secret `NPM_TOKEN`,
environment `npm-publish`"), its type, its expiry and how it is rotated. This is REQ-SEC-08 and the
`security-secrets` directive applied to a type whose subject matter invites the mistake. The
`spec-007-secret-hygiene-patterns` scan (`scanText`, `src/validation/secret-scan.ts`) is a mandatory
`checks.post` of the ingest's `capture` phase.

### Options open for the approver

1. **State machine.**
   - *(a)* `draft → pending → active`, as above. **Recommended.**
   - *(b)* A `planned` state before `pending`, for services decided but not yet set up. Not
     recommended: intent already has a home (a decision-log, a task, a plan), and an element that
     describes something not yet real makes `pending` and `active` harder to trust.
2. **Changes to an `active` service** (a rotated token, a renewed domain). These are body and
   frontmatter edits with a `version` bump (`doc-versioning`) and no state change. Their commit
   subject meets the open question in `dl-079` (the undeclared `sync` verb). Until `dl-079` is
   settled, this decision-log proposes `docs(self): …`, which keeps them out of the `wf()` grammar.
3. **Implementation route.**
   - *(a)* **Out of flow, now**, as `dl-019` did for `plan`. **Recommended**: v0.2.2 needs the type
     (step 4 of the retrospective's implementation order), and the external steps run with the
     approver are recorded as `service` elements as they happen.
   - *(b)* Through v0.3's `build-backlog`, as a task. Every external-step record waits until then.

## Rationale

- **The approver's rule needs a home.** "What is not in the repository is still recorded in it" is
  only checkable if the record has a declared shape. A type gives it one: frontmatter that can be
  queried (`grep -r "^renews:"`), a state validated against a machine, and an approval that means
  something specific.
- **A type, not a register document.** One tech-spec would carry one status for everything, so a
  stale credential could not be marked independently of a healthy listing. Per-element state, git
  history and `deprecate` come with a type.
- **Not `dna.yaml`.** It would need a `spec-002` change for an `[AUTHORING]` concern, and would mix
  what the project *is* with what it *operates*.
- **Determinism.** The next agent or maintainer that meets an expired token finds its rotation
  procedure by type, rather than by reading 12 documents.
- **Dogfooding.** A project using WingFoil has exactly this problem. Solving it with a configurable
  type is evidence for P1.13's claim that types are the extension point.

## Actions

- [ ] Ratify, choosing among options 1–3 (owner: approver). The choice goes in the approve commit's
      `Reason:`.
- [ ] On `ready`, implement as a configuration change (out of flow, or as a task derived by
      `build-backlog`, per option 3):
  - [ ] the `service` block in `.wingfoil/memory.yaml`, with `[AUTHORING]` annotations citing this
        decision-log;
  - [ ] `.wingfoil/memory/templates/service.md` (frontmatter and body above);
  - [ ] a `service-ingest` main (`workflows/custom/service-ingest.yaml`: `capture` with
        `memory.add` + `memory.submit` and the `spec-007` scan in `checks.post`, then `approve` by
        `approver`), registered in `workflows.yaml`;
  - [ ] the type lists in `.wingfoil/README.md`, `spec-001-memory-yaml-schema` and the agent entry
        point (`align-agent-docs`, `dl-025`);
  - [ ] `npm test`, confirming nothing that loads the real configuration breaks.
- [ ] Backfill four `service` elements for the external state v0.2 created: the npm package
      `wingfoil`, the `NPM_TOKEN` secret (stage-only type; the direct-publish token was revoked on
      2026-09-28, `dl-087`), the `npm-publish` environment, and the GitHub repository with its public
      visibility (`dl-068`). Each cites the documents in the table under *Context* rather than moving
      their content.
- [ ] Register the benchmark repository as a `service` (v0.3; `dl-089`), and each external step run
      with the approver (identities, repository settings, directory claims) as it is done.
- [ ] Follow-up, not blocking: a `retrospective` check that runs every `active` service's `verify`
      and lists those whose `renews` falls before the next release (`dl-130`).

## Relations

- **Origin:** `retro-v0.2`; `retrospective-rel-v0.2-plan` §6.7 (the approver's rules for the
  visibility work) and §6.8 (implementation order, step 4).
- **Precedent:** `dl-019-plans-as-memory-element` (a type added out of flow).
- **Related:** `dl-079` (commit verbs outside the grammar), `dl-087` (the `NPM_TOKEN` it replaces),
  `dl-068` (public visibility), `dl-089` (the benchmark registration), `dl-093` (the MCP Registry
  listing it records), `dl-130` (the `verify` sweep in the release flow).
- **Traceability:** P1.13 (configurable Memory types); REQ-SEC-08 (secret hygiene); REQ-SYS-08
  (roles, never people).

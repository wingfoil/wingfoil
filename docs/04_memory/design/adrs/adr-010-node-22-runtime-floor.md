---
id: "adr-010-node-22-runtime-floor"
type: adr
title: "The runtime floor is Node 22.12+, not Node 18+ — supersedes adr-005's runtime clause"
status: accepted
sard_ref: "REQ-SYS-09"
supersedes: "adr-005-typescript-node-stack"
release: "v0.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

`bug-023-engines-node-floor-contradicts-commander` records that `package.json` declares
`engines.node >= 18.0.0` while the installed `commander@15` declares `>=22.12.0` — the package
advertises a floor its own dependency tree does not accept. `task-074-fix-engines-node-floor`
(`backlog`, `v0.2`) is the fix, and its **AC1 is "the floor is decided and stated"**: either raise ours
to what the tree accepts, or pin an older commander that accepts 18. That is a product-level choice
about the declared runtime contract, not an implementation detail a task settles on its own, and it
reaches a **vision** document (§Actions). This ADR is the decision AC1 is waiting on.

### Measured evidence

All figures re-measured for this ADR on `2026-09-21`, in a clean worktree of `main` at `bcc66a9`
(`ingest/v02-release-governance`), after `npm ci` — which **exits 0** on `main` today, `task-073`
having landed (`0f54871`). Environment: `node v22.21.0`, `npm 11.6.2`, Linux.

**E1 — the production closure and what it demands.** The closure is `package.json` `dependencies`
walked transitively through the installed tree (`npm ls --omit=dev --all --json`, then each entry's
own installed `package.json` read by scanning `node_modules`, nested copies included):

```
PROD_CLOSURE_MANIFESTS=85
MISSING_FROM_TREE=1  @cfworker/json-schema@?
WITH_ENGINES_NODE=58
EXCEEDING_>=18.0.0 = 2
   @hono/node-server  >=18.14.1
   commander          >=22.12.0
HIGHEST_FLOOR: commander >=22.12.0
```

So: **85 entries** in the production closure, **58** declare `engines.node`, and **exactly two** exceed
`>=18.0.0` — `commander@15.0.0` at `>=22.12.0` and `@hono/node-server@1.19.14` at `>=18.14.1`. The
remaining 56 floors are `>=18` or lower (the next highest being `>=18` / `>= 18` / `>=18.0.0` from
`@modelcontextprotocol/sdk@1.29.0`, `express@5.2.1`, `body-parser@2.3.0`, `mime-types@3.0.2` and
friends).

Two honest caveats on that count. (a) **84 readable manifests, not 85**: `@cfworker/json-schema` is an
*unmet optional peer* of `@modelcontextprotocol/sdk` (`peerDependencies: {"@cfworker/json-schema":
"^4.1.1"}`), so `npm ls` lists it with no version and `node_modules/@cfworker` does not exist — it
contributes no manifest and no floor. (b) The walk reads the **installed** tree, so it measures what a
consumer of *this* lockfile gets, not every version the declared semver ranges would permit.

**E2 — which commander majors would allow Node 18 (read from the registry, not from memory).**

```
$ for v in 12 13 14 15; do npm view "commander@^${v}.0.0" engines.node --json; done
commander@12: [ ">=18", ">=18" ]
commander@13: [ ">=18", ">=18" ]
commander@14: [ ">=20", ">=20", ">=20", ">=20" ]
commander@15: ">=22.12.0"
```

Restoring Node 18 compatibility therefore means going back **three majors**, to commander 13 or 12.
Commander 14 would only get the floor to 20.

**E3 — why downgrading commander is rejected.** Two independent costs.

1. It requires a `package-lock.json` regeneration — the artefact `task-073` has just refreshed
   (`0f54871`, whose entire diff is three lines) and the one `bug-043` showed is fragile.
   `task-074`'s own Implementation Notes already flag the sequencing hazard: "If this task pins a
   different commander, the two touch related artefacts — sequence them rather than running them blind
   against each other."
2. More decisively, **commander@15's ESM-only shape is the premise of `task-065`'s Jest harness**.
   `src/cli/program.ts`'s module doc (`:5-20`) records that v15 "ships ESM-only (no CJS build — its
   `package.json` has `"type": "module"` and a single `"default": "./index.js"` export)", that a static
   import downlevels to `require()` and trips `TS1479`, and that the adopted fix is a *dynamic*
   `import('commander')`. Line `:14` names the alternatives it declined — "migrating the whole Jest
   config to ESM or **downgrading `commander`**". `task-065-fix-commander-esm-jest-harness` then built
   the two-track coverage that exists today (`test/cli/program.test.ts` in-process against
   `tsconfig.test.json`; `test/cli/program.integration.test.ts` black-box against `dist/`, exercising
   the real ESM `import()`). Downgrading commander now would not simply change a version number: it
   would retire the reason that harness exists, and `bug-007-commander-esm-jest-untestable` was closed
   on the premise it stays.

**E4 — the measured user cost of an unsatisfiable `engines`.** Contrary to the intuition that a wrong
floor breaks installs, npm's default is to **warn and install anyway**. Measured with a throwaway
package declaring `engines.node >=99.0.0` and a `bin`, installed globally into a scratch prefix:

```
$ npm install -g --prefix <scratch> ./wf-engine-probe-1.0.0.tgz
EXIT=0
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'wf-engine-probe@1.0.0',
npm warn EBADENGINE   required: { node: '>=99.0.0' },
npm warn EBADENGINE   current: { node: 'v22.21.0', npm: '11.6.2' }
npm warn EBADENGINE }
$ ls -l <scratch>/bin/
wf-engine-probe -> ../lib/node_modules/wf-engine-probe/bin/cli.js
$ <scratch>/bin/wf-engine-probe
probe ok          (run_exit=0)

$ npm install -g --engine-strict --prefix <scratch2> ./wf-engine-probe-1.0.0.tgz
EXIT=1
npm error code EBADENGINE
npm error notsup Required: {"node":">=99.0.0"}
npm error notsup Actual:   {"npm":"11.6.2","node":"v22.21.0"}
$ ls <scratch2>/bin/
ls: cannot access ...: No such file or directory
```

So raising the floor costs users below it a **warning**, not a refused install: the binary still lands
on PATH and still runs. Only `--engine-strict` (or `engine-strict=true` in `.npmrc`) makes it a hard
failure, and that is opt-in.

This cuts **both ways**, and is stated here rather than used one-sidedly: it also means the *current*
false `>=18.0.0` floor does not literally break a Node 18 install today. That is exactly why `bug-023`
grades itself "wrong published contract, no development impact" rather than critical. The decision is
about the honesty of the published contract, not about an install that is failing right now.

**E5 — end-of-life status of Node 18 and 20: NOT verified here.** Public release schedules place both
Node 18 and Node 20 past end-of-life as of 2026-09-21. **This is knowledge from training data, not a
measurement**: no network check of nodejs.org was made for this ADR, and nothing in this repository
records it. It is recorded as a *supporting* consideration and deliberately not as a load-bearing one —
E1–E4 stand without it. If it matters to the approver, check it against
<https://nodejs.org/en/about/previous-releases> before the first publish.

### What this does *not* rest on

`adr-009-npm-publishing-pipeline` states no Node floor at all (`grep -n -i "node\b"` over it returns
nothing, as `task-074`'s AC2 survey also found), so nothing in the publishing architecture is being
contradicted. CI is already correct and is not a forcing factor:
`.github/workflows/publish.yml:78` pins `NODE_VERSION: '22.12.0'`, and its comment at `:45` already
calls that "the lowest version every dependency accepts", noting that `package.json` "still declares
`engines.node >=18.0.0`, which this pipeline does NOT test and which is currently false: bug-023". CI
has been running the *decided* floor since `task-060`; only the declaration lags.

## Decision

**WingFoil's supported runtime floor is Node.js 22.12 or later.** `engines.node` becomes `>=22.12.0` —
the highest floor in the production closure (E1), and precisely the version CI already pins.

Downgrading `commander` to restore Node 18 compatibility is **rejected**, on E3: it requires a
lockfile regeneration in the same release that just repaired one (`task-073` / `bug-043`), and it
removes the ESM-only premise on which `task-065`'s Jest harness — and the closure of `bug-007` — was
built. The declared contract moves to match the tree; the tree does not move back to match a stale
declaration.

### Scope of supersession — deliberately narrow

This ADR supersedes **only the runtime clause** of `adr-005-typescript-node-stack`. Everything else
adr-005 decides stands unchanged and is re-affirmed here: **TypeScript** as the implementation
language, **npm** as the public distribution channel (`npm install -g wingfoil`), **semver** for
releases, and the surrounding toolchain it underpins (Commander.js + chalk, MCP over stdio, Zod,
Jest >80% coverage).

The `supersedes:` field nevertheless names adr-005 whole, because a partial amendment is not available
to it: **adr-005's own title is "TypeScript on Node.js 18+, distributed via npm"**, so the falsified
clause sits in the one field that cannot be amended without rewriting the document's identity.
Recording a narrower relation would need a vocabulary — `amends:`, or clause-level supersession — that
`memory.yaml`'s `adr` template does not have. That limitation is named rather than worked around, and
is a candidate for a future decision-log if clause-level supersession is wanted.

**adr-005's own status is not changed by this document.** Per `memory.yaml`, `adr` declares
`waiting: [accepted]` — `accepted → superseded` fires from a later ADR's `supersedes:` — and this ADR
is `pending`. adr-005 stays `accepted` until this one is approved; moving it now would be an
unauthorised transition and an approval this agent does not hold.

## Consequences

- **Positive:**
  - The published `engines.node` becomes **true**: every floor in the production closure is satisfied
    by 22.12.0 (E1). `REQ-SYS-09`'s fit criterion — `npm install -g wingfoil` puts `wingfoil` on PATH
    and `wingfoil --help` exits 0 — is then asserted against a floor the tree actually accepts, rather
    than one that emits `EBADENGINE` for every consumer below 22.12.
  - Declaration, CI and lockfile converge on one number. CI has pinned 22.12.0 since `task-060`; this
    removes the divergence its own header documents.
  - `commander@15` stays, so `src/cli/program.ts`'s dynamic-import design, `task-065`'s harness and
    `bug-007`'s closure all keep their premise.
  - `task-074`'s AC1 is satisfied, unblocking a `backlog` task that must land before the first real
    publish (`task-077`, `dl-056`).
- **Negative:**
  - **Node 18 and 20 users lose the declared contract.** Per E4 they are warned, not refused, and the
    CLI will very likely still run (`bug-023`: commander's only notable builtin use is
    `stripVTControlCharacters`, Node ≥16.11) — but "it probably works" is exactly what this decision
    declines to publish. Anyone on 18 or 20 with `engine-strict=true` is refused outright.
  - The floor is now **pinned to a transitive dependency's choice**. A future commander major raising
    its floor again re-opens this decision, and `bug-047` exists because nothing yet says whether our
    floor must *equal* that maximum or merely satisfy it.
  - Six artefacts now disagree with the code and must be reconciled in order (§Actions), two of them
    (the product brief, `CLAUDE.md`) outside any task's authority to edit.
- **Neutral:**
  - `@types/node` is still pinned `^18.19.130` explicitly to match the *old* floor, so the codebase
    types against a Node 18 API surface while promising 22.12+. Tracked as `bug-049`; not resolved
    here.
  - The exact `package.json` edit, the `spec-015` §1 revision note and the regression guard remain
    `task-074`'s work under its own ACs. This ADR fixes the number, not the diff.

## Actions

The cascade, in execution order. **Each item names its owner, and nothing downstream should move
before the item above it** — per CLAUDE.md §10.1 the vision package wins over config, so a config file
corrected while the brief still says 18+ is the same defect one document further out. **This ADR edits
none of these files**; filing them as ordered actions is its whole contribution.

1. **This ADR** — `adr-010`, `pending`. Owner: the `approver` role (Roberto). Nothing below starts
   until it is `accepted`.
2. **`docs/01_vision/01_product-brief.md:267`** — `**Language & Runtime:** TypeScript, Node.js 18+ (npm)`.
   Owner: **the approver, authoring directly**. This is a *vision* document; per CLAUDE.md §10.1 the
   specs win over config, so the vision must move first and cannot be amended by a task or an agent.
   `task-074`'s AC2 already says "**Stop and report** rather than editing the vision package
   unilaterally" for this exact line.
3. **`dl-001-typescript-over-python`** (`ready`) — its Decision reads "Adopt **TypeScript** with
   **Node.js 18+** runtime and **npm** package distribution". Owner: the approver. Amend or deprecate;
   the `decision-log` machine allows `memory.deprecate` from any state, and
   amendment-with-a-dated-note is the established alternative (`dl-047`). Note dl-001's *substantive*
   decision — TypeScript over Python/Go/Rust — is untouched by adr-010; only its runtime clause is.
4. **`.wingfoil/dna.yaml:73-75`** — `stacks.technologies` → `- name: Node.js` /
   `category: runtime` / `version: "18+"`. Owner: `task-074` (DNA is config, downstream of the vision
   per §10.1). Not named in `bug-023`'s list; surfaced by `task-074`'s AC2 survey.
5. **`README.md:115`** — "This installs the `wingfoil` binary (Node.js 18+ required)." Owner: the
   **`user-docs` release gate** (`dl-013`), which owns `README.md`. `task-074`'s AC2 asks explicitly
   whether to correct it in-task or hand it to that gate; this ADR answers **hand it to the gate**, so
   the owning gate is not bypassed.
6. **`CLAUDE.md:18` and `:92`** — "Tech: TypeScript / Node.js 18+" and "Stacks … Node.js 18+".
   Owner: **nobody, today** — which is the point. No workflow gate owns `CLAUDE.md`
   (`bug-008-claude-md-stale-project-status`, `open`; `dl-025-agent-facing-docs-ownership`,
   `in-discussion`), so nothing schedules this edit and it must be carried explicitly by whoever
   executes `task-074`. Named here so it cannot be silently absorbed.

Filed alongside this ADR and **not** resolved by it: `bug-046` (nothing asserts `package-lock.json`'s
root `engines` matches `package.json`'s — live the moment `task-074` raises the manifest), `bug-047`
(the guard `task-074` AC3 specifies asserts *satisfies*, never *equals*), `bug-048` (CI's pinned
22.12.0 does not satisfy `eslint@10.6.0`), `bug-049` (`@types/node` still `^18`).

## Process Notes

This document adds an `## Actions` section the `adr` template does not carry (its scaffold is
Context / Decision / Consequences / Process Notes). The addition is deliberate: the cascade is the
operative output of this decision and belongs in a section of its own rather than buried in
Consequences. Flagged here so it reads as a considered deviation, not a template slip.

Raised during the v0.2 release-governance ingest (2026-09-21), from the review of
`task-074-fix-engines-node-floor` (`backlog`). Filed at `pending`: the agent that authored it holds no
approval authority (CLAUDE.md §4, §8), so `draft → pending` is as far as it goes; `pending → accepted`
is the approver's.

Traceability: **REQ-SYS-09** (distribution as an npm package — the fit criterion this floor makes true
or false), the same requirement `adr-005` and `adr-009` cite. Source defect: `bug-023` (`planned`,
`medium`, `v0.2`). Fix task: `task-074` (`backlog`, `v0.2`, `bug: [bug-023-…]`,
`depends_on: [task-059-publish-metadata]`).

Two things checked for this ADR that did **not** hold as first attempted, recorded so the next reader
does not re-inherit them:

- The closure walk was first run through `require.resolve('<pkg>/package.json')`, which modern
  `exports` maps block — 13 of 85 entries came back "UNRESOLVED", which would have understated both
  counts. It was redone by scanning `node_modules` directly and matching `name@version`. The
  85 / 58 / 2 figures above are from the second method only.
- `@cfworker/json-schema` appears in the closure with no version and no installed manifest (an unmet
  optional peer), so "85 entries" is 84 readable manifests plus one absent entry — E1 caveat (a).

**Revision (2026-10-02) — the Consequences and the closing list are out of date, per `bug-069` and
`task-158`.** Every element and action this ADR names as open is now closed or done, so the sentences
that describe them as open are no longer current:

- `@types/node` is `^22.20.4`, not `^18.19.130` (`task-087`, which closed `bug-049`). This applies to
  the *Neutral* bullet ("still pinned `^18.19.130`") and to the closing list's "`bug-049`
  (`@types/node` still `^18`)".
- Whether the floor must *equal* the production closure's floor or only satisfy it is settled.
  `spec-015` §1's Revision of 2026-10-02 (`task-155`, which closed `bug-046` and `bug-047`) defines
  the floor as the lowest version every production range admits, and the guard asserts both equality
  and satisfaction. The value is unchanged: `>=22.12.0`.
- The cascade under §Actions is done. It was merged at `7bb95d6e`, and the product brief, `dl-001`,
  `dna.yaml`, `README.md` and `CLAUDE.md` now give 22.12+ (`dl-001` through its own Correction note).
  `task-074`, which owned the `package.json` edit, the `spec-015` §1 revision and the regression
  guard, is `done`. This applies to the *Negative* bullet ("Six artefacts now disagree with the
  code") and the second *Neutral* bullet ("remain `task-074`'s work").
- `bug-048` was closed at v0.3's triage. `task-074` rewrote the CI comment, and whether
  `engine-strict` should be enforced is `dl-076`'s question.

The decision is unchanged: the runtime floor is Node.js 22.12 or later. The text above is left as
written, as the record of what the floor cost when it was decided.

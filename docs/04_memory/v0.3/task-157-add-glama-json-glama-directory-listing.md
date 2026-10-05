---
id: "task-157-add-glama-json-glama-directory-listing"
type: task
title: "Add glama.json for the Glama directory listing"
status: in-progress
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "visibility", "mcp"]
ref: "dl-093"
bug: []
depends_on: []
tmpl_version: 260703
---

## Description

R7 moved `glama.json` to v0.3. A root file lets the maintainer claim the Glama listing.

## Acceptance Criteria

- (characterization) `glama.json` at the root is valid against the schema its `$schema` names (source URL and date read in Execution Notes), with `maintainers` naming the approver's GitHub account.
- (characterization) absent from the tarball: `npm publish --dry-run` file list unchanged against the base (`files` is `["dist","README.md"]`).
- (characterization) post-merge, approver: the approver claims the Glama listing; recorded as a `service` (`kind: listing`).

## Implementation Notes

- **Size:** S · **wave:** 1 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-093 (plan R7).
- **Features:** P5.2.1.
- **Notes:** Proposal key: D26. **`smithery.yaml`: recommend out of scope for v0.3** — no ratified decision names it, and the directory claims of retro-v0.2 §6.7 are approver external steps; re-enter through a DL if wanted.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

Branch `task/task-157-add-glama-json-glama-directory-listing`, worktree `../.wf2-wt/task-157`, cut
from `main` at `1127a0fd`; start `083fffcd`. No `bug:` and no `depends_on`.

### design (architect)

**`depends_on` read (dl-015).** None declared.

**Sources.** `dl-093` is `ready` (`awk '/^status:/{print $2;exit}'` → `ready`); it decides the
discovery metadata and `server.json` but names no Glama file: `glama.json` comes from
`release-planning-rel-v0.3-plan` R7 and step 6 (the ACs here). `spec-015-packaging-publishing` is
`approved` and governs the root listing inputs (`server.json`, §1a) and the `files` allowlist (§1); it
did not mention `glama.json`, so it gains a §1b and a dated Revision note — an amendment of an approved
spec, left uncommitted (see *Pending amendments*). No service element names Glama
(`grep -ril glama docs/04_memory/services` → nothing); `svc-012` (mcp.so) is the model of a `listing`.

**Schema, read 2026-10-05.** The task, DL and plans cite no URL for the schema, so it was fetched:
`curl -sS https://glama.ai/mcp/schemas/server.json` → HTTP 200, `$id`
`https://glama.ai/mcp/schemas/server.json`, JSON Schema draft-07, one property `maintainers`
(required; array, `uniqueItems`, items `string` described "GitHub username"), no `additionalProperties`
restriction; sha256 of the body `7f652273293b658bcf9156646745c3aa9c42edcbd179ee126361e462814f1508`.
Glama's own article (`https://glama.ai/blog/2025-07-08-what-is-glamajson`) gives the file as `$schema`
plus `maintainers`, and says a repository owned by an organisation can be claimed only through it
(a personal repository can be claimed by a GitHub sign-in). `wingfoil/wingfoil` is
organisation-owned (`svc-003` `account: "wingfoil/wingfoil"`), so the file is the claim route.
No field beyond the schema's is written.

**Maintainer.** The approver's GitHub account is `robypomper` (`svc-001`: the organisation "Created
by the approver from the GitHub account `robypomper`"; `svc-012` `account`).

**AC classification (T1) — corrected for AC 1.**

| AC | Class | Why |
|---|---|---|
| 1 — `glama.json` valid against its `$schema`, `maintainers` = approver | **red-first** (task said characterization) | the file does not exist on `main` (`ls glama.json` → no such file); a test for it fails genuinely |
| 2 — absent from the tarball, file list unchanged | characterization | `files` is `["dist","README.md"]`, so it held before the file existed; pinned as a guard |
| 3 — approver claims the listing, recorded as a `service` | external (approver) | post-merge step on glama.ai; not executable by the agent |

### red (developer)

`test/cli/publish-metadata.test.ts` gains the block *Glama listing (task-157) — spec-015 §1b* (5 tests),
beside the `server.json` block: the file exists; `$schema` is Glama's URL and the keys are exactly
`$schema` + `maintainers`; `maintainers` satisfies the schema (array of non-empty unique strings, which
a test re-states because it cannot fetch the schema offline); `maintainers` equals `["robypomper"]`; and
`files` is `["dist","README.md"]` with `glama.json` not among the packed paths.
`npx jest test/cli/publish-metadata.test.ts -t task-157` → **4 failed, 1 passed** (the 4 `ENOENT ...
glama.json`; the tarball guard passes, as AC 2 is characterization). Commit `0aff4452`.

### green (developer)

`glama.json` at the root: `{"$schema": "https://glama.ai/mcp/schemas/server.json", "maintainers":
["robypomper"]}` (`dcd271c1`). Same command → **5 passed**. `npx prettier --check glama.json` → clean.

Validation against the live schema with a real validator (the `ajv@8.20.0` already in
`node_modules`, on the body fetched above): `valid true null`; the two negative controls `{}` and
`{maintainers:["a","a"]}` → `false false`.

**AC 2 evidence.** Plain `npm publish --dry-run` cannot run on this tree: it refuses with "You cannot
publish over the previously published versions: 0.2.2." (it checks the registry first). Pointed at an
unreachable registry, `timeout 40 npm publish --dry-run --ignore-scripts --registry http://127.0.0.1:9/`
lists the tarball before failing to connect: **383 files** with `glama.json` present and **383,
identical** (`diff` empty) with it moved away, i.e. the base file list; `grep -c glama` → `0`. The same
list equals `npm pack --dry-run --json --ignore-scripts` (what the test uses), `diff` empty.

### refactor (developer)

Run with the spec-015 amendment in the working tree:

- `npm test` → 214 suites, **3849 passed**.
- `npm run test:coverage` → 3849 passed; All files 98.88 stmts / 95.56 branches / 95.34 funcs /
  99.58 lines. No `src/` file changed (`git diff --stat 1127a0fd -- src` → empty), so coverage cannot
  regress against `main`.
- `npm run lint` → exit 0; `npm run docs:api` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0;
  `npx tsc -p tsconfig.build.json --noEmit` → exit 0.
- `npx jest test/docs/name-resolvability.test.ts` → 11 passed; `spec-015` shows `untriaged 3` with and
  without the §1b edit (`git stash` comparison), so the new backticked names add no finding.
- BDD: no feature file mentions `glama` or `server.json` (`grep -rli "glama\|server.json"
  docs/02_requirements` → nothing); none to extend. No CLI surface touched.

### review (reviewer)

- AC 1 met: file present, schema-valid (ajv, live schema), maintainer pinned by test. AC 2 met: pinned
  by test, and the dry-run lists are identical to the base. AC 3 is the approver's (below).
- Only keys the schema declares are written; the schema source URL and read date are in the test
  header, §1b and here.
- No same-class instance elsewhere: `server.json` already has its own block.

**Approver steps for AC 3 (post-merge, after push to `wingfoil/wingfoil` `main`).**
1. Check the file is served: `curl -s https://raw.githubusercontent.com/wingfoil/wingfoil/main/glama.json`
   → the two keys above.
2. On `https://glama.ai/mcp/servers`, find WingFoil (search "wingfoil"), sign in with GitHub as
   `robypomper`, and run the "Claim ownership" flow, which makes Glama read the root `glama.json`
   (Glama's article above; re-run it after any change to the file). The article covers claiming an
   existing listing only: if WingFoil is not listed yet, how to submit it is not verified here.
3. Collect: the listing URL, the claim date, and what Glama shows as the maintainer.
4. Record it as a new `service` element (`kind: listing`, `owner_role: approver`, `account:
   robypomper`, `decision: dl-130-visibility-steps-in-the-release-flow`, as `svc-012`), with `verify`
   e.g. `curl -s https://raw.githubusercontent.com/wingfoil/wingfoil/main/glama.json` plus opening the
   listing URL. The element is not added by this task (coordinator/approver, through `service-ingest`).

**Pending amendments (approver).**
- `spec-015-packaging-publishing` — §1b `glama.json` and the Revision (2026-10-05) note. Proposed
  `--reason`: "task-157 adds a second root listing input, glama.json, which claims the Glama listing of
  an organisation-owned repository; section 1b states its two keys, the schema it is validated against,
  and that it stays out of the tarball. The files allowlist and the pipeline are unchanged."

**Out of scope, reported not filed.** The AC wording `npm publish --dry-run` does not run once the
current version is on npm (registry check first); `npm pack --dry-run` or a dry run against an
unreachable registry gives the file list.

---
id: spec-015-packaging-publishing
type: tech-spec
title: "npm packaging & publishing pipeline (package.json publish surface + CI publish flow)"
status: approved
scope: "package.json (publish metadata + scripts), server.json, .github/workflows/publish.yml + scripts/publish-staging.cjs"
supersedes: ""
release: "v0.2"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Context

REQ-SYS-09 requires WingFoil to ship as an installable npm package (`npm install -g wingfoil` puts the
`wingfoil` CLI on PATH). `adr-009` fixes the *architecture* of how that happens — GitHub Actions CI/CD,
an ephemeral Verdaccio staging step driven by a local-first script, promotion to npm with
provenance/OIDC, secrets only in the CI store. This spec fixes the *file-level contract* that
architecture implies, so the v0.2 publishing tasks implement one agreed surface rather than each
task inventing its own `package.json` fields, script names, and workflow shape.

Today (`main`) `package.json` delivers packability only (`task-007`): it has `name`, `version`,
`bin.wingfoil`, `files`, `main`, `types`, `engines`, `license`, `keywords`, and `build`/`prepack`
scripts, so `npm pack` yields a valid tarball. It is missing every field and gate needed to *publish*:
no `repository`/`author`/`homepage`/`bugs`/`publishConfig`, no `prepublishOnly`, no `--dry-run` gate,
no staging script, and no `.github/workflows/`. Without a single definition, three tasks (publish
metadata, publish flow, secrets) would diverge on names and layout, and the `dl-023` init+CLI e2e
smoke gate could not be reused as the staging smoke.

## Specification

### 1. `package.json` publish metadata (added by the publish-metadata task)

Required additions (values are the contract; exact URLs confirmed at implementation):

- `repository`: `{ "type": "git", "url": "git+https://github.com/<owner>/wingfoil.git" }`, where
  `<owner>` is **`wingfoil`** from the v0.2.2 publish on (`dl-091` Q3, the transfer to
  `wingfoil/wingfoil`). npm provenance checks this URL against the repository that built the package,
  so `repository`, `homepage` and `bugs` change with the transfer, before the first publish after it.
- `author`: `"Roberto Pompermaier <robypomper@gmail.com>"`
- `homepage`: the repo README/pages URL
- `bugs`: `{ "url": "https://github.com/<owner>/wingfoil/issues" }`
- `publishConfig`: `{ "registry": "https://registry.npmjs.org/", "access": "public", "provenance": true }`
  — the **target (prod) registry**, public access, and provenance (npm ≥ 9.5 + GitHub OIDC). The
  registry URL is non-secret and lives here in git; omitting it falls back to the npm default. The
  **staging** registry is never stored here — it is passed transiently as `--registry
  http://localhost:4873` by the `publish:staging` script (§3). See §5 for the full config-location map.
- `description`: one line a registry listing shows whole, carrying the display name `WingFoil`
  (`dl-091` Q1, `dl-093` point 2); it may carry the category line, which `dl-091` keeps a proposal.
- `keywords`: the discovery terms of `dl-093` point 1 — at least `mcp`, `model-context-protocol`,
  `mcp-server`, `ai-agents`, `cli`, `workflow`, `governance`, `spec-driven-development`,
  `claude-code`; the exact list is fixed by the implementing task.
- `mcpName`: **`io.github.wingfoil/wingfoil`** (`dl-091` Q2 (iii), `dl-093` point 3). The MCP
  Registry verifies npm ownership by reading this field in the published manifest, and it must equal
  `server.json` `name` (§1a). It is permanent once published: the registry documents no rename.
- `files` review: stays `["dist", "README.md"]`; add `LICENSE` and (if present) `COLLABORATION.md`
  only if intended in the tarball. **No `.npmignore`** — `files` is the allowlist (single source;
  avoids the `files`/`.npmignore` double-negative).

- `bin.wingfoil`: **`dist/cli.js`** — no leading `./`. npm rejects a `./`-prefixed `bin` target,
  rewrites the manifest at publish and warns `"bin[wingfoil]" script name dist/cli.js was invalid and
  removed` (misleading wording: the command is normalised, not dropped). Amended after `task-059`'s
  review isolated it with two probe packages — `./dist/cli.js` emits the warning, `dist/cli.js` does
  not — and confirmed by probe install that the shim works either way, so this is signal hygiene, not
  a functional fix: §3 stage 1 runs `npm publish --dry-run` as a CI gate, and a gate whose output
  carries permanent expected noise is a gate people stop reading. Previously listed under *Unchanged*
  with the `./` form, which is why `task-059` correctly declined to fix it in code. Tracked by
  `bug-020-bin-path-autocorrected-at-publish`.

- `engines.node`: **`>=22.12.0`** — and it is a *derived* value, not a preference. It must equal the
  highest `engines.node` floor declared anywhere in the **production** dependency closure
  (`dependencies`, transitively) — read as the lowest Node version **every** range in that closure
  admits (the least element of their intersection), which for plain `>=` ranges is their maximum and
  for a gapped range such as `^20.19.0 || ^22.13.0 || >=24` can lie above every range's own minimum —
  because `files: ["dist", "README.md"]` means that closure is exactly
  what a consumer installs. Two packages bind it today: `commander@15` (`>=22.12.0`) and
  `@hono/node-server@1.19.14` (`>=18.14.1`, reached through `@modelcontextprotocol/sdk`). The floor
  is written as a plain `>=major.minor.patch` so "the advertised floor" is a single number, and it is
  enforced by an assertion in `test/cli/publish-metadata.test.ts` that recomputes it from the
  installed tree, in both directions (satisfied by every dependency, and equal to the closure's floor)
  — a dependency bump that raises a floor fails the suite instead of silently making
  the manifest false again. Previously listed under *Unchanged* as `engines: node >=18`, which
  `bug-023` showed was false of the tree; amended by `task-074-fix-engines-node-floor`. **The
  product-level "Node.js 18+" claim — carried by `adr-005-typescript-node-stack`, `dl-001`, `dna.yaml`
  `stacks.technologies` and `docs/01_vision/01_product-brief.md` — is no longer the open,
  approver-level question this bullet once deferred: `adr-010-node-22-runtime-floor` settled it
  (`accepted`, `0627290`), superseding `adr-005` (`superseded`, `a7d783a`), and its cascade
  (`7bb95d6`) corrected the product brief, `dna.yaml` and `CLAUDE.md`, and added a dated Correction
  note to `dl-001` instead of rewriting its original sentences.** The last occurrence, the
  README's *Installation* sentence, was owned by the `user-docs` release gate (`dl-013`) per `adr-010`
  action 5, and that gate has now corrected it to "Node.js 22.12+ required" — the cascade is closed. This bullet still fixes only what the published manifest asserts about
  itself; see the *Revision (2026-09-21) — §1 Node floor* note below.

### 1a. `server.json` (MCP Registry listing, `dl-093` point 4)

A `server.json` at the repository root describes the MCP server for the registry: `name` equal to
`package.json` `mcpName`, the description, the repository URL, and one `packages[]` entry for the npm
package `wingfoil` over `stdio` with the argument `mcp` (the command `wingfoil mcp` starts). Its
`version` and every `packages[].version` equal `package.json` `version`, checked by §4. It is not in
`files`: it is the input of the MCP Registry listing, and publishing to the registry is not part of
this pipeline — it happens with the approver at publication time (`dl-093` point 6, `dl-130`).

### 1b. `glama.json` (Glama listing claim, `dl-093`, release-planning-rel-v0.3 R7)

A `glama.json` at the repository root lets the maintainer claim the project's listing on Glama, a
directory of MCP servers. Glama accepts a sign-in with GitHub as the claim only for a repository
owned by a personal account; this one is owned by the organisation `wingfoil`, so the file is the
claim route. It carries exactly two keys: `$schema`, set to `https://glama.ai/mcp/schemas/server.json`,
and `maintainers`, the GitHub usernames allowed to maintain the listing: the approver's account. That
schema (JSON Schema draft-07, read 2026-10-05) requires `maintainers`, an array of unique strings, and
declares no other property. Like `server.json`, it is not in `files`: it is read by Glama from the
repository, not from the package, and claiming the listing is an approver step outside this pipeline.

Unchanged: `name: wingfoil`, `main`, `types`, `license: MIT`. `version` is driven by the release/tag
scheme (§4), not hand-edited at publish time.

### 2. Scripts (publish gate)

- `prepublishOnly`: `npm run build && npm test && npm run lint` — the hard gate npm runs before any
  publish (staging or prod). Must exit non-zero on any failure.
- `publish:staging`: the **local-first** entry point (`scripts/publish-staging.*`) that runs the full
  staging→smoke flow (§3) against a Verdaccio instance, usable identically on a dev machine and in CI.
- Existing `build`/`prepack`/`lint` unchanged; `prepack → build` still produces `dist/`. `test` is
  `node scripts/run-tests.cjs`: the parallel jest run, which leaves out the suites that time spawned
  processes (`test/latency-suites.cjs`). Those run alone (`jest.latency.config.js`) only when asked
  for — `npm run test:latency`, or `WINGFOIL_LATENCY=1 npm test` — and never from `prepublishOnly`,
  so no publish waits on a wall-clock measurement. See the *Revision (2026-10-03) — §2 `test`* note
  below.

### 3. Publish pipeline (`.github/workflows/publish.yml` + `scripts/publish-staging.cjs`)

Stages, in order (the CI job invokes the same `scripts/publish-staging.cjs` a developer runs locally):

1. **build + gate** — `npm ci`, then `prepublishOnly` (build/test/lint) + `npm publish --dry-run`
   (manifest visibility; must be exactly `dist` + docs per `files`).
2. **stage** — start **Verdaccio** from `scripts/publish-staging.cjs` itself, in CI exactly as locally:
   there is no service container (the workflow's `stage` job runs one staging step,
   `npm run publish:staging -- --tarball <the gate's tarball>`). The script installs a major-pinned
   **`verdaccio@6`** (`VERDACCIO_PACKAGE`) into a **throwaway per-run work dir** (`stagingPaths` under
   an `mkdtempSync` temp dir: registry storage, htpasswd, config, the verdaccio install prefix, and
   npm's own cache/prefix/user+global config, with `stagingEnv` redirecting npm into it and stripping
   inherited npm credentials), writes a **generated config** (`verdaccioConfig`) in which the package
   under test has **no `proxy:` uplink** — only the `'**'` catch-all proxies npmjs — and spawns the
   installed bin with `process.execPath` on `http://localhost:4873/`. Then `npm publish` the packed
   tarball to it (throwaway user + token registered per run, kept in the work dir). The no-uplink
   property is what makes the §3 smoke meaningful: a same-named `wingfoil` on npmjs can never satisfy
   the install. See the *Revision (2026-09-21) — §3 stage 2* note below.
3. **smoke** — in a clean environment, `npm install -g wingfoil --registry http://localhost:4873`,
   then run the `dl-023` init+CLI e2e smoke (assert `wingfoil --help` on PATH exits 0, and the
   fresh-init CLI surface is schema-valid). Verdaccio is torn down after.
4. **promote** — only if smoke passes, **stage** the **same** tarball on the public npm registry:
   `npm stage publish` with **provenance**, authenticated by the stage-only **trusted publisher**
   over GitHub OIDC (`id-token: write`; no token, no `.npmrc`; §5). The version is **not live** until
   the maintainer approves it with 2FA (`npm stage approve <stage-id>`, or **Approve** under *Staged
   Packages* on npmjs.com), after inspecting it with `npm stage view` / `npm stage download`
   (`adr-011` points 1–3). `promote` alone runs **Node ≥ 24.18.0**, the oldest release
   bundling an npm (11.16.0) at or above the 11.15.0 staged publishing requires — no Node 22 release
   bundles npm 11 (`adr-011` point 4, Node dist index read 2026-09-29); `gate` and `stage` stay on
   `env.NODE_VERSION`, the `adr-010` floor. Whether `--access public` is passed as a flag or only through
   `publishConfig` is settled by the implementing task (`adr-011`, *Consequences*). Triggered on a
   `vX.Y.Z` tag on `main`.

Every third-party action the workflow uses is pinned by commit SHA to a release whose `runs.using`
is a Node runtime the GitHub-hosted runners still ship, so no job runs an action on a runtime it was
not released for (`bug-136`: the `actions/*` v4 releases target Node 20, which the runners removed
on 2026-09-23).

`act` (nektos/act) SHOULD be documented as the local way to exercise `publish.yml` before pushing, so
the workflow is not debugged through throwaway commits (`adr-009`).

### 4. Version / tag scheme

- `package.json` `version` is semver (`MAJOR.MINOR.PATCH`); v0.2 publishes `0.2.z`.
- The publish trigger is an annotated git tag `vX.Y.Z` created **on `main`** after the release branch
  merges (`dl-024`; never on a `design/*` branch). **`main` must be pushed to `origin` before the tag
  is pushed:** CI asserts that the tagged commit is an ancestor of `origin/main`, not of anyone's
  local `main` (`dl-074`). Tag ↔ `package.json` `version` must match (CI asserts this before
  promote). See the *Revision (2026-09-28) — §4* note below.
- The same gate step (`checkReleaseTag`) asserts that `server.json` `version` and every
  `packages[].version` equal `package.json` `version`, so the MCP listing can never name a version
  other than the one published (`dl-093` point 5, ratified option (a)). The cases are pinned in
  `test/cli/publish-metadata.test.ts`.

### 5. Config locations, secrets & rollback

**Where each piece of publish config lives** — the security boundary: public config in git, anything
that authenticates never in git (`security-secrets` / `spec-007`):

- **Non-secret, in `package.json` (git):** package `name`/`version`, target registry
  (`publishConfig.registry`), `access`, `provenance`, and `repository`/`author`/`homepage`/`bugs`.
- **Staging registry URL:** transient only — the `http://localhost:4873` Verdaccio address passed as
  `--registry` by `publish:staging`; not persisted anywhere.
- **Publish credential: none stored.** `promote` authenticates to npm as a **trusted publisher**
  over GitHub **OIDC**, configured on npmjs.com for package `wingfoil` with organisation `wingfoil`,
  repository `wingfoil`, workflow `publish.yml`, environment `npm-publish`, and permission limited
  to staging (`adr-011` point 2). The same OIDC identity signs provenance. No `NPM_TOKEN` secret
  exists, and no `.npmrc` is written. The package's publishing access is *require two-factor
  authentication and disallow tokens* (`adr-011` point 2, npm's recommendation for trusted
  publishers), so a leaked token of any kind could not publish.
- **No username/password is stored anywhere**, and no developer machine needs an npm credential for a
  release: the only human npm act is the 2FA approval of a staged version.

The human `approver` role owns the registry-side configuration (account 2FA, the trusted publisher,
publishing access), approves the `npm-publish` environment deployment, and approves the staged
version on npm (`adr-006`, `adr-011` points 3 and 5). Both approvals are kept for the first staged
release, and then a decision-log keeps or drops the environment reviewer (`dl-087` Q2 (iii)).

Rollback posture: prefer `npm deprecate` + a follow-up patch over `npm unpublish` (restricted); a
failed staging smoke blocks promotion, so a bad build never reaches the public registry.

## Consequences

- The three publishing tasks (metadata, flow, secrets) implement against these exact names
  (`prepublishOnly`, `publish:staging`, `.github/workflows/publish.yml`, and — until the
  2026-09-29 revision — `NPM_TOKEN`) and the §1 field
  set — no per-task divergence.
- The `dl-023` init+CLI e2e smoke sub-workflow is reused verbatim as the §3 staging smoke; a change to
  that smoke propagates here.
- v0.2's `release-cycle` `publishing` phase becomes runnable (`agent.execute # build + npm publish`
  maps onto §3 stages 1→4).
- If the staging tool later changes (e.g. to GitHub Packages, the `adr-009` alternative) the
  **pattern** (gate → stage → smoke → promote) is unchanged, so only this spec's §3 is revised — no new
  ADR needed unless the architecture (CI/CD, provenance) itself changes.
- Making `version` tag-driven (§4) means a manual `package.json` version bump outside the tag flow is
  an error the CI catches.

## Process Notes

Discovered proactively by `release-planning/identify-specs` (v0.2), exactly the gap `dl-018` T2 named
(REQ-SYS-09 had no governing packaging spec after `spec-014` was repurposed for the MCP entry point).
Companion to `adr-009` (architecture) — this spec is the file-level contract. Feature-side v0.2
artefacts (directive frontmatter, MCP Prompts) are already covered by approved `spec-013` / `spec-004`,
so no additional specs were scaffolded this phase. Filed `pending` for the `dl-022` spec-review +
approver sign-off before `approved`.

**Revision (2026-09-21) — §1: `engines.node` moved out of *Unchanged* and pinned to `>=22.12.0` as a
value derived from the production dependency closure, per `bug-023-engines-node-floor-contradicts-commander`
and `task-074-fix-engines-node-floor`.** §1 previously ratified `engines: node >=18` under
*Unchanged* — an approved spec asserting a floor the dependency tree rejects. Verified at
implementation: `commander@15.0.0` declares `engines.node >=22.12.0` and `@hono/node-server@1.19.14`
(transitive via `@modelcontextprotocol/sdk`) declares `>=18.14.1`, so the old floor was false by two
independent packages, not just the one `bug-023` named. Measured consequence on an unsupported
runtime: npm warns `EBADENGINE` and installs anyway by default (REQ-SYS-09's fit criterion still
holds), and hard-fails under `engine-strict=true` — so the defect was invisible to `task-060`'s
staging smoke, which runs on CI's Node 22. The alternative fix — pinning `commander` below 15 to keep
the 18+ claim true — was rejected: it needs a `package-lock.json` regeneration owned by `task-073`,
and `commander@15`'s ESM-only shape is the premise of `task-065`'s Jest/TS harness
(`src/cli/program.ts`'s module doc names downgrading as the alternative it rejected). Edited in place
without a supersede or a state change, per the `dl-041` / `task-059` precedent already used for
`bin.wingfoil` above. This revision is scoped to the **manifest**; the product-level Node floor
(`adr-005`, the vision package, `dna.yaml`, `README.md`, `CLAUDE.md`) was untouched here and left to
the approver — **and has since been settled**, by `adr-010-node-22-runtime-floor` (`accepted`,
`0627290`). Of the five documents named in that list, `adr-005`, the vision package, `dna.yaml` and
`CLAUDE.md` were corrected by `adr-010`'s cascade; `README.md` — the last to carry the old claim — was
corrected by the `user-docs` gate. See the *Revision (2026-09-21) — §1 Node floor* note below, which is a separate
revision from this one.

**Revision (2026-09-21) — §3 stage 2: Verdaccio is started by `scripts/publish-staging.cjs` in both
environments, not as a CI service container, per `dl-052-verdaccio-started-by-staging-script-in-ci`
(`ready`, approve commit `58ac6f9`, ratified option 1).** §3 stage 2 previously read: "start
**Verdaccio** (`npx verdaccio` locally / official image as a CI service on `http://localhost:4873`)".
Both halves of that parenthesis were false of what `task-060-publish-pipeline` shipped, and each is
checkable in one command:

- *No CI service.* `grep -rn 'services:' .github/workflows/` returns nothing; `.github/workflows/publish.yml`'s
  `stage` job has exactly one staging step, `run: npm run publish:staging -- --tarball dist-pack/*.tgz`,
  and `package.json`'s `publish:staging` is `node scripts/publish-staging.cjs` — the same entry point a
  developer runs, which is what §3's own preamble and `adr-009` §3 require ("the GitHub Actions job
  merely invokes that script").
- *No `npx`.* `grep -n 'npx' scripts/publish-staging.cjs` returns nothing. `realEffects.startRegistry`
  runs `npm install --prefix <workdir>/tools --no-save --no-audit --no-fund verdaccio@6`, reads the
  installed package's own `bin`, and spawns it with `process.execPath`.

The ratified reason the code is right and the document was wrong (`58ac6f9`): a service container
starts **before** `actions/checkout`, so it cannot be handed the repository's own config — the config
that denies the package under test an uplink. Under an image's defaults `wingfoil` would proxy to
npmjs, and the smoke would stop proving that the tarball it exercises is the one just published,
which is the entire point of the stage; it would also give CI a code path the local run does not take.
Option 3 (leave §3 as illustrative) was rejected because "the next person to follow §3 literally would
weaken the isolation guarantee and believe they were conforming".

Each of the four facts the new text asserts was verified **against the code**, at `main` `b505473`
(after `task-077` and `task-078` merged), not against `dl-052`'s summary of it: the pin is
`VERDACCIO_PACKAGE = 'verdaccio@6'`; the work dir is `mkdtempSync(join(tmpdir(), 'wingfoil-staging-'))`
with every staging path under it (`stagingPaths`) and npm redirected into it (`stagingEnv`); the
generated config (`verdaccioConfig`) gives the `'wingfoil'` package block no `proxy:` key while `'**'`
carries `proxy: npmjs`; and both of those config properties are pinned by
`test/cli/publish-staging.test.ts`. `task-077`'s first real end-to-end run resolved the pin to
verdaccio **6.10.4** and completed the stage against it. The amended text names functions rather than
line numbers on purpose: `dl-052`'s own citations and `task-079`'s were both already stale when read,
and a spec corrected from a stale description is how this text went wrong in the first place.

Edited in place — no supersede, no state change, and no `version:` bump because tech-specs carry no
`version:` field (`dl-047`) — per the `dl-041` / `task-059` / `task-074` precedent used twice above.
`dl-052`'s ratified option 1 says "No code changes", and none were made.

*Out of this revision's scope, recorded so §3's "throwaway" claim keeps the history of how it came to
hold:* `task-077`'s first real execution found that the staging run's teardown — which is what makes
"throwaway" true — executed on the success and failure paths (`runStaging`'s `finally`, in
`scripts/publish-staging.cjs`) but **not** on `SIGINT`, which left the registry, the work dir and its
live throwaway token behind. That was tracked as
`bug-059-sigint-leaks-staging-registry-and-token` — nothing this revision did changed it — and the bug
is now **`closed`**: `task-083-fix-staging-interrupt-teardown` closed the gap, so teardown runs on an
interrupt too. See the *Revision (2026-09-22) — §3 interrupt teardown* note below, which carries the
superseded wording, the signals covered and the one case that is not. The same run also found two §3
**stage 1** failures, which this paragraph once stated as present-tense fact; both have since been
repaired — see the *Revision (2026-09-22) — §3 stage 1* note below, which also carries the superseded
wording.

**Revision (2026-09-21) — §1 Node floor: the product-level "Node.js 18+" question that §1 recorded as
"deliberately NOT settled here" has since been settled by `adr-010-node-22-runtime-floor`.** This is a
**second and separate** revision from the `engines.node` one above: that one changed what the
**manifest** asserts (`>=22.12.0`, derived from the production dependency closure); this one changes
nothing normative and only records that the **product-level** claim §1 explicitly deferred is no
longer open.

- `adr-010-node-22-runtime-floor` is `accepted` — `wf(adr): approve adr-010-node-22-runtime-floor
  [pending → accepted]`, `0627290` — titled "The runtime floor is Node 22.12+, not Node 18+ —
  supersedes adr-005's runtime clause".
- `adr-005-typescript-node-stack` is `superseded` — `wf(adr): deprecate adr-005-typescript-node-stack
  [accepted → superseded]`, `a7d783a`.
- Its cascade merged as `7bb95d6` and touched exactly four files: `CLAUDE.md`,
  `docs/01_vision/01_product-brief.md`, `.wingfoil/dna.yaml` and
  `dl-001-typescript-over-python`. In `dl-001` the original sentences (`:19`, `:35`) are deliberately
  **not** rewritten — a dated *Correction (2026-09-21)* note at `dl-001:37-42` states that wherever
  that document says "Node.js 18+" the runtime clause now reads 22.12+ — so the record of what v0.1
  decided stays readable.

**What remained open — since closed.** The README's *Installation* sentence asserted the old floor
("This installs the `wingfoil` binary (Node.js 18+ required)."). It was owned by the **`user-docs`
release gate** (`dl-013`) per `adr-010`'s own action 5, and is out of scope for any tech-spec revision.
That gate has since corrected it; see the *Revision (2026-09-25)* note below.

Both occurrences of the stale framing are corrected in this pass: §1's bullet, and the closing sentence
of the `engines.node` revision note above, which said the same thing in different words. Same mechanics
as the revisions above — text edited in place, `status: approved` unchanged, no `version:` bump
(`dl-047`).

**Revision (2026-09-22) — §3 stage 1: the two stage-1 failures that the *§3 stage 2* note's closing
paragraph stated as present-tense fact have been repaired, so that paragraph is corrected to keep only
what is still true and to cite the elements that track it, per
`bug-062-spec-015-note-carries-transient-findings` and `task-084-fix-spec-015-stale-stage-1-note`.**
That paragraph previously read, in full:

> *Out of this revision's scope, recorded so §3 is not read as a statement that the pipeline runs
> today:* `task-077`'s first real execution found §3 **stage 1** currently unable to complete on a
> runner — `npm ci` fails under the npm that `publish.yml`'s own Node pin installs, and
> `prepublishOnly` fails on a UTC runner with git ≥ 2.55 — and found that the staging run's teardown,
> which is what makes "throwaway" true, executes on the success and failure paths (`runStaging`'s
> `finally`) but **not** on `SIGINT`, which leaves the registry, the work dir and its live throwaway
> token behind. Those are `task-077`'s findings and are tracked there; this revision changes nothing
> about them.

Two of its three clauses are no longer true of the tree. Each is now an element carrying a closed
state, which is what a later reader can check — where the prose above gave them only a symptom and the
id of a `done` task nothing revisits:

- **`npm ci` failing under the pinned npm** (npm 10.9.0, the npm bundled with the Node 22.12.0 that
  `publish.yml` pins) — `bug-056-npm-ci-fails-under-pinned-npm-10-9`, now `closed`
  (`wf(bug): sync bug-056-npm-ci-fails-under-pinned-npm-10-9 [in-review → resolved → closed]`,
  `fdee8cb`), fixed by `task-080-fix-npm-ci-under-pinned-npm` (`done`, merged as `ce48681`).
- **`prepublishOnly` failing on a UTC runner with git ≥ 2.55** —
  `bug-057-timestamp-assertions-reject-zulu-offset`, now `closed`
  (`wf(bug): sync bug-057-timestamp-assertions-reject-zulu-offset [in-review → resolved → closed]`,
  `65021c2`), fixed by `task-081-fix-timestamp-offset-assertions` (`done`, merged as `d1aa785`). The
  defect was in the repository's own assertions rather than in git: two `%aI` regexes rejected git's
  valid `Z` rendering of a zero offset.

The third clause **stays**, re-worded only to carry its element id, because it is not transient in the
way the other two were: §3 stage 2 asserts a **throwaway per-run work dir** and §3 stage 3 asserts the
registry is **torn down afterwards**, and the `SIGINT` path falsifies the unqualified reading of both.
It bounds a property this document itself claims, so a reader of "throwaway" needs it. It is tracked as
`bug-059-sigint-leaks-staging-registry-and-token`, read as **not closed** at `main` `307a62a`.
Deliberately not described here: its fix, which at the time of writing exists only on the unmerged
branch of `task-083-fix-staging-interrupt-teardown` — a spec that describes an unmerged branch as
shipped is this same defect pointed the other way. Whatever commit closes `bug-059` is free to re-tense
the sentence into history; it should not simply delete it, for the reason just given. That has since
happened: `task-083` merged (`de92e2b`) and `bug-059` closed (`c69a836`), and the sentence was
re-tensed rather than deleted — see the *Revision (2026-09-22) — §3 interrupt teardown* note below.

Why a revision and not a silent deletion: the original paragraph was **true when written** — the ids
now cited above did not yet exist when `task-079` wrote it — and it became false without anyone
touching the file. `bug-062` records that reasoning, including that its own first triage ("the
statement is true today, so no reader is misled before the fix") expired the same way and had to be
re-graded. Citing the element id rather than the symptom is precisely what converts a sentence that
decays silently into one a reader can check in a command.

`dl-075` is applied under its fix-on-touch disposition and **only to the paragraph edited here**: the
new text names elements, document headings and `runStaging`'s `finally` rather than line offsets. The
offsets standing elsewhere in this document — the README's in §1 and in the *§1 Node floor* note,
and that note's `dl-001` offsets — were deliberately left as they were, because a two-sentence
correction is not a licence to rewrite an approved spec. (The README ones have since been converted
by the *Revision (2026-09-25)* note below.)

Edited in place — no supersede, no state change, and no `version:` bump because tech-specs carry no
`version:` field (`dl-047`) — per the `dl-041` / `task-059` / `task-074` precedent used by the
revisions above. No code changes were made; the diff is this spec, `bug-062` and `task-084`'s own
Memory file.

**Revision (2026-09-22) — §3 interrupt teardown: the `SIGINT` gap that the *§3 stage 2* note's closing
paragraph stated as present-tense fact has been closed, so that paragraph is re-tensed into history
rather than deleted, per `bug-059-sigint-leaks-staging-registry-and-token` and
`task-085-retense-spec-015-sigint-sentence`.** This is the third of `task-077`'s findings — the one
the *Revision (2026-09-22) — §3 stage 1* note deliberately kept because it bounds a property this
document itself claims. The two sentences that carried it previously read, in full:

> `task-077`'s first real execution found that the staging run's teardown — which is what makes
> "throwaway" true — executes on the success and failure paths (`runStaging`'s `finally`, in
> `scripts/publish-staging.cjs`) but **not** on `SIGINT`, which leaves the registry, the work dir and
> its live throwaway token behind. That is tracked as
> `bug-059-sigint-leaks-staging-registry-and-token`, read as **not closed** at `main` `307a62a`; this
> revision changes nothing about it.

**What closed it, and how that was checked.** `bug-059-sigint-leaks-staging-registry-and-token` is
`closed` — `wf(bug): sync bug-059-sigint-leaks-staging-registry-and-token [in-review → resolved →
closed]`, `c69a836` — and `task-083-fix-staging-interrupt-teardown` is `done`, merged as `de92e2b`
(`Merge branch 'task/task-083-fix-staging-interrupt-teardown'`). Both commits were confirmed ancestors
of `main` with `git merge-base --is-ancestor` before this note was written; that ancestry, not either
document's `status:` field, is what the paragraph above is now tensed against, because a status line
is a claim inside a file while ancestry is a property of the history a reader can re-run.

**What the pipeline now guarantees**, read from `scripts/publish-staging.cjs` as merged at `main`
`c69a836` rather than from `task-083`'s account of itself:

- **Teardown runs on an interrupt, for the signals the script names in `TEARDOWN_SIGNALS`: `SIGINT`,
  `SIGTERM` and `SIGHUP`.** `installTeardownHandlers` installs one handler per signal, and that
  handler awaits the *same* teardown that `runStaging`'s `finally` awaits — one memoised run, whichever
  path reaches it first — so an interrupted run removes the throwaway token, stops Verdaccio and
  deletes the work dir exactly as a completed one does. `SIGTERM` carries as much weight here as
  `SIGINT`: it is what a cancelled or timed-out CI step delivers, and §3's `stage` job is one such
  step.
- **The run then dies *by* the signal.** `raiseSignal` removes the script's own handler and re-sends
  the signal, so a caller sees the conventional `128 + N` (130 for `SIGINT`) instead of a normal exit
  that happens to carry that number — an interrupted run stays distinguishable from the staging
  failure that §3 stage 4 keys promotion on.
- **The coverage has no window in time.** An interrupt that lands while Verdaccio is still coming up,
  before the readiness poll returns, tears that registry down too, rather than leaving an orphan
  holding `:4873` that would block every later run. §3 stage 2's *throwaway per-run work dir* and
  stage 3's *torn down after* therefore hold across the whole of a run, not only once the registry is
  up.
- **The one case not covered is `SIGKILL`**, which POSIX forbids catching — nothing can tear down
  after it. Teardown's internal ordering is chosen for that residue: the throwaway token is removed
  **first**, before the registry it authenticates against and before the work dir, so the credential is
  never the artefact that outlives a run. `SIGQUIT` and `SIGUSR1` are excluded deliberately rather than
  by oversight; the constant's own comment gives the reason for each.

The signal set is quoted from that constant and not from `task-083`'s acceptance criteria, which name
only `SIGINT` and `SIGTERM`: `SIGHUP` is coverage the implementation added beyond the task it came
from, and a spec written from the task would have under-stated what the code guarantees.

**Deliberately not recorded here:** how the no-window property is obtained, and the fact that an
interrupted run's completion line now reports the teardown steps actually performed instead of
asserting a fixed sentence. Both are real, and both are why `task-083` needed a second pass — but §3
states a pipeline contract, and makes no claim about the script's internal call shape or about what a
run prints. Freezing either into an approved spec would invent a contract this document does not have.

**Why re-tensed and not deleted.** §3 stage 2 asserts a **throwaway per-run work dir** and §3 stage 3
asserts the registry is **torn down afterwards**. A reader of those claims is entitled to know that
their unqualified reading once had a hole, when it was closed and by what — that is what makes
"throwaway" a checked property rather than an assurance. Deleting the sentence would leave the
document reading as though the guarantee had always held, which is the same silent decay `bug-062` was
opened about, pointed the other way. The *§3 stage 1* note anticipated this succession in as many
words ("Whatever commit closes `bug-059` is free to re-tense the sentence into history; it should not
simply delete it"), and this revision is that successor — filed as a task rather than left as a
proposal in a `done` task's notes, because nothing revisits those.

`dl-075` is applied under its fix-on-touch disposition and **only to the paragraphs edited here**: the
new text cites element ids, note headings, and the symbols `TEARDOWN_SIGNALS`,
`installTeardownHandlers`, `raiseSignal` and `runStaging`'s `finally` in `scripts/publish-staging.cjs`,
each with the commit the reading was taken at, and no line offsets. Neither edited paragraph contained
an offset to convert. The offsets standing elsewhere in this document are left exactly as the *§3
stage 1* note left them, for the reason that note gives.

Edited in place — no supersede, no state change, and no `version:` bump because tech-specs carry no
`version:` field (`dl-047`) — per the `dl-041` / `task-059` / `task-074` / `task-084` precedent used by
the revisions above. No code changes were made; the diff is this spec and `task-085`'s own Memory file.

**Revision (2026-09-25) — the README Node floor is closed.** The `user-docs` gate for `minor-v0.2`
rewrote `README.md`; its *Installation* section now reads "This installs the `wingfoil` binary
(**Node.js 22.12+** required)." (`grep -nE 'Node(\.js)? ?1[0-9]|18\+' README.md` → no output, on
branch `docs/user-docs-v0.2` at `8e5c14f4`). Every sentence of this spec that asserted the README
still carried "Node.js 18+" was therefore false, and is corrected in place: §1's `engines.node`
bullet, the closing sentence of the *§1: `engines.node`* revision, and the *What remains open*
paragraph of the *§1 Node floor* note. The same edit replaces this spec's three `README.md:115` line
offsets with the README's *Installation* heading, which is `bug-068`'s complaint; the `dl-001`
offsets are untouched. Ordered by the approver on 2026-09-25, as the settlement of the §8 item 4
question the user-docs plan left open. Edited in place — no supersede, no state change, no `version:`
field (`dl-047`) — per the precedent of the revisions above.

**Revision (2026-09-28) — §4: the tag bullet now states that `main` must be pushed to `origin` before
the tag is pushed, because the publish gate checks ancestry of the pushed `main` rather than of the
local one, per `dl-074-tag-must-be-on-pushed-main`.** The bullet previously read, in full:

> - The publish trigger is an annotated git tag `vX.Y.Z` created **on `main`** after the release branch
>   merges (`dl-024`; never on a `design/*` branch). Tag ↔ `package.json` `version` must match (CI
>   asserts this before promote).

That wording is true and incomplete. `.github/workflows/publish.yml`'s `gate` job, in its step "Tag
commit is on main (dl-024)", runs, quoted verbatim (read at `main` `999b95d5`, where the file was last
changed in `d9753fd5`):

```
          git fetch --no-tags origin main
          git merge-base --is-ancestor "$GITHUB_SHA" origin/main
```

A tag created on a local `main` that has not been pushed therefore fails the gate. It fails with a
bare exit 1 and no output, so the remedy cannot be seen from the error. `dl-074` (`ready`) was
ratified as (a) + (b). This note discharges (a); (b), the executable push step, lives in
`release-publishing-rel-v0.2-plan`. On `dl-074` Action 3, the approver ruled on 2026-09-28 that the
sentence is mirrored: `dl-024` decision 2 carries it too, as a dated amendment.

Edited in place — no supersede, no state change, and no `version:` bump because tech-specs carry no
`version:` field (`dl-047`) — per the `dl-041` / `task-059` / `task-074` / `task-084` / `task-085`
precedent.

**Revision (2026-09-29) — §1, §1a, §3 stage 4, §4 and §5: promotion through npm staged publishing
with a stage-only OIDC trusted publisher and no token (`adr-011`, from `dl-087`); the public identity
and the discovery metadata (`dl-091`, `dl-093`); action runtimes (`bug-136`).** Written in v0.2.2
`release-planning/identify-specs` (`release-planning-rel-v0.2.2-plan` step 5), ahead of the tasks that
implement it: this is the contract they build to, and until they land, `publish.yml` and
`package.json` still show the previous text's behaviour. What changed:

- **§3 stage 4** previously read: "only if smoke passes, publish the **same** tarball to the public
  npm registry with **provenance** (GitHub OIDC; `id-token: write` permission)". It now stages, and a
  maintainer's 2FA approval makes the version live (`adr-011` point 1). The job's Node leaves the
  floor for that one job only (`adr-011` point 4).
- **§5** previously kept the publish secret in the Actions secret store as `NPM_TOKEN`, written to a
  transient `.npmrc`, with the approver providing and rotating it. There is now no stored credential
  (`adr-011` point 2). The approver's role moves from rotating a token to owning the registry-side
  configuration.
- **§1** fixes `<owner>` as `wingfoil` and adds `description`, `keywords` and `mcpName`. **§1a** is
  new: `server.json`. **§4** gains the version-sync assertion `dl-093` ratified as option (a).
- **§3** gains the rule on action runtimes that `bug-136` showed was missing.

The pattern gate → stage → smoke → promote is unchanged, and so are §2 and §3 stages 1–3. So this
is a revision, not a new spec, as *Consequences* anticipated for a change that leaves the
architecture's shape intact. Edited in place — no supersede, no state change, and no `version:` bump
(`dl-047`) — per the precedent of the revisions above.

**Revision (2026-10-02) — §1 `engines.node`: "the highest floor" defined as the least element of the
closure's intersection, and the assertion is two-sided (`task-155`, `bug-047`).** §1 said the floor
"must equal the highest `engines.node` floor" of the production closure without saying what the floor
of a compound range is. Read as the maximum of each range's own minimum, the rule is unsatisfiable as
soon as one range has a gap above that maximum: with `>=22.12.0` and `^20.19.0 || ^22.13.0 || >=24`
(the shape `eslint@10` declares; a devDependency today, so outside the closure), `>=22.12.0` fails the
satisfies assertion and `>=22.13.0` fails the equality one. The bullet now names the reading that
always has an answer, the lowest version every range admits, which `.github/workflows/publish.yml`'s
Node-versions header already used ("the lowest version every PRODUCTION dependency accepts"). The
value is unchanged: `>=22.12.0`, set by `commander@15`. The bullet also records that the assertion
now checks equality as well as satisfaction; before `task-155` it checked satisfaction only.
Edited in place: no supersede, no state change, no `version:` bump (`dl-047`), as in the revisions above.

**Revision (2026-10-03) — §2 `test`: `npm test` leaves the latency suites out, and runs them only
when asked for (`task-154`, `bug-013`; approver ruling 2026-10-03).** §2 said the `test` script was
unchanged, and it was `jest`. `task-154` added `test/cli/command-latency.test.ts`, which spawns
REQ-PERF-02's three commands and asserts each one's marginal cost over a measured process-start
floor against 1,000 ms at p95 (that the requirement words the total, start-up included, is a
deviation pending a decision-log). That budget presupposes an otherwise idle machine: inside jest's
parallel run, or beside other jobs, it has failed with nothing in the commands changed. So the suites
listed in `test/latency-suites.cjs` are ignored by `jest.config.js` and run alone, by
`jest.latency.config.js`, only when asked for: `npm run test:latency`; `npm test` with
`WINGFOIL_LATENCY=1`, as a second pass after a passing parallel run; or `npm test` with an argument
naming one of those suites, which sends that invocation to the latency config. With any other
argument, `npm test` runs only the parallel run, with the arguments unchanged. `prepublishOnly` is
unchanged, sets no such variable, and so neither CI nor the publish workflow runs the latency suites.
Edited in place: no supersede, no state change, no `version:` bump (`dl-047`), as in the revisions
above.

**Revision (2026-10-05, `task-165-put-bootstrap-commands-command-surface-mcp-specs-bootstrap`) — the
staging script is named by its file, per `bug-204`.** The `scope` field, §3's heading and stages, and
the 2026-09-21 revision named the script without its extension, a path that does not exist; the file
has always been `scripts/publish-staging.cjs` (the same revision quotes `package.json`'s
`node scripts/publish-staging.cjs`). Each occurrence now names it. No stage, script or other rule
changed. Edited in place without a supersede or a state change, per `dl-047` (no `version:` field).

**Revision (2026-10-05) — §1b `glama.json`: the root file that claims the Glama listing (`task-157`,
`dl-093`; release-planning-rel-v0.3 R7).** The spec named one listing input at the repository root,
`server.json` (§1a). `task-157` adds a second, `glama.json`, for the Glama directory, which accepts
it as the only claim route for a repository owned by an organisation. §1b states its two keys, the
schema it is validated against, and that it stays out of the tarball, which
`test/cli/publish-metadata.test.ts` pins. The `files` allowlist and the publish pipeline are
unchanged. Edited in place: no supersede, no state change, no `version:` bump (`dl-047`), as in the
revisions above.

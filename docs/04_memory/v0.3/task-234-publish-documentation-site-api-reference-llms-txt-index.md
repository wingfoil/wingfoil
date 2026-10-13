---
id: "task-234-publish-documentation-site-api-reference-llms-txt-index"
type: task
title: "Publish a documentation site with the API reference and an llms.txt index"
status: in-review
release: "v0.3"
kind: "feature"
priority: "low"
tags: ["v0.3", "process", "trust", "docs", "ci"]
ref: "dl-129"
bug: []
depends_on: ["task-224-add-readme-badges-reproducible-terminal-demo-drives-example"]
tmpl_version: 260703
---

## Description

A site built from the Markdown `user-docs` already owns plus TypeDoc output, and an agent-facing index that a parity test keeps true.

## Acceptance Criteria

- (characterization) a Pages workflow assembles the user-docs Markdown and `npm run docs:api` output into one artefact; no new dependency.
- (red-first) `llms.txt` generated from a declared list at the site root and repository root; a test fails if a listed path does not exist (dl-116 shape).
- (characterization) `package.json` `homepage` set to the site URL; `user-docs.yaml` `produces:` gains `llms.txt` and the site sources; version bumped.
- (characterization) post-merge, approver: Pages enabled and repository homepage set, each recorded as a `service`.

## Implementation Notes

- **Size:** M · **wave:** 3 · **kind:** feature (`dl-133` Q1 (b)).
- **Implements:** dl-129 §2 (Q2 (b)), §3 (Q3 (b)).
- **Notes:** Proposal key: D36.
- Planned by `release-planning-rel-v0.3-plan` step 6 (build-backlog), 2026-09-30.

## Execution Notes

### design (developer, 2026-10-13)

- **Sources read.** `dl-129` is `ready`, ratified with Q2 (b) and Q3 (b)
  (`git log --format='%h %s%n%b' --grep=dl-129 | grep -A3 approve` → `adfc3c39 … [in-discussion → ready]`,
  `Reason: … Q1 (b) for the first run, then (a); Q2 (b); Q3 (b).`). `dl-116`, `dl-010`, `dl-088` are `ready` and
  `spec-015` is `approved` (`grep -n '^status' docs/04_memory/design/{dls/dl-116*,dls/dl-010*,dls/dl-088*,specs/spec-015*}.md`).
  `spec-015` §1 already allows the change: `homepage: the repo README/pages URL`
  (`grep -n 'homepage' docs/04_memory/design/specs/spec-015-packaging-publishing.md` → line 42), so no spec amendment.
  `depends_on: task-224` is `done` (`grep -n '^status' docs/04_memory/v0.3/task-224-*.md`); its notes leave
  `user-docs.yaml` at 1.5, keep `align-user-docs`' `checks.post` verbatim (pinned by
  `test/core/workflow-repository-conformance.test.ts`, which this task keeps) and set the precedent of a post-merge
  approver AC left unasserted (as `task-214` AC 4). Batch ruling D4 (w3-b7 notes): Pages in a NEW workflow file,
  never `publish.yml`; Pages enable, repository homepage and the services are the approver's after a push.
- **Facts at `db0e2752`.** `gh api repos/wingfoil/wingfoil/pages` → HTTP 404 (no site); `gh api repos/wingfoil/wingfoil
  --jq .homepage` → `https://www.npmjs.com/package/wingfoil` (recorded in `svc-004`'s Configuration);
  `gh api repos/wingfoil/wingfoil/environments --jq '.environments[].name'` → `npm-publish` only; `package.json`
  `homepage` → `https://github.com/wingfoil/wingfoil#readme`, pinned by `test/cli/publish-metadata.test.ts:124–138`;
  `git ls-files | grep -c llms` → 0. `typedoc.json` has `"emit": "none"`: `npm run docs:api` is a validation gate that
  writes nothing, so the site passes `--emit docs --out …` on the command line. Trial (output to a scratch dir, nothing
  in the worktree): `npm run -s docs:api -- --emit docs --out <scratch>/api` → exit 0 in 10 s, 1101 files,
  `index.html` + `assets/ classes/ functions/ interfaces/ modules/ types/ variables/ .nojekyll`, no `_`-prefixed path.
- **Site URL (homepage): `https://wingfoil.github.io/wingfoil/`.** Derived from `package.json` `repository.url`
  (`git+https://github.com/wingfoil/wingfoil.git`): GitHub Pages serves a project repository `<owner>/<repo>` at
  `https://<owner>.github.io/<repo>/`; `wingfoil/wingfoil.github.io` does not exist (`gh api
  repos/wingfoil/wingfoil.github.io` → 404), so no organisation site or custom domain overrides it (domains wait,
  `svc-004`, dl-091 D7).

#### Design

- **One declaration, two consumers — `docs/site.yaml`** (new, `version: 1.0`). It lists the site's sources and the
  `llms.txt` index; the site assembly and the generator both read it, so the two cannot drift.
  ```yaml
  version: 1.0
  title: WingFoil
  summary: "<one line, the llms.txt blockquote>"
  pages:            # Markdown copied into the site at the SAME relative path (relative links keep working)
    - README.md     # becomes the site index (jekyll-readme-index)
    - docs/user-guide.md
    - docs/cli-reference.md
    - docs/agents.md
    - CHANGELOG.md
    - COLLABORATION.md
    - CONTRIBUTING.md
    - SECURITY.md
    - CODE_OF_CONDUCT.md
  files:            # directories copied as-is, recursively (trailing slash)
    - docs/examples/
    - docs/assets/
  llms:             # the llms.txt sections, in this order
    - section: Docs
      entries:
        - { title: User guide, path: docs/user-guide.md, about: "…" }
        - { title: CLI reference, path: docs/cli-reference.md, about: "…" }
        - { title: Guide for AI agents, path: docs/agents.md, about: "…" }
        - { title: Examples, path: docs/examples/README.md, about: "…" }
    - section: Optional
      entries:
        - { title: API reference, site_path: api/, built_by: docs:api, about: "…" }
        - { title: Changelog, path: CHANGELOG.md, about: "…" }
  ```
  Every `llms` entry has either `path` (a repository file that is in the site) or `site_path` + `built_by` (a page the
  workflow generates; `built_by` names a `package.json` script). dl-129 Decision 3's four documents are the `Docs`
  section.
- **Generator — `scripts/build-site.cjs`** (new, + `scripts/build-site.d.cts`, as every tested script). Requires only
  `node:` built-ins and `js-yaml` (already a dependency): no new dependency (dl-010, dl-129 Q2 (b)). Exports:
  - `readSiteManifest(root: string): SiteManifest` — parses `<root>/docs/site.yaml`.
  - `checkSiteManifest(root: string, manifest: SiteManifest, scripts: Readonly<Record<string, string>>): string[]` —
    the problems, sorted; `[]` means sound. One line each, exactly:
    `docs/site.yaml: listed path does not exist: <p>` (any `pages`, `files` or `llms` `path`);
    `docs/site.yaml: llms entry is not part of the site: <p>` (a `path` neither in `pages` nor under a `files` dir);
    `docs/site.yaml: unknown npm script: <s>` (`built_by`);
    `docs/site.yaml: page contains a Liquid tag, which Jekyll would evaluate: <p>` (a `pages` file containing `{{`
    or `{%`; none does today: `grep -c '{{\|{%'` over the nine pages → 0 each).
  - `renderLlmsTxt(manifest: SiteManifest, homepage: string): string` — `# <title>\n\n> <summary>\n`, then per section
    `\n## <section>\n\n` and one line per entry `- [<title>](<homepage><path | site_path>): <about>\n`; ends with exactly
    one `\n`. Absolute URLs under `homepage`, so the SAME bytes are correct at the repository root and the site root
    (dl-129 Decision 3: "the same file"); the raw `.md` is served next to the rendered page (below).
  - `assembleSite(root: string, outDir: string, options: { ref: string }): { files: readonly string[] }` — `outDir`
    must not exist or be empty (throws otherwise); copies `pages` and `files`; writes `llms.txt`
    (= `renderLlmsTxt(manifest, package.json homepage)`) and a fixed `_config.yml` (title, description); in each
    copied Markdown page rewrites a relative link (`](…)` / `src="…"`) whose target is NOT in the site to
    `<repository>/blob/<ref>/<path>` (file) or `<repository>/tree/<ref>/<path>/` (directory), `<repository>` =
    `package.json` `repository.url` without `git+`/`.git`; in-site links, anchors and absolute URLs are untouched.
    Returns the written paths, sorted. No clock, no randomness, sorted directory walks (determinism directive).
  - CLI: `node scripts/build-site.cjs llms` writes `<root>/llms.txt`; `llms --check` exits 1 naming `llms.txt` when it
    differs from the render; `site --out <dir> --ref <sha>` assembles; any manifest problem → stderr lines, exit 1;
    unknown sub-command or missing option → exit 2 (spec-008 exit codes). `--root <dir>`, default the cwd.
- **Pages workflow — `.github/workflows/pages.yml`** (new; `publish.yml` untouched, D4). Shape:
  - `on: { push: { tags: ['v[0-9]+.[0-9]+.[0-9]+'] }, workflow_dispatch: {} }` — the tag filter equal to publish.yml's,
    so the site documents the released version that npm's `homepage` points at (decision 1 below).
  - top-level `permissions: { contents: read }`; `concurrency: { group: pages, cancel-in-progress: false }`;
    `env.NODE_VERSION` equal to publish.yml's (`22.12.0`).
  - job `build` (`ubuntu-24.04`, `timeout-minutes: 15`, no `permissions` key): checkout (the publish.yml line,
    `persist-credentials: false`) → setup-node (the publish.yml line, `package-manager-cache: false`) → `npm ci` →
    `node scripts/build-site.cjs site --out _site-src --ref "$GITHUB_SHA"` → `npm run docs:api -- --emit docs --out
    _site-src/api` → `actions/configure-pages` → `actions/jekyll-build-pages` (`source: ./_site-src`,
    `destination: ./_site`) → `actions/upload-pages-artifact` (`path: ./_site`).
  - job `deploy` (`needs: build`, `ubuntu-24.04`, `timeout-minutes: 10`), `permissions: { pages: write, id-token: write }`
    (deploy-pages' documented set, on this job only), `environment: { name: github-pages, url: ${{
    steps.deployment.outputs.page_url }} }`, one step `id: deployment` → `actions/deploy-pages`.
  - Pins (resolved read-only: `gh api repos/<action>/releases/latest --jq .tag_name`, then
    `gh api repos/<action>/commits/<tag> --jq .sha`):
    `actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0`,
    `actions/jekyll-build-pages@44a6e6beabd48582f863aeeb6cb2151cc1716697 # v1.0.13`,
    `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0`,
    `actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1`.
  - Rendering: `jekyll-build-pages` is GitHub's own Pages builder (a docker action, not an npm package); its
    `jekyll-optional-front-matter` renders the Markdown and, by default, ALSO keeps each original `.md` in the output
    ("By default the original markdown files will be included as static pages in the output" — the plugin README,
    `gh api repos/benbalter/jekyll-optional-front-matter/readme`), so `llms.txt`'s `.md` URLs resolve for agents while
    humans get HTML; `jekyll-relative-links` turns `.md` links into page links. TypeDoc's HTML has no front matter and
    is copied as static files.
- **`package.json`:** only `homepage` → `https://wingfoil.github.io/wingfoil/` (own line; no script line needed — the
  workflow calls the script directly). `task-241` merges first; no overlap with its lines.
- **`user-docs.yaml` 1.5 → 1.6** (header: `1.6 dl-129 Q2 (b), Q3 (b) (task-234): align-user-docs produces llms.txt and
  docs/site.yaml`); `align-user-docs` `produces:` + `llms.txt`, `docs/site.yaml` (the site's declared sources; the
  pages it lists are already produced); `checks.post` unchanged. `WORKFLOW.md`: the `align-user-docs` node only.
  `.gitignore` + `_site/`, `_site-src/` (local assembly).

#### AC classification (corrected) and what the qa agent pins

None of the behaviours exists at `db0e2752` (facts above), so a guard written first fails genuinely: AC 1–3 are
**red-first** (testing directive T1; precedent task-214/224). A few assertions are characterization by nature and pass
on first run: the publish.yml lines reused, publish.yml not touched. AC 4 is **manual, unasserted** (GitHub's state).

| AC | Class | Test file (qa) |
|---|---|---|
| 1 Pages workflow, one artefact, no new dependency | red-first | `test/cli/pages-workflow.test.ts` (new) |
| 2 `llms.txt` from a declared list, parity test | red-first | `test/docs/llms-txt.test.ts` (new) |
| 3 `homepage`; `produces:` + version | red-first | `test/cli/publish-metadata.test.ts` (edit :124–138), `test/docs/llms-txt.test.ts` "AC 3" |
| 4 post-merge Pages + homepage as services | manual | none — handover below |

- **AC 1** (offline YAML, the `scorecard-workflow.test.ts` / `ci-workflow.test.ts` pattern: `js-yaml` `load`,
  `usesLines`): `.github/workflows/pages.yml` exists; `on` keys exactly `push`, `workflow_dispatch`; `on.push` has only
  `tags`, equal to publish.yml's `on.push.tags`; top-level permissions exactly `{contents: read}`; `build` has no
  `permissions`; `deploy.permissions` exactly `{pages: write, id-token: write}`, `needs: build`, environment name
  `github-pages` with url `${{ steps.deployment.outputs.page_url }}`; concurrency `{group: pages, cancel-in-progress:
  false}`; `env.NODE_VERSION` equal to publish.yml's; both jobs `runs-on: ubuntu-24.04` and a positive
  `timeout-minutes`; build steps in the order above, with checkout and setup-node lines each one publish.yml already
  has (+ `persist-credentials: false`, `package-manager-cache: false`), a `run` equal to `npm ci`, a `run` containing
  `node scripts/build-site.cjs site --out _site-src --ref "$GITHUB_SHA"`, a `run` containing
  `npm run docs:api -- --emit docs --out _site-src/api`, jekyll-build-pages `with` `{source: ./_site-src,
  destination: ./_site}`, upload-pages-artifact `with.path` `./_site`; the four Pages `uses:` lines exactly the table
  above; no `secrets.` in the file; no `upload-artifact`, `npm install`, `gem install`, `pip` anywhere; publish.yml
  contains neither `deploy-pages` nor `pages: write` (characterization). **No new dependency:** every `require(…)` in
  `scripts/build-site.cjs` is a `node:` built-in or `js-yaml`. Cross-pin: the `site_path` of the `built_by: docs:api`
  entry in `docs/site.yaml` is `api/`, the suffix of the workflow's `--out _site-src/api`.
- **AC 2** (imports `../../scripts/build-site.cjs`, signatures above; temp fixtures with `mkdtempSync(join(tmpdir(),
  …))` + `rmSync` in `afterEach`, holding a `package.json` and a `docs/site.yaml`):
  - the real repository: `checkSiteManifest(REPO_ROOT, readSiteManifest(REPO_ROOT), pkg.scripts)` → `[]` — **this is
    the test that fails when a listed path does not exist** (dl-116 shape: two sides, one derived from the other);
  - negative fixtures, one per problem line above (exact strings): a missing `pages` path, a missing `llms` `path`,
    an `llms` path not in the site, `built_by: nope`, a page containing `{{` — each yields its line;
  - `llms.txt` exists at the repository root and equals `renderLlmsTxt(manifest, pkg.homepage)` byte for byte;
  - render contract on a fixture manifest: the exact expected text (header, blockquote, `## ` sections in order, entry
    lines `- [t](<homepage><path>): about`, `site_path` entries likewise, single trailing newline); two calls equal;
  - the real manifest's `llms` paths include `docs/user-guide.md`, `docs/cli-reference.md`, `docs/agents.md`,
    `docs/examples/README.md`, and a `site_path: api/` entry with `built_by: docs:api` (dl-129 Decision 3);
  - `assembleSite(REPO_ROOT, <tmp>/out, { ref: '0123456789abcdef0123456789abcdef01234567' })`: `<out>/llms.txt`
    byte-equal to the repository-root `llms.txt`; every `pages` path and every file under each `files` dir present;
    `_config.yml` present; README's `[...](docs/)` link (not in the site) rewritten to
    `https://github.com/wingfoil/wingfoil/tree/0123…4567/docs/`, its `](docs/user-guide.md)` link unchanged; returned
    `files` sorted; a second call on a non-empty `outDir` throws;
  - CLI (`spawnSync('node', ['scripts/build-site.cjs', …])`): `llms --check` in the repository → exit 0; in a fixture
    whose `llms.txt` differs → exit 1 and stderr naming `llms.txt`; an unknown sub-command → exit 2.
- **AC 3:** `publish-metadata.test.ts` — `homepage` is `https://wingfoil.github.io/wingfoil/`, built in the test as
  `https://${owner}.github.io/${repo}/` from `REPO_SLUG`; the "same repo" test keeps `repository.url` and `bugs.url`
  containing `github.com/${REPO_SLUG}` and asserts the homepage is that slug's Pages URL. `llms-txt.test.ts` "AC 3":
  `align-user-docs` `produces` contains `llms.txt` and `docs/site.yaml`; `version` `toBeGreaterThan(1.5)` plus the
  header history line containing `1.6 dl-129` (bug-314 form).
- **AC 4:** none (GitHub's state, read after a push; testing directive T1).

#### Files (session 3)

`.github/workflows/pages.yml`, `docs/site.yaml`, `scripts/build-site.cjs`, `scripts/build-site.d.cts`, `llms.txt`
(generated by `node scripts/build-site.cjs llms`), `package.json` (`homepage`), `.wingfoil/workflows/custom/user-docs.yaml`
(1.5 → 1.6), `.wingfoil/WORKFLOW.md` (align-user-docs node), `.gitignore`. No `src/` change, so coverage cannot move.
No Memory element other than this file is edited by the task; `svc-004`'s homepage line changes only with the
approver's post-merge action (handover).

#### Post-merge handover (approver, after the push to `main`)

1. Enable Pages with the workflow source: Settings → Pages → Source "GitHub Actions" (or
   `gh api -X POST repos/wingfoil/wingfoil/pages -f build_type=workflow`).
2. Allow the release tags to deploy: Settings → Environments → `github-pages` → Deployment branches and tags → add the
   tag rule `v*` (GitHub's default rule admits the default branch only, so a tag run's `deploy` job would be refused).
   Read back: `gh api repos/wingfoil/wingfoil/environments/github-pages/deployment-branch-policies`.
3. First deployment: `gh workflow run pages.yml --ref main` (the site then shows `main`'s docs until the `v0.3.0` tag
   redeploys it), or wait for the tag. Verify: `gh run list --workflow pages.yml --limit 1`;
   `curl -sI https://wingfoil.github.io/wingfoil/` → 200; `curl -s https://wingfoil.github.io/wingfoil/llms.txt | diff -
   llms.txt` → empty; `curl -sI https://wingfoil.github.io/wingfoil/api/index.html` and
   `…/docs/user-guide.md` → 200.
4. Only then set the repository homepage (so it never points at a 404):
   `gh api -X PATCH repos/wingfoil/wingfoil -f homepage=https://wingfoil.github.io/wingfoil/`.
5. Record (dl-088, dl-129 Action 4): a new `service` for Pages (`kind: setting`, `verify: "gh api
   repos/wingfoil/wingfoil/pages --jq '{status,build_type,html_url}'"`, `url: https://wingfoil.github.io/wingfoil/`,
   `repo_refs: [.github/workflows/pages.yml, docs/site.yaml, llms.txt, package.json]`, `decision: dl-129-trust-signals`,
   `set_up_in: v0.3`, Configuration naming the `github-pages` tag rule), then for the homepage see decision 3.
6. npm shows the new `homepage` only from the next publish (`v0.3.0`).

#### Decisions for the approver (recommendations)

1. **Trigger:** (a) release tag + manual dispatch — the site matches the published package the npm `homepage` points
   at, at the cost of handover step 2 — or (b) every push to `main` (no environment rule; the site can describe
   unreleased commands). **Recommend (a).**
2. **Rendering:** GitHub's `actions/jekyll-build-pages` (HTML for humans, the raw `.md` kept for agents; no npm
   dependency) vs. uploading the raw assembly (Markdown served as text). **Recommend Jekyll.**
3. **The homepage's record:** D4 says "the two `service` elements", but `svc-004` already records the repository
   `homepage` (its Configuration and `verify`), and its Management says a change is made by editing that element. A
   second element would hold the same setting twice, and `svc-004` would read wrong anyway. **Recommend: one new
   service for Pages + a `memory amend` of `svc-004`'s homepage line** (Reason: dl-129 Decision 2 replaces the npm URL
   with the documentation site).
4. **Out-of-site links** in copied pages are rewritten to the repository at the built commit (no 404 on the site, no
   edit to the Markdown). Recommend as designed.
5. `docs/agents.md` is published on the site and indexed in `llms.txt` (dl-129 Decision 3) while staying in no
   phase's `produces:` (`user-docs-rel-v0.2-plan` §10); this task does not change that.

### red (qa, 2026-10-13)

- **Red commit:** `c2a943a1` (T4 is measured from it). Test files: `test/cli/pages-workflow.test.ts` (new),
  `test/docs/llms-txt.test.ts` (new), `test/cli/publish-metadata.test.ts` (edit: the `homepage` case and the
  "same repo" case, plus a `PAGES_URL` constant derived from `REPO_SLUG` and a header line). No fixture file: the
  fixtures are temp directories built in `llms-txt.test.ts`.
- **Loading the script.** `scripts/build-site.cjs` is loaded inside each case with a dynamic `import()` after
  `expect(existsSync(SCRIPT)).toBe(true)` (jest's CommonJS harness turns it into a `require`; `require` itself is
  refused by the lint gate's `no-require-imports`). The interface is declared in the test from the design's
  signatures; the manifest is opaque (always from `readSiteManifest`), so the tests do not fix its in-memory shape.
- **Per AC.**
  - **AC 1, red-first** — `pages-workflow.test.ts`, 14 cases named `AC 1…`: trigger (keys `push`,
    `workflow_dispatch`; `on.push` only `tags`, equal to publish.yml's), permissions (top `{contents: read}`, none
    on `build`, `{pages: write, id-token: write}` on `deploy`), jobs `build`/`deploy` on `ubuntu-24.04` with a
    positive timeout, `deploy.needs` = `build`, concurrency, `env.NODE_VERSION` = publish.yml's, the deploy
    environment and its single `id: deployment` step, the eight build steps in order with jekyll `with` and upload
    `path`, checkout/setup-node lines taken from publish.yml with `persist-credentials: false` /
    `package-manager-cache: false`, every `uses:` SHA-pinned and the four Pages pins exactly as the design lists
    them (the set of actions is exactly the six), no `secrets.` / `upload-artifact@` / `npm install` /
    `gem install` / `pip` on non-comment lines, every `require` of `build-site.cjs` a `node:` built-in or
    `js-yaml`, and the `built_by: docs:api` entry's `site_path: api/` matching `--out _site-src/api`. One case is
    **characterization** and passes: publish.yml contains neither `deploy-pages` nor `pages: write`.
  - **AC 2, red-first** — `llms-txt.test.ts`: the real-repository parity (`checkSiteManifest` → `[]`, the case that
    fails when a listed path does not exist), `llms.txt` at the root byte-equal to `renderLlmsTxt(manifest,
    pkg.homepage)`, the four dl-129 Decision 3 paths + one `site_path: api/` / `built_by: docs:api` entry; one fixture
    per problem line with the exact strings (missing page, missing llms path under a `files` dir, llms path not in the
    site, `built_by: nope`, a page with `{{` and one with `{%`) and a sorted two-problem case; the exact render of a
    fixture manifest and its repeatability; `assembleSite(REPO_ROOT, …, { ref })` (`llms.txt` byte-equal, every page
    and every file under each `files` dir, `_config.yml`, `files` sorted and existing, README's `](docs/)` rewritten to
    `https://github.com/wingfoil/wingfoil/tree/<ref>/docs/` with `](docs/user-guide.md)` kept, a second call on the
    non-empty directory throws); the CLI (`llms --check` exit 0 here and on a fixture whose `llms.txt` is the render,
    exit 1 naming `llms.txt` on a stale one, `nope` exit 2).
  - **AC 3, red-first** — `publish-metadata.test.ts`: `homepage` = `https://wingfoil.github.io/wingfoil/`, built from
    `REPO_SLUG`; the "same repo" case keeps `repository.url`/`bugs.url` containing the slug and asserts the Pages
    URL. `llms-txt.test.ts` "AC 3": `align-user-docs` `produces` (string or `{ path }` entries) contains `llms.txt`
    and `docs/site.yaml`; `version` > 1.5 and the `version:` line contains `1.6 dl-129` (bug-314 form).
  - **AC 4** — manual, no test.
- **Run** (`npx jest test/cli/pages-workflow.test.ts test/docs/llms-txt.test.ts test/cli/publish-metadata.test.ts
  --maxWorkers=2`): 3 suites failed; 37 failed / 99 passed of 136. Per file: `pages-workflow` 13 failed / 1 passed
  (the publish.yml characterization); `llms-txt` 22 failed / 0 passed; `publish-metadata` 2 failed / 98 passed.
  First failing assertion of each failing case: AC 1 and AC 2 cases — `expect(existsSync(…)).toBe(true)` →
  `Received: false` (pages.yml, build-site.cjs, docs/site.yaml or llms.txt); AC 3 `produces` — `Expected value:
  "llms.txt"`, received the 1.5 list; AC 3 version — `Expected: > 1.5`, `Received: 1.5`; the two homepage cases —
  `Expected: "https://wingfoil.github.io/wingfoil/"`, `Received: "https://github.com/wingfoil/wingfoil#readme"`.
  `npx eslint` on the three files → clean; `npx tsc --noEmit -p tsconfig.json` → no error in them.
- **Readings the developer should know** (taken from the design, not reinterpreted): the forbidden-word scan runs on
  non-comment lines only (a header may say what the file never does); `pip` is matched as a word. `assembleSite`'s
  returned paths are checked with `resolve(out, p)`, so relative or absolute both pass. `deploy.needs` may be
  `build` or `[build]`.
- **Send-back (qa, 2026-10-14), review F1 and F3, red-first.** Red commit `77794685` (T4 for these files is measured
  from it). New `test/docs/build-site-confinement.test.ts` (10 cases); the `llms-txt` fixture helpers moved, unchanged,
  to `test/docs/support/site-fixture.ts`, which both suites import (no assertion of `llms-txt.test.ts` changed).
  F1: `checkSiteManifest` returns exactly `docs/site.yaml: listed path escapes the repository: <p>` for a `pages` entry
  (`../outside/secret.md`, `docs/../../outside/secret.md`, an absolute path), a `files` entry (`../outside/`) and an
  `llms` `path`, sorted with the others (escape + unknown script); `assembleSite` throws that line, and `site --out
  <tmp>/out/site` exits 1 with it on stderr for `pages` and `files`, with nothing under `<tmp>/out` but an empty or
  absent `site/`. F3: a page with `` `[inline](../other/a.txt)` `` keeps it verbatim while `[real](../other/a.txt)`
  beside it becomes `https://github.com/example/fixture/blob/<ref>/other/a.txt`. Run (`npx jest
  test/docs/build-site-confinement.test.ts test/docs/llms-txt.test.ts --maxWorkers=2`): confinement 10 failed / 0
  passed, `llms-txt` 22 passed. First failing assertion: the `..` cases `Received: []`; the absolute case received
  `listed path does not exist: <abs>`; the `llms` case received `llms entry is not part of the site: ../outside/secret.md`;
  the sorted case lacks the escape line; `assembleSite` "did not throw"; both CLI cases `Expected: 1, Received: 0`;
  F3 the inline span was rewritten (substring not found). eslint clean, `tsc --noEmit` no error in the three files.
- **Send-back (qa, 2026-10-14), red-test fault after `f386a40c`.** `expectNothingWritten` read `<tmp>/out` with
  `readdirSync`, which a refusal that writes nothing never creates, so the `assembleSite` row and both `site --out`
  rows failed with `ENOENT … scandir '<tmp>/out'` in the helper, not on the code. Fixed in `16348b7c`: an absent
  `<tmp>/out` counts as nothing written; the checks that `<tmp>/out/outside` does not exist and that the output
  directory is empty or absent are unchanged. `npx jest test/docs/build-site-confinement.test.ts --maxWorkers=2` →
  10 passed / 10; eslint clean.

### green (developer, 2026-10-13)

- Approver rulings on the design (2026-10-13, w3-b7 notes): (1) release tag + `workflow_dispatch`, the `github-pages`
  environment's `v*` rule and a handover to `task-265`/`task-266` (dl-159) in the post-merge section; (2)
  `actions/jekyll-build-pages`; (3) one new Pages `service` + a `memory amend` of `svc-004`'s homepage line, both the
  approver's after the push; (4) out-of-site links rewritten; (5) `docs/agents.md` on the site and in `llms.txt`, in no
  `produces:`.
- `3db217f9 feat(docs): task-234 — …`: `docs/site.yaml` (1.0), `scripts/build-site.cjs` + `.d.cts`
  (`readSiteManifest`, `checkSiteManifest`, `renderLlmsTxt`, `assembleSite`, `main`), `llms.txt` (written by
  `node scripts/build-site.cjs llms`), `.github/workflows/pages.yml`, `package.json` `homepage` →
  `https://wingfoil.github.io/wingfoil/` (the only line changed: `git diff db0e2752 -- package.json`),
  `user-docs.yaml` 1.5 → **1.6**, `WORKFLOW.md` (the `align-user-docs` node only), `.gitignore` (`_site-src/`, `_site/`).
  The link rewrite also covers `src=`/`href=` attributes and skips fenced code; the Liquid check covers every `.md`
  the site carries (the declared directories' READMEs too), a superset of the design's `pages`.
- red → green: `npx jest test/cli/pages-workflow.test.ts test/docs/llms-txt.test.ts test/cli/publish-metadata.test.ts
  --maxWorkers=2` → 3 suites, **136 / 136 passed** (red: 37 failed / 99 passed).
- Trial assembly (scratch directory, nothing in the worktree): `node scripts/build-site.cjs site --out <scratch>/site
  --ref abc123` → exit 0, 30 files; `diff` of each page against its copy shows only rewritten out-of-site links
  (README's `docs/`, COLLABORATION.md's Memory, `.mcp.json`, `CLAUDE.md` and `.wingfoil/README.md` links →
  `https://github.com/wingfoil/wingfoil/{blob|tree}/abc123/…`).
- **upload-pages-artifact v5.0.0 ↔ deploy-pages v5.0.1** (design risk, settled): upload-pages-artifact's `action.yml`
  at v5.0.0 (`gh api "repos/actions/upload-pages-artifact/contents/action.yml?ref=v5.0.0"`) uploads the tar with
  `actions/upload-artifact` v7.0.0 under `name: ${{ inputs.name }}`, default `github-pages`; deploy-pages' `action.yml`
  at v5.0.1 (`…/deploy-pages/contents/action.yml?ref=v5.0.1`) reads input `artifact_name`, default `github-pages`.
  GitHub's own Jekyll starter workflow pairs `deploy-pages@v5` with `upload-pages-artifact@v3`
  (`gh api repos/actions/starter-workflows/contents/pages/jekyll-gh-pages.yml`), and the v5.0.0 release notes of
  upload-pages-artifact list only the upload-artifact v7 bump and `include-hidden-files`: same artefact name and tar
  format. Dotfiles are left out by default (`--exclude=.[^/]*`), so TypeDoc's `api/.nojekyll` is not deployed, which
  is harmless: Jekyll has already run.

### refactor (developer, 2026-10-13/14)

- Heavy gates under the dl-170 slot (`waitslot.sh`, FIFO), `--maxWorkers=2`, one at a time; the slot waited for
  `task-215`'s coverage run and then for load from another project's processes (`ps -eo pcpu,args --sort=-pcpu`).
  - `npm test -- --maxWorkers=2` on `3db217f9` (23:53–00:03) → 411 suites, **7449 passed / 1 failed**:
    `test/core/dev-loop-v1-6.test.ts` "`docs.parity` … naming every test/docs suite that cites dl-116" — the new
    `test/docs/llms-txt.test.ts` cites dl-116, so dev-loop's `docs.parity` binding must name it. A real omission of
    this task, not a red-test fault: `94f38942 fix(config): …` adds the suite to `docs.parity` in `bindings.yaml`
    (1.8 → **1.9**, history line). The suite reads the binding at `HEAD`, so it passes after the commit:
    `npx jest test/core/dev-loop-v1-6.test.ts test/core/workflow-repository-conformance.test.ts test/workflow/bindings.test.ts test/core/format-key.test.ts --maxWorkers=2`
    → 4 suites, 169 / 169 passed. Before that commit, 18 suites → 542 passed, 1 failed (dev-loop-v1-6): 14 of the 19
    suites `grep -rl "bindings.yaml\|docs.parity" test` lists (20 files, one of them the allowlist module
    `test/docs/name-resolvability.allowlist.ts`), plus the three red files and `version-bump`. The five not run here
    (`service-verify-sweep`, `e2e-smoke`, `e2e-smoke-candidate`, `staging-rehearsal`, `test-no-identity`) pass in the
    independent reviewer's full run (7450 / 7450, 2026-10-14). (Corrected at review F5: this line first said "14 of
    them".) No third full-suite run: the commit changes one list entry and the version line.
  - `npm run test:coverage -- --maxWorkers=2` on `3db217f9` (00:04–00:16) → All files **99.32 / 97.23 / 97.98 / 99.71**,
    equal to the B6 baseline in every column; same single failure as above. No file under `src/` changed
    (`git diff db0e2752 --stat -- src` → empty).
- `npm run lint` exit 0; `npm run docs:api` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0; both tsc configs also
  ran inside `npm test` (`test/lint/typecheck-clean.test.ts`, passed).
- `node scripts/build-site.cjs llms --check` → exit 0, "llms.txt is current".
- `node scripts/check-governance.cjs --base db0e2752` → 1 `wf()` commit and 4 other commits checked, 0 findings.
- Unbound check tokens unchanged: `node dist/cli.js workflow list --format json | grep -o W_WORKFLOW_UNBOUND_TOKEN | wc -l`
  → 87 with this branch's `.wingfoil/` and 87 with `db0e2752`'s.
- BDD: no scenario covers dl-129 (`grep -rl "dl-129\|llms\|GitHub Pages" docs/02_requirements/02_bdd/features/` → empty).

### self-review (developer, 2026-10-14)

- AC 1 met: `pages.yml` builds one artefact from the declared Markdown and `docs:api`'s HTML; `publish.yml` untouched
  (`git diff db0e2752 --stat -- .github/workflows/publish.yml` → empty); no new dependency (`git diff db0e2752 --
  package.json` shows only `homepage`; `build-site.cjs` requires `node:fs`, `node:path`, `js-yaml`). Tests "AC 1" (14).
- AC 2 met: `llms.txt` generated from `docs/site.yaml`, the same bytes at both roots, the parity test fails on a missing
  path (fixtures). Tests "AC 2" (20).
- AC 3 met: `homepage` is the site URL; `align-user-docs` produces `llms.txt` and `docs/site.yaml`; `user-docs.yaml` 1.6.
- AC 4: manual, the approver's after the push (handover below); unasserted here.
- **T4:** `git log --first-parent --no-merges --format=%h c2a943a1..HEAD -- test/cli/pages-workflow.test.ts test/docs/llms-txt.test.ts test/cli/publish-metadata.test.ts`
  → empty.
- Same class in touched files: `bindings.yaml`'s `docs.parity` (fixed, above). Not in touched files, left to the
  release's `align-agent-docs`: `CLAUDE.md` §2's documentation map names neither `docs/site.yaml`, `llms.txt` nor
  `pages.yml` (`grep -c "llms\|site.yaml" CLAUDE.md` → 0) — a candidate finding for the coordinator.
- Batch merge: `bindings.yaml` is also bumped by `task-241` (1.8 → 1.9) and `task-215` — merge order 241 → 234 → 215,
  so this branch's 1.9 becomes 2.0 at the gate (one bump per file per branch, keep both history lines).

### Post-merge handover (approver, after the push to `main`)

Nothing here was done by the task: nothing deployed, pushed or enabled.

1. **Enable Pages** with the workflow source: Settings → Pages → Source "GitHub Actions", or
   `gh api -X POST repos/wingfoil/wingfoil/pages -f build_type=workflow`.
2. **Allow the release tags to deploy:** Settings → Environments → `github-pages` → Deployment branches and tags →
   keep `main` and add the tag rule `v*` (as `npm-publish` restricts tags to `v*`). Read back:
   `gh api repos/wingfoil/wingfoil/environments/github-pages/deployment-branch-policies --jq '.branch_policies[] | {name, type}'`.
3. **First deployment:** `gh workflow run pages.yml --ref main` (the site shows `main`'s documents until the `v0.3.0`
   tag redeploys it), or wait for the tag. Verify: `gh run list --workflow pages.yml --limit 1`;
   `curl -sI https://wingfoil.github.io/wingfoil/ | head -1` → 200;
   `curl -s https://wingfoil.github.io/wingfoil/llms.txt | diff - llms.txt` → empty;
   `curl -sI https://wingfoil.github.io/wingfoil/api/index.html | head -1` and
   `curl -sI https://wingfoil.github.io/wingfoil/docs/user-guide.md | head -1` → 200.
4. **Only then set the repository homepage** (it never points at a 404):
   `gh api -X PATCH repos/wingfoil/wingfoil -f homepage=https://wingfoil.github.io/wingfoil/`; read back with
   `gh api repos/wingfoil/wingfoil --jq .homepage`.
5. **New service (ruling 3)** — `node dist/cli.js memory add service` then fill, submit, and approve after `verify`:
   - `title: "GitHub Pages site of wingfoil/wingfoil"`, `provider: "GitHub"`, `kind: "setting"`,
     `owner_role: "approver"`,
     `verify: "gh api repos/wingfoil/wingfoil/pages --jq '{status,build_type,html_url}'"`,
     `url: "https://wingfoil.github.io/wingfoil/"`, `account: "wingfoil/wingfoil"`, `renews: ""`,
     `repo_refs: [".github/workflows/pages.yml", "docs/site.yaml", "llms.txt", "package.json"]`,
     `decision: "dl-129-trust-signals"`, `set_up_in: "v0.3"`.
   - Purpose: the documentation site (dl-129 Decision 2), built from the user docs and the TypeDoc output by
     `pages.yml` at each release tag, with `llms.txt` at its root.
   - Configuration: source GitHub Actions (`build_type: workflow`); environment `github-pages` deploys from `main` and
     tags `v*`; first deployment run URL and date.
   - Verification: `verify` → `build_type: workflow`, `html_url: https://wingfoil.github.io/wingfoil/`, `status: built`;
     plus the deployment-branch-policies read of step 2.
   - Management: re-run with `gh workflow run pages.yml`; retire with `memory deprecate` if the site moves.
6. **`memory amend svc-004`** (ruling 3), Configuration's homepage line becomes:
   `- **homepage:** \`https://wingfoil.github.io/wingfoil/\`, the documentation site (dl-129 Decision 2), set on
   <date>; before it, \`https://www.npmjs.com/package/wingfoil\`.`; the Verification section keeps its historical
   readings (2026-09-29 saw the npm homepage) and gains one dated sentence: `On <date>, after dl-129 Decision 2,
   \`gh api repos/wingfoil/wingfoil --jq .homepage\` → \`https://wingfoil.github.io/wingfoil/\`.` (review F4);
   `decision:` unchanged. Proposed `--reason`: `dl-129 Decision 2: the repository homepage is the documentation site on
   GitHub Pages since task-234, replacing the npm URL; read back with gh api repos/wingfoil/wingfoil --jq .homepage.`
7. npm shows the new `homepage` from the next publish (`v0.3.0`) on.
8. **dl-159 (ruling 1):** once a `release/X.Y` line publishes a patch below the highest version, its tag would redeploy
   the older documents. Handed to `task-266` (pending amendment below), whose "latest only for the highest published
   version" rule is the condition `pages.yml`'s `deploy` needs; `task-265` needs no sentence (its gate does not run
   `pages.yml`, and the tag push triggers `pages.yml` with or without it).

### Pending amendments (approver)

- `task-266-promote-with-an-explicit-npm-dist-tag-latest-only-for-the-highest-published-version-else-latest-x.y`:
  a "Handover from wave 3 B7" bullet in Implementation Notes (uncommitted in this worktree). Proposed `--reason`:
  `Handover from task-234 (approver ruling 2026-10-13): pages.yml deploys the documentation site on every release tag, so a patch of an older dl-159 line would overwrite the newest documents; this task's highest-version rule is the condition its deploy job needs.`
- `svc-004` and the new Pages service: post-merge, the approver's (handover steps 5–6), not edited here.

### Retrospective

- The full suite caught a cross-file rule neither the design nor red named: a `test/docs` suite that cites dl-116 must
  be listed in dev-loop's `docs.parity` binding. A design that adds a `test/docs` parity suite should name
  `bindings.yaml` among its files; the rule is pinned only by `test/core/dev-loop-v1-6.test.ts`.

### independent review (2026-10-14) and fixes (developer)

- Verdict: APPROVE WITH FIXES (the reviewer's full run 7450 / 7450; pins, permissions, no injection, upload/deploy v5
  verified). The task stays `in-review`; no re-submit.
- **qa send-back (red, not the developer's):** `77794685` adds `test/docs/build-site-confinement.test.ts` (F1, F3) and
  `test/docs/support/site-fixture.ts`, the fixture helpers moved verbatim out of `test/docs/llms-txt.test.ts`, which now
  imports them (a refactor, no assertion changed); notes `58dd4097`. T4 for those files is measured from `77794685`.
- **F1 (path confinement):** `scripts/build-site.cjs` `escapesRoot` — absolute (POSIX or Windows form) or a `..`
  segment — makes `checkSiteManifest` report `docs/site.yaml: listed path escapes the repository: <p>` as the only line
  for that `pages`/`files`/`llms` entry, sorted with the rest; the entry is never read. `assembleSite` checks before it
  creates or copies anything, so it and `site` refuse with exit 1 and write nothing. `walk` skips symbolic links (an
  `lstat` per entry), so a link inside a declared directory cannot pull a file in from outside the repository. By hand
  on a scratch fixture (`pages: [README.md, ../outside/secret.md]`, `site --out <scratch>/out/site`): exit 1, stderr
  `build-site: docs/site.yaml: listed path escapes the repository: ../outside/secret.md`, and `<scratch>/out` was not
  created (`ls <scratch>` lists only `outside` and `repo`).
- **F3:** links inside backtick code spans are left as written (`outsideCodeSpans`), like fenced blocks.
- **F2:** `test/docs/build-site-extras.test.ts` (developer-owned, new): src=/href= rewrite with an in-site href kept;
  a fenced-code link kept while the one outside is rewritten; the Liquid guard on `docs/examples/README.md`.
- **F4, F5, F6:** the svc-004 handover keeps the historical Verification and adds a dated sentence; the refactor
  count is corrected; the self-review heading names the developer.
- **F7:** `pages.yml`'s header now says the `ghcr.io/actions/jekyll-build-pages:v1.0.13` image tag is mutable and not
  covered by the SHA pin; the task-266 handover (pending amendment) gains the sentence that `pages.yml` deploys on the
  tag even when `publish.yml` fails.
- Code: `f386a40c fix(docs): task-234 — …`.
- **Runs:** `npm run lint` exit 0; `npx tsc --noEmit -p tsconfig.json` exit 0;
  `node scripts/build-site.cjs llms --check` exit 0.
  `npx jest test/docs/build-site-confinement.test.ts test/docs/build-site-extras.test.ts test/docs/llms-txt.test.ts test/cli/pages-workflow.test.ts test/cli/workflow-action-pins.test.ts test/core/dev-loop-v1-6.test.ts --maxWorkers=2`
  → 6 suites, **81 passed / 3 failed**. The three failures are rows of the red file:
  `F1: assembleSite throws on an escaping pages entry and writes nothing` and both `site --out … writes nothing outside
  the output directory` rows. Each fails with `ENOENT: no such file or directory, scandir '<tmp>/out'` at
  `test/docs/build-site-confinement.test.ts:68`. The helper `expectNothingWritten` calls
  `readdirSync(join(l.tmp, 'out'))` on a directory the fixture never creates, and a refusal that writes nothing
  cannot create it either. In the same rows, the assertions before the helper pass: the throw message, exit 1, the
  stderr line. **This is a red-test fault, sent back through the coordinator (T4).** Suggested fix for the qa agent:
  `existsSync(join(l.tmp, 'out')) ? readdirSync(...) : []`. I did not make `assembleSite` create its output directory
  before refusing just to satisfy the helper.
- No full-suite run: `scripts/` is outside coverage (`collectCoverageFrom: ['src/**/*.ts', …]`, jest.config.js), and
  no `src/` file changed (`git diff db0e2752 --stat -- src` → empty).
- T4 for the original red files: `git log --first-parent --no-merges --format=%h c2a943a1..HEAD -- test/cli/pages-workflow.test.ts test/cli/publish-metadata.test.ts`
  → empty; `test/docs/llms-txt.test.ts` → `77794685` only, the qa send-back's helper move. For the send-back's files
  from `77794685`: `git log --first-parent --no-merges --format=%h 77794685..HEAD -- test/docs/build-site-confinement.test.ts test/docs/support/site-fixture.ts test/docs/llms-txt.test.ts`
  → empty.


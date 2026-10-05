---
id: spec-011-storage-layout
type: tech-spec
title: ".wingfoil/ directory layout and initialization detection"
status: approved
scope: ".wingfoil/"
supersedes: ""
tmpl_version: 260703
---

## Context

Every WingFoil pillar (Memory, DNA, Directives, Workflow) persists its configuration as files under
`.wingfoil/` (REQ-SYS-01: git-backed single source of truth; REQ-SYS-02: pillars as decoupled,
independently loadable artifacts). Multiple tasks and future tooling (`wingfoil init`, the config
loader, the MCP server's resource layer) all need to agree on: which top-level files exist, how the
`built-in/` vs `custom/` split works for directives and workflows, where Memory templates live, and
— critically — how a running `wingfoil` process finds the project root and decides whether it is
already initialized. Without a single shared definition of this layout, different tasks would
re-implement path resolution and init-detection with subtly different (and divergent) rules, breaking
REQ-SYS-01's fit criterion that a fresh `git clone` reconstructs 100% of pillar state with no external
source.

This spec is scoped to this repository's `.wingfoil/` — the actual, current, hand-authored dogfooding
directory (see `.wingfoil/README.md`), at the repository root since `task-111` moved it there from
`docs/self/.wingfoil/`. It documents the
layout **as it exists today** on the `design/initial-design` branch and defines the root-detection /
init-marker algorithm the (not-yet-built) `wingfoil` tool must use once this directory moves to the
repository root.

## Specification

### Directory layout (ground truth: `.wingfoil/`, verified via `find .wingfoil -maxdepth 4`)

```
.wingfoil/                            ← WingFoil root for the dogfooding setup, at the repository root
│                                        (moved from docs/self/.wingfoil/ by task-111 — see README.md)
├── README.md                         ← human-facing layout doc + rationale (this spec formalizes it)
├── WORKFLOW.md                       ← human-facing workflow reference (diagrams, phase by phase)
├── dna.yaml                          ← Project DNA (P2.4): modules, stack, team & roles, paths
├── memory.yaml                       ← Memory element registry (P1.13): per-type path/state machine/template
├── roles.yaml                        ← Directive role assignments (P3.2/P3.7): role → directive list
├── workflows.yaml                    ← Workflow main config (P4.1): version + includes: [...] list
├── directives/
│   ├── built-in/                     ← Official P3.8 templates; EMPTY today (only a .gitkeep) —
│   │                                    not yet implemented, see README.md "interim decision"
│   └── custom/                       ← P3.5 rules + P3.8 stand-ins (kind: custom, ref: [P3.8])
│       ├── architecture.md
│       ├── claim-evidence.md        ← WingFoil rule (assigned globally)
│       ├── code-quality.md
│       ├── code-review.md
│       ├── command-baseline.md      ← WingFoil rule (developer, architect, reviewer)
│       ├── determinism.md
│       ├── doc-versioning.md
│       ├── documentation.md
│       ├── security.md               ← generic P3.8 stand-in (unassigned in roles.yaml)
│       ├── security-secrets.md        ← WingFoil elaboration (assigned globally)
│       ├── testing.md
│       └── traceability.md
├── memory/
│   └── templates/                    ← One scaffold per Memory element type (P1.13); consumed by
│       │                                `memory.add` when creating a new draft file
│       ├── adr.md
│       ├── bug.md
│       ├── decision-log.md
│       ├── plan.md
│       ├── release-line.md
│       ├── release.md
│       ├── service.md
│       ├── task.md
│       └── tech-spec.md
└── workflows/
    ├── built-in/                     ← Official workflow templates; EMPTY today (only a .gitkeep)
    └── custom/                       ← All 5 startable mains + every sub-workflow (P4.1)
        ├── sw-life-cycle.yaml         (kind: main — the end-to-end lifecycle)
        ├── bug-ingest.yaml            (kind: main)
        ├── decision-log-ingest.yaml   (kind: main)
        ├── adr-ingest.yaml            (kind: main)
        ├── service-ingest.yaml        (kind: main)
        ├── lean-inception.yaml        (kind: sub)
        ├── specification-downcast.yaml
        ├── user-story-mapping.yaml
        ├── specification-by-examples.yaml
        ├── volere-requirements.yaml
        ├── backlog-export.yaml
        ├── wingfoil-init.yaml
        ├── initial-design.yaml
        ├── release-line-cycle.yaml
        ├── release-cycle.yaml
        ├── release-planning.yaml
        ├── dev-loop.yaml
        ├── user-docs.yaml
        ├── e2e-smoke.yaml
        ├── release-submit.yaml
        ├── release-publishing.yaml
        ├── retrospective.yaml
        └── end-of-life.yaml           (kind: sub, all remaining files)
```

Note: `.wingfoil/` does **not** currently contain an `agents.yaml` file, an
`.assignments.yaml` file, or a flat `memory/<type>/` content subtree — these appeared in an earlier
draft pass and are superseded by the files actually present: role→directive
bindings live in top-level `roles.yaml`, and Memory element **content** (as opposed to templates)
resolves via the per-type `path` pattern declared in `memory.yaml` against the repository root (e.g.
`docs/04_memory/planning/{id}.md`), landing under `docs/04_memory/`, not inside `.wingfoil/`.

### Top-level config files

| File            | Pillar             | Contract |
|------------------|---------------------|----------|
| `dna.yaml`       | DNA (P2.4)          | Modules, tech stack, team & roles, resource `paths:` (query categories `sources, tests, docs, config, governance`) |
| `memory.yaml`    | Memory (P1.13)      | `types:` map — one entry per element type, each declaring `path` (must contain `{id}`), an optional `states` machine (`sequence`/`gates`/`waiting`), and `template:` (`frontmatter.required` + `file:` pointing into `memory/templates/`); an optional top-level `defaults.states` machine for every type that declares none (REQ-STATE-08). Schema: `spec-001`. The `wingfoil init` scaffold ships `defaults` only, with a commented per-type `states:` example on `bug` (`dl-072`) |
| `roles.yaml`     | Directives (P3.2/P3.7) | `assignments:` map (role → list of directive names) + a `global:` list applied to every role |
| `workflows.yaml` | Workflow (P4.1)     | `version:` + `includes:` — an ordered list of paths under `workflows/custom/` (and, once populated, `workflows/built-in/`); this file inlines nothing itself, it only composes |

Each of these four files is independently loadable and schema-validated (REQ-SYS-02): editing
`roles.yaml` must not require touching `workflows.yaml`, and vice versa.

### `directives/{built-in,custom}/` split

- `built-in/` — reserved for the official P3.8 directive templates shipped by the `wingfoil` npm
  package once implemented. Today it contains only `.gitkeep` (empty).
- `custom/` — every directive file that exists right now, including the six P3.8 **stand-ins**
  (`code-quality`, `testing`, `code-review`, `architecture`, `security`, `documentation` — each
  authored with `kind: custom`, `ref: [P3.8]`) plus WingFoil-specific rules (`determinism`,
  `doc-versioning`, `security-secrets`, `traceability`, `command-baseline`, `claim-evidence`). `roles.yaml` binds by directive **name**,
  independent of which of the two subdirectories currently holds the file — so promoting a stand-in
  from `custom/` to `built-in/` later requires no change to `roles.yaml`.

### `workflows/{built-in,custom}/` split

- `built-in/` — reserved for official workflow templates shipped by the npm package; empty today
  (`.gitkeep` only).
- `custom/` — every workflow file that exists today: 5 startable `kind: main` workflows
  (`sw-life-cycle`, `bug-ingest`, `decision-log-ingest`, `adr-ingest`, `service-ingest` — REQ-STATE-03 permits multiple
  open mains) plus every `kind: sub` workflow they compose via `include()` (REQ-SYS-06). `sub`
  workflows cannot be started directly; only `workflows.yaml`'s `includes:` list — not the
  subdirectory a file lives in — determines what is loaded.

### `memory/templates/`

One Markdown scaffold per Memory element type declared in `memory.yaml`'s `types:` map — currently
`adr.md`, `bug.md`, `decision-log.md`, `plan.md`, `release-line.md`, `release.md`, `service.md`,
`task.md`, `tech-spec.md`.
Each scaffold's frontmatter skeleton must satisfy that type's `template.frontmatter.required` list in
`memory.yaml` (the P4.12 alignment rule: workflow steps calling `memory.add` declare
`checks.post: ["frontmatter.required: [...]"]` and that list must match this file). `memory.add`
copies the scaffold verbatim to the type's `path` (resolved elsewhere — Memory element **content**
lives outside `.wingfoil/`, per the per-type `path` pattern in `memory.yaml`; this directory holds only
the templates consumed to create new drafts, never the elements themselves).

### Git-root detection algorithm

```ts
// Walk up from CWD looking for a `.git` entry. WingFoil must be invoked at the exact git
// root — no upward search for `.wingfoil/` itself, only for `.git`.
function findGitRoot(cwd: string): string | null {
    let dir = cwd
    while (true) {
        if (fs.existsSync(path.join(dir, '.git'))) return dir
        const parent = path.dirname(dir)
        if (parent === dir) return null   // reached filesystem root without finding .git
        dir = parent
    }
}

const root = findGitRoot(process.cwd())
if (root === null) throw new Error('E_NO_GIT_ROOT: not inside a git repository')
if (root !== process.cwd()) throw new Error('E_NOT_AT_GIT_ROOT: run wingfoil from the project root')
```

`.wingfoil/` must live at that same root, one level below the directory containing `.git/`. Nested
`.wingfoil/` directories (a subdirectory of the project already containing its own `.wingfoil/`) are
not supported — at most one WingFoil root per git root.

### Initialization-marker detection algorithm

A project is WingFoil-initialized when `.wingfoil/` exists **and** contains at least one file:

```ts
function detectInitState(root: string): 'absent' | 'incomplete' | 'initialized' {
    const wfDir = path.join(root, '.wingfoil')
    if (!fs.existsSync(wfDir)) return 'absent'
    const entries = fs.readdirSync(wfDir)
    return entries.length > 0 ? 'initialized' : 'incomplete'
}
```

| `detectInitState` result | Interpretation                | Action                                       |
|---------------------------|-------------------------------|-----------------------------------------------|
| `absent`                  | Not initialized               | Suggest `wingfoil init`                       |
| `incomplete`               | `.wingfoil/` exists but empty | Warn "incomplete init"; suggest `--repair`    |
| `initialized`              | Ready                         | Proceed normally                              |

This check is intentionally shallow (top-level non-emptiness only, no deep validation of every
expected file) — deep validation of individual pillar files is each pillar's own schema-load
responsibility (REQ-SYS-02: isolated load/validate per artifact), not the init-marker's job.

### `.gitignore` policy

`.wingfoil/` must **never** appear in `.gitignore` — it is intentionally git-tracked in full (REQ-SYS-01:
git is the single source of truth; there is no external state store to fall back to). No subpath
within `.wingfoil/` is excluded.

## Consequences

- Every task that implements config loading (DNA loader, Memory registry loader, directive loader,
  workflow composer) or root/init detection must target exactly this layout — no ad hoc path
  guessing. Changing a top-level file name (e.g. `roles.yaml`) or the `built-in`/`custom` split
  requires revising this spec first, then the dependent code.
- `wingfoil init` (not yet implemented) is the eventual producer of this layout at the repository
  root; until then, this repository's hand-authored `.wingfoil/` is the reference implementation
  agents must keep in sync with any change to this spec.
- The MCP server's read-only Resources layer and the CLI's config-inspection commands both resolve
  paths through the algorithms defined here, keeping the dual CLI/MCP interface (REQ-SYS-05)
  consistent by construction — one root/init-detection implementation, two surfaces.
- If a future revision moves Memory documents to a different subtree convention, or introduces
  per-type content roots, this spec must be revised (or superseded) before `memory.yaml`'s `path`
  patterns change meaning.

## Process Notes

Cross-checked against the actual current tree at `docs/self/.wingfoil/` (via
`find docs/self/.wingfoil -maxdepth 4`) and against `docs/02_requirements/03_sard/01_architecture.md`
(REQ-SYS-01 through REQ-SYS-09).

**Revision (2026-09-24) — the `custom/` listing carries `command-baseline` and `claim-evidence`, per
`task-094-write-the-baseline-rule-where-implementers-meet-it` (`dl-080` Action 4).** Both the tree
above and the `custom/` paragraph enumerate "every directive file that exists right now", so adding
two files to `docs/self/.wingfoil/directives/custom/` made both listings false; twelve files now,
measured with `ls docs/self/.wingfoil/directives/custom/*.md | wc -l`. Nothing about the layout,
the `built-in/`-versus-`custom/` split or the `roles.yaml` binding rule changes. Edited in place
without a supersede or a state change, per the `spec-001` precedent this spec's siblings cite.

**Revision (2026-09-29) — the dogfooding root moves to the repository root, per
`task-111-configuration-moves-to-the-repository-root` (`bug-075`).** `git mv` moved
`docs/self/.wingfoil/` to `.wingfoil/` and `docs/self/docs/04_memory/` to `docs/04_memory/`; the
scope, the tree's root line, the Memory-content note and the reference-implementation consequence
now name the root paths. The tree gains `WORKFLOW.md`, moved into `.wingfoil/` by the same task from
`docs/self/`. Measured against the tree after the move (`find .wingfoil -maxdepth 4 -type f`), three
files exist that the tree does not list — `memory/templates/plan.md`, `workflows/custom/user-docs.yaml`
and `workflows/custom/e2e-smoke.yaml` — a gap older than this revision, which it records rather than
closes. Nothing about the `built-in/`-versus-`custom/` split, the file names or the
root-detection algorithm changes. The cross-check paragraph and the 2026-09-24 revision above keep
the paths they were measured at. Edited in place without a supersede or a state change (the `spec-001` precedent `dl-041` cites); pending the approver's sign-off at that task's review.

**Revision (2026-09-29) — the `service` type's two files, and the three the tree omitted, per
`task-124-the-service-memory-type` (`dl-088`).** The task adds `memory/templates/service.md` and
`workflows/custom/service-ingest.yaml` (a fifth `kind: main`), so the tree, the `workflows/custom/`
paragraph and the `memory/templates/` paragraph gain them. The same pass closes the gap the previous
revision recorded — `memory/templates/plan.md`, `workflows/custom/user-docs.yaml` and
`workflows/custom/e2e-smoke.yaml` are now listed — because the listings enumerate "every file that
exists", and a listing edited for two files while knowingly missing three would still be false.
Measured with `find .wingfoil -maxdepth 4 -type f | sort` at this revision: 9 templates, 23 workflow
files. Nothing about the layout, the `built-in/`-versus-`custom/` split or the root-detection
algorithm changes. Edited in place without a supersede or a state change (the `spec-001` precedent
`dl-041` cites); pending the approver's sign-off at `task-124`'s review.

**Revision (2026-10-02, `task-153-reconcile-req-state-08-p1-13-scenario-memory`) — the `memory.yaml`
and `dna.yaml` contract cells, per `bug-053` and `dl-072`.** The `memory.yaml` cell described per-type
`states` in the `values`/`initial`/`transitions` encoding `spec-001` retired, and never named the
`defaults` block; it now names the `sequence`/`gates`/`waiting` encoding, the optional `defaults`
machine, and `spec-001` as the schema. It also states the scaffold's shape `dl-072` ratified ((A) +
S1): `defaults` only, with a commented `states:` example on `bug`. The `dna.yaml` cell listed
`conventions`, which `spec-002` removed from `DnaYaml`, and so did the `dna.yaml` line of the
layout tree; neither does now (the tree line names `paths` in its place). Nothing about the layout,
the file names or the root-detection algorithm changes. Edited in place without a supersede or a
state change (the `spec-001` precedent `dl-041` cites); pending the approver's sign-off at
`task-153`'s review.

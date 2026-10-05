/**
 * Methodology templates for `wingfoil init` (task-029-implement-wingfoil-init, P5.1.1,
 * spec-011-storage-layout). task-018 delivered only the minimal committed skeleton
 * (`scaffoldFiles()` in ./layout) and EXPLICITLY deferred the complete spec-011 layout — `roles.yaml`,
 * the `workflows/{built-in,custom}` split, `memory/templates/`, and real starter content — to this
 * module. `templateScaffold(def)` returns that complete layout as a `ScaffoldFile[]` the same
 * `initStorage(root, files, message)` write+commit path consumes. (The `directives/{built-in,custom}`
 * split was deferred here too, until `task-054-project-directives` pulled it back into the minimal
 * skeleton as well: P3.5 requires it after init, on whichever path ran.)
 *
 * A "template" (Scrum, Kanban — the names the P5.1.1 BDD uses as examples) is an AUTHORING starter:
 * it selects the project's methodologies (written into `dna.yaml` `stacks.methodologies`) and a
 * methodology-flavoured delivery sub-workflow; it is not a spec-mandated schema. All generated content
 * is a pure function of the `TemplateDefinition` — no wall-clock, no randomness, no environment read —
 * so `wingfoil init --template X` is byte-identical run to run (REQ-SYS-07), and the returned list is
 * sorted by path so callers may diff the set safely.
 */
import { BUILTIN_DIRECTIVE_TEMPLATES, builtinDirectiveMd } from './builtin-directives';
import { WINGFOIL_DIR, type ScaffoldFile } from './layout';

/** A methodology starter template: the methodologies it seeds and the delivery sub-workflow it adds. */
export interface TemplateDefinition {
  /** Canonical display name, e.g. `Scrum` (matched case-insensitively by {@link resolveTemplate}). */
  readonly name: string;
  /** One-line human description surfaced in the wizard and generated headers. */
  readonly description: string;
  /** Methodologies written into `dna.yaml` `stacks.methodologies`. */
  readonly methodologies: readonly string[];
  /** Lower-case slug used for the delivery workflow filename (`<slug>-delivery.yaml`). */
  readonly slug: string;
  /** Human sentence describing the delivery cadence, embedded in the delivery workflow. */
  readonly cadence: string;
}

const SCRUM: TemplateDefinition = {
  name: 'Scrum',
  description: 'Sprint-based iterative delivery with fixed-length timeboxes.',
  methodologies: ['Scrum', 'Specification by Example (BDD)', 'TDD'],
  slug: 'scrum',
  cadence: 'Work is delivered in fixed-length sprints; each sprint plans, builds, reviews and retrospects a slice of the backlog.',
};

const KANBAN: TemplateDefinition = {
  name: 'Kanban',
  description: 'Continuous-flow delivery with work-in-progress limits.',
  methodologies: ['Kanban', 'Specification by Example (BDD)', 'TDD'],
  slug: 'kanban',
  cadence: 'Work flows continuously across the board under explicit WIP limits; there are no timeboxed iterations.',
};

/** The built-in methodology templates. Order fixed for deterministic listing (REQ-SYS-07). */
export const TEMPLATES: readonly TemplateDefinition[] = [SCRUM, KANBAN];

/** Canonical template names, in registry order (used by the wizard prompt and error messages). */
export const TEMPLATE_NAMES: readonly string[] = TEMPLATES.map((t) => t.name);

/** The template the wizard falls back to when the user selects nothing (first registered template). */
export const DEFAULT_TEMPLATE: string = SCRUM.name;

/** Resolve a (case-insensitive) template name to its canonical definition, or `null` if unknown. */
export function resolveTemplate(name: string): TemplateDefinition | null {
  const wanted = name.trim().toLowerCase();
  return TEMPLATES.find((t) => t.name.toLowerCase() === wanted) ?? null;
}

/** The single git subject `wingfoil init` commits (names the chosen template; deterministic). */
export function initProjectCommitMessage(def: TemplateDefinition): string {
  return `chore(wingfoil): initialize .wingfoil/ with the ${def.name} template (P5.1.1)`;
}

// --- Built-in template asset registry (task-044-builtin-template-integrity, REQ-SEC-10) -----------

/**
 * Which pillar a {@link BuiltinTemplateSource} belongs to — `directive` for a P3.8 built-in directive
 * `.md` file, `workflow` for a P4.17 built-in workflow `.yaml` file. Drives which pillar schema
 * `core/builtin-integrity.ts`'s `verifyBuiltinTemplates` checks the source against, and which of
 * REQ-SEC-10's two exact abort-message shapes a failure produces.
 */
export type BuiltinTemplateKind = 'directive' | 'workflow';

/**
 * One shipped built-in template asset, as raw content — a directive's full `.md` text (frontmatter +
 * body) or a workflow's full `.yaml` text, exactly as it would be written under `.wingfoil/directives/
 * built-in/` or `.wingfoil/workflows/built-in/`. This is the pure DATA shape only; `name`/`kind` are
 * enough to identify and classify a source, and pillar-schema validation itself is a cross-pillar
 * concern that lives in `core/builtin-integrity.ts` (this module never imports a pillar schema —
 * REQ-SYS-02 keeps `storage` decoupled from `directives`/`workflow`).
 */
export interface BuiltinTemplateSource {
  readonly name: string;
  readonly kind: BuiltinTemplateKind;
  readonly content: string;
}

/** Scaffold directory holding the P3.8 built-in directive templates (spec-011 storage layout). */
export const BUILTIN_DIRECTIVES_DIR = `${WINGFOIL_DIR}/directives/built-in`;

/** Scaffold directory holding the P4.17 built-in workflow templates (spec-011 storage layout). */
export const BUILTIN_WORKFLOWS_DIR = `${WINGFOIL_DIR}/workflows/built-in`;

/**
 * The built-in source one scaffold file contributes, or `null` when the file is not a built-in
 * template asset.
 *
 * Kind comes from the DIRECTORY holding the file, never from its extension: an unexpected file shape
 * under a built-in directory is then still CHECKED (and fails, naming itself) instead of being waved
 * through by an extension filter — the fail-closed reading. `name` is the basename with its final
 * extension stripped. Dotfile placeholders (`.gitkeep`, which reserve an empty directory in git and
 * carry no template content) are the single exclusion.
 */
function builtinSourceOf(file: ScaffoldFile): BuiltinTemplateSource | null {
  const base = file.path.slice(file.path.lastIndexOf('/') + 1);
  if (base === '' || base.startsWith('.')) return null;

  let kind: BuiltinTemplateKind;
  if (file.path.startsWith(`${BUILTIN_DIRECTIVES_DIR}/`)) kind = 'directive';
  else if (file.path.startsWith(`${BUILTIN_WORKFLOWS_DIR}/`)) kind = 'workflow';
  else return null;

  const dot = base.lastIndexOf('.');
  return { name: dot > 0 ? base.slice(0, dot) : base, kind, content: file.content };
}

/**
 * Derive the built-in template assets to schema-check (REQ-SEC-10) from the very `ScaffoldFile[]`
 * that `initStorage` is about to write — so the CHECKED set and the INSTALLED set are the same set by
 * construction.
 *
 * This replaces the hand-maintained `BUILTIN_TEMPLATE_SOURCES` constant the first pass of
 * `task-044-builtin-template-integrity` shipped. A standalone registry is fail-open by omission: a
 * later task (`task-057` for P3.8, or a P4.17 workflow-template task) can add an asset to
 * {@link templateScaffold} and forget the registry, installing a template nothing ever checks while
 * every existing test stays green. Deriving makes "installed but unchecked" unrepresentable rather
 * than merely untested — the fix `dl-031-req-sec-10-integrity-depth` flagged. (dl-031 ratified that
 * schema validation IS the REQ-SEC-10 contract; there is deliberately no digest or manifest here.)
 *
 * Pure and order-preserving over `files` (REQ-SYS-07), so the derived order — and hence
 * `verifyBuiltinTemplates`' first-failure choice — is the caller's own order, deterministic whenever
 * that is. Both of today's callers qualify, for different reasons: {@link templateScaffold} returns a
 * genuinely path-sorted list, whereas `scaffoldFiles` (./layout) returns a fixed hand-written literal
 * that is stable but NOT sorted (see its doc comment). Reproducible is what matters here, not sorted.
 *
 * BOTH scaffolds flow through here since `task-054-project-directives`: `scaffoldFiles()` now reserves
 * `.wingfoil/directives/built-in/` for the P3.5 layout, and `initWingfoilStorage` derives its checked
 * set from it exactly as `initWingfoilProject` does from {@link templateScaffold}
 * (`bug-018-init-storage-bypasses-integrity-guard`). Being generic over `ScaffoldFile[]` is what made
 * that a one-line wiring rather than a second mechanism.
 *
 * What it returns is a fact about the scaffold CONTENT, not a property of this function: for
 * {@link templateScaffold} it is the six P3.8 built-in directives `task-057-builtin-directive-templates`
 * ships (`./builtin-directives`, rendered by `builtinDirectiveMd`), for `scaffoldFiles` it is `[]` (a
 * `.gitkeep` only), and the workflows built-in directory still holds a `.gitkeep` only. Any asset added
 * later is checked with no edit here. Each shipped built-in must satisfy its pillar schema on its own —
 * `test/storage/builtin-directives.test.ts` runs every directive template through the real guard.
 */
export function builtinTemplateSources(files: readonly ScaffoldFile[]): BuiltinTemplateSource[] {
  const sources: BuiltinTemplateSource[] = [];
  for (const file of files) {
    const source = builtinSourceOf(file);
    if (source !== null) sources.push(source);
  }
  return sources;
}

// --- Content generators -----------------------------------------------------------------------
// Every generator is a pure function of its inputs (REQ-SYS-07): fixed strings only, no Date/random.

const wf = (relative: string): string => `${WINGFOIL_DIR}/${relative}`;

/** The Memory element types spec-011 requires a template scaffold for, in fixed order. */
const MEMORY_TYPES = ['adr', 'bug', 'decision-log', 'release', 'release-line', 'task', 'tech-spec'] as const;

/**
 * Default `id_pattern` per scaffolded type (task-002-validation-id-engine's `{n}`/`{slug}` token
 * grammar, `src/validation/id.ts`) — required by `memoryAdd` (`src/core/index.ts`) even though
 * `memory.yaml`'s own schema only marks the field `.optional()` (bug-005-init-scaffold-fails-schema-validation:
 * without this, a freshly-`init`'d project's `wingfoil memory add` fails on every type). Mirrors this
 * repository's own dogfooded `.wingfoil/memory.yaml` scheme, a sensible [AUTHORING] default
 * a user is free to change.
 */
/**
 * Whether `memory amend` may correct each scaffolded type (`spec-001`'s `amendable` key; `dl-108` A3;
 * approver ruling (c) at `task-127`'s review, 2026-10-01). It follows this repository's own
 * `.wingfoil/memory.yaml`: records whose content is routinely corrected are amendable; `adr` is not,
 * because a change to a decision is a new ADR; `release` and `release-line` are not, because their
 * content is the roadmap, which the release workflow phases change.
 */
const MEMORY_AMENDABLE: Readonly<Record<(typeof MEMORY_TYPES)[number], boolean>> = {
  adr: false,
  bug: true,
  'decision-log': true,
  release: false,
  'release-line': false,
  task: true,
  'tech-spec': true,
};

const MEMORY_ID_PATTERNS: Readonly<Record<(typeof MEMORY_TYPES)[number], string>> = {
  adr: 'adr-{n}-{slug}',
  bug: 'bug-{n}-{slug}',
  'decision-log': 'dl-{n}-{slug}',
  release: 'release-{n}',
  'release-line': 'rl-{n}',
  task: 'task-{n}-{slug}',
  'tech-spec': 'spec-{n}-{slug}',
};

/**
 * The cross-cutting CUSTOM directives every starter project gets under `directives/custom/` — AUTHORING
 * starters the user tailors. The six P3.8 categories are not here: since
 * `task-057-builtin-directive-templates` they ship as official built-ins (`./builtin-directives`,
 * installed under `directives/built-in/`), replacing the generated `custom/` stand-ins that would
 * otherwise shadow them on every fresh project (`dl-037`: a same-id `custom/` file wins and is reported).
 */
const DIRECTIVES: ReadonlyArray<{ name: string; title: string; summary: string }> = [
  { name: 'determinism', title: 'Determinism', summary: 'No wall-clock, randomness, or unordered iteration in context-building paths; prefer declared config.' },
  { name: 'doc-versioning', title: 'Documentation versioning', summary: 'Bump a document version once per change merged to the default branch, on its first edit since then; update its date when bumping.' },
  { name: 'security-secrets', title: 'Secret hygiene', summary: 'Never commit credentials or secrets; the repository is the single source of truth and is shared.' },
  { name: 'traceability', title: 'Traceability', summary: 'Maintain the feature -> story -> acceptance -> requirement -> task chain across every change.' },
];

function dnaYaml(def: TemplateDefinition): string {
  // `stacks.methodologies` / `team.roles` are `MethodologyEntry`/`RoleEntry` OBJECT arrays
  // (`{name, ...}`) per `spec-002-dna-yaml-schema`'s `DnaYaml` schema (`src/dna/schema.ts`) — a bare
  // string list here fails `DnaYaml.safeParse` the moment `dna show`/`dna set`/`paths` load this file
  // (bug-005-init-scaffold-fails-schema-validation). `team.members` is a REQUIRED (if possibly empty)
  // array too; an empty list is schema-valid (the `Team` schema's role cross-check is vacuous over no
  // members) and is the right default for a fresh, person-less scaffold — the user adds real members
  // via `dna set` once the project has a team.
  // `stacks.technologies` stays an empty list — dropping the key would make the first `dna add` rewrite
  // the file without its comments — but carries the `{name, category}` shape and a commented-out
  // example above it, because `category` is required and a bare `- name: X` fails validation
  // (bug-139-dna-scaffold-hides-required-category, task-118).
  const methodologies = def.methodologies.map((m) => `    - name: ${m}`).join('\n');
  return `# Project DNA (P2.4) — scaffolded by \`wingfoil init\` (${def.name} template).
# Structural map of the project: modules, stacks, team + roles, resource paths. Customize freely.
version: 1

project:
  name: ""                        # your project name
  description: ""
  methodology: ${def.name}        # ${def.description}

# Modules — the parts of the system (anatomy for navigation). Add your own.
modules: []

# Stacks — technologies + methodologies in use. The methodologies come from the ${def.name} template.
stacks:
  # Each technology is a {name, category} entry: \`category\` is required (free text: language,
  # runtime, framework, database, ...); \`version\` and \`notes\` are optional. To declare one, replace
  # \`technologies: []\` with a list like this example, uncommented:
  # technologies:
  #   - name: TypeScript
  #     category: language
  # or run: wingfoil dna add stacks.technologies --value TypeScript --entry-category language
  technologies: []
  methodologies:
${methodologies}

# Team & roles — AI agents execute as developer/reviewer/qa/architect and never hold approval authority.
team:
  members: []
  roles:
    - name: developer
    - name: reviewer
    - name: qa
    - name: architect
    - name: product-owner
    - name: tech-lead
    - name: approver

# Resource paths — query categories used to navigate the project.
# \`runs\` holds exactly one directory: the agent run log, one <element-id>.jsonl per element.
paths:
  sources: []
  tests: []
  docs: []
  config: [.wingfoil]
  governance: []
  runs: [docs/runs/]
`;
}

/**
 * The commented-out per-type machine the scaffold shows on `bug` (`dl-072` (A) + S1, task-153): the
 * scaffold keeps one shared `defaults` machine and does not commit a new project to any lifecycle, but
 * shows the override mechanism (`adr-008`'s per-type machines) where a user will meet it. Uncommented,
 * it is a valid `spec-001` machine (`test/storage/templates.test.ts` loads it); its states are an
 * example, not a recommendation.
 */
const BUG_STATES_EXAMPLE = `
    # Example — uncomment to give \`bug\` its own state machine instead of \`defaults\` (spec-001):
    # states:
    #   sequence: [ draft, open, in-progress, resolved, closed ]
    #   gates:
    #     open: { reject: closed }
    #     resolved: { reject: in-progress }`;

/**
 * The scaffolded `memory.yaml` (P1.13, `spec-001-memory-yaml-schema`) — type registry **plus** the
 * `defaults.states` machine every scaffolded type runs on.
 *
 * That `defaults` block is `bug-030-init-memory-yaml-has-no-state-machine` (task-071): this generator
 * used to emit types only, while its own header comment promised "(per type) its state machine", so a
 * freshly-`init`-ed project had no machine anywhere and `resolveStateMachine` refused every transition
 * verb. The engine now also carries a built-in default (`DEFAULT_STATE_MACHINE`, `src/memory/state-machine.ts`)
 * for hand-written files that declare nothing; the block is written out here anyway, and the header
 * comment corrected to describe it, so the machine governing a new project is **visible and editable
 * in the user's own file** rather than an invisible engine constant. It is `spec-001`'s worked
 * `defaults` example verbatim, so this stays inside the top-level shape that spec already specifies
 * (`defaults:` is optional there) — no per-type machine is invented for a starter project, which would
 * be a product decision beyond this scaffold.
 */
function memoryYaml(): string {
  const types = MEMORY_TYPES.map(
    (type) => `  ${type}:
    path: docs/memory/${type}/{id}.md
    id_pattern: "${MEMORY_ID_PATTERNS[type]}"
    amendable: ${MEMORY_AMENDABLE[type]}
    template:
      file: memory/templates/${type}.md
      frontmatter:
        required: [id, type, title, status]${type === 'bug' ? BUG_STATES_EXAMPLE : ''}`,
  ).join('\n');
  return `# Memory element schema (P1.13) — scaffolded by \`wingfoil init\`.
# One entry per element type: its path pattern, its id pattern and its scaffold template. Every type
# below shares the \`defaults\` state machine; give a type its own \`states:\` block to override it for
# that type only (REQ-STATE-08) — \`bug\` carries a commented example. \`amendable\` says whether
# \`memory amend\` may record a correction to the type's documents without a state change; absent
# means false.
version: 1

# Default state machine — applies to every type that declares no \`states:\` block of its own.
# \`sequence\` is the ordered forward chain (\`submit\` walks it); a \`gates\` state's forward edge needs
# \`approve\` instead, and its \`reject\` target is where a rejection lands. \`deprecated\` is implicit:
# \`memory deprecate\` reaches it from any state, so it is never listed here.
defaults:
  states:
    sequence: [ draft, pending, approved ]
    gates:
      pending: { reject: draft }

types:
${types}
`;
}

function rolesYaml(): string {
  return `# Directive role assignments (P3.2/P3.7) — scaffolded by \`wingfoil init\`.
# Binds directives to roles by directive ID, independent of the built-in/custom subfolder holding the file.
version: 1

assignments:
  developer:
    - code-quality
    - testing
    - determinism
  reviewer:
    - code-review
    - traceability
  qa:
    - testing
  architect:
    - architecture
    - determinism
    - traceability
  product-owner:
    - traceability
  tech-lead:
    - architecture
    - code-review

# Global directives apply to every role. \`security\` is the built-in Security directive (REQ-SEC-08):
# bound here so every role loads it; \`security-secrets\` is this project's secret-hygiene rule.
global:
  - doc-versioning
  - documentation
  - security
  - security-secrets
`;
}

/** Ordered list of custom workflow filenames the manifest composes (main workflows + delivery sub). */
function customWorkflowFiles(def: TemplateDefinition): string[] {
  return [
    'sw-life-cycle.yaml',
    'bug-ingest.yaml',
    'decision-log-ingest.yaml',
    'adr-ingest.yaml',
    `${def.slug}-delivery.yaml`,
  ];
}

function workflowsYaml(def: TemplateDefinition): string {
  const includes = customWorkflowFiles(def)
    .map((f) => `  - workflows/custom/${f}`)
    .join('\n');
  return `# Project Workflow main configuration (P4.1) — scaffolded by \`wingfoil init\`.
# This MAIN config file does not inline workflows; it include()s the custom (and, once populated,
# built-in) workflow files. Startable mains + the ${def.name} delivery sub-workflow are composed below.
version: 1

include:
${includes}
`;
}

/**
 * One scaffolded Directives-pillar document: YAML frontmatter + the rule text body.
 *
 * The frontmatter carries every field `spec-013-directive-frontmatter-schema` marks required — `id`,
 * `name`, `type: directive`, `kind`, `title` — because that spec's realization,
 * `DirectiveFrontmatter` (`src/directives/schema.ts`), is what `loadDirectives` (`src/core/loaders.ts`)
 * validates every directive file against: a scaffold missing any of them makes `wingfoil directives
 * list` fail `E_VALIDATION` on a freshly-`init`'d project (bug-006-init-directive-scaffold-schema-invalid,
 * the Directives sibling of the `dna.yaml`/`memory.yaml` defect bug-005 fixed).
 *
 * `id` is the filename stem, per spec-013 ("Stable directive identifier … matches the filename stem").
 * That is not cosmetic: it is the key `resolveRoleDirectives` (`src/core/context.ts`, spec-012 §5)
 * binds roles on, and {@link rolesYaml} lists exactly those stems in its `assignments`/`global` blocks
 * — so any other value would leave every scaffolded role binding dangling. Keep the two in step.
 *
 * No `scope:` key: {@link rolesYaml}'s `global:` list alone says which directives bind every role, and
 * an absent `scope` is never reported as a disagreement (task-144 review, R3).
 *
 * `kind: custom` is correct for `directives/custom/`, the only place this generator's output is written;
 * the P3.8 built-ins carry `kind: built-in` and have their own renderer (`builtinDirectiveMd`,
 * `./builtin-directives`).
 */
function directiveMd(d: (typeof DIRECTIVES)[number]): string {
  return `---
id: ${d.name}
name: ${d.name}
type: directive
kind: custom
title: "${d.title}"
---

# ${d.title}

${d.summary}

<!-- Tailor this rule to your project's needs. Directives are auto-loaded per role (roles.yaml). -->
`;
}

function memoryTemplateMd(type: string): string {
  return `---
id: ""
type: ${type}
title: ""
status: draft
---

<!-- ${type} body. \`wingfoil memory add\` copies this scaffold verbatim; \`memory submit\` replaces
     these placeholder comments with real content and fills the required frontmatter fields. -->
`;
}

function mainWorkflowYaml(name: string, description: string, phasesYaml: string): string {
  return `# ${description}
name: ${name}
kind: main
description: "${description}"
${phasesYaml}`;
}

function deliveryWorkflowYaml(def: TemplateDefinition): string {
  return `# ${def.name} delivery loop (sub-workflow) — scaffolded by \`wingfoil init\`.
# ${def.cadence}
name: ${def.slug}-delivery
kind: sub
description: "${def.name} delivery loop"
phases:
  - name: plan
    description: "Select the next slice of work to deliver."
  - name: build
    description: "Implement the work test-first (TDD)."
  - name: review
    description: "Review against the directives; run unit + acceptance tests."
  - name: deliver
    description: "Integrate the completed work."
`;
}

/**
 * The COMPLETE spec-011 `.wingfoil/` layout for `def`, as a `ScaffoldFile[]` sorted by path
 * (deterministic — REQ-SYS-07). Consumed by `initStorage(root, files, message)`; every path is under
 * `.wingfoil/` so init never writes outside the WingFoil root.
 */
export function templateScaffold(def: TemplateDefinition): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    // Top-level pillar config (spec-011 "Top-level config files").
    { path: wf('dna.yaml'), content: dnaYaml(def) },
    { path: wf('memory.yaml'), content: memoryYaml() },
    { path: wf('roles.yaml'), content: rolesYaml() },
    { path: wf('workflows.yaml'), content: workflowsYaml(def) },
    // Directives built-in/custom split (spec-011): the six P3.8 built-ins (task-057) + custom starters.
    ...BUILTIN_DIRECTIVE_TEMPLATES.map((t) => ({ path: `${BUILTIN_DIRECTIVES_DIR}/${t.id}.md`, content: builtinDirectiveMd(t) })),
    ...DIRECTIVES.map((d) => ({ path: wf(`directives/custom/${d.name}.md`), content: directiveMd(d) })),
    // Memory templates — one scaffold per element type (spec-011).
    ...MEMORY_TYPES.map((type) => ({ path: wf(`memory/templates/${type}.md`), content: memoryTemplateMd(type) })),
    // Workflows built-in/custom split (spec-011).
    { path: `${BUILTIN_WORKFLOWS_DIR}/.gitkeep`, content: '' },
    {
      path: wf('workflows/custom/sw-life-cycle.yaml'),
      content: mainWorkflowYaml(
        'sw-life-cycle',
        'The end-to-end software life cycle',
        `phases:
  - name: inception
  - name: specification
  - name: delivery
    include: ${def.slug}-delivery
  - name: sunset
`,
      ),
    },
    {
      path: wf('workflows/custom/bug-ingest.yaml'),
      content: mainWorkflowYaml('bug-ingest', 'Capture a bug on demand', 'phases:\n  - name: capture\n'),
    },
    {
      path: wf('workflows/custom/decision-log-ingest.yaml'),
      content: mainWorkflowYaml('decision-log-ingest', 'Capture a decision-log on demand', 'phases:\n  - name: capture\n'),
    },
    {
      path: wf('workflows/custom/adr-ingest.yaml'),
      content: mainWorkflowYaml('adr-ingest', 'Capture an ADR on demand', 'phases:\n  - name: capture\n'),
    },
    { path: wf(`workflows/custom/${def.slug}-delivery.yaml`), content: deliveryWorkflowYaml(def) },
  ];
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

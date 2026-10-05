/**
 * The official built-in directive templates (P3.8, US-0A-09 — `task-057-builtin-directive-templates`):
 * Code Quality, Testing, Code Review, Architecture, Security, Documentation.
 *
 * **Where they live and how they reach a project.** `spec-011-storage-layout` reserves
 * `.wingfoil/directives/built-in/` for "the official P3.8 directive templates shipped by the `wingfoil`
 * npm package", and `spec-015-packaging-publishing` §1 keeps the tarball allowlist at
 * `files: ["dist", "README.md"]` — so the templates ship as DATA compiled into `dist/`, not as loose
 * Markdown beside it. `templateScaffold` (./templates) renders them into the `ScaffoldFile[]` that
 * `wingfoil init` writes, which is also the list `initWingfoilProject` schema-checks first (REQ-SEC-10,
 * derived by `builtinTemplateSources`): adding or editing a template here is automatically checked.
 *
 * **Frontmatter** (`spec-013-directive-frontmatter-schema`): exactly the declared keys `id` (the filename
 * stem), `name`, `type: directive`, `kind: built-in`, `title`, `tags`, `ref: [P3.8]`, and `format` (`dl-149`, task-251: the frontmatter's
 * format, `DIRECTIVE_FORMAT`). No `scope`: whether a
 * directive binds every role is the project's `roles.yaml` to say, not a shipped template's (task-144
 * review, R3). No other key: an
 * undeclared key rides `.passthrough()` and prints an `unknown field(s) ignored` warning on stderr during
 * every `init` (task-044's hand-off).
 *
 * **Body**: normative, project-agnostic rules for AI agents and humans. Deliberately free of any
 * project-specific identifier, date or version, and of credential-shaped example text — the `security`
 * template must not trip the spec-007 secret scan it asks the reader to respect (asserted per template in
 * `test/storage/builtin-directives.test.ts`).
 *
 * **Customization** (`dl-037-builtin-vs-custom-directive-precedence`, implemented by `task-055` in
 * `selectDirectivesById`): a directive under `directives/custom/` with the same `id` wins over the
 * built-in, and the shadow is reported as a warning. Built-ins themselves are non-removable
 * (REQ-SEC-07, keyed on the `built-in/` directory).
 *
 * Pure data + a pure renderer (REQ-SYS-07): byte-identical output run to run.
 */
import { DIRECTIVE_FORMAT } from '../validation/format';

/** One built-in directive template, as structured data rendered by {@link builtinDirectiveMd}. */
export interface BuiltinDirectiveTemplate {
  /** Stable directive id — also the installed filename stem and the key `roles.yaml` binds on. */
  readonly id: string;
  /** Human-readable name; used as both `name` and `title` (spec-013 notes they coincide). */
  readonly name: string;
  /** One sentence naming who the directive applies to. */
  readonly appliesTo: string;
  /** The normative rules, in order, rendered as a Markdown bullet list. */
  readonly rules: readonly string[];
}

const CODE_QUALITY: BuiltinDirectiveTemplate = {
  id: 'code-quality',
  name: 'Code Quality',
  appliesTo: 'Applies to every role that writes or changes code.',
  rules: [
    'The linter reports no errors; warnings are triaged before a change is merged.',
    'Prefer small, single-responsibility functions and modules; keep complexity low.',
    'No dead code and no commented-out blocks.',
    'Match the style, naming and idioms of the surrounding code.',
    'Give public interfaces explicit types and validate external input at system boundaries.',
    'Keep each commit to one logical change with a descriptive message.',
  ],
};

const TESTING: BuiltinDirectiveTemplate = {
  id: 'testing',
  name: 'Testing',
  appliesTo: 'Applies to developers and QA.',
  rules: [
    'Test first: write a failing test before the implementation (red, green, refactor).',
    'Classify each acceptance criterion before testing it: red-first when the behaviour is new, characterization when the behaviour already exists and the test is expected to pass on its first run. Never fabricate a failing test or add dead code to force one.',
    'Every behaviour has at least one happy-path test and one edge- or error-path test.',
    'Keep coverage at or above the threshold the project declares; coverage must not regress.',
    'Tests are deterministic and isolated: no reliance on external services, wall-clock time or randomness.',
  ],
};

const CODE_REVIEW: BuiltinDirectiveTemplate = {
  id: 'code-review',
  name: 'Code Review',
  appliesTo: 'Applies to reviewers and to whoever holds approval authority.',
  rules: [
    'Check every change for correctness, tests that are present and passing, adherence to the other directives, and the absence of secrets.',
    'Verify the change satisfies the acceptance criteria of the task it implements.',
    'Verify claims by running the command that settles them; do not accept a statement about a file or test without checking it.',
    'Every finding is either fixed in the change or recorded as a tracked element (a bug or a decision-log); never leave a finding only in review notes.',
    'Approve or reject with a recorded reason; a rejection states what must change before resubmitting.',
    'Approval authority belongs to a role, not to a person; AI agents never approve their own work.',
  ],
};

const ARCHITECTURE: BuiltinDirectiveTemplate = {
  id: 'architecture',
  name: 'Architecture',
  appliesTo: 'Applies to architects and the tech lead.',
  rules: [
    'Record every significant architectural decision as an ADR stating its context, the decision and its consequences.',
    'Every architectural decision references the requirement or requirements it implements.',
    'Keep modules cohesive and loosely coupled; a change in one module must not force edits in unrelated ones.',
    'Write a technical specification for every shared file format, schema, constant set or module API before the work that implements it starts.',
    'Before approving a specification or an ADR, check that it is internally consistent, consistent with the already-approved specifications, aligned with the acceptance criteria, and traceable to its requirements.',
  ],
};

const SECURITY: BuiltinDirectiveTemplate = {
  id: 'security',
  name: 'Security',
  appliesTo: 'Applies to every role.',
  rules: [
    'Never hardcode credentials, tokens, private keys or other secrets in source code, configuration, documentation or project memory.',
    'Keep secrets out of version control; supply them at runtime from the environment or a secret manager.',
    'When an example needs a credential, describe it in words or use an obvious placeholder; never paste a real value.',
    'Validate and sanitize all external input at trust boundaries.',
    'Grant the least privilege each component needs.',
    'Review dependencies for known vulnerabilities before adding or upgrading them.',
  ],
};

const DOCUMENTATION: BuiltinDirectiveTemplate = {
  id: 'documentation',
  name: 'Documentation',
  appliesTo: 'Applies to every role.',
  rules: [
    'Document every user-facing command and feature before it ships.',
    'Update the affected documentation in the same change that alters behaviour.',
    'Every public or exported API element carries a doc comment.',
    'Record decisions in project memory (ADRs for architectural decisions, decision-logs for product and process decisions), not scattered through the codebase.',
    'Keep cross-references between documents intact.',
    'Document why, not only what.',
  ],
};

/**
 * The six P3.8 built-in directive templates, in the order the P3.8 feature lists them ("code-quality,
 * testing, code-review, architecture, security, documentation"). Fixed order (REQ-SYS-07).
 */
export const BUILTIN_DIRECTIVE_TEMPLATES: readonly BuiltinDirectiveTemplate[] = [
  CODE_QUALITY,
  TESTING,
  CODE_REVIEW,
  ARCHITECTURE,
  SECURITY,
  DOCUMENTATION,
];

/** The built-in directive ids, in {@link BUILTIN_DIRECTIVE_TEMPLATES} order. */
export const BUILTIN_DIRECTIVE_IDS: readonly string[] = BUILTIN_DIRECTIVE_TEMPLATES.map((t) => t.id);

/**
 * Render one built-in directive as the Markdown document installed at
 * `.wingfoil/directives/built-in/<id>.md`: spec-013 frontmatter, then the rules, then a note on how to
 * customize it. Pure — fixed strings only.
 */
export function builtinDirectiveMd(t: BuiltinDirectiveTemplate): string {
  const rules = t.rules.map((rule) => `- ${rule}`).join('\n');
  return `---
id: ${t.id}
name: "${t.name}"
type: directive
kind: built-in
title: "${t.name}"
tags: [built-in, ${t.id}]
ref: [P3.8]
format: ${DIRECTIVE_FORMAT}
---

# Directive — ${t.name}

${t.appliesTo}

${rules}

> Built-in WingFoil directive template. It cannot be removed. To adapt it, create
> \`directives/custom/${t.id}.md\` with \`id: ${t.id}\`: a custom directive with the same id takes
> precedence over this one, and \`wingfoil directives list\` reports the override.
`;
}

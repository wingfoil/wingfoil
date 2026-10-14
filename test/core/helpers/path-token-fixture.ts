/**
 * task-281 AC 3 (`bug-325`) — the fixture project the path-token suites share
 * (`test/core/memory-add-path-tokens.test.ts`, `test/cli/memory-add-path-tokens.integration.test.ts`):
 *
 * - `plan` at `docs/05_plans/{scope}/{id}.md`, `id_pattern: "{workflow}-{phase}-plan"` (this repository's own
 *   shape), and a startable workflow `w` with no element, so `workflow start w --set scope=…` reaches the same
 *   token filler;
 * - `t` at `docs/t/{scope}/../../{id}.md` — a committed pattern whose literal `..` takes a well-spelled value
 *   out of the type's folder (`docs/t/`) while staying inside the project root: the type-folder refusal
 *   (`E_PATH_OUTSIDE_TYPE_FOLDER`, approver ruling D1: exit 1, `VALIDATION`);
 * - `r` at `docs/t/{scope}/../../../../{id}.md` — the same, leaving the project root: `E_PATH_ESCAPES_ROOT`,
 *   kept as the positive case of the root confinement (REQ-SEC-06).
 *
 * Not a `.test.ts` file, so Jest never collects it as a suite.
 */
import { commitAll, writeFixtureFile } from '../../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  plan:
    path: "docs/05_plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      frontmatter:
        required: [ title, workflow, phase ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
  t:
    path: "docs/t/{scope}/../../{id}.md"
    id_pattern: "t-{name}"
    template:
      file: "memory/templates/t.md"
      frontmatter:
        required: [ id, type, title, status ]
  r:
    path: "docs/t/{scope}/../../../../{id}.md"
    id_pattern: "r-{name}"
    template:
      file: "memory/templates/r.md"
      frontmatter:
        required: [ id, type, title, status ]
`;

const PLAN_TEMPLATE = `---
id: ""
type: plan
title: ""
status: draft
workflow: ""
phase: ""
element: ""
parent: ""
---

## Steps

<!-- placeholder -->
`;

const scaffold = (type: string): string => `---\nid: ""\ntype: ${type}\ntitle: ""\nstatus: draft\n---\n\n<!-- body -->\n`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const W = `name: w
startable: true
phases:
  - name: tick
    role: developer
`;

/** Write and commit the fixture project at `root`. */
export function writePathTokenProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/w.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/w.yaml', W);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/memory/templates/t.md', scaffold('t'));
  writeFixtureFile(root, '.wingfoil/memory/templates/r.md', scaffold('r'));
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  commitAll(root, 'fixture');
}

/** The spelling refusals (exit 2), one per `--set scope=<value>`, with the exact message the design names. */
export const SPELLING_REFUSALS: ReadonlyArray<readonly [label: string, value: string, message: string]> = [
  ['a `..` segment (bug-325)', '../../etc', `invalid flag value: --set scope holds a '.' or '..' path segment: "../../etc"`],
  ['a `..` segment reaching .wingfoil/', '../../.wingfoil', `invalid flag value: --set scope holds a '.' or '..' path segment: "../../.wingfoil"`],
  ['a `..` segment leaving the root (no longer E_PATH_ESCAPES_ROOT, ruling D1)', '../../../../tmp', `invalid flag value: --set scope holds a '.' or '..' path segment: "../../../../tmp"`],
  ['an absolute path', '/etc', `invalid flag value: --set scope must be a relative path, got "/etc"`],
  ['an empty interior segment', 'a//b', `invalid flag value: --set scope holds an empty path segment: "a//b"`],
  ['an empty trailing segment', 'rl-v1/', `invalid flag value: --set scope holds an empty path segment: "rl-v1/"`],
  ['a `.` segment (ruling D3)', './x', `invalid flag value: --set scope holds a '.' or '..' path segment: "./x"`],
];

/**
 * The type-folder refusal of `t` with `--set scope=a --set name=one` (ruling D1: exit 1, `VALIDATION`): the
 * `StorageError` message, which carries its code as a prefix (`src/storage/errors.ts`).
 */
export const TYPE_FOLDER_MESSAGE =
  `E_PATH_OUTSIDE_TYPE_FOLDER: Memory entries must reside in their type's folder: 'docs/t/a/../../t-one.md' resolves to 'docs/t-one.md', outside 'docs/t/' ` +
  `(path 'docs/t/{scope}/../../{id}.md': {scope}="a", {id}="t-one")`;

/** The start of the kept root-escape refusal of `r` with `--set scope=a --set name=one`. */
export const ROOT_ESCAPE_PREFIX = `E_PATH_ESCAPES_ROOT: Memory entries must reside within the project root: 'docs/t/a/../../../../r-one.md' resolves to '`;

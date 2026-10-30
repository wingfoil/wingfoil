/**
 * task-281 AC 3 (`bug-325`) — the fixture project the path-token suites share
 * (`test/core/memory-add-path-tokens.test.ts`, `test/cli/memory-add-path-tokens.integration.test.ts`):
 *
 * - `plan` at `docs/05_plans/{scope}/{id}.md`, `id_pattern: "{workflow}-{phase}-plan"` (this repository's own
 *   shape), and a startable workflow `w` with no element, so `workflow start w --set scope=…` reaches the same
 *   token filler.
 *
 * task-313 AC 1 (`bug-360`) — a second project, {@link writeDotSegmentProject}, holds the two types whose
 * committed `path` carries a literal `..`, which `memory.yaml` now refuses at load:
 * - `t` at `docs/t/{scope}/../../{id}.md` (would leave the type's folder, staying inside the project root);
 * - `r` at `docs/t/{scope}/../../../../{id}.md` (would leave the project root).
 * They left the shared project, whose `memory.yaml` would otherwise no longer load for `plan` either. The
 * type-folder and root-escape guards keep their storage-level pins (`test/storage/memory-path-type-folder.test.ts`).
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

/** task-313 AC 1 — the `memory.yaml` of {@link writeDotSegmentProject}: the types `t` and `r`, in that order. */
const DOT_SEGMENT_MEMORY_YAML = `version: 1.0
types:
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

/** Write and commit the task-313 AC 1 project at `root`: the shared project's files, with types `t` and `r` only. */
export function writeDotSegmentProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/w.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/w.yaml', W);
  writeFixtureFile(root, '.wingfoil/memory.yaml', DOT_SEGMENT_MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/t.md', scaffold('t'));
  writeFixtureFile(root, '.wingfoil/memory/templates/r.md', scaffold('r'));
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  commitAll(root, 'fixture');
}

/**
 * task-313 AC 1 (approver design gate 2026-10-30, D1 (a), D3 (a)) — what `memory add` reports on that project, for
 * either type: the committed `memory.yaml` does not load, both types refused in `types` order. The wrapper around the
 * issues is the one `memory add` prints today for any committed `memory.yaml` schema refusal (copied from a run of
 * the code build on a project whose `t` and `r` declare `waiting: [ nope ]`).
 */
export const DOT_SEGMENT_REFUSAL =
  `cannot resolve the memory type registry: the committed '.wingfoil/memory.yaml' (at HEAD) is not readable as a Memory configuration: ` +
  `E_VALIDATION types.t.path (HEAD:.wingfoil/memory.yaml): path "docs/t/{scope}/../../{id}.md" holds a '.' or '..' segment; ` +
  `E_VALIDATION types.r.path (HEAD:.wingfoil/memory.yaml): path "docs/t/{scope}/../../../../{id}.md" holds a '.' or '..' segment. ` +
  `An element is created against the types the repository records (dl-080), so the committed file must be valid; fix it and commit the fix, then retry.`;

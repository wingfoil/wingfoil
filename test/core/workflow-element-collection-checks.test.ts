/**
 * task-230 — the load-time rules of the `element:<field>` collection reference (`spec-003` § "Collections"
 * and § "Diagnostics", Revision 2026-10-12; approver ruling D1 (a), 2026-10-12):
 *
 * - `element:<field>` is a collection reference, not a Memory type: no `E_WORKFLOW_ELEMENT_TYPE_UNKNOWN`;
 * - it reads a field of the including workflow's bound element, so a workflow that declares no `element`
 *   is `E_WORKFLOW_COLLECTION_UNRESOLVED`, and so is a field name outside `[a-z][a-z0-9_-]*`;
 * - the iterated workflow keeps the enclosing bound element: it may declare no `element` or the including
 *   workflow's own, which lets it include a sub bound to that type; any other `element` is
 *   `E_WORKFLOW_ELEMENT_MISMATCH`, and `dna:` / `bindings:` keep refusing any `element`.
 *
 * Fixtures are committed throw-away repositories read at `HEAD` (`loadWorkflowRegistryAtRev`).
 */
import { loadWorkflowRegistryAtRev } from '../../src/core';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

interface Diag {
  code: string;
  severity: string;
  file: string;
  path: string;
  message: string;
}

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, backlog, in-progress, done ]
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
`;

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
    - name: Roberto
      email: roberto@example.invalid
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
`;

function writeProject(root: string, workflows: Record<string, string>): void {
  const include = Object.keys(workflows)
    .map((name) => `  - workflows/custom/${name}.yaml\n`)
    .join('');
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${include}`);
  for (const [name, body] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/workflows/custom/${name}.yaml`, body);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture');
}

function diagnosticsAtHead(root: string): Diag[] {
  try {
    return [...(loadWorkflowRegistryAtRev(root, 'HEAD').diagnostics as Diag[])];
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    return [...(err as { diagnostics: Diag[] }).diagnostics];
  }
}

const errors = (diagnostics: readonly Diag[]): Diag[] => diagnostics.filter((d) => d.severity === 'error');

const DEV = 'name: dev\nkind: sub\nelement: task\nphases:\n  - name: start\n    actions:\n      - element.set_state(in-progress)\n';
const SMOKE = 'name: smoke\nkind: sub\nelement: release\nphases:\n  - name: gate\n    produces: [ "docs/{release.version}-smoke.md" ]\n';
const cycle = (element: string, over: string): string =>
  `name: cycle\nkind: main\n${element}phases:\n  - name: implementation\n    include: wave\n    iterate_over: ${over}\n`;
const wave = (element: string): string =>
  `name: wave\nkind: sub\n${element}phases:\n  - name: tasks\n    include: dev\n    iterate_over: task\n    where: { wave: "{item}", release: "{release.version}" }\n  - name: checks\n    include: smoke\n`;

describe('task-230 — element:<field> collections at load time', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('a release-bound workflow iterating a wave over element:waves, the wave including a release-bound sub, loads with zero errors', () => {
    writeProject(repo, { cycle: cycle('element: release\n', 'element:waves'), wave: wave('element: release\n'), dev: DEV, smoke: SMOKE });
    expect(errors(diagnosticsAtHead(repo))).toEqual([]);
  });

  it('the iterated workflow may also declare no element', () => {
    writeProject(repo, {
      cycle: cycle('element: release\n', 'element:waves'),
      wave: 'name: wave\nkind: sub\nphases:\n  - name: tasks\n    include: dev\n    iterate_over: task\n',
      dev: DEV,
    });
    expect(errors(diagnosticsAtHead(repo))).toEqual([]);
  });

  it('an iterated workflow bound to another type is E_WORKFLOW_ELEMENT_MISMATCH', () => {
    writeProject(repo, { cycle: cycle('element: release\n', 'element:waves'), wave: wave('element: task\n'), dev: DEV, smoke: SMOKE });
    expect(errors(diagnosticsAtHead(repo)).filter((d) => d.path === 'phases[0].include')).toEqual([
      {
        code: 'E_WORKFLOW_ELEMENT_MISMATCH',
        severity: 'error',
        file: 'workflows/custom/cycle.yaml',
        path: 'phases[0].include',
        message: "workflow 'wave' declares element 'task', but collection 'element:waves' is read from workflow 'cycle''s element 'release'",
      },
    ]);
  });

  it('a bindings: collection still refuses an iterated workflow that declares an element', () => {
    writeProject(repo, { cycle: cycle('element: release\n', 'bindings:waves'), wave: wave('element: release\n'), dev: DEV, smoke: SMOKE });
    expect(errors(diagnosticsAtHead(repo)).map((d) => d.message)).toContain(
      "workflow 'wave' declares element 'release' and cannot be iterated over collection 'bindings:waves'",
    );
  });

  it.each([
    ['a workflow that declares no element', '', 'element:waves', "collection 'element:waves' reads a field of the bound element, but workflow 'cycle' declares no element"],
    ['a field name outside [a-z][a-z0-9_-]*', 'element: release\n', 'element:Waves', "collection 'element:Waves' names no frontmatter field (expected [a-z][a-z0-9_-]*)"],
  ])('%s is E_WORKFLOW_COLLECTION_UNRESOLVED, and never E_WORKFLOW_ELEMENT_TYPE_UNKNOWN', (_name, element, over, message) => {
    writeProject(repo, {
      cycle: cycle(element, over),
      wave: 'name: wave\nkind: sub\nphases:\n  - name: tasks\n    include: dev\n    iterate_over: task\n',
      dev: DEV,
    });
    const found = errors(diagnosticsAtHead(repo));
    expect(found.map((d) => d.code)).not.toContain('E_WORKFLOW_ELEMENT_TYPE_UNKNOWN');
    expect(found.filter((d) => d.code === 'E_WORKFLOW_COLLECTION_UNRESOLVED')).toEqual([
      { code: 'E_WORKFLOW_COLLECTION_UNRESOLVED', severity: 'error', file: 'workflows/custom/cycle.yaml', path: 'phases[0].iterate_over', message },
    ]);
  });
});

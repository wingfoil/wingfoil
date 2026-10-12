/**
 * task-281 AC 2 (`bug-301`) — an uncommitted edit of a configuration file the deduction reads at `HEAD`
 * (`spec-017` §1.1) is reported as `W_UNCOMMITTED_INPUTS` (§1.2) by `workflow next` and `workflow status`,
 * and the answer is otherwise the clean run's. Approver ruling D2 (2026-10-12): the list covers every §1.1
 * configuration file — `.wingfoil/dna.yaml` (the AC), `.wingfoil/memory.yaml`, `.wingfoil/roles.yaml` and
 * the files under `.wingfoil/directives/`.
 *
 * Through the registered `CORE_MODULES` operations, on a committed fixture with one open instance.
 *
 * - red-first: each of the four configuration paths.
 * - characterization (control): an edited `README.md`, no deduction input, is not reported.
 */
import { CORE_MODULES, enumerateOperations } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { appendFileSync } from 'fs';
import { join } from 'path';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
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
    - name: Alex
      email: alex@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const MAIN = `name: release-cycle
startable: true
element: release
phases:
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

const DIRECTIVE = '.wingfoil/directives/custom/testing.md';

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', MAIN);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, DIRECTIVE, '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', 'in-development'));
  writeFixtureFile(root, 'docs/plans/rc-1.md', element('plan', 'rc-1', 'active', 'workflow: "release-cycle"\nphase: "x"\nelement: "minor-1"\n'));
  commitAll(root, 'fixture');
}

type ReadOp = 'workflowNext' | 'workflowStatus';

interface WithDiagnostics {
  readonly diagnostics: readonly { code: string }[];
}

function operation(name: ReadOp): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'workflow' && entry.operation.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found.operation.fn;
}

async function run(root: string, name: ReadOp): Promise<WithDiagnostics> {
  const result = (await operation(name)({ root })) as CoreResult<WithDiagnostics>;
  if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

const uncommitted = (value: WithDiagnostics): unknown[] => value.diagnostics.filter((d) => d.code === 'W_UNCOMMITTED_INPUTS');
const withoutDiagnostics = (value: WithDiagnostics): unknown => ({ ...value, diagnostics: [] });

describe.each<ReadOp>(['workflowNext', 'workflowStatus'])('task-281 AC 2 (bug-301) — %s reports an uncommitted configuration file (spec-017 §1.2)', (name) => {
  let repo: string;
  let clean: WithDiagnostics;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    clean = await run(repo, name);
  });
  afterAll(() => removeTempDir(repo));
  afterEach(() => {
    git(repo, ['checkout', '--quiet', '--', '.']);
  });

  it('the clean run reports no uncommitted input', () => {
    expect(uncommitted(clean)).toEqual([]);
  });

  it.each(['.wingfoil/dna.yaml', '.wingfoil/memory.yaml', '.wingfoil/roles.yaml', DIRECTIVE])(
    'red-first: an uncommitted edit of %s is one W_UNCOMMITTED_INPUTS warning; the answer is otherwise the clean run\'s',
    async (path) => {
      appendFileSync(join(repo, path), '# probe\n');
      const dirty = await run(repo, name);
      expect(uncommitted(dirty)).toEqual([
        {
          code: 'W_UNCOMMITTED_INPUTS',
          severity: 'warning',
          file: path,
          path: '',
          message: `uncommitted change to a deduction input, not read (the answer is computed from HEAD): ${path}`,
        },
      ]);
      expect(withoutDiagnostics(dirty)).toEqual(withoutDiagnostics(clean));
    },
  );

  it('control (characterization): an edited README.md, no deduction input, is not reported', async () => {
    appendFileSync(join(repo, 'README.md'), 'changed\n');
    const dirty = await run(repo, name);
    expect(uncommitted(dirty)).toEqual([]);
    expect(withoutDiagnostics(dirty)).toEqual(withoutDiagnostics(clean));
  });
});

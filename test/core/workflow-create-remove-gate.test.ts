/**
 * task-211 — W3 B6 gate: two arms of `src/core/workflow-create-remove.ts` no task-211 suite reached:
 * `workflow remove` refuses a `.wingfoil/workflows.yaml` that resolves outside the project (REQ-SEC-06) before
 * anything is written (the arms suite covers the workflow file's confinement, not the manifest's), and
 * `workflow create`'s prospective load drops the warnings of the registry it would leave.
 */
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { CORE_MODULES, enumerateOperations } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = 'version: 1.0\ntypes:\n  plan:\n    path: "docs/plans/{id}.md"\n    states:\n      sequence: [ draft, active, done ]\n      waiting: [ active ]\n';
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
const MAIN = 'name: main-flow\nstartable: true\nphases:\n  - name: one\n    role: developer\n';
const SUB = 'name: sub-flow\nincludable: true\nphases:\n  - name: one\n    role: developer\n';

describe('workflow remove — the manifest outside the project is refused (task-211)', () => {
  let root: string;
  let outside: string;
  beforeEach(() => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'include:\n  - workflows/custom/main-flow.yaml\n  - workflows/custom/sub-flow.yaml\n');
    writeFixtureFile(root, '.wingfoil/workflows/custom/main-flow.yaml', MAIN);
    writeFixtureFile(root, '.wingfoil/workflows/custom/sub-flow.yaml', SUB);
    writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
    commitAll(root, 'fixture');
    outside = mkdtempSync(join(tmpdir(), 'wf-remove-manifest-outside-'));
  });
  afterEach(() => {
    removeTempDir(root);
    rmSync(outside, { recursive: true, force: true });
  });

  it('refuses with VALIDATION and commits nothing', async () => {
    copyFileSync(join(root, '.wingfoil/workflows.yaml'), join(outside, 'workflows.yaml'));
    rmSync(join(root, '.wingfoil/workflows.yaml'));
    symlinkSync(join(outside, 'workflows.yaml'), join(root, '.wingfoil/workflows.yaml'));
    const remove = enumerateOperations(CORE_MODULES).find((entry) => entry.operation.name === 'workflowRemove')!.operation.fn;
    const result = await remove({ root, positional: 'sub-flow' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toContain('.wingfoil/workflows.yaml');
    expect(git(root, ['log', '--format=%s', '-1']).trim()).toBe('fixture');
  });
});

describe('workflow create — the prospective load drops its warnings (task-211)', () => {
  let root: string;
  afterEach(() => removeTempDir(root));

  it('creates the workflow when the registry it would leave loads with a warning', async () => {
    root = makeTempGitRepo();
    writeFixtureFile(root, '.wingfoil/workflows.yaml', 'include:\n  - workflows/custom/main-flow.yaml\n');
    writeFixtureFile(root, '.wingfoil/workflows/custom/main-flow.yaml', `${MAIN}    checks: { pre: [ 'tests.bdd.passing' ] }\n`);
    writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
    commitAll(root, 'fixture');
    const create = enumerateOperations(CORE_MODULES).find((entry) => entry.operation.name === 'workflowCreate')!.operation.fn;
    const result = await create({ root, positional: 'x-flow', options: { kind: 'sub' } });
    expect(result.ok).toBe(true);
    expect(git(root, ['log', '--format=%s', '-1']).trim()).toBe('wf(workflow): create x-flow');
  });
});

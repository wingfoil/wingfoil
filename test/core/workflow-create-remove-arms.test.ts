/**
 * task-211 — the arms of `workflow create` / `workflow remove` past the acceptance cases
 * (`test/core/workflow-create-remove.test.ts`): REQ-SEC-01 and an uninitialized project, a repository with no
 * commit, no `workflows.yaml`, a manifest the edit cannot make in place, a workflow file outside
 * `workflows/custom/`, the detail lines of the two `CONFLICT` refusals, the console renderers and a dry run's
 * plan passing through them, and the post-commit alarm. Written at refactor, so red's files stay unchanged.
 */
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { CORE_MODULES, enumerateOperations, renderCreateConsole, renderRemoveConsole, type CreateResult, type RemoveResult } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

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

function operation(name: 'workflowCreate' | 'workflowRemove'): CoreFn<unknown, unknown> {
  return enumerateOperations(CORE_MODULES).find((entry) => entry.operation.name === name)!.operation.fn;
}

const create = (root: string, name: string, kind = 'main'): Promise<CoreResult<unknown>> => operation('workflowCreate')({ root, positional: name, options: { kind } });
const remove = (root: string, ref: string): Promise<CoreResult<unknown>> => operation('workflowRemove')({ root, positional: ref });

function refusal(result: CoreResult<unknown>): { code: string; message: string; details?: Record<string, unknown> } {
  if (result.ok) throw new Error('expected a refusal');
  return result.error as { code: string; message: string; details?: Record<string, unknown> };
}

/** A project with one startable workflow, committed; `manifest` replaces the default `workflows.yaml`. */
function project(manifest: string | null = 'include:\n  - workflows/custom/main-flow.yaml\n'): string {
  const root = makeTempGitRepo();
  if (manifest !== null) writeFixtureFile(root, '.wingfoil/workflows.yaml', manifest);
  writeFixtureFile(root, '.wingfoil/workflows/custom/main-flow.yaml', MAIN);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture');
  return root;
}

describe('workflow create / remove — refusals before any read (task-211)', () => {
  it('a directory that is not a WingFoil project is refused by both, nothing written', async () => {
    const root = makeTempGitRepo();
    try {
      expect(refusal(await create(root, 'x-flow')).code).toBe('VALIDATION');
      expect(refusal(await remove(root, 'x-flow')).code).toBe('VALIDATION');
      expect(git(root, ['status', '--porcelain'])).toBe('');
    } finally {
      removeTempDir(root);
    }
  });

  it('a project with no commit yet: create is refused (it decides at HEAD), remove finds no workflow', async () => {
    const root = makeTempGitRepo();
    try {
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
      expect(refusal(await create(root, 'x-flow'))).toMatchObject({ code: 'VALIDATION', message: 'workflow create needs a commit at HEAD: commit the project configuration first' });
      expect(refusal(await remove(root, 'x-flow'))).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: x-flow' });
    } finally {
      removeTempDir(root);
    }
  });
});

describe('workflow create / remove — REQ-SEC-01: no git identity, nothing written (task-211)', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'] as const;
  const saved: Record<string, string | undefined> = {};
  let root: string;
  let scratch: string;

  beforeEach(() => {
    root = project();
    git(root, ['config', '--unset', 'user.name']);
    git(root, ['config', '--unset', 'user.email']);
    scratch = mkdtempSync(join(tmpdir(), 'wf-create-remove-noid-'));
    const emptyConfig = join(scratch, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    for (const key of ISOLATION_KEYS) delete process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(root);
    rmSync(scratch, { recursive: true, force: true });
  });

  it('both refuse with the REQ-SEC-01 message', async () => {
    const before = snapshotPersistence(root);
    expect(refusal(await create(root, 'x-flow')).message).toBe('git identity not configured (user.name/user.email)');
    expect(refusal(await remove(root, 'main-flow')).message).toBe('git identity not configured (user.name/user.email)');
    assertPersistenceUnchanged(root, before);
  });
});

describe('workflow create / remove — the manifest (task-211)', () => {
  let root: string;
  afterEach(() => removeTempDir(root));

  it('with no workflows.yaml, create writes one holding the new entry', async () => {
    root = project(null);
    const result = await create(root, 'x-flow');
    expect(result.ok).toBe(true);
    expect(git(root, ['show', 'HEAD:.wingfoil/workflows.yaml'])).toBe('version: 1.0\ninclude:\n  - workflows/custom/x-flow.yaml\n');
  });

  it('with no workflows.yaml, an includable-only first workflow would leave no startable one: refused', async () => {
    root = project(null);
    const error = refusal(await create(root, 'x-flow', 'sub'));
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toMatch(/^workflow 'x-flow' would not load: /);
  });

  it('a flow-style include: is refused by both, never rewritten', async () => {
    root = project('include: [ workflows/custom/main-flow.yaml, workflows/custom/other.yaml ]\n');
    writeFixtureFile(root, '.wingfoil/workflows/custom/other.yaml', MAIN.replace('main-flow', 'other'));
    commitAll(root, 'other');
    const before = snapshotPersistence(root);
    expect(refusal(await create(root, 'x-flow'))).toMatchObject({
      code: 'CONFLICT',
      message: 'workflows.yaml cannot be edited in place: its include: list is not a block list (one "- <file>" per line)',
    });
    expect(refusal(await remove(root, 'other')).message).toMatch(/^workflows\.yaml cannot be edited in place: /);
    assertPersistenceUnchanged(root, before);
  });

  it('a workflow file outside workflows/custom/ is not removable (REQ-SEC-07, the allow-list)', async () => {
    root = project('include:\n  - workflows/custom/main-flow.yaml\n  - flows/odd.yaml\n');
    writeFixtureFile(root, '.wingfoil/flows/odd.yaml', MAIN.replace('main-flow', 'odd'));
    commitAll(root, 'odd');
    expect(refusal(await remove(root, 'odd'))).toMatchObject({ code: 'VALIDATION', message: "cannot remove 'flows/odd.yaml': not a workflow under 'workflows/custom/'" });
  });
});

describe('workflow remove — every referrer and open instance is a detail line (task-211)', () => {
  let root: string;
  afterEach(() => removeTempDir(root));

  it('included by two workflows: both in details.referrers and as details.issues lines', async () => {
    root = project('include:\n  - workflows/custom/main-flow.yaml\n  - workflows/custom/b.yaml\n  - workflows/custom/a.yaml\n  - workflows/custom/part.yaml\n');
    const including = (name: string): string => `name: ${name}\nstartable: true\nphases:\n  - name: one\n    include: part\n`;
    writeFixtureFile(root, '.wingfoil/workflows/custom/b.yaml', including('b'));
    writeFixtureFile(root, '.wingfoil/workflows/custom/a.yaml', including('a'));
    writeFixtureFile(root, '.wingfoil/workflows/custom/part.yaml', 'name: part\nincludable: true\nphases:\n  - name: one\n    role: developer\n');
    commitAll(root, 'two referrers');
    expect(refusal(await remove(root, 'part'))).toEqual({
      code: 'CONFLICT',
      message: "cannot remove 'part': included by 'a'",
      details: { referrers: ['a', 'b'], issues: [{ detail: "included by 'a'" }, { detail: "included by 'b'" }] },
    });
  });

  it('two open instances: both ids, ascending', async () => {
    root = project();
    const plan = (id: string): string => `---\nid: "${id}"\ntype: plan\ntitle: "${id}"\nstatus: active\nworkflow: "main-flow"\nphase: "x"\nelement: ""\n---\n\n## Body\n`;
    writeFixtureFile(root, 'docs/plans/main-flow-2-plan.md', plan('main-flow-2-plan'));
    commitAll(root, 'instance 2');
    writeFixtureFile(root, 'docs/plans/main-flow-1-plan.md', plan('main-flow-1-plan'));
    commitAll(root, 'instance 1');
    expect(refusal(await remove(root, 'main-flow'))).toMatchObject({
      code: 'CONFLICT',
      message: "cannot remove 'main-flow': open instance main-flow-1-plan",
      details: { instances: ['main-flow-1-plan', 'main-flow-2-plan'], issues: [{ detail: 'open instance main-flow-1-plan' }, { detail: 'open instance main-flow-2-plan' }] },
    });
  });
});

describe('workflow create / remove — the post-commit alarm (task-211)', () => {
  it('remove: the same alarm', async () => {
    const root = project('include:\n  - workflows/custom/main-flow.yaml\n  - workflows/custom/gone.yaml\n');
    try {
      writeFixtureFile(root, '.wingfoil/workflows/custom/gone.yaml', MAIN.replace('main-flow', 'gone'));
      commitAll(root, 'gone');
      writeFixtureFile(root, 'stowaway.txt', 'x\n');
      writeFileSync(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ngit add stowaway.txt\n', { mode: 0o755 });
      expect(refusal(await remove(root, 'gone')).message).toMatch(/carries more than the change it declares: it also contains 'stowaway\.txt'/);
    } finally {
      removeTempDir(root);
    }
  });

  it('a pre-commit hook that stages another file makes the commit carry more than declared: VALIDATION', async () => {
    const root = project();
    try {
      writeFixtureFile(root, 'stowaway.txt', 'x\n');
      const hook = join(root, '.git', 'hooks', 'pre-commit');
      writeFileSync(hook, '#!/bin/sh\ngit add stowaway.txt\n', { mode: 0o755 });
      const error = refusal(await create(root, 'x-flow'));
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toMatch(/^commit [0-9a-f]{40} carries more than the change it declares: it also contains 'stowaway\.txt'/);
    } finally {
      removeTempDir(root);
    }
  });
});

describe('workflow create / remove — REQ-SEC-06 confinement, before anything is written (task-211)', () => {
  let root: string;
  let outside: string;
  beforeEach(() => {
    root = project();
    outside = mkdtempSync(join(tmpdir(), 'wf-create-remove-outside-'));
  });
  afterEach(() => {
    removeTempDir(root);
    rmSync(outside, { recursive: true, force: true });
  });

  it('create: a symbolic link at the target is refused, never followed', async () => {
    symlinkSync(join(outside, 'x-flow.yaml'), join(root, '.wingfoil/workflows/custom/x-flow.yaml'));
    const error = refusal(await create(root, 'x-flow'));
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toContain(".wingfoil/workflows/custom/x-flow.yaml");
    expect(git(root, ['log', '--format=%s', '-1']).trim()).toBe('fixture');
  });

  it('remove: a custom/ folder that leads outside the project is refused, the outside file kept', async () => {
    cpSync(join(root, '.wingfoil/workflows/custom'), outside, { recursive: true });
    rmSync(join(root, '.wingfoil/workflows/custom'), { recursive: true });
    symlinkSync(outside, join(root, '.wingfoil/workflows/custom'));
    const error = refusal(await remove(root, 'main-flow'));
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toMatch(/^cannot remove '\.wingfoil\/workflows\/custom\/main-flow\.yaml': it resolves to /);
    expect(git(root, ['log', '--format=%s', '-1']).trim()).toBe('fixture');
  });
});

describe('the console renderers (task-211)', () => {
  const baseline = { rev: 'HEAD' as const, commit: 'a'.repeat(40) };

  it('name the workflow, its file and the commit', () => {
    const created: CreateResult = { baseline, name: 'x', file: '.wingfoil/workflows/custom/x.yaml', startable: true, includable: false, commit: 'b'.repeat(40) };
    const removed: RemoveResult = { baseline, name: 'x', file: '.wingfoil/workflows/custom/x.yaml', commit: 'c'.repeat(40) };
    expect(renderCreateConsole(created)).toBe(`created workflow x (.wingfoil/workflows/custom/x.yaml) in ${'b'.repeat(40)}\n`);
    expect(renderRemoveConsole(removed)).toBe(`removed workflow x (.wingfoil/workflows/custom/x.yaml) in ${'c'.repeat(40)}\n`);
  });

  it('print a dry run plan as JSON', () => {
    const plan = { dryRun: true, subject: 'wf(workflow): create x' };
    expect(renderCreateConsole(plan as unknown as CreateResult)).toBe(`${JSON.stringify(plan, null, 2)}\n`);
    expect(renderRemoveConsole(plan as unknown as RemoveResult)).toBe(`${JSON.stringify(plan, null, 2)}\n`);
  });
});

/**
 * task-240 — `wingfoil agent list`: the cases added after red (`spec-016` §4.1, §5, §5.1). Red's suite,
 * `test/core/agent-list.test.ts`, stays as red committed it (`tests.unchanged(since: red)`); the fixture is
 * its copy in `./helpers/agent-list-fixture.ts`.
 *
 * - refactor: refusals (no commit, `dna.yaml` not committed or invalid at `HEAD`, a registry error,
 *   `paths.runs` outside the root), files that are not run logs, a root run-log directory, `none` agents;
 * - review F1: past runs ordered by element id, not by path, with prefix ids;
 * - review F5: only `<runs>/*.jsonl` direct children are dirty inputs, for `agent list --past` and for the
 *   deduction (`readDirty`), so a dirty README, a nested file, or with `paths.runs: [ ./ ]` any other file
 *   is not reported.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { serializeRunRecord } from '../../src/agent';
import { deduceWorkflowStateAtHead } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { dnaYaml, list, listed, recorded, render, run, writeProject } from './helpers/agent-list-fixture';

describe('task-240 — refusals and edges (refactor)', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('a repository with no commit: the HEAD refusal agent show gives, whichever section', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml('docs/runs/'));
    for (const request of [{ past: true }, { waiting: true }]) {
      const result = await list(repo, request);
      expect(result.ok).toBe(false);
      expect(exitCodeForResult(result)).toBe(1);
    }
  });

  it('dna.yaml not committed at HEAD, past selected → NOT_FOUND, exit 1', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'README.md', 'x\n');
    commitAll(repo, 'seed');
    writeFixtureFile(repo, '.wingfoil/dna.yaml', dnaYaml('docs/runs/'));
    const result = await list(repo, { past: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', message: '.wingfoil/dna.yaml is not committed at HEAD, which agent list reads: commit it first' } });
  });

  it('an invalid dna.yaml at HEAD → VALIDATION with its issues, exit 1', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/dna.yaml', 'version: 1\nmodules: 3\n');
    commitAll(repo, 'seed');
    const result = await list(repo, { past: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { issues: expect.any(Array) } } });
  });

  it('a workflow registry with an error at HEAD → VALIDATION with its diagnostics, exit 1, as workflow status', async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/missing.yaml\n');
    commitAll(repo, 'broken registry');
    const result = await list(repo, { waiting: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { diagnostics: expect.any(Array) } } });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('a paths.runs outside the project root is refused, not read', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, '../elsewhere/');
    const result = await list(repo, { past: true });
    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('only <element-id>.jsonl files directly in the run-log directory are read; a run-log directory at the root works', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, './');
    writeFixtureFile(repo, 'notes.txt', 'not a run log\n');
    writeFixtureFile(repo, 'sub/task-z.jsonl', 'not a run log either\n');
    recorded(repo, run('task-a', 'green', 1), '.');
    commitAll(repo, 'other files');
    expect((await listed(repo, { past: true })).past!.map((record) => record.id)).toEqual(['task-a/green/1']);
  });

  it('a waiting step whose role no agent with an adapter executes prints "none"', () => {
    const step = { instance: 'i', key: 'w.p', workflow: 'w', phase: 'p', element: null, role: 'r', allowedModes: ['fresh'], agents: [] };
    expect(render({ baseline: { rev: 'HEAD', commit: 'c' }, waiting: [step], diagnostics: [] })).toBe('waiting steps: 1\nw.p  r  none\n');
  });
});

describe('task-240 review F1 — past runs in element id order, not path order', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('an element id that is a prefix of another sorts first: minor-v0.3 before minor-v0.3.1, task-1 before task-1-x', async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    for (const id of ['task-1-x', 'minor-v0.3.1', 'task-1', 'minor-v0.3']) recorded(repo, run(id, 'red', 1));
    expect((await listed(repo, { past: true })).past!.map((record) => record.id)).toEqual(['minor-v0.3/red/1', 'minor-v0.3.1/red/1', 'task-1/red/1', 'task-1-x/red/1']);
  });
});

describe('task-240 review F5 — only run logs are dirty inputs', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  const uncommitted = (diagnostics: readonly { code: string; file?: string }[]): (string | undefined)[] =>
    diagnostics.filter((diagnostic) => diagnostic.code === 'W_UNCOMMITTED_INPUTS').map((diagnostic) => diagnostic.file);

  /** A dirty run log, plus a dirty README and a dirty nested file in the run-log directory. */
  function dirty(root: string, dir: string): void {
    writeFileSync(join(root, dir, 'task-c.jsonl'), serializeRunRecord(run('task-c', 'red', 1)));
    writeFixtureFile(root, join(dir, 'README.md'), 'notes\n');
    writeFixtureFile(root, join(dir, 'sub', 'task-d.jsonl'), 'nested\n');
  }

  it('agent list --past reports the dirty run log only', async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    recorded(repo, run('task-a', 'green', 1));
    dirty(repo, 'docs/runs');
    expect(uncommitted((await listed(repo, { past: true })).diagnostics)).toEqual(['docs/runs/task-c.jsonl']);
  });

  it('the deduction reports the dirty run log only (readDirty, spec-017 §1.2)', () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    recorded(repo, run('task-a', 'green', 1));
    dirty(repo, 'docs/runs');
    expect(uncommitted(deduceWorkflowStateAtHead(repo).diagnostics)).toEqual(['docs/runs/task-c.jsonl']);
  });

  it('with paths.runs: [ ./ ], a dirty file elsewhere in the repository is not reported, by agent list or the deduction', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, './');
    recorded(repo, run('task-a', 'green', 1), '.');
    dirty(repo, '.');
    writeFixtureFile(repo, 'src/x.ts', 'export {};\n');
    expect(uncommitted((await listed(repo, { past: true })).diagnostics)).toEqual(['task-c.jsonl']);
    expect(uncommitted(deduceWorkflowStateAtHead(repo).diagnostics)).toEqual(['task-c.jsonl']);
  });
});

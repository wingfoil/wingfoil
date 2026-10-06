/**
 * task-150-declare-task-kind-stop-line-threshold (`dl-133` §1 Q1 (b), §3 Q3 (a) / Q4 (i)) — every
 * task declares `kind: feature | fix`, and the stop-the-line threshold on open fix tasks is stated
 * once, on the `task` type of this repository's `memory.yaml`.
 *
 * Reads **this repository's own configuration** (`.wingfoil/memory.yaml`, the task scaffold) and its
 * v0.3+ task files from the working tree; the submit/amend checks run the REAL registered
 * `CORE_MODULES` operations on a THROWAWAY temp git repo seeded with that same `memory.yaml`, so
 * what is pinned is what the CLI enforces here, not a hand-written copy of it.
 *
 * - **AC 1 (red-first).** `task` requires `kind`, declares its values `[feature, fix]` and the
 *   stop-the-line block; the scaffold carries `kind` marked REQUIRED; `memory.yaml` is 1.9 (2.0 since task-168).
 * - **AC 2 (characterization).** Every non-draft task of v0.3 and later carries `kind` in
 *   `{feature, fix}`.
 * - **AC 3 (red-first).** `memory submit` of a task without `kind` is refused, nothing committed; with
 *   `kind` it goes through. The effect on older tasks: an amend of a `done` task that lacks `kind` is
 *   refused unless the amendment adds it.
 *
 * Determinism (REQ-SYS-07): task files are read in sorted order; fixed expectations.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { loadMemoryYaml } from '../../src/core/loaders';
import { splitFrontmatter } from '../../src/storage';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** This repository's root: its `.wingfoil/` is the configuration WingFoil develops itself with. */
const REPO_ROOT = join(__dirname, '..', '..');
const MEMORY_ROOT = join(REPO_ROOT, 'docs', '04_memory');
const KINDS = ['feature', 'fix'];

function frontmatterOf(content: string): Record<string, unknown> {
  const { frontmatter } = splitFrontmatter(content);
  return (load(frontmatter ?? '') as Record<string, unknown> | undefined) ?? {};
}

/** `{ major, minor }` of a release folder name such as `v0.3` or `v0.2.2`; `null` for any other folder. */
function releaseOf(folder: string): { major: number; minor: number } | null {
  const match = /^v(\d+)\.(\d+)(?:\.\d+)?$/.exec(folder);
  if (match === null) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** `v0.3` and every later release folder, sorted. */
function releaseFoldersFromV03(): string[] {
  return readdirSync(MEMORY_ROOT)
    .filter((folder) => {
      const version = releaseOf(folder);
      return version !== null && (version.major > 0 || version.minor >= 3);
    })
    .sort();
}

describe('the `task` type declares `kind` and the stop-the-line threshold (task-150, dl-133)', () => {
  const memoryYaml = loadMemoryYaml(REPO_ROOT);
  const task = memoryYaml.types.task as Record<string, unknown> & { template?: { frontmatter: Record<string, unknown>; file: string } };

  it('AC 1: memory.yaml is version 2 or later (1.9 at task-150; 2.0 since task-168), compared as a number', () => {
    expect(memoryYaml.version).toBeGreaterThanOrEqual(2);
  });

  it('AC 1: `kind` is a required task field, with the declared values feature | fix (dl-133 Q1 (b))', () => {
    expect(task.template?.frontmatter.required).toEqual(['title', 'release', 'kind']);
    expect(task.template?.frontmatter.values).toEqual({ kind: KINDS });
  });

  it('AC 1: the stop-the-line threshold is stated once, on `task` (dl-133 §3 Q3 (a), Q4 (i))', () => {
    expect(task.stop_the_line).toEqual({
      field: 'kind',
      counts: 'fix',
      blocks: 'feature',
      open: 'status != done',
      scope: 'release',
      max_share: 30,
      at: 'dev-loop start',
    });
  });

  it('AC 1: the task scaffold carries `kind`, marked REQUIRED, empty until the author fills it', () => {
    const scaffold = readFileSync(join(REPO_ROOT, '.wingfoil', task.template?.file ?? ''), 'utf-8');
    expect(frontmatterOf(scaffold).kind).toBe('');
    const line = (splitFrontmatter(scaffold).frontmatter ?? '').split('\n').find((l) => l.startsWith('kind:'));
    expect(line).toMatch(/# REQUIRED — feature \| fix/);
  });

  it('AC 2: every non-draft task of v0.3 and later carries `kind` in {feature, fix}', () => {
    const folders = releaseFoldersFromV03();
    expect(folders).toContain('v0.3');
    const offenders: string[] = [];
    let checked = 0;
    for (const folder of folders) {
      const files = readdirSync(join(MEMORY_ROOT, folder)).filter((f) => f.startsWith('task-') && f.endsWith('.md')).sort();
      for (const file of files) {
        const fields = frontmatterOf(readFileSync(join(MEMORY_ROOT, folder, file), 'utf-8'));
        if (fields.status === 'draft') continue;
        checked += 1;
        if (!KINDS.includes(String(fields.kind))) offenders.push(`${folder}/${file}: kind=${String(fields.kind)}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});

describe('`memory submit` / `memory amend` enforce `kind` with this repository\'s memory.yaml (task-150 AC 3)', () => {
  const TEST_NAME = 'WingFoil Test';
  const TEST_EMAIL = 'wf-test@example.invalid';
  const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

  function taskDoc(id: string, status: string, release: string, kind: string | null, body = 'Real content.\n'): string {
    const kindLine = kind === null ? '' : `kind: "${kind}"\n`;
    return `---
id: "${id}"
type: task
title: "A task"
status: ${status}
release: "${release}"
${kindLine}priority: "medium"
tags: []
ref: ""
bug: []
depends_on: []
tmpl_version: 260703
---

## Description

${body}`;
  }

  function operation<T>(name: string): CoreFn<unknown, T> {
    const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
    if (!op) throw new Error(`"${name}" is not registered on the memory module`);
    return op.fn as CoreFn<unknown, T>;
  }
  const gitOut = (repo: string, args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();

  const NO_KIND = 'docs/04_memory/v0.3/task-901-no-kind.md';
  const WITH_KIND = 'docs/04_memory/v0.3/task-902-with-kind.md';
  const OLD_DONE = 'docs/04_memory/v0.2/task-050-old.md';
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', readFileSync(join(REPO_ROOT, '.wingfoil', 'memory.yaml'), 'utf-8'));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, NO_KIND, taskDoc('task-901-no-kind', 'draft', 'v0.3', null));
    writeFixtureFile(repo, WITH_KIND, taskDoc('task-902-with-kind', 'draft', 'v0.3', 'fix'));
    writeFixtureFile(repo, OLD_DONE, taskDoc('task-050-old', 'done', 'v0.2', null));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('refuses to submit a task without `kind`: VALIDATION naming the field, nothing committed', async () => {
    const before = gitOut(repo, ['rev-parse', 'HEAD']);
    const unchanged = snapshotPersistence(repo);
    const result = await operation('memorySubmit')({ root: repo, positional: 'task-901-no-kind', positionals: ['task-901-no-kind'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'VALIDATION', message: 'missing required field on submit: kind' });
    expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(readFileSync(join(repo, NO_KIND), 'utf-8')).toBe(taskDoc('task-901-no-kind', 'draft', 'v0.3', null));
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('submits a task that declares `kind` (draft → pending, one commit)', async () => {
    const result = await operation('memorySubmit')({ root: repo, positional: 'task-902-with-kind', positionals: ['task-902-with-kind'] });
    expect(result.ok ? null : result.error.message).toBeNull();
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(task): submit task-902-with-kind');
  });

  it('older tasks: amending a `done` task that has no `kind` is refused unless the amendment adds it', async () => {
    writeFixtureFile(repo, OLD_DONE, taskDoc('task-050-old', 'done', 'v0.2', null, 'Corrected content.\n'));
    const refused = await operation('memoryAmend')({ root: repo, positional: 'task-050-old', options: { reason: 'r' } });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toBe('missing required field on amend: kind');

    writeFixtureFile(repo, OLD_DONE, taskDoc('task-050-old', 'done', 'v0.2', 'feature', 'Corrected content.\n'));
    const amended = await operation('memoryAmend')({ root: repo, positional: 'task-050-old', options: { reason: 'r' } });
    expect(amended.ok ? null : amended.error.message).toBeNull();
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(task): amend task-050-old [done → done]');
  });
});

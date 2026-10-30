/**
 * task-189 (bug-161) — the branch arms of `src/core/index.ts` that no other suite reached, each driven
 * through the REAL registered `CORE_MODULES` operation that owns it. The post-condition alarms of
 * `directive create`, `directive remove` and `memory add` live with their siblings in
 * `write-guard-committed-paths.test.ts`; the arms here are the rest:
 *
 * - `loadOrError` maps an unreadable configuration file to the `IO` refusal (task-309, `bug-251`); its
 *   re-throw of a failure that is no expected domain failure is `load-or-error-throw-arm.test.ts`;
 * - `dna remove` called with no options object at all (the MCP Tool's arguments are optional);
 * - `memory add`'s `singleOption` keeps the LAST of a repeated option;
 * - `memory add` re-throws a failure that is neither a `StorageError` nor a `ValidationError`;
 * - `directive remove` returns the HEAD inventory loader's refusal for a committed invalid directive file
 *   (task-311: an uncommitted one no longer decides).
 *
 * Every write lands in a throwaway temp git repo. Deterministic (REQ-SYS-07): fixed fixtures, fixed
 * git identity from the fixture helper, no clock.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, loadDnaYaml, type CoreResult } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { captureDryRun } from '../../src/storage';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

function op(module: string, name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((candidate) => candidate.name === module)?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${module}.${name}" is not registered`);
  return operation.fn;
}

function subject(repo: string): string {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim();
}

describe('src/core/index.ts arms with no other test (task-189, bug-161)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });
  afterEach(() => removeTempDir(repo));

  // task-309 (bug-251) moved this pin on purpose: an unreadable `dna.yaml` is now an expected domain
  // failure (`ConfigFileUnreadableError` → `IO`, exit 1, design gate 2026-10-30, D4), so the EISDIR
  // trigger reaches the `CoreResult` arm. The throw arm itself (`refusal === null` -> throw), which stays
  // correct for programmer errors, is pinned by `load-or-error-throw-arm.test.ts`.
  it('loadOrError: a dna.yaml that is a directory is the IO refusal naming the file, exit 1 (bug-251)', async () => {
    rmSync(join(repo, '.wingfoil', 'dna.yaml'));
    mkdirSync(join(repo, '.wingfoil', 'dna.yaml'));

    const result = (await op('dna', 'dnaShow')({ root: repo })) as CoreResult<unknown>;

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toEqual({ code: 'IO', message: '.wingfoil/dna.yaml is a directory, not a file' });
    expect(exitCodeForResult(result)).toBe(1);
  });

  it('dna remove with no options object removes an optional leaf (the MCP Tool may send no options)', async () => {
    const added = await op('dna', 'dnaUpdate')({ root: repo, positionals: ['project.license'], options: { value: 'MIT' } });
    expect(added.ok).toBe(true);
    expect(loadDnaYaml(repo).project?.license).toBe('MIT');

    const removed = await op('dna', 'dnaRemove')({ root: repo, positionals: ['project.license'] });

    expect(removed.ok).toBe(true);
    expect(loadDnaYaml(repo).project?.license).toBeUndefined();
    expect(subject(repo)).toBe('wf(dna): remove project.license');
  });

  it('memory add: a repeated single-valued option keeps its last occurrence', async () => {
    const result = await op('memory', 'memoryAdd')({
      root: repo,
      options: { type: ['task', 'bug'], title: ['First title', 'Second title'] },
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ id: 'bug-001-second-title', path: 'docs/memory/bug/bug-001-second-title.md' });
  });

  it('memory add: a failure that is neither a StorageError nor a ValidationError propagates as a throw', async () => {
    // The trigger since task-210: the dry-run stop the commit primitive throws where the operation
    // would commit (`src/storage/dry-run.ts`). Before it, the arm was reached by a refusing hook's raw
    // git error, which `bug-217`'s fix turned into a `StorageError` (`E_COMMIT_FAILED`, below).
    const before = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
    let thrown: unknown;
    const outcome = await captureDryRun(async () => {
      try {
        return await op('memory', 'memoryAdd')({ root: repo, options: { type: 'bug', title: 'Planned' } });
      } catch (error) {
        thrown = error;
        throw error;
      }
    });

    expect((thrown as Error | undefined)?.name).toBe('DryRunStop');
    expect(outcome.kind).toBe('planned');
    expect(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim()).toBe(before);
  });

  it('memory add: a commit git refuses is the StorageError arm, IO, with nothing left behind (bug-217)', async () => {
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', 'utf-8');
    chmodSync(hook, 0o755);

    const result = await op('memory', 'memoryAdd')({ root: repo, options: { type: 'bug', title: 'Refused' } });

    expect(result.ok === false && result.error.code).toBe('IO');
    expect(result.ok === false && result.error.message).toContain('E_COMMIT_FAILED');
    expect(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf-8' })).toBe('');
  });

  // task-311 (bug-108, dl-080 (B)) rewrote this pin on purpose: `directive remove` now resolves the
  // directive at HEAD, so the file that decides the refusal is the COMMITTED one, named at its revision,
  // and an uncommitted invalid file no longer refuses anything (the working tree only words a refusal).
  it('directive remove: a COMMITTED invalid directive file is the HEAD inventory loader\'s VALIDATION refusal', async () => {
    // A file the loader cannot skip: it reads fine but carries no frontmatter, so the whole pillar is
    // refused (loaders.ts `parseDirectiveFile`) before the name is looked up.
    writeFileSync(join(repo, '.wingfoil', 'directives', 'custom', 'broken.md'), 'no frontmatter here\n', 'utf-8');
    execFileSync('git', ['-C', repo, 'add', '--', '.wingfoil/directives/custom/broken.md']);
    execFileSync('git', ['-C', repo, 'commit', '--quiet', '-m', 'fixture: commit a directive with no frontmatter']);

    const result = await op('directive', 'directiveRemove')({ root: repo, positional: 'anything' });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok === false && result.error.code).toBe('VALIDATION');
    expect(result.ok === false && result.error.message).toContain('E_MISSING_FRONTMATTER');
    expect(result.ok === false && result.error.message).toContain('HEAD:.wingfoil/directives/custom/broken.md');
  });

  it('directive remove: an UNCOMMITTED invalid directive file no longer decides — the name is unknown at HEAD', async () => {
    writeFileSync(join(repo, '.wingfoil', 'directives', 'custom', 'broken.md'), 'no frontmatter here\n', 'utf-8');

    const result = await op('directive', 'directiveRemove')({ root: repo, positional: 'anything' });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok === false && result.error.code).toBe('NOT_FOUND');
    expect(result.ok === false && result.error.message).toBe('unknown directive: anything');
  });
});

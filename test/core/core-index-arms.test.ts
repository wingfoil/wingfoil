/**
 * task-189 (bug-161) — the branch arms of `src/core/index.ts` that no other suite reached, each driven
 * through the REAL registered `CORE_MODULES` operation that owns it. The post-condition alarms of
 * `directive create`, `directive remove` and `memory add` live with their siblings in
 * `write-guard-committed-paths.test.ts`; the arms here are the rest:
 *
 * - `loadOrError` re-throws a loader failure that is neither a `ValidationError` nor `ENOENT`
 *   (spec-006 §2: only expected domain failures become a `CoreResult`);
 * - `dna remove` called with no options object at all (the MCP Tool's arguments are optional);
 * - `memory add`'s `singleOption` keeps the LAST of a repeated option;
 * - `memory add` re-throws a failure that is neither a `StorageError` nor a `ValidationError`;
 * - `directive remove` returns the inventory loader's refusal for an invalid directive file.
 *
 * Every write lands in a throwaway temp git repo. Deterministic (REQ-SYS-07): fixed fixtures, fixed
 * git identity from the fixture helper, no clock.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject, loadDnaYaml } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
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

  it('loadOrError: a loader failure that is not an expected domain failure propagates as a throw', async () => {
    // A directory where `dna.yaml` should be: the read fails with EISDIR, which is neither a
    // `ValidationError` nor ENOENT, so no `CoreResult` describes it.
    rmSync(join(repo, '.wingfoil', 'dna.yaml'));
    mkdirSync(join(repo, '.wingfoil', 'dna.yaml'));

    await expect(op('dna', 'dnaShow')({ root: repo })).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('dna remove with no options object removes an optional leaf (the MCP Tool may send no options)', async () => {
    const added = await op('dna', 'dnaUpdate')({ root: repo, positionals: ['project.license'], options: { value: 'MIT' } });
    expect(added.ok).toBe(true);
    expect(loadDnaYaml(repo).project.license).toBe('MIT');

    const removed = await op('dna', 'dnaRemove')({ root: repo, positionals: ['project.license'] });

    expect(removed.ok).toBe(true);
    expect(loadDnaYaml(repo).project.license).toBeUndefined();
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
    // A pre-commit hook that refuses the commit: `commitPaths` throws git's own error (by design,
    // src/storage/commit.ts), which `memory add` does not translate into a domain refusal.
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', 'utf-8');
    chmodSync(hook, 0o755);
    const before = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

    await expect(op('memory', 'memoryAdd')({ root: repo, options: { type: 'bug', title: 'Refused' } })).rejects.toThrow(/ commit --only /);
    expect(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim()).toBe(before);
  });

  it('directive remove: an invalid directive file is the inventory loader\'s VALIDATION refusal', async () => {
    // A file the loader cannot skip: it reads fine but carries no frontmatter, so the whole pillar is
    // refused (loaders.ts `parseDirectiveFile`) before the name is looked up.
    writeFileSync(join(repo, '.wingfoil', 'directives', 'custom', 'broken.md'), 'no frontmatter here\n', 'utf-8');

    const result = await op('directive', 'directiveRemove')({ root: repo, positional: 'anything' });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok === false && result.error.code).toBe('VALIDATION');
    expect(result.ok === false && result.error.message).toContain('E_MISSING_FRONTMATTER');
  });
});

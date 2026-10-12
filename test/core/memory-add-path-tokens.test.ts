/**
 * task-281 AC 3 (`bug-325`, REQ-SEC-06) — a `--set` value filling a `path` token cannot place a Memory
 * document outside its type's folder. Through the registered `CORE_MODULES` operations `memory.memoryAdd`
 * and `workflow.workflowStart`, on the fixture of `./helpers/path-token-fixture`.
 *
 * - red-first: a value holding a `..` or `.` segment (ruling D3), an absolute path or an empty segment is a
 *   usage error (`UsageError`, exit 2) naming the token, decided in `parseSetOptions` before anything is
 *   read or written — for `memory add` and `workflow start` alike;
 * - red-first: a committed `path` whose literal `..` takes a well-spelled value out of the type's folder is
 *   refused, nothing written: `VALIDATION`, exit 1 (ruling D1), the `E_PATH_OUTSIDE_TYPE_FOLDER` message;
 * - characterization: a nested, well-spelled value is accepted; a root escape is still
 *   `E_PATH_ESCAPES_ROOT` (`VALIDATION`, exit 1).
 *
 * The CLI's exit codes and stderr are `test/cli/memory-add-path-tokens.integration.test.ts`; the pure
 * resolver is `test/storage/memory-path-type-folder.test.ts`.
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, enumerateOperations } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { ROOT_ESCAPE_PREFIX, SPELLING_REFUSALS, TYPE_FOLDER_MESSAGE, writePathTokenProject } from './helpers/path-token-fixture';

function operation(module: 'memory' | 'workflow', name: string): CoreFn<unknown, unknown> {
  const found = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === module && entry.operation.name === name);
  if (found === undefined) throw new Error(`${module}.${name} is not registered`);
  return found.operation.fn;
}

const add = (root: string, options: Record<string, unknown>): Promise<CoreResult<{ id: string; path: string }>> =>
  operation('memory', 'memoryAdd')({ root, options }) as Promise<CoreResult<{ id: string; path: string }>>;

/** Run `call` expecting a `UsageError` (exit 2); returns its message. */
async function usageError(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).exitCode).toBe(2);
    return (error as UsageError).message;
  }
  throw new Error('expected a UsageError, the call succeeded');
}

describe('task-281 AC 3 (bug-325) — memory add / workflow start: a path-token value is spelled as one relative path (exit 2)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writePathTokenProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it.each(SPELLING_REFUSALS)('red-first: memory add --set scope=<%s> is refused before anything is written', async (_label, value, message) => {
    const unchanged = snapshotPersistence(repo);
    const got = await usageError(() => add(repo, { type: 'plan', title: 'x', set: ['workflow=w', 'phase=p', `scope=${value}`] }));
    expect(got).toBe(message);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it.each(SPELLING_REFUSALS)('red-first: workflow start w --set scope=<%s> is refused the same way, no commit', async (_label, value, message) => {
    const unchanged = snapshotPersistence(repo);
    const got = await usageError(() => operation('workflow', 'workflowStart')({ root: repo, positional: 'w', options: { set: [`scope=${value}`] } }));
    expect(got).toBe(message);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('characterization: a nested, well-spelled value is accepted (docs/05_plans/rl-v1/rel-v0.3/w-p-plan.md)', async () => {
    // A repository of its own: on the code before green the refusals above write, and their documents share this id.
    const own = makeTempGitRepo();
    try {
      writePathTokenProject(own);
      const result = await add(own, { type: 'plan', title: 'x', set: ['workflow=w', 'phase=p', 'scope=rl-v1/rel-v0.3'] });
      expect(result).toMatchObject({ ok: true, value: { id: 'w-p-plan', path: 'docs/05_plans/rl-v1/rel-v0.3/w-p-plan.md' } });
      expect(git(own, ['log', '-1', '--format=%s']).trim()).toBe('wf(plan): add w-p-plan');
    } finally {
      removeTempDir(own);
    }
  });
});

describe("task-281 AC 3 (bug-325) — the resolved document must lie in its type's folder (ruling D1: exit 1)", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writePathTokenProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it("red-first: a committed `path` whose literal `..` leaves docs/t/ is refused, VALIDATION, E_PATH_OUTSIDE_TYPE_FOLDER's message, nothing written", async () => {
    const unchanged = snapshotPersistence(repo);
    const result = await add(repo, { type: 't', title: 'x', set: ['scope=a', 'name=one'] });
    expect(existsSync(join(repo, 'docs', 't-one.md'))).toBe(false);
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: TYPE_FOLDER_MESSAGE } });
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('characterization: a committed `path` leaving the project root is still E_PATH_ESCAPES_ROOT (VALIDATION, exit 1), nothing written', async () => {
    const unchanged = snapshotPersistence(repo);
    const result = await add(repo, { type: 'r', title: 'x', set: ['scope=a', 'name=one'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message.startsWith(ROOT_ESCAPE_PREFIX)).toBe(true);
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(repo, unchanged);
  });
});

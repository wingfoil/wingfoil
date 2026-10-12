/**
 * task-281 AC 3 (`bug-325`, REQ-SEC-06) — the pure half of the type-folder confinement in
 * `src/storage/memory-path.ts`:
 *
 * - red-first: `pathPatternFolder(pattern)` — the static prefix of a type's `path` pattern, up to and
 *   including the last `/` before its first `{` (the directory part when there is no `{`; `''` when the first
 *   `{` is in the first segment). It does not exist before green: it is reached through the module namespace
 *   so the failure is an assertion (`typeof … === 'function'`), not a compile error;
 * - red-first: `resolveConfinedMemoryPath` refuses a rendered path that normalizes outside that folder with
 *   `StorageError` `E_PATH_OUTSIDE_TYPE_FOLDER`, after its root checks;
 * - characterization: a root escape is still `E_PATH_ESCAPES_ROOT`; a value that stays in the folder after
 *   normalization (`v0.1/sub/..`, `test/storage/memory-path.test.ts`) and a nested value are accepted.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { StorageError } from '../../src/storage/errors';
import * as memoryPath from '../../src/storage/memory-path';
import { resolveConfinedMemoryPath } from '../../src/storage/memory-path';
import { removeTempDir } from './helpers/git-fixture';

/** `pathPatternFolder` as green will export it, or `undefined` before. */
const pathPatternFolder = (memoryPath as unknown as Record<string, unknown>)['pathPatternFolder'] as ((pattern: string) => string) | undefined;

function thrown(call: () => unknown): StorageError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(StorageError);
    return error as StorageError;
  }
  throw new Error('expected a StorageError, the call returned');
}

describe('task-281 AC 3 — pathPatternFolder: the static prefix of a path pattern (red-first)', () => {
  it('is exported by src/storage/memory-path', () => {
    expect(typeof pathPatternFolder).toBe('function');
  });

  it.each([
    ['docs/05_plans/{scope}/{id}.md', 'docs/05_plans/'],
    ['docs/04_memory/planning/rl-{release-line}/{id}.md', 'docs/04_memory/planning/'],
    ['{scope}/{id}.md', ''],
    ['docs/fixed.md', 'docs/'],
  ])('%s → %j', (pattern, folder) => {
    expect(typeof pathPatternFolder).toBe('function');
    expect(pathPatternFolder!(pattern)).toBe(folder);
  });
});

describe("task-281 AC 3 — resolveConfinedMemoryPath keeps a document in its type's folder", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-type-folder-'));
  });
  afterAll(() => removeTempDir(root));

  it('red-first: a pattern whose literal `..` leaves docs/t/ inside the root → E_PATH_OUTSIDE_TYPE_FOLDER, with the message the design names', () => {
    const error = thrown(() => resolveConfinedMemoryPath(root, 'docs/t/{scope}/../../{id}.md', { scope: 'a', id: 't-one' }));
    expect(error.code).toBe('E_PATH_OUTSIDE_TYPE_FOLDER');
    expect(error.message).toBe(
      `E_PATH_OUTSIDE_TYPE_FOLDER: Memory entries must reside in their type's folder: 'docs/t/a/../../t-one.md' resolves to 'docs/t-one.md', outside 'docs/t/' ` +
        `(path 'docs/t/{scope}/../../{id}.md': {scope}="a", {id}="t-one")`,
    );
  });

  it('red-first: a token value with `..` segments that stays in the root but leaves the folder → E_PATH_OUTSIDE_TYPE_FOLDER', () => {
    const error = thrown(() => resolveConfinedMemoryPath(root, 'docs/05_plans/{scope}/{id}.md', { scope: '../../.wingfoil', id: 'w-p-plan' }));
    expect(error.code).toBe('E_PATH_OUTSIDE_TYPE_FOLDER');
  });

  it('characterization: a root escape is still E_PATH_ESCAPES_ROOT (checked first)', () => {
    const error = thrown(() => resolveConfinedMemoryPath(root, 'docs/04_memory/{release}/{id}.md', { release: '../../../../../tmp', id: 'evil' }));
    expect(error.code).toBe('E_PATH_ESCAPES_ROOT');
  });

  it('characterization: a value that normalizes back into the folder, and a nested value, are accepted', () => {
    expect(resolveConfinedMemoryPath(root, 'docs/04_memory/{release}/{id}.md', { release: 'v0.1/sub/..', id: 'task-1' })).toBe(join(root, 'docs/04_memory/v0.1/task-1.md'));
    expect(resolveConfinedMemoryPath(root, 'docs/05_plans/{scope}/{id}.md', { scope: 'rl-v1/rel-v0.3', id: 'w-p-plan' })).toBe(join(root, 'docs/05_plans/rl-v1/rel-v0.3/w-p-plan.md'));
  });
});

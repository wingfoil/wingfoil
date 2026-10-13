/**
 * task-281 (`bug-325`) — a `path` pattern whose first segment holds a token has no folder narrower than the
 * project root (`pathPatternFolder` → `''`): the type-folder check accepts any path the root checks accepted.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { pathPatternFolder, resolveConfinedMemoryPath } from '../../src/storage/memory-path';
import { removeTempDir } from './helpers/git-fixture';

describe('task-281 — a root-level path pattern', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-root-folder-'));
  });
  afterAll(() => removeTempDir(root));

  it('has an empty folder, and a nested value resolves under the root', () => {
    expect(pathPatternFolder('{id}.md')).toBe('');
    expect(resolveConfinedMemoryPath(root, '{scope}/{id}.md', { scope: 'a/b', id: 'x' })).toBe(join(root, 'a/b/x.md'));
  });

  it('still refuses a climb out of the root with E_PATH_ESCAPES_ROOT', () => {
    expect(() => resolveConfinedMemoryPath(root, '{scope}/{id}.md', { scope: '../..', id: 'x' })).toThrow(/E_PATH_ESCAPES_ROOT/);
  });
});

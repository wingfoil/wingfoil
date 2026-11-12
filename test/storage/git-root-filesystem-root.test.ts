/**
 * task-350 (review) — `findGitRoot`'s filesystem-root branch, reached hermetically: `fs.existsSync` is mocked
 * to report no `.git` anywhere, so the walk climbs to the filesystem root whatever exists on this machine
 * (`bug-406`, `bug-453`: no test may depend on what lies above its temporary directory). Node's `fs` exports
 * are not configurable, so `jest.spyOn(fs, 'existsSync')` cannot redefine them: the module is mocked instead,
 * for this file only.
 */
import { existsSync } from 'fs';
import { join, parse, resolve } from 'path';

import { findGitRoot } from '../../src/storage/git-root';

jest.mock('fs', () => ({ ...jest.requireActual<typeof import('fs')>('fs'), existsSync: jest.fn(() => false) }));

describe('findGitRoot — the filesystem root, with no .git anywhere (existsSync mocked)', () => {
  it('returns null once the filesystem root is examined, having checked every directory on the way', () => {
    const start = resolve('/', 'wf-no-such', 'a', 'b');
    expect(findGitRoot(start)).toBeNull();
    expect(jest.mocked(existsSync).mock.calls.map(([path]) => path)).toEqual([
      join(start, '.git'),
      join(resolve(start, '..'), '.git'),
      join(resolve(start, '..', '..'), '.git'),
      join(parse(start).root, '.git'),
    ]);
  });
});

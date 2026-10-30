/**
 * task-281 AC 3 (`bug-325`, REQ-SEC-06) — `wingfoil memory add --set` and `wingfoil workflow start --set` on the
 * compiled CLI: the exit codes and the `error:` line a user sees when a path-token value would place a
 * document outside its type's folder. The operations' own cases are `test/core/memory-add-path-tokens.test.ts`.
 *
 * - red-first: a `..`/`.` segment, an absolute path or an empty segment → exit 2, nothing written, with and
 *   without `--dry-run`; `workflow start` the same;
 *
 * task-313 AC 1 (`bug-360`) — a committed `path` holding a literal `..` (the second fixture project) → exit 1, the
 * committed `memory.yaml` refusal naming both types on stderr, nothing on stdout, nothing written (approver design
 * gate 2026-10-30, D1 (a), D3 (a)).
 */
import { existsSync } from 'fs';
import { join } from 'path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { DOT_SEGMENT_REFUSAL, SPELLING_REFUSALS, writeDotSegmentProject, writePathTokenProject } from '../core/helpers/path-token-fixture';
import { runCliEntry } from './helpers/spawn-cli';

describe('task-281 AC 3 (bug-325) — wingfoil memory add / workflow start --set on the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writePathTokenProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  describe.each([[[] as string[]], [['--dry-run']]])('memory add %j', (extra) => {
    it.each(SPELLING_REFUSALS)('red-first: --set scope=<%s> → exit 2, the error line, nothing written', (_label, value, message) => {
      const unchanged = snapshotPersistence(repo);
      const run = runCliEntry(repo, ['memory', 'add', '--type', 'plan', '--title', 'x', '--set', 'workflow=w', '--set', 'phase=p', '--set', `scope=${value}`, ...extra]);
      expect([run.status, run.stdout, run.stderr]).toEqual([2, '', `error: ${message}\n`]);
      assertPersistenceUnchanged(repo, unchanged);
    });
  });

  it('red-first: workflow start w --set scope=../../etc → exit 2, the same error line, no commit', () => {
    const [, value, message] = SPELLING_REFUSALS[0]!;
    const unchanged = snapshotPersistence(repo);
    const run = runCliEntry(repo, ['workflow', 'start', 'w', '--set', `scope=${value}`]);
    expect([run.status, run.stdout, run.stderr]).toEqual([2, '', `error: ${message}\n`]);
    assertPersistenceUnchanged(repo, unchanged);
  });
});

describe('task-313 AC 1 (bug-360) — wingfoil memory add on a committed `path` holding a literal `..`', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeDotSegmentProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it.each([
    ['t', 'docs/t-one.md'],
    ['r', '../r-one.md'],
  ])('red-first: --type %s → exit 1, the memory.yaml refusal naming both types, nothing written', (type, wouldBe) => {
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const unchanged = snapshotPersistence(repo);
    const run = runCliEntry(repo, ['memory', 'add', '--type', type, '--title', 'x', '--set', 'scope=a', '--set', 'name=one']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', `error: ${DOT_SEGMENT_REFUSAL}\n`]);
    expect(existsSync(join(repo, wouldBe))).toBe(false);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
    assertPersistenceUnchanged(repo, unchanged);
  });
});

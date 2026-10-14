/**
 * task-281 AC 3 (`bug-325`, REQ-SEC-06) — `wingfoil memory add --set` and `wingfoil workflow start --set` on the
 * compiled CLI: the exit codes and the `error:` line a user sees when a path-token value would place a
 * document outside its type's folder. The operations' own cases are `test/core/memory-add-path-tokens.test.ts`.
 *
 * - red-first: a `..`/`.` segment, an absolute path or an empty segment → exit 2, nothing written, with and
 *   without `--dry-run`; `workflow start` the same;
 * - red-first: the committed-pattern type-folder refusal → exit 1 (ruling D1);
 * - characterization: the root escape → exit 1, `E_PATH_ESCAPES_ROOT`'s message.
 */
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { ROOT_ESCAPE_PREFIX, SPELLING_REFUSALS, TYPE_FOLDER_MESSAGE, writePathTokenProject } from '../core/helpers/path-token-fixture';
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

  it("red-first: a committed `path` whose literal `..` leaves the type's folder → exit 1 (ruling D1), nothing written", () => {
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const unchanged = snapshotPersistence(repo);
    const run = runCliEntry(repo, ['memory', 'add', '--type', 't', '--title', 'x', '--set', 'scope=a', '--set', 'name=one']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', `error: ${TYPE_FOLDER_MESSAGE}\n`]);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('characterization: a committed `path` leaving the project root → exit 1, E_PATH_ESCAPES_ROOT\'s message, nothing written', () => {
    const unchanged = snapshotPersistence(repo);
    const run = runCliEntry(repo, ['memory', 'add', '--type', 'r', '--title', 'x', '--set', 'scope=a', '--set', 'name=one']);
    expect(run.status).toBe(1);
    expect(run.stderr.startsWith(`error: ${ROOT_ESCAPE_PREFIX}`)).toBe(true);
    assertPersistenceUnchanged(repo, unchanged);
  });
});

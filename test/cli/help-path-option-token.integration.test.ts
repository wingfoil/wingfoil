/**
 * task-380 (green) — the help command's path ends at the first option token (`bug-452`, `spec-008` §8). Commander keeps
 * an option it does not know in `program.args`, with every token after it, so the walk of the path would otherwise read
 * `--bogus` as an operand and refuse it as an unknown command. The path ends there instead and the option is ignored,
 * as Commander ignores it on a one-operand path (`wingfoil help memory --bogus` prints `memory --help`'s text).
 *
 * Unasserted here (T1): the path walk itself (`help-command-path.integration.test.ts`).
 */
import { existsSync } from 'node:fs';

import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';

describe('task-380 — an option token ends the help command path', () => {
  let repo: string;

  beforeAll(() => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
    repo = makeTempGitRepo();
  });

  afterAll(() => removeTempDir(repo));

  it.each([
    [['help', 'memory', '--bogus'], ['memory', '--help']],
    [['help', 'memory', 'add', '--bogus'], ['memory', 'add', '--help']],
    [['help', 'memory', '--bogus', 'add'], ['memory', '--help']],
  ])('`wingfoil %j` prints what `wingfoil %j` prints, at exit 0', (argv, direct) => {
    const expected = runCliEntry(repo, direct);
    expect(expected.status).toBe(0);
    const run = runCliEntry(repo, argv);
    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({
      status: 0,
      stdout: expected.stdout,
      stderr: '',
    });
  });
});

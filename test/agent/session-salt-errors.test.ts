/**
 * task-338 review fixes F1 and F2 (developer's tests, beside the red commit's `test/agent/session-salt.test.ts`) —
 * `sessionSalt`'s refusals that the red suite does not reach (`spec-016` §2.6: `IO`, `cannot create or read the session
 * salt in the git directory (wingfoil/session-salt): <cause>`, the cause naming no absolute path):
 *
 * - F1: `git rev-parse --path-format=absolute --git-common-dir` answering anything but one absolute path — what a git
 *   before 2.31 does: it echoes the unknown option as a line and exits 0, then prints the relative `.git` — is refused,
 *   and nothing is written. The git answer is injected by mocking `runGitRead` of `src/storage`.
 * - F2: a hard link refused with an error other than `EEXIST` (`EPERM`/`ENOTSUP` on FAT, exFAT, some network or FUSE
 *   mounts) is `IO` naming the `link` syscall, and the temporary file is removed.
 *
 * Not tested (defensive): a thrown value that is not a Node errno error (`causeOf`'s last line) and `runGitRead`
 * throwing — git absent or failing — whose refusal shares F1's cause.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

type GitAnswer = { status: number; stdout: string; stderr: string };
let gitAnswer: ((root: string, args: readonly string[]) => GitAnswer) | undefined;

jest.mock('../../src/storage', () => {
  const actual = jest.requireActual<typeof import('../../src/storage')>('../../src/storage');
  return {
    ...actual,
    runGitRead: (root: string, args: readonly string[], options?: object) => (gitAnswer !== undefined ? gitAnswer(root, args) : actual.runGitRead(root, args, options)),
  };
});

// Imported after the mock is declared (jest hoists `jest.mock`), so `sessionSalt` reads the mocked `runGitRead`.
import { sessionSalt } from '../../src/agent';

const IO_PREFIX = 'cannot create or read the session salt in the git directory (wingfoil/session-salt): ';
const GIT_FAILED = { ok: false, error: { code: 'IO', message: `${IO_PREFIX}git rev-parse --git-common-dir failed` } };

const dirs: string[] = [];
afterEach(() => {
  gitAnswer = undefined;
  jest.restoreAllMocks();
});
afterAll(() => {
  for (const dir of dirs) removeTempDir(dir);
});

function repo(): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, 'README.md', 'fixture\n');
  commitAll(root, 'seed');
  dirs.push(root);
  return root;
}

const commonDir = (root: string): string => git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();

describe('task-338 review F1 — the common git directory must be one absolute path', () => {
  it('a git before 2.31 (the option echoed as a line, then a relative .git): IO, nothing written', () => {
    const root = repo();
    gitAnswer = () => ({ status: 0, stdout: '--path-format=absolute\n.git\n', stderr: '' });
    expect(sessionSalt(root)).toEqual(GIT_FAILED);
    expect(existsSync(join(root, '--path-format=absolute'))).toBe(false);
    expect(existsSync(join(root, '.git', 'wingfoil'))).toBe(false);
    expect(existsSync(join(root, 'wingfoil'))).toBe(false);
  });

  it('a single relative path: IO, nothing written', () => {
    const root = repo();
    gitAnswer = () => ({ status: 0, stdout: '.git\n', stderr: '' });
    expect(sessionSalt(root)).toEqual(GIT_FAILED);
    expect(existsSync(join(root, '.git', 'wingfoil'))).toBe(false);
  });

  it('no output at all: IO', () => {
    gitAnswer = () => ({ status: 0, stdout: '', stderr: '' });
    expect(sessionSalt(repo())).toEqual(GIT_FAILED);
  });

  it('one absolute path, the real answer passed through the mock: the salt is created (a guard on the mock)', () => {
    const root = repo();
    const answer = commonDir(root);
    gitAnswer = () => ({ status: 0, stdout: `${answer}\n`, stderr: '' });
    const salt = sessionSalt(root);
    expect(salt.ok).toBe(true);
    expect(existsSync(join(answer, 'wingfoil', 'session-salt'))).toBe(true);
  });
});

describe('task-338 review F2 — a hard link refused with another error than EEXIST', () => {
  it('EPERM from link: IO naming the link syscall, no absolute path, the temporary file removed, no salt', () => {
    const root = repo();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    jest.spyOn(fs, 'linkSync').mockImplementation((existing, target) => {
      throw Object.assign(new Error(`EPERM: operation not permitted, link '${String(existing)}' -> '${String(target)}'`), {
        code: 'EPERM',
        errno: -1,
        syscall: 'link',
        path: String(existing),
        dest: String(target),
      });
    });
    const result = sessionSalt(root);
    expect(result).toEqual({ ok: false, error: { code: 'IO', message: `${IO_PREFIX}EPERM: operation not permitted (link)` } });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(readdirSync(join(commonDir(root), 'wingfoil'))).toEqual([]);
  });

  it('the salt written by a concurrent winner is still read when link says EEXIST (a guard on the rethrow)', () => {
    const root = repo();
    const winner = `${'b'.repeat(64)}\n`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    jest.spyOn(fs, 'linkSync').mockImplementation((_existing, target) => {
      writeFileSync(target, winner, { mode: 0o600 });
      throw Object.assign(new Error('EEXIST: file already exists, link'), { code: 'EEXIST', syscall: 'link' });
    });
    expect(sessionSalt(root)).toEqual({ ok: true, value: 'b'.repeat(64) });
    expect(readdirSync(join(commonDir(root), 'wingfoil'))).toEqual(['session-salt']);
  });
});

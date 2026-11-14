/**
 * task-338 AC 4 and AC 5 (`spec-016` §2.6 as amended, `spec-011` § `.gitignore` policy, `dl-168` Q1 (b), design §3
 * and D2) — the per-clone session salt, unit by unit; the launch that uses it is
 * `test/cli/agent-execute-cli-shim.integration.test.ts`.
 *
 * - AC 4 (red-first): `sessionSalt(root)` creates, once, the file `wingfoil/session-salt` of the repository's common
 *   git directory (`SESSION_SALT_FILE`), 64 lowercase hexadecimal digits and a line feed, owner-only (file `0600`,
 *   directory `0700`), and returns those 64 digits; a second call reads the same file and changes nothing; a linked
 *   worktree gets the main checkout's salt and writes nothing under `.git/worktrees/`; eight processes calling it at
 *   once on a fresh clone all get one salt and leave no temporary file beside it; a salt that is not exactly that text
 *   is refused, `VALIDATION`, with §2.6's message; a salt that cannot be created is refused, `IO`, with §2.6's message
 *   and no absolute path.
 * - AC 5 (characterization): the two records `docs/06_runs/task-236-…jsonl` committed before the salt (copied verbatim
 *   from commit `94377e43a` into `test/fixtures/run-logs/`) still parse, and keep the session ids they hold.
 *
 * The returned value is read as the 64 digits without the line feed: `spec-016` §2.6 hashes `<session salt>\n<run id>`.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { parseRunLog, SESSION_SALT_FILE, sessionSalt } from '../../src/agent';
import { DIST_DIR } from '../cli/helpers/spawn-cli';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');
const POSIX = process.platform !== 'win32';
const SALT_RE = /^[0-9a-f]{64}$/;
const MALFORMED = 'the session salt in the git directory (wingfoil/session-salt) is not 64 lowercase hexadecimal digits: remove it, and a new one is created at the next launch';
const IO_PREFIX = 'cannot create or read the session salt in the git directory (wingfoil/session-salt): ';

const dirs: string[] = [];
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
const saltFile = (root: string): string => join(commonDir(root), 'wingfoil', 'session-salt');

describe('task-338 AC 4 — SESSION_SALT_FILE', () => {
  it('is wingfoil/session-salt, relative to the common git directory', () => {
    expect(SESSION_SALT_FILE).toBe('wingfoil/session-salt');
  });
});

describe('task-338 AC 4 — sessionSalt(root) creates the salt once, owner-only, and reuses it', () => {
  it('a fresh clone: 64 lowercase hex digits returned, the file holds them and a line feed', () => {
    const root = repo();
    expect(existsSync(saltFile(root))).toBe(false);
    const salt = sessionSalt(root);
    expect(salt.ok).toBe(true);
    if (!salt.ok) return;
    expect(salt.value).toMatch(SALT_RE);
    expect(readFileSync(saltFile(root), 'utf-8')).toBe(`${salt.value}\n`);
  });

  (POSIX ? it : it.skip)('the file is 0600 and its directory 0700', () => {
    const root = repo();
    expect(sessionSalt(root).ok).toBe(true);
    expect((statSync(saltFile(root)).mode & 0o777).toString(8)).toBe('600');
    expect((statSync(join(commonDir(root), 'wingfoil')).mode & 0o777).toString(8)).toBe('700');
  });

  it('a second call returns the same salt and leaves the file as it was (content and inode)', () => {
    const root = repo();
    const first = sessionSalt(root);
    const before = statSync(saltFile(root));
    const text = readFileSync(saltFile(root), 'utf-8');
    const second = sessionSalt(root);
    expect(second).toEqual(first);
    expect(readFileSync(saltFile(root), 'utf-8')).toBe(text);
    expect(statSync(saltFile(root)).ino).toBe(before.ino);
  });

  it('two clones get two salts', () => {
    const a = sessionSalt(repo());
    const b = sessionSalt(repo());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value).not.toBe(b.value);
  });

  it('nothing is written in the working tree: git status stays clean', () => {
    const root = repo();
    expect(sessionSalt(root).ok).toBe(true);
    expect(git(root, ['status', '--porcelain', '--ignored']).trim()).toBe('');
  });
});

describe('task-338 AC 4 — a linked worktree shares the clone\'s salt (design D2)', () => {
  it('the worktree mints the salt in the common directory; the main checkout reads the same one; nothing under .git/worktrees/', () => {
    const root = repo();
    const worktree = `${root}-linked`;
    git(root, ['worktree', 'add', '-q', '-b', 'linked', worktree]);
    dirs.push(worktree);
    const fromWorktree = sessionSalt(worktree);
    const fromMain = sessionSalt(root);
    expect(fromWorktree.ok).toBe(true);
    expect(fromMain).toEqual(fromWorktree);
    const worktreeGitDir = git(worktree, ['rev-parse', '--path-format=absolute', '--git-dir']).trim();
    expect(worktreeGitDir).not.toBe(commonDir(root));
    expect(existsSync(join(worktreeGitDir, 'wingfoil'))).toBe(false);
    expect(existsSync(saltFile(root))).toBe(true);
  });
});

describe('task-338 AC 4 — eight concurrent processes mint one salt (design D2, the hard link)', () => {
  it('every process returns the same salt, the file holds it, and no temporary file is left beside it', async () => {
    const root = repo();
    const script = [
      `const { sessionSalt } = require(${JSON.stringify(join(DIST_DIR, 'agent'))});`,
      `process.stdout.write(JSON.stringify(sessionSalt(${JSON.stringify(root)})));`,
    ].join('\n');
    const outputs = await Promise.all(
      Array.from(
        { length: 8 },
        () =>
          new Promise<string>((resolve) => {
            const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
            let out = '';
            let err = '';
            child.stdout.setEncoding('utf-8').on('data', (chunk: string) => (out += chunk));
            child.stderr.setEncoding('utf-8').on('data', (chunk: string) => (err += chunk));
            child.on('close', () => resolve(out === '' ? `stderr: ${err.split('\n')[0] ?? ''}` : out));
          }),
      ),
    );
    const results = outputs.map((out) => (out.startsWith('{') ? (JSON.parse(out) as { ok: boolean; value?: string }) : { ok: false, value: out }));
    expect(results.map((result) => result.ok)).toEqual(Array(8).fill(true));
    const values = new Set(results.map((result) => result.value));
    expect(values.size).toBe(1);
    const [value] = [...values];
    expect(value).toMatch(SALT_RE);
    expect(readFileSync(saltFile(root), 'utf-8')).toBe(`${value}\n`);
    expect(readdirSync(join(commonDir(root), 'wingfoil'))).toEqual(['session-salt']);
  }, 60000);
});

describe('task-338 AC 4 — a salt that is not exactly 64 lowercase hex digits and a line feed is refused, never replaced', () => {
  it.each([
    ['three letters', 'xyz\n'],
    ['uppercase digits', `${'A'.repeat(64)}\n`],
    ['no line feed', 'a'.repeat(64)],
    ['63 digits', `${'a'.repeat(63)}\n`],
  ])('%s: VALIDATION with spec-016 §2.6\'s message, the file unchanged', (_label, text) => {
    const root = repo();
    mkdirSync(join(commonDir(root), 'wingfoil'), { recursive: true, mode: 0o700 });
    writeFileSync(saltFile(root), text, { mode: 0o600 });
    expect(sessionSalt(root)).toEqual({ ok: false, error: { code: 'VALIDATION', message: MALFORMED } });
    expect(readFileSync(saltFile(root), 'utf-8')).toBe(text);
  });
});

describe('task-338 AC 4 — a salt that cannot be created is refused, IO, naming no absolute path', () => {
  it('the wingfoil entry of the common directory is a file: IO with spec-016 §2.6\'s message', () => {
    const root = repo();
    writeFileSync(join(commonDir(root), 'wingfoil'), 'not a directory\n');
    const result = sessionSalt(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('IO');
    expect(result.error.message.startsWith(IO_PREFIX)).toBe(true);
    expect(result.error.message.length).toBeGreaterThan(IO_PREFIX.length);
    expect(JSON.stringify(result.error)).not.toContain(root);
    rmSync(join(commonDir(root), 'wingfoil'));
  });
});

describe('task-338 AC 5 (characterization) — run records committed before the salt keep their session ids', () => {
  const LOG = 'task-236-ship-verify-hand-builtin-claude-code-adapter-point.jsonl';
  const text = readFileSync(join(REPO_ROOT, 'test', 'fixtures', 'run-logs', LOG), 'utf-8');

  it('the fixture is the start of the committed log, byte for byte (a guard on the copy; later runs may append)', () => {
    expect(text.split('\n')).toHaveLength(3);
    expect(readFileSync(join(REPO_ROOT, 'docs', '06_runs', LOG), 'utf-8').startsWith(text)).toBe(true);
  });

  it('parses strictly, and its two records keep the root-hashed session ids they hold', () => {
    const parsed = parseRunLog(text, `docs/06_runs/${LOG}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.map((record) => record.session)).toEqual(['f4458e8b-b6a3-5453-8221-90a33bb558bb', 'b0fc53be-b276-5117-95e6-2e983cf4e5e9']);
  });
});

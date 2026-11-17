/**
 * task-336 (green, the developer's own suite; `spec-016` §3.3 step 13, §3.5 as amended at the design gate; approver
 * rulings D5, D11) — the helpers of `src/agent/output.ts`, beside red's `test/agent/launch-output.test.ts` (which drives
 * them through `launchAgent`):
 *
 * - `lineSplitter`: a line cut at the cap backs off to the start of a UTF-8 sequence the cap would split, so the
 *   character is not lost; a newline exactly at the cap ends the line there; `end` is idempotent and stops later writes;
 * - `openLog`: a file it creates is mode `0600` on POSIX, an existing one keeps its bytes; a directory is refused with
 *   the system's cause; `close` is idempotent and a closed log writes nothing;
 * - `notIgnoredInRepository`: a path outside the root is not asked; inside, an ignored path is not reported, an
 *   unignored or tracked one is; the root itself is not inside it.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lineSplitter, logNotIgnoredWarning, notIgnoredInRepository, openLog, OUTPUT_LINE_CAP } from '../../src/agent/output';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const dirs: string[] = [];
const repos: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-336-output-'));
  dirs.push(dir);
  return dir;
}

function split(chunks: readonly Buffer[], cap?: number): string[] {
  const lines: string[] = [];
  const splitter = lineSplitter((line) => lines.push(line), cap);
  for (const chunk of chunks) splitter.write(chunk);
  splitter.end();
  return lines;
}

describe('task-336 — lineSplitter (spec-016 §3.5, D11)', () => {
  it('the cap is 64 KiB', () => {
    expect(OUTPUT_LINE_CAP).toBe(65536);
  });

  it('a cut at the cap backs off to the start of the UTF-8 sequence it would split', () => {
    // cap 4: "ab" then U+20AC (0xe2 0x82 0xac): the cap falls inside it, so the first line is "ab", the euro sign whole.
    expect(split([Buffer.from('ab€\n', 'utf-8')], 4)).toEqual(['ab', '€']);
  });

  it('a newline exactly at the cap ends the line there, with no empty line after it', () => {
    expect(split([Buffer.from('abcd\nef\n')], 4)).toEqual(['abcd', 'ef']);
  });

  it('a run of continuation bytes with no lead byte is cut at the cap as it stands', () => {
    expect(split([Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x0a])], 4)).toEqual(['����', '�']);
  });

  it('end is idempotent, and a write after it is ignored', () => {
    const lines: string[] = [];
    const splitter = lineSplitter((line) => lines.push(line));
    splitter.write(Buffer.from('tail'));
    splitter.end();
    splitter.end();
    splitter.write(Buffer.from('late\n'));
    expect(lines).toEqual(['tail']);
  });

  it('an empty stream emits nothing', () => {
    expect(split([])).toEqual([]);
  });
});

describe('task-336 — openLog (spec-016 §3.3 step 13, D5)', () => {
  (process.platform === 'win32' ? it.skip : it)('a file it creates is mode 0600; lines are appended in the console form', () => {
    const path = join(scratch(), 'new.log');
    const opened = openLog(path);
    if (!opened.ok) throw new Error(opened.cause);
    opened.log.append('one');
    opened.log.append('two');
    opened.log.close();
    expect((statSync(path).mode & 0o777).toString(8)).toBe('600');
    expect(readFileSync(path, 'utf-8')).toBe('one\ntwo\n');
  });

  it('an existing file keeps its bytes; close is idempotent and a closed log writes nothing', () => {
    const path = join(scratch(), 'kept.log');
    writeFileSync(path, 'before\n');
    const opened = openLog(path);
    if (!opened.ok) throw new Error(opened.cause);
    opened.log.append('after');
    opened.log.close();
    opened.log.close();
    opened.log.append('closed');
    expect(readFileSync(path, 'utf-8')).toBe('before\nafter\n');
  });

  it('a directory is refused with the system cause', () => {
    const opened = openLog(scratch());
    expect(opened.ok).toBe(false);
    expect(opened.ok ? '' : opened.cause).toMatch(/EISDIR/);
  });
});

describe('task-336 — notIgnoredInRepository and its warning (spec-016 §3.3 step 13, D5)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    repos.push(repo);
    writeFixtureFile(repo, '.gitignore', 'ignored/\n');
    writeFixtureFile(repo, 'tracked.txt', 'x\n');
    commitAll(repo, 'seed');
  });

  it('an ignored path inside the root is not reported', () => {
    expect(notIgnoredInRepository(repo, join(repo, 'ignored', 'run.log'))).toBe(false);
  });

  it('an unignored path, and a tracked file, inside the root are reported', () => {
    expect(notIgnoredInRepository(repo, join(repo, 'out.log'))).toBe(true);
    expect(notIgnoredInRepository(repo, join(repo, 'tracked.txt'))).toBe(true);
  });

  it('a path outside the root, and the root itself, are not asked', () => {
    expect(notIgnoredInRepository(repo, join(scratch(), 'out.log'))).toBe(false);
    expect(notIgnoredInRepository(repo, repo)).toBe(false);
  });

  it('a question git cannot answer (no repository) counts as not ignored', () => {
    const plain = scratch();
    expect(notIgnoredInRepository(plain, join(plain, 'out.log'))).toBe(true);
  });

  it('the warning names the path as given', () => {
    expect(logNotIgnoredWarning('out.log')).toBe("--log out.log is inside the repository and not git-ignored: the agent's output may hold secrets");
  });
});

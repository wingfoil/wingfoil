/**
 * task-336 AC 2 (red-first) — `agent execute --log <path>` on the compiled CLI (`spec-016` §3.1, §3.2 step 7, §3.3
 * step 13, §3.5, §3.7 as amended at the design gate; `spec-008` §12; `dl-182` Q2 (a), Q4 (a); approver ruling D5), with
 * the fake adapter (`seed()`) writing declared lines on both streams (`WINGFOIL_FAKE_AGENT_SAY`).
 *
 * - (a) `--headless --log <a path outside the repository>`: the file is created holding exactly the forwarded lines in
 *   the console form — no banner, no summary, no `warning:` line — the same lines still on stderr; mode `0600` on POSIX;
 * - (b) an existing file keeps its bytes and gains the lines (append), its mode unchanged;
 * - (c) a path inside the repository that no ignore rule covers → one `warning:` line naming it as given; a path under a
 *   directory the fixture's committed `.gitignore` ignores → none; a path outside the repository → none;
 * - (d) `--interactive --log x` → exit 2, `invalid flag combination: --log needs a headless launch, and this run launches
 *   interactive`, before the project is read; (e) the same refusal when the run resolves interactive (no `--headless`:
 *   the stepless default), nothing spawned, no record;
 * - (f) a blank `--log` → exit 2, `invalid flag value: --log must not be blank`;
 * - (g) `--log <a directory>` → exit 1, `cannot write the log <path>: <cause>`, no record, no registry entry;
 * - (h) `--dry-run --headless --log <path>` → exit 0, the file not created.
 *
 * Today `--log` is not registered: Commander refuses it, `error: unknown option '--log'`, exit 2.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, expectNothingRan, headOf, records, removeRunScratch, warningLines, type AgentRun } from './helpers/agent-execute-cli';

const repos: string[] = [];
const scratch: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const POSIX = process.platform !== 'win32';
const RUN_1 = `${TASK_ID}/adhoc/1`;

const SAY: [string, string][] = [
  ['out', 'log out 1\n'],
  ['err', 'log err 1\n'],
  ['out', 'log out 2\n'],
  ['err', 'log err 2'],
];
const STDOUT_LINES = ['log out 1', 'log out 2'];
const STDERR_LINES = ['log err 1', 'log err 2'];
const DOCUMENT_LINE = /^\{"session_id":"[^"]+","model":"fake-model","usage":\{"input":120,"output":45,"cache_read":10,"cache_write":5\}\}$/;
const SAY_ENV = { WINGFOIL_FAKE_AGENT_SAY: JSON.stringify(SAY) };

const LOG_INTERACTIVE = 'error: invalid flag combination: --log needs a headless launch, and this run launches interactive';
const LOG_BLANK = 'error: invalid flag value: --log must not be blank';
const notIgnored = (path: string): string => `warning: --log ${path} is inside the repository and not git-ignored: the agent's output may hold secrets`;

function fixture(tweak?: (repo: string) => void): string {
  const repo = seed(tweak);
  repos.push(repo);
  return repo;
}

/** A directory outside every fixture repository. */
function outside(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-336-logdir-'));
  scratch.push(dir);
  return dir;
}

const headlessWithLog = (repo: string, log: string, extra: readonly string[] = []): AgentRun =>
  execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless', '--log', log, ...extra], SAY_ENV);

/** The lines of a log file's text (it ends with a newline). */
function logLines(text: string): string[] {
  expect(text.endsWith('\n')).toBe(true);
  return text.slice(0, -1).split('\n');
}

/** Every file under `<repo>/.wingfoil/run/`. */
function registryFiles(repo: string): string[] {
  const files: string[] = [];
  const walk = (path: string): void => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(path, entry.name));
      else files.push(join(path, entry.name));
    }
  };
  walk(join(repo, '.wingfoil', 'run'));
  return files;
}

/** The forwarded lines, each stream in its order and the headless document last among stdout's. */
function expectForwarded(lines: readonly string[]): void {
  const fromStdout = lines.filter((line) => STDOUT_LINES.includes(line) || DOCUMENT_LINE.test(line));
  expect(fromStdout.slice(0, 2)).toEqual(STDOUT_LINES);
  expect(fromStdout).toHaveLength(3);
  expect(fromStdout[2]).toMatch(DOCUMENT_LINE);
  expect(lines.filter((line) => STDERR_LINES.includes(line))).toEqual(STDERR_LINES);
}

describe('task-336 AC 2 (a) — --log creates the file with the forwarded lines (spec-016 §3.3 step 13, §3.5)', () => {
  let repo: string;
  let log: string;
  let run: AgentRun;
  beforeAll(() => {
    repo = fixture();
    log = join(outside(), 'run.log');
    run = headlessWithLog(repo, log);
  });

  it('exits 0 and records the run', () => {
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(records(repo, TASK_ID)).toEqual([expect.objectContaining({ id: RUN_1, exit_status: 0 })]);
  });

  it("the file holds exactly the agent's lines in the console form: no banner, no summary, no warning: line", () => {
    expect(existsSync(log)).toBe(true);
    const lines = logLines(readFileSync(log, 'utf-8'));
    expect(lines).toHaveLength(5);
    expectForwarded(lines);
    expect(lines.filter((line) => line.startsWith('run ') || line.startsWith('warning:') || line.startsWith('error:'))).toEqual([]);
  });

  it('the same lines still reach stderr', () => {
    expectForwarded(run.stderr.split('\n'));
  });

  (POSIX ? it : it.skip)('a file it creates is owner-only, mode 0600', () => {
    expect((statSync(log).mode & 0o777).toString(8)).toBe('600');
  });

  it('a path outside the repository gets no not-ignored warning', () => {
    expect(warningLines(run.stderr)).toEqual([]);
  });
});

describe('task-336 AC 2 (b) — an existing file is appended to (spec-016 §3.3 step 13)', () => {
  it('its first bytes are kept, the lines follow them, and its mode is unchanged', () => {
    const repo = fixture();
    const log = join(outside(), 'kept.log');
    writeFileSync(log, 'line written before the run\n');
    if (POSIX) chmodSync(log, 0o640);
    const run = headlessWithLog(repo, log);
    expect(run.status).toBe(0);
    const text = readFileSync(log, 'utf-8');
    expect(text.startsWith('line written before the run\n')).toBe(true);
    const lines = logLines(text.slice('line written before the run\n'.length));
    expect(lines).toHaveLength(5);
    expectForwarded(lines);
    if (POSIX) expect((statSync(log).mode & 0o777).toString(8)).toBe('640');
  });
});

describe('task-336 AC 2 (c) — the not-ignored warning, for a path inside the repository only (spec-016 §3.3 step 13; D5)', () => {
  it('a path inside the repository that no ignore rule covers: one warning: line naming the path as given', () => {
    const repo = fixture();
    const run = headlessWithLog(repo, 'agent-output.txt');
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([notIgnored('agent-output.txt')]);
    expectForwarded(logLines(readFileSync(join(repo, 'agent-output.txt'), 'utf-8')));
  });

  it("a path under a directory the repository's committed .gitignore ignores: no warning", () => {
    const repo = fixture((root) => {
      writeFixtureFile(root, '.gitignore', 'agent-logs/\n');
      mkdirSync(join(root, 'agent-logs'), { recursive: true });
    });
    mkdirSync(join(repo, 'agent-logs'), { recursive: true });
    const run = headlessWithLog(repo, 'agent-logs/run.txt');
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
    expect(existsSync(join(repo, 'agent-logs', 'run.txt'))).toBe(true);
  });
});

describe('task-336 AC 2 (d)–(f) — the usage errors, exit 2 (spec-016 §3.1, §3.2 step 7, §3.7; spec-008 §12)', () => {
  it('(d) --interactive --log: exit 2 before the project is read (a git repository with no .wingfoil/)', () => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    const run = execute(repo, ['--next', '--interactive', '--log', 'x.txt']);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(LOG_INTERACTIVE);
    expect(run.fake).toEqual([]);
  });

  it('(d) --interactive --log in a project: exit 2, nothing spawned, nothing written', () => {
    const repo = fixture();
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--interactive', '--log', 'x.txt'], SAY_ENV);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(LOG_INTERACTIVE);
    expectNothingRan(repo, run, before);
  });

  it('(e) --log on a run that resolves interactive (the stepless default): the same message, exit 2, nothing spawned, no record', () => {
    const repo = fixture();
    const before = headOf(repo);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--log', 'x.txt'], SAY_ENV);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(LOG_INTERACTIVE);
    expectNothingRan(repo, run, before);
    expect(records(repo, TASK_ID)).toEqual([]);
    expect(existsSync(join(repo, 'x.txt'))).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('(f) a blank --log (%s): exit 2, before the project is read', (_name, value) => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    const run = execute(repo, ['--next', '--headless', '--log', value]);
    expect(run.status).toBe(2);
    expect(errorLine(run.stderr)).toBe(LOG_BLANK);
  });
});

describe('task-336 AC 2 (g) — a log that cannot be opened (spec-016 §3.7 LOG_UNWRITABLE)', () => {
  it('--log <a directory>: exit 1, "cannot write the log <path>: <cause>", nothing spawned, no record, no registry entry', () => {
    const repo = fixture();
    const before = headOf(repo);
    const dir = outside();
    const run = headlessWithLog(repo, dir);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)?.startsWith(`error: cannot write the log ${dir}: `)).toBe(true);
    expectNothingRan(repo, run, before);
    expect(records(repo, TASK_ID)).toEqual([]);
    expect(registryFiles(repo)).toEqual([]);
  });
});

describe('task-336 AC 2 (h) — --dry-run checks --log and creates no file (spec-016 §3.3 "--dry-run")', () => {
  it('--dry-run --headless --log <path>: exit 0, the file not created, nothing spawned', () => {
    const repo = fixture();
    const before = headOf(repo);
    const log = join(outside(), 'dry.log');
    const run = headlessWithLog(repo, log, ['--dry-run']);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    expect(existsSync(log)).toBe(false);
    expect(run.fake).toEqual([]);
    expect(headOf(repo)).toBe(before);
    expect(registryFiles(repo)).toEqual([]);
  });
});

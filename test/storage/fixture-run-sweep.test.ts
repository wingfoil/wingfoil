/**
 * The end-of-run fixture count (`bug-064-fixture-temp-dirs-leak-with-no-aggregate-visibility`,
 * task-152): `test/global-setup.cjs` tags the run, the fixture helper puts the tag in every directory
 * it creates, and `test/global-teardown.cjs` counts, reports and removes what carries the tag.
 *
 * Since task-308 (`bug-208`): the teardown also counts and removes the fixture directories of runs that are
 * no longer alive — a tag `r<pid>` whose pid is not a live process, left by a jest run killed before its
 * own teardown — and leaves the live runs' fixtures, untagged names and legacy prefixes alone (R8).
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import {
  cloneTempRepo,
  commitAll,
  FIXTURE_RUN_TAG_ENV,
  makeTempGitRepo,
  removeTempDir,
  writeFixtureFile,
} from './helpers/git-fixture';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const teardown = require('../global-teardown.cjs') as {
  teardownRun(run: {
    tag: string | undefined;
    pid: number;
    tmpRoot: string;
    isAlive?: (pid: number) => boolean;
  }): string | null;
  sweepDeadRunDirs(
    tmpRoot: string,
    options: { ownTag: string; isAlive: (pid: number) => boolean },
  ): { found: string[]; unremoved: string[] };
  formatDeadRunReport(result: { found: string[]; unremoved: string[] }): string | null;
  sweepFixtureDirs(tmpRoot: string, tag: string): { found: string[]; unremoved: string[] };
  formatSweepReport(result: { found: string[]; unremoved: string[] }): string | null;
};

describe('fixture run tag — every fixture directory names the jest run that made it', () => {
  it('is set in the worker, by the global setup', () => {
    expect(process.env[FIXTURE_RUN_TAG_ENV]).toMatch(/^r\d+$/);
  });

  it('prefixes both the repos makeTempGitRepo creates and the clones cloneTempRepo creates', () => {
    const prefix = `wf-storage-${process.env[FIXTURE_RUN_TAG_ENV]}-`;
    const repo = makeTempGitRepo();
    writeFixtureFile(repo, 'a.txt', 'a\n');
    commitAll(repo, 'seed');
    const clone = cloneTempRepo(repo);
    try {
      expect(basename(repo).startsWith(prefix)).toBe(true);
      expect(basename(clone).startsWith(prefix)).toBe(true);
    } finally {
      removeTempDir(clone);
      removeTempDir(repo);
    }
  });
});

describe('global teardown sweep — counts and removes this run’s leftovers, and only those', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-sweep-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('removes the directories carrying this run’s tag and reports them by count', () => {
    for (const name of ['wf-storage-r1-aaa', 'wf-storage-r1-bbb', 'wf-storage-r2-ccc', 'wf-storage-ddd', 'other']) {
      mkdirSync(join(root, name, '.git'), { recursive: true });
    }

    const result = teardown.sweepFixtureDirs(root, 'r1');

    expect(result.found).toEqual([join(root, 'wf-storage-r1-aaa'), join(root, 'wf-storage-r1-bbb')]);
    expect(result.unremoved).toEqual([]);
    expect(readdirSync(root).sort()).toEqual(['other', 'wf-storage-ddd', 'wf-storage-r2-ccc']);
    expect(teardown.formatSweepReport(result)).toBe(
      'fixture teardown: this run left 2 fixture directories behind; removed 2',
    );
  });

  it('reports nothing when the run left nothing behind', () => {
    mkdirSync(join(root, 'wf-storage-r2-ccc'));

    const result = teardown.sweepFixtureDirs(root, 'r1');

    expect(result).toEqual({ found: [], unremoved: [] });
    expect(teardown.formatSweepReport(result)).toBeNull();
    expect(existsSync(join(root, 'wf-storage-r2-ccc'))).toBe(true);
  });

  it('names the directories it could not remove', () => {
    expect(teardown.formatSweepReport({ found: ['/t/a', '/t/b'], unremoved: ['/t/b'] })).toBe(
      'fixture teardown: this run left 2 fixture directories behind; removed 1, could not remove 1: /t/b',
    );
    expect(teardown.formatSweepReport({ found: ['/t/a'], unremoved: [] })).toBe(
      'fixture teardown: this run left 1 fixture directory behind; removed 1',
    );
  });
});

describe('global teardown — only the run that owns the tag sweeps (task-152)', () => {
  // A child jest started from inside a run (`test/lint/coverage-parity.test.ts`) loads this
  // repository's config, so it runs the same teardown, and it inherits the parent's tag through the
  // environment. Its teardown must not sweep the parent's fixtures while the parent's suites are still
  // using them: the tag is `r<pid>` of the process that set it, and only that process sweeps.
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-sweep-owner-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves the fixtures alone when the tag names another process (an inherited tag)', () => {
    mkdirSync(join(root, 'wf-storage-r100-live'));

    expect(teardown.teardownRun({ tag: 'r100', pid: 200, tmpRoot: root })).toBeNull();
    expect(readdirSync(root)).toEqual(['wf-storage-r100-live']);
  });

  it('does nothing outside a tagged run', () => {
    mkdirSync(join(root, 'wf-storage-abc'));

    expect(teardown.teardownRun({ tag: undefined, pid: 200, tmpRoot: root })).toBeNull();
    expect(readdirSync(root)).toEqual(['wf-storage-abc']);
  });

  it('sweeps and reports when the tag is its own', () => {
    mkdirSync(join(root, 'wf-storage-r200-left'));

    expect(teardown.teardownRun({ tag: 'r200', pid: 200, tmpRoot: root })).toBe(
      'fixture teardown: this run left 1 fixture directory behind; removed 1',
    );
    expect(readdirSync(root)).toEqual([]);
  });
});

/** A pid that certainly belonged to a process that has exited (as in `test/lint/dist-lock.test.ts`). */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  if (child.pid === undefined) throw new Error('could not spawn a short-lived process');
  return child.pid;
}

describe('global teardown — sweeps the fixtures of runs no longer alive (task-308 AC4, bug-208)', () => {
  // The shapes a shared temp dir holds when parallel worktrees run jest: this run's own tag, the tags of
  // runs killed before their teardown (dead pids), a live run's tag, and names the sweep must never
  // touch — an untagged `mkdtemp` name and the legacy prefixes (R8: dead pids' tags only).
  const MIXED = [
    'other',
    'wf-storage-clone-x',
    'wf-storage-cwd-y',
    'wf-storage-r1-own',
    'wf-storage-r2-dead-a',
    'wf-storage-r2-dead-b',
    'wf-storage-r3-live',
    'wf-storage-r4abcd',
  ];
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-sweep-dead-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function plant(names: readonly string[]): void {
    for (const name of names) mkdirSync(join(root, name, '.git'), { recursive: true });
  }

  it('reports its own leftovers, then the dead runs\' ones, and removes both; live and untagged names stay', () => {
    plant(MIXED);

    expect(teardown.teardownRun({ tag: 'r1', pid: 1, tmpRoot: root, isAlive: (p) => p === 3 })).toBe(
      'fixture teardown: this run left 1 fixture directory behind; removed 1\n' +
        'fixture teardown: runs no longer alive left 2 fixture directories behind; removed 2',
    );
    expect(readdirSync(root).sort()).toEqual([
      'other',
      'wf-storage-clone-x',
      'wf-storage-cwd-y',
      'wf-storage-r3-live',
      'wf-storage-r4abcd',
    ]);
  });

  it('reports the dead runs\' line alone when the run left nothing of its own', () => {
    plant(['wf-storage-r2-dead-a', 'wf-storage-r3-live']);

    expect(teardown.teardownRun({ tag: 'r1', pid: 1, tmpRoot: root, isAlive: (p) => p === 3 })).toBe(
      'fixture teardown: runs no longer alive left 1 fixture directory behind; removed 1',
    );
    expect(readdirSync(root).sort()).toEqual(['wf-storage-r3-live']);
  });

  it('an inherited tag sweeps nothing, not even the dead runs\' fixtures', () => {
    plant(['wf-storage-r100-live', 'wf-storage-r2-dead-a']);

    expect(teardown.teardownRun({ tag: 'r100', pid: 200, tmpRoot: root, isAlive: () => false })).toBeNull();
    expect(readdirSync(root).sort()).toEqual(['wf-storage-r100-live', 'wf-storage-r2-dead-a']);
  });

  it('sweepDeadRunDirs returns the dead runs\' directories in sorted order, never its own tag or a live one', () => {
    plant(MIXED);

    const result = teardown.sweepDeadRunDirs(root, { ownTag: 'r1', isAlive: (p) => p === 3 });

    expect(result).toEqual({
      found: [join(root, 'wf-storage-r2-dead-a'), join(root, 'wf-storage-r2-dead-b')],
      unremoved: [],
    });
    expect(existsSync(join(root, 'wf-storage-r1-own'))).toBe(true);
    expect(existsSync(join(root, 'wf-storage-r3-live'))).toBe(true);
  });

  it('formatDeadRunReport says nothing, one, many, and what it could not remove', () => {
    expect(teardown.formatDeadRunReport({ found: [], unremoved: [] })).toBeNull();
    expect(teardown.formatDeadRunReport({ found: ['/t/a'], unremoved: [] })).toBe(
      'fixture teardown: runs no longer alive left 1 fixture directory behind; removed 1',
    );
    expect(teardown.formatDeadRunReport({ found: ['/t/a', '/t/b'], unremoved: [] })).toBe(
      'fixture teardown: runs no longer alive left 2 fixture directories behind; removed 2',
    );
    expect(teardown.formatDeadRunReport({ found: ['/t/a', '/t/b', '/t/c'], unremoved: ['/t/b', '/t/c'] })).toBe(
      'fixture teardown: runs no longer alive left 3 fixture directories behind; removed 1, could not remove 2: /t/b, /t/c',
    );
  });

  it('with real pids and the default liveness check: a dead run\'s fixtures go, a live run\'s stay', () => {
    const dead = deadPid();
    const live = process.ppid;
    plant([`wf-storage-r${dead}-killed`, `wf-storage-r${live}-running`]);

    expect(teardown.teardownRun({ tag: `r${process.pid}`, pid: process.pid, tmpRoot: root })).toBe(
      'fixture teardown: runs no longer alive left 1 fixture directory behind; removed 1',
    );
    expect(readdirSync(root)).toEqual([`wf-storage-r${live}-running`]);
  });
});

/**
 * Harness gate — one jest run at a time owns a worktree's `dist/`
 * (task-146-make-suite-result-independent-concurrent-runs-machine-load, `bug-095`).
 *
 * `test/global-setup.cjs` deletes and rebuilds `dist/` at the start of every run (`bug-003`). Two runs
 * in one worktree used to race on it: the second deleted the build the first was still spawning
 * `node dist/cli.js` from, and the first reported ordinary-looking failures that vanished on a solitary
 * re-run. The setup now takes a lock file before it touches `dist/` and the teardown releases it. A
 * second run waits for the lock, and refuses with a message naming the holder's pid if it is not
 * released in time. It never deletes a `dist/` another live run holds.
 *
 * What is asserted here, on temporary directories so the suite's own `dist/` is never touched:
 * - a free lock is taken and records the taker's pid;
 * - a lock held by a live process (this worker's parent) makes a second taker wait, and it takes the
 *   lock once the holder releases it;
 * - a lock still held when the wait ends is refused with a message naming the holder's pid and the
 *   lock path, and the refused setup neither deletes `dist/` nor builds;
 * - a lock left by a dead process (a run killed before its teardown) is taken over, and only by a run
 *   holding the break lock, so two runs breaking it at once cannot both end up holding it;
 * - a release removes only the releaser's own lock, so a nested jest (`coverage-parity.test.ts`) or a
 *   refused run cannot release the lock of the run that holds it;
 * - `jest.config.js` wires the setup and the teardown that do this.
 *
 * And, since task-308 (`bug-336`, `bug-066`):
 * - the build writes into a staging directory (`.jest-dist.next`) while the previous `dist/` stays in
 *   place, and is renamed onto `dist/` only once it has finished; a build that throws, writes nothing, or
 *   is killed mid-way leaves the previous `dist/` intact, and the next run recovers from the leftover;
 * - a `dist/` that cannot be moved or removed (EACCES, e.g. owned by root after a container run) rejects
 *   with a diagnostic naming the path and the cause, not a raw stack;
 * - the staging and previous directories are ignored by git and by ESLint.
 *
 * Deterministic in outcome: the waits are bounded and polled, and no assertion depends on how long a
 * step took — only on the order of the events.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acquireDistLock,
  distLockPath,
  distPreviousPath,
  distStagingPath,
  isPidAlive,
  prepareDist,
  releaseDistLock,
} from '../dist-lock.cjs';

const REPO_ROOT = join(__dirname, '..', '..');

/** A pid that is certainly alive and is not this process: the jest worker's parent. */
const LIVE_OTHER_PID = process.ppid;

/** A pid that certainly belonged to a process that has exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  if (child.pid === undefined) throw new Error('could not spawn a short-lived process');
  return child.pid;
}

function holder(lockPath: string): number {
  return Number(readFileSync(lockPath, 'utf-8').trim());
}

/** A file's content, or `<missing>` when it does not exist: an assertion then shows which. */
function contentOf(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '<missing>';
}

/** Give every directory under (and including) `dir` its write bit back, so the temp root can be removed. */
function restoreModes(dir: string): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) restoreModes(join(dir, entry.name));
  }
}

/**
 * What a promise rejected with, or `null` if it resolved. Rejections are checked by shape, not with
 * `toBeInstanceOf(Error)`: an error node's `fs` raises comes from another realm than jest's sandbox.
 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (err: unknown) => err,
  );
}

/** `chmod` does not bind root, so the EACCES pins run only for another uid. */
const itUnlessRoot = process.getuid?.() === 0 ? it.skip : it;

describe('dist/ lock (task-146, bug-095) — one jest run at a time owns a worktree\'s dist/', () => {
  let root: string;
  let lockPath: string;
  let messages: string[];
  const log = (message: string): void => {
    messages.push(message);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-dist-lock-'));
    lockPath = distLockPath(root);
    messages = [];
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('places the lock in the worktree root, next to the dist/ it guards', () => {
    expect(lockPath).toBe(join(root, '.jest-dist.lock'));
  });

  it('takes a free lock and records the taker\'s pid', async () => {
    await acquireDistLock({ lockPath, pid: process.pid, waitMs: 1_000, pollMs: 10, log });
    expect(holder(lockPath)).toBe(process.pid);
    expect(messages).toEqual([]);
  });

  it('waits on a lock a live run holds, and takes it once that run releases it', async () => {
    writeFileSync(lockPath, `${LIVE_OTHER_PID}\n`);
    const acquired = acquireDistLock({ lockPath, pid: process.pid, waitMs: 30_000, pollMs: 10, log });
    // The waiter announced the wait (naming the holder) before the holder let go.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages.join('\n')).toContain(`pid ${LIVE_OTHER_PID}`);
    expect(holder(lockPath)).toBe(LIVE_OTHER_PID);
    expect(releaseDistLock({ lockPath, pid: LIVE_OTHER_PID })).toBe(true);
    await acquired;
    expect(holder(lockPath)).toBe(process.pid);
  });

  it('refuses, naming the holder\'s pid and the lock, when a live run keeps the lock past the wait', async () => {
    writeFileSync(lockPath, `${LIVE_OTHER_PID}\n`);
    await expect(acquireDistLock({ lockPath, pid: process.pid, waitMs: 50, pollMs: 10, log })).rejects.toThrow(
      new RegExp(`pid ${LIVE_OTHER_PID}[\\s\\S]*${lockPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    );
    expect(holder(lockPath)).toBe(LIVE_OTHER_PID);
  });

  it('never deletes or rebuilds a dist/ that a live run holds the lock on', async () => {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'cli.js'), 'in use by the other run\n');
    writeFileSync(lockPath, `${LIVE_OTHER_PID}\n`);
    let built = false;
    await expect(
      prepareDist({ repoRoot: root, build: () => { built = true; }, pid: process.pid, waitMs: 50, pollMs: 10, log }),
    ).rejects.toThrow(/bug-095/);
    expect(built).toBe(false);
    expect(readFileSync(join(root, 'dist', 'cli.js'), 'utf-8')).toBe('in use by the other run\n');
  });

  it('with the lock free, builds into the staging directory while the previous dist/ stays, then swaps it in (task-308 AC1, bug-336)', async () => {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'stale.js'), 'from an earlier build\n');
    const seen: Array<{ outDir: string; outDirOnEntry: boolean; previousPresent: boolean; holder: number }> = [];
    await prepareDist({
      repoRoot: root,
      build: (outDir) => {
        seen.push({
          outDir,
          outDirOnEntry: existsSync(outDir),
          previousPresent: existsSync(join(root, 'dist', 'stale.js')),
          holder: holder(lockPath),
        });
        mkdirSync(outDir);
        writeFileSync(join(outDir, 'cli.js'), 'new build\n');
      },
      pid: process.pid,
      waitMs: 1_000,
      pollMs: 10,
      log,
    });
    expect(seen).toEqual([
      { outDir: distStagingPath(root), outDirOnEntry: false, previousPresent: true, holder: process.pid },
    ]);
    expect(readdirSync(join(root, 'dist'))).toEqual(['cli.js']);
    expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('new build\n');
    expect(holder(lockPath)).toBe(process.pid);
    expect(readdirSync(root).sort()).toEqual(['.jest-dist.lock', 'dist']);
  });

  it('places the staging and previous directories in the worktree root, next to dist/ (task-308 AC1)', () => {
    expect(distStagingPath(root)).toBe(join(root, '.jest-dist.next'));
    expect(distPreviousPath(root)).toBe(join(root, '.jest-dist.prev'));
  });

  it('exports the liveness check the teardown reuses (task-308 AC4)', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(deadPid())).toBe(false);
  });

  it('builds dist/ in a fresh worktree that has none yet (task-308 AC1)', async () => {
    await prepareDist({
      repoRoot: root,
      build: (outDir) => {
        mkdirSync(outDir);
        writeFileSync(join(outDir, 'cli.js'), 'first build\n');
      },
      pid: process.pid,
      waitMs: 1_000,
      pollMs: 10,
      log,
    });
    expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('first build\n');
    expect(readdirSync(root).sort()).toEqual(['.jest-dist.lock', 'dist']);
  });

  it('a build that throws leaves the previous dist/ intact, removes its staging, and rethrows its own error (task-308 AC1)', async () => {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'cli.js'), 'previous build\n');
    const failure = new Error('build interrupted');
    const err = await rejectionOf(
      prepareDist({
        repoRoot: root,
        build: (outDir) => {
          mkdirSync(outDir);
          writeFileSync(join(outDir, 'cli.js'), 'partial\n');
          throw failure;
        },
        pid: process.pid,
        waitMs: 1_000,
        pollMs: 10,
        log,
      }),
    );
    expect(err).toBe(failure);
    expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('previous build\n');
    expect(readdirSync(root).sort()).toEqual(['.jest-dist.lock', 'dist']);
  });

  it('a build that writes nothing is refused, and the previous dist/ stays (task-308 AC1)', async () => {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'cli.js'), 'previous build\n');
    const err = await rejectionOf(
      prepareDist({ repoRoot: root, build: () => undefined, pid: process.pid, waitMs: 1_000, pollMs: 10, log }),
    );
    expect(typeof (err as { message?: unknown } | null)?.message).toBe('string');
    expect((err as Error).message).toMatch(/wrote nothing/);
    expect((err as Error).message).toContain(distStagingPath(root));
    expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('previous build\n');
  });

  it(
    'a run killed in the middle of its build leaves the previous dist/ intact, and the next run recovers (task-308 AC1, bug-336)',
    async () => {
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'dist', 'cli.js'), 'previous build\n');
      const scratch = mkdtempSync(join(tmpdir(), 'wf-dist-lock-kill-'));
      const marker = join(scratch, 'build-started');
      try {
        // The child takes the lock and starts a build that writes part of its output, says so, then blocks:
        // it is killed there, as a jest run interrupted by Ctrl-C or a timeout would be.
        const script = [
          `const fs = require('node:fs');`,
          `const path = require('node:path');`,
          `const { prepareDist } = require(${JSON.stringify(join(REPO_ROOT, 'test', 'dist-lock.cjs'))});`,
          `prepareDist({`,
          `  repoRoot: ${JSON.stringify(root)}, waitMs: 1000, pollMs: 10, log: () => {},`,
          `  build: (outDir) => {`,
          `    fs.mkdirSync(outDir);`,
          `    fs.writeFileSync(path.join(outDir, 'cli.js'), 'partial\\n');`,
          `    fs.writeFileSync(${JSON.stringify(marker)}, '');`,
          `    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);`,
          `  },`,
          `}).catch((err) => { process.stderr.write(String(err && err.stack || err) + '\\n'); process.exit(3); });`,
        ].join('\n');
        const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
          child.on('exit', (code, signal) => resolve({ code, signal }));
        });
        for (let poll = 0; poll < 600 && !existsSync(marker) && child.exitCode === null && child.signalCode === null; poll += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        const exit = await exited;

        expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('previous build\n');
        expect({ buildStarted: existsSync(marker), exit, stderr }).toEqual({
          buildStarted: true,
          exit: { code: null, signal: 'SIGKILL' },
          stderr: '',
        });

        // The next run takes over the dead run's lock, discards its partial staging, and builds afresh.
        const outDirOnEntry: boolean[] = [];
        await prepareDist({
          repoRoot: root,
          build: (outDir) => {
            outDirOnEntry.push(existsSync(outDir));
            mkdirSync(outDir);
            writeFileSync(join(outDir, 'cli.js'), 'after recovery\n');
          },
          pid: process.pid,
          waitMs: 1_000,
          pollMs: 10,
          log,
        });
        expect(outDirOnEntry).toEqual([false]);
        expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('after recovery\n');
        expect(readdirSync(root).sort()).toEqual(['.jest-dist.lock', 'dist']);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it('takes over a lock left by a run that died before its teardown', async () => {
    const dead = deadPid();
    writeFileSync(lockPath, `${dead}\n`);
    await acquireDistLock({ lockPath, pid: process.pid, waitMs: 1_000, pollMs: 10, log });
    expect(holder(lockPath)).toBe(process.pid);
  });

  it('breaks a stale lock only while holding the break lock: a run busy breaking it makes the others wait', async () => {
    // Without this mutex, runs breaking the same stale lock at once could each delete the lock a
    // faster one had just created, and more than one run held it (review of task-146: 4 of 80 trials
    // with 4 simultaneous takers). Here the break lock is held by a live run.
    const dead = deadPid();
    writeFileSync(lockPath, `${dead}\n`);
    writeFileSync(`${lockPath}.break`, `${LIVE_OTHER_PID}\n`);
    await expect(acquireDistLock({ lockPath, pid: process.pid, waitMs: 50, pollMs: 10, log })).rejects.toThrow(
      `${lockPath}.break`,
    );
    expect(holder(lockPath)).toBe(dead);
    expect(holder(`${lockPath}.break`)).toBe(LIVE_OTHER_PID);
  });

  it('leaves no break lock or temporary file behind after taking over a stale lock', async () => {
    writeFileSync(lockPath, `${deadPid()}\n`);
    await acquireDistLock({ lockPath, pid: process.pid, waitMs: 1_000, pollMs: 10, log });
    expect(holder(lockPath)).toBe(process.pid);
    expect(readdirSync(root).sort()).toEqual(['.jest-dist.lock']);
  });

  it('releases only its own lock: another run\'s lock survives a foreign release', () => {
    writeFileSync(lockPath, `${LIVE_OTHER_PID}\n`);
    expect(releaseDistLock({ lockPath, pid: process.pid })).toBe(false);
    expect(holder(lockPath)).toBe(LIVE_OTHER_PID);
    expect(releaseDistLock({ lockPath, pid: LIVE_OTHER_PID })).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
    expect(releaseDistLock({ lockPath, pid: LIVE_OTHER_PID })).toBe(false);
  });
});

describe('dist/ that cannot be replaced (task-308 AC2, bug-066) — a diagnostic naming the path and the cause', () => {
  let root: string;
  const log = (): void => undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wf-dist-lock-eacces-'));
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'cli.js'), 'previous build\n');
  });

  afterEach(() => {
    restoreModes(root);
    rmSync(root, { recursive: true, force: true });
  });

  itUnlessRoot('a previous build that cannot be removed fails the setup with the path, the code and the remedy, after the swap', async () => {
    // The shape a root-owned dist/ takes: a directory inside it the user cannot write.
    mkdirSync(join(root, 'dist', 'cli'));
    writeFileSync(join(root, 'dist', 'cli', 'a.js'), 'owned by someone else\n');
    chmodSync(join(root, 'dist', 'cli'), 0o555);
    try {
      const err = await rejectionOf(
        prepareDist({
          repoRoot: root,
          build: (outDir) => {
            mkdirSync(outDir);
            writeFileSync(join(outDir, 'new.js'), 'new build\n');
          },
          pid: process.pid,
          waitMs: 1_000,
          pollMs: 10,
          log,
        }),
      );
      expect(typeof (err as { message?: unknown } | null)?.message).toBe('string');
      const message = (err as Error).message;
      expect(message).toMatch(/^jest globalSetup: cannot remove /);
      expect(message).toContain(join(root, '.jest-dist.prev'));
      expect(message).toContain('EACCES');
      expect(message).toContain('bug-066');
      expect(message).toContain('sudo rm -rf');
      expect(((err as Error).cause as NodeJS.ErrnoException | undefined)?.code).toBe('EACCES');
      expect((err as Error).stack).not.toMatch(/^\s+at /m);
      expect(existsSync(join(root, 'dist', 'new.js'))).toBe(true);
    } finally {
      restoreModes(root);
    }
  });

  itUnlessRoot('a dist/ that cannot be moved aside fails the setup naming dist/ and the code, and stays as it was', async () => {
    try {
      const err = await rejectionOf(
        prepareDist({
          repoRoot: root,
          build: (outDir) => {
            mkdirSync(outDir);
            writeFileSync(join(outDir, 'cli.js'), 'new build\n');
            // The worktree root loses its write bit: dist/ can no longer be renamed.
            chmodSync(root, 0o555);
          },
          pid: process.pid,
          waitMs: 1_000,
          pollMs: 10,
          log,
        }),
      );
      expect(typeof (err as { message?: unknown } | null)?.message).toBe('string');
      const message = (err as Error).message;
      expect(message).toMatch(/^jest globalSetup: cannot replace /);
      expect(message).toContain(join(root, 'dist'));
      expect(message).toContain('EACCES');
      expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('previous build\n');
    } finally {
      restoreModes(root);
    }
  });

  itUnlessRoot('a leftover previous build that cannot be removed is refused before building, naming it', async () => {
    mkdirSync(join(root, '.jest-dist.prev', 'cli'), { recursive: true });
    writeFileSync(join(root, '.jest-dist.prev', 'cli', 'a.js'), 'left by a killed run\n');
    chmodSync(join(root, '.jest-dist.prev', 'cli'), 0o555);
    let built = false;
    try {
      const err = await rejectionOf(
        prepareDist({
          repoRoot: root,
          build: () => {
            built = true;
          },
          pid: process.pid,
          waitMs: 1_000,
          pollMs: 10,
          log,
        }),
      );
      expect(typeof (err as { message?: unknown } | null)?.message).toBe('string');
      const message = (err as Error).message;
      expect(message).toMatch(/^jest globalSetup: cannot remove /);
      expect(message).toContain(join(root, '.jest-dist.prev'));
      expect(built).toBe(false);
      expect(contentOf(join(root, 'dist', 'cli.js'))).toBe('previous build\n');
    } finally {
      restoreModes(root);
    }
  });
});

describe('dist/ lock wiring (task-146, bug-095)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require(join(REPO_ROOT, 'jest.config.js')) as { globalSetup?: string; globalTeardown?: string };

  it('jest.config.js runs the locking setup and the releasing teardown', () => {
    expect(config.globalSetup).toBe('<rootDir>/test/global-setup.cjs');
    expect(config.globalTeardown).toBe('<rootDir>/test/global-teardown.cjs');
  });

  it('the setup builds dist/ only through prepareDist, and the teardown releases the lock', () => {
    const withoutComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const setup = withoutComments(readFileSync(join(REPO_ROOT, 'test', 'global-setup.cjs'), 'utf-8'));
    const teardown = readFileSync(join(REPO_ROOT, 'test', 'global-teardown.cjs'), 'utf-8');
    expect(setup).toMatch(/prepareDist\(/);
    expect(setup).not.toMatch(/rmSync/);
    expect(teardown).toMatch(/releaseDistLock\(/);
  });

  it('the lock, its break lock and their temporary files are git-ignored', () => {
    for (const path of ['.jest-dist.lock', '.jest-dist.lock.break', `.jest-dist.lock.${process.pid}.tmp`]) {
      const ignored = spawnSync('git', ['check-ignore', '-q', path], { cwd: REPO_ROOT });
      expect([path, ignored.status]).toEqual([path, 0]);
    }
  });

  it('the staging and previous build directories are git-ignored (task-308 AC1)', () => {
    for (const path of ['.jest-dist.next/cli.js', '.jest-dist.prev/cli.js']) {
      const ignored = spawnSync('git', ['check-ignore', '-q', path], { cwd: REPO_ROOT });
      expect([path, ignored.status]).toEqual([path, 0]);
    }
  });

  it('the staging and previous build directories are ignored by ESLint (task-308 AC1)', () => {
    const probe = spawnSync(
      process.execPath,
      [
        '-e',
        `const { ESLint } = require('eslint');
         const eslint = new ESLint({ cwd: process.cwd() });
         Promise.all(['.jest-dist.next/cli.js', '.jest-dist.prev/cli.js'].map((p) => eslint.isPathIgnored(p).then((i) => [p, i])))
           .then((r) => process.stdout.write(JSON.stringify(r)));`,
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    expect([probe.status, probe.signal, probe.stderr]).toEqual([0, null, '']);
    expect(JSON.parse(probe.stdout)).toEqual([
      ['.jest-dist.next/cli.js', true],
      ['.jest-dist.prev/cli.js', true],
    ]);
  });

  it('the build the setup composes still mirrors package.json\'s build script (task-308, characterization)', () => {
    // test/global-setup.cjs runs tsc and the build record into the staging directory itself; this pin
    // makes a change to the `build` script fail here rather than drift silently from the setup.
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.build.json && node scripts/write-build-info.cjs');
  });

  it('this run\'s setup left a complete dist/ and no staging or previous directory (task-308, characterization)', () => {
    expect(existsSync(join(REPO_ROOT, 'dist', 'cli.js'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'dist', 'build-info.json'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, '.jest-dist.next'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, '.jest-dist.prev'))).toBe(false);
  });
});

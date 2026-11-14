/**
 * task-338 (developer's tests, added at green/refactor beside the red commit's) — two behaviours red left unasserted
 * (`spec-016` §2.4, §3.3 step 14 as amended; design D5):
 *
 * - `agentEnvironment` under win32's path rules: the `PATH` key found case-insensitively (`Path` is updated, no second
 *   `PATH` is added), `;` as the separator and the shim's directory taken with backslashes. The rules are chosen by the
 *   optional `platform` argument, so this runs on the Linux CI.
 * - `withRunFiles` with a shim: it is written owner-only (`0700`) in the run's temporary directory, handed to the work
 *   as its third argument, and removed with the directory when the work rejects and when a signal arrives before the
 *   spawn — the paths the integration suite does not take.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { agentEnvironment, cliShim, withRunFiles } from '../../src/agent';

const POSIX = process.platform !== 'win32';
const SHIM = cliShim({ command: '/opt/node/bin/node', args: ['/opt/wf/dist/cli.js'] }, 'linux');

describe('task-338 — agentEnvironment under win32 path rules (design D5)', () => {
  it('updates the Path key whatever its case, with ";" and the backslashed directory, and adds no PATH', () => {
    const out = agentEnvironment({ Path: 'C:\\Windows;C:\\Tools', HOME: 'C:\\Users\\u' }, 'C:\\Temp\\wingfoil-run-x\\bin\\wingfoil.cmd', 'Hand Agent', 'win32');
    expect(out['Path']).toBe('C:\\Temp\\wingfoil-run-x\\bin;C:\\Windows;C:\\Tools');
    expect(Object.keys(out).filter((name) => name.toUpperCase() === 'PATH')).toEqual(['Path']);
    expect(out['WINGFOIL_CLI']).toBe('C:\\Temp\\wingfoil-run-x\\bin\\wingfoil.cmd');
  });

  it('with no path key at all, PATH is the directory alone', () => {
    expect(agentEnvironment({}, 'C:\\T\\bin\\wingfoil.cmd', 'Hand Agent', 'win32')['PATH']).toBe('C:\\T\\bin');
  });

  it('POSIX rules keep the key case-sensitive: a "Path" variable is not the search path', () => {
    const out = agentEnvironment({ Path: '/x' }, '/t/bin/wingfoil', 'Hand Agent', 'linux');
    expect(out['Path']).toBe('/x');
    expect(out['PATH']).toBe('/t/bin');
  });
});

describe('task-338 — withRunFiles writes the shim and removes it on every exit path', () => {
  it('the shim is in a bin directory of the run\'s temporary directory, with its text, handed to the work', async () => {
    let seen: string | undefined;
    let text = '';
    let mode = '';
    await withRunFiles(
      {},
      async (_paths, _release, shim) => {
        seen = shim;
        text = readFileSync(shim!, 'utf-8');
        mode = (statSync(shim!).mode & 0o777).toString(8);
      },
      SHIM,
    );
    expect(seen).toBeDefined();
    expect(dirname(dirname(seen!)).startsWith(join(tmpdir(), 'wingfoil-run-'))).toBe(true);
    expect(seen!.endsWith(join('bin', 'wingfoil'))).toBe(true);
    expect(text).toBe(SHIM.text);
    if (POSIX) expect(mode).toBe('700');
    expect(existsSync(dirname(dirname(seen!)))).toBe(false);
  });

  it('without a shim the work gets none', async () => {
    let seen: string | undefined = 'unset';
    await withRunFiles({}, async (_paths, _release, shim) => {
      seen = shim;
    });
    expect(seen).toBeUndefined();
  });

  it('a work that rejects: the shim goes with the directory', async () => {
    let seen = '';
    await expect(
      withRunFiles(
        {},
        async (_paths, _release, shim) => {
          seen = shim!;
          throw new Error('pre-flight failed');
        },
        SHIM,
      ),
    ).rejects.toThrow('pre-flight failed');
    expect(existsSync(seen)).toBe(false);
    expect(existsSync(dirname(dirname(seen)))).toBe(false);
  });

  it('a signal before the spawn: the shim goes with the directory, before the work settles', async () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    let seen = '';
    let existedAfterSignal = true;
    try {
      await withRunFiles(
        {},
        async (_paths, _release, shim) => {
          seen = shim!;
          process.emit('SIGTERM', 'SIGTERM');
          existedAfterSignal = existsSync(seen);
        },
        SHIM,
      );
    } finally {
      kill.mockRestore();
    }
    expect(existedAfterSignal).toBe(false);
    expect(existsSync(dirname(dirname(seen)))).toBe(false);
  });
});

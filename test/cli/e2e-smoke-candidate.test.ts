/**
 * task-219 — the B3-gate handover (`task-207`'s review): the `e2e-smoke-passed` binding ran whatever
 * `wingfoil` was on PATH, with no `--expect-version` / `--expect-commit`, so its report did not prove the
 * candidate (`dl-099` §1: the smoke runs against the candidate's packed tarball, not the working tree).
 *
 * `node scripts/e2e-smoke.cjs --candidate` smokes the candidate itself: on a clean working tree it packs
 * the checked-out commit (`npm pack`, whose `prepack` builds `dist/` and its stamp), installs that tarball
 * into a throwaway prefix, and drives the installed bin — an absolute path, which the throwaway step
 * directories need — with `--expect-version` = `package.json`'s version and `--expect-commit` = `HEAD`. The
 * binding passes `--candidate`. The effects are injected: no pack, no install, no network here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const SHA = 'b'.repeat(40);

interface CandidateEffects {
  status: () => string;
  head: () => string;
  version: () => string;
  makeDir: () => string;
  pack: (destination: string) => string;
  install: (tarball: string, prefix: string) => void;
  removeDir: (dir: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const smoke = require('../../scripts/e2e-smoke.cjs') as {
  parseSmokeArgs: (argv: readonly string[]) => Record<string, unknown>;
  prepareCandidate: (effects: CandidateEffects) => {
    command: string;
    commandArgs: readonly string[];
    expectedVersion: string;
    expectedCommit: string;
    cleanup: () => void;
  };
};

function fakeEffects(over: Partial<CandidateEffects> = {}): { effects: CandidateEffects; calls: string[] } {
  const calls: string[] = [];
  const effects: CandidateEffects = {
    status: () => '',
    head: () => SHA,
    version: () => '0.3.0',
    makeDir: () => {
      calls.push('makeDir');
      return '/tmp/wf-candidate';
    },
    pack: (destination) => {
      calls.push(`pack ${destination}`);
      return `${destination}/wingfoil-0.3.0.tgz`;
    },
    install: (tarball, prefix) => {
      calls.push(`install ${tarball} ${prefix}`);
    },
    removeDir: (dir) => {
      calls.push(`removeDir ${dir}`);
    },
    ...over,
  };
  return { effects, calls };
}

describe('task-219 — e2e-smoke --candidate smokes the packed candidate with its stamp bound', () => {
  it('parses --candidate beside --report, and refuses it with an explicit stamp or command', () => {
    expect(smoke.parseSmokeArgs(['--candidate', '--report', 'docs/07_gates/r.md'])).toEqual({
      command: 'wingfoil',
      commandArgs: [],
      candidate: true,
      reportPath: 'docs/07_gates/r.md',
    });
    expect(() => smoke.parseSmokeArgs(['--candidate', '--expect-version', '0.3.0'])).toThrow('--candidate');
    expect(() => smoke.parseSmokeArgs(['--candidate', '--', 'node', '/x/cli.js'])).toThrow('--candidate');
  });

  it('packs HEAD into a throwaway dir, installs it there, and smokes that absolute bin against version and HEAD', () => {
    const { effects, calls } = fakeEffects();
    const candidate = smoke.prepareCandidate(effects);
    expect(candidate).toMatchObject({
      command: '/tmp/wf-candidate/prefix/bin/wingfoil',
      commandArgs: [],
      expectedVersion: '0.3.0',
      expectedCommit: SHA,
    });
    expect(calls).toEqual([
      'makeDir',
      'pack /tmp/wf-candidate/pack',
      'install /tmp/wf-candidate/pack/wingfoil-0.3.0.tgz /tmp/wf-candidate/prefix',
    ]);
    candidate.cleanup();
    expect(calls[calls.length - 1]).toBe('removeDir /tmp/wf-candidate');
  });

  it('refuses a dirty working tree before packing: its stamp would be <sha>-dirty, not the candidate', () => {
    const { effects, calls } = fakeEffects({ status: () => ' M src/x.ts' });
    expect(() => smoke.prepareCandidate(effects)).toThrow('working tree is not clean');
    expect(calls).toEqual([]);
  });

  it('removes the throwaway dir when the pack or the install fails', () => {
    const { effects, calls } = fakeEffects({
      install: () => {
        throw new Error('npm install exited 1');
      },
    });
    expect(() => smoke.prepareCandidate(effects)).toThrow('npm install exited 1');
    expect(calls[calls.length - 1]).toBe('removeDir /tmp/wf-candidate');
  });

  it('the gate binding passes --candidate', () => {
    const bindings = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8')) as {
      checks: Record<string, { run: string[] }>;
    };
    expect(bindings.checks['e2e-smoke-passed']?.run).toEqual(['node', 'scripts/e2e-smoke.cjs', '--candidate', '--report', '{report}']);
  });
});

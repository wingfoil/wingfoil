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
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

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
  /** task-282 (`bug-310`): remove the checkout's `dist/` before packing. */
  removeBuild: () => void;
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
  candidateStatus: (root: string) => string;
  removeBuildOutput: (root: string) => void;
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
    removeBuild: () => {
      calls.push('removeBuild');
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
    // task-282 (`bug-310`): the checkout's dist/ is removed before the pack, so `prepack` rebuilds it whole.
    expect(calls).toEqual([
      'makeDir',
      'removeBuild',
      'pack /tmp/wf-candidate/pack',
      'install /tmp/wf-candidate/pack/wingfoil-0.3.0.tgz /tmp/wf-candidate/prefix',
    ]);
    candidate.cleanup();
    expect(calls[calls.length - 1]).toBe('removeDir /tmp/wf-candidate');
  });

  // task-282 (`bug-310`, task-219 D4 (c)): the refusal is about the pack inputs, not the whole working tree.
  it('refuses a change to a pack input before packing: its stamp would be <sha>-dirty, not the candidate', () => {
    const { effects, calls } = fakeEffects({ status: () => ' M src/x.ts' });
    expect(() => smoke.prepareCandidate(effects)).toThrow('a pack input has uncommitted changes');
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

// Review fix 5 (2026-10-10): the header contract — 1 a check failed, 2 a bad argument — holds for an error
// after the run too (here: a report path that cannot be written), with no stack trace.
describe('task-219 — e2e-smoke keeps its exit-2 path', () => {
  it('an unwritable --report path exits 2 with `error: <reason>` on stderr, not a stack trace', () => {
    const run = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'e2e-smoke.cjs'), '--report', '/dev/null/x.md', '--', '/nonexistent'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^error: /m);
    expect(run.stderr).not.toMatch(/\n\s+at /);
  });
});

/**
 * task-282 AC 1 (`bug-310`, task-219 D4 (c), approver rulings D4–D5): `--candidate` refuses only a change to
 * the pack inputs — the ONE list `scripts/write-build-info.cjs` declares — and the candidate's build starts
 * from a removed `dist/`, so a module of a deleted source is never packed.
 */
describe('task-282 AC 1 — --candidate checks the pack inputs and packs from a removed dist/', () => {
  describe('candidateStatus', () => {
    let repo: string;
    beforeEach(() => {
      repo = makeTempGitRepo();
      writeFixtureFile(repo, 'package.json', JSON.stringify({ name: 'fixture', version: '4.5.6' }, null, 2));
      writeFixtureFile(repo, 'src/a.ts', 'export const a = 1;\n');
      writeFixtureFile(repo, 'docs/x.md', '# X\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '--quiet', '-m', 'seed']);
    });
    afterEach(() => removeTempDir(repo));

    it("is '' with an untracked file and a modified doc outside the pack inputs", () => {
      writeFixtureFile(repo, 'note.txt', 'later\n');
      writeFixtureFile(repo, 'docs/x.md', '# X, revised\n');
      expect(smoke.candidateStatus(repo)).toBe('');
    });

    it('names a modified file inside the pack inputs', () => {
      writeFixtureFile(repo, 'src/a.ts', 'export const a = 2;\n');
      expect(smoke.candidateStatus(repo)).toContain('src/a.ts');
    });
  });

  it('throws when git cannot report the status (not a repository)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-candidate-nogit-'));
    try {
      expect(() => smoke.candidateStatus(dir)).toThrow('git could not report the status of the pack inputs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removeBuildOutput removes dist/ with what it holds, and is a no-op without it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-candidate-dist-'));
    try {
      mkdirSync(join(dir, 'dist'));
      writeFileSync(join(dir, 'dist', 'stale.js'), 'module.exports = {};\n');
      smoke.removeBuildOutput(dir);
      expect(existsSync(join(dir, 'dist'))).toBe(false);
      expect(() => smoke.removeBuildOutput(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a removeBuild that throws is rethrown, and the throwaway dir is still removed', () => {
    const { effects, calls } = fakeEffects({
      removeBuild: () => {
        calls.push('removeBuild');
        throw new Error('rm failed');
      },
    });
    expect(() => smoke.prepareCandidate(effects)).toThrow('rm failed');
    expect(calls).toContain('removeBuild');
    expect(calls[calls.length - 1]).toBe('removeDir /tmp/wf-candidate');
  });

  describe('the CLI, from a copy of the scripts in a temp checkout', () => {
    let repo: string;
    beforeEach(() => {
      repo = makeTempGitRepo();
      mkdirSync(join(repo, 'scripts'));
      for (const file of ['e2e-smoke.cjs', 'write-build-info.cjs']) copyFileSync(join(REPO_ROOT, 'scripts', file), join(repo, 'scripts', file));
      writeFixtureFile(repo, 'package.json', JSON.stringify({ name: 'fixture', version: '4.5.6' }, null, 2));
      writeFixtureFile(repo, '.gitignore', 'dist/\n');
      writeFixtureFile(repo, 'src/a.ts', 'export const a = 1;\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '--quiet', '-m', 'seed']);
      writeFixtureFile(repo, 'dist/stale.js', 'module.exports = {};\n');
    });
    afterEach(() => removeTempDir(repo));

    it('refuses a modified pack input with exit 1, naming it, and removes nothing', () => {
      writeFixtureFile(repo, 'src/a.ts', 'export const a = 2;\n');
      const run = spawnSync(process.execPath, [join(repo, 'scripts', 'e2e-smoke.cjs'), '--candidate'], { cwd: repo, encoding: 'utf-8' });
      expect(run.stderr).toMatch(/^error: --candidate: a pack input has uncommitted changes/);
      expect(run.stderr).toContain('src/a.ts');
      expect(run.status).toBe(1);
      expect(existsSync(join(repo, 'dist', 'stale.js'))).toBe(true);
    });
  });
});

/**
 * task-282 AC 2 (`bug-310`; reclassified red-first at design, approver ruling): the e2e-smoke gate's
 * description names `--candidate`, and `e2e-smoke.yaml`'s `version:` is raised once for it.
 */
describe('task-282 AC 2 — e2e-smoke.yaml names --candidate in the gate', () => {
  const raw = readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'e2e-smoke.yaml'), 'utf-8');
  const workflow = yamlLoad(raw) as { version: number; phases: { name: string; description?: string }[] };

  it('is at 1.7 or later, with a task-282 entry in its version comment', () => {
    expect(workflow.version).toBeGreaterThanOrEqual(1.7);
    expect(raw).toMatch(/1\.7 [^;]*task-282/);
  });

  it('the gate description names --candidate and the removed dist/', () => {
    const gate = workflow.phases.find((phase) => phase.name === 'gate');
    expect(gate?.description).toContain('--candidate');
    expect(gate?.description).toContain('dist/');
  });
});

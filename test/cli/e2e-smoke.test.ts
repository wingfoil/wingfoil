/**
 * task-060-publish-pipeline — the `dl-023` fresh-init + CLI smoke (`scripts/e2e-smoke.cjs`), which
 * `spec-015` §3 stage 3 runs against the `wingfoil` installed from the staging registry.
 *
 * Here it runs for real against the compiled `dist/cli.js` (built once by jest's `globalSetup`), so the
 * smoke the staging step depends on is itself exercised offline on every test run — only the command it
 * drives differs (`node dist/cli.js` here, the `wingfoil` bin on PATH at staging).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SMOKE_TEMPLATES, parseSmokeArgs, runSmoke, smokeSteps } from '../../scripts/e2e-smoke.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const DIST_CLI = join(REPO_ROOT, 'dist', 'cli.js');
const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { version: string };

describe('dl-023 smoke (task-060) — scripts/e2e-smoke.cjs', () => {
  it('covers every supported init template', () => {
    expect(SMOKE_TEMPLATES).toEqual(['Scrum', 'Kanban']);
  });

  it('drives the dl-023 CLI surface, after init, per template — the exact ordered list (task-107 AC4)', () => {
    // Exact, not arrayContaining: bug-029 went unnoticed because omitting a step left this test green.
    expect(smokeSteps('Scrum').map((s) => s.args.join(' '))).toEqual([
      'init --template Scrum',
      'dna show --format json',
      'dna set project.name --value WingFoil smoke',
      'memory add --type task --title Smoke task --format json',
      'memory submit {task.id} --format json',
      'paths config --list --format json',
      'directives list --format json',
      'workflow list --format json',
    ]);
  });

  it('submits the task memory add created, and asserts the draft -> pending edge (task-107 AC1/AC2)', () => {
    const steps = smokeSteps('Kanban');
    const add = steps.find((s) => s.args[0] === 'memory' && s.args[1] === 'add');
    const submit = steps.find((s) => s.args[0] === 'memory' && s.args[1] === 'submit');
    expect(add).toMatchObject({ json: true, capture: 'task' });
    expect(submit).toMatchObject({ json: true, expect: { from: 'draft', to: 'pending' } });
  });

  it('passes against the compiled CLI: --help, --version, and a clean init + CLI run per template', () => {
    const report = runSmoke({ command: process.execPath, commandArgs: [DIST_CLI], expectedVersion: version });
    const failed = report.checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(report.ok).toBe(true);
    const labels = report.checks.map((c) => c.label);
    expect(labels).toContain('wingfoil --help');
    expect(labels).toContain(`wingfoil --version = ${version}`);
    for (const template of SMOKE_TEMPLATES) {
      expect(labels).toContain(`[${template}] wingfoil init --template ${template}`);
      // The placeholder is resolved from memory add's JSON: ids restart per type in a fresh project.
      expect(labels).toContain(`[${template}] wingfoil memory submit task-001-smoke-task --format json`);
      // task-107 AC3: the clean-tree check is the last one of each template's run.
      const own = labels.filter((l) => l.startsWith(`[${template}] `));
      expect(own[own.length - 1]).toBe(`[${template}] working tree clean after every mutation`);
    }
  });

  it('fails when the command exits non-zero, and stops before the per-template runs', () => {
    const report = runSmoke({ command: process.execPath, commandArgs: ['-e', 'process.exit(3)', '--'] });
    expect(report.ok).toBe(false);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({ label: 'wingfoil --help', ok: false });
    expect(report.checks[0]?.detail).toContain('exit 3');
  });

  it('fails when the installed version is not the one staged', () => {
    const report = runSmoke({ command: process.execPath, commandArgs: [DIST_CLI], expectedVersion: '9.9.9' });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.label === 'wingfoil --version = 9.9.9')?.ok).toBe(false);
  });

  describe('a step that depends on an earlier one (task-107 AC2/AC7) — against a stub wingfoil', () => {
    // A stub CLI: --help prints usage, `memory add` prints an id, `memory submit` obeys SMOKE_STUB,
    // every other command prints `{}`. It writes nothing, so the clean-tree check always passes.
    const STUB = [
      'const [a, b] = process.argv.slice(1);',
      'const mode = process.env.SMOKE_STUB;',
      "if (a === '--help') { console.log('Usage: wingfoil'); process.exit(0); }",
      "if (a === 'memory' && b === 'add') {",
      "  console.log(JSON.stringify(mode === 'no-id' ? { path: 'p' } : { id: 'task-001-stub', path: 'p' }));",
      '  process.exit(0);',
      '}',
      "if (a === 'memory' && b === 'submit') {",
      "  if (mode === 'fail') { console.error('error: boom'); process.exit(1); }",
      "  console.log(JSON.stringify({ id: process.argv[3], from: 'draft', to: mode === 'wrong-edge' ? 'approved' : 'pending' }));",
      '  process.exit(0);',
      '}',
      "console.log('{}');",
    ].join('\n');
    const stub = (mode: string) =>
      runSmoke({ command: process.execPath, commandArgs: ['-e', STUB, '--'], env: { ...process.env, SMOKE_STUB: mode } });

    it('passes when submit reports draft -> pending, with the captured id in its argv', () => {
      const report = stub('ok');
      expect(report.checks.filter((c) => !c.ok)).toEqual([]);
      expect(report.checks.map((c) => c.label)).toContain('[Scrum] wingfoil memory submit task-001-stub --format json');
    });

    it('reports a failing submit as the failing check, and stops there', () => {
      const report = stub('fail');
      expect(report.ok).toBe(false);
      const last = report.checks[report.checks.length - 1];
      expect(last).toMatchObject({ label: '[Scrum] wingfoil memory submit task-001-stub --format json', ok: false });
      expect(last?.detail).toContain('exit 1');
    });

    it('fails a submit that exits 0 on the wrong edge, naming what came back', () => {
      const report = stub('wrong-edge');
      expect(report.ok).toBe(false);
      const last = report.checks[report.checks.length - 1];
      expect(last?.label).toBe('[Scrum] wingfoil memory submit task-001-stub --format json');
      expect(last?.detail).toContain('to=approved');
    });

    it('fails, without spawning, when the placeholder cannot be resolved from the earlier output', () => {
      const report = stub('no-id');
      expect(report.ok).toBe(false);
      const last = report.checks[report.checks.length - 1];
      expect(last?.label).toBe('[Scrum] wingfoil memory submit {task.id} --format json');
      expect(last?.detail).toContain('{task.id}');
    });
  });

  /**
   * task-254 (`bug-235`, `dl-111`): with an expected commit the `--version` check requires the whole
   * stamp `<version> (<sha>)`. Driven against a stub whose `--version` prints `SMOKE_STAMP`, so each
   * stamp shape the build can produce (`scripts/write-build-info.cjs`) is exercised exactly.
   */
  describe('the expected commit (task-254, bug-235) — against a stub wingfoil', () => {
    const SHA = '0123456789abcdef0123456789abcdef01234567';
    const OTHER = 'fedcba9876543210fedcba9876543210fedcba98';
    const STAMP_STUB = [
      'const [a] = process.argv.slice(1);',
      "if (a === '--help') { console.log('Usage: wingfoil'); process.exit(0); }",
      "if (a === '--version') { console.log(process.env.SMOKE_STAMP); process.exit(0); }",
      "console.log(JSON.stringify({ id: 'task-001-stub', from: 'draft', to: 'pending' }));",
    ].join('\n');
    const smokeWith = (stamp: string, expectedCommit?: string) =>
      runSmoke({
        command: process.execPath,
        commandArgs: ['-e', STAMP_STUB, '--'],
        env: { ...process.env, SMOKE_STAMP: stamp },
        expectedVersion: '0.3.0',
        expectedCommit,
      });
    const versionCheck = (report: ReturnType<typeof runSmoke>) =>
      report.checks.find((c) => c.label.startsWith('wingfoil --version'));

    it('passes when --version is exactly <version> (<expected sha>)', () => {
      const report = smokeWith(`0.3.0 (${SHA})`, SHA);
      expect(report.checks.filter((c) => !c.ok)).toEqual([]);
      expect(versionCheck(report)).toMatchObject({ label: `wingfoil --version = 0.3.0 (${SHA})`, ok: true });
    });

    it.each([
      ['an unknown commit', '0.3.0 (unknown)'],
      ['a -dirty build of the expected commit', `0.3.0 (${SHA}-dirty)`],
      ['another commit', `0.3.0 (${OTHER})`],
      ['a bare semver', '0.3.0'],
    ])('fails on %s, naming the expected and the actual stamp, and stops there', (_case, stamp) => {
      const report = smokeWith(stamp, SHA);
      expect(report.ok).toBe(false);
      const last = report.checks[report.checks.length - 1];
      expect(last?.label).toBe(`wingfoil --version = 0.3.0 (${SHA})`);
      expect(last?.ok).toBe(false);
      expect(last?.detail).toContain(`expected "0.3.0 (${SHA})"`);
      expect(last?.detail).toContain(`got "${stamp}"`);
    });

    it('refuses an expected commit without an expected version, or one that is not a commit name', () => {
      const run = (options: { expectedVersion?: string; expectedCommit?: string }) => () =>
        runSmoke({ command: process.execPath, commandArgs: ['-e', STAMP_STUB, '--'], ...options });
      expect(run({ expectedCommit: SHA })).toThrow('expectedCommit requires expectedVersion');
      // An abbreviated sha can never equal a real stamp (write-build-info records the full sha): refused.
      for (const bad of ['unknown', `${SHA}-dirty`, 'main', 'abc12', SHA.slice(0, 12), SHA.slice(0, 39), '']) {
        expect(run({ expectedVersion: '0.3.0', expectedCommit: bad })).toThrow('not a commit name');
      }
      expect(run({ expectedVersion: '0.3.0', expectedCommit: 'a'.repeat(64) })).not.toThrow();
    });

    it('keeps the version-only check lenient on the commit when no commit is expected (AC3)', () => {
      for (const stamp of ['0.3.0 (unknown)', `0.3.0 (${SHA}-dirty)`, `0.3.0 (${OTHER})`, '0.3.0']) {
        expect(versionCheck(smokeWith(stamp))).toMatchObject({ label: 'wingfoil --version = 0.3.0', ok: true });
      }
    });

    it('parses --expect-commit beside --expect-version, and refuses it alone', () => {
      expect(parseSmokeArgs(['--expect-version', '0.3.0', '--expect-commit', SHA, '--', 'node', '/x/cli.js'])).toEqual({
        command: 'node',
        commandArgs: ['/x/cli.js'],
        expectedVersion: '0.3.0',
        expectedCommit: SHA,
      });
      expect(parseSmokeArgs(['--expect-version', '0.3.0'])).toEqual({
        command: 'wingfoil',
        commandArgs: [],
        expectedVersion: '0.3.0',
      });
      expect(() => parseSmokeArgs(['--expect-commit'])).toThrow('--expect-commit');
      expect(() => parseSmokeArgs(['--expect-version', '0.3.0', '--expect-commit', SHA.slice(0, 12)])).toThrow('not a commit name');
      expect(() => parseSmokeArgs(['--expect-commit', SHA])).toThrow('--expect-commit requires --expect-version');
    });

    it('the CLI exits 1 on a -dirty stamp under --expect-commit, and 2 on --expect-commit alone', () => {
      const script = join(REPO_ROOT, 'scripts', 'e2e-smoke.cjs');
      const cli = (args: string[]) =>
        spawnSync(process.execPath, [script, ...args, '--', process.execPath, '-e', STAMP_STUB, '--'], {
          encoding: 'utf-8',
          env: { ...process.env, SMOKE_STAMP: `0.3.0 (${SHA}-dirty)` },
        });
      const dirty = cli(['--expect-version', '0.3.0', '--expect-commit', SHA]);
      expect(dirty.status).toBe(1);
      expect(dirty.stdout).toContain(`FAIL wingfoil --version = 0.3.0 (${SHA})`);
      expect(dirty.stdout).toContain(`got "0.3.0 (${SHA}-dirty)"`);
      const alone = cli(['--expect-commit', SHA]);
      expect(alone.status).toBe(2);
      expect(alone.stderr).toContain('--expect-commit requires --expect-version');
      const abbreviated = cli(['--expect-version', '0.3.0', '--expect-commit', SHA.slice(0, 12)]);
      expect(abbreviated.status).toBe(2);
      expect(abbreviated.stderr).toContain('not a commit name');
    });
  });
});

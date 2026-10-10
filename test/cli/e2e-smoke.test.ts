/**
 * task-060-publish-pipeline — the `dl-023` fresh-init + CLI smoke (`scripts/e2e-smoke.cjs`), which
 * `spec-015` §3 stage 3 runs against the `wingfoil` installed from the staging registry.
 *
 * Here it runs for real against the compiled `dist/cli.js` (built once by jest's `globalSetup`), so the
 * smoke the staging step depends on is itself exercised offline on every test run — only the command it
 * drives differs (`node dist/cli.js` here, the `wingfoil` bin on PATH at staging).
 *
 * task-207 (`dl-099` §3; `bug-132`, `bug-133`, `bug-134`) turns the command list into a use scenario:
 * - AC 1 (`bug-132`): every step declares the exit it expects, and the scenario has exit-1 and exit-2
 *   steps; a wrong code, or a non-zero exit without spec-005 §3's error, fails the smoke.
 * - AC 2 (`bug-133`): after the last writer, every written artifact is re-loaded through its own reader
 *   and its content asserted; a corrupted write fails the smoke.
 * - AC 3: per template, one element of each machine shape walks `add → submit → approve`, one is
 *   rejected, one deprecated, `memory history` on each; the tree is clean after every step.
 * - AC 4 (`bug-134`): `e2e-smoke.yaml` declares the report the gate's check writes (`--report`).
 * The faults are injected by `test/fixtures/smoke/wingfoil-proxy.cjs`, which forwards to `dist/cli.js`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import {
  SMOKE_TEMPLATES,
  formatReport,
  parseSmokeArgs,
  runSmoke,
  smokeSteps,
  smokeTemplate,
} from '../../scripts/e2e-smoke.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const DIST_CLI = join(REPO_ROOT, 'dist', 'cli.js');
const PROXY = join(REPO_ROOT, 'test', 'fixtures', 'smoke', 'wingfoil-proxy.cjs');
const SCRIPT = join(REPO_ROOT, 'scripts', 'e2e-smoke.cjs');
const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { version: string };

/** The report path `e2e-smoke.yaml`'s gate declares (`bug-134`). */
const REPORT_PATH = 'docs/07_gates/rl-{release.release-line}/rel-{release.version}-e2e-smoke.md';

type Step = ReturnType<typeof smokeSteps>[number];
type Report = ReturnType<typeof runSmoke>;

/** The smoke driven through the fault-injecting proxy; `fault` is `SMOKE_FAULT` (`<kind>@<argv prefix>`). */
function smokeWithFault(fault: string): Report {
  return runSmoke({ command: process.execPath, commandArgs: [PROXY], env: { ...process.env, SMOKE_FAULT: fault } });
}

function lastCheck(report: Report): { label: string; ok: boolean; detail: string } {
  return report.checks[report.checks.length - 1]!;
}

/** The writer verbs: a step running one of them with exit 0 writes (and commits) an artifact. */
const WRITERS = ['init', 'dna set', 'dna add', 'memory add', 'memory submit', 'memory approve', 'memory reject', 'memory deprecate'];
function isWriter(step: Step): boolean {
  const verb = step.args[0] === 'init' ? 'init' : `${step.args[0]} ${step.args[1]}`;
  return step.exit === 0 && WRITERS.includes(verb);
}

describe('dl-023 smoke (task-060) — scripts/e2e-smoke.cjs', () => {
  it('covers every supported init template', () => {
    expect(SMOKE_TEMPLATES).toEqual(['Scrum', 'Kanban']);
  });

  it('passes against the compiled CLI: --help, --version, and the whole scenario per template', () => {
    const report = runSmoke({ command: process.execPath, commandArgs: [DIST_CLI], expectedVersion: version });
    const failed = report.checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(report.ok).toBe(true);
    const labels = report.checks.map((c) => c.label);
    expect(labels).toContain('wingfoil --help');
    expect(labels).toContain(`wingfoil --version = ${version}`);
    for (const template of SMOKE_TEMPLATES) {
      expect(labels).toContain(`[${template}] wingfoil init --template ${template}`);
      // The placeholders are resolved from memory add's JSON: ids restart per type in a fresh project.
      expect(labels).toContain(`[${template}] wingfoil memory approve task-001-approved-task --reason smoke: approve --format json`);
      expect(labels).toContain(`[${template}] wingfoil memory reject task-002-rejected-task --reason smoke: reject --format json`);
      expect(labels).toContain(`[${template}] wingfoil memory deprecate task-003-deprecated-task --reason smoke: deprecate --format json`);
      // One check per step: the clean-tree assertion is part of each step's check (AC 3).
      expect(labels.filter((l) => l.startsWith(`[${template}] `))).toHaveLength(smokeSteps(template).length);
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

  describe('AC 1 (bug-132) — every step declares its exit; 0, 1 and 2 are all asserted', () => {
    it.each(SMOKE_TEMPLATES)('[%s] each step declares exit 0, 1 or 2, with at least one 1 and one 2', (template) => {
      const steps = smokeSteps(template);
      for (const step of steps) expect([0, 1, 2]).toContain(step.exit);
      expect(steps.filter((s) => s.exit === 1).length).toBeGreaterThanOrEqual(1);
      expect(steps.filter((s) => s.exit === 2).length).toBeGreaterThanOrEqual(1);
      // A refusal is asserted by its spec-005 §3 reason, not only by its code.
      for (const step of steps.filter((s) => s.exit !== 0)) expect(typeof step.expect?.error).toBe('string');
    });

    it('fails a step that exits 1 where 2 is expected, naming both codes, and stops there', () => {
      const report = smokeWithFault('exit=1@dna show --no-such-option');
      expect(report.ok).toBe(false);
      expect(lastCheck(report)).toMatchObject({ label: '[Scrum] wingfoil dna show --no-such-option', ok: false });
      expect(lastCheck(report).detail).toContain('expected exit 2, got exit 1');
    });

    it('fails a refusal that exits 0 where 1 is expected', () => {
      const report = smokeWithFault('exit=0@memory approve task-001-approved-task --reason smoke: no approver bound');
      expect(report.ok).toBe(false);
      expect(lastCheck(report).label).toBe(
        '[Scrum] wingfoil memory approve task-001-approved-task --reason smoke: no approver bound --format json',
      );
      expect(lastCheck(report).detail).toContain('expected exit 1, got exit 0');
    });

    it('fails a non-zero exit that carries no spec-005 §3 error on stderr', () => {
      const report = smokeWithFault('mute@dna show --no-such-option');
      expect(report.ok).toBe(false);
      expect(lastCheck(report).label).toBe('[Scrum] wingfoil dna show --no-such-option');
      expect(lastCheck(report).detail).toContain('no spec-005 §3 error on stderr');
    });
  });

  describe('AC 2 (bug-133) — every written artifact is re-loaded after the last writer', () => {
    it.each(SMOKE_TEMPLATES)('[%s] the readers of dna, Memory, directives and workflows follow the last writer', (template) => {
      const steps = smokeSteps(template);
      const lastWriter = steps.map(isWriter).lastIndexOf(true);
      expect(lastWriter).toBeGreaterThan(0);
      const after = steps.slice(lastWriter + 1);
      const verbs = after.map((s) => `${s.args[0]} ${s.args[1]}`);
      for (const reader of ['dna show', 'memory search', 'memory history', 'directives list', 'workflow list']) {
        expect(verbs).toContain(reader);
      }
      // The re-loads assert what was written, not only that the reader exits 0 — except `paths` and
      // `workflow list`, whose content no smoke step writes (task-204 reshapes the latter's payload).
      for (const step of after.filter((s) => s.args[0] !== 'workflow' && s.args[0] !== 'paths')) {
        expect(Object.keys(step.expect ?? {}).length).toBeGreaterThan(0);
      }
    });

    it('fails when the last writer leaves a schema-invalid document behind, at its re-load', () => {
      const report = smokeWithFault('corrupt@memory deprecate');
      expect(report.ok).toBe(false);
      // The deprecate step itself passes (exit 0, clean tree): only a re-load can see the corruption.
      expect(report.checks.find((c) => c.label.startsWith('[Scrum] wingfoil memory deprecate'))?.ok).toBe(true);
      expect(lastCheck(report).label).toBe('[Scrum] wingfoil memory search task-003-deprecated-task --status deprecated --format json');
      expect(lastCheck(report).detail).toContain('expected matches.length=1, got matches.length=0');
    });
  });

  describe('AC 3 — the use scenario, and a clean tree after every step', () => {
    /** The verbs each captured element goes through, in order. */
    function walk(template: string): Record<string, string[]> {
      const byElement: Record<string, string[]> = {};
      for (const step of smokeSteps(template)) {
        if (step.args[0] !== 'memory' || step.exit !== 0) continue;
        const name = step.capture ?? /^\{(\w+)\.id\}$/.exec(step.args[2] ?? '')?.[1];
        if (name !== undefined) (byElement[name] ??= []).push(step.args[1]!);
      }
      return byElement;
    }

    it.each(SMOKE_TEMPLATES)('[%s] approve, reject and deprecate one task each, each re-loaded with its history', (template) => {
      expect(walk(template)).toEqual({
        approved: ['add', 'submit', 'approve', 'search', 'history'],
        rejected: ['add', 'submit', 'reject', 'search', 'history'],
        deprecated: ['add', 'deprecate', 'search', 'history'],
      });
    });

    it.each(SMOKE_TEMPLATES)('[%s] a fresh init declares one machine shape, `defaults`, so one task per verb covers it', (template) => {
      const repo = mkdtempSync(join(tmpdir(), 'wf-smoke-shape-'));
      try {
        const env = { ...process.env, GIT_AUTHOR_NAME: 'S', GIT_AUTHOR_EMAIL: 's@s.invalid', GIT_COMMITTER_NAME: 'S', GIT_COMMITTER_EMAIL: 's@s.invalid' };
        spawnSync('git', ['init', '--quiet'], { cwd: repo });
        const init = spawnSync(process.execPath, [DIST_CLI, 'init', '--template', template, '--format', 'json'], { cwd: repo, encoding: 'utf-8', env });
        expect(init.status).toBe(0);
        const memory = yamlLoad(readFileSync(join(repo, '.wingfoil', 'memory.yaml'), 'utf-8')) as {
          defaults: { states: unknown };
          types: Record<string, { states?: unknown }>;
        };
        expect(memory.defaults.states).toEqual({ sequence: ['draft', 'pending', 'approved'], gates: { pending: { reject: 'draft' } } });
        expect(Object.entries(memory.types).filter(([, t]) => t.states !== undefined)).toEqual([]);
        expect(Object.keys(memory.types)).toContain('task');
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it('fails the step that leaves the working tree dirty, not a later one', () => {
      const report = smokeWithFault('dirty@dna set');
      expect(report.ok).toBe(false);
      expect(lastCheck(report).label).toBe('[Scrum] wingfoil dna set project.name --value WingFoil smoke');
      expect(lastCheck(report).detail).toContain('working tree not clean');
      expect(lastCheck(report).detail).toContain('smoke-fault-stray.txt');
    });
  });

  describe('a step that depends on an earlier one (task-107 AC2/AC7) — against a stub wingfoil', () => {
    // A stub CLI: `memory add` prints an id (or none), `memory submit` obeys SMOKE_STUB. It writes nothing.
    const STUB = [
      'const [a, b] = process.argv.slice(1);',
      'const mode = process.env.SMOKE_STUB;',
      "if (a === 'memory' && b === 'add') {",
      "  console.log(JSON.stringify(mode === 'no-id' ? { path: 'p' } : { id: 'task-001-stub', path: 'p' }));",
      '  process.exit(0);',
      '}',
      "if (a === 'memory' && b === 'submit') {",
      "  if (mode === 'fail') { console.error('error: boom'); process.exit(1); }",
      "  console.log(JSON.stringify({ id: process.argv[3], from: 'draft', to: mode === 'wrong-edge' ? 'approved' : 'pending' }));",
      '  process.exit(0);',
      '}',
      'process.exit(9);',
    ].join('\n');
    const STEPS: Parameters<typeof smokeTemplate>[3] = [
      { args: ['memory', 'add', '--format', 'json'], exit: 0, json: true, capture: 'task' },
      { args: ['memory', 'submit', '{task.id}', '--format', 'json'], exit: 0, json: true, expect: { id: '{task.id}', from: 'draft', to: 'pending' } },
    ];
    const stub = (mode: string) =>
      smokeTemplate(
        'Stub',
        (args: readonly string[], cwd: string) => {
          const r = spawnSync(process.execPath, ['-e', STUB, '--', ...args], { cwd, encoding: 'utf-8', env: { ...process.env, SMOKE_STUB: mode } });
          return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
        },
        process.env,
        STEPS,
      );

    it('passes when submit reports draft -> pending, with the captured id in its argv and its expect', () => {
      const checks = stub('ok');
      expect(checks.filter((c) => !c.ok)).toEqual([]);
      expect(checks.map((c) => c.label)).toContain('[Stub] wingfoil memory submit task-001-stub --format json');
    });

    it('reports a failing submit as the failing check, with its code and reason, and stops there', () => {
      const checks = stub('fail');
      const last = checks[checks.length - 1];
      expect(last).toMatchObject({ label: '[Stub] wingfoil memory submit task-001-stub --format json', ok: false });
      expect(last?.detail).toContain('expected exit 0, got exit 1');
      expect(last?.detail).toContain('boom');
    });

    it('fails a submit that exits 0 on the wrong edge, naming what came back', () => {
      const checks = stub('wrong-edge');
      const last = checks[checks.length - 1];
      expect(last?.label).toBe('[Stub] wingfoil memory submit task-001-stub --format json');
      expect(last?.detail).toContain('expected to=pending, got to=approved');
    });

    it('fails, without spawning, when the placeholder cannot be resolved from the earlier output', () => {
      const checks = stub('no-id');
      const last = checks[checks.length - 1];
      expect(last?.label).toBe('[Stub] wingfoil memory submit {task.id} --format json');
      expect(last?.detail).toContain('{task.id}');
    });
  });

  describe('AC 4 (bug-134) — the report the gate declares under produces:', () => {
    const workflow = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'e2e-smoke.yaml'), 'utf-8')) as {
      version: number;
      description: string;
      phases: { name: string; description?: string; produces?: unknown[]; checks?: { post?: string[] } }[];
    };
    const bindings = yamlLoad(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8')) as {
      checks: Record<string, { run: string[]; severity?: string; args?: Record<string, string> }>;
    };
    const gate = workflow.phases.find((p) => p.name === 'gate');

    it('e2e-smoke.yaml is past 1.3, and its gate produces the report its check writes', () => {
      expect(workflow.version).toBeGreaterThan(1.3);
      expect(gate?.produces).toEqual([REPORT_PATH]);
      expect(gate?.checks?.post).toEqual([`e2e-smoke-passed(report: ${REPORT_PATH})`]);
    });

    it('the gate hard-rejects (dl-023): bound at severity reject, and no text still stages it as warn', () => {
      const bound = bindings.checks['e2e-smoke-passed'];
      expect(bound?.severity).toBe('reject');
      // task-219: `--candidate` binds the packed candidate and its stamp (test/cli/e2e-smoke-candidate.test.ts).
      expect(bound?.run).toEqual(['node', 'scripts/e2e-smoke.cjs', '--candidate', '--report', '{report}']);
      // The pattern judges the rendered path the engine passes, its `{…}` tokens filled in.
      expect(REPORT_PATH.replace(/\{[^}]+\}/g, 'v0.3')).toMatch(new RegExp(bound?.args?.report ?? '^$'));
      // Anything but a repository-relative path is refused (review F1): a shell fragment, an absolute
      // path, a `..` segment anywhere, an option.
      for (const bad of ['docs/x; rm -rf /', '/etc/passwd', '../../x.md', 'docs/../x.md', 'docs/..', '-rf', '--report']) {
        expect(bad).not.toMatch(new RegExp(bound?.args?.report ?? '^$'));
      }
      expect(`${workflow.description} ${gate?.description ?? ''}`).not.toMatch(/\bwarn\b/i);
    });

    it('parses --report beside the other options', () => {
      expect(parseSmokeArgs(['--report', 'out/r.md', '--expect-version', '0.3.0', '--', 'node', '/x/cli.js'])).toEqual({
        command: 'node',
        commandArgs: ['/x/cli.js'],
        expectedVersion: '0.3.0',
        reportPath: 'out/r.md',
      });
      expect(() => parseSmokeArgs(['--report'])).toThrow('--report');
    });

    it('formats a deterministic report: the same run gives the same bytes, with the verdict and every check', () => {
      const report = {
        ok: false,
        checks: [
          { label: 'wingfoil --help', ok: true, detail: 'exit 0' },
          { label: '[Scrum] wingfoil dna show | x', ok: false, detail: 'expected exit 0, got exit 1' },
        ],
      };
      const meta = { command: ['wingfoil'], expectedVersion: '0.3.0' };
      const text = formatReport(report, meta);
      expect(formatReport(report, meta)).toBe(text);
      expect(text).toContain('Result: **FAIL**');
      expect(text).toContain('[Scrum] wingfoil dna show \\| x');
      expect(text).toContain('expected exit 0, got exit 1');
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(formatReport({ ok: true, checks: [report.checks[0]!] }, meta)).toContain('Result: **PASS** (1/1 checks ok)');
    });

    it('the script writes the report on a failing run too, creating its folder, and still exits 1', () => {
      const dir = mkdtempSync(join(tmpdir(), 'wf-smoke-report-'));
      try {
        const path = join(dir, 'nested', 'report.md');
        const run = spawnSync(process.execPath, [SCRIPT, '--report', path, '--', process.execPath, '-e', 'process.exit(3)', '--'], {
          encoding: 'utf-8',
        });
        expect(run.status).toBe(1);
        expect(existsSync(path)).toBe(true);
        const text = readFileSync(path, 'utf-8');
        expect(text).toContain('Result: **FAIL**');
        expect(text).toContain('wingfoil --help');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
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
    const versionCheck = (report: Report) => report.checks.find((c) => c.label.startsWith('wingfoil --version'));

    it('passes the version check when --version is exactly <version> (<expected sha>)', () => {
      // The scenario after it needs a real CLI (task-207): against this stub only the stamp is judged.
      const report = smokeWith(`0.3.0 (${SHA})`, SHA);
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
      const cli = (args: string[]) =>
        spawnSync(process.execPath, [SCRIPT, ...args, '--', process.execPath, '-e', STAMP_STUB, '--'], {
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

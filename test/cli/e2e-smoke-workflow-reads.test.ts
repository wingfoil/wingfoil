/**
 * task-327 (`bug-404`) — the e2e-smoke report states the `workflow list / show / status` reads it ran on the
 * candidate repository, and the three reads gate the smoke (approver rulings of the design gate, 2026-10-31:
 * D1 (b) the reads gate, D2 yes the gate description names them, D3 (a) they run after `--help` / `--version`
 * and before the templates, D4 yes a `--repository <path>` flag).
 *
 * The declarations are local (`require` + a typed shape), like `e2e-smoke-candidate.test.ts`: the new exports
 * are not in `scripts/e2e-smoke.d.cts` yet, so the tests fail at run time (`workflowReads is not a function`,
 * a missing section, an unknown argument) and do not break the repository typecheck gate.
 *
 * Fixtures (`test/fixtures/workflow-reads/`) are copies of real command output, trimmed where said:
 * - `repo-list.json` — `node dist/cli.js workflow list --all --format json` in this repository, trimmed to two of
 *   its 27 workflows (`adr-ingest`, `agent-docs`) and its first two (of 65) diagnostics, verbatim;
 * - `repo-show-adr-ingest.json`, `repo-show-agent-docs.json` — `workflow show <name> --format json`, the
 *   `workflow` object's `phases` emptied and the diagnostics cut to the same two;
 * - `scrum-status.json` — `workflow status --format json` in a fresh `wingfoil init --template Scrum` project, verbatim;
 * - `show-nope.stderr` — stderr of `workflow show nope --format json` (exit 1, empty stdout), verbatim;
 * - `broken-config.stderr` — stderr of `workflow list --all --format json` (exit 1, empty stdout) in that project
 *   after a commit adding `distinct_from: [nope]` to a phase of `.wingfoil/workflows/custom/scrum-delivery.yaml`;
 * - `list-help.stdout.txt` — stdout of `workflow list --help` (exit 0), a real answer that is not JSON.
 * A successful command writes nothing to stderr (`workflow list --all --format json` → 0 bytes), which is why the
 * ok answers below carry an empty stderr.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'e2e-smoke.cjs');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'workflow-reads');

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
type Run = { status: number | null; stdout: string; stderr: string };
type Invoke = (args: readonly string[], cwd: string) => Run;
interface Read {
  exit: number | null;
  diagnostics: number | null;
  errors: number | null;
}
interface Reads {
  list?: Read & { workflows: number | null; codes: { code: string; severity: string; count: number }[] };
  show?: (Read & { name: string })[];
  status?: Read & { open: number | null; pendingApprovals: number | null; ungated: number | null; ungatedRoutedTo: number | null };
}
interface SmokeReport {
  ok: boolean;
  checks: Check[];
  workflowReads?: Reads;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const smoke = require('../../scripts/e2e-smoke.cjs') as {
  workflowReads: (invoke: Invoke, root: string) => { checks: Check[]; reads: Reads };
  formatReport: (report: SmokeReport, meta: { command: readonly string[] }) => string;
  parseSmokeArgs: (argv: readonly string[]) => Record<string, unknown>;
  runSmoke: (options: Record<string, unknown>) => SmokeReport;
};

const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');
const answer = (status: number, stdout: string, stderr: string): Run => ({ status, stdout, stderr });

/** A fake `invoke` that answers each `workflow …` read from `table` (key: the args after `workflow`, space-joined). */
function fake(table: Record<string, Run>, seen: string[] = []): Invoke {
  return (args) => {
    seen.push(args.join(' '));
    const key = args.slice(1).join(' ');
    const found = table[key];
    if (found === undefined) throw new Error(`unexpected read: ${args.join(' ')}`);
    return found;
  };
}

const LIST = 'list --all --format json';
const STATUS = 'status --format json';
const show = (name: string): string => `show ${name} --format json`;
const repoShow = (name: string): string => fixture(`repo-show-${name}.json`);

describe('task-327 — workflowReads(invoke, root)', () => {
  describe('on the compiled CLI in a fresh `init --template Scrum` project (AC 1)', () => {
    let project: string;
    const cli: Invoke = (args, cwd) => spawnCapture(process.execPath, [CLI_ENTRY, ...args], { cwd });

    beforeAll(() => {
      project = mkdtempSync(join(tmpdir(), 'wf-reads-'));
      for (const args of [
        ['init', '--quiet', '--initial-branch=main'],
        ['config', 'user.name', 'WingFoil Test'],
        ['config', 'user.email', 'wf-test@example.invalid'],
        ['config', 'commit.gpgsign', 'false'],
      ]) {
        expect(spawnCapture('git', args, { cwd: project }).status).toBe(0);
      }
      expect(cli(['init', '--template', 'Scrum'], project).status).toBe(0);
    });
    afterAll(() => rmSync(project, { recursive: true, force: true }));

    it('records three ok checks with the labels and details of the design, and the counts in `reads`', () => {
      const names = (JSON.parse(cli(['workflow', 'list', '--all', '--format', 'json'], project).stdout) as { workflows: { name: string }[] }).workflows.map(
        (w) => w.name,
      );
      expect(names.length).toBeGreaterThan(0);
      const n = names.length;

      const { checks, reads } = smoke.workflowReads(cli, project);
      expect(checks.map((c) => c.label)).toEqual([
        '[repository] wingfoil workflow list --all --format json',
        `[repository] wingfoil workflow show <name> --format json, each of the ${n}`,
        '[repository] wingfoil workflow status --format json',
      ]);
      expect(checks.every((c) => c.ok)).toBe(true);
      expect(checks.map((c) => c.detail)).toEqual([
        `exit 0, ${n} workflows, 0 diagnostics, 0 errors`,
        `exit 0 (${n}/${n}), 0 errors`,
        'exit 0, open 0, pendingApprovals 0, ungated 0, 0 errors',
      ]);
      expect(reads.list).toEqual({ exit: 0, workflows: n, diagnostics: 0, errors: 0, codes: [] });
      expect((reads.show ?? []).map((s) => s.name)).toEqual(names);
      expect(reads.show?.every((s) => s.exit === 0 && s.diagnostics === 0 && s.errors === 0)).toBe(true);
      expect(reads.status).toEqual({ exit: 0, diagnostics: 0, errors: 0, open: 0, pendingApprovals: 0, ungated: 0, ungatedRoutedTo: 0 });
    });
  });

  describe('through a fake invoke answering with real output (AC 1)', () => {
    const okTable = (): Record<string, Run> => ({
      [LIST]: answer(0, fixture('repo-list.json'), ''),
      [show('adr-ingest')]: answer(0, repoShow('adr-ingest'), ''),
      [show('agent-docs')]: answer(0, repoShow('agent-docs'), ''),
      [STATUS]: answer(0, fixture('scrum-status.json'), ''),
    });

    it('runs list, then every show in the list order, then status, from the given root', () => {
      const seen: string[] = [];
      const cwds: string[] = [];
      const table = okTable();
      const invoke: Invoke = (args, cwd) => {
        cwds.push(cwd);
        return fake(table, seen)(args, cwd);
      };
      const { checks, reads } = smoke.workflowReads(invoke, '/some/repository');
      expect(seen).toEqual([
        'workflow list --all --format json',
        'workflow show adr-ingest --format json',
        'workflow show agent-docs --format json',
        'workflow status --format json',
      ]);
      expect(new Set(cwds)).toEqual(new Set(['/some/repository']));
      expect(checks.map((c) => c.detail)).toEqual([
        'exit 0, 2 workflows, 2 diagnostics, 0 errors',
        'exit 0 (2/2), 0 errors',
        'exit 0, open 0, pendingApprovals 0, ungated 0, 0 errors',
      ]);
      expect(reads.list?.codes).toEqual([{ code: 'W_WORKFLOW_UNBOUND_TOKEN', severity: 'warning', count: 2 }]);
    });

    it('fails the list check on a broken configuration (exit 1, the CLI error on stderr) and runs nothing after it', () => {
      const seen: string[] = [];
      const { checks, reads } = smoke.workflowReads(fake({ [LIST]: answer(1, '', fixture('broken-config.stderr')) }, seen), '/r');
      expect(checks).toHaveLength(1);
      expect(checks[0]).toEqual({
        label: '[repository] wingfoil workflow list --all --format json',
        ok: false,
        detail:
          'expected exit 0, got exit 1: {"error":"E_PHASE_DISTINCT_FROM_UNKNOWN phases[1].distinct_from[0] (workflows/custom/scrum-delivery.yaml): distinct_from phase \'nope\' not found in workflow"}',
      });
      expect(seen).toEqual(['workflow list --all --format json']);
      expect(reads.list).toEqual({ exit: 1, workflows: null, diagnostics: null, errors: null, codes: [] });
      expect(reads.show).toBeUndefined();
      expect(reads.status).toBeUndefined();
    });

    it('fails the list check when stdout is not JSON', () => {
      const { checks, reads } = smoke.workflowReads(fake({ [LIST]: answer(0, fixture('list-help.stdout.txt'), '') }), '/r');
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ ok: false, detail: 'stdout is not valid JSON' });
      expect(reads.list).toMatchObject({ exit: 0, workflows: null, diagnostics: null, errors: null });
      expect(reads.show).toBeUndefined();
    });

    it('fails the list check on an error-severity diagnostic, naming it with the singular `1 error`', () => {
      // No real exit-0 answer carries an error-severity diagnostic (the CLI refuses such a configuration with exit 1,
      // see broken-config.stderr), so this one is built from that real refusal: its code, file, path and message,
      // with `severity: 'error'` (`DiagnosticSeverity`, src/validation/diagnostic.ts), inside the real list shape.
      const list = JSON.parse(fixture('repo-list.json')) as { diagnostics: unknown[] };
      const refusal = JSON.parse(fixture('broken-config.stderr')) as { error: string };
      list.diagnostics = [
        {
          code: 'E_PHASE_DISTINCT_FROM_UNKNOWN',
          severity: 'error',
          file: 'workflows/custom/scrum-delivery.yaml',
          path: 'phases[1].distinct_from[0]',
          message: refusal.error.split(': ').slice(1).join(': '),
        },
      ];
      const { checks, reads } = smoke.workflowReads(fake({ [LIST]: answer(0, JSON.stringify(list), '') }), '/r');
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ ok: false, detail: '1 error: E_PHASE_DISTINCT_FROM_UNKNOWN 1' });
      expect(reads.list).toMatchObject({
        exit: 0,
        workflows: 2,
        diagnostics: 1,
        errors: 1,
        codes: [{ code: 'E_PHASE_DISTINCT_FROM_UNKNOWN', severity: 'error', count: 1 }],
      });
      expect(reads.show).toBeUndefined();
      expect(reads.status).toBeUndefined();
    });

    it('fails the show check at the first refused workflow, prefixed by its name, and does not run status', () => {
      const table = okTable();
      table[show('agent-docs')] = answer(1, '', fixture('show-nope.stderr'));
      const { checks, reads } = smoke.workflowReads(fake(table), '/r');
      expect(checks).toHaveLength(2);
      expect(checks[1]).toEqual({
        label: '[repository] wingfoil workflow show <name> --format json, each of the 2',
        ok: false,
        detail: 'agent-docs: expected exit 0, got exit 1: {"error":"unknown workflow: nope"}',
      });
      expect(reads.show).toHaveLength(2);
      expect(reads.show?.[1]).toEqual({ name: 'agent-docs', exit: 1, diagnostics: null, errors: null });
      expect(reads.status).toBeUndefined();
    });

    it('fails the status check on a non-zero exit', () => {
      const table = okTable();
      table[STATUS] = answer(1, '', fixture('broken-config.stderr'));
      const { checks, reads } = smoke.workflowReads(fake(table), '/r');
      expect(checks).toHaveLength(3);
      expect(checks[2]).toMatchObject({ label: '[repository] wingfoil workflow status --format json', ok: false });
      expect(checks[2]?.detail).toMatch(/^expected exit 0, got exit 1: \{"error":"E_PHASE_DISTINCT_FROM_UNKNOWN /);
      expect(reads.status).toMatchObject({ exit: 1, open: null, pendingApprovals: null, ungated: null, ungatedRoutedTo: null });
    });
  });
});

describe('task-327 — formatReport writes the workflow reads section (AC 1)', () => {
  const meta = { command: ['wingfoil'] };
  const base: SmokeReport = { ok: true, checks: [{ label: 'wingfoil --help', ok: true, detail: 'exit 0' }] };

  // The figures of `workflow list --all --format json`, `workflow show <name> --format json` for each of its 27
  // workflows and `workflow status --format json` run in this repository at the start of the task (65 diagnostics,
  // all W_WORKFLOW_UNBOUND_TOKEN warnings; status: 3 open, 1 pending approval, 33 ungated, 1 routed).
  const names = [
    'adr-ingest', 'agent-docs', 'backlog-export', 'bug-ingest', 'decision-log-ingest', 'dev-loop', 'e2e-smoke', 'end-of-life',
    'initial-design', 'lean-inception', 'release-cycle', 'release-health', 'release-line-cycle', 'release-planning',
    'release-publishing', 'release-submit', 'retrospective', 'service-ingest', 'specification-by-examples',
    'specification-downcast', 'sw-life-cycle', 'user-docs', 'user-story-mapping', 'vision-change', 'volere-requirements',
    'wave', 'wingfoil-init',
  ];
  const withReads: SmokeReport = {
    ...base,
    workflowReads: {
      list: { exit: 0, workflows: 27, diagnostics: 65, errors: 0, codes: [{ code: 'W_WORKFLOW_UNBOUND_TOKEN', severity: 'warning', count: 65 }] },
      show: names.map((name) => ({ name, exit: 0, diagnostics: 65, errors: 0 })),
      status: { exit: 0, diagnostics: 65, errors: 0, open: 3, pendingApprovals: 1, ungated: 33, ungatedRoutedTo: 1 },
    },
  };
  const SECTION = [
    '## Repository checks on the candidate (workflow reads)',
    '',
    'Written by `scripts/e2e-smoke.cjs` (`bug-404`): the build under test runs each read in the repository the smoke was given (`--repository`; the checkout under `--candidate`).',
    '',
    '| Command | Exit | Result |',
    '|---|---|---|',
    '| `wingfoil workflow list --all --format json` | 0 | 27 workflows; 65 diagnostics, **0 errors**: `W_WORKFLOW_UNBOUND_TOKEN` 65 (warning) |',
    '| `wingfoil workflow show <name> --format json`, each of the 27 | 0 (27/27) | **0 errors** each; 65 diagnostics each |',
    '| `wingfoil workflow status --format json` | 0 | `open` 3, `pendingApprovals` 1, `ungated` 33, `ungatedRoutedTo` 1, `diagnostics` 65, **0 errors** |',
  ].join('\n');

  it('writes the section after the checks table, with the exact heading, intro, header and three rows', () => {
    const text = smoke.formatReport(withReads, meta);
    const lastRow = '| 1 | ok | wingfoil --help | exit 0 |';
    expect(text).toContain(`${lastRow}\n\n${SECTION}`);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('## Repository checks')).toBeGreaterThan(text.indexOf(lastRow));
  });

  it('gives the same bytes for the same input', () => {
    const text = smoke.formatReport(withReads, meta);
    expect(text).toContain(SECTION);
    expect(smoke.formatReport(structuredClone(withReads), meta)).toBe(text);
  });

  it('is unchanged without workflowReads: no section, and it still ends with the checks table (characterization)', () => {
    const text = smoke.formatReport(base, meta);
    expect(text).not.toContain('Repository checks');
    expect(text.endsWith('| 1 | ok | wingfoil --help | exit 0 |\n')).toBe(true);
  });

  describe('through workflowReads on real answers: failures, edges', () => {
    const rows = (reads: Reads): string[] =>
      smoke
        .formatReport({ ...base, workflowReads: reads }, meta)
        .split('\n')
        .filter((line) => line.startsWith('| `wingfoil workflow'));

    it('renders `<k>/<N> exit 0` for a refused show, then `not run` for status after the stop', () => {
      const table: Record<string, Run> = {
        [LIST]: answer(0, fixture('repo-list.json'), ''),
        [show('adr-ingest')]: answer(0, repoShow('adr-ingest'), ''),
        [show('agent-docs')]: answer(1, '', fixture('show-nope.stderr')),
      };
      const { reads } = smoke.workflowReads(fake(table), '/r');
      const lines = rows(reads);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('| `wingfoil workflow list --all --format json` | 0 | 2 workflows; 2 diagnostics, **0 errors**: `W_WORKFLOW_UNBOUND_TOKEN` 2 (warning) |');
      expect(lines[1]).toMatch(/^\| `wingfoil workflow show <name> --format json`, each of the 2 \| 1\/2 exit 0 \| /);
      expect(lines[2]).toBe('| `wingfoil workflow status --format json` | — | not run: the smoke stopped at an earlier check |');
    });

    it('renders `<min>–<max> diagnostics` when the shows differ', () => {
      const shorter = JSON.parse(repoShow('agent-docs')) as { diagnostics: unknown[] };
      shorter.diagnostics = shorter.diagnostics.slice(0, 1); // the same real answer with one diagnostic fewer
      const table: Record<string, Run> = {
        [LIST]: answer(0, fixture('repo-list.json'), ''),
        [show('adr-ingest')]: answer(0, repoShow('adr-ingest'), ''),
        [show('agent-docs')]: answer(0, JSON.stringify(shorter), ''),
        [STATUS]: answer(0, fixture('scrum-status.json'), ''),
      };
      const { reads } = smoke.workflowReads(fake(table), '/r');
      expect(rows(reads)[1]).toBe('| `wingfoil workflow show <name> --format json`, each of the 2 | 0 (2/2) | **0 errors** each; 1–2 diagnostics |');
    });

    it('renders a list with no diagnostics without a colon, and the status counts from the fresh Scrum answer', () => {
      const scrum = { exit: 0, diagnostics: 0, errors: 0 };
      const text = rows({
        list: { ...scrum, workflows: 5, codes: [] },
        show: [{ name: 'adr-ingest', ...scrum }],
        status: { ...scrum, open: 0, pendingApprovals: 0, ungated: 0, ungatedRoutedTo: 0 },
      });
      expect(text[0]).toBe('| `wingfoil workflow list --all --format json` | 0 | 5 workflows; 0 diagnostics, **0 errors** |');
      expect(text[2]).toBe(
        '| `wingfoil workflow status --format json` | 0 | `open` 0, `pendingApprovals` 0, `ungated` 0, `ungatedRoutedTo` 0, `diagnostics` 0, **0 errors** |',
      );
    });

    it('renders `stdout is not valid JSON` for a list whose stdout is not JSON, and `not run` for show and status', () => {
      const { reads } = smoke.workflowReads(fake({ [LIST]: answer(0, fixture('list-help.stdout.txt'), '') }), '/r');
      const lines = rows(reads);
      expect(lines[0]).toBe('| `wingfoil workflow list --all --format json` | 0 | stdout is not valid JSON |');
      expect(lines[1]).toBe('| `wingfoil workflow show <name> --format json` | — | not run: the smoke stopped at an earlier check |');
      expect(lines[2]).toBe('| `wingfoil workflow status --format json` | — | not run: the smoke stopped at an earlier check |');
    });

    it('renders the singular `1 diagnostic, **1 error**` with the error code, and `not run` after it', () => {
      const { reads } = smoke.workflowReads(
        fake({
          [LIST]: answer(
            0,
            JSON.stringify({
              workflows: [{ name: 'adr-ingest' }],
              diagnostics: [{ code: 'E_PHASE_DISTINCT_FROM_UNKNOWN', severity: 'error', file: 'workflows/custom/scrum-delivery.yaml', path: 'phases[1].distinct_from[0]', message: "distinct_from phase 'nope' not found in workflow" }],
            }),
            '',
          ),
        }),
        '/r',
      );
      const lines = rows(reads);
      expect(lines[0]).toBe('| `wingfoil workflow list --all --format json` | 0 | 1 workflow; 1 diagnostic, **1 error**: `E_PHASE_DISTINCT_FROM_UNKNOWN` 1 (error) |');
      expect(lines[1]).toContain('not run: the smoke stopped at an earlier check');
    });
  });
});

describe('task-327 — runSmoke with `repository` (D1 (b), D3 (a), D4)', () => {
  /** A stub `wingfoil`: `--help`, the three reads from the fixtures, anything else exits 1. */
  const STUB = [
    "const fs = require('fs'); const path = require('path');",
    'const a = process.argv.slice(1);',
    "const fx = (n) => fs.readFileSync(path.join(process.env.READS_FIXTURES, n), 'utf-8');",
    "if (a[0] === '--help') { console.log('Usage: wingfoil'); process.exit(0); }",
    "if (a[0] === 'workflow' && a[1] === 'list') { process.stdout.write(fx('repo-list.json')); process.exit(0); }",
    "if (a[0] === 'workflow' && a[1] === 'show') { process.stdout.write(fx('repo-show-' + a[2] + '.json')); process.exit(0); }",
    "if (a[0] === 'workflow' && a[1] === 'status') { process.stdout.write(fx('scrum-status.json')); process.exit(0); }",
    "console.error('error: stub'); process.exit(1);",
  ].join('\n');
  const env = { ...process.env, READS_FIXTURES: FIXTURES };

  it('runs the three reads right after --help and before the first template, and returns workflowReads', () => {
    const report = smoke.runSmoke({ command: process.execPath, commandArgs: ['-e', STUB, '--'], env, repository: FIXTURES });
    expect(report.checks.slice(0, 5).map((c) => c.label)).toEqual([
      'wingfoil --help',
      '[repository] wingfoil workflow list --all --format json',
      '[repository] wingfoil workflow show <name> --format json, each of the 2',
      '[repository] wingfoil workflow status --format json',
      '[Scrum] wingfoil init --template Scrum',
    ]);
    expect(report.checks.slice(1, 4).every((c) => c.ok)).toBe(true);
    expect(report.checks[4]?.ok).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.checks).toHaveLength(5);
    expect(report.workflowReads?.list).toMatchObject({ exit: 0, workflows: 2, diagnostics: 2, errors: 0 });
    expect(report.workflowReads?.show?.map((s) => s.name)).toEqual(['adr-ingest', 'agent-docs']);
  });

  it('adds no [repository] check and no workflowReads key without `repository` (the staging smoke is unchanged)', () => {
    const report = smoke.runSmoke({ command: process.execPath, commandArgs: ['-e', STUB, '--'], env });
    expect(report.checks.map((c) => c.label)).toEqual(['wingfoil --help', '[Scrum] wingfoil init --template Scrum']);
    expect('workflowReads' in report).toBe(false);
  });

  it('stops at a failing read, before any template', () => {
    const failing = STUB.replace("a[1] === 'status') {", "a[1] === 'status') { console.error('error: stub status'); process.exit(1); } if (false) {");
    const report = smoke.runSmoke({ command: process.execPath, commandArgs: ['-e', failing, '--'], env, repository: FIXTURES });
    expect(report.ok).toBe(false);
    expect(report.checks.map((c) => c.label)).toEqual([
      'wingfoil --help',
      '[repository] wingfoil workflow list --all --format json',
      '[repository] wingfoil workflow show <name> --format json, each of the 2',
      '[repository] wingfoil workflow status --format json',
    ]);
    expect(report.checks[3]?.detail).toBe('expected exit 0, got exit 1: error: stub status');
  });

  describe('the script end to end (--repository, --report)', () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'wf-reads-cli-'));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('exits 1 at the template and writes the section with the list row to --report', () => {
      const reportPath = join(dir, 'out', 'r.md');
      mkdirSync(join(dir, 'out'), { recursive: true });
      const run = spawnSync(process.execPath, [SCRIPT, '--repository', FIXTURES, '--report', reportPath, '--', process.execPath, '-e', STUB, '--'], {
        encoding: 'utf-8',
        env,
      });
      expect(run.status).toBe(1);
      const text = readFileSync(reportPath, 'utf-8');
      expect(text).toContain('## Repository checks on the candidate (workflow reads)');
      expect(text).toContain('| `wingfoil workflow list --all --format json` | 0 | 2 workflows; 2 diagnostics, **0 errors**: `W_WORKFLOW_UNBOUND_TOKEN` 2 (warning) |');
    });
  });
});

describe('task-327 — parseSmokeArgs --repository (D4)', () => {
  it('stores the path as `repository`, and adds no key without the flag', () => {
    expect(smoke.parseSmokeArgs(['--repository', '/x/repo'])).toEqual({ command: 'wingfoil', commandArgs: [], repository: '/x/repo' });
    expect(smoke.parseSmokeArgs([])).toEqual({ command: 'wingfoil', commandArgs: [] });
  });

  it('refuses --repository without a value', () => {
    expect(smoke.parseSmokeArgs(['--repository', '/x'])).toMatchObject({ repository: '/x' });
    expect(() => smoke.parseSmokeArgs(['--repository'])).toThrow('--repository');
  });

  it('parses beside --candidate', () => {
    expect(smoke.parseSmokeArgs(['--candidate', '--repository', '/x'])).toEqual({
      command: 'wingfoil',
      commandArgs: [],
      candidate: true,
      repository: '/x',
    });
  });
});

describe('task-327 — e2e-smoke.yaml names the reads (D2)', () => {
  const raw = readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'e2e-smoke.yaml'), 'utf-8');
  const workflow = yamlLoad(raw) as { version: number; phases: { name: string; description?: string }[] };
  const gate = workflow.phases.find((p) => p.name === 'gate');

  it('is at least 1.9, with a history entry for task-327 (bug-314)', () => {
    expect(workflow.version).toBeGreaterThanOrEqual(1.9);
    expect(raw).toMatch(/1\.9 [^;]*task-327/);
  });

  it('has a gate description that names the reads, keeps --candidate and dist/, and does not say "warn"', () => {
    expect(gate?.description).toContain('workflow show');
    expect(gate?.description).toContain('workflow status');
    expect(gate?.description).toContain('--candidate');
    expect(gate?.description).toContain('dist/');
    expect(gate?.description).not.toMatch(/\bwarn\b/i);
  });
});

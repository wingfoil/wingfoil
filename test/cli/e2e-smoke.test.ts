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
 *
 * task-243 (spec-016 §2.7, dl-023, dl-099): after each template's scenario the smoke runs one adhoc
 * `agent execute` through the fake adapter `custom/fake` in its own fresh `init` project, then re-loads
 * what it wrote (`agent show`, `agent list --past`) and probes the record commit and the fake's own record.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import {
  AGENT_FIXTURES,
  SMOKE_TEMPLATES,
  agentRunSteps,
  formatReport,
  parseSmokeArgs,
  runSmoke,
  smokeAgentRun,
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
    // task-243 AC 1 (c): per template, the agent run's block follows that template's scenario and
    // precedes the next template's first check (one full run: no second one is added).
    SMOKE_TEMPLATES.forEach((template, i) => {
      expect(labels).toContain(`[${template}/agent] wingfoil agent execute --element task:task-001-agent-run --role developer`);
      const block = labels.flatMap((l, j) => (l.startsWith(`[${template}/agent] `) ? [j] : []));
      expect(block.length).toBeGreaterThan(0);
      expect(block[block.length - 1]! - block[0]! + 1).toBe(block.length);
      expect(block[0]!).toBeGreaterThan(labels.map((l) => l.startsWith(`[${template}] `)).lastIndexOf(true));
      const next = SMOKE_TEMPLATES[i + 1];
      if (next !== undefined) expect(block[block.length - 1]!).toBeLessThan(labels.findIndex((l) => l.startsWith(`[${next}] `)));
    });
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

    it.each(SMOKE_TEMPLATES)('[%s] a fresh init declares one machine shape for the verbs, `defaults`, so one task per verb covers it', (template) => {
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
        // `plan` (task-217) has its own machine, `draft → active → done`: `workflow start` / `end` drive it,
        // not the transition verbs this scenario runs, so it is the one declared exception.
        expect(Object.entries(memory.types).filter(([, t]) => t.states !== undefined)).toEqual([
          ['plan', expect.objectContaining({ states: { sequence: ['draft', 'active', 'done'], waiting: ['active'] } })],
        ]);
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
   * task-243 — the agent run (spec-016 §2.7 last bullet; dl-023; dl-099). Its scenario is data
   * (`agentRunSteps`), run by `smokeAgentRun` in its own fresh `init` project per template, after that
   * template's scenario (approver ruling D1). The run id is derived, `{agent.id}/adhoc/1` (D6).
   */
  describe('task-243 — the e2e-smoke gate drives `agent execute` through the fake adapter', () => {
    const RUN = 'task-001-agent-run/adhoc/1';
    const EXECUTE_LABEL = '[Scrum/agent] wingfoil agent execute --element task:task-001-agent-run --role developer';
    const RECORD_LABEL = `[Scrum/agent] one agent: record commit for ${RUN}`;
    const SHOW_LABEL = `[Scrum/agent] wingfoil agent show ${RUN} --format json`;
    const LIST_LABEL = '[Scrum/agent] wingfoil agent list --past --format json';
    const READ_LABEL = `[Scrum/agent] the fake agent read the session Resource for ${RUN}`;
    const COPY_LABEL = '[Scrum/agent] commit .wingfoil/agents/custom/fake.yaml, test/fixtures/agents/fake-agent.cjs';

    type AgentStep = ReturnType<typeof agentRunSteps>[number];
    type Check = ReturnType<typeof smokeAgentRun>[number];

    /** `dist/cli.js` driven directly, the shape `smokeAgentRun`'s `invoke` takes. */
    const invoke = (args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
      const r = spawnSync(process.execPath, [DIST_CLI, ...args], { cwd, env, encoding: 'utf-8' });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    };
    const argsOf = (step: AgentStep): readonly string[] | undefined => ('args' in step ? step.args : undefined);
    const isExecute = (step: AgentStep) => argsOf(step)?.slice(0, 2).join(' ') === 'agent execute';
    const indexOf = (steps: readonly AgentStep[], match: (s: AgentStep) => boolean) => steps.findIndex(match);
    const last = (checks: readonly Check[]) => checks[checks.length - 1];

    /** The run on `dist/cli.js`, once for the positive pins; `undefined` while `smokeAgentRun` does not exist. */
    let scrum: Check[] | undefined;
    beforeAll(() => {
      scrum = typeof smokeAgentRun === 'function' ? smokeAgentRun('Scrum', invoke, process.env) : undefined;
    });

    describe('AC 1 — init, the fake adapter under agents/custom/, the agent entry, `agent execute`: exit 0, one record commit, `agent show` exit 0', () => {
      it('the fixtures are the checkout\'s test/fixtures/agents', () => {
        expect(AGENT_FIXTURES).toBe(join(REPO_ROOT, 'test', 'fixtures', 'agents'));
      });

      it.each(SMOKE_TEMPLATES)('[%s] the scenario as data: init, memory add, the fake adapter, the agent entry, execute, then its probes and readers', (template) => {
        expect(typeof agentRunSteps).toBe('function');
        const steps = agentRunSteps(template);
        expect(argsOf(steps[0]!)).toEqual(['init', '--template', template]);
        expect(steps).toContainEqual(
          expect.objectContaining({
            args: ['memory', 'add', '--type', 'task', '--title', 'Agent run', '--format', 'json'],
            exit: 0,
            json: true,
            capture: 'agent',
            expect: { path: 'docs/memory/task/{agent.id}.md' },
          }),
        );
        expect(steps).toContainEqual({
          copy: [
            ['custom/fake.yaml', '.wingfoil/agents/custom/fake.yaml'],
            ['fake-agent.cjs', 'test/fixtures/agents/fake-agent.cjs'],
          ],
          commit: 'smoke: the fake adapter custom/fake (spec-016 §2.7)',
        });
        expect(steps).toContainEqual(
          expect.objectContaining({
            args: ['dna', 'add', 'team.agents', '--value', 'Fake Agent', '--entry-email', 'fake-agent@example.com', '--entry-executes_as', 'developer', '--entry-adapter', 'fake'],
            exit: 0,
          }),
        );
        const execute = indexOf(steps, isExecute);
        expect(steps[execute]).toMatchObject({
          args: ['agent', 'execute', '--element', 'task:{agent.id}', '--role', 'developer'],
          exit: 0,
          fakeAgent: true,
        });
        const record = indexOf(steps, (s) => 'probe' in s && s.probe === 'record-commit');
        expect(steps[record]).toMatchObject({ probe: 'record-commit', run: '{agent.id}/adhoc/1' });
        expect(record).toBeGreaterThan(execute);
        const show = indexOf(steps, (s) => argsOf(s)?.slice(0, 2).join(' ') === 'agent show');
        expect(show).toBeGreaterThan(record);
        // `agent execute` is the last writer: every step after it is a reader or a probe (bug-133's rule).
        const writers = steps.map((s) => 'copy' in s || (argsOf(s) !== undefined && ['init', 'memory add', 'dna add', 'agent execute'].includes(argsOf(s)![0] === 'init' ? 'init' : argsOf(s)!.slice(0, 2).join(' '))));
        expect(writers.lastIndexOf(true)).toBe(execute);
      });

      it('[Scrum] passes on the compiled CLI, every check labelled [Scrum/agent], the tree clean after every CLI and copy step', () => {
        expect(typeof smokeAgentRun).toBe('function');
        const checks = scrum ?? [];
        expect(checks.filter((c) => !c.ok)).toEqual([]);
        const labels = checks.map((c) => c.label);
        for (const label of labels) expect(label.startsWith('[Scrum/agent] ')).toBe(true);
        expect(labels).toContain(COPY_LABEL);
        expect(labels).toContain(EXECUTE_LABEL);
        expect(labels).toContain(RECORD_LABEL);
        expect(labels).toContain(SHOW_LABEL);
        const cliOrCopy = checks.filter((c) => c.label.startsWith('[Scrum/agent] wingfoil ') || c.label.startsWith('[Scrum/agent] commit '));
        expect(cliOrCopy.length).toBeGreaterThan(0);
        for (const check of cliOrCopy) expect(check.detail.endsWith('tree clean')).toBe(true);
      });

      it.each([
        ['twice', 'found 2'],
        ['not at all', 'found 0'],
      ])('[Scrum] fails the record-commit probe when `agent execute` runs %s ("exactly one")', (how, found) => {
        expect(typeof smokeAgentRun).toBe('function');
        const steps = agentRunSteps('Scrum');
        const execute = indexOf(steps, isExecute);
        const changed = how === 'twice'
          ? [...steps.slice(0, execute + 1), steps[execute]!, ...steps.slice(execute + 1)]
          : [...steps.slice(0, execute), ...steps.slice(execute + 1)];
        const checks = smokeAgentRun('Scrum', invoke, process.env, changed);
        expect(last(checks)).toMatchObject({ label: RECORD_LABEL, ok: false });
        expect(last(checks)?.detail).toContain(found);
      });

      it('[Scrum] fails `agent execute` on a wrong exit, naming both codes, and stops there', () => {
        const report = smokeWithFault('exit=1@agent execute');
        expect(report.ok).toBe(false);
        expect(lastCheck(report)).toMatchObject({ label: EXECUTE_LABEL, ok: false });
        expect(lastCheck(report).detail).toContain('expected exit 0, got exit 1');
      });
    });

    describe('AC 2 — outcomes beyond exit 0: the record\'s adapter, the id in `agent list --past`, the Resource read', () => {
      it.each(SMOKE_TEMPLATES)('[%s] agent show and agent list --past assert what was recorded', (template) => {
        expect(typeof agentRunSteps).toBe('function');
        const steps = agentRunSteps(template);
        expect(steps).toContainEqual(
          expect.objectContaining({
            args: ['agent', 'show', '{agent.id}/adhoc/1', '--format', 'json'],
            exit: 0,
            json: true,
            expect: {
              'run.id': '{agent.id}/adhoc/1',
              'run.element': 'task:{agent.id}',
              'run.role': 'developer',
              'run.agent': 'Fake Agent',
              'run.adapter': 'custom/fake',
              'run.exit_status': 0,
            },
          }),
        );
        expect(steps).toContainEqual(
          expect.objectContaining({
            args: ['agent', 'list', '--past', '--format', 'json'],
            exit: 0,
            json: true,
            expect: { 'past.length': 1, 'past.0.id': '{agent.id}/adhoc/1', 'past.0.adapter': 'custom/fake', 'diagnostics.length': 0 },
          }),
        );
        expect(steps).toContainEqual({ probe: 'fake-read', run: '{agent.id}/adhoc/1', role: 'developer' });
      });

      it('[Scrum] the run log is re-loaded: a corrupted record passes execute and the probe, and fails at agent show', () => {
        const report = smokeWithFault('corrupt@agent execute');
        expect(report.ok).toBe(false);
        expect(report.checks.find((c) => c.label === EXECUTE_LABEL)?.ok).toBe(true);
        expect(report.checks.find((c) => c.label === RECORD_LABEL)?.ok).toBe(true);
        expect(lastCheck(report)).toMatchObject({ label: SHOW_LABEL, ok: false });
        expect(lastCheck(report).detail).toContain('expected exit 0, got exit 1');
      });

      it('[Scrum] the fake agent read the session Resource, and agent list --past passed, on the compiled CLI', () => {
        expect(typeof smokeAgentRun).toBe('function');
        const checks = scrum ?? [];
        expect(checks.find((c) => c.label === LIST_LABEL)?.ok).toBe(true);
        expect(checks.find((c) => c.label === READ_LABEL)?.ok).toBe(true);
      });

      it('[Scrum] ignores WINGFOIL_FAKE_AGENT_* inherited from the caller\'s env: every step gets its own (review F1)', () => {
        expect(typeof smokeAgentRun).toBe('function');
        const env = {
          ...process.env,
          WINGFOIL_FAKE_AGENT_EXIT: '3',
          WINGFOIL_FAKE_AGENT_CONNECT: '0',
          WINGFOIL_FAKE_AGENT_RECORD: '/nonexistent/fake-agent-record.jsonl',
        };
        const checks = smokeAgentRun('Scrum', invoke, env);
        expect(checks.filter((c) => !c.ok)).toEqual([]);
        expect(checks.map((c) => c.label)).toContain(READ_LABEL);
      });

      it('[Scrum] fails the fake-read probe when `agent execute` runs without the fake switched on', () => {
        expect(typeof smokeAgentRun).toBe('function');
        const steps = agentRunSteps('Scrum').map((s) => {
          if (!isExecute(s) || !('args' in s)) return s;
          const off: { -readonly [K in keyof typeof s]: (typeof s)[K] } = { ...s };
          delete off.fakeAgent;
          return off;
        });
        const checks = smokeAgentRun('Scrum', invoke, process.env, steps);
        // Steps 6–8 pass without the fake's record; only the probe can see it was never read.
        expect(checks.find((c) => c.label === SHOW_LABEL)?.ok).toBe(true);
        expect(last(checks)).toMatchObject({ label: READ_LABEL, ok: false });
        expect(last(checks)?.detail).toContain('the fake agent recorded no launch');
      });
    });

    describe('AC 3 — the smoke plan and the report template name the new step', () => {
      const yamlPath = join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'e2e-smoke.yaml');
      const raw = readFileSync(yamlPath, 'utf-8');
      const workflow = yamlLoad(raw) as {
        version: number;
        phases: { name: string; description?: string; actions?: string[]; checks?: { post?: string[] } }[];
      };
      const driveCli = workflow.phases.find((p) => p.name === 'drive-cli');

      it('e2e-smoke.yaml is at least 1.6, with a history entry for task-243 (bug-314)', () => {
        expect(workflow.version).toBeGreaterThanOrEqual(1.6);
        expect(raw).toMatch(/1\.6 [^;]*task-243/);
      });

      it('drive-cli declares the three agent actions and describes the agent run; its checks are unchanged', () => {
        expect(driveCli?.actions).toEqual(
          expect.arrayContaining([
            'cli.run(command: "agent execute --element <type:id> --role developer")',
            'cli.run(command: "agent show <run-id>")',
            'cli.run(command: "agent list --past")',
          ]),
        );
        expect(driveCli?.description).toContain('agent execute');
        expect(driveCli?.description).toContain('custom/fake');
        expect(driveCli?.checks?.post).toHaveLength(3);
      });

      it('the report names the agent run', () => {
        const text = formatReport({ ok: true, checks: [{ label: 'wingfoil --help', ok: true, detail: 'exit 0' }] }, { command: ['wingfoil'] });
        expect(text).toContain('- Agent run: `agent execute` through the fake adapter `custom/fake` in a fresh project per template (spec-016 §2.7)');
      });

      it('WORKFLOW.md\'s E2E Smoke section names `agent execute`', () => {
        const text = readFileSync(join(REPO_ROOT, '.wingfoil', 'WORKFLOW.md'), 'utf-8');
        const start = text.indexOf('### E2E Smoke');
        expect(start).toBeGreaterThanOrEqual(0);
        const end = text.indexOf('\n### ', start + 1);
        expect(text.slice(start, end === -1 ? undefined : end)).toContain('agent execute');
      });
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

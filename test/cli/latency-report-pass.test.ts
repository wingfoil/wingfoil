/**
 * task-285 (`bug-378`) — the REQ-PERF-02 report reaches the latency pass's output when the pass runs two or more
 * test files (AC 1, AC 2), in the shape release-health's Q12 reads (AC 3).
 *
 * The pass is `jest.latency.config.js`; this file runs it over the two files of
 * `test/cli/fixtures/latency-report-pass/` (that directory's `jest.config.cjs` overrides only `rootDir`, `testMatch`
 * and the global setup/teardown): `report.fixture.ts` reports synthetic samples through the suite's own call,
 * `reportLatency(measured, COMMANDS, load)`, and `sibling.fixture.ts` prints one `workflow next`-shaped line through
 * `process.stdout.write`. The child jest gets no extra flag, so it picks its reporter as the real pass does: with
 * no `reporters` configured, jest 30 uses its agent reporter when an agent variable (`AI_AGENT`, `CLAUDECODE`, …) is
 * set, and that reporter drops the console output of a passing suite once two or more files run — `bug-378`.
 * The environments are built from `process.env` deterministically: every agent variable removed, then the case's
 * own set. Nothing here is timed and the fixture spawns nothing: it is an ordinary `npm test` suite, not a latency
 * suite (`test/latency-suites.cjs`).
 */
import { spawnSync } from 'child_process';
import { join, resolve } from 'path';

import { parseLatencyReport } from '../../scripts/release-health/measure.cjs';

jest.setTimeout(120_000);

const REPO_ROOT = resolve(__dirname, '..', '..');
const CONFIG = join(__dirname, 'fixtures', 'latency-report-pass', 'jest.config.cjs');
const COMMANDS = ['memory search', 'dna show', 'memory history'] as const;

/** The variables jest 30 (`@jest/core`, `detectAgent`) reads to pick its agent reporter. */
const AGENT_ENV_VARS = [
  'AI_AGENT', 'AUGMENT_AGENT', 'CLAUDE_CODE', 'CLAUDECODE', 'CODEX_SANDBOX', 'CODEX_THREAD_ID',
  'CURSOR_AGENT', 'GEMINI_CLI', 'GOOSE_PROVIDER', 'OPENCODE', 'REPL_ID',
] as const;

interface Pass {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function passEnv(agent: boolean, report: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of AGENT_ENV_VARS) delete env[name];
  delete env['WINGFOIL_LATENCY_REPORT'];
  if (agent) {
    env['AI_AGENT'] = '1';
    env['CLAUDECODE'] = '1';
  }
  if (report) env['WINGFOIL_LATENCY_REPORT'] = '1';
  return env;
}

function runPass(env: NodeJS.ProcessEnv): Pass {
  const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '-c', CONFIG], { cwd: REPO_ROOT, env, encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const MACHINE_LINE = /^[ \t]*machine: /gm;
const commandLine = (command: string): RegExp => new RegExp(`^${command}: marginal p95 -?\\d+ ms \\([^)]*\\); total p95 -?\\d+ ms`, 'gm');
const count = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;

const CASES = [
  { name: 'an agent environment (AI_AGENT, CLAUDECODE set)', agent: true },
  { name: 'no agent environment', agent: false },
] as const;

const passes = new Map<string, Pass>();
let optedOut: Pass;

beforeAll(() => {
  for (const { name, agent } of CASES) passes.set(name, runPass(passEnv(agent, true)));
  optedOut = runPass(passEnv(true, false));
});

describe.each(CASES)('task-285 — the two-file latency pass with WINGFOIL_LATENCY_REPORT=1, in $name', ({ name }) => {
  const pass = (): Pass => passes.get(name)!;

  it('AC 1 — stdout carries the report\'s machine: line', () => {
    expect(pass().stdout).toMatch(/^[ \t]*machine: /m);
  });

  it('AC 1 — stdout carries the floor (--version): line', () => {
    expect(pass().stdout).toContain('floor (--version):');
  });

  it.each(COMMANDS)('AC 1, AC 2 — stdout carries exactly one unindented "%s: marginal p95 …; total p95" line (process.stdout.write)', (command) => {
    expect(count(pass().stdout, commandLine(command))).toBe(1);
  });

  it('AC 1 — the report is one block: the machine: line occurs exactly once in stdout and stderr together (B8 ruling 283 D2)', () => {
    expect(count(`${pass().stdout}\n${pass().stderr}`, MACHINE_LINE)).toBe(1);
  });

  it('the pass exits 0: both fixture files run and pass', () => {
    expect({ status: pass().status, stderr: pass().stderr }).toMatchObject({ status: 0 });
  });

  it('AC 3 — parseLatencyReport reads the pass\'s output (stdout + stderr, as Q12 does) whole: verdict, report load window, floor, every command', () => {
    expect(parseLatencyReport(`${pass().stdout}\n${pass().stderr}`)).toEqual({
      machine: 'otherwise idle',
      idle: true,
      load: { before: 1.5, after: 1.75 },
      floorP95: 200,
      commands: [
        { command: 'memory search', marginalP95: 100, totalP95: 300 },
        { command: 'dna show', marginalP95: 50, totalP95: 250 },
        { command: 'memory history', marginalP95: 220, totalP95: 420 },
      ],
    });
  });
});

describe('task-285 — the report stays opt-in', () => {
  it('AC 2 — without WINGFOIL_LATENCY_REPORT, the pass runs (exit 0) and prints no machine: line anywhere', () => {
    expect({ status: optedOut.status, stderr: optedOut.stderr }).toMatchObject({ status: 0 });
    expect(count(`${optedOut.stdout}\n${optedOut.stderr}`, MACHINE_LINE)).toBe(0);
  });
});

/**
 * task-336 AC 4 (red-first) — the active registry a launch keeps, on the compiled CLI (`spec-016` §3.3 steps 13, 14 and
 * 17, §3.7 `RUN_ACTIVE`, §7 as amended at the design gate; `dl-181`, `dl-135` Q1 (a); approver rulings D3 (a), D8 (a),
 * D12), with the fake adapter (`seed()`), which records the registry it sees while it runs
 * (`WINGFOIL_FAKE_AGENT_REGISTRY=1`: its own `pid` and every file under `.wingfoil/run/`).
 *
 * - during the run exactly one entry, `.wingfoil/run/task-202-explicit-override/adhoc/1.json`, keys `id, pid, workflow,
 *   phase, element, role, agent, session, started_ms` in that order, `pid` the agent's own (rewritten at step 14),
 *   `session` the assigned id (adapter `fake`, `session.id: assign`, the id the agent was given as `--session-id`),
 *   `started_ms` a positive integer; after the run no file is left — headless, interactive, and an agent that exits 1;
 * - `RUN_ACTIVE`: an entry for the run id whose `pid` is alive (the Jest worker's own) → exit 1, `run <id> is already
 *   running (pid <pid>)`, nothing spawned, no record, the entry untouched; the same entry with the pid of a process that
 *   has exited → pruned, the run proceeds and records `…/adhoc/1`;
 * - the not-ignored warning: without `.wingfoil/.gitignore`, one line exactly `warning: .wingfoil/run/ is not git-ignored:
 *   add "/run/" to .wingfoil/.gitignore, or a running launch can be committed`; with the file, none.
 *
 * Today nothing writes `.wingfoil/run/`, nothing refuses a running run id, and nothing warns.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { removeTempDir } from '../storage/helpers/git-fixture';
import { seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { errorLine, execute, expectNothingRan, headOf, launchArgv, launchEntry, records, removeRunScratch, warningLines, type AgentRun } from './helpers/agent-execute-cli';

const repos: string[] = [];
afterAll(() => {
  removeRunScratch();
  for (const repo of repos) removeTempDir(repo);
});

const RUN_1 = `${TASK_ID}/adhoc/1`;
const ENTRY_PATH = `.wingfoil/run/${TASK_ID}/adhoc/1.json`;
const KEYS = ['id', 'pid', 'workflow', 'phase', 'element', 'role', 'agent', 'session', 'started_ms'];
const NOT_IGNORED = 'warning: .wingfoil/run/ is not git-ignored: add "/run/" to .wingfoil/.gitignore, or a running launch can be committed';
const REGISTRY = { WINGFOIL_FAKE_AGENT_REGISTRY: '1' };

function fixture(tweak?: (repo: string) => void): string {
  const repo = seed(tweak);
  repos.push(repo);
  return repo;
}

/** Every file under `<repo>/.wingfoil/run/`, repository-relative. */
function registryFiles(repo: string): string[] {
  const files: string[] = [];
  const walk = (relative: string): void => {
    const path = join(repo, relative);
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${relative}/${entry.name}`);
      else files.push(`${relative}/${entry.name}`);
    }
  };
  walk('.wingfoil/run');
  return files.sort();
}

/** What the fake saw of the registry while it ran, and its pid. */
function seen(run: AgentRun): { pid: number | undefined; registry: { path: string; entry: unknown }[] | undefined } {
  // task-337: version_args runs before the launch too (spec-016 §2.6), so the launch is the fake's launch entry, not fake[0].
  const launch = launchEntry(run);
  return { pid: launch.pid, registry: launch.registry };
}

/** The `--session-id` value the agent was launched with. */
function assignedSession(run: AgentRun): string {
  const argv = launchArgv(run);
  return argv[argv.indexOf('--session-id') + 1]!;
}

/** A hand-written registry entry for run 1 with `pid`. */
function writeEntry(repo: string, pid: number): string {
  const text = `${JSON.stringify({ id: RUN_1, pid, workflow: 'n/a', phase: 'adhoc', element: TASK_REF, role: 'developer', agent: 'Fake Agent', session: 'not-reported', started_ms: 1794817800000 })}\n`;
  const path = join(repo, ENTRY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}

describe('task-336 AC 4 — a running launch is listed in the registry, and removed when it exits (spec-016 §7)', () => {
  it.each([
    ['headless', ['--headless']],
    ['interactive', ['--interactive']],
  ])('%s: one entry while the agent runs, its keys in order, the agent pid and the assigned session; none after', (_kind, flags) => {
    const repo = fixture();
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', ...flags], REGISTRY);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    const { pid, registry } = seen(run);
    expect(registry?.map((file) => file.path)).toEqual([ENTRY_PATH]);
    const entry = registry![0]!.entry as Record<string, unknown>;
    expect(Object.keys(entry)).toEqual(KEYS);
    expect(entry).toEqual({
      id: RUN_1,
      pid,
      workflow: 'n/a',
      phase: 'adhoc',
      element: TASK_REF,
      role: 'developer',
      agent: 'Fake Agent',
      session: assignedSession(run),
      started_ms: expect.any(Number),
    });
    expect(Number.isInteger(entry['started_ms']) && (entry['started_ms'] as number) > 0).toBe(true);
    expect(registryFiles(repo)).toEqual([]);
    expect(warningLines(run.stderr)).toEqual([]);
  });

  it('an agent that exits 1: the run is recorded and no entry is left', () => {
    const repo = fixture();
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless'], { ...REGISTRY, WINGFOIL_FAKE_AGENT_EXIT: '1' });
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe(`error: agent exited 1; run ${RUN_1} recorded`);
    expect(seen(run).registry?.map((file) => file.path)).toEqual([ENTRY_PATH]);
    expect(registryFiles(repo)).toEqual([]);
  });
});

describe('task-336 AC 4 — RUN_ACTIVE, and a stale entry pruned (spec-016 §3.3 step 13, §3.7; D3 (a))', () => {
  it('a live entry for the run id: exit 1, "run <id> is already running (pid <pid>)", nothing spawned, no record, the entry untouched', () => {
    const repo = fixture();
    const before = headOf(repo);
    const text = writeEntry(repo, process.pid);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless'], REGISTRY);
    expect(run.status).toBe(1);
    expect(errorLine(run.stderr)).toBe(`error: run ${RUN_1} is already running (pid ${process.pid})`);
    expectNothingRan(repo, run, before);
    expect(records(repo, TASK_ID)).toEqual([]);
    expect(readFileSync(join(repo, ENTRY_PATH), 'utf-8')).toBe(text);
    rmSync(join(repo, '.wingfoil', 'run'), { recursive: true, force: true });
  });

  it('an entry whose process has exited: pruned, and the run proceeds as …/adhoc/1', () => {
    const repo = fixture();
    const exited = spawnSync(process.execPath, ['-e', '']);
    writeEntry(repo, exited.pid!);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless'], REGISTRY);
    expect(errorLine(run.stderr)).toBeUndefined();
    expect(run.status).toBe(0);
    const { pid, registry } = seen(run);
    expect(registry?.map((file) => file.path)).toEqual([ENTRY_PATH]);
    expect((registry![0]!.entry as { pid: unknown }).pid).toBe(pid);
    expect(records(repo, TASK_ID)).toEqual([expect.objectContaining({ id: RUN_1 })]);
    expect(registryFiles(repo)).toEqual([]);
  });
});

describe('task-336 AC 4 — the entry not git-ignored is warned of, never refused (spec-016 §3.3 step 13; D8 (a))', () => {
  it('without .wingfoil/.gitignore: one warning: line, and the run succeeds', () => {
    const repo = fixture((root) => rmSync(join(root, '.wingfoil', '.gitignore')));
    expect(existsSync(join(repo, '.wingfoil', '.gitignore'))).toBe(false);
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([NOT_IGNORED]);
    expect(registryFiles(repo)).toEqual([]);
  });

  it('with .wingfoil/.gitignore holding /run/ (the fixture): no warning', () => {
    const repo = fixture();
    const run = execute(repo, ['--element', TASK_REF, '--role', 'developer', '--headless']);
    expect(run.status).toBe(0);
    expect(warningLines(run.stderr)).toEqual([]);
  });
});

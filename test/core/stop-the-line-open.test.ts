/**
 * task-275 — a `deprecated` task is not open for the stop-the-line share (`dl-133` §3; approver ruling of
 * 2026-10-10 on `task-221` design decision 3).
 *
 * `memory.yaml` `task.stop_the_line` (task-150) is the one statement of the rule; `dev-loop.yaml`
 * `start.checks.pre` (task-221) names it instead of restating it. Both files are read **as `HEAD` holds
 * them** (`loadMemoryYamlAtHead`, `git show HEAD:<file>`), like `test/core/dev-loop-v1-6.test.ts`.
 *
 * - **AC 1 (red-first).** `open` excludes `done` and `deprecated`, and only them (`draft` and `pending`
 *   stay open, as `dl-133` §3 counts them); the line comment names the ruling; `memory.yaml` is 2.9 or
 *   later with a history entry naming this task.
 * - **AC 2.** The check token names `memory.yaml task.stop_the_line` and carries no task status
 *   (characterization: true since task-221); no line of `dev-loop.yaml` defines what an open task is,
 *   so the definition has one home (red-first: the v1.6 header restated it).
 *
 * What is NOT asserted: that the check is evaluated — no workflow check runs before P4.12 (v1.0,
 * `dl-090` Q2 (c)); no code reads `task.stop_the_line` (`grep -rn stop_the_line src scripts` is empty).
 *
 * Determinism (REQ-SYS-07): fixed inputs at `HEAD`; status names in declared order.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadMemoryYamlAtHead, loadWorkflowRegistryAtHead } from '../../src/core';
import { tokenName } from '../../src/workflow/bindings';

const ROOT = join(__dirname, '..', '..');
const MEMORY_FILE = '.wingfoil/memory.yaml';
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';

/** The file as `HEAD` holds it. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

interface TaskType {
  stop_the_line?: Record<string, unknown>;
  states: { sequence: string[] };
}

function taskTypeAtHead(): { version: number; task: TaskType } {
  const memoryYaml = loadMemoryYamlAtHead(ROOT) as unknown as { version: number; types: Record<string, TaskType> } | null;
  if (memoryYaml === null) throw new Error(`${MEMORY_FILE} is not at HEAD`);
  return { version: memoryYaml.version, task: memoryYaml.types.task! };
}

/** Every status a task can hold: its machine's sequence plus the reserved `deprecated` (spec-001). */
function taskStatuses(): string[] {
  return [...taskTypeAtHead().task.states.sequence, 'deprecated'];
}

/** The statuses `open` excludes, from its declared form `status not in [a, b, …]`. */
function excludedStatuses(open: string): string[] {
  const match = /^status not in \[([a-z-]+(?:, [a-z-]+)*)\]$/.exec(open);
  if (match === null) throw new Error(`task.stop_the_line.open is not of the form "status not in [...]": ${open}`);
  return match[1]!.split(', ');
}

describe('AC 1 — `task.stop_the_line.open` excludes `deprecated` as well as `done` (red-first)', () => {
  it('`open` at HEAD is "status not in [done, deprecated]"', () => {
    expect(taskTypeAtHead().task.stop_the_line?.open).toBe('status not in [done, deprecated]');
  });

  it('only `done` and `deprecated` are excluded: `draft` and `pending` stay open, as dl-133 §3 counts them', () => {
    const excluded = excludedStatuses(String(taskTypeAtHead().task.stop_the_line?.open));
    expect(excluded).toEqual(['done', 'deprecated']);
    const open = taskStatuses().filter((s) => !excluded.includes(s));
    expect(open).toEqual(['draft', 'pending', 'backlog', 'in-progress', 'in-review', 'approved']);
  });

  it('the rest of the rule is unchanged (task-150)', () => {
    expect(taskTypeAtHead().task.stop_the_line).toEqual({
      field: 'kind',
      counts: 'fix',
      blocks: 'feature',
      open: 'status not in [done, deprecated]',
      scope: 'release',
      max_share: 30,
      at: 'dev-loop start',
    });
  });

  it('the `open:` line comment says why: the approver ruling of 2026-10-10 on task-221 decision 3, carried by task-275', () => {
    const line = atHead(MEMORY_FILE).split('\n').find((l) => /^ {6}open: /.test(l));
    expect(line).toBeDefined();
    expect(line).toMatch(/deprecated/);
    expect(line).toMatch(/2026-10-10/);
    expect(line).toMatch(/task-221/);
    expect(line).toMatch(/decision 3/);
    expect(line).toMatch(/task-275/);
  });

  // "At least" (bug-314): a later writer of memory.yaml bumps it again; the history keeps this entry.
  it('memory.yaml is version 2.9 or later, its history naming task-275', () => {
    const { version } = taskTypeAtHead();
    expect(version).toBeGreaterThanOrEqual(2.9);
    expect(atHead(MEMORY_FILE)).toMatch(/^version: \d+\.\d+ +# .*2\.8 -> 2\.9 at task-275/m);
  });
});

describe('AC 2 — the definition of an open task has one home, memory.yaml', () => {
  function stopTheLineToken(): string {
    const devLoop = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'dev-loop');
    if (devLoop === undefined) throw new Error('dev-loop is not in the registry at HEAD');
    const start = devLoop.phases.find((p) => p.name === 'start');
    const token = (start?.checks?.pre ?? []).find((t) => tokenName(t) === 'stop-the-line.clear');
    if (token === undefined) throw new Error('dev-loop.start declares no checks.pre stop-the-line.clear at HEAD');
    return token;
  }

  it('(characterization) the `stop-the-line.clear` token names memory.yaml task.stop_the_line and carries no task status', () => {
    const token = stopTheLineToken();
    expect(token).toContain('memory.yaml task.stop_the_line');
    const named = taskStatuses().filter((status) => new RegExp(`(^|[^a-z-])${status}([^a-z-]|$)`).test(token));
    expect(named).toEqual([]);
  });

  it('(red-first) no line of dev-loop.yaml defines what an open task is', () => {
    const restating = atHead(DEV_LOOP_FILE)
      .split('\n')
      .filter((line) => /\bopen task is\b/i.test(line));
    expect(restating).toEqual([]);
  });
});

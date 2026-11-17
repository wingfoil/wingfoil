/**
 * task-336 AC 6 (red-first) — `agent list --active` (`spec-016` §5, §5.1 and §7 as amended at the design gate;
 * `spec-008` §12; `dl-181`, `dl-135` point 1; approver rulings D4 (a), D13 (a)), driving the registered
 * `agent.agentList` `CoreFn` with the new `active` flag over the task-240 fixture
 * (`test/core/helpers/agent-list-fixture.ts`), its `.wingfoil/.gitignore` committed as a v0.4 `wingfoil init` leaves it.
 * Registry entries are written by the test under `.wingfoil/run/`, their `pid` the Jest worker's own (alive).
 *
 * - the active section lists the live entries in §5's order (element id byte order, then phase, then `n` as a number);
 * - its payload keys: `baseline, active, diagnostics` for `--active` alone; `baseline, past, waiting, active, diagnostics`
 *   with no flag or all three (D13 (a)); past and waiting alone keep their keys;
 * - console: `active runs: <n>` then `<id>  <role>  <agent>  <pid>  <started>`, `<started>` the ISO 8601 UTC instant of
 *   `started_ms` with milliseconds; `no active runs` when empty; sections in the order past, waiting, active;
 * - `--element` and `--phase` filter it; a stale entry is not listed and is gone from disk after the call;
 * - a waiting step with a live entry of the same `workflow`, `phase` and `element` is not listed (D4 (a)).
 *
 * Today the operation has no `active` flag: the param is ignored, so no `active` key is ever returned.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { agentListOperation, commit, element, plan, recorded, render, run, writeProject, type ListValue } from './helpers/agent-list-fixture';

const GITIGNORE = "# wingfoil agent execute's registry of running agents: local to this checkout, never committed.\n/run/\n";
const STARTED_MS = 1794817800000;
const STARTED = '2026-11-16T08:30:00.000Z';

interface ActiveEntry {
  readonly id: string;
  readonly pid: number;
  readonly workflow: string;
  readonly phase: string;
  readonly element: string;
  readonly role: string;
  readonly agent: string;
  readonly session: string;
  readonly started_ms: number;
}

type Value = ListValue & { readonly active?: readonly ActiveEntry[]; readonly warnings?: readonly string[] };

interface ActiveRequest {
  readonly past?: boolean;
  readonly waiting?: boolean;
  readonly active?: boolean;
  readonly element?: string;
  readonly phase?: string;
}

/** The operation's success value with its warnings, the flags passed as `buildParams` spreads them. */
async function listed(root: string, request: ActiveRequest = {}): Promise<Value> {
  const { element: elementOption, phase, ...flags } = request;
  const options = { ...(elementOption === undefined ? {} : { element: elementOption }), ...(phase === undefined ? {} : { phase }) };
  const raw = await (agentListOperation().fn as CoreFn<unknown, Value>)({ root, options, ...flags });
  const result = (typeof raw === 'object' && raw !== null && 'ok' in raw ? raw : { ok: true, value: raw }) as CoreResult<Value>;
  if (!result.ok) throw new Error(`agent list refused: ${result.error.message}`);
  return { ...result.value, ...(result.warnings === undefined ? {} : { warnings: result.warnings }) };
}

/** The ids of the active section, which must be present. */
function activeIds(value: Value): string[] {
  expect(value.active).toEqual(expect.any(Array));
  return (value.active ?? []).map((item) => item.id);
}

function entry(elementRef: string, workflow: string, phase: string, n: number, pid: number = process.pid): ActiveEntry {
  const elementId = elementRef.slice(elementRef.indexOf(':') + 1);
  return { id: `${elementId}/${phase}/${n}`, pid, workflow, phase, element: elementRef, role: 'developer', agent: 'Zed', session: 'not-reported', started_ms: STARTED_MS };
}

function putEntry(root: string, value: ActiveEntry): void {
  const path = join(root, '.wingfoil', 'run', `${value.id}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

/** The task-240 fixture with `.wingfoil/.gitignore` committed and the planning instance pl-1 open (one waiting step). */
function project(): string {
  const repo = makeTempGitRepo();
  writeProject(repo);
  commit(repo, { '.wingfoil/.gitignore': GITIGNORE, 'docs/releases/minor-2.md': element('release', 'minor-2', 'planning') }, 'seed elements');
  commit(repo, { 'docs/plans/pl-1.md': plan('pl-1', 'planning', 'minor-2') }, 'wf(plan): add pl-1');
  recorded(repo, run('task-a', 'green', 1));
  return repo;
}

const repos: string[] = [];
afterAll(() => {
  for (const repo of repos) removeTempDir(repo);
});

function fresh(): string {
  const repo = project();
  repos.push(repo);
  return repo;
}

describe('task-336 AC 6 — the active section (spec-016 §5, §7)', () => {
  let repo: string;
  beforeAll(() => {
    repo = fresh();
    for (const value of [entry('task:task-b', 'dev-loop', 'red', 1), entry('task:task-a', 'dev-loop', 'red', 10), entry('task:task-a', 'dev-loop', 'red', 2), entry('task:task-a', 'dev-loop', 'green', 1)]) {
      putEntry(repo, value);
    }
  });

  it('--active alone: baseline, active and diagnostics; the live entries in element, phase, n order, each entry §7 object', async () => {
    const value = await listed(repo, { active: true });
    expect(Object.keys(value).filter((key) => key !== 'warnings')).toEqual(['baseline', 'active', 'diagnostics']);
    expect(activeIds(value)).toEqual(['task-a/green/1', 'task-a/red/2', 'task-a/red/10', 'task-b/red/1']);
    expect(value.active![0]).toEqual(entry('task:task-a', 'dev-loop', 'green', 1));
    expect(Object.keys(value.active![0]!)).toEqual(['id', 'pid', 'workflow', 'phase', 'element', 'role', 'agent', 'session', 'started_ms']);
  });

  it('console: "active runs: <n>", then <id>  <role>  <agent>  <pid>  <started> per entry', async () => {
    const pid = String(process.pid);
    expect(render(await listed(repo, { active: true }))).toBe(
      [
        'active runs: 4',
        `task-a/green/1  developer  Zed  ${pid}  ${STARTED}`,
        `task-a/red/2  developer  Zed  ${pid}  ${STARTED}`,
        `task-a/red/10  developer  Zed  ${pid}  ${STARTED}`,
        `task-b/red/1  developer  Zed  ${pid}  ${STARTED}`,
        '',
      ].join('\n'),
    );
  });

  it('--element and --phase filter the entries by their element and phase fields', async () => {
    expect(activeIds(await listed(repo, { active: true, element: 'task:task-a' }))).toEqual(['task-a/green/1', 'task-a/red/2', 'task-a/red/10']);
    expect(activeIds(await listed(repo, { active: true, phase: 'red' }))).toEqual(['task-a/red/2', 'task-a/red/10', 'task-b/red/1']);
    expect((await listed(repo, { active: true, element: 'task:task-z' })).active).toEqual([]);
  });

  it.each([
    ['no flag', {}],
    ['all three flags', { past: true, waiting: true, active: true }],
  ])('%s → baseline, past, waiting, active, diagnostics; the console sections in the order past, waiting, active', async (_name, request) => {
    const value = await listed(repo, request);
    expect(Object.keys(value).filter((key) => key !== 'warnings')).toEqual(['baseline', 'past', 'waiting', 'active', 'diagnostics']);
    const text = render(value);
    expect(text.indexOf('past runs: 1')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('waiting steps: 1')).toBeGreaterThan(text.indexOf('past runs: 1'));
    expect(text.indexOf('active runs: 4')).toBeGreaterThan(text.indexOf('waiting steps: 1'));
  });

  it.each([
    ['--past', { past: true }, ['baseline', 'past', 'diagnostics']],
    ['--waiting', { waiting: true }, ['baseline', 'waiting', 'diagnostics']],
    ['--past --waiting', { past: true, waiting: true }, ['baseline', 'past', 'waiting', 'diagnostics']],
  ])('%s keeps its keys: no active section', async (_name, request, keys) => {
    expect(Object.keys(await listed(repo, request)).filter((key) => key !== 'warnings')).toEqual(keys);
  });
});

describe('task-336 AC 6 — an empty registry, and a stale entry (spec-016 §5, §7)', () => {
  it('no .wingfoil/run/: an empty active section, printed "no active runs"', async () => {
    const repo = fresh();
    const value = await listed(repo, { active: true });
    expect(value.active).toEqual([]);
    expect(render(value)).toBe('no active runs\n');
  });

  it('an entry whose process has exited is not listed and is gone from disk after the call', async () => {
    const repo = fresh();
    const exited = spawnSync(process.execPath, ['-e', '']).pid!;
    putEntry(repo, entry('task:task-a', 'dev-loop', 'red', 1));
    putEntry(repo, entry('task:task-z', 'dev-loop', 'green', 1, exited));
    const value = await listed(repo, { active: true });
    expect(activeIds(value)).toEqual(['task-a/red/1']);
    expect(existsSync(join(repo, '.wingfoil/run/task-z/green/1.json'))).toBe(false);
  });
});

describe('task-336 AC 6 — waiting leaves out a step with a live entry (spec-016 §5, D4 (a))', () => {
  it('the planning step is waiting until an entry of its workflow, phase and element is live; an entry of another phase changes nothing', async () => {
    const repo = fresh();
    const key = 'planning.commit-backlog@release:minor-2';
    expect((await listed(repo, { waiting: true })).waiting!.map((step) => step.key)).toEqual([key]);
    putEntry(repo, entry('release:minor-2', 'planning', 'other-phase', 1));
    expect((await listed(repo, { waiting: true })).waiting!.map((step) => step.key)).toEqual([key]);
    putEntry(repo, entry('release:minor-2', 'planning', 'commit-backlog', 1));
    expect((await listed(repo, { waiting: true })).waiting).toEqual([]);
    const all = await listed(repo, {});
    expect(all.waiting).toEqual([]);
    expect(activeIds(all)).toEqual(['minor-2/commit-backlog/1', 'minor-2/other-phase/1']);
  });
});

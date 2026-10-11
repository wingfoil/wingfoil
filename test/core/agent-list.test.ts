/**
 * task-240 — `wingfoil agent list [--past] [--waiting] [--element <type>:<id>] [--phase <name>]`
 * (`spec-016` §5, §5.1; BDD `docs/02_requirements/02_bdd/features/p5-interaction/P5.3.4-agent-list.feature`).
 *
 * Drives the registered `CORE_MODULES` `agent.agentList` operation — the `CoreFn` the CLI command dispatches
 * to — over throwaway repositories committed at `HEAD`: run logs written by task-206's `recordRun` (the
 * library `agent execute` commits through) and open workflow instances deduced by `spec-017`'s deduction
 * (task-198, task-225's step builder). The compiled CLI's bytes (console lines, `warning:` lines, exit codes,
 * `--active`) are pinned by `test/cli/agent-list.integration.test.ts`.
 *
 * - AC 1: past — two element files, element id byte order then append order; the console line; `no past runs`.
 * - AC 2: waiting — two open instances, parallel frontier steps, one with a non-agent role; agent-role steps
 *   only, in frontier order, each with the DNA-ordered agents that declare an adapter.
 * - AC 3: no flag or both flags → both sections (`--active` is the CLI suite's: Commander refuses it).
 * - AC 4: a run log changed only in the working tree is not read; `W_UNCOMMITTED_INPUTS` names its path, once.
 * - AC 5: no `paths.runs` → empty past and a warning, exit 0; a §4.5 violation → `VALIDATION`, exit 1.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NOT_REPORTED, recordRun, serializeRunRecord, type RunRecord } from '../../src/agent';
import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult, exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn, CoreOperation } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

/**
 * `developer` is an agent role (three agents execute it, two with an adapter, declared Zed before Amy so DNA
 * order is not name order); `qa` and `tech-lead` are not.
 */
function dnaYaml(runs: string | null): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Alex
      email: alex@example.invalid
      roles: [ developer, qa ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ approver, tech-lead ]
  agents:
    - name: Zed
      email: zed@zed-agent.dev
      executes_as: [ developer ]
      adapter: zed
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer, reviewer ]
    - name: Amy
      email: amy@amy-agent.dev
      executes_as: [ developer ]
      adapter: amy
  roles:
    - name: developer
    - name: qa
    - name: reviewer
    - name: approver
    - name: tech-lead
paths:
  sources: [ src/ ]
${runs === null ? '' : `  runs: [ ${runs} ]\n`}`;
}

const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
phases:
  - name: develop
    iterate_over: task
    where: { status: [ backlog ] }
    include: dev-loop
  - name: ship
    role: tech-lead
    actions:
      - element.set_state(released)
`;

const DEV_LOOP = `name: dev-loop
includable: true
element: task
phases:
  - name: start
    role: developer
    actions:
      - element.set_state(in-progress)
  - name: red
    role: qa
    actions:
      - agent.execute
  - name: green
    role: developer
    actions:
      - agent.execute
      - memory.submit
`;

/** A one-phase workflow whose step a developer (an agent role) takes. */
const PLANNING = `name: planning
startable: true
element: release
phases:
  - name: commit-backlog
    role: developer
    actions:
      - release.set_state(in-development)
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
global: []
`;

function writeProject(root: string, runs: string | null = 'docs/runs/'): void {
  const workflows: Record<string, string> = {
    'workflows/custom/release-cycle.yaml': RELEASE_CYCLE,
    'workflows/custom/dev-loop.yaml': DEV_LOOP,
    'workflows/custom/planning.yaml': PLANNING,
  };
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${Object.keys(workflows).map((file) => `  - ${file}\n`).join('')}`);
  for (const [file, content] of Object.entries(workflows)) writeFixtureFile(root, `.wingfoil/${file}`, content);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(runs));
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  commitAll(root, 'fixture configuration');
}

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

/** Write `files` and commit them with `subject`. */
function commit(root: string, files: Record<string, string>, subject: string): void {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', subject]);
}

/** A complete, valid record; `overrides` replaces whole fields. */
function run(elementId: string, phase: string, n: number, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: `${elementId}/${phase}/${n}`,
    element: `task:${elementId}`,
    workflow: 'dev-loop',
    phase,
    role: 'developer',
    mode: 'fresh',
    agent: 'Zed',
    adapter: 'custom/zed',
    agent_version: NOT_REPORTED,
    model: NOT_REPORTED,
    session: NOT_REPORTED,
    tokens: { input: 1200, output: 340, cache_read: NOT_REPORTED, cache_write: 0 },
    wingfoil: '0.3.0 (unknown)',
    state_ref: 'a'.repeat(40),
    duration_ms: 5120,
    exit_status: 0,
    result: 'n/a',
    notes: 'none',
    ...overrides,
  };
}

function recorded(root: string, record: RunRecord, dir = 'docs/runs'): void {
  const result = recordRun(root, `${dir}/${record.id.split('/')[0]}.jsonl`, record);
  if (!result.ok) throw new Error(`fixture: recordRun refused: ${result.error.message}`);
}

interface WaitingStep {
  readonly instance: string;
  readonly key: string;
  readonly workflow: string;
  readonly phase: string;
  readonly element: string | null;
  readonly role: string;
  readonly allowedModes: readonly string[];
  readonly agents: readonly string[];
}

interface ListValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly past?: readonly RunRecord[];
  readonly waiting?: readonly WaitingStep[];
  readonly diagnostics: readonly { readonly code: string; readonly file?: string; readonly message: string }[];
}

function agentListOperation(): CoreOperation {
  const operation = CORE_MODULES.find((module) => module.name === 'agent')?.operations['agentList'];
  if (!operation) throw new Error('"agentList" is not registered on the agent module');
  return operation;
}

interface Request {
  readonly past?: boolean;
  readonly waiting?: boolean;
  readonly element?: string;
  readonly phase?: string;
}

/** The operation's result, normalized to a `CoreResult` (a bare value is a success). */
async function list(root: string, request: Request = {}): Promise<CoreResult<ListValue>> {
  const { element: elementOption, phase, ...flags } = request;
  const options = { ...(elementOption === undefined ? {} : { element: elementOption }), ...(phase === undefined ? {} : { phase }) };
  const value = await (agentListOperation().fn as CoreFn<unknown, ListValue>)({ root, options, ...flags });
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<ListValue>;
}

async function listed(root: string, request: Request = {}): Promise<ListValue & { readonly warnings?: readonly string[] }> {
  const result = await list(root, request);
  if (!result.ok) throw new Error(`agent list refused: ${result.error.message}`);
  return { ...result.value, ...(result.warnings === undefined ? {} : { warnings: result.warnings }) };
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();

const render = (value: unknown): string => agentListOperation().renderConsole!(value);

describe('task-240 — agent list is registered (spec-016 §5, §8; spec-006 §3)', () => {
  it("is the agent module's read-only agentList: flags --past/--waiting, options --element/--phase, a console renderer, no positional", () => {
    const operation = agentListOperation();
    expect(operation.mutates).toBe(false);
    expect(operation.positional).toBeUndefined();
    expect((operation.flags ?? []).map((flag) => flag.name)).toEqual(['past', 'waiting']);
    expect((operation.options ?? []).map((option) => [option.name, option.valueName])).toEqual([
      ['element', 'type:id'],
      ['phase', 'name'],
    ]);
    expect(operation.example).toMatch(/^wingfoil agent list/);
    expect(typeof operation.renderConsole).toBe('function');
  });
});

describe('task-240 AC 1 — past: the run logs at HEAD (spec-016 §5)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    // task-b first, two records in append order red then design; task-a second: listed a, then b's in line order.
    recorded(repo, run('task-b', 'red', 1, { duration_ms: 61000, exit_status: 130 }));
    recorded(repo, run('task-b', 'design', 1, { role: 'architect', agent: 'Amy', adapter: 'custom/amy', tokens: { input: NOT_REPORTED, output: NOT_REPORTED, cache_read: NOT_REPORTED, cache_write: NOT_REPORTED } }));
    recorded(repo, run('task-a', 'green', 1, { exit_status: 'signal:SIGINT', duration_ms: 450 }));
  });
  afterAll(() => removeTempDir(repo));

  it('orders the records by element id (byte order), then by line (append order); the payload carries baseline and diagnostics', async () => {
    const value = await listed(repo, { past: true });
    expect(value.baseline).toEqual({ rev: 'HEAD', commit: head(repo) });
    expect(value.past!.map((record) => record.id)).toEqual(['task-a/green/1', 'task-b/red/1', 'task-b/design/1']);
    expect(value.past![0]).toEqual(run('task-a', 'green', 1, { exit_status: 'signal:SIGINT', duration_ms: 450 }));
    expect(value.diagnostics).toEqual([]);
    // Only the selected source's key.
    expect(Object.keys(value)).toEqual(['baseline', 'past', 'diagnostics']);
  });

  it('console: a heading, then <id>  <role>  <agent>  <exit_status>  <duration>  <tokens> per record, tokens in/out or not-reported', async () => {
    expect(render(await listed(repo, { past: true }))).toBe(
      [
        'past runs: 3',
        'task-a/green/1  developer  Zed  signal:SIGINT  0.5s  1200/340',
        'task-b/red/1  developer  Zed  130  61.0s  1200/340',
        'task-b/design/1  architect  Amy  0  5.1s  not-reported',
        '',
      ].join('\n'),
    );
  });

  it('--element and --phase filter the records by their element and phase fields', async () => {
    expect((await listed(repo, { past: true, element: 'task:task-b' })).past!.map((record) => record.id)).toEqual(['task-b/red/1', 'task-b/design/1']);
    expect((await listed(repo, { past: true, phase: 'design' })).past!.map((record) => record.id)).toEqual(['task-b/design/1']);
    expect((await listed(repo, { past: true, element: 'task:task-b', phase: 'green' })).past).toEqual([]);
  });

  it('an empty result prints "no past runs" and is a success (exit 0)', async () => {
    const result = await list(repo, { past: true, element: 'task:task-z' });
    expect(result.ok).toBe(true);
    expect(exitCodeForResult(result)).toBe(0);
    expect(render((result as { value: ListValue }).value)).toBe('no past runs\n');
  });

  it('a malformed --element is a usage error (exit 2), refused before the project is read', async () => {
    let thrown: unknown;
    try {
      await list(join(repo, 'no-such-dir'), { past: true, element: 'task' });
    } catch (error) {
      thrown = error;
    }
    expect(exitCodeForThrow(thrown).exitCode).toBe(2);
  });
});

describe('task-240 AC 2 — waiting: agent-role frontier steps of every open instance (spec-016 §5, spec-017 §1.3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(
      repo,
      {
        'docs/releases/minor-1.md': element('release', 'minor-1', 'in-development'),
        'docs/releases/minor-2.md': element('release', 'minor-2', 'planning'),
        'docs/tasks/task-1.md': element('task', 'task-1', 'backlog'),
        'docs/tasks/task-2.md': element('task', 'task-2', 'backlog'),
      },
      'seed elements',
    );
    commit(repo, { 'docs/plans/rc-1.md': plan('rc-1', 'release-cycle', 'minor-1') }, 'wf(plan): add rc-1');
    // task-1 leaves `start`: its frontier step is `red`, whose role (qa) no agent executes.
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): start task-1 [backlog → in-progress]');
    commit(repo, { 'docs/plans/pl-1.md': plan('pl-1', 'planning', 'minor-2') }, 'wf(plan): add pl-1');
  });
  afterAll(() => removeTempDir(repo));

  it('lists only the agent-role steps, in frontier order, each with the agents that execute the role and declare an adapter, in DNA order', async () => {
    const value = await listed(repo, { waiting: true });
    expect(value.baseline).toEqual({ rev: 'HEAD', commit: head(repo) });
    expect(Object.keys(value)).toEqual(['baseline', 'waiting', 'diagnostics']);
    expect(value.waiting).toEqual([
      {
        instance: 'pl-1',
        key: 'planning.commit-backlog@release:minor-2',
        workflow: 'planning',
        phase: 'commit-backlog',
        element: 'release:minor-2',
        role: 'developer',
        allowedModes: ['fresh'],
        agents: ['Zed', 'Amy'],
      },
      {
        instance: 'rc-1',
        key: 'dev-loop.start@task:task-2',
        workflow: 'dev-loop',
        phase: 'start',
        element: 'task:task-2',
        role: 'developer',
        allowedModes: ['fresh'],
        agents: ['Zed', 'Amy'],
      },
    ]);
  });

  it('console: a heading, then <key>  <role>  <agents> per step', async () => {
    expect(render(await listed(repo, { waiting: true }))).toBe(
      ['waiting steps: 2', 'planning.commit-backlog@release:minor-2  developer  Zed, Amy', 'dev-loop.start@task:task-2  developer  Zed, Amy', ''].join('\n'),
    );
  });

  it('--element filters by the step element (scope, else the bound element), --phase by the phase', async () => {
    expect((await listed(repo, { waiting: true, element: 'task:task-2' })).waiting!.map((step) => step.key)).toEqual(['dev-loop.start@task:task-2']);
    expect((await listed(repo, { waiting: true, element: 'release:minor-2' })).waiting!.map((step) => step.key)).toEqual(['planning.commit-backlog@release:minor-2']);
    expect((await listed(repo, { waiting: true, phase: 'start' })).waiting!.map((step) => step.key)).toEqual(['dev-loop.start@task:task-2']);
    // The qa step is never listed, whatever the filter.
    expect((await listed(repo, { waiting: true, element: 'task:task-1' })).waiting).toEqual([]);
  });

  it('an empty section prints "no waiting steps"', async () => {
    expect(render(await listed(repo, { waiting: true, phase: 'ship' }))).toBe('no waiting steps\n');
  });
});

describe('task-240 AC 3 — no flag, or both flags, shows both sections (spec-016 §5)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/releases/minor-2.md': element('release', 'minor-2', 'planning') }, 'seed elements');
    commit(repo, { 'docs/plans/pl-1.md': plan('pl-1', 'planning', 'minor-2') }, 'wf(plan): add pl-1');
    recorded(repo, run('task-a', 'green', 1));
  });
  afterAll(() => removeTempDir(repo));

  it.each([
    ['no flag', {}],
    ['both flags', { past: true, waiting: true }],
  ])('%s → baseline, past, waiting and diagnostics; console prints both sections, past first', async (_name, request) => {
    const value = await listed(repo, request);
    expect(Object.keys(value)).toEqual(['baseline', 'past', 'waiting', 'diagnostics']);
    expect(value.past!.map((record) => record.id)).toEqual(['task-a/green/1']);
    expect(value.waiting!.map((step) => step.key)).toEqual(['planning.commit-backlog@release:minor-2']);
    expect(render(value)).toBe(
      ['past runs: 1', 'task-a/green/1  developer  Zed  0  5.1s  1200/340', 'waiting steps: 1', 'planning.commit-backlog@release:minor-2  developer  Zed, Amy', ''].join('\n'),
    );
  });
});

describe('task-240 AC 4 — HEAD, not the working tree (spec-016 §5.1)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    recorded(repo, run('task-a', 'green', 1));
  });
  afterEach(() => removeTempDir(repo));

  it.each([
    ['--past alone (no deduction runs: agent list emits the code itself)', { past: true }],
    ['both sections (the deduction emits it)', {}],
  ])('%s: an uncommitted record is not read, and one W_UNCOMMITTED_INPUTS names the path', async (_name, request) => {
    appendFileSync(join(repo, 'docs/runs/task-a.jsonl'), serializeRunRecord(run('task-a', 'green', 2)));
    writeFileSync(join(repo, 'docs/runs/task-c.jsonl'), serializeRunRecord(run('task-c', 'red', 1)));
    const value = await listed(repo, request);
    expect(value.past!.map((record) => record.id)).toEqual(['task-a/green/1']);
    const uncommitted = value.diagnostics.filter((diagnostic) => diagnostic.code === 'W_UNCOMMITTED_INPUTS');
    expect(uncommitted.map((diagnostic) => diagnostic.file)).toEqual(['docs/runs/task-a.jsonl', 'docs/runs/task-c.jsonl']);
    // Each diagnostic is a success warning too: the console's `warning:` line.
    for (const diagnostic of uncommitted) {
      expect(value.warnings).toContain(`${diagnostic.code} (${diagnostic.file}): ${diagnostic.message}`);
    }
  });

  it('--past alone, with a clean run log: no diagnostic and no warning', async () => {
    const value = await listed(repo, { past: true });
    expect(value.diagnostics).toEqual([]);
    expect(value.warnings).toBeUndefined();
  });
});

describe('task-240 AC 5 — no paths.runs, and a run log that breaks spec-016 §4.5', () => {
  let repo: string;
  afterEach(() => removeTempDir(repo));

  it('missing paths.runs → past is empty, warning "dna.yaml declares no run log (paths.runs)", exit 0', async () => {
    repo = makeTempGitRepo();
    writeProject(repo, null);
    const result = await list(repo, { past: true });
    expect(result.ok).toBe(true);
    expect(exitCodeForResult(result)).toBe(0);
    const value = (result as { value: ListValue }).value;
    expect(value.past).toEqual([]);
    expect((result as { warnings?: readonly string[] }).warnings).toEqual(['dna.yaml declares no run log (paths.runs)']);
    expect(render(value)).toBe('no past runs\n');
  });

  it('a committed line that is not a valid run record → VALIDATION, exit 1, naming the file and the line', async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    recorded(repo, run('task-a', 'green', 1));
    appendFileSync(join(repo, 'docs/runs/task-a.jsonl'), '{"id":"task-a/green/2"}\n');
    commitAll(repo, 'hand-edited run log');
    const result = await list(repo, { past: true });
    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(result).toMatchObject({ error: { code: 'VALIDATION', message: expect.stringMatching(/^run log docs\/runs\/task-a\.jsonl: line 2 is not a valid run record: /) } });
  });

  it('the same run id twice in one committed log → VALIDATION "recorded twice", exit 1', async () => {
    repo = makeTempGitRepo();
    writeProject(repo);
    recorded(repo, run('task-a', 'green', 1));
    appendFileSync(join(repo, 'docs/runs/task-a.jsonl'), serializeRunRecord(run('task-a', 'green', 1)));
    commitAll(repo, 'duplicated record');
    const result = await list(repo, {});
    expect(exitCodeForResult(result)).toBe(1);
    expect(result).toMatchObject({ error: { code: 'VALIDATION', message: 'run log docs/runs/task-a.jsonl: run id task-a/green/1 recorded twice' } });
  });
});

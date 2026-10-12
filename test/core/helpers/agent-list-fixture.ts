/**
 * Shared fixture of the task-240 `agent list` suites added after red (`test/core/agent-list-edges.test.ts`):
 * a copy of `test/core/agent-list.test.ts`'s fixture, kept apart so red's suite stays as committed at red
 * (`tests.unchanged(since: red)`, dev-loop 1.8). Not a `.test.ts` file, so Jest never runs it as a suite.
 */
import { NOT_REPORTED, recordRun, type RunRecord } from '../../../src/agent';
import { CORE_MODULES } from '../../../src/core';
import type { CoreFn, CoreOperation } from '../../../src/core/registry';
import type { CoreResult } from '../../../src/core/types';
import { commitAll, git, writeFixtureFile } from '../../storage/helpers/git-fixture';

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
export function dnaYaml(runs: string | null): string {
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

export function writeProject(root: string, runs: string | null = 'docs/runs/'): void {
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

export function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

export function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

/** Write `files` and commit them with `subject`. */
export function commit(root: string, files: Record<string, string>, subject: string): void {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', subject]);
}

/** A complete, valid record; `overrides` replaces whole fields. */
export function run(elementId: string, phase: string, n: number, overrides: Partial<RunRecord> = {}): RunRecord {
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

export function recorded(root: string, record: RunRecord, dir = 'docs/runs'): void {
  const result = recordRun(root, `${dir}/${record.id.split('/')[0]}.jsonl`, record);
  if (!result.ok) throw new Error(`fixture: recordRun refused: ${result.error.message}`);
}

export interface WaitingStep {
  readonly instance: string;
  readonly key: string;
  readonly workflow: string;
  readonly phase: string;
  readonly element: string | null;
  readonly role: string;
  readonly allowedModes: readonly string[];
  readonly agents: readonly string[];
}

export interface ListValue {
  readonly baseline: { readonly rev: string; readonly commit: string };
  readonly past?: readonly RunRecord[];
  readonly waiting?: readonly WaitingStep[];
  readonly diagnostics: readonly { readonly code: string; readonly file?: string; readonly message: string }[];
}

export function agentListOperation(): CoreOperation {
  const operation = CORE_MODULES.find((module) => module.name === 'agent')?.operations['agentList'];
  if (!operation) throw new Error('"agentList" is not registered on the agent module');
  return operation;
}

export interface Request {
  readonly past?: boolean;
  readonly waiting?: boolean;
  readonly element?: string;
  readonly phase?: string;
}

/** The operation's result, normalized to a `CoreResult` (a bare value is a success). */
export async function list(root: string, request: Request = {}): Promise<CoreResult<ListValue>> {
  const { element: elementOption, phase, ...flags } = request;
  const options = { ...(elementOption === undefined ? {} : { element: elementOption }), ...(phase === undefined ? {} : { phase }) };
  const value = await (agentListOperation().fn as CoreFn<unknown, ListValue>)({ root, options, ...flags });
  return (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<ListValue>;
}

export async function listed(root: string, request: Request = {}): Promise<ListValue & { readonly warnings?: readonly string[] }> {
  const result = await list(root, request);
  if (!result.ok) throw new Error(`agent list refused: ${result.error.message}`);
  return { ...result.value, ...(result.warnings === undefined ? {} : { warnings: result.warnings }) };
}

export const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();

export const render = (value: unknown): string => agentListOperation().renderConsole!(value);


/**
 * task-204 — `wingfoil workflow list` reshaped and `wingfoil workflow show` added, both answering from
 * `HEAD` (`spec-017` §1.1 ruling R15, §7.5, §7.6, §8, §10; BDD P4.6, P4.7), through the `CORE_MODULES`
 * operations the CLI and MCP register.
 *
 * - AC 1: BDD P4.6 sc. 1–4 — the startable workflows, an includable one when it is the current phase's sub on
 *   an open instance's frontier, `--all`, and `no workflows defined`; each entry's five fields.
 * - AC 2: BDD P4.7 sc. 1–3 — the resolved declaration, subs nested under their phase, `unknown workflow`.
 * - AC 3: a `spec-003` error refuses both with `VALIDATION` and every diagnostic; warnings are listed; the
 *   answer is `HEAD`'s whatever the working tree holds (`W_UNCOMMITTED_INPUTS`).
 * - bug-281: a core check that did not run for want of `dna.yaml` / `memory.yaml` says so.
 *
 * The CLI bytes and exit codes are `test/cli/workflow-list-show.integration.test.ts`.
 */
import { rmSync } from 'fs';
import { join } from 'path';

import { CORE_MODULES, deduceWorkflowStateAtHead, type CoreResult } from '../../src/core';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
      waiting: [ backlog, approved ]
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Roberto
      email: roberto@example.invalid
      roles: [ developer, approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: approver
paths:
  sources: [ src/ ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
  reviewer: [ code-review ]
global: [ security ]
`;

function directive(id: string, title: string): string {
  return `---\nid: ${id}\nname: "${title}"\ntype: directive\nkind: custom\ntitle: "${title}"\n---\n\n# ${title}\n`;
}

/** BDD P4.6/P4.7 Background: the mains `release-cycle` and `report-bug`, the sub `dev-loop`. */
const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
description: "Deliver one release"
phases:
  - name: plan
    role: developer
    actions:
      - element.set_state(in-development)
    approval: { by_role: approver }
  - name: develop
    include: dev-loop
  - name: ship
    actions:
      - element.set_state(released)
    cadence: { recurring: { on: release-released } }
`;

const DEV_LOOP = `name: dev-loop
includable: true
description: "Implement one change test-first"
phases:
  - name: red
    role: developer
    checks:
      pre: [ "tests.unit.run" ]
  - name: review
    role: reviewer
    mode: fresh
    distinct_from: [ red ]
    produces: [ "docs/reviews/{id}.md" ]
    fallback: { step: red }
`;

const REPORT_BUG = `name: report-bug
startable: true
phases:
  - name: capture
    actions:
      - "memory.add(type: task)"
    awaits: { party: "upstream", evidence: "upstream.answered" }
`;

/** A main whose current phase iterates: the leaf step task-198 reports unexpanded (task-202 expands it). */
const SPRINT = `name: sprint
startable: true
element: release
phases:
  - name: tasks
    iterate_over: task
    where: { release: "{id}", status: [ backlog ] }
    include: task-loop
  - name: sweep
    where: { type: task, status: [ pending ] }
    actions:
      - memory.approve
`;

const TASK_LOOP = `name: task-loop
includable: true
element: task
phases:
  - name: work
    actions:
      - element.set_state(in-progress)
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/release-cycle.yaml': RELEASE_CYCLE,
  'workflows/custom/dev-loop.yaml': DEV_LOOP,
  'workflows/custom/report-bug.yaml': REPORT_BUG,
  'workflows/custom/sprint.yaml': SPRINT,
  'workflows/custom/task-loop.yaml': TASK_LOOP,
};

function manifest(files: readonly string[]): string {
  return `version: 1.0\ninclude:\n${files.map((file) => `  - ${file}\n`).join('')}`;
}

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId: string): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

/** The fixture configuration, committed; `workflows` picks the files the manifest includes. */
function writeProject(root: string, workflows: readonly string[] = Object.keys(WORKFLOWS)): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', manifest(workflows));
  for (const file of workflows) writeFixtureFile(root, `.wingfoil/${file}`, WORKFLOWS[file]!);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', directive('testing', 'Testing'));
  writeFixtureFile(root, '.wingfoil/directives/custom/code-review.md', directive('code-review', 'Code review'));
  writeFixtureFile(root, '.wingfoil/directives/custom/security.md', directive('security', 'Security'));
  writeFixtureFile(root, 'README.md', '# fixture\n');
  commitAll(root, 'fixture configuration');
}

function commitFiles(root: string, files: Record<string, string>, message: string): void {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  commitAll(root, message);
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();

function operation(name: 'workflowList' | 'workflowShow') {
  const op = CORE_MODULES.find((module) => module.name === 'workflow')?.operations[name];
  if (op === undefined) throw new Error(`workflow.${name} is not registered in CORE_MODULES`);
  return op;
}

interface ListEntry {
  name: string;
  startable: boolean;
  includable: boolean;
  description: string | null;
  executableNow: boolean;
}
interface ListValue {
  baseline: { rev: string; commit: string };
  workflows: ListEntry[];
  message?: string;
  diagnostics: { code: string; severity: string; file: string; path: string; message: string }[];
}

async function list(root: string, all = false): Promise<CoreResult<ListValue>> {
  return (await operation('workflowList').fn(all ? { root, all: true } : { root })) as CoreResult<ListValue>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the show payload is asserted field by field
async function show(root: string, ref: string): Promise<CoreResult<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await operation('workflowShow').fn({ root, positional: ref })) as CoreResult<any>;
}

function ok<T>(result: CoreResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

const names = (value: ListValue): string[] => value.workflows.map((entry) => entry.name);

describe('task-204 AC 1 — BDD P4.6: wingfoil workflow list (spec-017 §7.5, §8 ListResult)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('sc. 1 — lists only the startable workflows when no instance is open; the subs are not listed', async () => {
    const value = ok(await list(repo));
    expect(names(value)).toEqual(['release-cycle', 'report-bug', 'sprint']);
    expect(value.workflows).toEqual([
      { name: 'release-cycle', startable: true, includable: false, description: 'Deliver one release', executableNow: true },
      { name: 'report-bug', startable: true, includable: false, description: null, executableNow: true },
      { name: 'sprint', startable: true, includable: false, description: null, executableNow: true },
    ]);
    expect(value.baseline).toEqual({ rev: 'HEAD', commit: head(repo) });
    expect(value.message).toBeUndefined();
  });

  it('sc. 3 — --all lists every loaded workflow, by name, each with its five fields', async () => {
    const value = ok(await list(repo, true));
    expect(value.workflows).toEqual([
      { name: 'dev-loop', startable: false, includable: true, description: 'Implement one change test-first', executableNow: false },
      { name: 'release-cycle', startable: true, includable: false, description: 'Deliver one release', executableNow: true },
      { name: 'report-bug', startable: true, includable: false, description: null, executableNow: true },
      { name: 'sprint', startable: true, includable: false, description: null, executableNow: true },
      { name: 'task-loop', startable: false, includable: true, description: null, executableNow: false },
    ]);
  });

  it('the payload carries the registry warnings in diagnostics (an unbound check token), exit 0', async () => {
    const value = ok(await list(repo));
    expect(value.diagnostics.map((d) => d.code)).toContain('W_WORKFLOW_UNBOUND_TOKEN');
    expect(value.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });
});

describe('task-204 AC 1 — BDD P4.6 sc. 2: a sub appears when it is the next step of an open instance', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    // release-cycle on rel-1: `plan` is complete (in-development), `develop` enters dev-loop.
    commitFiles(repo, { 'docs/releases/rel-1.md': element('release', 'rel-1', 'in-development') }, 'release');
    commitFiles(repo, { 'docs/plans/rc-plan.md': plan('rc-plan', 'release-cycle', 'rel-1') }, 'start release-cycle');
  });
  afterAll(() => removeTempDir(repo));

  it('the frontier of the open instance enters dev-loop, so dev-loop is listed as executable now', async () => {
    const frontier = deduceWorkflowStateAtHead(repo).instances[0]!.frontier;
    expect(frontier.map((step) => step.key)).toEqual(['dev-loop.red@release:rel-1']);
    const value = ok(await list(repo));
    expect(names(value)).toEqual(['dev-loop', 'release-cycle', 'report-bug', 'sprint']);
    expect(value.workflows[0]).toEqual({
      name: 'dev-loop',
      startable: false,
      includable: true,
      description: 'Implement one change test-first',
      executableNow: true,
    });
    // --all: the sub no open frontier enters stays listed, not executable now.
    const all = ok(await list(repo, true));
    expect(all.workflows.find((entry) => entry.name === 'task-loop')?.executableNow).toBe(false);
  });

  it('an iterate_over phase on the frontier makes its sub executable now (the leaf the deduction reports)', async () => {
    const iterating = makeTempGitRepo();
    try {
      writeProject(iterating);
      commitFiles(iterating, { 'docs/releases/rel-2.md': element('release', 'rel-2', 'in-development') }, 'release');
      commitFiles(iterating, { 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog', 'release: "rel-2"\n') }, 'task');
      commitFiles(iterating, { 'docs/plans/sprint-plan.md': plan('sprint-plan', 'sprint', 'rel-2') }, 'start sprint');
      const value = ok(await list(iterating));
      expect(names(value)).toEqual(['release-cycle', 'report-bug', 'sprint', 'task-loop']);
      expect(value.workflows.find((entry) => entry.name === 'task-loop')?.executableNow).toBe(true);
      expect(value.workflows.find((entry) => entry.name === 'dev-loop')).toBeUndefined();
    } finally {
      removeTempDir(iterating);
    }
  });
});

describe('task-204 AC 1 — BDD P4.6 sc. 4: no workflows defined', () => {
  it('a repository whose HEAD holds no manifest: zero workflows, exit 0, "no workflows defined"', async () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, 'README.md', '# empty\n');
      commitAll(repo, 'no workflows');
      const value = ok(await list(repo));
      expect(value.workflows).toEqual([]);
      expect(value.message).toBe('no workflows defined');
      expect(value.baseline).toEqual({ rev: 'HEAD', commit: head(repo) });
      expect(ok(await list(repo, true)).message).toBe('no workflows defined');
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-204 AC 2 — BDD P4.7: wingfoil workflow show (spec-017 §7.6)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(repo, { 'docs/releases/rel-1.md': element('release', 'rel-1', 'in-development') }, 'release');
    commitFiles(repo, { 'docs/plans/rc-plan.md': plan('rc-plan', 'release-cycle', 'rel-1') }, 'start release-cycle');
  });
  afterAll(() => removeTempDir(repo));

  it('sc. 1 — each phase with its role, the role directives, actions with bindings and the Memory evidence', async () => {
    const value = ok(await show(repo, 'release-cycle'));
    expect(value.baseline).toEqual({ rev: 'HEAD', commit: head(repo) });
    const workflow = value.workflow;
    expect(workflow).toMatchObject({
      name: 'release-cycle',
      file: '.wingfoil/workflows/custom/release-cycle.yaml',
      startable: true,
      includable: false,
      description: 'Deliver one release',
      element: 'release',
    });
    expect(workflow.phases.map((phase: { name: string }) => phase.name)).toEqual(['plan', 'develop', 'ship']);
    const [planPhase, , ship] = workflow.phases;
    expect(planPhase).toMatchObject({
      name: 'plan',
      role: 'developer',
      directives: [
        { id: 'security', title: 'Security' },
        { id: 'testing', title: 'Testing' },
      ],
      directiveWarnings: [],
      actions: [{ token: 'element.set_state(in-development)', binding: { kind: 'manual', source: 'built-in' } }],
      approval: { byRole: 'approver' },
      awaits: null,
      fallback: null,
      iterate: null,
      selection: null,
      include: null,
      sub: null,
      evidence: ['state'],
      cadence: 'once',
    });
    expect(ship).toMatchObject({ role: null, directives: [], evidence: ['state'], cadence: { recurring: { on: 'release-released' } } });
  });

  it('sc. 2 — the included sub is shown nested under its phase, with its own phases resolved', async () => {
    const develop = ok(await show(repo, 'release-cycle')).workflow.phases[1];
    expect(develop).toMatchObject({ name: 'develop', include: 'dev-loop', evidence: ['include'] });
    expect(develop.sub).toMatchObject({ name: 'dev-loop', startable: false, includable: true, element: null });
    const [red, review] = develop.sub.phases;
    expect(red).toMatchObject({
      name: 'red',
      role: 'developer',
      checks: { pre: [{ token: 'tests.unit.run', binding: { kind: 'unbound', source: 'none' }, evaluated: false }], post: [] },
      evidence: ['record'],
    });
    expect(review).toMatchObject({
      name: 'review',
      role: 'reviewer',
      directives: [
        { id: 'code-review', title: 'Code review' },
        { id: 'security', title: 'Security' },
      ],
      mode: 'fresh',
      allowedModes: ['fresh'],
      distinctFrom: ['red'],
      produces: [{ pattern: 'docs/reviews/{id}.md', owner: 'release', evidence: true }],
      fallback: { step: 'red', setState: null },
      evidence: ['produces'],
    });
  });

  it('every phase evidence kind equals what the deduction reports for the same step (one rule, spec-017 §4.3)', async () => {
    const step = deduceWorkflowStateAtHead(repo).instances[0]!.frontier[0]!;
    const red = ok(await show(repo, 'release-cycle')).workflow.phases[1].sub.phases[0];
    expect(step.key).toBe('dev-loop.red@release:rel-1');
    expect(red.evidence).toEqual(step.evidence.kinds);
  });

  it('a self-creating main, an awaits, an iterate_over and a selection are shown as declared', async () => {
    const reportBug = ok(await show(repo, 'report-bug')).workflow.phases[0];
    expect(reportBug).toMatchObject({
      actions: [{ token: 'memory.add(type: task)', binding: { kind: 'wingfoil', argv: ['wingfoil', 'memory', 'add', '--type', 'task'] } }],
      awaits: { party: 'upstream', evidence: { token: 'upstream.answered', binding: { kind: 'unbound' }, evaluated: false } },
      evidence: ['created', 'awaits', 'record'],
    });
    const [tasks, sweep] = ok(await show(repo, 'sprint')).workflow.phases;
    expect(tasks).toMatchObject({
      iterate: { over: 'task', where: { release: '{id}', status: ['backlog'] } },
      selection: null,
      include: 'task-loop',
      evidence: ['include'],
    });
    expect(tasks.sub).toMatchObject({ name: 'task-loop', element: 'task' });
    expect(sweep).toMatchObject({ iterate: null, selection: { where: { type: 'task', status: ['pending'] } }, evidence: ['selection'] });
  });

  it('<ref> may name an open instance, standing for its workflow (spec-017 §7)', async () => {
    expect(ok(await show(repo, 'rc-plan')).workflow.name).toBe('release-cycle');
  });

  it('sc. 3 — an unknown workflow: NOT_FOUND, "unknown workflow: ghost"', async () => {
    const result = await show(repo, 'ghost');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: ghost' });
  });
});

describe('task-204 AC 3 — errors refuse both, warnings are listed, and the answer is HEAD\'s', () => {
  const BROKEN = RELEASE_CYCLE.replace('role: developer', 'role: nonexistent-role');

  it('a spec-003 error committed at HEAD: VALIDATION, every diagnostic in details — even when the working tree fixed it', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commitFiles(repo, { '.wingfoil/workflows/custom/release-cycle.yaml': BROKEN }, 'break release-cycle');
      writeFixtureFile(repo, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE); // fixed, uncommitted
      for (const result of [await list(repo), await list(repo, true), await show(repo, 'dev-loop')]) {
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain("unknown role 'nonexistent-role'");
        const diagnostics = (result.error.details as { diagnostics: { code: string }[] }).diagnostics;
        expect(diagnostics.map((d) => d.code)).toContain('E_PHASE_ROLE_UNKNOWN');
        expect(diagnostics.map((d) => d.code)).toContain('W_WORKFLOW_UNBOUND_TOKEN');
      }
    } finally {
      removeTempDir(repo);
    }
  });

  it('an error only in the working tree: HEAD answers, exit 0, the dirty file named by W_UNCOMMITTED_INPUTS', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      writeFixtureFile(repo, '.wingfoil/workflows/custom/release-cycle.yaml', BROKEN); // uncommitted
      const listed = ok(await list(repo));
      expect(names(listed)).toEqual(['release-cycle', 'report-bug', 'sprint']);
      const uncommitted = listed.diagnostics.filter((d) => d.code === 'W_UNCOMMITTED_INPUTS');
      expect(uncommitted.map((d) => d.file)).toEqual(['.wingfoil/workflows/custom/release-cycle.yaml']);
      const shown = ok(await show(repo, 'release-cycle'));
      expect(shown.workflow.phases[0].role).toBe('developer');
      expect(shown.diagnostics.map((d: { code: string }) => d.code)).toContain('W_UNCOMMITTED_INPUTS');
    } finally {
      removeTempDir(repo);
    }
  });

  it('a workflow only the working tree declares is unknown to show (HEAD decides)', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, ['workflows/custom/release-cycle.yaml', 'workflows/custom/dev-loop.yaml']);
      writeFixtureFile(repo, '.wingfoil/workflows.yaml', manifest(['workflows/custom/release-cycle.yaml', 'workflows/custom/dev-loop.yaml', 'workflows/custom/report-bug.yaml']));
      writeFixtureFile(repo, '.wingfoil/workflows/custom/report-bug.yaml', REPORT_BUG);
      const result = await show(repo, 'report-bug');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ code: 'NOT_FOUND', message: 'unknown workflow: report-bug' });
      expect(names(ok(await list(repo)))).toEqual(['release-cycle']);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('bug-281 — a core check that did not run says so (spec-003 "Where each check runs")', () => {
  it('dna.yaml absent at HEAD: W_WORKFLOW_CHECKS_NOT_RUN for dna.yaml, exit 0, the role error not decided', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commitFiles(repo, { '.wingfoil/workflows/custom/release-cycle.yaml': RELEASE_CYCLE.replace('role: developer', 'role: nonexistent-role') }, 'unknown role');
      rmSync(join(repo, '.wingfoil/dna.yaml'));
      commitAll(repo, 'remove dna.yaml');
      const value = ok(await list(repo));
      const skipped = value.diagnostics.filter((d) => d.code === 'W_WORKFLOW_CHECKS_NOT_RUN');
      expect(skipped).toEqual([
        {
          code: 'W_WORKFLOW_CHECKS_NOT_RUN',
          severity: 'warning',
          file: 'dna.yaml',
          path: '',
          message: 'dna.yaml is absent: the role, approver and dna: collection checks were not run',
        },
      ]);
    } finally {
      removeTempDir(repo);
    }
  });

  it('memory.yaml absent at HEAD: W_WORKFLOW_CHECKS_NOT_RUN for memory.yaml', async () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, ['workflows/custom/report-bug.yaml']);
      rmSync(join(repo, '.wingfoil/memory.yaml'));
      commitAll(repo, 'remove memory.yaml');
      const value = ok(await list(repo));
      expect(value.diagnostics.filter((d) => d.code === 'W_WORKFLOW_CHECKS_NOT_RUN')).toEqual([
        {
          code: 'W_WORKFLOW_CHECKS_NOT_RUN',
          severity: 'warning',
          file: 'memory.yaml',
          path: '',
          message: 'memory.yaml is absent: the type, cadence event, token, exit state and fallback checks were not run',
        },
      ]);
    } finally {
      removeTempDir(repo);
    }
  });
});

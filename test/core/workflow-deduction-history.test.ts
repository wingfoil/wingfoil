/**
 * task-203 — the instance history walk of workflow state deduction (`spec-017` §3.4 "Self-creating",
 * §4.3 `created`, §4.8 linkage, records and re-entries, §5.2 fallback), read at `HEAD` through the
 * `src/core` barrel, on fixture repositories.
 *
 * - AC 1: a self-creating instance (an ingest main) is unbound until an add commit carrying its
 *   `WingFoil-Instance` / `WingFoil-Step` trailers creates its element; the creating step then
 *   completes from `created` evidence; a second linked element is listed in `Instance.created` and
 *   does not rebind (§3.4).
 * - AC 2: after `wf(task): reject <id> [in-review → in-progress]` — or a `park` subject — in a
 *   dev-loop-shaped pass, the phases before `fallback.step` keep their evidence, `red` needs a record
 *   newer than the re-entry and `review` a new `submit` (§4.8 example, §5.2).
 * - AC 3: a record, a linkage or a re-entry older than the instance's start commit does not count.
 * - AC 4: recomputing the deduction at a fixed commit gives the same answer (REQ-SYS-03,
 *   REQ-STATE-02); the SARD wording is `test/docs/sard-state-from-history.test.ts`.
 * - AC 5: one `git log` for the union of the open instances' walks, plus one lookup per re-entered
 *   element — no per-instance `rev-list` — through the shared git helper (`bug-093`, `task-142`).
 */
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { deduceWorkflowStateAtHead, type Deduction, type InstanceDeduction } from '../../src/core';
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
      waiting: [ backlog ]
      returns: { in-review: in-progress }
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, triaged, closed ]
      gates:
        open: { reject: closed }
  spec:
    path: "docs/specs/{id}.md"
    states:
      sequence: [ draft, pending, approved ]
      gates:
        pending: { reject: draft }
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
    - name: approver
paths:
  sources: [ src/ ]
`;

/** An ingest main: no `element:`, its first phase adds a bug (`bug-ingest.yaml`'s shape). */
const CAPTURE = `name: capture-flow
kind: main
description: Capture a single bug.
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
    produces:
      - "docs/bugs/{id}.md"
  - name: triage
    actions:
      - memory.approve
    approval: { by_role: approver }
`;

/** A dev-loop-shaped main bound to a task: start, design (adds specs), red, review (falls back to red), done. */
const LOOP = `name: loop
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: design
    actions:
      - agent.execute
      - 'memory.add(type: spec)'
      - memory.submit
    produces:
      - { type: spec, path: "docs/specs/{spec.id}.md" }
  - name: red
    actions:
      - agent.execute
  - name: review
    actions:
      - memory.submit
    approval: { by_role: approver }
    fallback: { step: red, set_state: in-progress }
  - name: done
    actions:
      - memory.approve
      - element.set_state(done)
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, elementId = ''): string {
  return element('plan', id, 'active', `workflow: "${workflow}"\nphase: "x"\nelement: "${elementId}"\n`);
}

function writeProject(root: string): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/capture-flow.yaml\n  - workflows/custom/loop.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/capture-flow.yaml', CAPTURE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/loop.yaml', LOOP);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  commitAll(root, 'fixture configuration');
}

/** Write `files` and commit them with `subject` and, when given, a trailer block. Returns the new sha. */
function commit(root: string, files: Record<string, string>, subject: string, trailers: Record<string, string> = {}): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, ['add', '-A']);
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '--quiet', '-m', subject, ...(block === '' ? [] : ['-m', block])]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/** A phase record (`spec-003` § "Evidence") of `step` on `element` (`<type>:<id>`), as `workflow finalize` writes it. */
function record(root: string, instance: string, step: string, scope: string | null): string {
  return commit(root, {}, `workflow: finalize ${instance} ${step}`, {
    'WingFoil-Phase': `${step} completed`,
    'WingFoil-Instance': instance,
    ...(scope === null ? {} : { 'WingFoil-Element': scope }),
  });
}

function only(deduction: Deduction, id: string): InstanceDeduction {
  const found = deduction.instances.find((entry) => entry.instance.id === id);
  if (!found) throw new Error(`no instance ${id} in ${JSON.stringify(deduction.instances.map((entry) => entry.instance.id))}`);
  return found;
}

const keys = (instance: InstanceDeduction): string[] => instance.frontier.map((step) => step.key);
const states = (instance: InstanceDeduction): string[] => instance.phases.map((phase) => `${phase.phase}:${phase.state}`);

describe('task-203 AC 1 — a self-creating instance binds the element its creating step adds (spec-017 §3.4, §4.3 created, §4.8 linkage)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
  });
  afterAll(() => removeTempDir(repo));

  const ingest = (): InstanceDeduction => only(deduceWorkflowStateAtHead(repo), 'ing-1');

  it('with no linked add: `element: null`, nothing created, frontier `capture-flow.capture`', () => {
    // An add commit that carries no linkage, or another instance's, binds nothing.
    commit(repo, { 'docs/bugs/bug-9.md': element('bug', 'bug-9', 'draft') }, 'wf(bug): add bug-9');
    commit(repo, { 'docs/bugs/bug-8.md': element('bug', 'bug-8', 'draft') }, 'wf(bug): add bug-8', {
      'WingFoil-Instance': 'ing-other',
      'WingFoil-Step': 'capture-flow.capture',
    });
    const instance = ingest();
    expect(instance.instance).toMatchObject({ element: null, created: [] });
    expect(keys(instance)).toEqual(['capture-flow.capture']);
  });

  it('an add commit carrying the instance and step trailers binds the bug; `capture` completes from `created` evidence', () => {
    commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'draft') }, 'wf(bug): add bug-1', {
      'WingFoil-Instance': 'ing-1',
      'WingFoil-Step': 'capture-flow.capture',
    });
    let instance = ingest();
    expect(instance.instance.element).toEqual({ type: 'bug', id: 'bug-1', status: 'draft' });
    expect(instance.instance.created).toEqual([{ type: 'bug', id: 'bug-1', status: 'draft' }]);
    // Created but still `draft`: the phase leaves it `open` (§4.4), so `created` is not yet satisfied.
    expect(keys(instance)).toEqual(['capture-flow.capture@bug:bug-1']);
    expect(instance.frontier[0]!.created).toEqual([{ type: 'bug', id: 'bug-1', status: 'draft' }]);
    expect(instance.frontier[0]!.evidence).toEqual({ kinds: ['created', 'produces'], missing: ['created'], finalizable: false });

    commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): submit bug-1');
    instance = ingest();
    expect(states(instance)).toEqual(['capture:complete', 'triage:current']);
    expect(keys(instance)).toEqual(['capture-flow.triage@bug:bug-1']);
  });

  it('a second linked bug is listed in `Instance.created` and does not rebind', () => {
    commit(repo, { 'docs/bugs/bug-2.md': element('bug', 'bug-2', 'open') }, 'wf(bug): add bug-2', {
      'WingFoil-Instance': 'ing-1',
      'WingFoil-Step': 'capture-flow.capture',
    });
    const instance = ingest();
    expect(instance.instance.element).toEqual({ type: 'bug', id: 'bug-1', status: 'open' });
    expect(instance.instance.created).toEqual([
      { type: 'bug', id: 'bug-1', status: 'open' },
      { type: 'bug', id: 'bug-2', status: 'open' },
    ]);
    expect(keys(instance)).toEqual(['capture-flow.triage@bug:bug-1']);
  });

  it('a step of a bound instance lists what it created; a `{ type, path }` entry resolves against each created element', () => {
    const loop = makeTempGitRepo();
    try {
      writeProject(loop);
      commit(loop, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'task');
      commit(loop, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
      // `design` with nothing created and no other evidence completes only by a record (§4.3).
      let step = only(deduceWorkflowStateAtHead(loop), 'loop-1').frontier[0]!;
      expect([step.key, step.evidence]).toEqual(['loop.design@task:task-1', { kinds: ['created', 'record'], missing: ['record'], finalizable: true }]);

      commit(loop, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'draft') }, 'wf(spec): add spec-1', {
        'WingFoil-Instance': 'loop-1',
        'WingFoil-Step': 'loop.design@task:task-1',
      });
      step = only(deduceWorkflowStateAtHead(loop), 'loop-1').frontier[0]!;
      expect(step.key).toBe('loop.design@task:task-1');
      expect(step.created).toEqual([{ type: 'spec', id: 'spec-1', status: 'draft' }]);
      expect(step.produces).toEqual([{ pattern: 'docs/specs/{spec.id}.md', owner: 'spec', resolved: ['docs/specs/spec-1.md'], exists: true, evidence: false }]);
      expect(step.evidence).toEqual({ kinds: ['created'], missing: ['created'], finalizable: false });

      commit(loop, { 'docs/specs/spec-1.md': element('spec', 'spec-1', 'pending') }, 'wf(spec): submit spec-1');
      const instance = only(deduceWorkflowStateAtHead(loop), 'loop-1');
      expect(keys(instance)).toEqual(['loop.red@task:task-1']);
      expect(instance.instance.created).toEqual([{ type: 'spec', id: 'spec-1', status: 'pending' }]);
    } finally {
      removeTempDir(loop);
    }
  });
});

describe.each(['reject', 'park'])('task-203 AC 2 — re-entry after a `%s` (spec-017 §4.8, §5.2)', (verb) => {
  let repo: string;
  let reentry: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog') }, 'task');
    commit(repo, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): start task-1 [backlog → in-progress]');
    record(repo, 'loop-1', 'loop.design', 'task:task-1');
    record(repo, 'loop-1', 'loop.red', 'task:task-1');
    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1');
  });
  afterAll(() => removeTempDir(repo));

  const loop = (): InstanceDeduction => only(deduceWorkflowStateAtHead(repo), 'loop-1');

  it('before the re-entry the pass waits on `done`', () => {
    expect(keys(loop())).toEqual(['loop.done@task:task-1']);
    expect(loop().frontier[0]).toMatchObject({ reentered: false, reentryCommit: null });
  });

  it('after it, `start` and `design` stay complete and `red` needs a new record', () => {
    reentry = commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, `wf(task): ${verb} task-1 [in-review → in-progress]`, {
      Reason: 'the tests do not cover the second criterion.',
    });
    const instance = loop();
    expect(states(instance)).toEqual(['start:complete', 'design:complete', 'red:current', 'review:pending', 'done:pending']);
    expect(keys(instance)).toEqual(['loop.red@task:task-1']);
    expect(instance.frontier[0]).toMatchObject({ reentered: true, reentryCommit: reentry, evidence: { kinds: ['record'], missing: ['record'], finalizable: true } });
  });

  it('a new record completes `red`; `review` then needs a new `submit`', () => {
    record(repo, 'loop-1', 'loop.red', 'task:task-1');
    let instance = loop();
    expect(keys(instance)).toEqual(['loop.review@task:task-1']);
    expect(instance.frontier[0]).toMatchObject({ reentered: true, reentryCommit: reentry, evidence: { kinds: ['state'], missing: ['state'] } });

    commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1');
    instance = loop();
    expect(keys(instance)).toEqual(['loop.done@task:task-1']);
    expect(instance.frontier[0]).toMatchObject({ reentered: false, reentryCommit: null });
  });
});

describe('task-203 AC 3 — a record, linkage or re-entry older than the start commit does not count (spec-017 §4.8)', () => {
  it('an add commit linked to the instance id before the plan existed binds nothing', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1', {
        'WingFoil-Instance': 'ing-1',
        'WingFoil-Step': 'capture-flow.capture',
      });
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      const instance = only(deduceWorkflowStateAtHead(repo), 'ing-1');
      expect(instance.instance).toMatchObject({ element: null, created: [] });
      expect(keys(instance)).toEqual(['capture-flow.capture']);
    } finally {
      removeTempDir(repo);
    }
  });

  it('a reject before the start re-enters nothing, and a record before it does not complete a step', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'task');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): reject task-1 [in-review → in-progress]');
      record(repo, 'loop-1', 'loop.design', 'task:task-1');
      commit(repo, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
      let instance = only(deduceWorkflowStateAtHead(repo), 'loop-1');
      expect(keys(instance)).toEqual(['loop.design@task:task-1']);
      expect(instance.frontier[0]).toMatchObject({ reentered: false, reentryCommit: null });

      record(repo, 'loop-1', 'loop.design', 'task:task-1');
      instance = only(deduceWorkflowStateAtHead(repo), 'loop-1');
      expect(keys(instance)).toEqual(['loop.red@task:task-1']);
      expect(instance.frontier[0]).toMatchObject({ reentered: false, reentryCommit: null });
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-203 AC 4 — the deduction is recomputable at a fixed commit (REQ-SYS-03, REQ-STATE-02)', () => {
  it('two computations at one commit agree, before and after later history exists', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'task');
      commit(repo, { 'docs/plans/loop-1.md': plan('loop-1', 'loop', 'task-1') }, 'wf(plan): add loop-1');
      commit(repo, { 'docs/plans/ing-1.md': plan('ing-1', 'capture-flow') }, 'wf(plan): add ing-1');
      commit(repo, { 'docs/bugs/bug-1.md': element('bug', 'bug-1', 'open') }, 'wf(bug): add bug-1', { 'WingFoil-Instance': 'ing-1', 'WingFoil-Step': 'capture-flow.capture' });
      record(repo, 'loop-1', 'loop.design', 'task:task-1');
      record(repo, 'loop-1', 'loop.red', 'task:task-1');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1');
      const fixed = commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress') }, 'wf(task): reject task-1 [in-review → in-progress]');

      const first = JSON.stringify(deduceWorkflowStateAtHead(repo));
      expect(JSON.stringify(deduceWorkflowStateAtHead(repo))).toBe(first);
      expect(first).toContain('"reentered":true');
      expect(first).toContain('"element":{"type":"bug","id":"bug-1","status":"open"}');

      record(repo, 'loop-1', 'loop.red', 'task:task-1');
      commit(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'in-review') }, 'wf(task): submit task-1');
      expect(JSON.stringify(deduceWorkflowStateAtHead(repo))).not.toBe(first);

      git(repo, ['checkout', '--quiet', '--detach', fixed]);
      expect(JSON.stringify(deduceWorkflowStateAtHead(repo))).toBe(first);
    } finally {
      removeTempDir(repo);
    }
  });
});

describe('task-203 AC 5 — one walk for the union of the open instances, one lookup per re-entered element (spec-017 §4.8 cost)', () => {
  /** The argv of every git process the deduction spawns, through a `git` shim first on `PATH`. */
  function spawned(repo: string): string[] {
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    const shim = mkdtempSync(join(tmpdir(), 'wf-git-shim-'));
    const log = join(shim, 'invocations.log');
    writeFileSync(join(shim, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${realGit}' "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    writeFileSync(log, '');
    const saved = process.env.PATH;
    process.env.PATH = `${shim}:${saved ?? ''}`;
    try {
      deduceWorkflowStateAtHead(repo);
      return readFileSync(log, 'utf-8')
        .split('\n')
        .filter((line) => line.length > 0);
    } finally {
      process.env.PATH = saved;
      removeTempDir(shim);
    }
  }

  it('reads history once whatever the number of open instances, and looks up only the re-entered element', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo);
      for (const n of [1, 2, 3]) {
        commit(repo, { [`docs/tasks/task-${n}.md`]: element('task', `task-${n}`, 'in-review') }, `task-${n}`);
        commit(repo, { [`docs/plans/loop-${n}.md`]: plan(`loop-${n}`, 'loop', `task-${n}`) }, `wf(plan): add loop-${n}`);
        record(repo, `loop-${n}`, 'loop.design', `task:task-${n}`);
      }
      commit(repo, { 'docs/tasks/task-2.md': element('task', 'task-2', 'in-progress') }, 'wf(task): reject task-2 [in-review → in-progress]');

      const argv = spawned(repo);
      expect(argv.filter((line) => line.startsWith('rev-list'))).toEqual([]);
      // The walk: the one `git log` that reads parents, subjects and trailers.
      expect(argv.filter((line) => line.startsWith('log') && line.includes('%P'))).toHaveLength(1);
      // The lookup: the latest commit that changed the re-entered element's file.
      const lookups = argv.filter((line) => line.startsWith('log') && line.includes('-1 '));
      expect(lookups).toHaveLength(1);
      expect(lookups[0]).toContain('docs/tasks/task-2.md');
    } finally {
      removeTempDir(repo);
    }
  });

  it('runs git only through the shared helper that captures stderr (`bug-093`)', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'src', 'core', 'workflow-deduction.ts'), 'utf-8');
    expect(source).not.toMatch(/child_process/);
    expect(source).toMatch(/runGitRead\(/);
  });
});

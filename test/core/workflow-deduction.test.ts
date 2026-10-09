/**
 * task-198 — workflow state deduction at `HEAD` (`spec-017` §1, §3.1–§3.5, §4.1–§4.5, §4.8 records,
 * §4.9; `adr-007`, `adr-008`; P4.13, P4.11), through the `src/core` barrel the workflow commands
 * (`next`, `status`, `list`, the MCP Resources, `agent execute --next`) consume.
 *
 * - AC 1: open instances, their start order and the active one; `<ref>` resolution.
 * - AC 2: the evidence kinds `state`, `produces`, `selection`, `include`, `record`; an implicit-owner
 *   `produces` is shown but is not evidence; a checkpoint completes only by a record.
 * - AC 3: tolerant reads (`W_MEMORY_UNREADABLE`, `W_MEMORY_INVALID_STATE`, BDD P4.13 sc. 3).
 * - AC 4: `W_UNCOMMITTED_INPUTS`, and the answer still computed from `HEAD`.
 * - AC 5: determinism (byte-identical JSON, sorted enumeration); the grep half is
 *   `test/workflow/deduce-determinism.test.ts`.
 * - AC 6: BDD P4.13 sc. 1–2, derived from Memory alone (no `.wingfoil/state/`).
 * - AC 7: BDD P4.11 — the deduction reuses `validateFrontmatterState` (characterization).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { deduceWorkflowStateAtHead, loadWorkflowRegistryAtHead, readDeductionSnapshotAtHead, selectWorkflowInstance, W_UNCOMMITTED_INPUTS, type Deduction, type InstanceDeduction } from '../../src/core';
import { resolveStateMachine, validateFrontmatterState } from '../../src/memory/state-machine';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml, ValidationError } from '../../src/validation';
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
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
  runs: [ docs/06_runs/ ]
`;

/** A main bound to a task: start → implement (in-review) → done. */
const TASK_FLOW = `name: task-flow
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: implement
    actions:
      - memory.submit
  - name: done
    actions:
      - memory.approve
      - element.set_state(done)
`;

/** A main bound to a release: develop → submit-release → releasing (released). */
const RELEASE_FLOW = `name: release-flow
kind: main
element: release
phases:
  - name: develop
    actions:
      - element.set_state(in-development)
  - name: submit-release
    actions:
      - element.set_state(releasing)
  - name: releasing
    actions:
      - element.set_state(released)
`;

/** A main with no element, one phase per evidence kind. */
const DOC_FLOW = `name: doc-flow
kind: main
phases:
  - name: write
    produces: [ "docs/out/report.md" ]
  - name: publish
    produces: [ "site/" ]
  - name: sweep
    where: { type: task, status: [ pending ] }
    actions:
      - memory.approve
  - name: sub
    include: helper
  - name: check
`;

const HELPER = `name: helper
kind: sub
phases:
  - name: only
    produces: [ "docs/out/helper.md" ]
`;

/** A main bound to a release whose phase adds tasks and names the release's own file implicitly. */
const IMPLICIT_FLOW = `name: implicit-flow
kind: main
element: release
phases:
  - name: add-tasks
    actions:
      - 'memory.add(type: task)'
    produces: [ "docs/releases/{id}.md" ]
  - name: wrap-up
    produces: [ "docs/out/wrap-{id}.md" ]
`;

const WORKFLOWS: Record<string, string> = {
  'workflows/custom/task-flow.yaml': TASK_FLOW,
  'workflows/custom/release-flow.yaml': RELEASE_FLOW,
  'workflows/custom/doc-flow.yaml': DOC_FLOW,
  'workflows/custom/helper.yaml': HELPER,
  'workflows/custom/implicit-flow.yaml': IMPLICIT_FLOW,
};

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function plan(id: string, workflow: string, status: string, extra: { element?: string; parent?: string } = {}): string {
  return element('plan', id, status, `workflow: "${workflow}"\nphase: "x"\nelement: "${extra.element ?? ''}"\n${extra.parent !== undefined ? `parent: "${extra.parent}"\n` : ''}`);
}

/** The fixture configuration, committed. */
function writeProject(root: string): void {
  const include = Object.keys(WORKFLOWS)
    .map((file) => `  - ${file}\n`)
    .join('');
  writeFixtureFile(root, '.wingfoil/workflows.yaml', `version: 1.0\ninclude:\n${include}`);
  for (const [file, body] of Object.entries(WORKFLOWS)) writeFixtureFile(root, `.wingfoil/${file}`, body);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'README.md', '# fixture\n');
  commitAll(root, 'fixture configuration');
}

function commitFiles(root: string, files: Record<string, string>, message: string): void {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  commitAll(root, message);
}

/** An empty commit whose trailer block is `trailers` (`spec-003` § "Evidence", the phase record). */
function commitRecord(root: string, trailers: Record<string, string>): void {
  const block = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  git(root, ['commit', '--allow-empty', '-q', '-m', 'workflow: finalize', '-m', block]);
}

function only(deduction: Deduction, id: string): InstanceDeduction {
  const found = deduction.instances.find((entry) => entry.instance.id === id);
  if (!found) throw new Error(`no instance ${id} in ${JSON.stringify(deduction.instances.map((entry) => entry.instance.id))}`);
  return found;
}

const keys = (instance: InstanceDeduction): string[] => instance.frontier.map((step) => step.key);
const codes = (deduction: Deduction): string[] => deduction.diagnostics.map((diagnostic) => diagnostic.code);

describe('task-198 AC 1 — open instances, start order, the active instance and <ref> (spec-017 §3.1–§3.3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog') }, 'task');
    commitFiles(repo, { 'docs/plans/p-done.md': plan('p-done', 'doc-flow', 'done') }, 'a done plan');
    commitFiles(repo, { 'docs/plans/plan-a.md': plan('plan-a', 'task-flow', 'active', { element: 'task-1' }) }, 'older open main');
    commitFiles(repo, { 'docs/plans/p-sub.md': plan('p-sub', 'doc-flow', 'active', { parent: 'doc-flow.sub' }) }, 'a phase plan');
    commitFiles(repo, { 'docs/plans/p-helper.md': plan('p-helper', 'helper', 'active') }, 'a plan of a sub workflow');
    commitFiles(repo, { 'docs/plans/plan-b.md': plan('plan-b', 'doc-flow', 'draft') }, 'newer open main');
  });
  afterAll(() => removeTempDir(repo));

  it('yields exactly the open mains (draft|active, no parent, startable), most recently started first, the first active', () => {
    const deduction = deduceWorkflowStateAtHead(repo);
    expect(deduction.instances.map((entry) => [entry.instance.id, entry.instance.active])).toEqual([
      ['plan-b', true],
      ['plan-a', false],
    ]);
    expect(deduction.active).toBe('plan-b');
    const b = only(deduction, 'plan-b').instance;
    expect(b).toMatchObject({ workflow: 'doc-flow', planStatus: 'draft', element: null, context: null, created: [], abandoned: false });
    expect(b.startCommit).toBe(git(repo, ['rev-parse', 'HEAD']).trim());
    expect(only(deduction, 'plan-a').instance.element).toEqual({ type: 'task', id: 'task-1', status: 'backlog' });
    expect(deduction.baseline).toEqual({ rev: 'HEAD', commit: git(repo, ['rev-parse', 'HEAD']).trim() });
  });

  it('orders the start position by `git rev-list --topo-order`, ties by ascending instance id', () => {
    const tie = makeTempGitRepo();
    try {
      writeProject(tie);
      commitFiles(
        tie,
        { 'docs/plans/zeta.md': plan('zeta', 'doc-flow', 'active'), 'docs/plans/alpha.md': plan('alpha', 'doc-flow', 'active') },
        'two plans in one commit',
      );
      expect(deduceWorkflowStateAtHead(tie).instances.map((entry) => entry.instance.id)).toEqual(['alpha', 'zeta']);
    } finally {
      removeTempDir(tie);
    }
  });

  it('<ref> resolves a workflow name (its most recent open instance) or an instance id; otherwise `workflow is not open: <ref>`', () => {
    const deduction = deduceWorkflowStateAtHead(repo);
    const byName = selectWorkflowInstance(deduction, 'task-flow');
    expect(byName.ok && byName.value?.instance.id).toBe('plan-a');
    const byId = selectWorkflowInstance(deduction, 'plan-b');
    expect(byId.ok && byId.value?.instance.id).toBe('plan-b');
    const active = selectWorkflowInstance(deduction);
    expect(active.ok && active.value?.instance.id).toBe('plan-b');
    for (const ref of ['nope', 'p-done', 'p-sub', 'helper']) {
      expect(selectWorkflowInstance(deduction, ref)).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: `workflow is not open: ${ref}`, details: { ref } } });
    }
  });

  it('lists an open plan naming no loaded workflow with an empty frontier and W_INSTANCE_WORKFLOW_UNKNOWN', () => {
    const unknown = makeTempGitRepo();
    try {
      writeProject(unknown);
      commitFiles(unknown, { 'docs/plans/ghost.md': plan('ghost', 'no-such-flow', 'active') }, 'ghost');
      const deduction = deduceWorkflowStateAtHead(unknown);
      expect(only(deduction, 'ghost').frontier).toEqual([]);
      expect(deduction.diagnostics).toContainEqual({
        code: 'W_INSTANCE_WORKFLOW_UNKNOWN',
        severity: 'warning',
        file: 'docs/plans/ghost.md',
        path: 'workflow',
        message: "open plan ghost names workflow 'no-such-flow', which the registry does not load",
      });
    } finally {
      removeTempDir(unknown);
    }
  });
});

describe('task-198 AC 2 — evidence kinds and the frontier (spec-017 §4.3, §4.5, §4.8 records, §4.9)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'pending'), 'docs/plans/plan-d.md': plan('plan-d', 'doc-flow', 'active') }, 'start');
  });
  afterEach(() => removeTempDir(repo));

  const docFlow = (): InstanceDeduction => only(deduceWorkflowStateAtHead(repo), 'plan-d');

  it('`produces` (a file, then a `/` pattern), `selection`, plain `include` and `record` each complete their phase', () => {
    let instance = docFlow();
    expect(keys(instance)).toEqual(['doc-flow.write']);
    expect(instance.frontier[0]!.evidence).toEqual({ kinds: ['produces'], missing: ['produces'], finalizable: false });
    expect(instance.phases.map((phase) => phase.state)).toEqual(['current', 'pending', 'pending', 'pending', 'pending']);

    commitFiles(repo, { 'docs/out/report.md': 'r\n' }, 'report');
    expect(keys(docFlow())).toEqual(['doc-flow.publish']);

    commitFiles(repo, { 'site/nested/index.html': '<p>\n' }, 'site');
    instance = docFlow();
    expect(keys(instance)).toEqual(['doc-flow.sweep']);
    expect(instance.frontier[0]!.evidence).toEqual({ kinds: ['selection'], missing: ['selection'], finalizable: false });

    commitFiles(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog') }, 'approve task-1');
    instance = docFlow();
    expect(keys(instance)).toEqual(['helper.only']);
    expect(instance.frontier[0]!.trail).toEqual([
      { workflow: 'doc-flow', phase: 'sub', scope: null },
      { workflow: 'helper', phase: 'only', scope: null },
    ]);

    commitFiles(repo, { 'docs/out/helper.md': 'h\n' }, 'helper');
    instance = docFlow();
    expect(keys(instance)).toEqual(['doc-flow.check']);
    expect(instance.frontier[0]!.evidence).toEqual({ kinds: ['record'], missing: ['record'], finalizable: true });

    commitRecord(repo, { 'WingFoil-Phase': 'doc-flow.check completed', 'WingFoil-Instance': 'plan-d' });
    instance = docFlow();
    expect(instance.frontier).toEqual([]);
    expect(instance.complete).toBe(true);
    expect(instance.phases.map((phase) => phase.state)).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
  });

  it('a checkpoint completes only by a record of its own step and instance', () => {
    commitFiles(repo, { 'docs/out/report.md': 'r\n', 'site/index.html': '<p>\n', 'docs/out/helper.md': 'h\n', 'docs/tasks/task-1.md': element('task', 'task-1', 'backlog') }, 'all evidence');
    commitRecord(repo, { 'WingFoil-Phase': 'doc-flow.check completed', 'WingFoil-Instance': 'another-plan' });
    commitRecord(repo, { 'WingFoil-Phase': 'doc-flow.write completed', 'WingFoil-Instance': 'plan-d' });
    commitRecord(repo, { 'WingFoil-Phase': 'doc-flow.check started', 'WingFoil-Instance': 'plan-d' });
    commitRecord(repo, { 'WingFoil-Phase': 'doc-flow.check completed', 'WingFoil-Instance': 'plan-d', 'WingFoil-Element': 'task:task-1' });
    expect(keys(docFlow())).toEqual(['doc-flow.check']);
    commitRecord(repo, { 'WingFoil-Phase': 'doc-flow.check completed', 'WingFoil-Instance': 'plan-d' });
    expect(keys(docFlow())).toEqual([]);
  });

  it('a record older than the instance start commit does not count (§4.8)', () => {
    const early = makeTempGitRepo();
    try {
      writeProject(early);
      commitRecord(early, { 'WingFoil-Phase': 'doc-flow.check completed', 'WingFoil-Instance': 'plan-d' });
      commitFiles(early, { 'docs/out/report.md': 'r\n', 'site/index.html': '<p>\n', 'docs/out/helper.md': 'h\n' }, 'evidence');
      commitFiles(early, { 'docs/plans/plan-d.md': plan('plan-d', 'doc-flow', 'active') }, 'start');
      expect(keys(only(deduceWorkflowStateAtHead(early), 'plan-d'))).toEqual(['doc-flow.check']);
    } finally {
      removeTempDir(early);
    }
  });

  it('`state` evidence: the bound element at or after the exit state; the step key carries the scope', () => {
    commitFiles(repo, { 'docs/plans/plan-t.md': plan('plan-t', 'task-flow', 'active', { element: 'task-1' }) }, 'task-flow');
    let instance = only(deduceWorkflowStateAtHead(repo), 'plan-t');
    expect(keys(instance)).toEqual(['task-flow.start@task:task-1']);
    expect(instance.frontier[0]!.scope).toEqual({ element: { type: 'task', id: 'task-1', status: 'pending' } });
    expect(instance.frontier[0]!.evidence).toEqual({ kinds: ['state'], missing: ['state'], finalizable: false });
    commitFiles(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'done') }, 'task-1 done');
    instance = only(deduceWorkflowStateAtHead(repo), 'plan-t');
    expect(instance.complete).toBe(true);
  });

  it('an implicit-owner `produces` is shown but is not evidence (§4.3): the add phase completes by a record', () => {
    commitFiles(
      repo,
      { 'docs/releases/rel-1.md': element('release', 'rel-1', 'planning'), 'docs/plans/plan-i.md': plan('plan-i', 'implicit-flow', 'active', { element: 'rel-1' }) },
      'implicit-flow',
    );
    const step = only(deduceWorkflowStateAtHead(repo), 'plan-i').frontier[0]!;
    expect(step.key).toBe('implicit-flow.add-tasks@release:rel-1');
    expect(step.produces).toEqual([{ pattern: 'docs/releases/{id}.md', owner: null, resolved: ['docs/releases/rel-1.md'], exists: true, evidence: false }]);
    expect(step.evidence).toEqual({ kinds: ['created', 'record'], missing: ['record'], finalizable: true });
  });

  it('a token resolved against the bound element; a blank field leaves it unresolved with W_UNRESOLVED_TOKEN', () => {
    commitFiles(
      repo,
      { 'docs/releases/rel-1.md': element('release', 'rel-1', 'planning'), 'docs/plans/plan-i.md': plan('plan-i', 'implicit-flow', 'active', { element: 'rel-1' }) },
      'implicit-flow',
    );
    commitRecord(repo, { 'WingFoil-Phase': 'implicit-flow.add-tasks completed', 'WingFoil-Instance': 'plan-i', 'WingFoil-Element': 'release:rel-1' });
    let step = only(deduceWorkflowStateAtHead(repo), 'plan-i').frontier[0]!;
    expect(step.key).toBe('implicit-flow.wrap-up@release:rel-1');
    expect(step.produces).toEqual([{ pattern: 'docs/out/wrap-{id}.md', owner: 'release', resolved: ['docs/out/wrap-rel-1.md'], exists: false, evidence: true }]);

    commitFiles(repo, { 'docs/plans/plan-x.md': plan('plan-x', 'implicit-flow', 'active', { element: 'rel-404' }) }, 'unbound release');
    const deduction = deduceWorkflowStateAtHead(repo);
    step = only(deduction, 'plan-x').frontier[0]!;
    expect(step.key).toBe('implicit-flow.add-tasks');
    expect(only(deduction, 'plan-x').instance.element).toBeNull();
    expect(deduction.diagnostics).toContainEqual({
      code: 'W_UNRESOLVED_TOKEN',
      severity: 'warning',
      file: '.wingfoil/workflows/custom/implicit-flow.yaml',
      path: 'phases[0].produces[0]',
      message: "token '{id}' of implicit-flow.add-tasks has no value: no release element is bound",
    });
  });
});

describe('task-198 AC 3 — tolerant reads (spec-017 §1.4, BDD P4.13 sc. 3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(
      repo,
      {
        'docs/tasks/a-unparsable.md': '---\nid: "a"\ntype: task\ntitle: [unclosed\n---\n',
        'docs/tasks/b-no-status.md': '---\nid: "b"\ntype: task\ntitle: "b"\n---\n',
        'docs/tasks/c-illegal.md': element('task', 'c', 'releasing'),
        'docs/tasks/d-no-frontmatter.md': '# just prose\n',
        'docs/plans/plan-t.md': plan('plan-t', 'task-flow', 'active', { element: 'c' }),
      },
      'bad documents',
    );
  });
  afterAll(() => removeTempDir(repo));

  it('excludes and reports each one, in path order, and never throws', () => {
    let deduction: Deduction | undefined;
    expect(() => {
      deduction = deduceWorkflowStateAtHead(repo);
    }).not.toThrow();
    const memory = deduction!.diagnostics.filter((d) => d.code.startsWith('W_MEMORY_'));
    expect(memory.map((d) => [d.code, d.file])).toEqual([
      ['W_MEMORY_UNREADABLE', 'docs/tasks/a-unparsable.md'],
      ['W_MEMORY_UNREADABLE', 'docs/tasks/b-no-status.md'],
      ['W_MEMORY_INVALID_STATE', 'docs/tasks/c-illegal.md'],
      ['W_MEMORY_UNREADABLE', 'docs/tasks/d-no-frontmatter.md'],
    ]);
    expect(memory[1]!.message).toBe("unreadable frontmatter in docs/tasks/b-no-status.md: no 'status' field");
    expect(memory[3]!.message).toBe('unreadable frontmatter in docs/tasks/d-no-frontmatter.md: no frontmatter');
    expect(memory[2]).toEqual({
      code: 'W_MEMORY_INVALID_STATE',
      severity: 'warning',
      file: 'docs/tasks/c-illegal.md',
      path: 'status',
      message: "invalid state 'releasing' for type 'task' in docs/tasks/c-illegal.md",
    });
    // Excluded: the instance bound to the invalid task finds no element.
    expect(only(deduction!, 'plan-t').instance.element).toBeNull();
  });
});

describe('task-198 AC 4 — W_UNCOMMITTED_INPUTS, answered from HEAD (spec-017 §1.2)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(repo, { 'docs/tasks/task-1.md': element('task', 'task-1', 'pending'), 'docs/plans/plan-d.md': plan('plan-d', 'doc-flow', 'active') }, 'start');
  });
  afterAll(() => removeTempDir(repo));

  it('names the dirty input paths, ignores the rest, and computes the same answer with and without them', () => {
    const clean = deduceWorkflowStateAtHead(repo);
    expect(codes(clean)).not.toContain('W_UNCOMMITTED_INPUTS');

    writeFixtureFile(repo, 'docs/tasks/task-1.md', element('task', 'task-1', 'backlog'));
    writeFixtureFile(repo, 'docs/out/report.md', 'r\n');
    writeFixtureFile(repo, 'site/index.html', '<p>\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/helper.yaml', `${HELPER}# edited\n`);
    writeFixtureFile(repo, 'docs/06_runs/task-1.jsonl', '{}\n');
    writeFixtureFile(repo, 'README.md', '# changed, not an input\n');
    writeFixtureFile(repo, 'src/unrelated.ts', 'export {};\n');

    const dirty = deduceWorkflowStateAtHead(repo);
    const uncommitted = dirty.diagnostics.filter((d) => d.code === 'W_UNCOMMITTED_INPUTS');
    expect(uncommitted.map((d) => d.file)).toEqual([
      '.wingfoil/workflows/custom/helper.yaml',
      'docs/06_runs/task-1.jsonl',
      'docs/out/report.md',
      'docs/tasks/task-1.md',
      'site/index.html',
    ]);
    expect(uncommitted[0]).toEqual({
      code: 'W_UNCOMMITTED_INPUTS',
      severity: 'warning',
      file: '.wingfoil/workflows/custom/helper.yaml',
      path: '',
      message: 'uncommitted change to a deduction input, not read (the answer is computed from HEAD): .wingfoil/workflows/custom/helper.yaml',
    });
    // The registry's diagnostics first, then W_UNCOMMITTED_INPUTS before every other deduction code (spec-017 §1.3).
    const registryCount = loadWorkflowRegistryAtHead(repo).diagnostics.length;
    expect(dirty.diagnostics.slice(registryCount, registryCount + uncommitted.length)).toEqual(uncommitted);
    expect({ ...dirty, diagnostics: [] }).toEqual({ ...clean, diagnostics: [] });
    expect(keys(only(dirty, 'plan-d'))).toEqual(['doc-flow.write']);
  });
});

describe('task-198 AC 5 — determinism (spec-017 §1.3)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(
      repo,
      {
        'docs/tasks/task-2.md': element('task', 'task-2', 'pending'),
        'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress'),
        'docs/tasks/z-bad.md': element('task', 'z', 'nonsense'),
        'docs/tasks/a-bad.md': element('task', 'a', 'nonsense'),
        'docs/plans/plan-t.md': plan('plan-t', 'task-flow', 'active', { element: 'task-1' }),
        'docs/plans/plan-d.md': plan('plan-d', 'doc-flow', 'active'),
      },
      'state',
    );
  });
  afterAll(() => removeTempDir(repo));

  it('two runs at one commit give byte-identical JSON', () => {
    expect(JSON.stringify(deduceWorkflowStateAtHead(repo))).toBe(JSON.stringify(deduceWorkflowStateAtHead(repo)));
  });

  it("enumerates Memory from HEAD's tree in sorted path order", () => {
    const files = deduceWorkflowStateAtHead(repo)
      .diagnostics.filter((d) => d.code.startsWith('W_MEMORY_'))
      .map((d) => d.file);
    expect(files).toEqual(['docs/tasks/a-bad.md', 'docs/tasks/z-bad.md']);
  });
});

describe('task-198 AC 6 — BDD P4.13 sc. 1–2: state deduced from Memory alone', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
    commitFiles(
      repo,
      {
        'docs/tasks/task-1.md': element('task', 'task-1', 'in-progress'),
        'docs/releases/rel-1.md': element('release', 'rel-1', 'releasing'),
        'docs/plans/plan-t.md': plan('plan-t', 'task-flow', 'active', { element: 'task-1' }),
        'docs/plans/plan-r.md': plan('plan-r', 'release-flow', 'active', { element: 'rel-1' }),
        // A stray index claiming otherwise: deduction never reads one (REQ-SYS-03).
        '.wingfoil/state/index.json': '{"task-1":"done","rel-1":"released"}\n',
      },
      'state',
    );
  });
  afterAll(() => removeTempDir(repo));

  it('Scenario: Deduce task progress from frontmatter — an `in-progress` task is reported at the phase that moves it to in-review', () => {
    const instance = only(deduceWorkflowStateAtHead(repo), 'plan-t');
    expect(instance.phases).toEqual([
      { phase: 'start', state: 'complete' },
      { phase: 'implement', state: 'current' },
      { phase: 'done', state: 'pending' },
    ]);
    expect(keys(instance)).toEqual(['task-flow.implement@task:task-1']);
  });

  it('Scenario: Deduced state is validated against the type machine — a `releasing` release is reported in the "releasing" phase', () => {
    const instance = only(deduceWorkflowStateAtHead(repo), 'plan-r');
    expect(keys(instance)).toEqual(['release-flow.releasing@release:rel-1']);
    expect(instance.frontier[0]!.scope).toEqual({ element: { type: 'release', id: 'rel-1', status: 'releasing' } });
  });
});

describe('task-198 AC 7 — BDD P4.11 sc. 1–3 still hold; deduction reuses validateFrontmatterState (characterization)', () => {
  it('the deduction module calls validateFrontmatterState and does not spell the message itself', () => {
    const source = readFileSync(join(__dirname, '../../src/workflow/deduce.ts'), 'utf-8');
    expect(source).toMatch(/import \{[^}]*\bvalidateFrontmatterState\b[^}]*\} from '\.\.\/memory\/state-machine'/);
    expect(source).toMatch(/validateFrontmatterState\(/);
    expect(source).not.toContain("invalid state '");
  });

  it('the W_MEMORY_INVALID_STATE message is validateFrontmatterState\'s, plus the file', () => {
    const memoryYaml = MemoryYaml.parse(parseYaml(MEMORY_YAML, 'memory.yaml'));
    let message = '';
    try {
      validateFrontmatterState(resolveStateMachine(memoryYaml, 'task'), 'task', 'shipped');
    } catch (error) {
      message = (error as ValidationError).issues[0]!.message;
    }
    expect(message).toBe("invalid state 'shipped' for type 'task'");
  });
});

describe('task-198 review F3 — this repository: the six pre-dl-019 plans without frontmatter (spec-017 §1.4)', () => {
  it('reports exactly the six, not the grandfathered top-level X_* plans', () => {
    const root = join(__dirname, '../..');
    const noFrontmatter = deduceWorkflowStateAtHead(root)
      .diagnostics.filter((d) => d.code === 'W_MEMORY_UNREADABLE' && d.message.endsWith(': no frontmatter'))
      .map((d) => d.file);
    expect(noFrontmatter).toEqual([
      'docs/05_plans/rl-v1/initial-design-rl-v1-plan.md',
      'docs/05_plans/rl-v1/rel-v0.1/dev-loop-rel-v0.1-plan.md',
      'docs/05_plans/rl-v1/rel-v0.1/release-implementation-rel-v0.1-plan.md',
      'docs/05_plans/rl-v1/rel-v0.1/release-planning-rel-v0.1-plan.md',
      'docs/05_plans/rl-v1/rel-v0.1/release-submit-rel-v0.1-plan.md',
      'docs/05_plans/rl-v1/rel-v0.1/retrospective-and-config-bootstrap-plan.md',
    ]);
  });
});

describe('task-198 — the HEAD snapshot reader at its edges (spec-017 §1.1–§1.2)', () => {
  it('a committed repository with no .wingfoil/ reads an empty registry, no Memory and no instance', () => {
    const repo = makeTempGitRepo();
    try {
      commitFiles(repo, { 'README.md': '# bare\n' }, 'bare');
      writeFixtureFile(repo, 'docs/x.md', 'untracked\n');
      const snapshot = readDeductionSnapshotAtHead(repo);
      expect(snapshot).toMatchObject({ workflows: [], workflowFiles: [], memoryYaml: null, documents: [], starts: new Map(), history: new Map(), transitions: [], lastChanges: new Map(), parents: new Map(), dirty: [] });
      expect(deduceWorkflowStateAtHead(repo)).toMatchObject({ active: null, instances: [], diagnostics: [] });
    } finally {
      removeTempDir(repo);
    }
  });

  it('a produces pattern that starts with a token adds no pathspec; dna.yaml without paths.runs adds none; a plan with no status is no candidate', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/top.yaml\n');
      writeFixtureFile(repo, '.wingfoil/workflows/custom/top.yaml', 'name: top\nkind: main\nphases:\n  - name: only\n    produces: [ "{id}.txt", "out/{id}/" ]\n');
      writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('  runs: [ docs/06_runs/ ]\n', ''));
      writeFixtureFile(repo, 'docs/plans/p-none.md', '---\nid: "p-none"\ntype: plan\ntitle: "p"\nworkflow: "top"\n---\n');
      commitAll(repo, 'fixture');
      writeFixtureFile(repo, 'out/x/a.txt', 'a\n');
      writeFixtureFile(repo, 'p.txt', 'p\n');
      writeFixtureFile(repo, 'docs/06_runs/r.jsonl', '{}\n');
      const snapshot = readDeductionSnapshotAtHead(repo);
      expect(snapshot.starts.size).toBe(0);
      expect(snapshot.dirty).toEqual(['out/x/a.txt']);
      const deduction = deduceWorkflowStateAtHead(repo);
      expect(deduction.instances).toEqual([]);
      expect(deduction.diagnostics.filter((d) => d.code === W_UNCOMMITTED_INPUTS).map((d) => d.file)).toEqual(['out/x/a.txt']);
      expect(deduction.diagnostics.map((d) => d.message)).toContain("unreadable frontmatter in docs/plans/p-none.md: no 'status' field");
    } finally {
      removeTempDir(repo);
    }
  });
});

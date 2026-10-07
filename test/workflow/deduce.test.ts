/**
 * task-198 — the pure deduction (`src/workflow/deduce.ts`) on synthetic snapshots: the branches the
 * fixture-repository suite (`test/core/workflow-deduction.test.ts`) does not reach — every `§1.4`
 * exclusion reason, every token rule of `spec-017` §4.1, the self-creating and context bindings
 * (§3.4–§3.5), a typed `<T>.set_state`, a token in a selection, an unexpanded `iterate_over` and a
 * created-owned `produces` entry — plus the empty snapshot of a repository with no commit.
 */
import { deduceWorkflowState, deduceWorkflowStateAtHead, type DeductionSnapshot } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

const MEMORY = MemoryYaml.parse(
  parseYaml(
    `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, done ]
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, released ]
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, closed ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    states:
      sequence: [ draft, active, done ]
`,
    'memory.yaml',
  ),
);

const wf = (yaml: string): Workflow => Workflow.parse(parseYaml(yaml, 'workflow.yaml'));

function doc(path: string, frontmatter: Record<string, unknown>): { path: string; frontmatter: Record<string, unknown>; body: string } {
  return { path, frontmatter, body: '' };
}

function snapshot(workflows: Workflow[], documents: ReturnType<typeof doc>[], extra: Partial<DeductionSnapshot> = {}): DeductionSnapshot {
  const plans = documents.filter((d) => d.frontmatter['type'] === 'plan');
  return {
    commit: 'c0ffee',
    workflows,
    workflowFiles: workflows.map((w) => `.wingfoil/workflows/custom/${w.name}.yaml`),
    registryDiagnostics: [],
    memoryYaml: MEMORY,
    documents,
    scanDiagnostics: [],
    tree: [],
    starts: new Map(plans.map((p, i) => [p.path, { commit: `s${i}`, position: i }])),
    records: new Map(),
    dirty: [],
    ...extra,
  };
}

const plan = (id: string, workflow: string, element = ''): ReturnType<typeof doc> =>
  doc(`docs/plans/x/${id}.md`, { id, type: 'plan', status: 'active', workflow, element });

describe('task-198 — deduceWorkflowState on synthetic snapshots', () => {
  it('reports each §1.4 exclusion reason by path', () => {
    const deduction = deduceWorkflowState(
      snapshot(
        [],
        [
          doc('docs/a.md', { id: 'a', status: 'open' }),
          doc('docs/b.md', { id: 'b', type: 'widget', status: 'open' }),
          doc('docs/c.md', { type: 'bug', status: 'open' }),
        ],
      ),
    );
    expect(deduction.diagnostics.map((d) => d.message)).toEqual([
      "unreadable frontmatter in docs/a.md: no 'type' field",
      "unreadable frontmatter in docs/b.md: type 'widget' is not declared in memory.yaml",
      "unreadable frontmatter in docs/c.md: no 'id' field",
    ]);
    expect(deduction).toMatchObject({ active: null, instances: [], baseline: { rev: 'HEAD', commit: 'c0ffee' } });
  });

  it('resolves {element.<f>} and {<type>.<f>}; reports {item}, an out-of-scope type and a blank field', () => {
    const flow = wf(`name: tokens
kind: main
element: release
phases:
  - name: write
    produces: [ "out/{element.title}.md", "out/{item}.md", "out/{bug.id}.md", "out/{release.notes}.md", "out/{release.id}/" ]
`);
    const deduction = deduceWorkflowState(
      snapshot([flow], [doc('docs/releases/r1.md', { id: 'r1', type: 'release', status: 'planning', title: 'One', notes: '' }), plan('p1', 'tokens', 'r1')], {
        tree: ['out/One.md', 'out/r1/index.md'],
      }),
    );
    const step = deduction.instances[0]!.frontier[0]!;
    expect(step.produces.map((p) => [p.resolved, p.exists])).toEqual([
      [['out/One.md'], true],
      [[], false],
      [[], false],
      [[], false],
      [['out/r1/'], true],
    ]);
    expect(deduction.diagnostics.map((d) => d.message)).toEqual([
      "token '{item}' of tokens.write has no value: no collection entry in scope",
      "token '{bug.id}' of tokens.write has no value: no element in scope",
      "token '{release.notes}' of tokens.write has no value: release:r1 has no value for 'notes'",
    ]);
  });

  it('a self-creating instance starts unbound with pending tokens and a context element; its creating step completes by a record', () => {
    const ingest = wf(`name: ingest
kind: main
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
    produces: [ "docs/bugs/{id}.md", { type: bug, path: "docs/bugs/{bug.id}.md" } ]
  - name: triage
    actions:
      - memory.approve
`);
    const deduction = deduceWorkflowState(
      snapshot([ingest], [doc('docs/releases/r1.md', { id: 'r1', type: 'release', status: 'planning' }), plan('p1', 'ingest', 'r1')]),
    );
    const entry = deduction.instances[0]!;
    expect(entry.instance).toMatchObject({ element: null, context: { type: 'release', id: 'r1', status: 'planning' } });
    expect(entry.frontier[0]).toMatchObject({ key: 'ingest.capture', scope: null, produces: [{ owner: 'bug', resolved: [], evidence: true }, { pattern: 'docs/bugs/{bug.id}.md', owner: 'bug', evidence: false }] });
    expect(entry.frontier[0]!.evidence).toEqual({ kinds: ['created', 'produces'], missing: ['produces'], finalizable: false });
    expect(deduction.diagnostics).toEqual([]);
  });

  it('a typed <T>.set_state of the bound type is state evidence; a selection token; iterate_over and { type, path } entries', () => {
    const flow = wf(`name: typed
kind: main
element: task
phases:
  - name: begin
    actions:
      - task.set_state(backlog)
  - name: sweep
    where: { type: bug, release: [ "{task.release}" ] }
  - name: many
    include: typed-sub
    iterate_over: bug
    where: { status: [ open ] }
`);
    const sub = wf(`name: typed-sub
kind: sub
phases:
  - name: fix
    actions:
      - 'memory.add(type: task)'
    produces:
      - { type: task, path: "docs/tasks/{task.id}.md" }
`);
    const documents = [
      doc('docs/tasks/t1.md', { id: 't1', type: 'task', status: 'pending', release: 'v1' }),
      doc('docs/bugs/b1.md', { id: 'b1', type: 'bug', status: 'open', release: 'v1' }),
      plan('p1', 'typed', 't1'),
    ];
    let step = deduceWorkflowState(snapshot([flow, sub], documents)).instances[0]!.frontier[0]!;
    expect([step.key, step.evidence.missing]).toEqual(['typed.begin@task:t1', ['state']]);

    documents[0] = doc('docs/tasks/t1.md', { id: 't1', type: 'task', status: 'backlog', release: 'v1' });
    step = deduceWorkflowState(snapshot([flow, sub], documents)).instances[0]!.frontier[0]!;
    expect([step.key, step.evidence.missing]).toEqual(['typed.sweep@task:t1', ['selection']]);

    documents[1] = doc('docs/bugs/b1.md', { id: 'b1', type: 'bug', status: 'open', release: 'v2' });
    step = deduceWorkflowState(snapshot([flow, sub], documents)).instances[0]!.frontier[0]!;
    expect([step.key, step.evidence]).toEqual(['typed.many@task:t1', { kinds: ['include'], missing: ['include'], finalizable: false }]);
  });

  it('review F2: a phase with `awaits` needs a record even when its other evidence is satisfied (spec-017 §4.3, §5.4)', () => {
    const flow = wf(`name: publish
kind: main
phases:
  - name: release
    produces: [ "dist/out.tgz" ]
    awaits: { party: registry, evidence: registry.published }
`);
    const documents = [plan('p1', 'publish')];
    const step = deduceWorkflowState(snapshot([flow], documents, { tree: ['dist/out.tgz'] })).instances[0]!.frontier[0]!;
    expect(step.evidence).toEqual({ kinds: ['produces', 'awaits', 'record'], missing: ['record'], finalizable: true });
    const done = deduceWorkflowState(
      snapshot([flow], documents, {
        tree: ['dist/out.tgz'],
        records: new Map([['s0', [{ commit: 'r1', phase: 'publish.release', instance: 'p1', element: null, item: null }]]]),
      }),
    );
    expect(done.instances[0]!.complete).toBe(true);
  });

  it('review F3: a file with no frontmatter is reported only when it lies on a type\'s path pattern (spec-017 §1.4)', () => {
    const deduction = deduceWorkflowState(
      snapshot([], [doc('docs/plans/X_grandfathered.md', {}), doc('docs/plans/rl-v1/old-plan.md', {}), doc('docs/tasks/deep/notes.md', {}), doc('docs/tasks/t9.md', {})]),
    );
    expect(deduction.diagnostics.map((d) => d.file)).toEqual(['docs/plans/rl-v1/old-plan.md', 'docs/tasks/t9.md']);
  });

  it('a repository with no commit has an empty answer', () => {
    const repo = makeTempGitRepo();
    try {
      expect(deduceWorkflowStateAtHead(repo)).toEqual({ baseline: { rev: 'HEAD', commit: '' }, active: null, instances: [], diagnostics: [] });
    } finally {
      removeTempDir(repo);
    }
  });
});

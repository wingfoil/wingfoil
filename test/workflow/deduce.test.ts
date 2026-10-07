/**
 * task-198 — the pure deduction (`src/workflow/deduce.ts`) on synthetic snapshots: the branches the
 * fixture-repository suite (`test/core/workflow-deduction.test.ts`) does not reach — every `§1.4`
 * exclusion reason, every token rule of `spec-017` §4.1, the self-creating and context bindings
 * (§3.4–§3.5), a typed `<T>.set_state`, a token in a selection, an unexpanded `iterate_over` and a
 * created-owned `produces` entry — plus the empty snapshot of a repository with no commit.
 */
import {
  deduceWorkflowState,
  deduceWorkflowStateAtHead,
  resolveInstanceRef,
  W_INSTANCE_WORKFLOW_UNKNOWN,
  W_MEMORY_INVALID_STATE,
  W_UNRESOLVED_TOKEN,
  type DeductionSnapshot,
} from '../../src/core';
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
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
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
        history: new Map([['s0', { records: [{ commit: 'r1', position: 0, phase: 'publish.release', instance: 'p1', element: null, item: null }], links: [], reentries: [] }]]),
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

  it('the selection match rule: an absent field reads "", a list field matches a shared element, a non-string value by its text', () => {
    const flow = wf(`name: sweep
kind: main
phases:
  - name: sweep
    where: { type: bug, release: [ "" ], tags: [ b ], points: 3 }
`);
    const bug = (frontmatter: Record<string, unknown>): ReturnType<typeof doc> => doc('docs/bugs/b1.md', { id: 'b1', type: 'bug', status: 'open', ...frontmatter });
    const missing = (documents: ReturnType<typeof doc>[]): readonly string[] =>
      deduceWorkflowState(snapshot([flow], [...documents, plan('p1', 'sweep')])).instances[0]!.frontier[0]?.evidence.missing ?? [];
    expect(missing([bug({ tags: ['a', 'b'], points: 3 })])).toEqual(['selection']);
    expect(missing([bug({ release: 'v1', tags: ['a', 'b'], points: 3 })])).toEqual([]);
    expect(missing([bug({ tags: ['a'], points: 3 })])).toEqual([]);
    expect(missing([bug({ tags: ['b'], points: 4 })])).toEqual([]);
  });

  it('a where token with no value leaves the selection undecided and reports W_UNRESOLVED_TOKEN', () => {
    const flow = wf(`name: sweep
kind: main
phases:
  - name: sweep
    where: { type: bug, release: [ "{release.version}" ] }
`);
    const deduction = deduceWorkflowState(snapshot([flow], [plan('p1', 'sweep')]));
    expect(deduction.instances[0]!.frontier[0]!.evidence.missing).toEqual(['selection']);
    expect(deduction.diagnostics).toEqual([
      {
        code: W_UNRESOLVED_TOKEN,
        severity: 'warning',
        file: '.wingfoil/workflows/custom/sweep.yaml',
        path: 'phases[0].where.release',
        message: "token '{release.version}' of sweep.sweep has no value: no element in scope",
      },
    ]);
  });

  it('state evidence is unsatisfied for a status outside the sequence (deprecated) and for an undetermined exit state', () => {
    const flow = wf(`name: rel
kind: main
element: release
phases:
  - name: plan
    actions:
      - element.set_state(planning)
  - name: odd
    actions:
      - element.set_state(nonsense)
`);
    const at = (status: string): string[] =>
      deduceWorkflowState(snapshot([flow], [doc('docs/releases/r1.md', { id: 'r1', type: 'release', status }), plan('p1', 'rel', 'r1')])).instances[0]!.frontier.map((step) => step.key);
    expect(at('deprecated')).toEqual(['rel.plan@release:r1']);
    expect(at('released')).toEqual(['rel.odd@release:r1']);
  });

  it('a numeric field substitutes as text; an unknown context id, an empty declared element, a plan with no workflow or no start', () => {
    const flow = wf(`name: rel
kind: main
element: release
phases:
  - name: out
    produces: [ "out/{release.number}.md" ]
`);
    const free = wf(`name: free
kind: main
phases:
  - name: only
`);
    const documents = [
      doc('docs/releases/r1.md', { id: 'r1', type: 'release', status: 'planning', number: 3 }),
      plan('p1', 'rel', 'r1'),
      plan('p2', 'rel'),
      plan('p3', 'free', 'nowhere'),
      doc('docs/plans/x/p4.md', { id: 'p4', type: 'plan', status: 'draft' }),
    ];
    const starts = new Map([
      ['docs/plans/x/p1.md', { commit: 's1', position: 0 }],
      ['docs/plans/x/p2.md', { commit: 's2', position: 1 }],
      ['docs/plans/x/p3.md', { commit: 's3', position: 2 }],
    ]);
    const deduction = deduceWorkflowState(snapshot([flow, free], documents, { starts, tree: ['out/3.md'] }));
    expect(deduction.instances.map((entry) => [entry.instance.id, entry.instance.startCommit, entry.instance.element?.id ?? null, entry.instance.context, entry.complete])).toEqual([
      ['p1', 's1', 'r1', null, true],
      ['p2', 's2', null, null, false],
      ['p3', 's3', null, null, false],
      ['p4', '', null, null, false],
    ]);
    expect(deduction.diagnostics.map((d) => d.code)).toEqual([W_INSTANCE_WORKFLOW_UNKNOWN, W_UNRESOLVED_TOKEN]);
    expect(resolveInstanceRef(deduction, 'p3')?.instance.workflow).toBe('free');
    expect(resolveInstanceRef(deduction)?.instance.id).toBe('p1');
    expect(resolveInstanceRef(deduction, 'nope')).toBeNull();
  });

  it('a self-creating `memory.add` with no type binds no frame; with no memory.yaml every document is undeclared', () => {
    const ingest = wf(`name: grab
kind: main
phases:
  - name: capture
    actions:
      - memory.add
    produces: [ "out/{id}.md" ]
`);
    const deduction = deduceWorkflowState(snapshot([ingest], [plan('p1', 'grab')]));
    expect(deduction.diagnostics.map((d) => d.message)).toEqual(["token '{id}' of grab.capture has no value: no element in scope"]);

    const bare = deduceWorkflowState(snapshot([], [doc('docs/tasks/t1.md', { id: 't1', type: 'task', status: 'draft' }), doc('docs/tasks/t2.md', {})], { memoryYaml: null }));
    expect(bare.diagnostics.map((d) => [d.code, d.message])).toEqual([['W_MEMORY_UNREADABLE', "unreadable frontmatter in docs/tasks/t1.md: type 'task' is not declared in memory.yaml"]]);
    expect(W_MEMORY_INVALID_STATE).toBe('W_MEMORY_INVALID_STATE');
  });

  it('task-203: the newest of several re-entries cuts the evidence; `state` counts by its transition or the file\'s last change', () => {
    const memory = MemoryYaml.parse(
      parseYaml(
        `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, in-progress, in-review, done ]
      gates:
        in-review: { reject: in-progress }
  plan:
    path: "docs/plans/{scope}/{id}.md"
    states:
      sequence: [ draft, active, done ]
`,
        'memory.yaml',
      ),
    );
    const flow = wf(`name: loop
kind: main
element: task
phases:
  - name: start
    actions:
      - element.set_state(in-progress)
  - name: review
    actions:
      - memory.submit
    fallback: { step: start }
`);
    const documents = [doc('docs/tasks/t1.md', { id: 't1', type: 'task', status: 'in-progress' }), plan('p1', 'loop', 't1')];
    const reentry = (commit: string, position: number) => ({ commit, position, verb: 'reject' as const, type: 'task', id: 't1', from: 'in-review', to: 'in-progress' });
    const history = new Map([['s0', { records: [], links: [], reentries: [reentry('r-new', 3), reentry('r-old', 5)] }]]);
    const first = (extra: Partial<DeductionSnapshot>) => deduceWorkflowState(snapshot([flow], documents, { memoryYaml: memory, history, ...extra })).instances[0]!.frontier[0]!;

    // No transition and no recorded change: the state is older than the walk.
    expect(first({})).toMatchObject({ key: 'loop.start@task:t1', reentered: true, reentryCommit: 'r-new', evidence: { missing: ['state'] } });
    // The file's last change sits between the two re-entries: older than the newest, so still not counted.
    expect(first({ lastChanges: new Map([['task:t1', { commit: 'c4', position: 4 }]]) }).evidence.missing).toEqual(['state']);
    // A change newer than both counts; so does a transition naming the current status, preferred over the change.
    expect(first({ lastChanges: new Map([['task:t1', { commit: 'c2', position: 2 }]]) }).key).toBe('loop.review@task:t1');
    expect(
      first({
        transitions: [{ commit: 't1', position: 1, type: 'task', id: 't1', to: 'in-progress' }],
        lastChanges: new Map([['task:t1', { commit: 'c9', position: 9 }]]),
      }).key,
    ).toBe('loop.review@task:t1');
  });

  it('task-203: linkage edge cases — an element HEAD lacks, ties by id, an unresolved path token, a type created by nobody, an undetermined target', () => {
    const ingest = wf(`name: grab
kind: main
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - 'memory.add(type: task)'
      - element.set_state(nonsense)
    produces:
      - { type: bug, path: "docs/bugs/{bug.slug}.md" }
`);
    const link = (id: string, type: string, position: number) => ({ commit: `a${position}`, position, instance: 'p1', step: 'grab.capture', type, id });
    const documents = [
      doc('docs/bugs/b1.md', { id: 'b1', type: 'bug', status: 'open' }),
      doc('docs/bugs/b2.md', { id: 'b2', type: 'bug', status: 'open' }),
      plan('p1', 'grab'),
    ];
    // b0 is linked but HEAD holds no such element; b2 and b1 share the oldest add commit, so ascending id binds b1.
    const history = new Map([['s0', { records: [], links: [link('b2', 'bug', 4), link('b1', 'bug', 4), link('b0', 'bug', 9)], reentries: [] }]]);
    const deduction = deduceWorkflowState(snapshot([ingest], documents, { history }));
    const instance = deduction.instances[0]!;
    expect(instance.instance.element).toEqual({ type: 'bug', id: 'b1', status: 'open' });
    expect(instance.instance.created.map((ref) => ref.id)).toEqual(['b1', 'b2']);
    const step = instance.frontier[0]!;
    // No task created, the bug's `{bug.slug}` has no value, and the set_state target is undetermined.
    expect(step.evidence.missing).toEqual(['created']);
    expect(step.produces).toEqual([{ pattern: 'docs/bugs/{bug.slug}.md', owner: 'bug', resolved: [], exists: false, evidence: false }]);
    expect(deduction.diagnostics.map((d) => d.message)).toEqual([
      "token '{bug.slug}' of grab.capture has no value: bug:b1 has no value for 'slug'",
      "token '{bug.slug}' of grab.capture has no value: bug:b2 has no value for 'slug'",
    ]);

    const both = new Map([['s0', { records: [], links: [link('b1', 'bug', 4), link('t1', 'task', 3)], reentries: [] }]]);
    const withTask = [doc('docs/bugs/b1.md', { id: 'b1', type: 'bug', status: 'open', slug: 's1' }), plan('p1', 'grab'), doc('docs/tasks/t1.md', { id: 't1', type: 'task', status: 'draft' })];
    // Both types created and the bug's path committed: what fails now is the undetermined target state of the task.
    const withPath = deduceWorkflowState(snapshot([ingest], withTask, { history: both, tree: ['docs/bugs/s1.md'] })).instances[0]!.frontier[0]!;
    expect(withPath.produces[0]).toMatchObject({ resolved: ['docs/bugs/s1.md'], exists: true });
    expect(withPath.evidence.missing).toEqual(['created']);
  });

  it('task-203: a self-bound step accepts a record written before its element existed; a type added twice is judged by its first add', () => {
    const ingest = wf(`name: grab
kind: main
phases:
  - name: note
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
      - 'memory.add(type: bug)'
  - name: check
`);
    const documents = [doc('docs/bugs/b1.md', { id: 'b1', type: 'bug', status: 'open' }), plan('p1', 'grab')];
    const record = (phase: string, element: string | null, position: number) => ({ commit: `r${position}`, position, phase, instance: 'p1', element, item: null });
    const history = new Map([
      [
        's0',
        {
          records: [record('grab.check', 'bug:b1', 1), record('grab.note', null, 7)],
          links: [{ commit: 'a5', position: 5, instance: 'p1', step: 'grab.capture', type: 'bug', id: 'b1' }],
          reentries: [],
        },
      ],
    ]);
    const instance = deduceWorkflowState(snapshot([ingest], documents, { history })).instances[0]!;
    expect(instance.instance.element?.id).toBe('b1');
    expect(instance.complete).toBe(true);
  });

  it('task-203: a re-entry from a state no phase holds as a gate with a fallback reaches no phase', () => {
    const flow = wf(`name: rel
kind: main
element: release
phases:
  - name: plan
    actions:
      - element.set_state(planning)
  - name: ship
    actions:
      - element.set_state(released)
`);
    const documents = [doc('docs/releases/r1.md', { id: 'r1', type: 'release', status: 'planning' }), plan('p1', 'rel', 'r1')];
    const reentries = [{ commit: 'k1', position: 1, verb: 'park' as const, type: 'release', id: 'r1', from: 'released', to: 'planning' }];
    const step = deduceWorkflowState(snapshot([flow], documents, { history: new Map([['s0', { records: [], links: [], reentries }]]) })).instances[0]!.frontier[0]!;
    expect(step).toMatchObject({ key: 'rel.ship@release:r1', reentered: false, reentryCommit: null });
  });

  it('a repository with no commit has an empty answer', () => {
    const repo = makeTempGitRepo();
    try {
      expect(deduceWorkflowStateAtHead(repo)).toEqual({ baseline: { rev: 'HEAD', commit: '' }, active: null, instances: [], diagnostics: [] });
      expect(resolveInstanceRef(deduceWorkflowStateAtHead(repo))).toBeNull();
    } finally {
      removeTempDir(repo);
    }
  });
});

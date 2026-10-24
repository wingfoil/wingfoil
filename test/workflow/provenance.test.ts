/**
 * task-293 — element provenance in the workflow deduction, pure side (P4.21, `cp-002`, REQ-STATE-11, `dl-187`;
 * `spec-017` §2, §4.3, §4.8): `resolveProvenance` (`src/workflow/provenance.ts`) and `deduceWorkflowState` on
 * hand-built snapshots whose instance histories carry adoption and rekey records.
 *
 * - AC 1: an adoption makes its element created by the step it names, for `created` evidence only.
 * - AC 2: a rekey remaps every linkage, record and adoption of its instance that it descends from and that names
 *   `<from>`, keeping the `@<scope>` suffix (or the record's `WingFoil-Element`); chains apply oldest first.
 * - AC 3: one owner — the claim every other claim descends to; two maximal claims are a conflict
 *   (`W_PROVENANCE_CONFLICT`); a key the registry does not declare after rekeys is an orphan
 *   (`W_PROVENANCE_ORPHAN`), evidence of nothing and owner of nothing; D3 (a): an instance of a workflow the
 *   registry does not load raises no orphan diagnostic.
 *
 * The records are built by hand in the shapes the design fixes (`AdoptionRecord`, `RekeyRecord`, the optional
 * `InstanceHistory.adoptions` / `rekeys`, newest first); the fixture-repository side is
 * `test/core/workflow-deduction-provenance.test.ts`.
 */
import { deduceWorkflowState, type DeductionSnapshot } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import type { InstanceHistory, PhaseRecord, StepLink } from '../../src/workflow/deduce';
import {
  ADOPT_SUBJECT_PREFIX,
  ADOPTED_TRAILER,
  REKEY_FROM_TRAILER,
  REKEY_SUBJECT_PREFIX,
  REKEY_TO_TRAILER,
  resolveProvenance,
  W_PROVENANCE_CONFLICT,
  W_PROVENANCE_ORPHAN,
} from '../../src/workflow/provenance';
import { Workflow } from '../../src/workflow/schema';

const MEMORY = MemoryYaml.parse(
  parseYaml(
    `version: 1.0
types:
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, backlog, in-progress, done ]
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
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, released ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    states:
      sequence: [ draft, active, done ]
`,
    'memory.yaml',
  ),
);

const wf = (yaml: string): Workflow => Workflow.parse(parseYaml(yaml, 'workflow.yaml'));

/** A task-bound main whose phases are the keys the rekey cases map onto. */
const FLOW = wf(`name: flow
kind: main
element: task
phases:
  - name: new
    actions: [ agent.execute ]
  - name: x
    actions: [ agent.execute ]
  - name: y
    actions: [ agent.execute ]
  - name: c
    actions: [ agent.execute ]
  - name: capture
    actions: [ 'memory.add(type: bug)' ]
  - name: triage
    actions: [ agent.execute ]
`);

/** An ingest main (`bug-ingest.yaml`'s shape): self-creating, its first phase adds a bug, the second approves it. */
const INGEST = wf(`name: ingest
kind: main
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
  - name: triage
    actions:
      - memory.approve
    approval: { by_role: approver }
`);

/** A release-bound main with a token that has no value (a step-attached `W_UNRESOLVED_TOKEN`). */
const TOKENS = wf(`name: tokens
kind: main
element: release
phases:
  - name: write
    produces: [ "out/{release.notes}.md" ]
`);

// --- Record builders: the shapes of the design (`spec-017` §4.8 as `task-293`'s design reads it) ---------------

const link = (commit: string, position: number, instance: string, step: string, type: string, id: string): StepLink => ({ commit, position, instance, step, type, id });
const rec = (commit: string, position: number, instance: string, phase: string, element: string | null = null): PhaseRecord => ({ commit, position, phase, instance, element, item: null });
const adoption = (commit: string, position: number, instance: string, step: string, type: string, id: string) => ({ commit, position, instance, step, type, id });
const rekey = (commit: string, position: number, instance: string, from: string, to: string) => ({ commit, position, instance, from, to });

interface Parts {
  records?: PhaseRecord[];
  links?: StepLink[];
  adoptions?: ReturnType<typeof adoption>[];
  rekeys?: ReturnType<typeof rekey>[];
}

/** An instance history holding `parts`, newest first, with no re-entry. */
function hist(parts: Parts): InstanceHistory {
  return { records: [], links: [], reentries: [], ...parts } as InstanceHistory;
}

/** Parent links of a linear history, `commits` newest first: each commit's parent is the next one. */
function linear(commits: string[]): Map<string, readonly string[]> {
  return new Map(commits.map((commit, index) => [commit, index + 1 < commits.length ? [commits[index + 1]!] : []]));
}

function provenanceSnapshot(history: Map<string, InstanceHistory>, parents: Map<string, readonly string[]>, workflows: Workflow[] = [FLOW]): Pick<DeductionSnapshot, 'workflows' | 'history' | 'parents'> {
  return { workflows, history, parents };
}

const I1 = [{ id: 'i1', startCommit: 's0' }];

describe('task-293 — the constants writer and reader share (spec-017 §4.8, plan ruling W1-3)', () => {
  it('the subject prefixes, the trailer keys and the two codes', () => {
    expect([ADOPT_SUBJECT_PREFIX, REKEY_SUBJECT_PREFIX]).toEqual(['workflow: adopt ', 'workflow: rekey ']);
    expect([ADOPTED_TRAILER, REKEY_FROM_TRAILER, REKEY_TO_TRAILER]).toEqual(['WingFoil-Adopted', 'WingFoil-Rekey-From', 'WingFoil-Rekey-To']);
    expect([W_PROVENANCE_ORPHAN, W_PROVENANCE_CONFLICT]).toEqual(['W_PROVENANCE_ORPHAN', 'W_PROVENANCE_CONFLICT']);
  });
});

describe('task-293 AC 2 — a rekey remaps what it descends from, keeping the scope; chains apply oldest first (spec-017 §4.8)', () => {
  it('remaps a linkage, a record and an adoption of its instance it descends from; the scope and the record element are kept', () => {
    const history = new Map([
      [
        's0',
        hist({
          rekeys: [rekey('c0', 0, 'i1', 'flow.old', 'flow.new')],
          adoptions: [adoption('c1', 1, 'i1', 'flow.old@task:task-1', 'spec', 'spec-2')],
          records: [rec('c2', 2, 'i1', 'flow.old', 'task:task-1')],
          links: [link('c3', 3, 'i1', 'flow.old@task:task-1', 'spec', 'spec-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 'c2', 'c3', 's0'])), I1);
    const effective = result.history.get('s0')!;
    expect(effective.records).toEqual([{ commit: 'c2', position: 2, phase: 'flow.new', instance: 'i1', element: 'task:task-1', item: null }]);
    expect([...effective.links].sort((a, b) => a.position - b.position)).toEqual([
      { commit: 'c1', position: 1, instance: 'i1', step: 'flow.new@task:task-1', type: 'spec', id: 'spec-2' },
      { commit: 'c3', position: 3, instance: 'i1', step: 'flow.new@task:task-1', type: 'spec', id: 'spec-1' },
    ]);
    expect(result.owners.get('spec:spec-1')).toMatchObject({ kind: 'linkage', commit: 'c3', instance: 'i1', step: 'flow.new@task:task-1', type: 'spec', id: 'spec-1' });
    expect(result.owners.get('spec:spec-2')).toMatchObject({ kind: 'adoption', commit: 'c1', instance: 'i1', step: 'flow.new@task:task-1', type: 'spec', id: 'spec-2' });
    expect(result.orphans).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('a chain a → b, b → c maps a to c', () => {
    const history = new Map([
      [
        's0',
        hist({
          rekeys: [rekey('c0', 0, 'i1', 'flow.b', 'flow.c'), rekey('c1', 1, 'i1', 'flow.a', 'flow.b')],
          records: [rec('c2', 2, 'i1', 'flow.a', 'task:task-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 'c2', 's0'])), I1);
    expect(result.history.get('s0')!.records.map((entry: PhaseRecord) => entry.phase)).toEqual(['flow.c']);
    expect(result.orphans).toEqual([]);
  });

  it('of two sibling rekeys of one key, the older by walk position applies first and the other no longer matches', () => {
    // c3 (record) ← k1 (old → x, position 2) and k2 (old → y, position 1), merged at m0.
    const parents = new Map<string, readonly string[]>([
      ['m0', ['k2', 'k1']],
      ['k2', ['c3']],
      ['k1', ['c3']],
      ['c3', ['s0']],
      ['s0', []],
    ]);
    const history = new Map([
      [
        's0',
        hist({
          rekeys: [rekey('k2', 1, 'i1', 'flow.old', 'flow.y'), rekey('k1', 2, 'i1', 'flow.old', 'flow.x')],
          records: [rec('c3', 3, 'i1', 'flow.old', 'task:task-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, parents), I1);
    expect(result.history.get('s0')!.records.map((entry: PhaseRecord) => entry.phase)).toEqual(['flow.x']);
  });

  it('a record the rekey does not descend from is not remapped, and is an orphan', () => {
    const history = new Map([['s0', hist({ records: [rec('c0', 0, 'i1', 'flow.old', 'task:task-1')], rekeys: [rekey('c1', 1, 'i1', 'flow.old', 'flow.new')] })]]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 's0'])), I1);
    expect(result.history.get('s0')!.records).toEqual([]);
    expect(result.orphans).toMatchObject([{ kind: 'record', commit: 'c0', position: 0, instance: 'i1' }]);
  });

  it("a rekey of another instance remaps nothing of this one's", () => {
    const history = new Map([['s0', hist({ rekeys: [rekey('c0', 0, 'i9', 'flow.old', 'flow.new')], records: [rec('c1', 1, 'i1', 'flow.old', 'task:task-1')] })]]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 's0'])), I1);
    expect(result.history.get('s0')!.records).toEqual([]);
    expect(result.orphans).toMatchObject([{ kind: 'record', commit: 'c1', instance: 'i1' }]);
  });
});

describe('task-293 AC 3 — one owner, conflicts and orphans (spec-017 §4.8, D2 (a))', () => {
  it('of two adoptions of one element, the descendant owns it; the other step did not create it', () => {
    const history = new Map([
      [
        's0',
        hist({
          adoptions: [adoption('c0', 0, 'i1', 'flow.triage', 'bug', 'bug-1'), adoption('c1', 1, 'i1', 'flow.capture', 'bug', 'bug-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 's0'])), I1);
    expect(result.owners.get('bug:bug-1')).toMatchObject({ kind: 'adoption', commit: 'c0', step: 'flow.triage' });
    expect(result.history.get('s0')!.links).toEqual([{ commit: 'c0', position: 0, instance: 'i1', step: 'flow.triage', type: 'bug', id: 'bug-1' }]);
    expect(result.conflicts).toEqual([]);
  });

  it('two adoptions on unrelated branches: no owner, neither counts, one conflict listing both in instance-id then step-key order', () => {
    const parents = new Map<string, readonly string[]>([
      ['m0', ['a', 'b']],
      ['a', ['c3']],
      ['b', ['c3']],
      ['c3', ['s0']],
      ['s0', []],
    ]);
    const history = new Map([
      [
        's0',
        hist({
          adoptions: [adoption('a', 1, 'i1', 'flow.triage', 'bug', 'bug-1'), adoption('b', 2, 'i1', 'flow.capture', 'bug', 'bug-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, parents), I1);
    expect(result.owners.has('bug:bug-1')).toBe(false);
    expect(result.history.get('s0')!.links).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      element: { type: 'bug', id: 'bug-1' },
      claims: [
        { kind: 'adoption', commit: 'b', instance: 'i1', step: 'flow.capture', type: 'bug', id: 'bug-1' },
        { kind: 'adoption', commit: 'a', instance: 'i1', step: 'flow.triage', type: 'bug', id: 'bug-1' },
      ],
    });
  });

  it('D2 (a): a linkage and a later adoption of the same element to another step — the adoption owns it', () => {
    const history = new Map([
      [
        's0',
        hist({
          adoptions: [adoption('c0', 0, 'i1', 'flow.triage', 'bug', 'bug-1')],
          links: [link('c1', 1, 'i1', 'flow.capture', 'bug', 'bug-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 's0'])), I1);
    expect(result.owners.get('bug:bug-1')).toMatchObject({ kind: 'adoption', commit: 'c0', step: 'flow.triage' });
    expect(result.history.get('s0')!.links.map((entry: StepLink) => [entry.commit, entry.step])).toEqual([['c0', 'flow.triage']]);
    expect(result.conflicts).toEqual([]);
  });

  it('one commit in two instances\' walks is one claim, not a conflict with itself', () => {
    const shared = adoption('c0', 0, 'i1', 'flow.capture', 'bug', 'bug-1');
    const history = new Map([
      ['s0', hist({ adoptions: [shared] })],
      ['s1', hist({ adoptions: [shared] })],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 's1', 's0'])), [
      { id: 'i2', startCommit: 's1' },
      { id: 'i1', startCommit: 's0' },
    ]);
    expect(result.owners.get('bug:bug-1')).toMatchObject({ kind: 'adoption', commit: 'c0', instance: 'i1' });
    expect(result.conflicts).toEqual([]);
  });

  it('an orphan linkage, record or adoption is listed in ascending walk position and dropped from the history', () => {
    const history = new Map([
      [
        's0',
        hist({
          adoptions: [adoption('c0', 0, 'i1', 'flow.gone@task:task-1', 'bug', 'bug-1')],
          records: [rec('c1', 1, 'i1', 'flow.gone', 'task:task-1')],
          links: [link('c2', 2, 'i1', 'flow.gone@task:task-1', 'spec', 'spec-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, linear(['c0', 'c1', 'c2', 's0'])), I1);
    expect(result.orphans).toMatchObject([
      { kind: 'adoption', commit: 'c0', position: 0, instance: 'i1', key: 'flow.gone@task:task-1', element: { type: 'bug', id: 'bug-1' } },
      { kind: 'record', commit: 'c1', position: 1, instance: 'i1' },
      { kind: 'linkage', commit: 'c2', position: 2, instance: 'i1', key: 'flow.gone@task:task-1', element: { type: 'spec', id: 'spec-1' } },
    ]);
    const effective = result.history.get('s0')!;
    expect([effective.records, effective.links]).toEqual([[], []]);
    expect([result.owners.has('bug:bug-1'), result.owners.has('spec:spec-1')]).toEqual([false, false]);
  });

  it('an orphaned adoption on an unrelated branch is no conflict for a valid adoption of the same element', () => {
    const parents = new Map<string, readonly string[]>([
      ['m0', ['a', 'b']],
      ['a', ['s0']],
      ['b', ['s0']],
      ['s0', []],
    ]);
    const history = new Map([
      [
        's0',
        hist({
          adoptions: [adoption('a', 1, 'i1', 'flow.gone', 'bug', 'bug-1'), adoption('b', 2, 'i1', 'flow.capture', 'bug', 'bug-1')],
        }),
      ],
    ]);
    const result = resolveProvenance(provenanceSnapshot(history, parents), I1);
    expect(result.conflicts).toEqual([]);
    expect(result.owners.get('bug:bug-1')).toMatchObject({ kind: 'adoption', commit: 'b', step: 'flow.capture' });
  });
});

// --- deduceWorkflowState on snapshots whose histories carry provenance records --------------------------------

function doc(path: string, frontmatter: Record<string, unknown>): { path: string; frontmatter: Record<string, unknown>; body: string } {
  return { path, frontmatter, body: '' };
}

const plan = (id: string, workflow: string, element = ''): ReturnType<typeof doc> => doc(`docs/plans/x/${id}.md`, { id, type: 'plan', status: 'active', workflow, element });

function snapshot(workflows: Workflow[], documents: ReturnType<typeof doc>[], extra: Partial<DeductionSnapshot>): DeductionSnapshot {
  return {
    commit: 'c0ffee',
    workflows,
    workflowFiles: workflows.map((w) => `.wingfoil/workflows/custom/${w.name}.yaml`),
    registryDiagnostics: [],
    memoryYaml: MEMORY,
    documents,
    scanDiagnostics: [],
    tree: [],
    starts: new Map(),
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
    parents: new Map(),
    dirty: [],
    ...extra,
  };
}

describe('task-293 AC 1 — an adoption counts as the step having created the element, for `created` only (spec-017 §4.3)', () => {
  it('an adopted bug binds a self-creating instance and completes its creating step; the gate of triage stays held', () => {
    const deduction = deduceWorkflowState(
      snapshot([INGEST], [doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'open' }), plan('p1', 'ingest')], {
        starts: new Map([['docs/plans/x/p1.md', { commit: 's0', position: 1 }]]),
        history: new Map([['s0', hist({ adoptions: [adoption('c0', 0, 'p1', 'ingest.capture', 'bug', 'bug-1')] })]]),
        parents: linear(['c0', 's0']),
      }),
    );
    const entry = deduction.instances[0]!;
    expect(entry.instance).toMatchObject({ element: { type: 'bug', id: 'bug-1', status: 'open' }, created: [{ type: 'bug', id: 'bug-1', status: 'open' }] });
    expect(entry.phases.map((phase) => `${phase.phase}:${phase.state}`)).toEqual(['capture:complete', 'triage:current']);
    expect(entry.frontier[0]).toMatchObject({ key: 'ingest.triage@bug:bug-1', approval: { elements: [{ type: 'bug', id: 'bug-1', status: 'open' }], recordNeeded: false } });
    expect(deduction.diagnostics).toEqual([]);
  });

  it('an orphan linkage is no longer listed in `Instance.created`', () => {
    const deduction = deduceWorkflowState(
      snapshot([INGEST], [doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'open' }), doc('docs/bugs/bug-2.md', { id: 'bug-2', type: 'bug', status: 'open' }), plan('p1', 'ingest')], {
        starts: new Map([['docs/plans/x/p1.md', { commit: 's0', position: 2 }]]),
        history: new Map([
          [
            's0',
            hist({
              links: [link('c0', 0, 'p1', 'ingest.gone', 'bug', 'bug-2'), link('c1', 1, 'p1', 'ingest.capture', 'bug', 'bug-1')],
            }),
          ],
        ]),
        parents: linear(['c0', 'c1', 's0']),
      }),
    );
    expect(deduction.instances[0]!.instance.created).toEqual([{ type: 'bug', id: 'bug-1', status: 'open' }]);
  });
});

describe('task-293 AC 3 — the two diagnostics, their texts, locations and order (spec-017 §2, D3 (a), D4)', () => {
  it('orphans then conflicts, after W_INSTANCE_WORKFLOW_UNKNOWN and before the step-attached diagnostics; none for an unknown workflow', () => {
    const documents = [
      doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'open' }),
      doc('docs/bugs/bug-2.md', { id: 'bug-2', type: 'bug', status: 'open' }),
      doc('docs/releases/r1.md', { id: 'r1', type: 'release', status: 'planning', notes: '' }),
      plan('p-ingest', 'ingest'),
      plan('p-gone', 'gone'),
      plan('p-tok', 'tokens', 'r1'),
    ];
    // p-ingest's walk: o1 (an orphan adoption of bug-2), then two adoptions of bug-1 on sibling branches merged at m0.
    const parents = new Map<string, readonly string[]>([
      ['m0', ['ca', 'cb']],
      ['ca', ['o1']],
      ['cb', ['o1']],
      ['o1', ['s0']],
      ['r9', ['s1']],
      ['s0', []],
      ['s1', []],
      ['s2', []],
    ]);
    const deduction = deduceWorkflowState(
      snapshot([INGEST, TOKENS], documents, {
        starts: new Map([
          ['docs/plans/x/p-ingest.md', { commit: 's0', position: 10 }],
          ['docs/plans/x/p-gone.md', { commit: 's1', position: 11 }],
          ['docs/plans/x/p-tok.md', { commit: 's2', position: 12 }],
        ]),
        history: new Map([
          [
            's0',
            hist({
              adoptions: [
                adoption('ca', 1, 'p-ingest', 'ingest.triage', 'bug', 'bug-1'),
                adoption('cb', 2, 'p-ingest', 'ingest.capture', 'bug', 'bug-1'),
                adoption('o1', 3, 'p-ingest', 'ingest.gone', 'bug', 'bug-2'),
              ],
            }),
          ],
          // D3 (a): an orphan of an instance whose workflow the registry does not load raises no diagnostic.
          ['s1', hist({ records: [rec('r9', 4, 'p-gone', 'gone.x')] })],
          ['s2', hist({})],
        ]),
        parents,
      }),
    );
    expect(deduction.diagnostics.map((d) => d.code)).toEqual(['W_INSTANCE_WORKFLOW_UNKNOWN', 'W_PROVENANCE_ORPHAN', 'W_PROVENANCE_CONFLICT', 'W_UNRESOLVED_TOKEN']);
    expect(deduction.diagnostics[1]).toEqual({
      code: 'W_PROVENANCE_ORPHAN',
      severity: 'warning',
      file: 'docs/plans/x/p-ingest.md',
      path: 'o1',
      message: 'adoption o1 of p-ingest names ingest.gone, which the registry does not declare: it is evidence of nothing and owns nothing (bug:bug-2)',
    });
    expect(deduction.diagnostics[2]).toEqual({
      code: 'W_PROVENANCE_CONFLICT',
      severity: 'warning',
      file: 'docs/plans/x/p-ingest.md',
      path: 'bug:bug-1',
      message: 'bug:bug-1 is claimed on unrelated branches by p-ingest ingest.capture (cb), p-ingest ingest.triage (ca): it counts as created by neither',
    });
    // Created by neither: the self-creating instance stays unbound.
    const ingest = deduction.instances.find((entry) => entry.instance.id === 'p-ingest')!;
    expect(ingest.instance).toMatchObject({ element: null, created: [] });
    expect(ingest.frontier.map((step) => step.key)).toEqual(['ingest.capture']);
  });

  it('an orphan linkage and an orphan record: one W_PROVENANCE_ORPHAN each, the record\'s message without "owns nothing"', () => {
    const deduction = deduceWorkflowState(
      snapshot([INGEST], [doc('docs/bugs/bug-2.md', { id: 'bug-2', type: 'bug', status: 'open' }), plan('p1', 'ingest')], {
        starts: new Map([['docs/plans/x/p1.md', { commit: 's0', position: 2 }]]),
        history: new Map([['s0', hist({ records: [rec('c0', 0, 'p1', 'ingest.gone')], links: [link('c1', 1, 'p1', 'ingest.gone', 'bug', 'bug-2')] })]]),
        parents: linear(['c0', 'c1', 's0']),
      }),
    );
    const orphans = deduction.diagnostics.filter((d) => d.code === 'W_PROVENANCE_ORPHAN');
    expect(orphans.map((d) => [d.file, d.path])).toEqual([
      ['docs/plans/x/p1.md', 'c0'],
      ['docs/plans/x/p1.md', 'c1'],
    ]);
    expect(orphans[0]!.message).toBe('record c0 of p1 names ingest.gone, which the registry does not declare: it is evidence of nothing');
    expect(orphans[1]!.message).toBe('linkage c1 of p1 names ingest.gone, which the registry does not declare: it is evidence of nothing and owns nothing (bug:bug-2)');
  });
});

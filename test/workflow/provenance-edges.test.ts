/**
 * task-293 — edges of the provenance readers and resolver the red suites leave open (`spec-017` §4.8; design D1 (a),
 * D3 (a), D4), added by the developer in green/refactor; the acceptance tests are `test/workflow/provenance.test.ts`
 * and `test/core/workflow-deduction-provenance.test.ts`.
 *
 * - `readAdoption` / `readRekey`: a blank trailer value, a scoped rekey key and another subject read as no record.
 * - `resolveProvenance`: two sibling adoptions of one element into one step are ordered by commit; two linkage orphans
 *   of one commit by element; a record of another instance in the walk is no orphan of this one.
 * - The conflict diagnostic's `file` when the first claim's instance is not open: that plan's path when `HEAD` holds
 *   it, else empty.
 * - The `src/core` barrel re-exports the provenance module unchanged.
 */
import * as core from '../../src/core';
import { deduceWorkflowState, type DeductionSnapshot } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import type { InstanceHistory } from '../../src/workflow/deduce';
import * as provenance from '../../src/workflow/provenance';
import { readAdoption, readRekey, resolveProvenance, type AdoptionRecord, type RekeyRecord } from '../../src/workflow/provenance';
import { Workflow } from '../../src/workflow/schema';

const AT = { commit: 'c0', position: 0 };

describe('readAdoption / readRekey — what is no record (design D1 (a))', () => {
  const adopted = 'WingFoil-Instance: i1\nWingFoil-Step: flow.capture\nWingFoil-Adopted: bug:bug-1\nWingFoil-Version: 0.3.1 (abc1234)';
  const rekeyed = 'WingFoil-Instance: i1\nWingFoil-Rekey-From: flow.old\nWingFoil-Rekey-To: flow.new';

  it('reads the two records from their subject and trailers', () => {
    expect(readAdoption(AT, 'workflow: adopt i1 flow.capture bug:bug-1', adopted)).toEqual({ ...AT, instance: 'i1', step: 'flow.capture', type: 'bug', id: 'bug-1' });
    expect(readRekey(AT, 'workflow: rekey i1 flow.old flow.new', rekeyed)).toEqual({ ...AT, instance: 'i1', from: 'flow.old', to: 'flow.new' });
  });

  it('a blank trailer value, another subject or a scoped rekey key is no record', () => {
    expect(readAdoption(AT, 'workflow: adopt i1 flow.capture bug:bug-1', adopted.replace('WingFoil-Instance: i1', 'WingFoil-Instance: '))).toBeNull();
    expect(readAdoption(AT, 'workflow: rekey i1 a b', adopted)).toBeNull();
    expect(readRekey(AT, 'workflow: adopt i1 a b', rekeyed)).toBeNull();
    expect(readRekey(AT, 'workflow: rekey i1 flow.old flow.new', rekeyed.replace('flow.old', 'flow.old@task:task-1'))).toBeNull();
    expect(readRekey(AT, 'workflow: rekey i1 flow.old flow.new', rekeyed.replace('flow.new', 'flow.new@task:task-1'))).toBeNull();
    expect(readRekey(AT, 'workflow: rekey i1 flow.old flow.new', 'WingFoil-Instance: i1\nWingFoil-Rekey-From: flow.old')).toBeNull();
  });
});

const FLOW = Workflow.parse(
  parseYaml(
    `name: flow
kind: main
phases:
  - name: capture
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
  - name: triage
    actions: [ agent.execute ]
`,
    'flow.yaml',
  ),
);

const adoption = (commit: string, position: number, instance: string, step: string, id: string): AdoptionRecord => ({ commit, position, instance, step, type: 'bug', id });
const hist = (parts: Partial<InstanceHistory>): InstanceHistory => ({ records: [], links: [], reentries: [], ...parts });
const SIBLINGS = new Map<string, readonly string[]>([
  ['m0', ['a', 'b']],
  ['a', ['s0']],
  ['b', ['s0']],
  ['s0', []],
]);

describe('resolveProvenance — orders and instances (spec-017 §4.8, §1.3)', () => {
  it('two sibling adoptions of one element into one step: the conflict lists them by commit', () => {
    const history = new Map([['s0', hist({ adoptions: [adoption('b', 1, 'i1', 'flow.capture', 'bug-1'), adoption('a', 2, 'i1', 'flow.capture', 'bug-1')] })]]);
    const result = resolveProvenance({ workflows: [FLOW], history, parents: SIBLINGS }, [{ id: 'i1', startCommit: 's0' }]);
    expect(result.conflicts.map((conflict) => conflict.claims.map((claim) => claim.commit))).toEqual([['a', 'b']]);
  });

  it('two linkage orphans of one commit are ordered by element; a record of another instance is no orphan of this one', () => {
    const history = new Map([
      [
        's0',
        hist({
          links: [
            { commit: 'c1', position: 1, instance: 'i1', step: 'flow.gone', type: 'bug', id: 'bug-2' },
            { commit: 'c1', position: 1, instance: 'i1', step: 'flow.gone', type: 'bug', id: 'bug-1' },
          ],
          records: [{ commit: 'c2', position: 2, phase: 'flow.gone', instance: 'i9', element: null, item: null }],
        }),
      ],
    ]);
    const parents = new Map<string, readonly string[]>([
      ['c1', ['c2']],
      ['c2', ['s0']],
      ['s0', []],
    ]);
    const result = resolveProvenance({ workflows: [FLOW], history, parents }, [{ id: 'i1', startCommit: 's0' }, { id: 'i2', startCommit: 'unknown' }]);
    expect(result.orphans.map((orphan) => [orphan.kind, orphan.commit, orphan.element?.id])).toEqual([
      ['linkage', 'c1', 'bug-1'],
      ['linkage', 'c1', 'bug-2'],
    ]);
    expect(result.history.get('s0')!.records).toEqual([]);
  });

  it("a rekey keeps a record's `WingFoil-Item` scope", () => {
    const rekey: RekeyRecord = { commit: 'k', position: 0, instance: 'i1', from: 'flow.old', to: 'flow.triage' };
    const history = new Map([['s0', hist({ rekeys: [rekey], records: [{ commit: 'r', position: 1, phase: 'flow.old', instance: 'i1', element: null, item: 'dna:x#k' }] })]]);
    const parents = new Map<string, readonly string[]>([
      ['k', ['r']],
      ['r', ['s0']],
      ['s0', []],
    ]);
    const result = resolveProvenance({ workflows: [FLOW], history, parents }, [{ id: 'i1', startCommit: 's0' }]);
    expect(result.history.get('s0')!.records).toEqual([{ commit: 'r', position: 1, phase: 'flow.triage', instance: 'i1', element: null, item: 'dna:x#k' }]);
  });
});

describe('W_PROVENANCE_CONFLICT — `file` when the first claim is of an instance that is not open (D4)', () => {
  const memoryYaml = MemoryYaml.parse(
    parseYaml(
      `version: 1.0
types:
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, closed ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
`,
      'memory.yaml',
    ),
  );
  const doc = (path: string, frontmatter: Record<string, unknown>) => ({ path, frontmatter, body: '' });

  function conflictFile(withDonePlan: boolean): string {
    const documents = [
      doc('docs/bugs/bug-1.md', { id: 'bug-1', type: 'bug', status: 'open' }),
      doc('docs/plans/i2.md', { id: 'i2', type: 'plan', status: 'active', workflow: 'flow', element: '' }),
      ...(withDonePlan ? [doc('docs/plans/i0.md', { id: 'i0', type: 'plan', status: 'done', workflow: 'flow', element: '' })] : []),
    ];
    const snapshot: DeductionSnapshot = {
      commit: 'm0',
      workflows: [FLOW],
      workflowFiles: ['.wingfoil/workflows/custom/flow.yaml'],
      registryDiagnostics: [],
      memoryYaml,
      documents,
      scanDiagnostics: [],
      tree: [],
      starts: new Map([['docs/plans/i2.md', { commit: 's0', position: 3 }]]),
      history: new Map([['s0', hist({ adoptions: [adoption('a', 1, 'i0', 'flow.capture', 'bug-1'), adoption('b', 2, 'i2', 'flow.capture', 'bug-1')] })]]),
      transitions: [],
      lastChanges: new Map(),
      parents: SIBLINGS,
      dirty: [],
    };
    const conflict = deduceWorkflowState(snapshot).diagnostics.find((diagnostic) => diagnostic.code === 'W_PROVENANCE_CONFLICT');
    return conflict!.file;
  }

  it('the done plan of the first claim when HEAD holds it, else empty', () => {
    expect(conflictFile(true)).toBe('docs/plans/i0.md');
    expect(conflictFile(false)).toBe('');
  });
});

describe('the src/core barrel re-exports the provenance module', () => {
  it('every runtime export, unchanged', () => {
    const names = Object.keys(provenance).sort();
    expect(names.map((name) => (core as Record<string, unknown>)[name] === (provenance as Record<string, unknown>)[name])).toEqual(names.map(() => true));
    expect(names).toEqual([
      'ADOPTED_TRAILER',
      'ADOPT_SUBJECT_PREFIX',
      'INSTANCE_TRAILER',
      'REKEY_FROM_TRAILER',
      'REKEY_SUBJECT_PREFIX',
      'REKEY_TO_TRAILER',
      'STEP_TRAILER',
      'W_PROVENANCE_CONFLICT',
      'W_PROVENANCE_ORPHAN',
      'readAdoption',
      'readRekey',
      'resolveProvenance',
    ]);
  });
});

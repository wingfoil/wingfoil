/**
 * task-230 (refactor) — `iterate_over: element:<field>` with no element to read from (`spec-017` §4.6):
 * the entries are undecided, the phase is one unexpanded step, reported as `W_UNRESOLVED_TOKEN`.
 * The registry refuses such a workflow (`E_WORKFLOW_COLLECTION_UNRESOLVED`); the deduction still answers
 * deterministically when it runs on what was loaded (spec-017 §2).
 */
import { deduceWorkflowState, type DeductionSnapshot } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';

const MEMORY = MemoryYaml.parse(
  parseYaml(
    'version: 1.0\ntypes:\n  release:\n    path: "docs/releases/{id}.md"\n    states:\n      sequence: [ draft, in-development, released ]\n  plan:\n    path: "docs/plans/{scope}/{id}.md"\n    states:\n      sequence: [ draft, active, done ]\n',
    'memory.yaml',
  ),
);
const wf = (yaml: string): Workflow => Workflow.parse(parseYaml(yaml, 'workflow.yaml'));
const WAVE = wf('name: wave\nkind: sub\nphases:\n  - name: re-plan\n');
const plan = (workflow: string, element: string) => ({
  path: 'docs/plans/x/p1.md',
  frontmatter: { id: 'p1', type: 'plan', status: 'active', workflow, element },
  body: '',
});

function deduce(cycle: Workflow, element: string) {
  const snapshot: DeductionSnapshot = {
    commit: 'c0ffee',
    workflows: [cycle, WAVE],
    workflowFiles: ['.wingfoil/workflows/custom/cycle.yaml', '.wingfoil/workflows/custom/wave.yaml'],
    registryDiagnostics: [],
    memoryYaml: MEMORY,
    documents: [plan('cycle', element)],
    scanDiagnostics: [],
    tree: [],
    starts: new Map([['docs/plans/x/p1.md', { commit: 's0', position: 0 }]]),
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
    parents: new Map(),
    dirty: [],
  };
  return deduceWorkflowState(snapshot);
}

describe('task-230 — an element: collection with nothing to read from', () => {
  it('a workflow bound to no element: no element in scope', () => {
    const deduction = deduce(wf('name: cycle\nkind: main\nphases:\n  - name: implementation\n    include: wave\n    iterate_over: element:waves\n'), '');
    expect(deduction.instances[0]!.frontier.map((step) => step.key)).toEqual(['cycle.implementation']);
    expect(deduction.diagnostics.map((d) => [d.code, d.path, d.message])).toEqual([
      ['W_UNRESOLVED_TOKEN', 'phases[0].iterate_over', "collection 'element:waves' has no element in scope"],
    ]);
  });

  it('a bound element that does not exist: no element bound', () => {
    const deduction = deduce(
      wf('name: cycle\nkind: main\nelement: release\nphases:\n  - name: implementation\n    include: wave\n    iterate_over: element:waves\n'),
      'r-missing',
    );
    expect(deduction.diagnostics.map((d) => d.message)).toContain("collection 'element:waves' has no release element bound");
  });
});

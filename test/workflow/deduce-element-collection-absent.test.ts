/**
 * task-230 review F1 — an `element:<field>` whose field is ABSENT is undecided, not empty (`spec-017` §4.6):
 * a release with no `waves:` must not read as a finished implementation. The phase is one unexpanded step,
 * reported as `W_UNRESOLVED_TOKEN` at `phases[<i>].iterate_over`; an explicit `waves: []` stays vacuous
 * (`deduce-element-collection.test.ts`).
 */
import { deduceWorkflowState, type DeductionSnapshot } from '../../src/core';
import { MemoryYaml } from '../../src/memory/schema';
import { parseYaml } from '../../src/validation';
import { Workflow } from '../../src/workflow/schema';

const MEMORY = MemoryYaml.parse(
  parseYaml(
    'version: 1.0\ntypes:\n  release:\n    path: "docs/releases/{id}.md"\n    states:\n      sequence: [ draft, in-development, releasing, released ]\n  plan:\n    path: "docs/plans/{scope}/{id}.md"\n    states:\n      sequence: [ draft, active, done ]\n',
    'memory.yaml',
  ),
);
const wf = (yaml: string): Workflow => Workflow.parse(parseYaml(yaml, 'workflow.yaml'));

it('a release with no waves: field leaves implementation one unexpanded step, reported', () => {
  const cycle = wf('name: cycle\nkind: main\nelement: release\nphases:\n  - name: implementation\n    include: wave\n    iterate_over: element:waves\n  - name: wrap\n    actions:\n      - element.set_state(releasing)\n');
  const wave = wf('name: wave\nkind: sub\nelement: release\nphases:\n  - name: re-plan\n');
  const snapshot: DeductionSnapshot = {
    commit: 'c0ffee',
    workflows: [cycle, wave],
    workflowFiles: ['.wingfoil/workflows/custom/cycle.yaml', '.wingfoil/workflows/custom/wave.yaml'],
    registryDiagnostics: [],
    memoryYaml: MEMORY,
    documents: [
      { path: 'docs/releases/r1.md', frontmatter: { id: 'r1', type: 'release', status: 'in-development', version: 'v1' }, body: '' },
      { path: 'docs/plans/x/p1.md', frontmatter: { id: 'p1', type: 'plan', status: 'active', workflow: 'cycle', element: 'r1' }, body: '' },
    ],
    scanDiagnostics: [],
    tree: [],
    starts: new Map([['docs/plans/x/p1.md', { commit: 's0', position: 0 }]]),
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
    parents: new Map(),
    dirty: [],
  };
  const deduction = deduceWorkflowState(snapshot);
  expect(deduction.instances[0]!.phases[0]).toMatchObject({ phase: 'implementation', state: 'current' });
  expect(deduction.instances[0]!.frontier.map((step) => step.key)).toEqual(['cycle.implementation@release:r1']);
  expect(deduction.diagnostics.map((d) => [d.code, d.path, d.message])).toEqual([
    ['W_UNRESOLVED_TOKEN', 'phases[0].iterate_over', "collection 'element:waves' of release:r1 has no field 'waves'"],
  ]);
});

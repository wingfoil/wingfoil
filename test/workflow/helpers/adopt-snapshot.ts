/**
 * task-294 — hand-built `DeductionSnapshot`s for the pure side of `workflow adopt` (`DeducedStep.additions`,
 * `planAdoptions`), in the shapes `test/workflow/deduce.test.ts` and `test/workflow/provenance.test.ts` build
 * them: one Memory document per element, one plan per instance (its start commit `s<i>`), and the instance
 * histories by start commit, newest first.
 */
import type { DeductionSnapshot } from '../../../src/core';
import { MemoryYaml } from '../../../src/memory/schema';
import { parseYaml } from '../../../src/validation';
import type { InstanceHistory, StepLink } from '../../../src/workflow/deduce';
import { Workflow } from '../../../src/workflow/schema';

export const MEMORY = MemoryYaml.parse(
  parseYaml(
    `version: 1.0
types:
  release-line:
    path: "docs/planning/{id}.md"
    states:
      sequence: [ draft, planning, active ]
      gates:
        planning: { reject: draft }
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, released ]
  adr:
    path: "docs/adrs/{id}.md"
    states:
      sequence: [ draft, pending, accepted ]
  spec:
    path: "docs/specs/{id}.md"
    states:
      sequence: [ draft, pending, approved ]
  bug:
    path: "docs/bugs/{id}.md"
    states:
      sequence: [ draft, open, closed ]
  task:
    path: "docs/tasks/{id}.md"
    states:
      sequence: [ draft, pending, done ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    states:
      sequence: [ draft, active, done ]
`,
    'memory.yaml',
  ),
);

export const wf = (yaml: string): Workflow => Workflow.parse(parseYaml(yaml, 'workflow.yaml'));

export interface Doc {
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

export function doc(path: string, frontmatter: Record<string, unknown>): Doc {
  return { path, frontmatter, body: '' };
}

/** A Memory element of `type` at its declared path, with `extra` frontmatter fields. */
export function el(type: string, id: string, status: string, extra: Record<string, unknown> = {}, path?: string): Doc {
  const folder = { 'release-line': 'planning', release: 'releases', adr: 'adrs', spec: 'specs', bug: 'bugs', task: 'tasks' }[type] ?? type;
  return doc(path ?? `docs/${folder}/${id}.md`, { id, type, title: id, status, ...extra });
}

/** An open instance plan of `workflow`, bound to `element` (an id) or self-creating (`''`). */
export function plan(id: string, workflow: string, element = ''): Doc {
  return doc(`docs/plans/x/${id}.md`, { id, type: 'plan', status: 'active', workflow, element });
}

/** An instance history holding `parts`, newest first, with no re-entry. */
export function hist(parts: Partial<Record<'links' | 'adoptions' | 'records' | 'rekeys', unknown[]>>): InstanceHistory {
  return { records: [], links: [], reentries: [], ...parts } as InstanceHistory;
}

export const link = (commit: string, position: number, instance: string, step: string, type: string, id: string): StepLink => ({ commit, position, instance, step, type, id });
export const adoption = (commit: string, position: number, instance: string, step: string, type: string, id: string) => ({ commit, position, instance, step, type, id });

/**
 * The snapshot: the plans among `documents` start at `s0`, `s1`, … in document order, at walk positions 100, 101, …
 * (older than every commit a history names, which the cases number from 0).
 */
export function snapshot(workflows: Workflow[], documents: Doc[], extra: Partial<DeductionSnapshot> = {}): DeductionSnapshot {
  const plans = documents.filter((entry) => entry.frontmatter['type'] === 'plan');
  return {
    commit: 'c0ffee',
    workflows,
    workflowFiles: workflows.map((entry) => `.wingfoil/workflows/custom/${entry.name}.yaml`),
    registryDiagnostics: [],
    memoryYaml: MEMORY,
    documents,
    scanDiagnostics: [],
    tree: documents.map((entry) => entry.path).sort(),
    starts: new Map(plans.map((entry, index) => [entry.path, { commit: `s${index}`, position: 100 + index }])),
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
    parents: new Map(),
    dirty: [],
    ...extra,
  };
}

/** `life`: a self-creating main whose phases are given as YAML list items. */
export function life(phases: string): Workflow {
  return wf(`name: life\nkind: main\nphases:\n${phases}`);
}

export const SEED_V1 = `  - name: seed
    actions:
      - 'memory.add(type: release-line, version: "v1")'
      - memory.submit
`;
export const ADR = `  - name: adr
    actions:
      - 'memory.add(type: adr)'
`;
export const GATE = `  - name: approve
    actions:
      - memory.approve
    approval: { by_role: approver }
`;
export const CLOSE = `  - name: close
    actions:
      - agent.execute
`;

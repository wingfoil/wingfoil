/**
 * WORKFLOW.md parity gate (task-148, bug-170; `dl-116` Q1 (A) — enumeration parity, modelled on
 * `cli-reference.test.ts`).
 *
 * `.wingfoil/WORKFLOW.md` is the human-readable reference of this repository's workflows. It drifted
 * because each decision that added a phase edited the workflow YAML and `CLAUDE.md`, and nothing
 * compared the reference with `workflows.yaml` (bug-170). This test loads the workflow registry the
 * CLI loads — the manifest and every file its `include` list names — and requires every workflow name
 * and every phase name in it to appear in `WORKFLOW.md` as a whole word. A task that adds or renames a
 * phase therefore updates the reference in the same change. Deterministic: the registry is walked in
 * `include` order and the missing names are reported sorted.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowsYaml } from '../../src/core/loaders';

const repoRoot = join(__dirname, '..', '..');
const referencePath = join(repoRoot, '.wingfoil', 'WORKFLOW.md');

/** Whether `name` occurs in `text` as a whole word — not as part of a longer kebab-case name. */
function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(text);
}

const FIXTURE = join(__dirname, 'fixtures', 'enumeration-parity', 'workflow-md-drift.md');

/** The `workflow/phase` pairs of `phases` that `text` does not document, sorted. */
function undocumentedPhases(text: string, phases: ReadonlyArray<readonly [string, string]>): string[] {
  const reference = text.replace(/\\n/g, ' ');
  return phases.filter(([, phase]) => !mentions(reference, phase)).map(([workflow, phase]) => `${workflow}/${phase}`).sort();
}

describe('WORKFLOW.md parity — the phase predicate, on a fixture (bug-206)', () => {
  it('does not count a dotted action or an unrelated section as a mention of a phase', () => {
    const phases = [
      ['release-cycle', 'planning'],
      ['release-cycle', 'submit'],
      ['e2e-smoke', 'fresh-init'],
      ['e2e-smoke', 'gate'],
    ] as const;
    expect(undocumentedPhases(readFileSync(FIXTURE, 'utf8'), phases)).toEqual(['e2e-smoke/gate', 'release-cycle/submit']);
  });
});

describe('WORKFLOW.md parity with workflows.yaml (.wingfoil/WORKFLOW.md)', () => {
  // A Mermaid label writes its line breaks as the two characters `\n`; read them as whitespace, so a
  // name that opens a label line counts as a whole word.
  const reference = readFileSync(referencePath, 'utf8').replace(/\\n/g, ' ');
  const { workflows } = loadWorkflowsYaml(repoRoot);

  it('loads a non-empty registry to compare against', () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('names every workflow workflows.yaml includes', () => {
    const missing = workflows.map((w) => w.name).filter((name) => !mentions(reference, name));
    expect(missing.sort()).toEqual([]);
  });

  it('names every phase of every workflow workflows.yaml includes', () => {
    const missing: string[] = [];
    for (const workflow of workflows) {
      for (const phase of workflow.phases) {
        if (!mentions(reference, phase.name)) missing.push(`${workflow.name}/${phase.name}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });
});

/**
 * task-277 — `release-planning`'s `define-scope` sweeps the `scheduled` change-proposals of the release into its
 * `features:`, and `vision-change`'s `schedule` is narrowed to its own stamps (approver ruling 2026-10-10 item 5 on
 * task-212 decision 4; rulings 2026-10-12 D1 (c), D2; `dl-132` element 4; `dl-016`'s sweep pattern).
 *
 * - AC 1: `schedule` names the sequencer entry and the element's `release` stamp only, and leaves the release's
 *   `features:` to `define-scope`; its actions stay as they are; `vision-change.yaml` reaches 1.1.
 * - AC 2: `define-scope` states the sweep in its description (the `scheduled` change-proposals whose `release` is
 *   this release, their feature ids into `features:`, through `memory amend` on a release past `draft`) and carries
 *   the unbound post-check `change-proposals.swept(…)`; no `where` (D1 (c)), so it keeps `memory.submit` and its
 *   `state` evidence; `release-planning.yaml` reaches 2.0 (numerically, never 1.10).
 * - AC 3: the zero-error load and the new unbound check (the conformance row is in
 *   `workflow-repository-conformance.test.ts`).
 * - AC 4: `WORKFLOW.md` draws the sweep and the narrowed step; the same-class sentences in `memory.yaml`, the
 *   `change-proposal` template and `.wingfoil/README.md` follow.
 *
 * The configuration is read from the working tree (`loadWorkflowRegistry`), except the evidence and the load
 * diagnostics, which are read at `HEAD` like the conformance test. Version minimums are "at least" (bug-314).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowRegistry, loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import type { Phase } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const version = (path: string): number => Number(/^version:\s*([0-9.]+)/m.exec(read(path))![1]);
const versionLine = (path: string): string => /^version:.*$/m.exec(read(path))![0];

function phase(workflowName: string, phaseName: string): Phase {
  const workflow = loadWorkflowRegistry(ROOT).workflows.find((w) => w.name === workflowName);
  const found = workflow?.phases.find((p) => p.name === phaseName);
  if (found === undefined) throw new Error(`no phase ${workflowName}.${phaseName}`);
  return found;
}

const SWEPT = /^change-proposals\.swept\(/;

describe('task-277 AC 1 — vision-change `schedule` stamps the element and the sequencer only', () => {
  const schedule = (): Phase => phase('vision-change', 'schedule');

  it('names the sequencer entry and the release stamp, and leaves features: to define-scope', () => {
    const description = schedule().description ?? '';
    expect(description).toMatch(/07_sequencer\.md/);
    expect(description).toMatch(/`release`/);
    expect(description).toMatch(/define-scope/);
    expect(description).not.toMatch(/feature\s+ids in the release element's `features:`/);
  });

  it('keeps its actions and checks', () => {
    expect(schedule().actions).toEqual(['element.set_release("{change-proposal.target_release}")', 'element.set_state(scheduled)']);
    expect(schedule().checks?.pre).toEqual(['change-proposal.target_release is not empty']);
    expect(schedule().checks?.post).toEqual(['vision-index.current']);
  });

  it('vision-change.yaml is at least 1.1, with a task-277 history entry', () => {
    expect(version('.wingfoil/workflows/custom/vision-change.yaml')).toBeGreaterThanOrEqual(1.1);
    expect(versionLine('.wingfoil/workflows/custom/vision-change.yaml')).toMatch(/1\.1 [^;]*task-277/);
  });
});

describe('task-277 AC 2 — define-scope sweeps the scheduled change-proposals (no selection, D1 (c))', () => {
  const defineScope = (): Phase => phase('release-planning', 'define-scope');

  it('states the sweep in its description, with the amend path for a release past draft (D2)', () => {
    const description = defineScope().description ?? '';
    expect(description).toMatch(/`scheduled` change-proposals/);
    expect(description).toMatch(/\{release\.version\}/);
    expect(description).toMatch(/`features:`/);
    expect(description).toMatch(/memory amend/);
    expect(description).toMatch(/kind:/); // a release with no kind: (predating dl-092) is amended the same way (bug-342, task-279)
    expect(description).toMatch(/20 %/); // task-230's reservation is kept
  });

  it('declares no where, keeps memory.submit and its frontmatter.required check, and adds change-proposals.swept', () => {
    const scope = defineScope();
    expect(scope.where).toBeUndefined();
    expect(scope.iterate_over).toBeUndefined();
    expect(scope.actions).toEqual(['memory.submit']);
    const post = scope.checks?.post ?? [];
    expect(post[0]).toBe(
      'frontmatter.required: [title, kind, version, pillar, features, requirements, release-line] except kind for [minor-v0.1, minor-v0.2, minor-v0.3, minor-v0.4, minor-v1.0]',
    );
    expect(post).toHaveLength(2);
    expect(post[1]).toMatch(SWEPT);
    expect(post[1]).toMatch(/scheduled/);
    expect(post[1]).toMatch(/\{release\.version\}/);
  });

  it('release-planning.yaml is at least 2.0 (numerically), with a task-277 history entry', () => {
    expect(version('.wingfoil/workflows/custom/release-planning.yaml')).toBeGreaterThanOrEqual(2.0);
    expect(versionLine('.wingfoil/workflows/custom/release-planning.yaml')).toMatch(/2\.0 [^;]*task-277/);
  });
});

describe('task-277 AC 3 — at HEAD: zero errors, the state evidence kept, the new check unbound', () => {
  it('loads with zero errors and reports change-proposals.swept as define-scope checks.post[1]', () => {
    const loaded = loadWorkflowRegistryAtHead(ROOT);
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const own = loaded.diagnostics
      .filter((d) => d.file === 'workflows/custom/release-planning.yaml' && d.path.startsWith('phases[1].'))
      .map((d) => [d.code, d.path, /token '([a-z.-]+)/.exec(d.message)?.[1]]);
    expect(own).toEqual([
      ['W_WORKFLOW_UNBOUND_TOKEN', 'phases[1].checks.post[0]', 'frontmatter.required'],
      ['W_WORKFLOW_UNBOUND_TOKEN', 'phases[1].checks.post[1]', 'change-proposals.swept'],
    ]);
  });

  it('define-scope still deduces from the release state and its produces (no selection evidence)', () => {
    const shown = workflowShowAtHead(ROOT, 'release-planning');
    if (!shown.ok) throw new Error(shown.error.message);
    const scope = shown.value.workflow.phases.find((p) => p.name === 'define-scope')!;
    expect(scope.evidence).toEqual(['state', 'produces']);
    expect(scope.selection).toBeNull();
  });
});

describe('task-277 AC 4 — WORKFLOW.md and the same-class sentences', () => {
  const workflowMd = (): string => read('.wingfoil/WORKFLOW.md');
  const node = (id: string): string => new RegExp(`^\\s*${id}\\["([^"]*)"\\]`, 'm').exec(workflowMd())![1]!;

  it('the define-scope node draws the sweep and the amend path', () => {
    expect(node('DS')).toMatch(/scheduled change-proposals/);
    expect(node('DS')).toMatch(/features:/);
    expect(node('DS')).toMatch(/change-proposals\.swept/);
    expect(node('DS')).toMatch(/memory amend/);
  });

  it('the schedule node no longer writes the release features:', () => {
    expect(node('V7')).not.toMatch(/release `features:`/);
    expect(node('V7')).toMatch(/define-scope/);
  });

  it('memory.yaml, the change-proposal template and .wingfoil/README.md say the same', () => {
    expect(read('.wingfoil/memory.yaml')).not.toMatch(/once a release carries it/);
    expect(version('.wingfoil/memory.yaml')).toBeGreaterThanOrEqual(3.3);
    const template = read('.wingfoil/memory/templates/change-proposal.md');
    expect(template).not.toMatch(/the release element's `features:`/);
    expect(template).toMatch(/define-scope/);
    expect(Number(/^tmpl_version:\s*(\d+)/m.exec(template)![1])).toBeGreaterThanOrEqual(261012);
    expect(read('.wingfoil/README.md')).not.toMatch(/schedule \(sequencer \+ the release's `features:`/);
  });
});

/**
 * task-230 — waves, the governance re-sweep and the growth threshold in this repository's release process
 * (`dl-100` §1 (a), §2, §3 (a), §4 (b); `dl-102` §2; `dl-133` §2; approver rulings D1–D4, 2026-10-12).
 *
 * - AC 1: `release-cycle.implementation` runs the new `wave` sub once per entry of the release's `waves:`
 *   (`iterate_over: element:waves`, spec-003 § "Collections"); `wave` runs the wave's dev-loops (`where`
 *   on `wave: "{item}"`), then `re-sweep` (one selection over the unscheduled bugs, decision-logs and ADRs),
 *   `re-plan` (the re-plan checkpoint) and `wave-checks` (the e2e smoke and the mechanical user-doc checks,
 *   per wave, dl-133 §2). Everything is per `release` element (`dl-159` handover).
 * - AC 2: `release-planning.yaml` — `reconcile-governance` selects `ready` decision-logs too and checks their
 *   coverage only (D2); `commit-backlog` fixes `backlog_committed`; `build-backlog` checks every criterion
 *   against the bound directives and ratified specs (`dl-102` §2); `define-scope` states the 20 % reservation;
 *   `advance-pinned-build` carries task-239's handover; the growth check is on `dev-loop` `start`, reading
 *   `memory.yaml` `release.growth_threshold`, in force from v0.4 (D4).
 * - AC 3: the `release` template gains `## Scope changes`, `backlog_committed` and `waves`; the `task`
 *   template gains `wave`; `memory.yaml` `release` declares them `[AUTHORING]` and is `amendable: true` (D3),
 *   as the `init` scaffold is.
 * - AC 4: every edited file raises its `version` (compared as numbers).
 *
 * The configuration is read from the working tree (`loadWorkflowRegistry`, `loadMemoryYaml`); the zero-error
 * test at `HEAD` is `workflow-repository-conformance.test.ts`. No check named here is evaluated before P4.12
 * (v1.0, `dl-090` Q2 (c)).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowRegistry } from '../../src/core';
import { loadMemoryYaml } from '../../src/core/loaders';
import { TEMPLATES, templateScaffold } from '../../src/storage/templates';
import type { Phase, Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const workflows = (): readonly Workflow[] => loadWorkflowRegistry(ROOT).workflows;
function workflow(name: string): Workflow {
  const found = workflows().find((w) => w.name === name);
  if (found === undefined) throw new Error(`no workflow '${name}' in the registry`);
  return found;
}
function phase(workflowName: string, name: string): Phase {
  const found = workflow(workflowName).phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`${workflowName} has no phase '${name}'`);
  return found;
}
const version = (path: string): number => Number(/^version:\s*([0-9.]+)/m.exec(read(path))![1]);

describe('task-230 AC 1 — the wave and its boundary phases', () => {
  it('release-cycle.implementation includes `wave` once per entry of the release element `waves:`', () => {
    const implementation = phase('release-cycle', 'implementation');
    expect(implementation.include).toBe('wave');
    expect(implementation.iterate_over).toBe('element:waves');
    expect(implementation.where).toBeUndefined();
  });

  it('wave.yaml runs on the release: tasks, wave-checks, re-sweep, re-plan (a wave-check failure is a bug the same wave re-sweeps)', () => {
    const wave = workflow('wave');
    expect(wave.element).toBe('release');
    expect(wave.phases.map((p) => p.name)).toEqual(['tasks', 'wave-checks', 're-sweep', 're-plan']);
    expect(read('.wingfoil/workflows.yaml')).toMatch(/^ {2}- workflows\/custom\/wave\.yaml/m);
  });

  it("tasks: the wave's backlog tasks of this release, one dev-loop each", () => {
    const tasks = phase('wave', 'tasks');
    expect(tasks.include).toBe('dev-loop');
    expect(tasks.iterate_over).toBe('task');
    expect(tasks.where).toEqual({ status: ['backlog'], release: '{release.version}', wave: '{item}' });
  });

  it('re-sweep: one selection over the unscheduled bugs, decision-logs and ADRs; the approver rules; never stamped alone', () => {
    const sweep = phase('wave', 're-sweep');
    expect(sweep.where).toEqual({ type: ['bug', 'decision-log', 'adr'], status: ['open', 'triaged', 'in-discussion', 'ready', 'pending'], release: [''] });
    expect(sweep.actions).toEqual(['memory.approve', 'element.set_release("{release.version}")', 'memory.reject', 'memory.deprecate']);
    expect(sweep.approval).toEqual({ by_role: 'approver' });
    expect(sweep.description).toMatch(/named later release/);
  });

  it('re-plan: a checkpoint the approver closes — Scope changes, the growth count, the planning plan, the waves', () => {
    const replan = phase('wave', 're-plan');
    expect(replan.actions ?? []).toEqual([]);
    expect(replan.produces ?? []).toEqual([]);
    expect(replan.approval).toEqual({ by_role: 'approver' });
    for (const needle of ['## Scope changes', 'backlog_committed', 'growth_threshold', 'waves:']) expect(replan.description).toContain(needle);
  });

  it('wave-checks: the e2e smoke and the mechanical user-doc checks, with a report per wave; a failure opens a bug', () => {
    const checks = phase('wave', 'wave-checks');
    const report = 'docs/07_gates/rl-{release.release-line}/rel-{release.version}-{item}-e2e-smoke.md';
    expect(checks.produces).toEqual([report]);
    expect(checks.checks?.post).toEqual([`e2e-smoke-passed(report: ${report})`, 'docs.examples.passing', 'docs.parity']);
    expect(checks.approval).toBeUndefined();
    expect(checks.description).toMatch(/bug-ingest/);
  });
});

describe('task-230 AC 2 — release-planning and the growth check', () => {
  it('reconcile-governance selects ready decision-logs and only checks their coverage (D2)', () => {
    const reconcile = phase('release-planning', 'reconcile-governance');
    expect(reconcile.where).toEqual({ type: ['decision-log', 'adr'], status: ['in-discussion', 'pending', 'ready'], release: ['', '{release.version}'] });
    expect(reconcile.actions).toEqual(['memory.approve']);
    expect(reconcile.checks?.post).toEqual([
      'ready-decision-logs.covered(each ready decision-log with release {release.version} is named by the ref: of a task of the release; an uncovered one is flagged, never moved or assigned here)',
    ]);
  });

  it('commit-backlog fixes backlog_committed; build-backlog checks every criterion; define-scope states the 20 % reservation', () => {
    expect(phase('release-planning', 'commit-backlog').checks?.pre).toEqual([
      'frontmatter.required: [backlog_committed]',
      "waves.declared(the release's waves: is a non-empty list of wave keys)",
    ]);
    expect(phase('release-planning', 'build-backlog').checks?.post).toContain("task.wave.declared(each task's wave is one of the release's waves)");
    expect(phase('release-planning', 'build-backlog').checks?.post).toContain(
      'acceptance-criteria.consistent(each criterion read against the directives bound to the executing role and the ratified specs and decision-logs it touches, before pending -> backlog)',
    );
    expect(phase('release-planning', 'define-scope').description).toMatch(/20 %/);
  });

  it("advance-pinned-build carries task-239's handover about check:mcp's KNOWN_READ_FAILURES", () => {
    expect(read('.wingfoil/workflows/custom/release-planning.yaml')).toContain(
      'a KNOWN_READ_FAILURES entry for the old pin fails check:mcp: delete it when the new pin reads the Resource',
    );
  });

  it('dev-loop start refuses the next task start past the growth threshold, read from memory.yaml', () => {
    expect(phase('dev-loop', 'start').checks?.pre).toEqual([
      'stop-the-line.clear(rule: memory.yaml task.stop_the_line; a fix task is never blocked)',
      'growth.clear(rule: memory.yaml release.growth_threshold)',
    ]);
  });

  it('memory.yaml states the threshold once: +25 % over backlog_committed, strictly more, in force from v0.4', () => {
    const release = loadMemoryYaml(ROOT).types['release'] as unknown as Record<string, unknown>;
    expect(release['growth_threshold']).toMatchObject({ field: 'backlog_committed', max_growth: 25, at: 'dev-loop start', in_force_from: 'v0.4' });
  });
});

describe('task-230 AC 3 — templates and the release type', () => {
  it('the release template gains backlog_committed, waves and ## Scope changes', () => {
    const template = read('.wingfoil/memory/templates/release.md');
    expect(template).toMatch(/^backlog_committed:/m);
    expect(template).toMatch(/^waves: \[\]/m);
    expect(template).toMatch(/^## Scope changes$/m);
  });

  it('the task template gains wave', () => {
    expect(read('.wingfoil/memory/templates/task.md')).toMatch(/^wave: ""/m);
  });

  it('memory.yaml: release declares its optional fields and is amendable (D3); release-line is not', () => {
    const types = loadMemoryYaml(ROOT).types as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(types['release']!['fields'] as object)).toEqual(['backlog_committed', 'waves']);
    expect(Object.keys(types['task']!['fields'] as object)).toEqual(['wave']);
    expect(types['release']!['amendable']).toBe(true);
    expect(types['release-line']!['amendable']).toBe(false);
  });

  it('the init scaffold declares release amendable too (kept in sync since task-127)', () => {
    const scaffold = templateScaffold(TEMPLATES[0]!).find((file) => file.path === '.wingfoil/memory.yaml')!.content;
    expect(/\n {2}release:\n[\s\S]*?\n {4}amendable: (\w+)/.exec(scaffold)![1]).toBe('true');
    expect(/\n {2}release-line:\n[\s\S]*?\n {4}amendable: (\w+)/.exec(scaffold)![1]).toBe('false');
  });
});

describe('task-230 AC 4 — every edited file raises its version (numbers)', () => {
  it.each([
    ['.wingfoil/memory.yaml', 3.2],
    ['.wingfoil/workflows.yaml', 1.6],
    ['.wingfoil/workflows/custom/release-cycle.yaml', 1.5],
    ['.wingfoil/workflows/custom/release-planning.yaml', 1.9],
    ['.wingfoil/workflows/custom/dev-loop.yaml', 1.9],
    ['.wingfoil/workflows/custom/wave.yaml', 1.0],
  ])('%s is at least %s', (path, min) => {
    expect(version(path)).toBeGreaterThanOrEqual(min);
  });
});

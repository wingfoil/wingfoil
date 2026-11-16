/**
 * task-212-add-change-proposal-memory-type-startable-vision-change (`dl-132` Action 3, `dl-109`) — the
 * startable `vision-change` workflow: capture → impact analysis (approval gate) → update the vision →
 * scoped downcast (the existing `user-story-mapping`, `specification-by-examples`, `volere-requirements`,
 * each optional: only the layers the analysis names run, Q2 (ii)) → schedule.
 *
 * Reads the workflow registry **as committed at `HEAD`** (`loadWorkflowRegistryAtHead`, the loader plus the
 * core checks) and `workflow show` at `HEAD` (`workflowShowAtHead`), as the CLI does.
 *
 * - **AC 2 (red-first).** `vision-change` loads with zero errors, is startable, its capture phase is
 *   self-creating (`memory.add(type: change-proposal)`, no declared `element`), and `workflow show
 *   vision-change` nests the three included subs under their phases.
 * - **AC 4 (characterization).** The three downcast subs, already included by `specification-downcast`,
 *   accept a second includer: they are `kind: sub`, declare no `element`, and the loader reports no
 *   diagnostic on either includer other than the unbound check tokens.
 *
 * task-359-bind-vision-change-s-scoped-downcast-and-mandatory-release-exit-checks-before-cp-001-runs-dl-166
 * (`dl-166` Q1 (b), Q2 (ii), Actions 2–3; approver rulings D1–D4, D2 (A)) — the two checks bound before `cp-001`
 * runs its downcast:
 *
 * - **AC 1 + 2 (red-first).** Each downcast phase carries the post-check `downcast.in-scope(layer: …)` with its
 *   layer, bound `manual: true` until a command decides it (D2 (A)); `schedule`'s post-checks are
 *   `vision-index.current` then `change-proposal.assigned`, the latter bound `run` to
 *   `scripts/check-release-exit.cjs` on `{element.path}` (D3, its own suite `test/cli/check-release-exit.test.ts`);
 *   `vision-change.yaml` reaches 1.3 and `bindings.yaml` 3.2, each with a history segment naming task-359 (D4,
 *   "at least" plus the history clause, bug-314). The `schedule` pin of task-212 above is updated to the two-entry
 *   list in the same change.
 *
 * Deterministic: the registry is read in manifest order; fixed expectations.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { resolveToken, tokenName } from '../../src/workflow/bindings';

const ROOT = join(__dirname, '..', '..');
const SUBS = ['user-story-mapping', 'specification-by-examples', 'volere-requirements'];

describe('AC 2 — the startable, self-creating `vision-change` workflow', () => {
  const loaded = loadWorkflowRegistryAtHead(ROOT);
  const visionChange = loaded.workflows.find((workflow) => workflow.name === 'vision-change');

  it('is included by workflows.yaml, loads with zero errors and is startable', () => {
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(visionChange).toBeDefined();
    expect(visionChange?.kind).toBe('main');
  });

  it('declares the phases of dl-132 in order, the downcast phases optional', () => {
    expect(visionChange?.phases.map((phase) => [phase.name, phase.include ?? null, phase.optional === true])).toEqual([
      ['capture', null, false],
      ['impact-analysis', null, false],
      ['update-vision', null, false],
      ['downcast-stories', 'user-story-mapping', true],
      ['downcast-scenarios', 'specification-by-examples', true],
      ['downcast-requirements', 'volere-requirements', true],
      ['schedule', null, false],
    ]);
  });

  it('capture is self-creating: no declared element, its first action adds a change-proposal', () => {
    expect(visionChange?.element).toBeUndefined();
    const capture = visionChange?.phases[0];
    expect(capture?.actions).toEqual(['memory.add(type: change-proposal)', 'memory.submit']);
    expect(capture?.checks?.post).toEqual(['frontmatter.required: [title, kind]']);
  });

  it('impact-analysis is the approval gate (reject back to capture); schedule moves the element to `scheduled`', () => {
    const byName = new Map(visionChange?.phases.map((phase) => [phase.name, phase]));
    expect(byName.get('impact-analysis')).toMatchObject({
      role: 'architect',
      approval: { by_role: 'approver' },
      fallback: { step: 'capture' },
    });
    expect(byName.get('impact-analysis')?.actions?.map(tokenName)).toEqual(['agent.execute', 'memory.approve']);
    expect(byName.get('schedule')?.actions).toEqual(['element.set_release("{change-proposal.target_release}")', 'element.set_state(scheduled)']);
    expect(byName.get('update-vision')?.checks?.post).toEqual(['vision-index.current']);
    expect(byName.get('schedule')?.checks?.post).toEqual(['vision-index.current', 'change-proposal.assigned']); // task-359 (dl-166 Q2 (ii))
  });

  it('`vision-index.current` is bound to the vision index test (bug-270)', () => {
    expect(loaded.bindings?.checks?.['vision-index.current']?.run).toEqual(['npm', 'test', '--', 'test/docs/vision-index.test.ts']);
  });

  it('`workflow show vision-change` nests the three included subs under their phases', () => {
    const shown = workflowShowAtHead(ROOT, 'vision-change');
    expect(shown.ok ? null : shown.error.message).toBeNull();
    if (!shown.ok) return;
    const { workflow } = shown.value;
    expect(workflow).toMatchObject({ name: 'vision-change', startable: true, includable: false, element: null });
    const nested = workflow.phases.filter((phase) => phase.sub !== null).map((phase) => [phase.name, phase.sub?.name, phase.sub?.phases.length]);
    expect(nested).toEqual([
      ['downcast-stories', 'user-story-mapping', 3],
      ['downcast-scenarios', 'specification-by-examples', 2],
      ['downcast-requirements', 'volere-requirements', 3],
    ]);
  });
});

describe('AC 4 — the downcast subs accept a second includer (characterization)', () => {
  const loaded = loadWorkflowRegistryAtHead(ROOT);

  it.each(SUBS)('%s is kind: sub, declares no element, and is included by specification-downcast and vision-change', (name) => {
    const sub = loaded.workflows.find((workflow) => workflow.name === name);
    expect(sub).toMatchObject({ kind: 'sub' });
    expect(sub?.element).toBeUndefined();
    const includers = loaded.workflows.filter((workflow) => workflow.phases.some((phase) => phase.include === name)).map((workflow) => workflow.name);
    expect(includers).toEqual(['vision-change', 'specification-downcast']); // manifest order: the startable mains come first
  });

  it('the loader reports nothing on vision-change (its two prose checks bound manual by task-358, bug-469)', () => {
    const own = loaded.diagnostics
      .filter((d) => d.file === 'workflows/custom/vision-change.yaml')
      .map((d) => [d.code, d.path]);
    // schedule's pre-check is the review fix of 2026-10-10: set_release("") would stamp nothing; it and capture's
    // frontmatter.required were the two unbound rows until task-358 bound them manual: true until a command.
    expect(own).toEqual([]);
  });
});

/** A file's `version:` line as `HEAD` holds it (the registry assertions above read `HEAD` too). */
function versionLineAtHead(path: string): string {
  const content = execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  const line = /^version:.*$/m.exec(content);
  if (line === null) throw new Error(`${path} has no version: line at HEAD`);
  return line[0];
}

/** The highest version number among the `;`-separated history segments of a version comment that name `task`. */
function historyEntry(line: string, task: string): number {
  const entries = line
    .replace(/^version:[^#]*#/, '')
    .split(';')
    .map((segment) => /^\s*(\d+\.\d+)\b/.exec(segment))
    .filter((match): match is RegExpExecArray => match !== null && match.input.includes(task))
    .map((match) => Number(match[1]));
  return entries.length > 0 ? Math.max(...entries) : Number.NaN;
}

const DOWNCAST_LAYERS: readonly (readonly [string, string])[] = [
  ['downcast-stories', 'stories'],
  ['downcast-scenarios', 'scenarios'],
  ['downcast-requirements', 'requirements'],
];

const RELEASE_EXIT_BINDING = {
  kind: 'run',
  source: 'project',
  argv: ['node', 'scripts/check-release-exit.cjs', '{element.path}'],
  severity: 'reject',
} as const;

describe('task-359 AC 1 + 2 — the scoped-downcast and mandatory-release-exit checks, bound (red-first, dl-166 Q1 (b), Q2 (ii))', () => {
  const loaded = loadWorkflowRegistryAtHead(ROOT);
  const visionChange = loaded.workflows.find((workflow) => workflow.name === 'vision-change');
  const byName = new Map(visionChange?.phases.map((phase) => [phase.name, phase]));

  it.each(DOWNCAST_LAYERS.map(([name, layer]) => [name, layer]))('(a) %s checks.post is exactly downcast.in-scope(layer: %s)', (name, layer) => {
    expect(byName.get(name)?.checks?.post).toEqual([`downcast.in-scope(layer: ${layer})`]);
    expect(byName.get(name)?.checks?.pre).toBeUndefined();
  });

  it('(b) schedule keeps its pre-check; its post-checks are vision-index.current, then change-proposal.assigned', () => {
    expect(byName.get('schedule')?.checks?.pre).toEqual(['change-proposal.target_release is not empty']);
    expect(byName.get('schedule')?.checks?.post).toEqual(['vision-index.current', 'change-proposal.assigned']);
  });

  it('(c) change-proposal.assigned is bound run to scripts/check-release-exit.cjs on {element.path}, at severity reject (D3)', () => {
    expect(resolveToken('change-proposal.assigned', 'check', loaded.bindings)).toEqual(RELEASE_EXIT_BINDING);
  });

  it.each(DOWNCAST_LAYERS.map(([, layer]) => [layer]))('(d) downcast.in-scope(layer: %s) resolves { kind: manual, source: project } (D2 (A))', (layer) => {
    expect(tokenName(`downcast.in-scope(layer: ${layer})`)).toBe('downcast.in-scope');
    expect(resolveToken(`downcast.in-scope(layer: ${layer})`, 'check', loaded.bindings)).toEqual({ kind: 'manual', source: 'project' });
  });

  it('(e) `workflow show vision-change` lists those bindings on those phases, none evaluated', () => {
    const shown = workflowShowAtHead(ROOT, 'vision-change');
    expect(shown.ok ? null : shown.error.message).toBeNull();
    if (!shown.ok) return;
    const phases = new Map(shown.value.workflow.phases.map((phase) => [phase.name, phase]));
    for (const [name, layer] of DOWNCAST_LAYERS) {
      expect([name, phases.get(name)?.checks.post.map((entry) => [entry.token, entry.binding, entry.evaluated])]).toEqual([
        name,
        [[`downcast.in-scope(layer: ${layer})`, { kind: 'manual', source: 'project' }, false]],
      ]);
    }
    const indexBinding = resolveToken('vision-index.current', 'check', loaded.bindings);
    expect(indexBinding.kind).toBe('run');
    expect(phases.get('schedule')?.checks.post.map((entry) => [entry.token, entry.binding, entry.evaluated])).toEqual([
      ['vision-index.current', indexBinding, false],
      ['change-proposal.assigned', RELEASE_EXIT_BINDING, false],
    ]);
  });

  it('(f) vision-change.yaml is at least 1.3 and bindings.yaml at least 3.2, each with a history segment naming task-359 (D4, bug-314)', () => {
    const workflowLine = versionLineAtHead('.wingfoil/workflows/custom/vision-change.yaml');
    const bindingsLine = versionLineAtHead('.wingfoil/workflows/bindings.yaml');
    expect(visionChange?.version).toBeGreaterThanOrEqual(1.3);
    expect(Number(/^version:\s*"?([0-9.]+)/.exec(bindingsLine)![1])).toBeGreaterThanOrEqual(3.2);
    expect(historyEntry(workflowLine, 'task-359')).toBeGreaterThanOrEqual(1.3);
    expect(historyEntry(bindingsLine, 'task-359')).toBeGreaterThanOrEqual(3.2);
  });

  it('(g) the loader still reports nothing on vision-change', () => {
    expect(loaded.diagnostics.filter((d) => d.file === 'workflows/custom/vision-change.yaml')).toEqual([]);
  });
});

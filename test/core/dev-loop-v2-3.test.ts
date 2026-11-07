/**
 * task-349 AC 4 (`dl-170` Q2 (C), approver ruling D4 (a), 2026-11-07) — `dev-loop.yaml` 2.3: the phases that run
 * heavy gates (`green`, `refactor`, `review`) declare `checks.pre` `gate.slot-free`, unbound and not evaluated, so
 * `workflow show dev-loop` and the reviewer see the machine-wide lock of `scripts/heavy-gate.cjs`; one version bump.
 *
 * Read **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, `workflowShowAtHead`), like
 * `test/core/dev-loop-v2-0.test.ts`. Version pins are "≥" plus the comment naming the task (bug-314).
 *
 * - red-first: the token on the three phases, review's after `docs.parity`, on no other phase; `workflow show`
 *   reports it unbound and not evaluated; the version and its comment;
 * - characterization: the phase names and their order, and no error at `HEAD`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { tokenName } from '../../src/workflow/bindings';
import type { Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';
const TOKEN = 'gate.slot-free';
const HEAVY_PHASES = ['green', 'refactor', 'review'];

function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

function devLoop(): Workflow {
  const workflow = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'dev-loop');
  if (workflow === undefined) throw new Error('no dev-loop workflow at HEAD');
  return workflow;
}

function phase(name: string): Workflow['phases'][number] {
  const found = devLoop().phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`no dev-loop phase ${name}`);
  return found;
}

const preNames = (name: string): string[] => (phase(name).checks?.pre ?? []).map(tokenName);

describe('task-349 AC 4 — dev-loop.yaml names the heavy-gate slot on the phases that run heavy gates (dl-170 Q2 (C))', () => {
  it('red-first: green and refactor declare checks.pre gate.slot-free; review declares it after docs.parity', () => {
    expect(preNames('green')).toEqual([TOKEN]);
    expect(preNames('refactor')).toEqual([TOKEN]);
    expect(preNames('review')).toEqual(['tests.bdd.passing', 'claims.rerun', 'rereview.previous-reject', 'docs.parity', TOKEN]);
  });

  it.each(HEAVY_PHASES)('red-first: %s\'s gate.slot-free prose names scripts/heavy-gate.cjs and dl-170', (name) => {
    const token = (phase(name).checks?.pre ?? []).find((check) => tokenName(check) === TOKEN);
    expect(token).toBeDefined();
    expect(token).toContain('scripts/heavy-gate.cjs');
    expect(token).toContain('dl-170');
  });

  it('red-first: no other dev-loop phase declares gate.slot-free, pre or post', () => {
    const declaring = devLoop()
      .phases.filter((p) => [...(p.checks?.pre ?? []), ...(p.checks?.post ?? [])].some((check) => tokenName(check) === TOKEN))
      .map((p) => p.name);
    expect(declaring).toEqual(HEAVY_PHASES);
  });

  it('red-first: workflow show dev-loop at HEAD lists gate.slot-free on the three phases, unbound and evaluated: false', () => {
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    const views = shown.value.workflow.phases
      .flatMap((p) => p.checks.pre.filter((check) => tokenName(check.token) === TOKEN).map((check) => [p.name, check.binding.kind, check.evaluated]));
    expect(views).toEqual([
      ['green', 'unbound', false],
      ['refactor', 'unbound', false],
      ['review', 'unbound', false],
    ]);
  });

  it('red-first: `version:` is 2.3 or later and its comment names task-349, keeping `prev 2.2`', () => {
    const line = /^version: (\S+)(.*)$/m.exec(atHead(DEV_LOOP_FILE));
    expect(line).not.toBeNull();
    expect(Number(line![1])).toBeGreaterThanOrEqual(2.3);
    expect(line![2]).toContain('task-349');
    expect(line![2]).toContain('prev 2.2');
  });

  it('characterization: the phase names and their order are unchanged, and workflow show reports no error', () => {
    expect(devLoop().phases.map((p) => p.name)).toEqual(['start', 'design', 'red', 'green', 'refactor', 'review', 'done']);
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    expect(shown.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

/**
 * task-294 AC 1 (red-first) — the BDD bindings of `wingfoil workflow adopt`
 * (`docs/02_requirements/02_bdd/features/p4-workflow/P4.21-element-provenance.feature`; `spec-017` §7.11, §8,
 * §10; `dl-187` rules 1–7; design D1–D10 as ruled at the design gate, 2026-10-24).
 *
 * The first `describe` pins the feature text of the adopt scenarios, already written (characterization: passes
 * at red). The second binds each scenario in-process through the registered `CORE_MODULES` operation
 * `workflowAdopt` (with `workflowStart` / `workflowNext`), on the fixture of `./helpers/adopt-fixture.ts`: the
 * Background's `sw-life-cycle` / `seed-first-release-line` are `life` / `seed`, with the same declared rule
 * (`version: "v1"`) and the same pre-engine `rl-v1`. A Given that an adoption was recorded is written by hand,
 * in the exact shape `workflow adopt` writes, so each When is the only call to the operation under test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import {
  adopt,
  adoptionByHand,
  as,
  blobOf,
  BULK_REFUSAL,
  buildLifeRepo,
  call,
  changedPaths,
  commitCount,
  element,
  finalParagraph,
  head,
  INSTANCE,
  messageOf,
  MORGAN,
  MORGAN_APPROVER_LINE,
  ok,
  RL_V1,
  RL_V1_PATH,
  start,
  subjectOf,
  SUBJECT_RL_V1,
  type AdoptPlanView,
  type AdoptResultView,
  type NextView,
} from './helpers/adopt-fixture';

const FEATURE = readFileSync(join(__dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p4-workflow', 'P4.21-element-provenance.feature'), 'utf-8');

describe('task-294 — the P4.21 feature carries the adopt scenarios (characterization)', () => {
  it('lists the adopt scenarios, the five errors and the gate edge case', () => {
    const titles = FEATURE.split('\n')
      .filter((line) => line.startsWith('  Scenario: '))
      .map((line) => line.slice('  Scenario: '.length));
    expect(titles).toEqual(
      expect.arrayContaining([
        'Adopt one existing element into the step that creates its type',
        'Propose the adoptions of an instance without writing',
        'Apply the proposed adoptions, one commit per step',
        'Re-running an adoption already recorded is a no-op',
        'Records naming a step that no longer exists are reported as orphans',
        'Error - an element already owned by a step',
        'Error - an element of another type than the step adds',
        'Error - several candidates and no element named',
        'Error - an element that does not exist',
        'Error - the bulk operations need the approver',
        'Edge - an adoption cannot pass a gate',
      ]),
    );
  });

  it('carries the exact refusal messages of spec-017 §10', () => {
    for (const message of [
      '"release-line:rl-v1 is already owned by sw-life-cycle-1-plan sw-life-cycle.seed-first-release-line; move it with workflow transfer"',
      '"sw-life-cycle.seed-first-release-line adds a release-line, not a task"',
      '"2 candidates for sw-life-cycle.seed-first-release-line (release-line:rl-v1, release-line:rl-v2); name one with --element"',
      '"element not found: release-line:rl-v9"',
      '"user not authorized to apply adoptions in bulk"',
    ]) {
      expect(FEATURE).toContain(message);
    }
  });
});

/** The refusal of `result`, asserting it is one: exit 1, `code`, `message`. */
function expectRefusal(result: CoreResult<unknown>, code: string, message: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect({ code: result.error.code, message: result.error.message }).toEqual({ code, message });
  expect(exitCodeForResult(result)).toBe(1);
}

describe('task-294 AC 1 — the P4.21 adopt scenarios bound in-process (red-first)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  const repo = (options?: Parameters<typeof buildLifeRepo>[0]): string => {
    const root = buildLifeRepo(options);
    roots.push(root);
    return root;
  };

  it('Adopt one existing element into the step that creates its type', async () => {
    const root = repo();
    await start(root);
    const baseline = head(root);
    const blob = blobOf(root, RL_V1_PATH);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', reason: 'created by hand before the engine' } });

    // Then one empty commit is written with the subject "workflow: adopt <instance> <step> release-line:rl-v1"
    const value = ok<AdoptResultView>(result);
    expect(git(root, ['rev-parse', 'HEAD~1']).trim()).toBe(baseline);
    expect(changedPaths(root)).toBe('');
    expect(subjectOf(root)).toBe(SUBJECT_RL_V1);
    // And the commit carries the trailers "WingFoil-Instance", "WingFoil-Step" and "WingFoil-Adopted" and a "Reason:" block
    const trailers = finalParagraph(root);
    expect(trailers.slice(0, 3)).toEqual([`WingFoil-Instance: ${INSTANCE}`, 'WingFoil-Step: life.seed', 'WingFoil-Adopted: release-line:rl-v1']);
    expect(trailers).toHaveLength(4);
    expect(trailers[3]).toMatch(/^WingFoil-Version: /);
    expect(messageOf(root)).toBe(`${SUBJECT_RL_V1}\n\nReason: created by hand before the engine\n\n${trailers.join('\n')}`);
    // And the file of "rl-v1" is unchanged
    expect(blobOf(root, RL_V1_PATH)).toBe(blob);
    // And "wingfoil workflow next" no longer reports the step
    const next = ok<NextView>(await call('workflowNext', root, { positional: INSTANCE }));
    expect(next.next?.key).not.toBe('life.seed');
    expect(next.next?.key).toBe('life.close@release-line:rl-v1');
    // And the command exits with code 0
    expect(exitCodeForResult(result)).toBe(0);
    expect(value.adopted).toEqual([{ step: 'life.seed', element: RL_V1, commit: head(root) }]);
  });

  it('Propose the adoptions of an instance without writing', async () => {
    const root = repo();
    await start(root);
    const before = snapshotPersistence(root);

    const result = await adopt(root, { positional: INSTANCE, flags: { plan: true } });

    const value = ok<AdoptPlanView>(result);
    expect(value.steps).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: false }]);
    expect(value.orphans).toEqual([]);
    expect(value.applied).toEqual([]);
    assertPersistenceUnchanged(root, before, 'adopt --plan');
    expect(exitCodeForResult(result)).toBe(0);
  });

  it('Apply the proposed adoptions, one commit per step', async () => {
    const root = repo({ phases: ['seed', 'adr', 'close'], documents: { 'docs/adrs/adr-1.md': element('adr', 'adr-1', 'accepted') } });
    await start(root);
    // Given "--plan" lists 2 steps with a single candidate each
    const proposed = ok<AdoptPlanView>(await adopt(root, { positional: INSTANCE, flags: { plan: true } }));
    expect(proposed.steps.map((entry) => [entry.step, entry.candidates.length, entry.recorded])).toEqual([
      ['life.seed', 1, false],
      ['life.adr@release-line:rl-v1', 1, false],
    ]);
    const baseline = head(root);

    // When "--plan --apply --reason …" runs as the approver
    const result = await as(MORGAN, () => adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'adoption of the pre-engine state' } }));

    // Then 2 "workflow: adopt" commits are written, one per step, in walk order
    const value = ok<AdoptPlanView>(result);
    expect(git(root, ['rev-parse', 'HEAD~2']).trim()).toBe(baseline);
    expect([subjectOf(root, 'HEAD~1'), subjectOf(root, 'HEAD')]).toEqual([SUBJECT_RL_V1, `workflow: adopt ${INSTANCE} life.adr@release-line:rl-v1 adr:adr-1`]);
    for (const rev of ['HEAD~1', 'HEAD']) {
      expect(changedPaths(root, rev)).toBe('');
      expect(messageOf(root, rev)).toContain(`\n\n${MORGAN_APPROVER_LINE}\nReason: adoption of the pre-engine state\n\n`);
      expect(git(root, ['log', '-1', '--format=%an <%ae>', rev]).trim()).toBe('Morgan <morgan@example.invalid>');
    }
    expect(value.applied).toEqual([
      { step: 'life.seed', element: RL_V1, commit: git(root, ['rev-parse', 'HEAD~1']).trim() },
      { step: 'life.adr@release-line:rl-v1', element: { type: 'adr', id: 'adr-1', status: 'accepted' }, commit: head(root) },
    ]);
    // And the command exits with code 0
    expect(exitCodeForResult(result)).toBe(0);
  });

  it('Re-running an adoption already recorded is a no-op', async () => {
    const root = repo();
    await start(root);
    // Given "release-line:rl-v1" was adopted into the step
    adoptionByHand(root, INSTANCE, 'life.seed', 'release-line:rl-v1');
    const count = commitCount(root);

    const result = await as(MORGAN, () => adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'again' } }));

    // Then no commit is written for the step; the recorded adoption is listed first (design D3)
    const value = ok<AdoptPlanView>(result);
    expect(commitCount(root)).toBe(count);
    expect(value.steps).toEqual([{ step: 'life.seed', type: 'release-line', candidates: [RL_V1], recorded: true }]);
    expect(value.applied).toEqual([]);
    expect(exitCodeForResult(result)).toBe(0);
  });

  it('Records naming a step that no longer exists are reported as orphans', async () => {
    const root = repo();
    await start(root);
    // Given "release-line:rl-v1" was adopted into "life.seed"
    const adoption = adoptionByHand(root, INSTANCE, 'life.seed', 'release-line:rl-v1');
    // And the phase "seed" was renamed "seed-line", and no rekey was recorded
    const file = join(root, '.wingfoil', 'workflows', 'custom', 'life.yaml');
    writeFileSync(file, readFileSync(file, 'utf-8').replace('  - name: seed\n', '  - name: seed-line\n'));
    git(root, ['commit', '--quiet', '-am', 'rename the phase seed to seed-line']);

    const value = ok<AdoptPlanView>(await adopt(root, { positional: INSTANCE, flags: { plan: true } }));

    // Then the adoption is listed as an orphan of the unknown key, and the renamed step with the single candidate
    expect(value.orphans).toEqual([{ commit: adoption, key: 'life.seed', element: RL_V1 }]);
    expect(value.steps).toEqual([{ step: 'life.seed-line', type: 'release-line', candidates: [RL_V1], recorded: false }]);
  });

  it('Error - an element already owned by a step', async () => {
    const root = repo();
    await start(root);
    adoptionByHand(root, INSTANCE, 'life.seed', 'release-line:rl-v1');
    const other = await start(root, 'life', 'phase=2');
    expect(other).toBe('life-2-plan');
    const before = snapshotPersistence(root);

    const result = await adopt(root, { positional: other, options: { step: 'life.seed', element: 'release-line:rl-v1', reason: 'x' } });

    expectRefusal(result, 'CONFLICT', `release-line:rl-v1 is already owned by ${INSTANCE} life.seed; move it with workflow transfer`);
    assertPersistenceUnchanged(root, before, 'owned');
  });

  it('Error - an element of another type than the step adds', async () => {
    const root = repo();
    await start(root);
    const before = snapshotPersistence(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'task:task-042-login-form', reason: 'x' } });

    // The type is checked before the element's existence (design D10): no such task is committed.
    expectRefusal(result, 'VALIDATION', 'life.seed adds a release-line, not a task');
    assertPersistenceUnchanged(root, before, 'another type');
  });

  it('Error - several candidates and no element named', async () => {
    const root = repo({ documents: { 'docs/planning/rl-v2.md': element('release-line', 'rl-v2', 'planning', { version: 'v1' }) } });
    await start(root);
    const before = snapshotPersistence(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', reason: 'x' } });

    expectRefusal(result, 'CONFLICT', '2 candidates for life.seed (release-line:rl-v1, release-line:rl-v2); name one with --element');
    if (!result.ok) {
      const candidates = (result.error.details as { candidates?: readonly (string | { type: string; id: string })[] } | undefined)?.candidates ?? [];
      expect(candidates.map((entry) => (typeof entry === 'string' ? entry : `${entry.type}:${entry.id}`))).toEqual(['release-line:rl-v1', 'release-line:rl-v2']);
    }
    assertPersistenceUnchanged(root, before, 'several candidates');
  });

  it('Error - an element that does not exist', async () => {
    const root = repo();
    await start(root);
    const before = snapshotPersistence(root);

    const result = await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v9', reason: 'x' } });

    expectRefusal(result, 'NOT_FOUND', 'element not found: release-line:rl-v9');
    assertPersistenceUnchanged(root, before, 'not found');
  });

  it('Error - the bulk operations need the approver', async () => {
    const root = repo();
    await start(root);
    const before = snapshotPersistence(root);

    // The fixture's own identity, WingFoil Test, holds no approver role.
    const result = await adopt(root, { positional: INSTANCE, flags: { plan: true, apply: true }, options: { reason: 'x' } });

    expectRefusal(result, 'VALIDATION', BULK_REFUSAL);
    assertPersistenceUnchanged(root, before, 'bulk without authority');
  });

  it('Edge - an adoption cannot pass a gate', async () => {
    const root = repo({ phases: ['seed', 'approve', 'close'] });
    await start(root);

    // When "release-line:rl-v1" is adopted into "life.seed", while it is still "planning"
    ok(await adopt(root, { positional: INSTANCE, options: { step: 'life.seed', element: 'release-line:rl-v1', reason: 'created by hand before the engine' } }));

    // Then the gate step still awaits the approver's "memory approve rl-v1"
    const next = ok<NextView>(await call('workflowNext', root, { positional: INSTANCE }));
    expect(next.next?.key).toBe('life.approve@release-line:rl-v1');
    expect(next.next?.awaiting).toMatchObject({ kind: 'approval', elements: [RL_V1] });
  });
});

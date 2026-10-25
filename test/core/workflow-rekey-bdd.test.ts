/**
 * task-295 AC 1 (P4.21, `dl-187` C5; `spec-017` §4.8, §7.12) — the BDD binding of
 * `docs/02_requirements/02_bdd/features/p4-workflow/P4.21-element-provenance.feature`, scenario "Rekey the records
 * of a renamed step", in process through the registered `CORE_MODULES` operations, on the fixture of
 * `./helpers/rekey-fixture` (the scenario's `sw-life-cycle` / `seed-first-release-line` → `seed-release-line` are
 * `life` / `seed` → `seed-line` there; the adoption of the Background is written by hand, design D8).
 *
 * - The scenario text is already in the feature (characterization: it passes at red).
 * - The binding (red-first): one empty commit with the rekey subject, the `Approver:` / `Reason:` body and the
 *   `WingFoil-Instance` / `WingFoil-Rekey-From` / `WingFoil-Rekey-To` trailers before `WingFoil-Version:` ("the
 *   commit records the mapping"); exit 0; `workflow next` no longer reports the new key, and the orphan the rename
 *   left is gone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deduceWorkflowStateAtHead } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { asMorgan, buildRekeyRepo, call, ok } from './helpers/rekey-fixture';

const FEATURE = readFileSync(join(__dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p4-workflow', 'P4.21-element-provenance.feature'), 'utf-8');

interface NextView {
  readonly next: { readonly key: string } | null;
}

const orphans = (root: string): number => deduceWorkflowStateAtHead(root).diagnostics.filter((d) => d.code === 'W_PROVENANCE_ORPHAN').length;

describe('task-295 AC 1 — the P4.21 feature carries the rekey scenario (characterization)', () => {
  it('"Rekey the records of a renamed step", with its When and its Then lines', () => {
    expect(FEATURE).toContain('  Scenario: Rekey the records of a renamed step\n');
    expect(FEATURE).toContain(
      `    When I run "wingfoil workflow rekey sw-life-cycle-1-plan --from sw-life-cycle.seed-first-release-line --to sw-life-cycle.seed-release-line --reason 'phase renamed'" as the approver\n`,
    );
    expect(FEATURE).toContain(
      '    Then one empty commit is written with the subject "workflow: rekey sw-life-cycle-1-plan sw-life-cycle.seed-first-release-line sw-life-cycle.seed-release-line"\n',
    );
    expect(FEATURE).toContain('    And the commit records the mapping from the old key to the new one\n');
    expect(FEATURE).toContain('    And "wingfoil workflow next sw-life-cycle-1-plan" does not report "sw-life-cycle.seed-release-line"\n');
  });
});

describe('task-295 AC 1 — Rekey the records of a renamed step (bound in process)', () => {
  let root: string;
  beforeEach(async () => {
    root = await buildRekeyRepo();
  });
  afterEach(() => removeTempDir(root));

  it('one empty commit with the subject and the mapping; workflow next no longer reports the new key; exit 0', async () => {
    // Given "release-line:rl-v1" was adopted into "life.seed", And the phase "seed" was renamed "seed-line":
    // the new key is reported (it has no evidence of its own), and the adoption is an orphan.
    expect(ok<NextView>(await call('workflowNext', root, 'life-1-plan')).next?.key).toBe('life.seed-line');
    expect(orphans(root)).toBe(1);
    const before = Number(git(root, ['rev-list', '--count', 'HEAD']).trim());

    // When I run "wingfoil workflow rekey life-1-plan --from life.seed --to life.seed-line --reason 'phase renamed'" as the approver
    const result = await asMorgan(() => call('workflowRekey', root, 'life-1-plan', { from: 'life.seed', to: 'life.seed-line', reason: 'phase renamed' }));

    // And the command exits with code 0
    ok(result);
    expect(exitCodeForResult(result)).toBe(0);

    // Then one empty commit is written with the subject "workflow: rekey life-1-plan life.seed life.seed-line"
    expect(Number(git(root, ['rev-list', '--count', 'HEAD']).trim())).toBe(before + 1);
    expect(git(root, ['show', '--stat', '--format=', 'HEAD']).trim()).toBe('');
    expect(git(root, ['log', '-1', '--format=%an <%ae>']).trim()).toBe('Morgan <morgan@example.invalid>');

    // And the commit records the mapping from the old key to the new one
    const message = git(root, ['log', '-1', '--format=%B']).trim();
    const prefix =
      'workflow: rekey life-1-plan life.seed life.seed-line\n\n' +
      'Approver: Morgan <morgan@example.invalid> (approver)\nReason: phase renamed\n\n' +
      'WingFoil-Instance: life-1-plan\nWingFoil-Rekey-From: life.seed\nWingFoil-Rekey-To: life.seed-line\nWingFoil-Version: ';
    expect(message.startsWith(prefix)).toBe(true);
    expect(message.slice(prefix.length)).toMatch(/^[^\n]+$/);

    // And "wingfoil workflow next life-1-plan" does not report "life.seed-line" (the adopted release-line now
    // completes it, so the checkpoint `close` is next), and the orphan is gone.
    const after = ok<NextView>(await call('workflowNext', root, 'life-1-plan')).next?.key;
    expect(after).not.toBe('life.seed-line');
    expect(after).toMatch(/^life\.close(@|$)/);
    expect(orphans(root)).toBe(0);
  });
});

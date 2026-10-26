/**
 * task-300, independent review finding 1 (design gate D3 (a), same class): `retrospective.yaml`'s `capture` names
 * the comparison table of every release-health report `explore` read, the patches' included (`dl-167` (a)), as
 * `explore` and `additional-points` do (`retrospective-patch-health.test.ts`, the red file, pins those two).
 *
 * Reads the configuration as `HEAD` holds it (`loadWorkflowRegistryAtHead`), so a dirty working tree changes
 * nothing. Deterministic: no wall-clock, fixed phase lookup.
 */
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';

const ROOT = join(__dirname, '..', '..');

/** A phase's description with its folded whitespace collapsed, so a test reads it as one line. */
function text(name: string): string {
  const retrospective = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'retrospective')!;
  return (retrospective.phases.find((p) => p.name === name)!.description ?? '').replace(/\s+/g, ' ');
}

describe('task-300 review F1 — capture records every report explore read (dl-167 (a))', () => {
  it("the retro's ## Release health holds the comparison table of every release-health report explore read", () => {
    expect(text('capture')).toContain(
      'Its `## Release health` section holds the comparison table of every release-health report explore read and the disposition of every RH proposal (dl-089 §1, dl-167)',
    );
  });

  it('no description of the file names a single release-health comparison table any more', () => {
    for (const name of ['explore', 'collect-feedback', 'additional-points', 'capture', 'approve']) {
      expect(text(name)).not.toMatch(/release-health report's comparison table|release-health comparison table/);
    }
  });
});

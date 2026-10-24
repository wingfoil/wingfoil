/**
 * task-300 — `retrospective.yaml`'s `explore` reads the release-health reports of the patches released since the
 * previous retrospective (`dl-167` (a); `dl-092` Q2 (ii): a patch skips the retrospective, so its `release-health`
 * proposals are disposed of by the next minor's).
 *
 * Every assertion reads this repository's configuration **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, and
 * `git show HEAD:…` for the raw file and `.wingfoil/WORKFLOW.md`), so a dirty working tree changes nothing. The
 * helpers are those of `retrospective-collect-feedback.test.ts` (task-272).
 *
 * - AC 1a (red-first in fact, design gate D1): explore names, beside the release's own report, the report of every
 *   patch released since the previous retrospective, with the deducible cut of D2 (a), and carries each report's
 *   `RH-<version>-NN` proposals as proposals.
 * - AC 1b (red-first): the version is bumped once, 1.6 → 1.7, the header history kept and the entry appended.
 * - AC 1c (characterization, plan W1-4): no `actions:` / `checks:` token and no explore `produces` changes; the
 *   conformance itself is `workflow-repository-conformance.test.ts`'s and `workflow-evidence.test.ts`'s.
 * - AC 1d (red-first, design gate D3 (a)): `additional-points` presents every report explore read, and
 *   `.wingfoil/WORKFLOW.md`'s two sentences say the same.
 * - AC 2 (dated notes on dl-089 / dl-092) has no automated test: the notes stay uncommitted until the approver's
 *   `memory amend` and are checked at review.
 *
 * Deterministic: fixed phase order, no wall-clock, no fixture repository.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { tokenName } from '../../src/workflow/bindings';

const ROOT = join(__dirname, '..', '..');

/** A file as `HEAD` holds it in this repository. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

const retrospective = (): NonNullable<ReturnType<typeof loadWorkflowRegistryAtHead>['workflows'][number]> =>
  loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'retrospective')!;

const phase = (name: string): NonNullable<ReturnType<typeof retrospective>['phases'][number]> =>
  retrospective().phases.find((p) => p.name === name)!;

/** A description with its folded whitespace collapsed, so a test reads it as one line. */
const text = (name: string): string => (phase(name).description ?? '').replace(/\s+/g, ' ');

describe('AC 1a — explore reads the release-health reports of the patches since the previous retrospective (dl-167 (a))', () => {
  it('keeps the release\'s own report among its sources', () => {
    expect(text('explore')).toContain('`docs/08_health/release-health-{release.version}.md`');
  });

  it('names the report of every patch released since the previous retrospective', () => {
    expect(text('explore')).toContain(
      'the report `docs/08_health/release-health-<patch version>.md` of every patch released since the previous retrospective',
    );
  });

  it('cites the rulings: a patch skips the retrospective (dl-092 Q2 (ii)), its proposals are disposed of here (dl-167 (a))', () => {
    expect(text('explore')).toMatch(/dl-092 Q2 \(ii\)/);
    expect(text('explore')).toMatch(/dl-167 \(a\)/);
  });

  it('selects a patch report by the deducible cut of D2 (a): absent from the tree at the previous retro approval', () => {
    expect(text('explore')).toContain('absent from the tree at the commit that approved the previous `retro-<version>`');
  });

  it('carries each report\'s RH-<version>-NN proposals as proposals', () => {
    expect(text('explore')).toContain('each of its `RH-<version>-NN` proposals is carried as a proposal');
  });
});

describe('AC 1b — the version is bumped once, from 1.6', () => {
  it('reads at least 1.7, the history kept and the task-300 entry appended after the 1.6 one', () => {
    expect(retrospective().version).toBeGreaterThanOrEqual(1.7);
    expect(atHead('.wingfoil/workflows/custom/retrospective.yaml')).toMatch(
      /^version: [0-9.]+ .*1\.6 dl-163 S3d \(task-272\).*; 1\.7 dl-167 \(a\) \(task-300\)/m,
    );
  });
});

describe('AC 1c — token-neutral: no actions/checks token and no explore produces change (characterization, W1-4)', () => {
  it('every phase keeps its action and check tokens', () => {
    expect(
      retrospective().phases.map((p) => [
        p.name,
        (p.actions ?? []).map(tokenName),
        (p.checks?.pre ?? []).map(tokenName),
        (p.checks?.post ?? []).map(tokenName),
      ]),
    ).toEqual([
      ['explore', ['agent.execute'], [], ['secondary-sources.listed']],
      ['collect-feedback', ['agent.execute'], [], ['feedback-notes.recorded']],
      ['additional-points', [], ['proposals.disposed'], []],
      ['capture', ['memory.add', 'memory.submit'], [], ['frontmatter.required']],
      ['approve', ['decision-log.set_state'], [], []],
    ]);
  });

  it('explore still produces only the friction inventory', () => {
    expect(phase('explore').produces).toEqual([
      'docs/09_retrospectives/rl-{release.release-line}/rel-{release.version}-friction-inventory.md',
    ]);
  });
});

describe('AC 1d — the same-class text follows (design gate D3 (a))', () => {
  it('additional-points presents the comparison and RH proposals of every report explore read, the patches\' included', () => {
    expect(text('additional-points')).toContain(
      'of every release-health report explore read, the patches\' included (dl-089 §4, dl-167)',
    );
  });

  it('WORKFLOW.md\'s retrospective node names the patches\' reports among explore\'s sources', () => {
    const node = atHead('.wingfoil/WORKFLOW.md')
      .split('\n')
      .find((line) => line.includes('RT["**retrospective**'));
    expect(node).toBeDefined();
    expect(node).toContain('and those of the patches released since the previous retrospective (dl-167)');
  });

  it('WORKFLOW.md\'s release-cycle prose says a patch\'s proposals go to the next minor\'s retrospective', () => {
    expect(atHead('.wingfoil/WORKFLOW.md').replace(/\s+/g, ' ')).toContain(
      'its proposals are disposed of by the next minor\'s retrospective (dl-167)',
    );
  });
});

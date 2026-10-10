/**
 * task-272 — `retrospective.yaml` gains a read-only `collect-feedback` phase (`dl-163` S3d; `dl-115` as amended
 * 2026-10-07: six outcomes for a consumer feedback note).
 *
 * Every assertion reads this repository's configuration **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, and
 * `git show HEAD:…` for the raw file and `.wingfoil/WORKFLOW.md`), so a dirty working tree changes nothing.
 *
 * - AC 1: the phase sits between `explore` and `additional-points`, run by the facilitator, read-only (its one
 *   action is the facilitator's agent session; no Memory action, no approval); it reads every `active` `repository`
 *   service with a `feedback_inbox` at its `main` (remote, or a local checkout recorded per machine outside the
 *   repository) and records the commit read; it lists the four kinds of note `dl-163` S3d names; it produces the
 *   read record under `docs/09_retrospectives/` (`bug-299`, `task-222`), one row per note with the cite, the commit
 *   read, the content restated and a proposed outcome among six; never a consumer's configuration, paths or prose.
 *   The version is bumped once, from 1.5 (`task-222`).
 * - AC 2: `explore` names the read record as the secondary source `collect-feedback` adds after it;
 *   `additional-points` presents it (its check, `task-213`'s, is pinned in `retrospective-notes.test.ts`);
 *   `capture` records the ruling's decision, elements and target release in `retro-{version}`'s Dispositions (or
 *   `## Consumer feedback`).
 * - AC 3: zero errors and the phase's evidence are `workflow-repository-conformance.test.ts`'s and
 *   `workflow-evidence.test.ts`'s; here, `.wingfoil/WORKFLOW.md`'s retrospective node chains the phase.
 *
 * Deterministic: fixed phase order, no wall-clock.
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

const SIX = ['covered', 'element', 'restated', 'superseded', 'declined', 'needs-info'];

describe('AC 1 — collect-feedback: a read-only phase between explore and additional-points (dl-163 S3d)', () => {
  it('the version is bumped from 1.5 (task-222) and the header history names this change', () => {
    expect(retrospective().version).toBeGreaterThanOrEqual(1.6);
    expect(atHead('.wingfoil/workflows/custom/retrospective.yaml')).toMatch(/^version: [0-9.]+ .*1\.6 dl-163 S3d \(task-272\)/m);
  });

  it('sits between explore and additional-points', () => {
    expect(retrospective().phases.map((p) => p.name)).toEqual(['explore', 'collect-feedback', 'additional-points', 'capture', 'approve']);
  });

  it('is read-only: the facilitator\'s agent session is its one action; no Memory action, no approval', () => {
    const collect = phase('collect-feedback');
    expect(collect.role).toBe('facilitator');
    expect((collect.actions ?? []).map(tokenName)).toEqual(['agent.execute']);
    expect(collect.approval).toBeUndefined();
    expect(text('collect-feedback')).toMatch(/Read-only/);
    expect(text('collect-feedback')).toMatch(/never commits into a consumer repository/);
  });

  it('reads every active repository service with a feedback_inbox at its main, remote or a per-machine checkout, recording the commit read', () => {
    const description = text('collect-feedback');
    expect(description).toMatch(/every `active` service of kind `repository` that declares a `feedback_inbox`/);
    expect(description).toMatch(/at the consumer's `main`/);
    expect(description).toMatch(/the remote, or a local checkout recorded per machine outside this repository/);
    expect(description).toMatch(/records the commit read/);
  });

  it('lists the four kinds of note: open, answered needs-info, captured and shipped in this release, triaged outside under R6', () => {
    const description = text('collect-feedback');
    expect(description).toMatch(/notes in status `open`/);
    expect(description).toMatch(/`needs-info` notes the consumer has since answered/);
    expect(description).toMatch(/`captured` notes whose elements shipped in this release/);
    expect(description).toMatch(/triaged outside the retrospective into a patch \(dl-163 R6\)/);
  });

  it('produces the read record under docs/09_retrospectives/, beside explore\'s friction inventory', () => {
    expect(phase('collect-feedback').produces).toEqual([
      'docs/09_retrospectives/rl-{release.release-line}/rel-{release.version}-feedback-triage.md',
    ]);
  });

  it('one row per note: cite @sha, commit read, content restated, a proposed outcome among six; never a consumer\'s configuration, paths or prose', () => {
    const description = text('collect-feedback');
    expect(description).toMatch(/one row per note/);
    expect(description).toMatch(/`<service id>\/F-<nnn>@<sha>`/);
    expect(description).toMatch(/restated in WingFoil's words/);
    for (const outcome of SIX) expect(description).toContain(outcome);
    expect(description).toMatch(/never holds a consumer's configuration, paths or prose/);
    const post = phase('collect-feedback').checks?.post ?? [];
    expect(post).toEqual([expect.stringMatching(/^feedback-notes\.recorded\(/)]);
    for (const outcome of SIX) expect(post[0]).toContain(outcome);
  });
});

describe('AC 2 — the read record reaches the gate and the ruling reaches retro-{version}', () => {
  it('explore names the read record as the secondary source collect-feedback adds after it', () => {
    const description = text('explore');
    expect(description).toMatch(/consumer feedback read record \(dl-163\) is written after this phase, by `collect-feedback`/);
  });

  it('additional-points presents the consumer feedback read record', () => {
    expect(text('additional-points')).toMatch(/the consumer feedback read record `collect-feedback` wrote/);
  });

  it('capture records the ruling: decision, elements and target release in the Dispositions (or ## Consumer feedback)', () => {
    const description = text('capture');
    expect(description).toMatch(/consumer feedback note/);
    expect(description).toMatch(/decision, the elements and the target release/);
    expect(description).toMatch(/Dispositions \(or a `## Consumer feedback` section\)/);
  });
});

describe('AC 3 — .wingfoil/WORKFLOW.md shows the phase', () => {
  it('the retrospective node chains explore → collect-feedback → additional-points', () => {
    const reference = atHead('.wingfoil/WORKFLOW.md');
    const node = reference.split('\n').find((line) => /RT\["\*\*retrospective\*\*/.test(line))!;
    expect(node).toContain('explore → collect-feedback → additional-points → capture → approve');
    expect(node).toContain('docs/09_retrospectives/rl-{release.release-line}/rel-{release.version}-feedback-triage.md');
  });
});

/**
 * task-374, fix round after the independent review (testing T1) — the two determinism clauses of the ungated elements
 * that no other suite asserts:
 *
 * - `spec-017` §7.4: `ungatedByType` counts the ungated elements per type, ascending by type in byte order, and the
 *   console summary lists `(<type> <count>, …)` in that order — pinned across three types (`bug`, `release`,
 *   `release-line`, the last two a prefix pair) on `./helpers/held-identity-fixture.ts`'s self-held project.
 * - `spec-017` §5.1: a held element records "the first such instance … in instance order (§3.3)" — pinned on the
 *   two-runs project, where `sw-life-cycle-1-plan` and `hotfix-1-plan` both have `release-1`'s `sprint-planning` on
 *   their frontier and so both hold `bug-1-crash` (`release: "release-1"`): the most recently started instance holds
 *   it, whichever of the two that is, and two calls give the same answer.
 */
import { CORE_MODULES, renderStatusConsole, type StatusResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { IDENTITY_ROUTED, TWO_RUNS, writeSelfHeldProject, writeTwoRunsProject } from './helpers/held-identity-fixture';

const statusOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowStatus'];

async function status(root: string): Promise<StatusResult> {
  if (statusOp === undefined) throw new Error('no workflowStatus operation in CORE_MODULES');
  const value = await statusOp.fn({ root });
  const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<StatusResult>;
  if (!result.ok) throw new Error(`workflow status refused: ${result.error.message}`);
  return result.value;
}

const asJson = (value: StatusResult): Record<string, unknown> => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

describe('task-374 review F3 — ungatedByType and the console summary, ascending by type in byte order (spec-017 §7.4)', () => {
  let repo: string;
  let value: StatusResult;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeSelfHeldProject(repo, { selfField: false });
    value = await status(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('the payload counts three types, bug before release before release-line', () => {
    expect(asJson(value)['ungatedByType']).toEqual([
      { type: 'bug', count: 2 },
      { type: 'release', count: 2 },
      { type: 'release-line', count: 1 },
    ]);
    const types = value.ungatedByType.map((entry) => entry.type);
    // Byte (code-unit) order: the default sort of strings, not a locale's.
    expect(types).toEqual([...types].sort());
  });

  it('the console summary names the counts in the same order', () => {
    const lines = renderStatusConsole(value).split('\n');
    expect(lines).toContain(`ungated elements: 5 (bug 2, release 2, release-line 1) — routed to ${IDENTITY_ROUTED}; --full lists them`);
  });
});

describe.each([
  ['hotfix', TWO_RUNS.hotfix, [TWO_RUNS.hotfix, TWO_RUNS.lifeCycle]],
  ['sw-life-cycle', TWO_RUNS.lifeCycle, [TWO_RUNS.lifeCycle, TWO_RUNS.hotfix]],
] as const)('task-374 review F3 — two open runs hold bug-1-crash, the first in instance order wins (spec-017 §5.1): %s started last', (startedLast, holder, order) => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeTwoRunsProject(repo, { startedLast });
  });
  afterAll(() => removeTempDir(repo));

  it('both runs have release-1\'s sprint-planning on their frontier, the last started first in instance order', async () => {
    const value = await status(repo);
    expect(value.open.map((entry) => entry.instance.id)).toEqual(order);
    for (const entry of value.open) expect(entry.frontier.map((step) => step.key)).toContain('sprint.sprint-planning@release:release-1');
  });

  it(`bug-1-crash is held by ${holder}, the same on two calls`, async () => {
    const first = asJson(await status(repo))['ungated'];
    const second = asJson(await status(repo))['ungated'];
    expect(first).toEqual([
      { type: 'bug', id: 'bug-1-crash', status: 'triaged', heldBy: { instance: holder, element: { type: 'release', id: 'release-1', status: 'planning' } } },
      { type: 'bug', id: 'bug-2-other', status: 'triaged' },
    ]);
    expect(second).toEqual(first);
  });
});

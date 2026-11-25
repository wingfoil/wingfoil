/**
 * task-374 — `wingfoil workflow status`'s ungated elements (`spec-017` §5.1, §5.3, §7.4, §8 `UngatedElement` /
 * `StatusResult`, as amended at the design gate; BDD P4.5 "The ungated elements are counted by type, --full lists
 * them" and "An element whose release is an open run's iteration is held, not uncarried"), through the registered
 * `CORE_MODULES` operation `workflow.workflowStatus` and the `src/core` barrel's `renderStatusConsole`, on the
 * design's AC 1 scratch project (`./helpers/held-ungated-fixture.ts`).
 *
 * - AC 5 (`bug-487`), half 1 (characterization): every pending approval is a step of the open run's frontier — the
 *   three iteration candidates' approvals are on it together.
 * - AC 5, half 2 (red-first): `bug-1-crash`, whose `release` names `release-1` (or `release-1`'s `version`), is held
 *   by `sw-life-cycle-1-plan` (`heldBy`), and the `--full` console line says so instead of "no open workflow carries
 *   it"; `bug-2-other`, naming an element that does not exist, keeps today's line and has no `heldBy`.
 * - AC 6 (`bug-341`, red-first): `ungatedByType` counts the ungated elements per type; the console prints one summary
 *   line by default and one line per element under `--full`; the pending approvals print the same either way; with
 *   no ungated element neither form prints a line.
 *
 * The CLI bytes (`--full`, `--help`, the formats) are `test/cli/workflow-status-full.integration.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, renderStatusConsole, type StatusResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { HELD_INSTANCE, HELD_ROUTED, writeHeldUngatedProject } from './helpers/held-ungated-fixture';

const FEATURES = join(__dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p4-workflow');
const P4_5 = readFileSync(join(FEATURES, 'P4.5-workflow-status.feature'), 'utf-8');

const statusOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowStatus'];

async function status(root: string): Promise<StatusResult> {
  if (statusOp === undefined) throw new Error('no workflowStatus operation in CORE_MODULES');
  const value = await statusOp.fn({ root });
  const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<StatusResult>;
  if (!result.ok) throw new Error(`workflow status refused: ${result.error.message}`);
  return result.value;
}

/** The payload as the JSON a reader sees (`--format json`, the MCP Resource). */
const asJson = (value: StatusResult): Record<string, unknown> => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

/** The console view with the invocation's flags (`spec-006` §2 as amended: `renderConsole(value, call?)`). */
const renderFull = (value: StatusResult): string => renderStatusConsole(value, { flags: { full: true } });

/** The lines of the `pending approvals:` block, up to (exclusive) the ungated block or the end. */
function pendingBlock(text: string): string[] {
  const lines = text.split('\n');
  const from = lines.indexOf('pending approvals: 3');
  if (from < 0) throw new Error(`no pending approvals block in:\n${text}`);
  const rest = lines.slice(from);
  const end = rest.findIndex((line) => line.startsWith('ungated elements'));
  return end < 0 ? rest : rest.slice(0, end);
}

const FRONTIER = ['sprint.sprint-planning@release:release-1', 'sprint.sprint-review@release:release-2', 'release-line-cycle.approve@release-line:rl-2'];
const RELEASE_1 = { type: 'release', id: 'release-1', status: 'planning' };
const HELD_LINE = `  human needed: approve or reject bug-1-crash (bug, triaged; held by ${HELD_INSTANCE}'s release release-1, no step of it approves it now) — routed to ${HELD_ROUTED}`;
const UNCARRIED_BUG_1 = 'bug-1-crash (bug, triaged; no open workflow carries it)';
const BUG_2_LINE = `  human needed: approve or reject bug-2-other (bug, triaged; no open workflow carries it) — routed to ${HELD_ROUTED}`;
const SUMMARY_LINE = `ungated elements: 2 (bug 2) — routed to ${HELD_ROUTED}; --full lists them`;

describe('task-374 BDD — P4.5 carries the two part A scenarios (bug-341, bug-487)', () => {
  it('"The ungated elements are counted by type, --full lists them" and "An element whose release is an open run\'s iteration is held, not uncarried"', () => {
    const titles = P4_5.split('\n').filter((line) => line.startsWith('  Scenario: ')).map((line) => line.slice('  Scenario: '.length));
    expect(titles).toEqual(expect.arrayContaining([
      'The ungated elements are counted by type, --full lists them',
      "An element whose release is an open run's iteration is held, not uncarried",
    ]));
  });
});

describe('task-374 AC 5 — bug-487: pending approvals and held elements (spec-017 §5.1)', () => {
  let repo: string;
  let value: StatusResult;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeHeldUngatedProject(repo);
    value = await status(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('half 1 (characterization) — the three pending approvals are the three frontier steps of the one open run, in frontier order', () => {
    expect(value.open.map((entry) => entry.instance.id)).toEqual([HELD_INSTANCE]);
    expect(value.open[0]!.frontier.map((step) => step.key)).toEqual(FRONTIER);
    expect(value.pendingApprovals.map((approval) => approval.step)).toEqual(FRONTIER);
    const frontierKeys = new Set(value.open[0]!.frontier.map((step) => step.key));
    for (const approval of value.pendingApprovals) {
      expect(approval.instance).toBe(HELD_INSTANCE);
      expect(frontierKeys.has(approval.step ?? '')).toBe(true);
    }
    // The start is marked (WingFoil-Start), so the pre-marker rule adds no diagnostic.
    expect(value.diagnostics).toEqual([]);
  });

  it('half 2 — bug-1-crash (release: release-1, an open iteration on the frontier) is held by sw-life-cycle-1-plan; bug-2-other has no heldBy', () => {
    expect(asJson(value)['ungated']).toEqual([
      { type: 'bug', id: 'bug-1-crash', status: 'triaged', heldBy: { instance: HELD_INSTANCE, element: RELEASE_1 } },
      { type: 'bug', id: 'bug-2-other', status: 'triaged' },
    ]);
  });

  it('half 2 — the value may be the scoping element\'s version: release: "v0.1" against release-1\'s version "v0.1" gives the same heldBy', async () => {
    const variant = makeTempGitRepo();
    try {
      writeHeldUngatedProject(variant, { version: true });
      expect(asJson(await status(variant))['ungated']).toEqual([
        { type: 'bug', id: 'bug-1-crash', status: 'triaged', heldBy: { instance: HELD_INSTANCE, element: RELEASE_1 } },
        { type: 'bug', id: 'bug-2-other', status: 'triaged' },
      ]);
    } finally {
      removeTempDir(variant);
    }
  });

  it('half 2 — under --full the held element\'s line names its holder and is never "no open workflow carries it"; bug-2-other\'s line is today\'s', () => {
    const lines = renderFull(value).split('\n');
    expect(lines).toContain(HELD_LINE);
    expect(lines.filter((line) => line.includes(UNCARRIED_BUG_1))).toEqual([]);
    expect(lines).toContain(BUG_2_LINE);
  });
});

describe('task-374 AC 6 — bug-341: the ungated elements counted by type, --full lists them (spec-017 §7.4)', () => {
  let repo: string;
  let value: StatusResult;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeHeldUngatedProject(repo);
    value = await status(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('the payload counts the ungated elements per type in ungatedByType, and ungated keeps every element', () => {
    const json = asJson(value);
    expect(json['ungatedByType']).toEqual([{ type: 'bug', count: 2 }]);
    expect((json['ungated'] as unknown[]).length).toBe(2);
  });

  it('StatusResult carries spec-017 §8\'s fields: ungatedByType joins them', () => {
    expect(Object.keys(asJson(value)).sort()).toEqual(['active', 'baseline', 'diagnostics', 'open', 'pendingApprovals', 'ungated', 'ungatedByType', 'ungatedRoutedTo']);
  });

  it('console by default: one summary line with the count per type and the routed member; no element has a line of its own', () => {
    const lines = renderStatusConsole(value).split('\n');
    expect(lines).toContain(SUMMARY_LINE);
    expect(lines.filter((line) => line.startsWith('  human needed: approve or reject bug-'))).toEqual([]);
    expect(lines).not.toContain('ungated elements: 2');
  });

  it('console under --full: the line "ungated elements: 2", then one line per element in ungated\'s order; no summary line', () => {
    const lines = renderFull(value).split('\n');
    const at = lines.indexOf('ungated elements: 2');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(lines.slice(at + 1, at + 3)).toEqual([HELD_LINE, BUG_2_LINE]);
    expect(lines).not.toContain(SUMMARY_LINE);
  });

  it('the pending approvals print the same with and without --full', () => {
    expect(pendingBlock(renderFull(value))).toEqual(pendingBlock(renderStatusConsole(value)));
    expect(pendingBlock(renderStatusConsole(value))).toHaveLength(4);
  });

  it('with no ungated element: ungatedByType is [] and neither console form prints an ungated line', async () => {
    const empty = makeTempGitRepo();
    try {
      writeHeldUngatedProject(empty);
      // Both bugs leave their gate: nothing is ungated (rl-2, release-1 and release-2 are carried by the frontier).
      writeFixtureFile(empty, 'docs/bugs/bug-1-crash.md', '---\nid: "bug-1-crash"\ntype: bug\ntitle: "bug-1-crash"\nstatus: planned\nrelease: "release-1"\n---\n\n## Body\n');
      writeFixtureFile(empty, 'docs/bugs/bug-2-other.md', '---\nid: "bug-2-other"\ntype: bug\ntitle: "bug-2-other"\nstatus: planned\nrelease: "release-9"\n---\n\n## Body\n');
      commitAll(empty, 'plan both bugs');
      const none = await status(empty);
      expect(asJson(none)['ungated']).toEqual([]);
      expect(asJson(none)['ungatedByType']).toEqual([]);
      expect(renderStatusConsole(none)).not.toContain('ungated elements');
      expect(renderFull(none)).not.toContain('ungated elements');
    } finally {
      removeTempDir(empty);
    }
  });
});

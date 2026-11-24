/**
 * task-374, fix round after the independent review — the identity rule of `spec-017` §5.1 (`bug-487`): a gated element
 * that is itself `S`, the scope of an entry of a frontier step's trail of an open instance, is held by that instance
 * whatever its fields; `heldBy` records the first holder in §5.1's order, which is the element itself unless an earlier
 * holder in that order holds it by a field (the nested case is pinned by `./workflow-status-held-nested.test.ts`). Without
 * the rule, a run's own iteration element, sitting at its gate on a frontier step that approves nothing, was reported as
 * carried by no open workflow. Here the trail has one entry, so `heldBy.element` is `release-1` itself.
 *
 * On `./helpers/held-identity-fixture.ts`'s self-held project: `hotfix-1-plan` iterates the releases through a `sprint`
 * whose first phase is a `produces:` step, so its one frontier step is `sprint.sprint-goal@release:release-1` and no
 * approval is pending; `release-1` (`planning`, a gate) scopes it. Both forms are pinned — `release-1` with no field
 * naming itself, and with `release: "release-1"` — with the held line in the console under `--full` (core renderer and
 * CLI) and the `heldBy` in the json payload. Positive controls: `release-2` (`releasing`, outside the iteration's entry
 * filter) and `rl-2` (a type `hotfix` never iterates) scope nothing and stay unheld.
 */
import { CORE_MODULES, renderStatusConsole, type StatusResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { IDENTITY_ROUTED, SELF_INSTANCE, writeSelfHeldProject } from './helpers/held-identity-fixture';

const statusOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowStatus'];

async function status(root: string): Promise<StatusResult> {
  if (statusOp === undefined) throw new Error('no workflowStatus operation in CORE_MODULES');
  const value = await statusOp.fn({ root });
  const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<StatusResult>;
  if (!result.ok) throw new Error(`workflow status refused: ${result.error.message}`);
  return result.value;
}

const asJson = (value: StatusResult): Record<string, unknown> => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

const RELEASE_1 = { type: 'release', id: 'release-1', status: 'planning' };
const HELD_BY_SELF = { instance: SELF_INSTANCE, element: RELEASE_1 };

/** The json `ungated` of the self-held project: the same for both forms of `release-1`. */
const UNGATED = [
  { type: 'bug', id: 'bug-1-crash', status: 'triaged', heldBy: HELD_BY_SELF },
  { type: 'bug', id: 'bug-2-other', status: 'triaged' },
  { type: 'release', id: 'release-1', status: 'planning', heldBy: HELD_BY_SELF },
  { type: 'release', id: 'release-2', status: 'releasing' },
  { type: 'release-line', id: 'rl-2', status: 'planning' },
];

const RELEASE_1_HELD_LINE = `  human needed: approve or reject release-1 (release, planning; held by ${SELF_INSTANCE}'s release release-1, no step of it approves it now) — routed to ${IDENTITY_ROUTED}`;
const RELEASE_1_UNCARRIED = 'release-1 (release, planning; no open workflow carries it)';
const RELEASE_2_LINE = `  human needed: approve or reject release-2 (release, releasing; no open workflow carries it) — routed to ${IDENTITY_ROUTED}`;
const RL_2_LINE = `  human needed: approve or reject rl-2 (release-line, planning; no open workflow carries it) — routed to ${IDENTITY_ROUTED}`;

describe.each([
  ['with no field naming itself', false],
  ['with release: "release-1" on it', true],
] as const)('task-374 review F2 — the identity rule (spec-017 §5.1): release-1 %s', (_label, selfField) => {
  let repo: string;
  let value: StatusResult;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeSelfHeldProject(repo, { selfField });
    value = await status(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('release-1 scopes the run\'s one frontier step, which approves nothing: no approval is pending', () => {
    expect(value.open.map((entry) => entry.instance.id)).toEqual([SELF_INSTANCE]);
    expect(value.open[0]!.frontier.map((step) => step.key)).toEqual(['sprint.sprint-goal@release:release-1']);
    expect(value.pendingApprovals).toEqual([]);
    expect(value.diagnostics).toEqual([]);
  });

  it('json: release-1 is held by hotfix-1-plan, heldBy.element naming release-1 itself; release-2 and rl-2 (scoping nothing) have no heldBy', () => {
    expect(asJson(value)['ungated']).toEqual(UNGATED);
  });

  it('console --full: release-1\'s line names its holder, never "no open workflow carries it"; the controls keep that line', () => {
    const lines = renderStatusConsole(value, { flags: { full: true } }).split('\n');
    expect(lines).toContain(RELEASE_1_HELD_LINE);
    expect(lines.filter((line) => line.includes(RELEASE_1_UNCARRIED))).toEqual([]);
    expect(lines).toContain(RELEASE_2_LINE);
    expect(lines).toContain(RL_2_LINE);
  });

  it('CLI: workflow status --full prints the held line, and --format json carries the same heldBy', () => {
    const full = runCliEntry(repo, ['workflow', 'status', '--full']);
    expect([full.status, full.stderr]).toEqual([0, '']);
    const lines = full.stdout.split('\n');
    expect(lines).toContain(RELEASE_1_HELD_LINE);
    expect(lines.filter((line) => line.includes(RELEASE_1_UNCARRIED))).toEqual([]);

    const json = runCliEntry(repo, ['workflow', 'status', '--format', 'json']);
    expect([json.status, json.stderr]).toEqual([0, '']);
    expect((JSON.parse(json.stdout) as Record<string, unknown>)['ungated']).toEqual(UNGATED);
  });
});

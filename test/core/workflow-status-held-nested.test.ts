/**
 * task-374, fix round 2 after the re-review — the first-match order of `spec-017` §5.1 on a nested trail (`bug-487`):
 * a gated element that is itself `S`, the scope of an entry of a frontier step's trail, is held by that instance
 * whatever its fields, but `heldBy` records the FIRST holder in instance, frontier and trail order. When an earlier
 * entry of the trail holds the element by a field, that ancestor is the holder, not the element itself.
 *
 * On `./helpers/held-identity-fixture.ts`'s nested project: `sw-life-cycle-1-plan`'s frontier step
 * `sprint.sprint-goal@release:release-1` has the trail `rl-1` then `release-1`. `release-1` (`release-line: "rl-1"`,
 * the usual shape) is matched first by the field rule on the ancestor `rl-1`, so its `heldBy.element` is `rl-1`;
 * `rl-1` itself is held by identity, its `heldBy.element` being `rl-1`. Both in the json payload and in the console
 * `--full` line (core renderer and CLI). Characterization: `holderOf` (`src/workflow/deduce.ts`) already behaves so.
 */
import { CORE_MODULES, renderStatusConsole, type StatusResult } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { runCliEntry } from '../cli/helpers/spawn-cli';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { IDENTITY_ROUTED, NESTED_INSTANCE, writeNestedHeldProject } from './helpers/held-identity-fixture';

const statusOp = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowStatus'];

async function status(root: string): Promise<StatusResult> {
  if (statusOp === undefined) throw new Error('no workflowStatus operation in CORE_MODULES');
  const value = await statusOp.fn({ root });
  const result = (typeof value === 'object' && value !== null && 'ok' in value ? value : { ok: true, value }) as CoreResult<StatusResult>;
  if (!result.ok) throw new Error(`workflow status refused: ${result.error.message}`);
  return result.value;
}

type Ungated = { readonly type: string; readonly id: string; readonly heldBy?: unknown };

const ungatedOf = (payload: unknown, id: string): Ungated | undefined =>
  ((payload as { ungated: readonly Ungated[] }).ungated).find((element) => element.id === id);

const HELD_BY_RL_1 = { instance: NESTED_INSTANCE, element: { type: 'release-line', id: 'rl-1', status: 'planning' } };

const RELEASE_1_LINE = `  human needed: approve or reject release-1 (release, planning; held by ${NESTED_INSTANCE}'s release-line rl-1, no step of it approves it now) — routed to ${IDENTITY_ROUTED}`;
const RL_1_LINE = `  human needed: approve or reject rl-1 (release-line, planning; held by ${NESTED_INSTANCE}'s release-line rl-1, no step of it approves it now) — routed to ${IDENTITY_ROUTED}`;

describe('task-374 fix round 2 — a nested trail (spec-017 §5.1): the first holder wins, the ancestor by a field before the element itself', () => {
  let repo: string;
  let value: StatusResult;
  beforeAll(async () => {
    repo = makeTempGitRepo();
    writeNestedHeldProject(repo);
    value = await status(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('the frontier step sprint.sprint-goal@release:release-1 has the trail rl-1 then release-1, and approves nothing', () => {
    expect(value.open.map((entry) => entry.instance.id)).toEqual([NESTED_INSTANCE]);
    const step = value.open[0]!.frontier.find((entry) => entry.key === 'sprint.sprint-goal@release:release-1');
    expect(step?.trail.map((link) => (link.scope !== null && 'element' in link.scope ? link.scope.element.id : null))).toEqual([null, 'rl-1', 'release-1']);
    expect(value.pendingApprovals).toEqual([]);
    expect(value.diagnostics).toEqual([]);
  });

  it('json: release-1 is held by the field on the ancestor rl-1; rl-1 is held by identity, heldBy.element being rl-1', () => {
    const json = JSON.parse(JSON.stringify(value)) as unknown;
    expect(ungatedOf(json, 'release-1')).toEqual({ type: 'release', id: 'release-1', status: 'planning', heldBy: HELD_BY_RL_1 });
    expect(ungatedOf(json, 'rl-1')).toEqual({ type: 'release-line', id: 'rl-1', status: 'planning', heldBy: HELD_BY_RL_1 });
  });

  it('console --full: both lines name rl-1 as the holder', () => {
    const lines = renderStatusConsole(value, { flags: { full: true } }).split('\n');
    expect(lines).toContain(RELEASE_1_LINE);
    expect(lines).toContain(RL_1_LINE);
  });

  it('CLI: workflow status --full prints both lines, and --format json carries the same heldBy', () => {
    const full = runCliEntry(repo, ['workflow', 'status', '--full']);
    expect([full.status, full.stderr]).toEqual([0, '']);
    const lines = full.stdout.split('\n');
    expect(lines).toContain(RELEASE_1_LINE);
    expect(lines).toContain(RL_1_LINE);

    const json = runCliEntry(repo, ['workflow', 'status', '--format', 'json']);
    expect([json.status, json.stderr]).toEqual([0, '']);
    const payload = JSON.parse(json.stdout) as unknown;
    expect(ungatedOf(payload, 'release-1')?.heldBy).toEqual(HELD_BY_RL_1);
    expect(ungatedOf(payload, 'rl-1')?.heldBy).toEqual(HELD_BY_RL_1);
  });
});

/**
 * task-292 — this repository's `Claude` agent executes as `facilitator` (`retro-v0.3` Actions, P-02 quick fix;
 * `dl-202` item 3), so `agent execute` can launch the retrospective's agentic phases (`explore`,
 * `collect-feedback`, role `facilitator`).
 *
 * AC 2 (red-first): the repository's committed `dna.yaml` lists `facilitator` in `team.agents[name=Claude]
 * .executes_as`, and the agent selection `agent execute` runs (`selectAgent`, `spec-016` §3.2 step 4) picks
 * `Claude` for `facilitator`, with and without `--agent Claude`.
 *
 * The source is the COMMITTED `dna.yaml` (`git show HEAD:.wingfoil/dna.yaml`): `agent execute` reads HEAD's
 * configuration (command-baseline), so an uncommitted edit must not satisfy this test.
 *
 * Not pinned here: the CLI `agent execute --role facilitator … --dry-run` (needs a terminal and `claude` on
 * `PATH`, `bug-392`) — manual evidence for green/review. AC 3 (`check:role-directives`) is pinned by
 * `test/cli/check-role-directives.test.ts`.
 */
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';

import { selectAgent } from '../../src/agent';
import { DnaYaml } from '../../src/dna/schema';
import { git } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');

function committedDna(): DnaYaml {
  return DnaYaml.parse(loadYaml(git(REPO_ROOT, ['show', 'HEAD:.wingfoil/dna.yaml'])));
}

describe('task-292 AC 2 — the Claude agent executes as facilitator (committed dna.yaml)', () => {
  it('AC 2 (T1): team.agents Claude executes_as is developer, reviewer, qa, architect, facilitator — and holds no approval authority', () => {
    const claude = (committedDna().team.agents ?? []).find((agent) => agent.name === 'Claude');

    expect(claude).toBeDefined();
    expect(claude!.executes_as).toEqual(['developer', 'reviewer', 'qa', 'architect', 'facilitator']);
    expect(claude!.approval_authority).toBe(false);
  });

  it('AC 2 (T2): without --agent, the selection for role facilitator picks Claude with the claude-code adapter', () => {
    const picked = selectAgent(committedDna(), 'facilitator', undefined);

    // The refusal (when there is one) is the received value, so a failure prints its message.
    expect(picked.ok ? picked.value : picked.error).toMatchObject({ name: 'Claude', adapter: 'claude-code' });
    expect(picked.ok).toBe(true);
  });

  it('AC 2 (T3): with --agent Claude, the selection for role facilitator is accepted', () => {
    const picked = selectAgent(committedDna(), 'facilitator', 'Claude');

    // The refusal (when there is one) is the received value, so a failure prints its message.
    expect(picked.ok ? picked.value : picked.error).toMatchObject({ name: 'Claude', adapter: 'claude-code' });
    expect(picked.ok).toBe(true);
  });
});

/**
 * task-340 AC 5 (red-first; `dl-202` item 1, `spec-002` § "Role binding" Human-only roles, approver rulings D1 (A)
 * and D3) — this repository's committed `dna.yaml` marks `approver`, `product-owner` and `tech-lead` human-only (the
 * roles a person executes), no other role, and raises its `version:` (the `dna update` verb writes, `dl-174`; the pin
 * is "≥" plus the history entry naming task-340, bug-314). `Claude`'s `executes_as` is unchanged (AC 2 (T1) above).
 */
describe('task-340 AC 5 — the committed dna.yaml declares the human-only roles', () => {
  it('approver, product-owner and tech-lead carry human_only: true; no other role declares it true', () => {
    const marked = committedDna()
      .team.roles.filter((role) => (role as { human_only?: unknown }).human_only === true)
      .map((role) => role.name)
      .sort();
    expect(marked).toEqual(['approver', 'product-owner', 'tech-lead']);
  });

  it('every role an agent executes stays agent-executable (none of Claude\'s roles is marked)', () => {
    const claude = (committedDna().team.agents ?? []).find((agent) => agent.name === 'Claude');
    const marked = new Set(committedDna().team.roles.filter((role) => (role as { human_only?: unknown }).human_only === true).map((role) => role.name));
    expect(claude!.executes_as.filter((role) => marked.has(role))).toEqual([]);
  });

  it('`version:` is 2.2 or later, and its history comment names task-340', () => {
    const raw = git(REPO_ROOT, ['show', 'HEAD:.wingfoil/dna.yaml']);
    const match = /^version: "?(\d+\.\d+)"?(.*)$/m.exec(raw);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(2.2);
    expect(match![2]).toContain('task-340');
  });
});

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

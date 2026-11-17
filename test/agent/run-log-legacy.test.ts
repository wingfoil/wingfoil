/**
 * task-337 AC 4 (characterization; `spec-016` §4.2 "Adding a field is a revision" and "The 18-key form", §4.5, as
 * amended at `2d193b318`; approver ruling D9) — a run log written before key 19 existed still parses.
 *
 * No run log written by 0.3.2 exists in this repository: the one run log, `docs/06_runs/task-236-…jsonl`, was written by
 * builds stamped `0.2.2` on the v0.3 line, in the 18-key form every build up to 0.3.2 writes (`RUN_RECORD_KEYS`
 * unchanged since `3f7706544`), and is read by the pinned 0.3.2. Its committed copy
 * `test/fixtures/run-logs/task-236-…jsonl` (`task-338`, `c8754fc2a`; `cmp` with the original → identical) is the
 * fixture (D9). `parseRunLog` of it, under the run-log path its element id names, returns both records as written, and
 * `agent list --past` on a fixture repository holding it exits `0`. Both pass today and after the change; the value of
 * those records' `agent_version_after` is AC 2's red (`test/agent/run-log.test.ts`,
 * `test/cli/agent-execute-version.integration.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRunLog } from '../../src/agent';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from '../cli/helpers/spawn-cli';

const ELEMENT_ID = 'task-236-ship-verify-hand-builtin-claude-code-adapter-point';
const FIXTURE = join(__dirname, '..', 'fixtures', 'run-logs', `${ELEMENT_ID}.jsonl`);
const TEXT = readFileSync(FIXTURE, 'utf-8');

describe('task-337 AC 4 — the 18-key run log of task-236 still parses (spec-016 §4.2, §4.5; D9)', () => {
  it('parseRunLog: ok, two records, every field of the 18 as written', () => {
    const result = parseRunLog(TEXT, `docs/runs/${ELEMENT_ID}.jsonl`);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toHaveLength(2);
    expect(result.value[0]).toMatchObject({
      id: `${ELEMENT_ID}/adhoc/1`,
      adapter: 'built-in/claude-code',
      agent_version: '2.1.296 (Claude Code)',
      session: 'f4458e8b-b6a3-5453-8221-90a33bb558bb',
      wingfoil: '0.2.2 (20b0794d3ddfad786621d17d598a8b8a69b27991)',
      result: 'n/a',
      notes: `${ELEMENT_ID}#execution-notes`,
    });
    expect(result.value[1]).toMatchObject({
      id: `${ELEMENT_ID}/adhoc/2`,
      agent_version: '2.1.299 (Claude Code)',
      session: 'b0fc53be-b276-5117-95e6-2e983cf4e5e9',
      wingfoil: '0.2.2 (7a04ad3303987aeb63a92bfaa1d07fa3b2f0383c)',
      exit_status: 0,
    });
  });

  it('the fixture is in the 18-key form: no line carries agent_version_after', () => {
    expect(TEXT.split('\n').filter((line) => line !== '').map((line) => Object.keys(JSON.parse(line) as object).length)).toEqual([18, 18]);
  });

  it('agent list --past on a repository holding it: exit 0, both runs listed', () => {
    const repo = makeTempGitRepo();
    try {
      writeFixtureFile(
        repo,
        '.wingfoil/dna.yaml',
        'version: 1\nmodules:\n  - name: core\n    path: src/core\nstacks:\n  technologies:\n    - name: TypeScript\n      category: language\nteam:\n  members:\n    - name: ada\n      roles: [ approver ]\n  roles:\n    - name: approver\npaths:\n  sources: [ src/ ]\n  runs: [ docs/runs/ ]\n',
      );
      writeFixtureFile(repo, `docs/runs/${ELEMENT_ID}.jsonl`, TEXT);
      commitAll(repo, 'seed');
      const run = runCliEntry(repo, ['agent', 'list', '--past']);
      expect(run.status).toBe(0);
      expect(run.stdout.split('\n')[0]).toBe('past runs: 2');
      expect(run.stdout).toContain(`${ELEMENT_ID}/adhoc/1`);
      expect(run.stdout).toContain(`${ELEMENT_ID}/adhoc/2`);
    } finally {
      removeTempDir(repo);
    }
  }, 60000);
});

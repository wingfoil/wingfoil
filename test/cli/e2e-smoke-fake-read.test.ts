/**
 * task-282, the W3 B7 handover from `task-243`'s review (`bug-ingest-rel-v0.3-w3b7-review-findings-plan` A2):
 *
 * - point 3 — `probeFakeRead` reads `line.argv` of every record line; a line that is not an object with an
 *   array `argv` must fail the probe with a reason, before any git call, rather than throw out of `runSmoke`;
 * - point 2 — `AGENT_FIXTURES` resolves the checkout's `test/fixtures/agents`: `--candidate` and the staging
 *   rehearsal always run the script from a checkout (no package ships `scripts/`), so the fixtures it copies
 *   are there (characterization).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AGENT_FIXTURES, probeFakeRead } from '../../scripts/e2e-smoke.cjs';
import type { SmokeGit } from '../../scripts/e2e-smoke.cjs';

/** A git runner that fails the test if the probe calls it. */
const noGit: SmokeGit = (args) => {
  throw new Error(`probeFakeRead called git ${args.join(' ')}`);
};

describe('task-282 handover 3 — probeFakeRead guards a record line without argv', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-fake-read-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('a first line with no argv fails the probe, naming line 1, with no git call', () => {
    const file = join(dir, 'record.jsonl');
    writeFileSync(file, '{"mcp":null}\n');
    expect(probeFakeRead('task-001-x/adhoc/1', 'developer', noGit, file)).toEqual({ ok: false, detail: "line 1 of the fake agent's record has no argv" });
  });

  it('a second line that is not an object fails the probe, naming line 2', () => {
    const file = join(dir, 'record.jsonl');
    writeFileSync(file, '{"argv":["--version"]}\nnull\n');
    expect(probeFakeRead('task-001-x/adhoc/1', 'developer', noGit, file)).toEqual({ ok: false, detail: "line 2 of the fake agent's record has no argv" });
  });
});

describe('task-282 handover 2 — the agent fixtures resolve from the checkout', () => {
  it('AGENT_FIXTURES holds the fake adapter and the script it launches', () => {
    expect(existsSync(join(AGENT_FIXTURES, 'custom', 'fake.yaml'))).toBe(true);
    expect(existsSync(join(AGENT_FIXTURES, 'fake-agent.cjs'))).toBe(true);
  });
});

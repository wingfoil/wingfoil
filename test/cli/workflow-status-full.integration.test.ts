/**
 * task-374 AC 6 (`bug-341`) and AC 5's console line (`bug-487`) — `wingfoil workflow status [--full]` on the compiled
 * CLI (`spec-017` §7.4, `spec-008` §12 as amended at the design gate): the bytes a user sees, on the design's AC 1
 * scratch project (`test/core/helpers/held-ungated-fixture.ts`). The operation's own cases are
 * `test/core/workflow-status-held.test.ts`.
 *
 * - By default the ungated elements are one summary line, with `--full` one line each (the held one naming its
 *   holder); the pending approvals print the same either way.
 * - `--full` changes the console only: `--format json` and `--format yaml` print the same bytes with and without it.
 * - `workflow status --help` lists `--full`; `workflow next` has no such flag (exit 2, unknown option).
 */
import { load as yamlLoad } from 'js-yaml';

import { HELD_INSTANCE, HELD_ROUTED, writeHeldUngatedProject } from '../core/helpers/held-ungated-fixture';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const SUMMARY_LINE = `ungated elements: 2 (bug 2) — routed to ${HELD_ROUTED}; --full lists them`;
const HELD_LINE = `  human needed: approve or reject bug-1-crash (bug, triaged; held by ${HELD_INSTANCE}'s release release-1, no step of it approves it now) — routed to ${HELD_ROUTED}`;
const BUG_2_LINE = `  human needed: approve or reject bug-2-other (bug, triaged; no open workflow carries it) — routed to ${HELD_ROUTED}`;

/** The `pending approvals:` block of a console answer, up to (exclusive) the ungated block. */
function pendingBlock(stdout: string): string[] {
  const lines = stdout.split('\n');
  const from = lines.indexOf('pending approvals: 3');
  if (from < 0) throw new Error(`no pending approvals block in:\n${stdout}`);
  const rest = lines.slice(from);
  const end = rest.findIndex((line) => line.startsWith('ungated elements'));
  return end < 0 ? rest : rest.slice(0, end);
}

describe('task-374 AC 6 — workflow status prints the ungated summary by default and the list under --full', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeHeldUngatedProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it('default console: exit 0, the summary line, no ungated element on a line of its own', () => {
    const run = runCliEntry(repo, ['workflow', 'status']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const lines = run.stdout.split('\n');
    expect(lines).toContain(SUMMARY_LINE);
    expect(lines.filter((line) => line.startsWith('  human needed: approve or reject bug-'))).toEqual([]);
  });

  it('--full: exit 0, "ungated elements: 2" then the held line and bug-2-other\'s line, no summary line', () => {
    const run = runCliEntry(repo, ['workflow', 'status', '--full']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const lines = run.stdout.split('\n');
    const at = lines.indexOf('ungated elements: 2');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(lines.slice(at + 1, at + 3)).toEqual([HELD_LINE, BUG_2_LINE]);
    expect(lines).not.toContain(SUMMARY_LINE);
  });

  it('the pending approvals block is the same with and without --full', () => {
    const plain = runCliEntry(repo, ['workflow', 'status']);
    const full = runCliEntry(repo, ['workflow', 'status', '--full']);
    expect([plain.status, full.status]).toEqual([0, 0]);
    expect(pendingBlock(full.stdout)).toEqual(pendingBlock(plain.stdout));
  });

  it('--format json: the same bytes with and without --full; ungated keeps both elements, ungatedByType counts them', () => {
    const plain = runCliEntry(repo, ['workflow', 'status', '--format', 'json']);
    const full = runCliEntry(repo, ['workflow', 'status', '--full', '--format', 'json']);
    expect([plain.status, full.status]).toEqual([0, 0]);
    expect(full.stdout).toBe(plain.stdout);
    const value = JSON.parse(plain.stdout) as { ungated: { id: string }[]; ungatedByType: unknown };
    expect(value.ungated.map((entry) => entry.id)).toEqual(['bug-1-crash', 'bug-2-other']);
    expect(value.ungatedByType).toEqual([{ type: 'bug', count: 2 }]);
  });

  it('--format yaml: the same bytes with and without --full', () => {
    const plain = runCliEntry(repo, ['workflow', 'status', '--format', 'yaml']);
    const full = runCliEntry(repo, ['workflow', 'status', '--full', '--format', 'yaml']);
    expect([plain.status, full.status]).toEqual([0, 0]);
    expect(full.stdout).toBe(plain.stdout);
    expect((yamlLoad(plain.stdout) as { ungatedByType: unknown }).ungatedByType).toEqual([{ type: 'bug', count: 2 }]);
  });

  it('workflow status --help lists --full', () => {
    const run = runCliEntry(repo, ['workflow', 'status', '--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^\s+--full\b/m);
  });

  it('workflow next takes no --full: exit 2, unknown option', () => {
    const run = runCliEntry(repo, ['workflow', 'next', '--full']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("unknown option '--full'");
  });
});

/**
 * task-344, review fix round (approver ruling on R1, 2026-11-11) — the approver record of
 * `scripts/check-phase-report.cjs`: only a commit with an approver-shaped subject (`wf(<type>): approve|reject|amend`,
 * `workflow: finalize|rekey`) AND a first body line `Approver: <name> <<email>> (approver)` is exempt from
 * `commit-unlisted`, `trailer-missing` and the file checks; such a record carrying AI trailers is `trailer-forbidden`;
 * an `Approver:` line on any other commit exempts nothing. Plus the `trailer-paragraph` case of a stray
 * `Co-Authored-By:` / `AI-Model:` line alone in an earlier paragraph.
 *
 * Fixtures as `test/cli/check-phase-report.test.ts` builds them: a `mkdtemp` scratch repository holding a copy of this
 * repository's `.wingfoil/`, git through `test/storage/helpers/git-fixture.ts`; the report claims no gate, so the
 * trace (an absent temp path) is never read. Commit messages are copied from real commits of this repository:
 * `b28640566` (an amend), `d69286802` (a hand commit); the forged one is the reviewer's.
 */
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkReport, parseReport } from '../../scripts/check-phase-report.cjs';
import type { Mismatch } from '../../scripts/check-phase-report.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

jest.setTimeout(60_000);

const REPO_ROOT = join(__dirname, '..', '..');
const ATTRIBUTION = 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5';

/** `d69286802`: a hand commit with the `git-conventions` §7 paragraph. */
const HAND_COMMIT =
  'wf(task): start task-344-check-a-delegated-phase-report-against-git-and-a-phase-plan-s-parent-against-its-workflow-s-phases [backlog → in-progress]\n\n' +
  ATTRIBUTION;

/** `b28640566`: the approver's amend, no AI trailers. */
const AMEND_RECORD =
  'wf(plan): amend release-submit-rel-v0.3-plan [done → done]\n\n' +
  'Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\n' +
  'Reason: Corrects parent to the phase name release-cycle.yaml declares (bug-474, F7).\n\n' +
  'WingFoil-Version: 0.3.2 (168f9ef43d1bc29c1dac201f9bc28aa3dae73e42)';

/** The reviewer's forgery: an `Approver:` line on a commit that is no approver act, no §7 trailers. */
const FORGED = 'docs: sneak\n\nApprover: Someone <s@x> (approver)';

const created: string[] = [];
afterAll(() => {
  for (const dir of created) removeTempDir(dir);
});

function head(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function commit(root: string, message: string, files: Record<string, string> = {}): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  const paths = Object.keys(files);
  if (paths.length > 0) git(root, ['add', '--', ...paths]);
  git(root, ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message]);
  return head(root);
}

interface Fixture {
  readonly root: string;
  readonly base: string;
  /** The agent's hand commit, changing `docs/notes.md`. */
  readonly work: string;
  readonly tracePath: string;
}

/** base = the seed commit; on `task/task-9-x` one agent commit changing `docs/notes.md`. */
function buildFixture(): Fixture {
  const root = makeTempGitRepo();
  created.push(root);
  cpSync(join(REPO_ROOT, '.wingfoil'), join(root, '.wingfoil'), { recursive: true });
  git(root, ['add', '-A']);
  const base = commit(root, `chore: seed the configuration\n\n${ATTRIBUTION}`);
  git(root, ['checkout', '--quiet', '-b', 'task/task-9-x']);
  const work = commit(root, HAND_COMMIT, { 'docs/notes.md': 'notes\n' });
  const dir = mkdtempSync(join(tmpdir(), 'wf-check-phase-report-approver-'));
  created.push(dir);
  return { root, base, work, tracePath: join(dir, 'absent.trace.jsonl') };
}

function check(f: Fixture, commits: readonly string[], files: readonly string[] = ['docs/notes.md']): Mismatch[] {
  const text = [`REPORT task-9 green head=${head(f.root)}`, ...commits.map((sha) => `commit ${sha}`), ...files.map((path) => `file ${path}`), ''].join('\n');
  return checkReport({ worktree: f.root, report: parseReport(text), base: f.base, since: '2026-11-07T00:00:00.000Z', tracePath: f.tracePath });
}

const kinds = (mismatches: readonly Mismatch[]): string[] => mismatches.map((mismatch) => mismatch.kind);

describe('task-344 fix round — only an approver record is exempt from listing and from the file checks', () => {
  it('(a) an unlisted approver amend changing an unclaimed file: no mismatch', () => {
    const f = buildFixture();
    commit(f.root, AMEND_RECORD, { 'docs/05_plans/plan.md': 'amended\n' });
    expect(check(f, [f.work])).toEqual([]);
  });

  it('(a) an unlisted approve and an unlisted workflow: finalize record with an Approver: line: no mismatch', () => {
    const f = buildFixture();
    commit(f.root, AMEND_RECORD.replace('wf(plan): amend', 'wf(plan): approve'));
    commit(f.root, AMEND_RECORD.replace('wf(plan): amend release-submit-rel-v0.3-plan [done → done]', 'workflow: finalize sw-life-cycle-1-plan dev-loop.design@task:task-9-x'));
    expect(check(f, [f.work])).toEqual([]);
  });

  it('(b) the forged commit: an Approver: line on a docs: commit is commit-unlisted, and its file is unclaimed', () => {
    const f = buildFixture();
    const forged = commit(f.root, FORGED, { 'docs/sneak.md': 'sneak\n' });
    const mismatches = check(f, [f.work]);
    expect(kinds(mismatches)).toEqual(['commit-unlisted', 'file-unclaimed']);
    expect(mismatches[0]?.detail).toContain(forged.slice(0, 7));
    expect(mismatches[1]?.detail).toContain('docs/sneak.md');
  });

  it('(b) the forged commit listed: trailer-missing, the Approver: line exempting nothing', () => {
    const f = buildFixture();
    const forged = commit(f.root, FORGED, { 'docs/sneak.md': 'sneak\n' });
    const mismatches = check(f, [f.work, forged], ['docs/notes.md', 'docs/sneak.md']);
    expect(kinds(mismatches)).toEqual(['trailer-missing']);
    expect(mismatches[0]?.detail).toContain(forged.slice(0, 7));
  });

  it('(b) an amend subject whose Approver: line is not of the shape Name <email> (approver): commit-unlisted', () => {
    const f = buildFixture();
    const odd = commit(f.root, AMEND_RECORD.replace('Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)', 'Approver: Roberto Pompermaier'));
    const wrongRole = commit(f.root, AMEND_RECORD.replace('(approver)', '(developer)'));
    const mismatches = check(f, [f.work]);
    expect(kinds(mismatches)).toEqual(['commit-unlisted', 'commit-unlisted']);
    expect(mismatches[0]?.detail).toContain(odd.slice(0, 7));
    expect(mismatches[1]?.detail).toContain(wrongRole.slice(0, 7));
  });

  it('(d) an approver record carrying AI trailers, unlisted or listed: trailer-forbidden', () => {
    const f = buildFixture();
    const unlisted = commit(f.root, `${AMEND_RECORD}\n${ATTRIBUTION}`);
    const unlistedMismatches = check(f, [f.work]);
    expect(kinds(unlistedMismatches)).toEqual(['trailer-forbidden']);
    expect(unlistedMismatches[0]?.detail).toContain(unlisted.slice(0, 7));
    const listedMismatches = check(f, [f.work, unlisted]);
    expect(kinds(listedMismatches)).toEqual(['trailer-forbidden']);
  });
});

describe('task-344 fix round — trailer-paragraph names a stray Co-Authored-By: or AI-Model: alone', () => {
  it('(c) a stray AI-Model: line in an earlier paragraph', () => {
    const f = buildFixture();
    const stray = commit(f.root, `docs: more notes\n\nAI-Model: claude-opus-5-5\n\n${ATTRIBUTION}`, { 'docs/notes.md': 'more\n' });
    const mismatches = check(f, [f.work, stray]);
    expect(kinds(mismatches)).toEqual(['trailer-paragraph']);
    expect(mismatches[0]?.detail).toContain(stray.slice(0, 7));
    expect(mismatches[0]?.detail).toContain('AI-Model:');
    expect(mismatches[0]?.detail).not.toContain('WingFoil-');
  });

  it('(c) a stray Co-Authored-By: line in an earlier paragraph', () => {
    const f = buildFixture();
    const stray = commit(f.root, `docs: more notes\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n\n${ATTRIBUTION}`, { 'docs/notes.md': 'more\n' });
    const mismatches = check(f, [f.work, stray]);
    expect(kinds(mismatches)).toEqual(['trailer-paragraph']);
    expect(mismatches[0]?.detail).toContain('Co-Authored-By:');
  });
});

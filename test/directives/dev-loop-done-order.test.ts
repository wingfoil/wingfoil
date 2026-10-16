/**
 * task-281 AC 5 (`bug-313`, approver ruling D6 2026-10-12) — `git-conventions` §1 says what `dev-loop.yaml`'s
 * `done` now declares: the approve, the finalize and the linked bugs' syncs on `task/<task-id>`, then the merge,
 * then the worktree removal — and no longer that `done` "still declares the merge before" the finalize.
 *
 * Live-directive suite (documentation AC, `testing` directive T1, red-first): pinned by quoted phrase over the
 * whitespace-normalized section, never by line, so a rewrap does not break it (`task-276` retrospective). Reads
 * this repository's working tree, as `test/directives/dev-loop-practice.test.ts` does; the workflow half is
 * `test/core/dev-loop-v2-0.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const GIT = readFileSync(join(ROOT, '.wingfoil', 'directives', 'custom', 'git-conventions.md'), 'utf-8');

/** The body of the `## <heading>…` section of `text`, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

/** `major.minor` of a `version:` value as one comparable number. */
function versionNumber(raw: string): number {
  const match = /^"?(\d+)\.(\d+)"?/.exec(raw);
  if (!match) throw new Error(`not a version: ${raw}`);
  return Number(match[1]) * 1000 + Number(match[2]);
}

describe('task-281 AC 5 (bug-313) — git-conventions §1 states the done order dev-loop.yaml declares', () => {
  const flat = section(GIT, '1. Branches').replace(/\s+/g, ' ');

  it("§1 says dev-loop.yaml's `done` declares the same order", () => {
    expect(flat).toContain("`dev-loop.yaml`'s `done` declares the same order");
  });

  it('§1 names the merge into the integration branch, then the worktree removal, after the on-branch steps (task-288)', () => {
    expect(flat).toContain('then `git.merge(to: integration_branch, ff: false)`, then `git.remove_worktree`');
    expect(flat).not.toContain('git.merge(to: main');
  });

  it('§1 says the merge carries the on-branch commits into the integration branch, not `main` (task-288 D6)', () => {
    expect(flat).toContain('the merge carries them into its integration branch');
    expect(flat).not.toContain('the merge carries them into `main`');
  });

  it('§1 no longer says `done` "still declares the merge before" the finalize', () => {
    expect(flat).not.toContain('still declares the merge before');
  });

  it('git-conventions is at 1.6 or later and its version line names task-281', () => {
    const header = GIT.slice(0, GIT.indexOf('\n---', 4));
    const version = /^version: "(\d+\.\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1006);
    expect(version![2]).toContain('task-281');
  });
});

describe('task-288 (dl-159 A1.8, approver ruling R6) — git-conventions 1.8 quotes the integration-branch merge', () => {
  it('git-conventions is at 1.8 or later and its 1.8 entry names task-288 and dl-159', () => {
    const header = GIT.slice(0, GIT.indexOf('\n---', 4));
    const version = /^version: "(\d+\.\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1008);
    // The 1.8 entry: the text before the first `(prev ` (the newest entry leads the line).
    const rest = version![2] ?? '';
    const newest = rest.slice(0, rest.indexOf('(prev ') < 0 ? undefined : rest.indexOf('(prev '));
    expect(newest).toMatch(/(^|\s)1\.8\s/);
    expect(newest).toContain('task-288');
    expect(newest).toContain('dl-159');
  });
});

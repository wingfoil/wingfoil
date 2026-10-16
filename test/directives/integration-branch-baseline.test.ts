/**
 * task-286 — the integration-branch baseline (`dl-159` Decision 1, Action A1.6; `git-conventions` §1).
 *
 * `doc-versioning` *The bump rule* takes the version on the branch's integration branch (`release/X.Y` or
 * `main`) as the baseline, and `testing`'s coverage non-regression compares against the integration branch's
 * figures. Red-first (task-286 design D1: the sentences are new).
 *
 * Pins are substrings of whitespace-flattened text (task-276); each absence check is in the same `it` as its
 * positive. `doc-versioning`'s *Gate* paragraph is task-287's and is pinned neither present nor absent. Version
 * pins are "≥" plus the version line naming the task (bug-314).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom');
const DOC_VERSIONING = readFileSync(join(DIR, 'doc-versioning.md'), 'utf-8');
const TESTING = readFileSync(join(DIR, 'testing.md'), 'utf-8');

const flat = (s: string): string => s.replace(/\s+/g, ' ');
const frontmatter = (text: string): string => text.slice(0, text.indexOf('\n---', 4));

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

describe('integration-branch baseline — dl-159 (task-286)', () => {
  it("AC 6: doc-versioning's bump rule takes the integration branch's version as the baseline", () => {
    const bump = flat(section(DOC_VERSIONING, 'The bump rule'));
    expect(bump).toContain("the version on the branch's integration branch, `release/X.Y` or `main`");
    expect(bump).toContain('`git-conventions` §1');
    expect(bump).not.toContain('The baseline is the version on `main`');
  });

  it('AC 7: doc-versioning declares no version (its Scope rule)', () => {
    expect(frontmatter(DOC_VERSIONING)).not.toMatch(/^version:/m);
  });

  it("AC 6: testing compares coverage non-regression against the integration branch's figures", () => {
    const text = flat(TESTING);
    expect(text).toContain("against the integration branch's figures");
    expect(text).not.toContain("against `main`'s figures");
  });

  it('AC 7: testing is at 1.3 or later and its version line names task-286 and dl-159', () => {
    const version = /^version: "(\d+)\.(\d+)"(.*)$/m.exec(frontmatter(TESTING));
    expect(version).not.toBeNull();
    expect(Number(version![1]) * 1000 + Number(version![2])).toBeGreaterThanOrEqual(1003);
    expect(version![3]).toContain('task-286');
    expect(version![3]).toContain('dl-159');
  });
});

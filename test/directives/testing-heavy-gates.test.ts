/**
 * task-349 AC 5 (`dl-170` Decision 4) — the `testing` directive's clause T5: a heavy gate runs attached and under
 * the machine-wide lock, never detached, and an agent is resumed only after checking that its worktree has no live
 * gate process.
 *
 * Pins are substrings of whitespace-flattened text (task-276); version pins are "≥" plus the version line naming
 * the task (bug-314).
 *
 * - red-first: the T5 clause in the WingFoil-specific section, the section naming `dl-170`, the version 1.4;
 * - characterization: `roles.yaml` binds `testing` to developer, qa and reviewer, the roles that run heavy gates
 *   and resume agents (unchanged by this task).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const WINGFOIL = join(__dirname, '..', '..', '.wingfoil');
const TESTING = readFileSync(join(WINGFOIL, 'directives', 'custom', 'testing.md'), 'utf-8');

const flat = (s: string): string => s.replace(/\s+/g, ' ');
const frontmatter = (text: string): string => text.slice(0, text.indexOf('\n---', 4));

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

describe('task-349 AC 5 — testing T5: heavy gates run attached and under the lock (dl-170 Decision 4)', () => {
  const specific = (): string => flat(section(TESTING, 'WingFoil-specific clauses'));

  it('red-first: the WingFoil-specific section carries the T5 clause, citing dl-170 Decision 4', () => {
    expect(specific()).toContain('T5 — Heavy gates run attached and under the lock');
    expect(specific()).toContain('`dl-170` Decision 4');
  });

  it('red-first: the section\'s intro names dl-170 beside dl-121 and dl-134', () => {
    const text = specific();
    const intro = text.slice(0, text.indexOf('- **T1'));
    expect(intro).toContain('dl-121');
    expect(intro).toContain('dl-134');
    expect(intro).toContain('dl-170');
  });

  it('red-first: T5 says a heavy gate is never detached and goes through the machine-wide lock', () => {
    const t5 = specific().slice(specific().indexOf('T5 — '));
    expect(t5).toContain('never detached');
    expect(t5).toContain('machine-wide lock');
  });

  it('red-first: T5 says an agent is resumed only after checking that its worktree has no live gate process', () => {
    const t5 = specific().slice(specific().indexOf('T5 — '));
    expect(t5).toContain('resumed only after checking that its worktree has no live gate process');
  });

  it('red-first: testing is at 1.4 or later and its version line names task-349, keeping task-286', () => {
    const version = /^version: "(\d+)\.(\d+)"(.*)$/m.exec(frontmatter(TESTING));
    expect(version).not.toBeNull();
    expect(Number(version![1]) * 1000 + Number(version![2])).toBeGreaterThanOrEqual(1004);
    expect(version![3]).toContain('task-349');
    expect(version![3]).toContain('task-286');
  });

  it('characterization: roles.yaml binds testing to developer, qa and reviewer', () => {
    const roles = yamlLoad(readFileSync(join(WINGFOIL, 'roles.yaml'), 'utf-8')) as { assignments: Record<string, string[]> };
    for (const role of ['developer', 'qa', 'reviewer']) {
      expect({ role, testing: roles.assignments[role]?.includes('testing') }).toEqual({ role, testing: true });
    }
  });
});

/**
 * task-256 — `git-conventions` states what `dl-152` (Q1 (A), Q2 (a), Q3 (i)) and `bug-240` ruled.
 *
 * Characterization of the directive text (documentation AC, `testing` directive): §1 carries the
 * `intake/` prefix with its fast-forward merge, the closed list of operations committed directly on
 * `main` and the "specific prefix wins" rule; §7 names the `team.agents` entry's `name <email>` as the
 * `Co-Authored-By:` identity and says hand sessions apply it from this task's merge.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEXT = readFileSync(join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom', 'git-conventions.md'), 'utf-8');

function section(heading: string): string {
  const start = TEXT.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`git-conventions has no section "## ${heading}"`);
  const end = TEXT.indexOf('\n## ', start + 1);
  return TEXT.slice(start, end < 0 ? undefined : end);
}

describe('git-conventions §1 — dl-152', () => {
  const s1 = section('1. Branches');

  it('cites dl-152', () => {
    expect(s1).toContain('dl-152');
  });

  it('lists `intake/` in the closed prefix table, merged by fast-forward', () => {
    expect(s1).toMatch(/\| `intake\/` +\|[^\n]*fast-forward/);
  });

  it('states the closed list of operations committed directly on `main`', () => {
    expect(s1).toContain('Commits made directly on `main`');
    for (const op of ['`approve`', '`reject`', '`assign`', '`sync`', '`amend`', '`docs(plans)`']) expect(s1).toContain(op);
  });

  it('states that the specific prefix wins over `design/`', () => {
    expect(s1).toContain('The specific prefix wins');
  });
});

describe('git-conventions §7 — bug-240', () => {
  const s7 = section('7. AI attribution');

  it("names the team.agents entry's name and email as the Co-Authored-By identity, with an AI-Model trailer", () => {
    expect(s7).toContain('Co-Authored-By: <team.agents name> <<team.agents email>>');
    expect(s7).toContain('AI-Model:');
  });

  it('defaults the email to the vendor address, allows an id-qualified machine account, and omits Co-Authored-By without an email (approver ruling F1)', () => {
    expect(s7).toContain('noreply@anthropic.com');
    expect(s7).toContain('<id>+<login>@users.noreply.github.com');
    expect(s7).toContain('omit the `Co-Authored-By:` line and keep `AI-Model:`');
  });

  it("applies to hand sessions from task-256's merge", () => {
    expect(s7).toContain('Hand sessions');
    expect(s7).toContain('task-256');
  });
});

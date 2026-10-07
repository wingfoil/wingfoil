/**
 * task-256 — `git-conventions` states what `dl-152` (Q1 (A), Q2 (a), Q3 (i)) and `bug-240` ruled.
 *
 * Characterization of the directive text (documentation AC, `testing` directive): §1 carries the
 * `intake/` prefix with its fast-forward merge, the closed list of operations committed directly on
 * `main` and the "specific prefix wins" rule; §7 names the `team.agents` entry's `name <email>` as the
 * `Co-Authored-By:` identity and says hand sessions apply it from this task's merge.
 *
 * task-260 — §7 states `dl-158`'s two rulings: Rule 1 (a), which entry signs, and Rule 2 (ii), the signing
 * entry declares an email; the task-256 sentence that dropped `Co-Authored-By:` without an email is gone.
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

  it('defaults the email to the vendor address and allows an id-qualified machine account (approver ruling F1)', () => {
    expect(s7).toContain('noreply@anthropic.com');
    expect(s7).toContain('<id>+<login>@users.noreply.github.com');
  });

  it("applies to hand sessions from task-256's merge", () => {
    expect(s7).toContain('Hand sessions');
    expect(s7).toContain('task-256');
  });
});

describe('git-conventions §7 — dl-158 (task-260)', () => {
  const s7 = section('7. AI attribution');
  const header = TEXT.slice(0, TEXT.indexOf('\n---', 4));

  it('cites dl-158 in the heading and in the sources list', () => {
    expect(s7.split('\n')[1]).toContain('`dl-158` Rule 1 (a), Rule 2 (ii)');
    expect(TEXT).toMatch(/^- `dl-158-[^`]+`\n {2}— which `team.agents` entry signs/m);
  });

  it('states Rule 1 (a): agent execute launches the signing entry; a hand session uses its own name, else the first entry, said in the body', () => {
    expect(s7).toContain('**Which entry signs** (`dl-158` Rule 1 (a))');
    expect(s7).toContain('The entry `agent execute` launches signs');
    expect(s7).toContain("the entry whose `name` is\n  the agent's own");
    expect(s7).toContain('it signs with the first entry and says so in the commit\n  body');
  });

  it('states Rule 2 (ii): the signing entry declares an email, dna.yaml refuses an adapter entry without one', () => {
    expect(s7).toContain('**The signing entry declares an email** (`dl-158` Rule 2 (ii))');
    expect(s7).toContain('refuses an entry that declares an `adapter` but no `email`');
    expect(s7).toContain('--entry-email <address>');
  });

  it('drops the task-256 sentences dl-158 replaced', () => {
    expect(s7).not.toContain('omit the `Co-Authored-By:` line');
    expect(s7).not.toContain('it is the entry the running agent executes as');
  });

  it('states the placeholder identities dna.yaml refuses (bug-261)', () => {
    expect(s7).toContain('an empty or blank `name`, and an `email`\n  on an RFC 2606 reserved top-level domain');
  });

  it('bumps the directive version to 1.2', () => {
    expect(header).toContain('version: "1.2"');
  });
});

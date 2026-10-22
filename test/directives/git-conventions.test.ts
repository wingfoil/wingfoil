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

  it('states the identities the audit rejects that dna.yaml refuses (bug-261)', () => {
    expect(s7).toContain('an empty or blank `name`, and an `email`\n  on an RFC 2606 reserved top-level domain');
    expect(s7).toContain("git's guessed `.(none)` domain");
  });

  it('bumps the directive version to 1.2 or later (1.3 since task-205, §2)', () => {
    const version = /^version: "(\d+)\.(\d+)"/m.exec(header);
    expect(version).not.toBeNull();
    expect(Number(version![1]) * 1000 + Number(version![2])).toBeGreaterThanOrEqual(1002);
  });
});

/**
 * task-286 — `git-conventions` states `dl-159`'s maintenance line `release/X.Y` (Decision 1–5, Action A1.6):
 * the `release/` prefix, the integration branch, the merge forward (`dl-092` Action 3's parallel-release rule),
 * sync and tags per line, push-the-add on both lines, the release worktree; §9's governance range names
 * `release/X.Y` (approver ruling D3, same class). All red-first (task-286 design D1).
 *
 * Every pin is a substring of whitespace-flattened text, never a raw line (task-276: a phrase pinned across a
 * line break made an absence check pass vacuously); each absence check sits in the same `it` as its positive.
 * Version pins are "≥" plus the version line naming the task (bug-314: task-288 bumps to 1.8). §1's on-branch
 * paragraph quoting `dev-loop.yaml`'s `done` is task-288's and is not pinned here.
 */
describe('git-conventions §1–§3, §6 — dl-159 (task-286)', () => {
  const flat = (s: string): string => s.replace(/\s+/g, ' ');
  const s1 = section('1. Branches');
  const f1 = flat(s1);
  const header = TEXT.slice(0, TEXT.indexOf('\n---', 4));

  it('AC 1: §1 cites dl-159 and the closed prefix table gains the `release/` row, cut lazily, long-lived', () => {
    expect(s1.split('\n')[1]).toContain('`dl-159`');
    const row = /^\s*\| `release\/` +\|.*$/m.exec(s1);
    expect(row).not.toBeNull();
    const fr = flat(row![0]);
    for (const p of ['`release/X.Y`', 'cut lazily', "closes the minor's retrospective", '`vX.Y.0`', 'never deleted while the line is supported']) {
      expect(fr).toContain(p);
    }
    const prefixes = [...s1.matchAll(/^\s*\| `([^`]+)` +\|/gm)].map((m) => m[1]).sort();
    expect(prefixes).toEqual(['backlog/', 'design/', 'docs/', 'fix/', 'ingest/', 'intake/', 'qa/', 'release/', 'task/']);
  });

  it('AC 1: §1 states the integration branch; task and phase branches are cut from and merge --no-ff into it', () => {
    expect(f1).toContain('`release/X.Y` for work on a patch of the released minor `X.Y`, `main` otherwise');
    expect(f1).toContain('`task/<task-id>`, cut from its integration branch');
    expect(f1).toContain('merge into their integration branch with `git merge --no-ff`');
    expect(f1).not.toContain('`task/<task-id>`, cut from `main`');
    expect(f1).not.toContain('Both merge into `main` with');
  });

  it("AC 2: §1 states the merge-forward rule as dl-092 Action 3's parallel-release rule, dl-159 superseding option (a)", () => {
    expect(f1).toContain('the parallel-release rule `dl-092` Action 3 asked for');
    expect(f1).toContain("`dl-159` supersedes `dl-092`'s option (a)");
    expect(f1).toContain('lands on the oldest affected line first');
    expect(f1).toContain('merged into `main` with `git merge --no-ff`');
  });

  it('AC 2: §1 states the prohibitions between lines', () => {
    expect(f1).toContain('Never cherry-pick or rebase between lines');
    expect(f1).toContain('`main` is never merged into `release/X.Y`');
    expect(f1).toContain('changes state only on the line that owns its fix');
  });

  it("AC 2: §1 names the version-bearing files of the merge-forward conflict and keeps main's values", () => {
    for (const p of ['`package.json` `version`', '`server.json`', '`CHANGELOG.md`', 'the `dl-095` pin']) expect(f1).toContain(p);
    expect(f1).toContain("keeps `main`'s values");
    expect(f1).toContain('recorded in the merge commit');
  });

  it('AC 3: §2 syncs with the integration branch, never with the other line; the rebase ban stays', () => {
    const f2 = flat(section('2. Staying current'));
    expect(f2).toContain('`git merge --no-edit <integration branch>`');
    expect(f2).toContain('`release/X.Y` on the maintenance line');
    expect(f2).toContain('never from the other line');
    expect(f2).toContain('merges its integration branch at two points');
    expect(f2).toContain('Never rebase a branch that carries');
    expect(f2).not.toContain('`git merge --no-edit main`');
  });

  it('AC 4: §3 puts a minor tag on pushed main and a patch tag on pushed release/X.Y, never on a phase branch', () => {
    const f3 = flat(section('3. Tags'));
    expect(f3).toContain('A minor tag `vX.Y.0` is created on `main`');
    expect(f3).toContain('after `main` has been pushed to `origin`');
    expect(f3).toContain('A patch tag `vX.Y.Z` (Z ≥ 1) is created on `release/X.Y`');
    expect(f3).toContain('after `release/X.Y` has been pushed to `origin`');
    expect(f3).toContain('never created on a phase branch');
    for (const c of ['`dl-074', '`dl-159`', '`task-267`', '`spec-015` §4']) expect(f3).toContain(c);
    expect(f3).not.toContain('A version tag is created on `main`');
  });

  it('AC 5: §6.2 makes pushing the add commit mandatory on both lines', () => {
    const f6 = flat(section('6. '));
    expect(f6).toContain('Push the `add` commit at once');
    expect(f6).toContain('mandatory on both lines');
    expect(f6).toContain('`dl-159`');
  });

  it('AC 5: §1 states the layout — one clone, a long-lived worktree for the maintenance line, never a second clone', () => {
    expect(f1).toContain('long-lived worktree');
    expect(f1).toContain('`.wf2-wt/release-0.3`');
    expect(f1).toContain('never a second clone');
  });

  it('D3: §9 names release/X.Y in the governance range and keeps its §4 scope', () => {
    const f9 = flat(section('9. '));
    expect(f9).toContain('`release/X.Y`');
    expect(f9).toContain("§4's `wf()` subjects and brackets");
  });

  it('AC 7: the version is 1.7 or later, its line names task-286 and dl-159, the Date is the edit date or later', () => {
    const version = /^version: "(\d+)\.(\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(Number(version![1]) * 1000 + Number(version![2])).toBeGreaterThanOrEqual(1007);
    expect(version![3]).toContain('task-286');
    expect(version![3]).toContain('dl-159');
    const date = /\*\*Date:\*\* (\d{4}-\d\d-\d\d)/.exec(TEXT);
    expect(date).not.toBeNull();
    expect(date?.[1]).toBeDefined();
    expect((date?.[1] ?? '') >= '2026-10-16').toBe(true);
  });
});

/**
 * task-291 (`dl-185` C3 (i)) — §9 documents the pre-push hook's base rule (the line the branch was cut from) and
 * says the hook is a local convenience while CI stays the enforcing check. Prose pinned as substrings of
 * whitespace-flattened text (task-276), the absence beside its positive; the version pin is "≥ 2.0" plus the
 * version line naming task-291 (bug-314), robust to the re-bump after task-290's merge (design D-B).
 * Red-first: the base rule, the `dl-185` citation and "CI stays the enforcing check"; characterization: the two
 * sentences §9 already carries ("local convenience", "CI is the enforcement point").
 */
describe('git-conventions §9 — dl-185 C3 (task-291)', () => {
  const flat = (s: string): string => s.replace(/\s+/g, ' ');
  const f9 = flat(section('9. Checks on pushed commits'));
  const header = TEXT.slice(0, TEXT.indexOf('\n---', 4));

  it('AC 2 (characterization): the hook is a local convenience and CI is the enforcement point', () => {
    expect(f9).toContain('The pre-push hook is a local convenience');
    expect(f9).toContain('CI is the enforcement point');
  });

  it('AC 2 (red-first): §9 states the base rule — the line the branch was cut from — citing dl-185 C3 (i)', () => {
    expect(f9).toContain('`dl-185` C3 (i)');
    expect(f9).toContain('the line the branch was cut from');
    expect(f9).toContain(
      '`origin/main` for a branch of `main`, `origin/release/X.Y` for a branch of a patch line, and `origin/main` for a new `release/X.Y` itself',
    );
    expect(f9).not.toContain('merge-base HEAD origin/main');
  });

  it('AC 2 (red-first): §9 says CI stays the enforcing check', () => {
    expect(f9).toContain('CI stays the enforcing check');
  });

  it('AC 2: the version is 2.0 or later and its line names task-291', () => {
    const version = /^version: "(\d+)\.(\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(Number(version![1]) * 1000 + Number(version![2])).toBeGreaterThanOrEqual(2000);
    expect(version![3]).toContain('task-291');
  });
});

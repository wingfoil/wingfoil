/**
 * task-276 — `git-conventions`, `code-review` and `roles.yaml` say what the `dev-loop` practice does (approver rulings
 * 2026-10-10, items 2 and 3; `task-197`'s inventory rows 4, 6, 8, 12 and 21; `dl-102` §1 (a)).
 *
 * Live-directive suite (documentation ACs, `testing` directive T1): each rule is pinned by its heading or by a quoted
 * phrase, not by its whole wording. It checks that:
 * - `git-conventions` §1's on-`main` item 1 excludes a `dev-loop` task's own `approve`/`reject`, and a new sentence
 *   puts those and the `finalize` on `task/<id>` before the merge;
 * - §1 states one worktree per task and no task commit in the shared working tree (`git branch --show-current`),
 *   §4 the code-commit subjects, each citing the plan heading `task-197`'s inventory names — and that heading exists in
 *   that plan, so a renamed heading fails here rather than leaving a dangling citation;
 * - §1's `ingest/` row names a `vision-change` run;
 * - §9 no longer says the governance check reads every subject of §4, which now also holds the code-commit subjects
 *   it never reads (same-class fix);
 * - `code-review` states the same-class rule of row 21;
 * - `roles.yaml` binds `traceability` to `tech-lead`, through `directives list --role tech-lead`;
 * - both versioned files record the bump with a history entry naming this task (≥, never an exact version: bug-314).
 *
 * Reads this repository's working tree, as the other live-configuration suites do.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreOperation } from '../../src/core/registry';

const ROOT = join(__dirname, '..', '..');
const DIRECTIVES = join(ROOT, '.wingfoil', 'directives', 'custom');
const GIT = readFileSync(join(DIRECTIVES, 'git-conventions.md'), 'utf-8');
const REVIEW = readFileSync(join(DIRECTIVES, 'code-review.md'), 'utf-8');
const ROLES_TEXT = readFileSync(join(ROOT, '.wingfoil', 'roles.yaml'), 'utf-8');

const PLAN_V02 = 'docs/05_plans/rl-v1/rel-v0.2/dev-loop-rel-v0.2-plan.md';
const PLAN_V022 = 'docs/05_plans/rl-v1/rel-v0.2.2/dev-loop-rel-v0.2.2-plan.md';

/** The body of the `## <heading>…` section of `text`, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

/** The bullet (`- …` up to the next bullet or blank line at its indentation) that contains `marker`. */
function bullet(text: string, marker: string): string {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`no bullet containing "${marker}"`);
  const start = text.lastIndexOf('\n- ', at) + 1;
  const next = /\n(- |\n)/g;
  next.lastIndex = at;
  const end = next.exec(text);
  return text.slice(start, end ? end.index : undefined);
}

/** Whether the plan at `path` has a heading line containing `heading`. */
function planHasHeading(path: string, heading: string): boolean {
  return readFileSync(join(ROOT, path), 'utf-8')
    .split('\n')
    .some((line) => /^#{2,4} /.test(line) && line.includes(heading));
}

/** `major.minor` of a `version:` value as one comparable number. */
function versionNumber(raw: string): number {
  const match = /^"?(\d+)\.(\d+)"?/.exec(raw);
  if (!match) throw new Error(`not a version: ${raw}`);
  return Number(match[1]) * 1000 + Number(match[2]);
}

describe('git-conventions §1 — commits made directly on main (task-197 row 6)', () => {
  const s1 = section(GIT, '1. Branches');
  const list = s1.slice(s1.indexOf('**Commits made directly on `main`**'));
  /** `list` with every run of whitespace as one space, so a pinned sentence survives a rewrap (review fix). */
  const flat = list.replace(/\s+/g, ' ');

  it("item 1 is the approver's approve/reject outside a dev-loop task's run, with the three examples", () => {
    const item1 = /\n {2}1\. ([\s\S]*?)\n {2}2\. /.exec(list);
    expect(item1).not.toBeNull();
    const text = item1![1];
    expect(text).toContain("that are not part of a `dev-loop` task's run");
    expect(text).toContain('`[open → triaged]`');
    expect(text).toContain('`[pending → backlog]`');
    expect(text).toContain("a decision-log's ratification");
  });

  it("states that a dev-loop task's approve, reject and finalize are committed on task/<id> before the merge", () => {
    expect(flat).toContain(
      "A `dev-loop` task's `approve`, `reject` and `finalize` are committed on `task/<task-id>`, before the merge, so the merge carries them",
    );
  });

  it('says the list may be committed on main, not that it must (review fix, dl-152 Q1 (A))', () => {
    expect(flat).toContain('This **closed list** of operations may be committed on `main` itself');
  });

  // Review correction (2026-10-11): the red-era test pinned that §1 did not rule on `finalize`, citing dl-079 as
  // undecided. dl-079 is `ready` (approve 3262ad92, option (A)): `finalize` is a declared verb (spec-008 §2).
  it('points at bug-313 for the workflow half and states finalize is a declared verb (dl-079 (A), spec-008 §2)', () => {
    expect(list).toContain('`bug-313');
    expect(flat).toContain('`finalize` is a declared verb (`dl-079-wf-commit-verbs-outside-the-declared-grammar` option (A), `spec-008-cli-grammar` §2)');
    expect(flat).not.toContain('is not decided here: that is `dl-079');
    expect(GIT.replace(/\s+/g, ' ')).not.toContain('Which verbs beyond the declared five are legal is not decided here');
  });
});

describe('git-conventions — the standing rules of task-197 rows 4, 8 and 12', () => {
  const s1 = section(GIT, '1. Branches');
  const s4 = section(GIT, '4. ');

  it('row 4: one worktree per dev-loop task, created at start, removed after the merge; cites its plan heading', () => {
    const rule = bullet(s1, '**One worktree per task**');
    expect(rule).toContain('created at `start` and removed after the merge, before the branch is deleted');
    expect(rule).toContain('`dl-014` G2');
    expect(rule).toContain('`dev-loop-rel-v0.2-plan` §2 *Branch, worktree & merge*');
    expect(planHasHeading(PLAN_V02, 'Branch, worktree & merge')).toBe(true);
  });

  it('row 8: no task commit in the shared working tree; git branch --show-current before every commit; cites its plan heading', () => {
    const rule = bullet(s1, '**No task commit in the shared working tree**');
    expect(rule).toContain('`git branch --show-current`');
    expect(rule).toContain('before every commit');
    expect(rule).toContain('`dev-loop-rel-v0.2.2-plan` §1 *Per-task contract*');
    expect(planHasHeading(PLAN_V022, '1. Per-task contract')).toBe(true);
  });

  it('row 12: code commits on a task branch take test|feat|fix|refactor|docs({module}): {task.id} — <summary>; cites its plan heading', () => {
    expect(s4).toContain('`test|feat|fix|refactor|docs({module}): {task.id} — <summary>`');
    expect(s4).toContain('`dev-loop-rel-v0.2-plan` §2 *Commits*');
    expect(planHasHeading(PLAN_V02, 'Commits')).toBe(true);
  });

  it("§9 reads §4's wf() subjects only, since §4 now also holds code-commit subjects the check does not read", () => {
    const s9 = section(GIT, '9. ');
    expect(s9).toContain("§4's `wf()` subjects and brackets");
    expect(s9).not.toContain("checks §4's subjects and brackets");
  });
});

describe('git-conventions §1 — the ingest/ prefix', () => {
  it('the ingest/ row of the prefix table also names a vision-change run', () => {
    const row = section(GIT, '1. Branches')
      .split('\n')
      .find((line) => line.startsWith('  | `ingest/`'));
    expect(row).toBeDefined();
    expect(row).toContain('`vision-change`');
    expect(row).toContain('never `design/`');
  });
});

describe('code-review — a same-class stale description (task-197 row 21)', () => {
  const rule = (): string => section(REVIEW, 'Same-class findings');

  it('is fixed in-task before approval, in a file the task touched, or filed as an element; never left in notes alone', () => {
    const s = rule();
    expect(s).toContain('is fixed in the task before approval');
    expect(s).toContain('in every file the task touched');
    expect(s).toContain('files it as an element');
    expect(s).toContain('never left in the Execution Notes alone');
  });

  it('cites its plan heading, which exists', () => {
    expect(rule()).toContain('`dev-loop-rel-v0.2.2-plan` *Execution Notes (close-out)*');
    expect(planHasHeading(PLAN_V022, 'Execution Notes (close-out')).toBe(true);
  });
});

function directivesList(): CoreOperation {
  const operation = CORE_MODULES.find((entry) => entry.name === 'directives')?.operations['directivesList'];
  if (!operation) throw new Error('no `directivesList` operation registered in the `directives` module');
  return operation;
}

describe('roles.yaml — tech-lead loads traceability (task-197 review follow-up (d))', () => {
  // Review fix (2026-10-11): the two directives' intros name every role roles.yaml binds them to.
  it('the intros of traceability and code-review name tech leads', () => {
    const trace = readFileSync(join(DIRECTIVES, 'traceability.md'), 'utf-8');
    expect(trace.replace(/\s+/g, ' ')).toContain('binds it to reviewers, architects, product owners and tech leads');
    expect(REVIEW).toContain('Applies to reviewers and tech leads (`roles.yaml`)');
  });

  it('assignments.tech-lead lists traceability', () => {
    const roles = load(ROLES_TEXT) as { assignments: Record<string, string[]> };
    expect(roles.assignments['tech-lead']).toContain('traceability');
  });

  it('directives list --role tech-lead lists traceability as a role binding, not a global one', async () => {
    const result = await directivesList().fn({ root: ROOT, options: { role: 'tech-lead' } });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    const entries = (result.value as { entries: { path: string; frontmatter: { id: string }; global: boolean }[] }).entries;
    expect(entries.filter((e) => e.frontmatter.id === 'traceability').map((e) => [e.path, e.global])).toEqual([
      ['directives/custom/traceability.md', false],
    ]);
  });
});

describe('versions — one bump each, with a history entry naming task-276', () => {
  it('roles.yaml is at 1.7 or later and its header names task-276 beside the tech-lead binding', () => {
    const version = /^version: (\S+)/m.exec(ROLES_TEXT);
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1007);
    expect(ROLES_TEXT).toMatch(/^# .*`tech-lead`.*task-276|^# .*task-276.*`tech-lead`/m);
  });

  it('git-conventions is at 1.5 or later and its version line names task-276', () => {
    const header = GIT.slice(0, GIT.indexOf('\n---', 4));
    const version = /^version: "(\d+\.\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(versionNumber(version![1] ?? '')).toBeGreaterThanOrEqual(1005);
    expect(version![2]).toContain('task-276');
  });
});

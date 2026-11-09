/**
 * task-344 (P4.12; C-19 of the v0.4 planning feedback, `bug-474` in part; approver rulings D1–D7 (a), 2026-11-09) —
 * `scripts/check-phase-report.cjs`, the check of a delegated phase report against git and the heavy-gate trace, and
 * of a phase plan's `parent:` against the phases of its workflow.
 *
 * - AC 1 (red-first): `report` — a clean report gives no mismatch (exit 0, a summary line); each of the sixteen report
 *   kinds is produced by one case, the rest of the report clean, its detail naming the offending sha, path or gate;
 *   `main` prints one `<kind>: …` line per mismatch in `MISMATCH_KINDS` order, then a summary (exit 1); a malformed
 *   report or a usage error is exit 2 with one stderr line.
 * - AC 2 (red-first): `plans` — the four `parent:` values `bug-474` names (frontmatter copied from
 *   `git show 5ffc8f27c:<path>`) are flagged, sorted by path; an unknown workflow and a parent with no `.` are flagged,
 *   an empty parent (an instance) is not; `report` applies the rule to the plans its range changes only (D6).
 * - AC 3 (red-first + characterization): this suite is the unit tests; the script runs in no CI gate (`package.json`
 *   scripts, `.github/workflows/*.yml`, `.wingfoil/workflows/bindings.yaml`), each absence with a positive control.
 * - AC 4 (D5 (a), the module-doc half): the example report between the `BEGIN EXAMPLE REPORT` and
 *   `END EXAMPLE REPORT` lines of the script's leading comment reads, every keyword once; every mismatch kind is
 *   named in that comment.
 * - D4 (a): `scripts/check-governance.cjs` exports `trailerKeysOutsideFinalParagraph`.
 *
 * Fixtures: every repository is a `mkdtemp` scratch repository holding a copy of this repository's `.wingfoil/`,
 * git run through `test/storage/helpers/git-fixture.ts` (no global or system config); every trace is a temp file
 * outside it. Commit messages are copied from real commits of this repository (`d69286802`, `a95314a0a`,
 * `f1d926922`, `deb70aa9b`); trace lines are copied from the machine's `heavy-gate.trace.jsonl` and re-keyed to the
 * scratch worktree. No wall clock: every `since` is a fixed instant.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { trailerKeysOutsideFinalParagraph } from '../../scripts/check-governance.cjs';
import { MISMATCH_KINDS, ReportFormatError, checkPlanParents, checkReport, main, parseReport } from '../../scripts/check-phase-report.cjs';
import type { Mismatch } from '../../scripts/check-phase-report.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

jest.setTimeout(60_000);

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-phase-report.cjs');

const BRANCH = 'task/task-9-x';
const ATTRIBUTION = 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5';

/** `d69286802`: a hand commit with the `git-conventions` §7 paragraph. */
const HAND_COMMIT =
  'wf(task): start task-344-check-a-delegated-phase-report-against-git-and-a-phase-plan-s-parent-against-its-workflow-s-phases [backlog → in-progress]\n\n' +
  ATTRIBUTION;

/** `a95314a0a`: a tool commit whose `Co-Authored-By:` names the runtime model, not a `team.agents` entry. */
const OPUS_IDENTITY_COMMIT =
  'wf(plan): submit release-health-rel-v0.3.2-plan\n\n' +
  "Carries content: frontmatter field 'element', frontmatter field 'parent', frontmatter field 'release', frontmatter field 'version', the body\n\n" +
  'WingFoil-Version: 0.3.2 (14768b505cb99e95251e8039d73adf675886b345)\n' +
  'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' +
  'AI-Model: claude-opus-5-5';

/** `a95314a0a` with the right identity, the attribution written as a separate paragraph (the `bug-236` shape). */
const SEPARATE_PARAGRAPH_COMMIT =
  'wf(plan): submit release-health-rel-v0.3.2-plan\n\n' +
  "Carries content: frontmatter field 'element', frontmatter field 'parent', frontmatter field 'release', frontmatter field 'version', the body\n\n" +
  'WingFoil-Version: 0.3.2 (14768b505cb99e95251e8039d73adf675886b345)\n\n' +
  ATTRIBUTION;

/** `f1d926922`: an approve, as the approver writes it (no attribution). */
const APPROVE_COMMIT =
  'wf(task): approve task-347-amend-release-planning.yaml-for-dl-191-s-bug-sweep-and-low-bug-reservation-and-declare-collect-feedback-in-it [in-review → approved]\n\n' +
  'Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\n' +
  "Reason: Approve task-347: release-planning 2.5 declares collect-feedback after advance-pinned-build, the new assign-bugs phase after triage-bugs per ruling D1 (b), and the low-bug reservation in define-scope, meeting AC1-AC5 as ruled at the design gate; the pinned build reads the change with an unchanged frontier and no rekey or finalize owed, the review's one finding (assign-bugs now states dl-206's patch eligibility) is fixed in prose, its follow-up is filed as bug-519, and the full suite passed 10754 of 10754.\n\n" +
  'WingFoil-Version: 0.3.2 (4eccd1aece1e0a0bc4752ed38d05d41b25944c42)';

/** `deb70aa9b`: a design-gate record, the approver's act (exempt from `commit-unlisted`). */
const DESIGN_RECORD =
  'workflow: finalize sw-life-cycle-1-plan dev-loop.design@task:task-349-cap-the-heavy-test-gates-across-worktrees-with-one-machine-wide-lock-and-a-load-threshold-dl-170\n\n' +
  'Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\n' +
  'Reason: Approve the design of task-349 as recommended: D1 (a) cap fixed at 1, D2 (a) all six heavy gates, D3 (b) the load wait is skipped when CI=true, the lock is kept, D4 (a) gate.slot-free unbound on green, refactor and review, D5 lock and trace under the per-user tmpdir as designed, D6 a follow-up decision-log for the maximum hold time and FIFO order, D7 accepted, D8 (a) identity-free global config with NOSYSTEM and an empty XDG_CONFIG_HOME.\n\n' +
  'WingFoil-Phase: dev-loop.design completed\n' +
  'WingFoil-Instance: sw-life-cycle-1-plan\n' +
  'WingFoil-Element: task:task-349-cap-the-heavy-test-gates-across-worktrees-with-one-machine-wide-lock-and-a-load-threshold-dl-170\n' +
  'WingFoil-Version: 0.3.2 (67e35dc34bb168390e853b8bbcd04ccceb37153a)';

// Trace lines copied from the machine's heavy-gate trace (`/tmp/wingfoil-heavy-gate-<uid>/heavy-gate.trace.jsonl`).
const TRACE_TEST_ACQUIRE = '{"v":1,"event":"acquire","gate":"test","pid":2772503,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-355","start":"2026-11-09T09:19:57.780Z","waited_ms":1}';
const TRACE_TEST_RELEASE = '{"v":1,"event":"release","gate":"test","pid":2772503,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-355","start":"2026-11-09T09:19:57.780Z","end":"2026-11-09T09:38:35.623Z","status":0}';
const TRACE_COVERAGE_ACQUIRE = '{"v":1,"event":"acquire","gate":"coverage","pid":2662661,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-357","start":"2026-11-07T12:31:03.716Z","waited_ms":1}';
const TRACE_COVERAGE_RELEASE = '{"v":1,"event":"release","gate":"coverage","pid":2662661,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-357","start":"2026-11-07T12:31:03.716Z","end":"2026-11-07T12:52:27.578Z","status":0}';
const TRACE_FAILED_ACQUIRE = '{"v":1,"event":"acquire","gate":"test","pid":2298330,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-354","start":"2026-11-07T12:01:16.829Z","waited_ms":2}';
const TRACE_FAILED_RELEASE = '{"v":1,"event":"release","gate":"test","pid":2298330,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-354","start":"2026-11-07T12:01:16.829Z","end":"2026-11-07T12:16:21.505Z","status":1}';
const TRACE_BUILD_ACQUIRE = '{"v":1,"event":"acquire","gate":"build","pid":2672278,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-344","start":"2026-11-09T09:08:47.785Z","waited_ms":0}';
const TRACE_BUILD_RELEASE = '{"v":1,"event":"release","gate":"build","pid":2672278,"worktree":"/home/robypomper/Workspaces/.wf2-wt/task-344","start":"2026-11-09T09:08:47.785Z","end":"2026-11-09T09:08:51.435Z","status":0}';
/** A last line cut by a concurrent writer: skipped, never a failure. */
const TRACE_CUT_LINE = '{"v":1,"event":"acq';

/** Before every hold above. */
const SINCE = '2026-11-07T00:00:00.000Z';

/** `line` with its `worktree` (and any `patch` key) replaced, keys kept in their order. */
function rekey(line: string, worktree: string, patch: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...(JSON.parse(line) as Record<string, unknown>), worktree, ...patch });
}

// Plan frontmatter copied from `git show 5ffc8f27c:<path>` (the four bug-474 plans) and from `HEAD` (the clean one).
const STALE_PLANS: readonly (readonly [string, string])[] = [
  [
    'docs/05_plans/rl-v1/rel-v0.3/release-submit-rel-v0.3-plan.md',
    `---
id: release-submit-rel-v0.3-plan           # auto-generated by wingfoil
type: plan
title: "Release-submit — v0.3 (pre-release checks on the candidate 2153f0f5, enter releasing, stop at the approver gate)"              # REQUIRED — e.g. "Dev-loop — rel-v0.1"
status: done            # auto-set by wingfoil; memory.submit → active
version: "1.0"         # optional — plan version
workflow: "release-submit"           # REQUIRED — the workflow this plan executes, e.g. "dev-loop"
phase: "rel-v0.3"              # REQUIRED — the phase/scope this plan covers, e.g. "rel-v0.1" or "retrospective"
element: "minor-v0.3"  # optional — the Memory element this phase iterates (e.g. a release id)
parent: "release-cycle.release-submit" # optional — empty for a started workflow (an instance, \`wingfoil workflow start\`); "<workflow>.<phase>" for the plan of one phase (spec-017 §3.1)
release: "v0.3"      # optional — target release, e.g. "v0.1"
tmpl_version: 261010   # Orignal template version
---
`,
  ],
  [
    'docs/05_plans/rl-v1/rel-v0.3/release-publishing-rel-v0.3-plan.md',
    `---
id: release-publishing-rel-v0.3-plan           # auto-generated by wingfoil
type: plan
title: "Release-publishing — v0.3 (release commit 0.3.0, staging rehearsal, tag v0.3.0, stage on npm, approve, mark released)"              # REQUIRED — e.g. "Dev-loop — rel-v0.1"
status: done            # auto-set by wingfoil; memory.submit → active
version: "1.0"         # optional — plan version
workflow: "release-publishing"           # REQUIRED — the workflow this plan executes, e.g. "dev-loop"
phase: "rel-v0.3"              # REQUIRED — the phase/scope this plan covers, e.g. "rel-v0.1" or "retrospective"
element: "minor-v0.3"  # optional — the Memory element this phase iterates (e.g. a release id)
parent: "release-cycle.release-publishing" # optional — empty for a started workflow (an instance, \`wingfoil workflow start\`); "<workflow>.<phase>" for the plan of one phase (spec-017 §3.1)
release: "v0.3"      # optional — target release, e.g. "v0.1"
tmpl_version: 261010   # Orignal template version
---
`,
  ],
  [
    'docs/05_plans/rl-v1/rel-v0.3.1/release-submit-rel-v0.3.1-plan.md',
    `---
id: release-submit-rel-v0.3.1-plan           # auto-generated by wingfoil
type: plan
title: "Release-submit — v0.3.1 (pre-release checks on the candidate d3826aab, enter releasing, stop at the approver gate)"              # REQUIRED — e.g. "Dev-loop — rel-v0.1"
status: done          # auto-set by wingfoil; memory.submit → active
version: "1.0"         # optional — plan version
workflow: "release-submit"           # REQUIRED — the workflow this plan executes, e.g. "dev-loop"
phase: "rel-v0.3.1"              # REQUIRED — the phase/scope this plan covers, e.g. "rel-v0.1" or "retrospective"
element: "patch-v0.3.1"  # optional — the Memory element this phase iterates (e.g. a release id)
parent: "release-cycle.release-submit" # optional — empty for a started workflow (an instance, \`wingfoil workflow start\`); "<workflow>.<phase>" for the plan of one phase (spec-017 §3.1)
release: "v0.3.1"      # optional — target release, e.g. "v0.1"
tmpl_version: 261010   # Orignal template version
---
`,
  ],
  [
    'docs/05_plans/rl-v1/rel-v0.3.1/release-publishing-rel-v0.3.1-plan.md',
    `---
id: release-publishing-rel-v0.3.1-plan           # auto-generated by wingfoil
type: plan
title: "Release-publishing — v0.3.1 (release commit 0.3.1, staging rehearsal, tag v0.3.1 on release/0.3, stage on npm, approve, mark released, merge forward)"              # REQUIRED — e.g. "Dev-loop — rel-v0.1"
status: done          # auto-set by wingfoil; memory.submit → active
version: "1.0"         # optional — plan version
workflow: "release-publishing"           # REQUIRED — the workflow this plan executes, e.g. "dev-loop"
phase: "rel-v0.3.1"              # REQUIRED — the phase/scope this plan covers, e.g. "rel-v0.1" or "retrospective"
element: "patch-v0.3.1"  # optional — the Memory element this phase iterates (e.g. a release id)
parent: "release-cycle.release-publishing" # optional — empty for a started workflow (an instance, \`wingfoil workflow start\`); "<workflow>.<phase>" for the plan of one phase (spec-017 §3.1)
release: "v0.3.1"      # optional — target release, e.g. "v0.1"
tmpl_version: 261010   # Orignal template version
---
`,
  ],
];

const CLEAN_PLAN_PATH = 'docs/05_plans/rl-v1/rel-v0.3.2/release-submit-rel-v0.3.2-plan.md';

/** The clean plan's frontmatter at `HEAD`, with `id` and `parent` replaceable for the odd-parent cases. */
function cleanPlan(id = 'release-submit-rel-v0.3.2-plan', parent = 'release-cycle.submit'): string {
  return `---
id: ${id}           # auto-generated by wingfoil
type: plan
title: "Release-submit — v0.3.2 (pre-release checks on the candidate, enter releasing, the approver's gate)"              # REQUIRED — e.g. "Dev-loop — rel-v0.1"
status: done            # auto-set by wingfoil; memory.submit → active
version: "1.0"         # optional — plan version
workflow: "release-submit"           # REQUIRED — the workflow this plan executes, e.g. "dev-loop"
phase: "rel-v0.3.2"              # REQUIRED — the phase/scope this plan covers, e.g. "rel-v0.1" or "retrospective"
element: "patch-v0.3.2"       # optional — the Memory element this phase iterates (e.g. a release id)
parent: "${parent}"               # optional — empty for a started workflow (an instance, \`wingfoil workflow start\`); "<workflow>.<phase>" for the plan of one phase (spec-017 §3.1)
release: "v0.3.2"       # optional — target release, e.g. "v0.1"
tmpl_version: 261010   # Orignal template version
---
`;
}

const PLAN_BODY = '\n# Plan\n\nBody.\n';

/** The phase names of `release-cycle` as this repository's definition declares them, in order. */
const RELEASE_CYCLE_PHASES = (
  load(readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'custom', 'release-cycle.yaml'), 'utf-8')) as { phases: { name: string }[] }
).phases.map((phase) => phase.name);

const kinds = (mismatches: readonly Mismatch[]): string[] => mismatches.map((mismatch) => mismatch.kind);

const created: string[] = [];

afterAll(() => {
  for (const dir of created) removeTempDir(dir);
});

function head(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/** Write `files`, stage exactly them, and commit `message` (empty when no file is given); the new sha. */
function commit(root: string, message: string, files: Record<string, string> = {}): string {
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  const paths = Object.keys(files);
  if (paths.length > 0) git(root, ['add', '--', ...paths]);
  git(root, ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message]);
  return head(root);
}

/** A scratch repository holding a copy of this repository's `.wingfoil/`; `files` committed with it. */
function scratchRepo(files: Record<string, string> = {}): string {
  const root = makeTempGitRepo();
  created.push(root);
  cpSync(join(REPO_ROOT, '.wingfoil'), join(root, '.wingfoil'), { recursive: true });
  git(root, ['add', '-A']);
  commit(root, `chore: seed the configuration\n\n${ATTRIBUTION}`, files);
  return root;
}

/** A temp directory outside every scratch repository, for traces and report files. */
function outsideDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-check-phase-report-'));
  created.push(dir);
  return dir;
}

interface Fixture {
  readonly root: string;
  /** `realpathSync(root)`, as the trace records a worktree. */
  readonly worktree: string;
  readonly base: string;
  /** The approver's design-gate record (not listed by a clean report). */
  readonly record: string;
  /** The agent's hand commit. */
  readonly work: string;
  /** The agent's `git merge --no-edit side`, amended with the §7 trailers. */
  readonly merge: string;
  readonly dir: string;
  /** The clean trace: a released `test` hold (status 0) and a released `coverage` hold, in this worktree. */
  readonly tracePath: string;
}

/**
 * The clean phase: base = the seed commit (which also holds a stale plan the range never touches, D6); on the branch
 * `task/task-9-x` the approver's record, one agent commit, one agent merge of a side branch; one uncommitted file.
 */
function buildFixture(): Fixture {
  const [stalePath, staleDoc] = STALE_PLANS[0] ?? ['', ''];
  const root = scratchRepo({ [stalePath]: staleDoc + PLAN_BODY });
  const worktree = realpathSync(root);
  const base = head(root);
  git(root, ['checkout', '--quiet', '-b', 'side']);
  commit(root, `docs: a change on the side branch\n\n${ATTRIBUTION}`, { 'docs/side.md': 'side\n' });
  git(root, ['checkout', '--quiet', '-b', BRANCH, base]);
  const record = commit(root, DESIGN_RECORD);
  const work = commit(root, HAND_COMMIT, { 'docs/notes.md': 'notes\n' });
  git(root, ['merge', '--quiet', '--no-edit', 'side']);
  git(root, ['commit', '--quiet', '--amend', '--no-edit', '--trailer', 'Co-Authored-By: Claude <noreply@anthropic.com>', '--trailer', 'AI-Model: claude-opus-5-5']);
  const merge = head(root);
  writeFixtureFile(root, 'docs/pending.md', 'a pending amendment\n');
  const dir = outsideDir();
  const tracePath = join(dir, 'heavy-gate.trace.jsonl');
  writeTrace(tracePath, [
    rekey(TRACE_COVERAGE_ACQUIRE, worktree),
    rekey(TRACE_COVERAGE_RELEASE, worktree),
    TRACE_TEST_ACQUIRE,
    TRACE_TEST_RELEASE,
    rekey(TRACE_TEST_ACQUIRE, worktree),
    rekey(TRACE_TEST_RELEASE, worktree),
    TRACE_CUT_LINE,
  ]);
  return { root, worktree, base, record, work, merge, dir, tracePath };
}

function writeTrace(path: string, lines: readonly string[]): void {
  writeFileSync(path, lines.map((line) => `${line}\n`).join(''), 'utf-8');
}

interface ReportClaims {
  task?: string;
  phase?: string;
  head?: string;
  commits?: readonly string[];
  files?: readonly string[];
  uncommitted?: readonly string[];
  gates?: readonly string[];
}

/** The report of the clean phase of `f`, with any claim list replaced; a prose paragraph after the block. */
function reportText(f: Fixture, claims: ReportClaims = {}): string {
  const lines = [
    `REPORT ${claims.task ?? 'task-9'} ${claims.phase ?? 'red'} head=${claims.head ?? f.merge}`,
    ...(claims.commits ?? [`${f.work} wf(task): start`, f.merge]).map((sha) => `commit ${sha}`),
    ...(claims.files ?? ['docs/notes.md']).map((path) => `file ${path}`),
    ...(claims.uncommitted ?? ['docs/pending.md']).map((path) => `uncommitted ${path}`),
    ...(claims.gates ?? ['test exit=0', 'coverage exit=0']).map((gate) => `gate ${gate}`),
    '',
    'The red tests fail for the right reason; commit deadbee and file docs/never.md are prose, never read.',
  ];
  return `${lines.join('\n')}\n`;
}

function check(f: Fixture, claims: ReportClaims = {}, options: { since?: string; tracePath?: string } = {}): Mismatch[] {
  return checkReport({
    worktree: f.root,
    report: parseReport(reportText(f, claims)),
    base: f.base,
    since: options.since ?? SINCE,
    tracePath: options.tracePath ?? f.tracePath,
  });
}

/** `main` with captured stdout and stderr lines. */
function run(argv: readonly string[]): { code: number; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = main(argv, { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) });
  return { code, stdout, stderr };
}

function writeReport(f: Fixture, text: string): string {
  const path = join(f.dir, `report-${readdirSync(f.dir).length}.txt`);
  writeFileSync(path, text, 'utf-8');
  return path;
}

function reportArgv(f: Fixture, reportPath: string): string[] {
  return ['report', '--worktree', f.root, '--report', reportPath, '--base', f.base, '--since', SINCE, '--trace', f.tracePath];
}

describe('task-344 MISMATCH_KINDS — the kinds, in the order they are checked and printed', () => {
  it('declares the seventeen kinds in the design order', () => {
    expect(MISMATCH_KINDS).toEqual([
      'task',
      'head',
      'commit-unknown',
      'commit-outside',
      'commit-unlisted',
      'trailer-missing',
      'trailer-identity',
      'trailer-forbidden',
      'trailer-paragraph',
      'file-unclaimed',
      'file-unchanged',
      'uncommitted-unclaimed',
      'uncommitted-missing',
      'gate-missing',
      'gate-status',
      'gate-open',
      'plan-parent',
    ]);
  });
});

describe('task-344 AC 1 — parseReport reads the header and the claims block, and nothing after it', () => {
  const text = [
    'REPORT task-344 green+refactor head=6a7234222',
    'commit 6a7234222 test(cli): task-344 — failing test: the report check',
    'commit bddc04cc16c4a587a2b3cbb140c3f4335e9ee91b',
    'file scripts/check-phase-report.cjs',
    'file scripts/check-phase-report.cjs',
    'uncommitted docs/05_plans/rl-v1/rel-v0.4/dev-loop-rel-v0.4-plan.md',
    'gate test exit=0',
    'gate test exit=1',
    '',
    'Prose: gate build exit=0 and file docs/never.md here are not claims.',
    'gate build exit=0',
    '',
  ].join('\n');

  it('the header fields and each keyword', () => {
    const report = parseReport(text);
    expect(report.task).toBe('task-344');
    expect(report.phase).toBe('green+refactor');
    expect(report.head).toBe('6a7234222');
    expect(report.commits).toEqual(['6a7234222', 'bddc04cc16c4a587a2b3cbb140c3f4335e9ee91b']);
    expect([...new Set(report.files)]).toEqual(['scripts/check-phase-report.cjs']);
    expect(report.uncommitted).toEqual(['docs/05_plans/rl-v1/rel-v0.4/dev-loop-rel-v0.4-plan.md']);
    expect(report.gates).toEqual([
      { gate: 'test', exit: 0 },
      { gate: 'test', exit: 1 },
    ]);
  });

  it('accepts the full task id in the header', () => {
    expect(parseReport('REPORT task-344-check-a-delegated-phase-report head=bddc04c\n').task).toBe('task-344-check-a-delegated-phase-report');
  });

  it.each([
    ['a header that does not match', 'RAPPORT task-344 red head=6a7234222\ncommit 6a7234222\n', 1],
    ['a header without head=', 'REPORT task-344 red 6a7234222\n', 1],
    ['an unknown keyword', 'REPORT task-344 red head=6a7234222\ncommit 6a7234222\nfiles scripts/x.cjs\n', 3],
    ['a gate line without exit=<integer>', 'REPORT task-344 red head=6a7234222\ngate test\n', 2],
    ['a gate line with a non-integer exit', 'REPORT task-344 red head=6a7234222\ngate test exit=green\n', 2],
  ])('%s is a ReportFormatError naming the line', (_name, bad, line) => {
    let caught: unknown;
    try {
      parseReport(bad);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReportFormatError);
    expect((caught as ReportFormatError).line).toBe(line);
  });
});

describe('task-344 AC 1 — checkReport on a clean report', () => {
  let f: Fixture;
  beforeAll(() => {
    f = buildFixture();
  });

  it('no mismatch: the agent commits and merge listed, the approver record not, the uncommitted file claimed, both gates held', () => {
    expect(check(f)).toEqual([]);
  });

  it('no mismatch with the full task id, duplicated claims and a claimed exit 1 matching a hold of status 1', () => {
    const tracePath = join(f.dir, 'failed.trace.jsonl');
    writeTrace(tracePath, [rekey(TRACE_FAILED_ACQUIRE, f.worktree), rekey(TRACE_FAILED_RELEASE, f.worktree)]);
    expect(
      check(
        f,
        { task: 'task-9-x', commits: [f.work, f.merge, f.work], files: ['docs/notes.md', 'docs/notes.md'], gates: ['test exit=1'] },
        { tracePath },
      ),
    ).toEqual([]);
  });

  it('main exits 0 with one summary line and nothing on stderr', () => {
    const result = run(reportArgv(f, writeReport(f, reportText(f))));
    expect(result.code).toBe(0);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).not.toMatch(new RegExp(`^(${MISMATCH_KINDS.join('|')}): `));
    expect(result.stderr).toEqual([]);
  });
});

describe('task-344 AC 1 — each mismatch kind of a report (the rest of the report clean)', () => {
  let f: Fixture;
  beforeAll(() => {
    f = buildFixture();
  });

  const only = (mismatches: Mismatch[], kind: string, ...named: string[]): void => {
    expect(kinds(mismatches)).toEqual([kind]);
    for (const token of named) expect(mismatches[0]?.detail).toContain(token);
  };

  it('task: the branch task/task-9-x, the report task-8', () => {
    only(check(f, { task: 'task-8' }), 'task', 'task-8');
  });

  it('head: a claimed sha that is not HEAD', () => {
    only(check(f, { head: f.base.slice(0, 12) }), 'head', f.base.slice(0, 12));
  });

  it('commit-unknown: a listed sha naming no commit', () => {
    only(check(f, { commits: [f.work, f.merge, 'deadbee'] }), 'commit-unknown', 'deadbee');
  });

  it('commit-outside: the base commit itself', () => {
    only(check(f, { commits: [f.work, f.merge, f.base] }), 'commit-outside', f.base.slice(0, 7));
  });

  it('file-unchanged: a claimed path no commit changed', () => {
    only(check(f, { files: ['docs/notes.md', 'docs/never.md'] }), 'file-unchanged', 'docs/never.md');
  });

  it('file-unchanged: a path only the merged side branch changed (a merge claims what it resolved, here nothing)', () => {
    only(check(f, { files: ['docs/notes.md', 'docs/side.md'] }), 'file-unchanged', 'docs/side.md');
  });

  it('uncommitted-missing: a claimed uncommitted path the status does not list', () => {
    only(check(f, { uncommitted: ['docs/pending.md', 'docs/gone.md'] }), 'uncommitted-missing', 'docs/gone.md');
  });

  it('gate-missing: a gate with no hold', () => {
    only(check(f, { gates: ['test exit=0', 'coverage exit=0', 'build exit=0'] }), 'gate-missing', 'build');
  });

  it('gate-missing: the only hold of the gate is in another worktree', () => {
    const tracePath = join(f.dir, 'other-worktree.trace.jsonl');
    writeTrace(tracePath, [rekey(TRACE_COVERAGE_ACQUIRE, f.worktree), rekey(TRACE_COVERAGE_RELEASE, f.worktree), TRACE_TEST_ACQUIRE, TRACE_TEST_RELEASE]);
    only(check(f, {}, { tracePath }), 'gate-missing', 'test');
  });

  it('gate-missing: the only hold of the gate started before since', () => {
    only(check(f, {}, { since: '2026-11-08T00:00:00.000Z' }), 'gate-missing', 'coverage');
  });

  it('gate-missing: two claims of one gate with one hold', () => {
    only(check(f, { gates: ['test exit=0', 'test exit=0', 'coverage exit=0'] }), 'gate-missing', 'test');
  });

  it('gate-missing: an absent trace makes every claim gate-missing, naming the trace path', () => {
    const tracePath = join(f.dir, 'absent.trace.jsonl');
    const mismatches = check(f, {}, { tracePath });
    expect(kinds(mismatches)).toEqual(['gate-missing', 'gate-missing']);
    expect(mismatches[0]?.detail).toContain(tracePath);
  });

  it('gate-status: a claimed exit 0, the hold released with status 1', () => {
    const tracePath = join(f.dir, 'status-1.trace.jsonl');
    writeTrace(tracePath, [
      rekey(TRACE_FAILED_ACQUIRE, f.worktree),
      rekey(TRACE_FAILED_RELEASE, f.worktree),
      rekey(TRACE_COVERAGE_ACQUIRE, f.worktree),
      rekey(TRACE_COVERAGE_RELEASE, f.worktree),
    ]);
    only(check(f, {}, { tracePath }), 'gate-status', 'test', '1');
  });

  it('gate-status: a claimed exit 0, the hold released with status null (a killed build, bug-508)', () => {
    const tracePath = join(f.dir, 'status-null.trace.jsonl');
    writeTrace(tracePath, [
      rekey(TRACE_BUILD_ACQUIRE, f.worktree),
      rekey(TRACE_BUILD_RELEASE, f.worktree, { status: null }),
      rekey(TRACE_COVERAGE_ACQUIRE, f.worktree),
      rekey(TRACE_COVERAGE_RELEASE, f.worktree),
    ]);
    only(check(f, { gates: ['build exit=0', 'coverage exit=0'] }, { tracePath }), 'gate-status', 'build', 'null');
  });

  it('gate-open: the only candidate is an acquire with no release', () => {
    const tracePath = join(f.dir, 'open.trace.jsonl');
    writeTrace(tracePath, [rekey(TRACE_COVERAGE_ACQUIRE, f.worktree), rekey(TRACE_COVERAGE_RELEASE, f.worktree), rekey(TRACE_TEST_ACQUIRE, f.worktree)]);
    only(check(f, {}, { tracePath }), 'gate-open', 'test');
  });

  describe('kinds that need one more commit on the branch', () => {
    it('commit-unlisted: an agent commit the report does not list', () => {
      const g = buildFixture();
      const extra = commit(g.root, HAND_COMMIT, { 'docs/notes.md': 'more notes\n' });
      only(check(g, { head: extra }), 'commit-unlisted', extra.slice(0, 7));
    });

    it('trailer-missing: a listed commit whose final paragraph lacks AI-Model:', () => {
      const g = buildFixture();
      const extra = commit(g.root, HAND_COMMIT.replace('\nAI-Model: claude-opus-5-5', ''), { 'docs/notes.md': 'more notes\n' });
      only(check(g, { head: extra, commits: [g.work, g.merge, extra] }), 'trailer-missing', extra.slice(0, 7));
    });

    it('trailer-identity: a Co-Authored-By: naming no team.agents entry (a95314a0a, Claude Opus 5.5)', () => {
      const g = buildFixture();
      const extra = commit(g.root, OPUS_IDENTITY_COMMIT, { 'docs/notes.md': 'more notes\n' });
      only(check(g, { head: extra, commits: [g.work, g.merge, extra] }), 'trailer-identity', extra.slice(0, 7));
    });

    it('trailer-forbidden: an approve carrying the attribution trailers', () => {
      const g = buildFixture();
      const extra = commit(g.root, `${APPROVE_COMMIT}\n${ATTRIBUTION}`);
      only(check(g, { head: extra, commits: [g.work, g.merge, extra] }), 'trailer-forbidden', extra.slice(0, 7));
    });

    it('trailer-paragraph: the attribution as a separate paragraph after WingFoil-Version: (bug-236, bug-391)', () => {
      const g = buildFixture();
      const extra = commit(g.root, SEPARATE_PARAGRAPH_COMMIT, { 'docs/notes.md': 'more notes\n' });
      only(check(g, { head: extra, commits: [g.work, g.merge, extra] }), 'trailer-paragraph', extra.slice(0, 7));
    });

    it('file-unclaimed: a path a listed commit changed that no file line names', () => {
      const g = buildFixture();
      const extra = commit(g.root, HAND_COMMIT, { 'docs/extra.md': 'extra\n' });
      only(check(g, { head: extra, commits: [g.work, g.merge, extra] }), 'file-unclaimed', 'docs/extra.md');
    });

    it('uncommitted-unclaimed: an untracked path no uncommitted line names', () => {
      const g = buildFixture();
      writeFixtureFile(g.root, 'docs/stray.md', 'stray\n');
      only(check(g), 'uncommitted-unclaimed', 'docs/stray.md');
    });

    it('plan-parent: a commit of the range adding a plan whose parent names no phase of its workflow', () => {
      const g = buildFixture();
      const [path, doc] = STALE_PLANS[1] ?? ['', ''];
      const extra = commit(g.root, HAND_COMMIT, { [path]: doc + PLAN_BODY });
      only(
        check(g, { head: extra, commits: [g.work, g.merge, extra], files: ['docs/notes.md', path] }),
        'plan-parent',
        'release-publishing-rel-v0.3-plan',
        'release-cycle.release-publishing',
      );
    });
  });

  it('D6: a stale plan the range does not touch is no mismatch of the report (the plans subcommand still finds it)', () => {
    expect(kinds(check(f))).toEqual([]);
    expect(kinds(checkPlanParents({ worktree: f.root }))).toEqual(['plan-parent']);
  });

  it('main exits 1 and prints one <kind>: line per mismatch in MISMATCH_KINDS order, then a summary line', () => {
    const text = [
      `REPORT task-9 red head=${f.base.slice(0, 12)}`,
      'gate build exit=0',
      'uncommitted docs/pending.md',
      'uncommitted docs/gone.md',
      'file docs/never.md',
      'file docs/notes.md',
      'commit deadbee',
      `commit ${f.work}`,
      `commit ${f.merge}`,
      'gate test exit=0',
      'gate coverage exit=0',
      '',
    ].join('\n');
    const result = run(reportArgv(f, writeReport(f, text)));
    expect(result.code).toBe(1);
    expect(result.stdout).toHaveLength(6);
    expect(result.stdout.slice(0, 5).map((line) => line.slice(0, line.indexOf(': ')))).toEqual([
      'head',
      'commit-unknown',
      'file-unchanged',
      'uncommitted-missing',
      'gate-missing',
    ]);
    expect(result.stdout[1]).toContain('deadbee');
    expect(result.stdout[2]).toContain('docs/never.md');
    expect(result.stdout[3]).toContain('docs/gone.md');
    expect(result.stdout[4]).toContain('build');
    expect(result.stderr).toEqual([]);
  });
});

describe('task-344 AC 1 — main exits 2 with one stderr line on a malformed report or a usage error', () => {
  let f: Fixture;
  beforeAll(() => {
    f = buildFixture();
  });

  const usage = (argv: readonly string[], ...named: string[]): void => {
    const result = run(argv);
    expect(result.code).toBe(2);
    expect(result.stdout).toEqual([]);
    expect(result.stderr).toHaveLength(1);
    expect(result.stderr[0]).toMatch(/^check-phase-report: /);
    for (const token of named) expect(result.stderr[0]).toContain(token);
  };

  it('a header that does not match', () => {
    usage(reportArgv(f, writeReport(f, `RAPPORT task-9 red head=${f.merge}\n`)), '1');
  });

  it('an unknown keyword, naming its line number', () => {
    usage(reportArgv(f, writeReport(f, `REPORT task-9 red head=${f.merge}\ncommit ${f.work}\nfiles docs/notes.md\n`)), '3');
  });

  it('a gate line without exit=', () => {
    usage(reportArgv(f, writeReport(f, `REPORT task-9 red head=${f.merge}\ngate test\n`)), '2');
  });

  it('a missing --base', () => {
    usage(['report', '--worktree', f.root, '--report', writeReport(f, reportText(f)), '--trace', f.tracePath], '--base');
  });

  it('an unknown subcommand', () => {
    usage(['reprot', '--worktree', f.root], 'reprot');
  });

  it('a --base naming no commit', () => {
    usage(['report', '--worktree', f.root, '--report', writeReport(f, reportText(f)), '--base', 'no-such-rev', '--since', SINCE, '--trace', f.tracePath], 'no-such-rev');
  });
});

describe('task-344 AC 2 — the plans subcommand flags a parent naming no phase of its workflow (bug-474)', () => {
  let stale: string;
  let cleanOnly: string;
  beforeAll(() => {
    stale = scratchRepo({ [CLEAN_PLAN_PATH]: cleanPlan() + PLAN_BODY });
    commit(stale, `docs: add the four plans of bug-474 as they were at 5ffc8f27c\n\n${ATTRIBUTION}`, Object.fromEntries(STALE_PLANS.map(([path, doc]) => [path, doc + PLAN_BODY])));
    cleanOnly = scratchRepo({ [CLEAN_PLAN_PATH]: cleanPlan() + PLAN_BODY });
  });

  it('the four bug-474 plans, sorted by path, each naming its id, path, stale value and the phases of release-cycle', () => {
    expect(RELEASE_CYCLE_PHASES).toEqual(expect.arrayContaining(['submit', 'publishing']));
    const mismatches = checkPlanParents({ worktree: stale });
    expect(kinds(mismatches)).toEqual(['plan-parent', 'plan-parent', 'plan-parent', 'plan-parent']);
    const expected = [
      ['release-publishing-rel-v0.3.1-plan', 'docs/05_plans/rl-v1/rel-v0.3.1/release-publishing-rel-v0.3.1-plan.md', 'release-cycle.release-publishing'],
      ['release-submit-rel-v0.3.1-plan', 'docs/05_plans/rl-v1/rel-v0.3.1/release-submit-rel-v0.3.1-plan.md', 'release-cycle.release-submit'],
      ['release-publishing-rel-v0.3-plan', 'docs/05_plans/rl-v1/rel-v0.3/release-publishing-rel-v0.3-plan.md', 'release-cycle.release-publishing'],
      ['release-submit-rel-v0.3-plan', 'docs/05_plans/rl-v1/rel-v0.3/release-submit-rel-v0.3-plan.md', 'release-cycle.release-submit'],
    ];
    mismatches.forEach((mismatch, index) => {
      const [id, path, value] = expected[index] ?? [];
      expect(mismatch.detail).toBe(`${id} (${path}): parent "${value}" names no phase of release-cycle (${RELEASE_CYCLE_PHASES.join(', ')})`);
    });
  });

  it('--rev: at the commit before the four plans, none', () => {
    expect(checkPlanParents({ worktree: stale, rev: 'HEAD~1' })).toEqual([]);
  });

  it('paths: only the plans named are checked', () => {
    expect(checkPlanParents({ worktree: stale, paths: [CLEAN_PLAN_PATH] })).toEqual([]);
    expect(kinds(checkPlanParents({ worktree: stale, paths: [STALE_PLANS[0]?.[0] ?? ''] }))).toEqual(['plan-parent']);
  });

  it('an unknown workflow and a parent with no "." are flagged; an empty parent (an instance) is not', () => {
    const odd = scratchRepo({
      'docs/05_plans/rl-v1/rel-v0.4/a-unknown-workflow-plan.md': cleanPlan('a-unknown-workflow-plan', 'no-such-workflow.x') + PLAN_BODY,
      'docs/05_plans/rl-v1/rel-v0.4/b-no-dot-plan.md': cleanPlan('b-no-dot-plan', 'release-cycle') + PLAN_BODY,
      'docs/05_plans/rl-v1/rel-v0.4/c-instance-plan.md': cleanPlan('c-instance-plan', '') + PLAN_BODY,
    });
    const mismatches = checkPlanParents({ worktree: odd });
    expect(kinds(mismatches)).toEqual(['plan-parent', 'plan-parent']);
    expect(mismatches[0]?.detail).toBe('a-unknown-workflow-plan (docs/05_plans/rl-v1/rel-v0.4/a-unknown-workflow-plan.md): parent "no-such-workflow.x" names no workflow');
    expect(mismatches[1]?.detail).toContain('b-no-dot-plan');
    expect(mismatches[1]?.detail).toContain('parent "release-cycle" names no phase');
  });

  it('main plans exits 1 with one plan-parent line per plan and a summary; 0 on the clean plan only', () => {
    const flagged = run(['plans', '--worktree', stale]);
    expect(flagged.code).toBe(1);
    expect(flagged.stdout).toHaveLength(5);
    expect(flagged.stdout.slice(0, 4).every((line) => line.startsWith('plan-parent: '))).toBe(true);
    expect(flagged.stderr).toEqual([]);
    const clean = run(['plans', '--worktree', cleanOnly]);
    expect(clean.code).toBe(0);
    expect(clean.stdout).toHaveLength(1);
    expect(run(['plans', '--rev', 'HEAD~1', '--worktree', stale]).code).toBe(0);
  });
});

describe('task-344 AC 3 — the script runs in no CI gate (characterization, each absence with its positive control)', () => {
  it('no package.json script names it; check:governance does name its script', () => {
    const scripts = Object.values((JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts);
    expect(scripts.filter((command) => command.includes('check-phase-report'))).toEqual([]);
    expect(scripts.some((command) => command.includes('scripts/check-governance.cjs'))).toBe(true);
  });

  it('no GitHub workflow names it; governance.yml names check-governance', () => {
    const dir = join(REPO_ROOT, '.github', 'workflows');
    const files = readdirSync(dir).filter((name) => name.endsWith('.yml')).sort();
    expect(files.filter((name) => readFileSync(join(dir, name), 'utf-8').includes('check-phase-report'))).toEqual([]);
    expect(files.filter((name) => readFileSync(join(dir, name), 'utf-8').includes('check-governance'))).toContain('governance.yml');
  });

  it('no workflow binding names it; e2e-smoke-passed binds scripts/e2e-smoke.cjs', () => {
    const bindings = readFileSync(join(REPO_ROOT, '.wingfoil', 'workflows', 'bindings.yaml'), 'utf-8');
    expect(bindings).not.toContain('check-phase-report');
    expect(bindings).toContain('scripts/e2e-smoke.cjs');
  });
});

describe('task-344 AC 4 — the report format is declared in the script module doc', () => {
  const source = (): string => readFileSync(SCRIPT, 'utf-8');
  /** The script's leading block comment, one line per comment line, the comment markers stripped. */
  const moduleDoc = (): string[] => {
    const text = source();
    const start = text.indexOf('/**');
    const end = text.indexOf('*/', start);
    expect(start).toBeGreaterThanOrEqual(0);
    return text
      .slice(start + 3, end)
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim());
  };

  it('the example between BEGIN EXAMPLE REPORT and END EXAMPLE REPORT reads, every keyword once', () => {
    const lines = moduleDoc();
    const begin = lines.indexOf('BEGIN EXAMPLE REPORT');
    const end = lines.indexOf('END EXAMPLE REPORT');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const report = parseReport(`${lines.slice(begin + 1, end).join('\n')}\n`);
    expect(report.commits).toHaveLength(1);
    expect(report.files).toHaveLength(1);
    expect(report.uncommitted).toHaveLength(1);
    expect(report.gates).toHaveLength(1);
  });

  it('every mismatch kind is named in the module doc', () => {
    const doc = moduleDoc().join('\n');
    expect(MISMATCH_KINDS.filter((kind) => !new RegExp(`(^|[^a-z-])${kind}([^a-z-]|$)`).test(doc))).toEqual([]);
  });
});

describe('task-344 D4 — check-governance exports trailerKeysOutsideFinalParagraph, the one implementation of the §8 rule', () => {
  it('names WingFoil-Version: outside the final paragraph of the bug-236 shape', () => {
    expect(trailerKeysOutsideFinalParagraph(SEPARATE_PARAGRAPH_COMMIT)).toEqual(['WingFoil-Version']);
  });

  it('names nothing when the attribution joins the trailer paragraph', () => {
    expect(trailerKeysOutsideFinalParagraph(OPUS_IDENTITY_COMMIT)).toEqual([]);
    expect(trailerKeysOutsideFinalParagraph(DESIGN_RECORD)).toEqual([]);
  });
});


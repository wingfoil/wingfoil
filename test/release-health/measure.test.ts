/**
 * task-231 — `scripts/release-health/measure.cjs`, the history half of `release-health.measure` (`dl-089` §1, §2, §6):
 * the window and snapshot metrics read from git at an immutable measurement point (G01–G16), the process-conformance
 * measures of `REQ-STATE-10` (P01–P07, `dl-131` Decision 3), the external visibility snapshot (E01–E05, `dl-130`
 * Q2 (a)), and the toolchain record.
 *
 * Every figure is a known answer on a throwaway fixture repository whose commits are listed, in order, in the ledger
 * of `historyFixture` below: identities and dates go per command (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`), never through
 * `git config` (`dl-089` §6). The `REQ-STATE-10` scenarios of `P1.2-versioning-audit-trail.feature` (tag
 * `@REQ-STATE-10`) are exercised by the "Process conformance" blocks: a clean range reports nothing, and a range
 * with one injected defect of each kind 1–5 reports exactly that defect.
 *
 * Deterministic: every date is fixed; the external reader is a stub; no clock, no network.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';

import { formatReportJson, httpDay, main, measureRelease, measureToolchain, parseHttp, processConformance, resolveMeasurementPoint } from '../../scripts/release-health/measure.cjs';
import type { ExternalReader, MetricEntry, Report, ToolCall, ToolResult, ToolRunner } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { FAKE_AWS_ACCESS_KEY_ID } from '../validation/helpers/secret-fixtures';

const REPO_ROOT = join(__dirname, '..', '..');

// Every measure runs the static half (task-233), which loads ESLint and TypeScript once per test file (about 4 s)
// and lints and parses the fixture's files on each run: the default 5 s is too short for a hook or a test that measures.
jest.setTimeout(60_000);
const CATALOGUE = readFileSync(join(REPO_ROOT, 'docs', '08_health', 'metrics.yaml'), 'utf-8');

interface Who {
  readonly name: string;
  readonly email: string;
}
const ADA: Who = { name: 'Ada Approver', email: 'ada@wingfoil.dev' };
const DEV: Who = { name: 'Dev Eloper', email: 'dev@wingfoil.dev' };
const OUT: Who = { name: 'Out Sider', email: 'out@wingfoil.dev' };

const DAY1 = '2026-09-01T10:00:00+00:00';
const DAY2 = '2026-09-02T10:00:00+00:00';
const DAY0 = '2026-08-30T10:00:00+00:00';

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
  decision-log:
    path: "docs/memory/dls/{id}.md"
    states:
      sequence: [draft, in-discussion, ready]
      gates:
        in-discussion: { reject: draft }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [draft, active, done]
  release:
    path: "docs/memory/release/{id}.md"
    states:
      sequence: [draft, planning, in-development, releasing, released]
`;

const DNA_YAML = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${ADA.name}
      email: ${ADA.email}
      roles: [ approver, developer ]
    - name: ${DEV.name}
      email: ${DEV.email}
      roles: [ developer ]
  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer, qa ]
      approval_authority: false
  roles:
    - name: approver
    - name: developer
    - name: qa
paths:
  sources: [ src/ ]
  tests: [ test/ ]
  health: [ docs/08_health/ ]
  runs: [ docs/06_runs/ ]
`;

const DEMO_WORKFLOW = `name: demo
kind: sub
version: 1.0
element: release
phases:
  - name: red
    role: qa
  - name: green
    role: developer
    distinct_from: [red]
  - name: build
    role: developer
    produces:
      - "docs/out/rel-{release.version}-report.md"
      - "docs/out/present.md"
      - "docs/{id}.md"
      - { type: task, path: "docs/memory/task/{task.id}.md" }
`;

const PACKAGE_JSON = `${JSON.stringify({ name: 'wingfoil', version: '0.2.1', repository: { type: 'git', url: 'git+https://github.com/wingfoil/wingfoil.git' } }, null, 2)}\n`;
const PACKAGE_LOCK = `${JSON.stringify({ name: 'wingfoil', lockfileVersion: 3, packages: {} }, null, 2)}\n`;

const RELEASE_DOC = '---\nid: "minor-v0.2"\ntype: release\ntitle: "v0.2"\nstatus: released\nversion: "v0.2"\nrelease-line: "v1"\n---\n\nScope.\n';
const DL_DOC = (status: string): string => `---\nid: "dl-117-ai"\ntype: decision-log\ntitle: "AI attribution"\nstatus: ${status}\n---\n\nThe rule.\n`;

/** The base configuration commit: everything the measures read at the point, outside the window. */
const BASE_FILES: Readonly<Record<string, string>> = {
  '.wingfoil/memory.yaml': MEMORY_YAML,
  '.wingfoil/dna.yaml': DNA_YAML,
  '.wingfoil/workflows/custom/demo.yaml': DEMO_WORKFLOW,
  'docs/08_health/metrics.yaml': CATALOGUE,
  'docs/01_vision/06_features.md': '# Features\n\n| P1.1 | Memory |\n| P1.2 | Audit trail |\n',
  'docs/02_requirements/03_sard/01_architecture.md': '# SARD\n\n### REQ-SYS-01 — Git-backed\n',
  'docs/02_requirements/01_user_story_map/01_map.md': '# Map\n\n* US-1-01: As Morgan, I want it.\n',
  'docs/out/present.md': 'Present.\n',
  'docs/02_requirements/02_bdd/features/p1-memory/P1.1-storage.feature': 'Feature: P1.1\n',
  'docs/out/rel-v0.2-report.md': 'Report.\n',
  'docs/memory/release/minor-v0.2.md': RELEASE_DOC,
  'docs/memory/dls/dl-117-ai.md': DL_DOC('in-discussion'),
  'package.json': PACKAGE_JSON,
  'package-lock.json': PACKAGE_LOCK,
};

interface CommitSpec {
  readonly author?: Who;
  readonly date?: string;
  readonly body?: string;
  readonly files?: Readonly<Record<string, string>>;
}

interface Repo {
  readonly root: string;
  commit(subject: string, spec?: CommitSpec): string;
  rev(rev: string): string;
}

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));

function repo(): Repo {
  const root = makeTempGitRepo();
  repos.push(root);
  const commit: Repo['commit'] = (subject, spec = {}) => {
    const author = spec.author ?? DEV;
    const date = spec.date ?? DAY2;
    for (const [path, content] of Object.entries(spec.files ?? {})) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    const message = spec.body === undefined ? subject : `${subject}\n\n${spec.body}`;
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=verbatim', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_COMMITTER_DATE: date,
      },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const rev: Repo['rev'] = (name) => git(root, ['rev-parse', name]).trim();
  return { root, commit, rev };
}

function taskDoc(id: string, status: string, extra = '', body = 'Revision.'): string {
  return `---\nid: "${id}"\ntype: task\ntitle: "Task ${id}"\nstatus: ${status}\nref: "dl-117"\n${extra}---\n\n${body}\n`;
}

function planDoc(status: string): string {
  return `---\nid: "demo-plan"\ntype: plan\ntitle: "Demo"\nstatus: ${status}\nworkflow: "demo"\nphase: "build"\nelement: "minor-v0.2"\nrelease: "v0.2"\n---\n\nSteps.\n`;
}

function runRecord(phase: string, role: string, session: string): string {
  return JSON.stringify({ id: `task-001-alpha/${phase}/1`, element: 'task:task-001-alpha', workflow: 'demo', phase, role, mode: 'fresh', agent: 'Claude', adapter: 'built-in/claude', agent_version: 'not-reported', model: 'not-reported', session, tokens: { input: 'not-reported', output: 'not-reported', cache_read: 'not-reported', cache_write: 'not-reported' }, wingfoil: '0.3.0 (abc1234)', state_ref: '0'.repeat(40), duration_ms: 1, exit_status: 0, result: 'PASS', notes: 'none' });
}

const APPROVAL = (reason: string): string => `Approver: ${ADA.name} <${ADA.email}> (approver)\nReason: ${reason}`;
const STAMP = 'WingFoil-Version: 0.3.0 (abc1234)';
const CLAUDE = 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-test';

const TASK_BODY = '**Features:** P1.1, P9.9\n\nImplements REQ-SYS-01 for US-1-01.';
const TASK_EXTRA = 'depends_on: ["task-009-missing"]\n';

interface History {
  readonly repo: Repo;
  readonly base: string;
  readonly point: string;
  /** The window's non-merge commits, by ledger number (1-based). */
  readonly c: readonly string[];
}

/**
 * The history fixture. Ledger of the window's twenty non-merge commits (`base..point`), with what each one is
 * built to show:
 *
 *  1 feat(core) DEV d1  body + pre-ratification Co-Authored-By  src/a.ts +3   code, cites task-001
 *  2 fix        DEV d1  no body                                 src/b.ts +600 code, cites nothing (G05), > 500 (G03)
 *  3 Update…    OUT d1  no body, not conventional (G01)         README.md +1  unknown identity (G07)
 *  4 wf(dl) approve dl-117 [in-discussion → ready] ADA d1       the dl-117 rule's ratification (G08)
 *  5 wf(task) add      DEV d1  trailer only (no body), signed (G16)
 *  6 wf(task) submit   DEV d2  body + signed (G16)
 *  7 wf(task) approve [pending → backlog] ADA d2  well-formed
 *  8 wf(task) start [backlog → in-progress] DEV d2  Claude + AI-Model trailer only (conforming, no body)
 *  9 wf(task) approve [in-progress → in-review] ADA d2  no Approver (G06, P01), Claude trailers (approve with AI)
 * 10 wf(task) schedule  DEV d2  empty, verb outside the grammar (G09, P01), Co-Authored-By Bob (not conforming)
 * 11 wf(task) approve [in-review -> approved] ADA d2  ASCII arrow (G10, P01)
 * 12 feat(core) DEV d2  body, src/d.ts +2 and docs/d.md +1    code touching docs (G12)
 * 13 chore      DEV d2  body, config/keys.txt +1               a secret-shaped line (G14)
 * 14 wf(plan) add       DEV d2
 * 15 wf(plan) submit    DEV d2
 * 16 wf(plan) finalize [active → done] DEV d2  the build phase recorded complete (P03)
 * 17 docs(memory) …     DEV d2  body, subject > 72 (G04)      docs/notes.md +1
 * 18 agent: record      DEV d2  run log: red and green share a session (P05)
 * 19 feat(core) on task/t1  DEV d2  body, src/c.ts +1
 * 20 docs: note on main      DEV d2  docs/note2.md +1
 * then `Merge branch 'main' into task/t1` (G11 back-merge) and `Merge branch 'task/t1'` = the point.
 *
 * Outside the window: branch `stale` (from the base, day 0) allocates task-001 a second time (G15), and
 * `refs/remotes/origin/old` points at it, unmerged and older than the point (G15).
 */
function historyFixture(): History {
  const r = repo();
  const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
  const c: string[] = [];
  c.push(r.commit('feat(core): add the a module (task-001)', { date: DAY1, body: 'Adds a.\n\nCo-Authored-By: Someone <someone@wingfoil.dev>', files: { 'src/a.ts': 'a\nb\nc\n' } }));
  c.push(r.commit('fix: tweak b', { date: DAY1, files: { 'src/b.ts': 'x\n'.repeat(600) } }));
  c.push(r.commit('Update readme', { author: OUT, date: DAY1, files: { 'README.md': 'Readme.\n' } }));
  c.push(r.commit('wf(decision-log): approve dl-117-ai [in-discussion → ready]', { author: ADA, date: DAY1, body: APPROVAL('Ratified.'), files: { 'docs/memory/dls/dl-117-ai.md': DL_DOC('ready') } }));
  const doc = (status: string): Record<string, string> => ({ 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', status, TASK_EXTRA, TASK_BODY) });
  c.push(r.commit('wf(task): add task-001-alpha', { date: DAY1, body: STAMP, files: doc('draft') }));
  c.push(r.commit('wf(task): submit task-001-alpha', { body: `Carries content: the body.\n\n${STAMP}`, files: doc('pending') }));
  c.push(r.commit('wf(task): approve task-001-alpha [pending → backlog]', { author: ADA, body: APPROVAL('Ready.'), files: doc('backlog') }));
  c.push(r.commit('wf(task): start task-001-alpha [backlog → in-progress]', { body: CLAUDE, files: doc('in-progress') }));
  c.push(r.commit('wf(task): approve task-001-alpha [in-progress → in-review]', { author: ADA, body: `Reason: Looks fine.\n\n${CLAUDE}`, files: doc('in-review') }));
  c.push(r.commit('wf(task): schedule task-001-alpha', { body: 'Co-Authored-By: Bob <bob@wingfoil.dev>' }));
  c.push(r.commit('wf(task): approve task-001-alpha [in-review -> approved]', { author: ADA, body: APPROVAL('Done right.'), files: doc('approved') }));
  c.push(r.commit('feat(core): code and docs (task-001)', { body: 'Both.', files: { 'src/d.ts': 'd\ne\n', 'docs/d.md': 'D.\n' } }));
  c.push(r.commit('chore: add credentials', { body: 'Oops.', files: { 'config/keys.txt': `aws_key = ${FAKE_AWS_ACCESS_KEY_ID}\n` } }));
  c.push(r.commit('wf(plan): add demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('draft') } }));
  c.push(r.commit('wf(plan): submit demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('active') } }));
  // The build phase's report goes missing before the plan records the phase complete.
  git(r.root, ['rm', '--quiet', 'docs/out/rel-v0.2-report.md']);
  c.push(r.commit('wf(plan): finalize demo-plan [active → done]', { files: { 'docs/plans/demo-plan.md': planDoc('done') } }));
  c.push(r.commit('docs(memory): a deliberately long subject line that runs well past the seventy-two characters', { body: 'Long.', files: { 'docs/notes.md': 'Notes.\n' } }));
  c.push(r.commit('agent: record task-001-alpha/green/1', { files: { 'docs/06_runs/task-001-alpha.jsonl': `${runRecord('red', 'qa', 's-1')}\n${runRecord('green', 'developer', 's-1')}\n` } }));
  git(r.root, ['checkout', '--quiet', '-b', 'task/t1']);
  c.push(r.commit('feat(core): more (task-001)', { body: 'More.', files: { 'src/c.ts': 'c\n' } }));
  git(r.root, ['checkout', '--quiet', 'main']);
  c.push(r.commit('docs: note', { files: { 'docs/note2.md': 'Note.\n' } }));
  const env = { ...process.env, GIT_AUTHOR_NAME: DEV.name, GIT_AUTHOR_EMAIL: DEV.email, GIT_AUTHOR_DATE: DAY2, GIT_COMMITTER_NAME: DEV.name, GIT_COMMITTER_EMAIL: DEV.email, GIT_COMMITTER_DATE: DAY2 };
  git(r.root, ['checkout', '--quiet', 'task/t1']);
  execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', 'main'], { cwd: r.root, env });
  git(r.root, ['checkout', '--quiet', 'main']);
  execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', 'task/t1'], { cwd: r.root, env });
  const point = r.rev('HEAD');
  // Outside the window: a branch that allocates task-001 again, and a stale remote-tracking ref to it.
  git(r.root, ['checkout', '--quiet', '-b', 'stale', base]);
  const stale = r.commit('wf(task): add task-001-other', { date: DAY0, files: { 'docs/memory/task/task-001-other.md': taskDoc('task-001-other', 'draft') } });
  git(r.root, ['update-ref', 'refs/remotes/origin/old', stale]);
  git(r.root, ['checkout', '--quiet', 'main']);
  return { repo: r, base, point, c };
}

/** A light fixture — the base configuration and two commits — for the tests that do not read the history ledger. */
function lightFixture(): { repo: Repo; base: string; point: string } {
  const r = repo();
  const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
  r.commit('feat(core): add the a module (task-001)', { body: 'Adds a.', files: { 'src/a.ts': 'a\n' } });
  const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
  return { repo: r, base, point };
}

function entry(report: Report, id: string): MetricEntry {
  const found = report.metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} in the report`);
  return found;
}

/** No network and no toolchain: the history tests measure git alone (the toolchain half has its own block below). */
const OFFLINE = { offline: true, toolchain: false } as const;

/** The report schema's errors for `report` (ajv, draft 2020-12), as `<path> <message>` lines; empty when valid. */
function schemaErrors(report: Report): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(join(REPO_ROOT, 'docs', '08_health', 'release-health.schema.json'), 'utf-8')) as object);
  validate(JSON.parse(formatReportJson(report)));
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`);
}

describe('measureRelease — the history metrics on a fixture with known answers (AC 1, AC 5)', () => {
  const h = historyFixture();
  let report: Report;
  beforeAll(async () => {
    report = await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
  });
  const c = (n: number): string => h.c[n - 1]!;

  it('writes one entry per catalogue metric, in catalogue order, each measured or with a reason', () => {
    const ids = [...CATALOGUE.matchAll(/^ {2}- id: ([A-Z][0-9]{2})$/gm)].map((m) => m[1]);
    expect(report.metrics.map((m) => m.id)).toEqual(ids);
    for (const m of report.metrics) {
      if (m.status === 'measured') expect(m).toHaveProperty('value');
      else expect(typeof m.reason).toBe('string');
    }
    expect(report.schema_version).toBe(1);
    expect(report.catalogue_version).toBe(2);
    expect(report.measurement_point).toEqual({ ref: h.point, commit: h.point, basis: 'released-transition' });
    expect(report.release).toEqual({ id: 'minor-v0.2', version: 'v0.2', kind: 'minor' });
  });

  it('G01 — conventional subjects, with raw counts and the failing commit named', () => {
    expect(entry(report, 'G01')).toMatchObject({ status: 'measured', value: 95, raw: { conforming: 19, total: 20 }, items: 20, small_sample: true, failing: [c(3)] });
  });

  it('G02 — commit bodies, trailer lines excluded', () => {
    expect(entry(report, 'G02')).toMatchObject({ value: 50, raw: { with_body: 10, total: 20 }, items: 20, small_sample: true });
  });

  it('G03 — lines changed per non-merge commit: median, p90, share above 500', () => {
    const g03 = entry(report, 'G03');
    expect(g03.raw).toMatchObject({ commits: 20, over_500: 1 });
    expect(g03.value).toMatchObject({ share_over_500: 5 });
    expect(typeof (g03.value as { median: number }).median).toBe('number');
  });

  it('G04 — subject length: mean, share above 72', () => {
    const subjects = git(h.repo.root, ['log', '--no-merges', '--format=%s', `${h.base}..${h.point}`]).trim().split('\n');
    const mean = Math.round((subjects.reduce((sum, s) => sum + [...s].length, 0) / subjects.length) * 100) / 100;
    expect(entry(report, 'G04')).toMatchObject({ value: { mean, share_over_72: 5 }, raw: { over_72: 1, total: 20 }, failing: [c(17)] });
  });

  it('G05 — code commits citing a task or bug id', () => {
    expect(entry(report, 'G05')).toMatchObject({ value: 75, raw: { citing: 3, total: 4 }, failing: [c(2)] });
  });

  it('G06 — approve and reject commits carrying Approver: and a non-blank Reason:', () => {
    expect(entry(report, 'G06')).toMatchObject({ value: 75, raw: { conforming: 3, total: 4 }, failing: [c(9)] });
  });

  it('G07 — commits whose author or committer is not a team.members entry', () => {
    expect(entry(report, 'G07')).toMatchObject({ value: 1, raw: { failing: 1, total: 22 }, failing: [c(3)] });
  });

  it('G08 — AI attribution judged against dl-117\'s rule from its ratification on (AC 5)', () => {
    expect(entry(report, 'G08')).toMatchObject({
      value: {
        conforming_share: 66.67,
        approve_reject_with_ai: 1,
        distinct_trailers: [
          'AI-Model: claude-test',
          'Co-Authored-By: Bob <bob@wingfoil.dev>',
          'Co-Authored-By: Claude <noreply@anthropic.com>',
          'Co-Authored-By: Someone <someone@wingfoil.dev>',
        ],
      },
      raw: { judged: 3, conforming: 2, before_rule: 1, approve_reject_with_ai: 1, ratified_at: c(4) },
      failing: [c(9), c(10)],
    });
  });

  it('G09 — wf() commits using a verb outside the declared grammar', () => {
    expect(entry(report, 'G09')).toMatchObject({ value: 9.09, raw: { outside: 1, total: 11 }, failing: [c(10)] });
  });

  it('G10 — wf() brackets using the canonical arrow', () => {
    expect(entry(report, 'G10')).toMatchObject({ value: 83.33, raw: { canonical: 5, total: 6 }, failing: [c(11)] });
  });

  it('G11 — back-merges per task branch merged', () => {
    expect(entry(report, 'G11')).toMatchObject({ value: 1, raw: { back_merges: 1, task_branches_merged: 1 } });
  });

  it('G12 — code commits that also touch docs/', () => {
    expect(entry(report, 'G12')).toMatchObject({ value: 25, raw: { touching_docs: 1, total: 4 } });
  });

  it('G13 — share of wf() commits; commits per active day', () => {
    expect(entry(report, 'G13')).toMatchObject({ value: { wf_share: 55, per_active_day: 10 }, raw: { wf: 11, total: 20, active_days: 2 } });
  });

  it('G14 — secrets the spec-007 scanner finds in the window\'s diffs', () => {
    const g14 = entry(report, 'G14');
    expect(g14).toMatchObject({ value: 1, raw: { blocking: 1 } });
    expect(g14.failing).toEqual([`${c(13)} config/keys.txt aws-access-key-id`]);
  });

  it('G15 — unmerged remote branches older than the release, and ids allocated twice across refs (AC 5, dl-101)', () => {
    expect(entry(report, 'G15')).toMatchObject({
      value: { stale_branches: 1, duplicate_ids: 1 },
      failing: ['refs/remotes/origin/old', 'task-001: task-001-alpha, task-001-other'],
    });
    // Not reproducible at a fixed point: the refs are the running clone's, read at run time.
    expect(entry(report, 'G15').raw).toMatchObject({ refs_from: 'live refs at run time' });
  });

  it('G16 — wf() commits signed with the WingFoil-Version trailer (AC 5, dl-111)', () => {
    expect(entry(report, 'G16')).toMatchObject({ value: 18.18, raw: { signed: 2, total: 11 } });
  });

  it('P01–P05 — each check counts items and names every failing item', () => {
    expect(entry(report, 'P01')).toMatchObject({ raw: { checked: 11 }, failing: [expect.stringContaining(c(9)), expect.stringContaining(c(10)), expect.stringContaining(c(11))] });
    expect(entry(report, 'P03')).toMatchObject({ value: 1, raw: { checked: 2, failing: 1, unresolved: 1 }, failing: ['demo-plan: docs/out/rel-v0.2-report.md'] });
    expect(entry(report, 'P04')).toMatchObject({ value: 2, raw: { checked: 6, failing: 2 }, failing: ['task-001-alpha: depends_on task-009-missing', 'task-001-alpha: feature P9.9'] });
    expect(entry(report, 'P05')).toMatchObject({ value: 1, failing: ['task-001-alpha/green/1: shares session s-1 with task-001-alpha/red/1 (distinct_from red)'] });
  });

  it('P06 and D01 need the benchmark runs; P07 is the measure\'s own byte-identity', () => {
    expect(entry(report, 'P06')).toMatchObject({ status: 'not-measurable' });
    expect(entry(report, 'D01')).toMatchObject({ status: 'not-measurable' });
    expect(entry(report, 'P07')).toMatchObject({ status: 'measured', value: true });
  });

  it('the toolchain half is skipped by --no-toolchain, with the reason; the static half is measured all the same (task-233)', () => {
    expect(entry(report, 'Q01')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('--no-toolchain') });
    expect(entry(report, 'Q05')).toMatchObject({ status: 'measured' });
    expect(report.metrics.filter((m) => /not written yet/.test(m.reason ?? ''))).toEqual([]);
  });

  it('every percentage carries its raw counts (dl-089 §6)', () => {
    for (const id of ['G01', 'G02', 'G05', 'G06', 'G09', 'G10', 'G12', 'G16']) {
      expect(Object.keys(entry(report, id).raw ?? {}).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('validates against docs/08_health/release-health.schema.json', () => {
    expect(schemaErrors(report)).toEqual([]);
  });

  it('is byte-identical on a second run at the same point (REQ-SYS-07)', async () => {
    const again = await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
    expect(formatReportJson(again)).toBe(formatReportJson(report));
  });
});

describe('small-sample flag (dl-089 §3)', () => {
  it('is false once a window holds 30 relevant items', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
    for (let i = 0; i < 30; i += 1) r.commit(`docs: note ${i}`, { files: { [`docs/n${i}.md`]: `${i}\n` } });
    const report = await measureRelease(r.root, { release: 'v0.2', at: r.rev('HEAD'), previous: base, ...OFFLINE });
    expect(entry(report, 'G01')).toMatchObject({ items: 30, small_sample: false, value: 100 });
  });
});

describe('the measurement point (dl-089 §1)', () => {
  it('is the highest tag of the release\'s version that no other release owns, else the released transition', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
    const tagged0 = r.commit('docs: one', { files: { 'docs/one.md': '1\n' } });
    git(r.root, ['tag', 'v0.2.0', tagged0]);
    const tagged1 = r.commit('docs: two', { files: { 'docs/two.md': '2\n' } });
    git(r.root, ['tag', 'v0.2.1', tagged1]);
    // v0.2.2 is another release's version (a patch), so it is never v0.2's point.
    git(r.root, ['tag', 'v0.2.2', r.commit('docs: three', { files: { 'docs/memory/release/patch-v0.2.2.md': RELEASE_DOC.replace(/minor-v0\.2/g, 'patch-v0.2.2').replace('version: "v0.2"', 'version: "v0.2.2"') } })]);
    expect(base).not.toBe(tagged1);
    expect(resolveMeasurementPoint(r.root, 'v0.2')).toEqual({ ref: 'v0.2.1', commit: tagged1, basis: 'published-tag' });
    expect(resolveMeasurementPoint(r.root, 'v0.2.2')).toEqual({ ref: 'v0.2.2', commit: r.rev('v0.2.2'), basis: 'published-tag' });
  });

  it('falls back to the commit carrying the release\'s released transition when no tag exists', () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: { ...BASE_FILES, 'docs/memory/release/minor-v0.2.md': RELEASE_DOC.replace('released', 'releasing') } });
    const released = r.commit('wf(release): approve minor-v0.2 [releasing → released]', { author: ADA, body: APPROVAL('Shipped.'), files: { 'docs/memory/release/minor-v0.2.md': RELEASE_DOC } });
    r.commit('docs: after', { files: { 'docs/after.md': 'a\n' } });
    expect(base).not.toBe(released);
    expect(resolveMeasurementPoint(r.root, 'v0.2')).toEqual({ ref: released, commit: released, basis: 'released-transition' });
    expect(() => resolveMeasurementPoint(r.root, 'v0.9')).toThrow('no release element at HEAD has version v0.9');
  });
});

describe('never writes git configuration (AC 2, dl-089 §6)', () => {
  it('leaves `git config --list --show-origin` byte-identical, and leaves no worktree behind', async () => {
    const h = lightFixture();
    const before = git(h.repo.root, ['config', '--list', '--show-origin']);
    const worktreesBefore = git(h.repo.root, ['worktree', 'list', '--porcelain']);
    await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
    expect(git(h.repo.root, ['config', '--list', '--show-origin'])).toBe(before);
    expect(git(h.repo.root, ['worktree', 'list', '--porcelain'])).toBe(worktreesBefore);
  });
});

describe('the toolchain record (AC 4)', () => {
  const h = lightFixture();
  let report: Report;
  beforeAll(async () => {
    report = await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, ...OFFLINE });
  });

  it('records the Node and npm versions and the sha256 of the lockfile at the point', () => {
    expect(report.toolchain.node).toBe(process.version);
    expect(report.toolchain.npm).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.toolchain.lockfile_sha256).toBe(createHash('sha256').update(PACKAGE_LOCK).digest('hex'));
  });

  it('the release-health scripts are not in the npm tarball (characterization)', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = (JSON.parse(raw) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
    expect(files.filter((path) => path.startsWith('scripts/'))).toEqual([]);
  });
});

describe('the external snapshot E01–E05 (AC 3, dl-130 Q2 (a))', () => {
  const h = lightFixture();
  const DATE = 'Fri, 09 Oct 2026 10:00:00 GMT';
  const reader: ExternalReader = (source) => {
    if (source.target === 'repos/wingfoil/wingfoil') return { ok: true, date: DATE, body: { stargazers_count: 12, forks_count: 3, subscribers_count: 4 } };
    if (source.target.endsWith('/traffic/views')) return { ok: false, error: 'HTTP 403: Must have push access to repository' };
    if (source.target.endsWith('/traffic/clones')) return { ok: true, date: DATE, body: { count: 7, uniques: 5 } };
    if (source.target.includes('last-week')) return { ok: true, date: DATE, body: { downloads: 40 } };
    return { ok: true, date: DATE, body: { downloads: 150 } };
  };

  it('offline, every E metric is not-measurable with the reason', async () => {
    const report = await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, offline: true, toolchain: false });
    for (const id of ['E01', 'E02', 'E03', 'E04', 'E05']) expect(entry(report, id)).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('offline') });
  });

  let online: Report;
  beforeAll(async () => {
    online = await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, external: reader, toolchain: false });
  });

  it('online, each value is recorded with the command and the date it was read (the response\'s Date header)', () => {
    const report = online;
    expect(entry(report, 'E01')).toMatchObject({ status: 'measured', value: 12, evidence: { command: 'gh api repos/wingfoil/wingfoil', read_on: '2026-10-09' } });
    expect(entry(report, 'E02')).toMatchObject({ value: 3 });
    expect(entry(report, 'E03')).toMatchObject({ value: 4 });
    expect(entry(report, 'E05')).toMatchObject({ value: { last_week: 40, last_month: 150 }, evidence: { read_on: '2026-10-09' } });
    expect(entry(report, 'E05').evidence?.command).toContain('https://api.npmjs.org/downloads/point/last-week/wingfoil');
  });

  it('an online report validates against the report schema too (evidence.read_on)', () => {
    expect(schemaErrors(online)).toEqual([]);
  });

  it('a read that fails is not-measurable with what failed, never a zero', () => {
    const report = online;
    expect(entry(report, 'E04')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('HTTP 403') });
  });
});

/**
 * REQ-STATE-10 (`P1.2-versioning-audit-trail.feature`, `@REQ-STATE-10`): a clean range reports no failing item on
 * any check, and a range with one injected defect of kind 1–5 reports exactly that defect, on its own check.
 */
describe('Process conformance (REQ-STATE-10, P1.2 @REQ-STATE-10 scenarios)', () => {
  /** A clean range: a task through add → submit → approve, a phase plan to done with its produces, clean run records. */
  function clean(): { r: Repo; base: string } {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: BASE_FILES });
    const doc = (status: string, extra = ''): Record<string, string> => ({ 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', status, extra, '**Features:** P1.1') });
    r.commit('wf(task): add task-001-alpha', { files: doc('draft') });
    r.commit('wf(task): submit task-001-alpha', { files: doc('pending') });
    r.commit('wf(task): approve task-001-alpha [pending → backlog]', { author: ADA, body: APPROVAL('Ready.'), files: doc('backlog') });
    r.commit('wf(plan): add demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('draft') } });
    r.commit('wf(plan): submit demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('active') } });
    r.commit('wf(plan): finalize demo-plan [active → done]', { files: { 'docs/plans/demo-plan.md': planDoc('done') } });
    r.commit('agent: record task-001-alpha/green/1', { files: { 'docs/06_runs/task-001-alpha.jsonl': `${runRecord('red', 'qa', 's-1')}\n${runRecord('green', 'developer', 's-2')}\n` } });
    return { r, base };
  }

  function failingByCheck(root: string, base: string): Record<string, readonly string[]> {
    const p = processConformance(root, git(root, ['rev-parse', 'HEAD']).trim(), base);
    return Object.fromEntries(p.map((m) => [m.id, m.failing ?? []]));
  }

  const NONE = { P01: [], P02: [], P03: [], P04: [], P05: [] };

  it('a clean range reports, for every check, the items checked and no failing item', () => {
    const { r, base } = clean();
    const p = processConformance(r.root, r.rev('HEAD'), base);
    expect(p.map((m) => m.id)).toEqual(['P01', 'P02', 'P03', 'P04', 'P05', 'P06']);
    expect(Object.fromEntries(p.map((m) => [m.id, m.failing ?? []]))).toMatchObject(NONE);
    for (const m of p.slice(0, 5)) expect(m.raw).toHaveProperty('checked');
  });

  it('Process conformance names every failing item — kind 1: a wf(task): approve with no Approver: line', () => {
    const { r, base } = clean();
    const bad = r.commit('wf(task): start task-001-alpha [backlog → in-progress]', { author: ADA, files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'in-progress', '', '**Features:** P1.1') } });
    const worse = r.commit('wf(task): approve task-001-alpha [in-progress → in-review]', { author: ADA, body: 'Reason: Fine.', files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'in-review', '', '**Features:** P1.1') } });
    const failing = failingByCheck(r.root, base);
    expect(bad).not.toBe(worse);
    expect(failing['P01']).toEqual([expect.stringMatching(new RegExp(`^${worse} `))]);
    expect({ ...failing, P01: [] }).toMatchObject(NONE);
  });

  it.each([
    ['2', 'an illegal transition', (r: Repo) => r.commit('wf(task): submit task-001-alpha', { files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'in-review', '', '**Features:** P1.1') } }), 'P02'],
    ['3', 'a phase recorded complete with a produces artifact absent', (r: Repo) => { git(r.root, ['rm', '--quiet', 'docs/out/present.md']); return r.commit('docs: drop the produced file'); }, 'P03'],
    ['4', 'a broken traceability link', (r: Repo) => r.commit('wf(task): add task-002-beta', { files: { 'docs/memory/task/task-002-beta.md': taskDoc('task-002-beta', 'draft', '', '**Features:** P7.7') } }), 'P04'],
    ['5', 'a phase run by the same session as one it must be distinct from', (r: Repo) => r.commit('agent: record task-001-alpha/green/2', { files: { 'docs/06_runs/task-001-alpha.jsonl': `${runRecord('red', 'qa', 's-1')}\n${runRecord('green', 'developer', 's-2')}\n${runRecord('green', 'developer', 's-1').replace('/green/1', '/green/2')}\n` } }), 'P05'],
  ])('Process conformance names every failing item — kind %s: %s', (_kind, _what, inject, check) => {
    const { r, base } = clean();
    inject(r);
    const failing = failingByCheck(r.root, base);
    expect(failing[check]).toHaveLength(1);
    expect({ ...failing, [check]: [] }).toMatchObject(NONE);
  });

  it('a frontmatter REQ or feature id resolves as one, and a .feature path resolves from the BDD folder', () => {
    const { r, base } = clean();
    r.commit('wf(task): add task-003-gamma', { files: { 'docs/memory/task/task-003-gamma.md': taskDoc('task-003-gamma', 'draft', '', 'Scenarios in p1-memory/P1.1-storage.feature.').replace('ref: "dl-117"', 'ref: "REQ-SYS-01"') } });
    const p04 = processConformance(r.root, r.rev('HEAD'), base).find((m) => m.id === 'P04')!;
    expect(p04.failing).toEqual([]);
    expect(p04.raw).toMatchObject({ checked: 4 });
  });

  it('a commit made before the configuration existed is unchecked, not failing; a free-text produces entry is unresolved', () => {
    const r = repo();
    const first = r.commit('wf(task): add task-001-alpha', { date: DAY0, files: { 'docs/memory/task/task-001-alpha.md': taskDoc('task-001-alpha', 'draft') } });
    // The configuration alone, no Memory document: a non-wf() commit creating one would be a P02 finding of its own.
    const config = Object.fromEntries(Object.entries(BASE_FILES).filter(([path]) => !path.startsWith('docs/memory/')));
    r.commit('chore: configure wingfoil', { author: ADA, files: { ...config, '.wingfoil/workflows/custom/demo.yaml': DEMO_WORKFLOW.replace('"docs/out/present.md"', '"the release notes, in words"') } });
    r.commit('wf(plan): add demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('draft') } });
    r.commit('wf(plan): submit demo-plan', { files: { 'docs/plans/demo-plan.md': planDoc('active') } });
    r.commit('wf(plan): finalize demo-plan [active → done]', { files: { 'docs/plans/demo-plan.md': planDoc('done') } });
    const p = processConformance(r.root, r.rev('HEAD'), null);
    const byId = Object.fromEntries(p.map((m) => [m.id, m]));
    expect(byId['P02']).toMatchObject({ failing: [], raw: { unchecked: 1 } });
    // The plan's element is absent, so the report path keeps its token; the free text and `{id}` are unresolved too.
    expect(byId['P03']).toMatchObject({ failing: [], raw: { checked: 0, unresolved: 3 } });
    expect(first).toMatch(/^[0-9a-f]{40}$/);
  });

  it('Process conformance is byte-identical on a rerun', () => {
    const { r, base } = clean();
    const head = r.rev('HEAD');
    expect(JSON.stringify(processConformance(r.root, head, base))).toBe(JSON.stringify(processConformance(r.root, head, base)));
  });
});

describe('the HTTP reading of the external snapshot', () => {
  it('reads the status, the Date header and the JSON body, skipping an interim 100 response', () => {
    const text = 'HTTP/1.1 100 Continue\r\n\r\nHTTP/2.0 200 OK\r\nDate: Sat, 10 Oct 2026 08:00:00 GMT\r\n\r\n{"downloads": 9}';
    expect(parseHttp(text)).toEqual({ ok: true, date: 'Sat, 10 Oct 2026 08:00:00 GMT', body: { downloads: 9 } });
    expect(httpDay('Sat, 10 Oct 2026 08:00:00 GMT')).toBe('2026-10-10');
  });

  it('a non-2xx status is a failure naming the status; a malformed date is no day', () => {
    expect(parseHttp('HTTP/2.0 404 Not Found\nDate: x\n\n{"message":"Not Found"}')).toEqual({ ok: false, error: 'HTTP 404: {"message":"Not Found"}' });
    expect(httpDay('yesterday')).toBeNull();
    expect(httpDay(null)).toBeNull();
  });
});

describe('the command line (the release-health.measure binding)', () => {
  it('writes the report where --out says and prints its path; a missing --release is exit 2', async () => {
    const h = lightFixture();
    const dir = mkdtempSync(join(tmpdir(), 'wf-rh-out-'));
    const out = join(dir, 'report.json');
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await main(['--release', 'v0.2', '--at', h.point, '--previous', h.base, '--offline', '--no-toolchain', '--root', h.repo.root, '--out', out])).toBe(0);
      expect(write).toHaveBeenCalledWith(`${out}\n`);
      const report = JSON.parse(readFileSync(out, 'utf-8')) as Report;
      expect(report.measurement_point.commit).toBe(h.point);
      expect(await main(['--offline'])).toBe(2);
      expect(err).toHaveBeenLastCalledWith('release-health measure: missing required argument: --release <vX.Y[.Z]>\n');
      expect(await main(['--release', 'v9'])).toBe(2);
    } finally {
      write.mockRestore();
      err.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── task-232: the toolchain half (Q01–Q04, Q11, Q12, Q17) ─────────────────────────────────────────────────
//
// Every tool output is stubbed (approver ruling R4, W3 B6): the stub runner answers each command by its step and
// writes the files a real run would write (jest's JSON results, the coverage summary). The one real run is recorded
// in the task's Execution Notes, not taken here.

const PINNED_NODE = process.version.slice(1);
const publishYml = (version: string): string => `name: publish\nenv:\n  NODE_VERSION: '${version}'\njobs: {}\n`;
const TOOL_SCRIPTS = { build: 'tsc', typecheck: 'tsc --noEmit', lint: 'eslint .', test: 'jest', 'test:coverage': 'jest --coverage', 'test:latency': 'jest -c jest.latency.config.js' };
const toolPackageJson = (scripts: Readonly<Record<string, string>> = TOOL_SCRIPTS): string =>
  `${JSON.stringify({ name: 'wingfoil', version: '0.3.0', repository: { type: 'git', url: 'git+https://github.com/wingfoil/wingfoil.git' }, scripts }, null, 2)}\n`;
const USER_GUIDE = '# User guide\n\nA step-by-step guide to configuring and using WingFoil **0.3.0** in your own project.\n\n## 2. Install\n\n```bash\nnpm install -g wingfoil\nwingfoil --version\n```\n';

/** The files the toolchain half reads at the point, beside the package's own scripts. */
const TOOL_FILES: Readonly<Record<string, string>> = {
  'package.json': toolPackageJson(),
  '.github/workflows/publish.yml': publishYml(PINNED_NODE),
  'docs/user-guide.md': USER_GUIDE,
  'docs/examples/lib.sh': 'step() { :; }\n',
  'docs/examples/01-first/run.sh': '#!/usr/bin/env bash\necho "OK: first"\n',
  'docs/examples/02-second/run.sh': '#!/usr/bin/env bash\necho "OK: second"\n',
};

/** A checkout-shaped directory (no git needed: the half reads the tree it is given) and a scratch directory. */
const toolDirs: string[] = [];
afterAll(() => toolDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function toolTree(files: Readonly<Record<string, string | null>> = {}): { tree: string; scratch: string } {
  const tree = mkdtempSync(join(tmpdir(), 'wf-rh-tool-tree-'));
  const scratch = mkdtempSync(join(tmpdir(), 'wf-rh-tool-out-'));
  toolDirs.push(tree, scratch);
  for (const [path, content] of Object.entries({ ...TOOL_FILES, ...files })) if (content !== null) writeFileAt(tree, path, content);
  return { tree, scratch };
}

function writeFileAt(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** jest's `--json` results: 10 tests, one failing, one skipped, one todo, one suite that failed to run. */
const jestJson = (tree: string): string => JSON.stringify({
  numTotalTests: 10, numPassedTests: 7, numFailedTests: 1, numPendingTests: 1, numTodoTests: 1, numFailedTestSuites: 2, numRuntimeErrorTestSuites: 1,
  testResults: [
    { name: join(tree, 'test', 'a.test.ts'), status: 'failed', message: '', assertionResults: [{ fullName: 'a works', status: 'failed' }, { fullName: 'a is fine', status: 'passed' }] },
    { name: join(tree, 'test', 'b.test.ts'), status: 'failed', message: 'Cannot find module', assertionResults: [], testExecError: { message: 'Cannot find module' } },
    { name: join(tree, 'test', 'c.test.ts'), status: 'passed', message: '', assertionResults: [{ fullName: 'c', status: 'passed' }] },
  ],
});

const metricCounts = (total: number, covered: number): { total: number; covered: number; skipped: number; pct: number } => ({ total, covered, skipped: 0, pct: Math.round((covered * 10000) / total) / 100 });
/** jest's `json-summary`: the totals, and the three critical modules (audit under the 90 % floor). */
const coverageSummary = (tree: string, files: readonly string[] = ['audit', 'commit-message', 'state-machine']): string => {
  const branches: Record<string, [number, number]> = { audit: [20, 17], 'commit-message': [40, 40], 'state-machine': [50, 46] };
  const out: Record<string, unknown> = {
    total: { lines: metricCounts(1000, 990), statements: metricCounts(1200, 1180), functions: metricCounts(300, 291), branches: metricCounts(500, 470), branchesTrue: metricCounts(1, 1) },
    [join(tree, 'src', 'core', 'index.ts')]: { lines: metricCounts(10, 10), statements: metricCounts(10, 10), functions: metricCounts(2, 2), branches: metricCounts(4, 4) },
  };
  for (const name of files) {
    const [total, covered] = branches[name]!;
    out[join(tree, 'src', 'memory', `${name}.ts`)] = { lines: metricCounts(10, 10), statements: metricCounts(10, 10), functions: metricCounts(2, 2), branches: metricCounts(total, covered) };
  }
  return JSON.stringify(out);
};

/** The latency pass's report as `test/core/helpers/latency.ts` `latencyReport` prints it, inside jest's console block. */
const latencyOutput = (machine: string, history: { marginal: number; total: number } = { marginal: 120, total: 330 }): string => [
  '  console.log',
  '    load average (1-min / 5-min): before 1.50 / 2.00, after 1.75 / 2.10 (one window: the commands are sampled interleaved)',
  `    machine: ${machine}`,
  '    floor (--version): p95 210 ms (n=25, min 190 ms, max 230 ms)',
  '    memory search: marginal p95 106 ms (n=25, min 80 ms, max 120 ms); total p95 287 ms (n=25, min 250 ms, max 300 ms)',
  '    dna show: marginal p95 60 ms (n=25, min 40 ms, max 70 ms); total p95 250 ms (n=25, min 230 ms, max 260 ms)',
  `    memory history: marginal p95 ${history.marginal} ms (n=25, min 90 ms, max ${history.marginal} ms); total p95 ${history.total} ms (n=25, min 280 ms, max ${history.total} ms)`,
  '',
  '      at Object.log (test/cli/command-latency.test.ts:114:15)',
].join('\n');

/**
 * Real npm stderr, copied verbatim but for the home directory (task-232 review F2): `npm ci` in a directory with no lockfile (npm 11.6.2), and
 * `npm view <missing package> version --json`. The last line of each is npm's log pointer, a home path and a timestamp.
 */
const NPM_CI_EUSAGE_STDERR = "npm error code EUSAGE\nnpm error\nnpm error The `npm ci` command can only install with an existing package-lock.json or\nnpm error npm-shrinkwrap.json with lockfileVersion >= 1. Run an install with npm@5 or\nnpm error later to generate a package-lock.json file, then try again.\nnpm error\nnpm error Clean install a project\nnpm error\nnpm error Usage:\nnpm error npm ci\nnpm error\nnpm error Options:\nnpm error [--install-strategy <hoisted|nested|shallow|linked>] [--legacy-bundling]\nnpm error [--global-style] [--omit <dev|optional|peer> [--omit <dev|optional|peer> ...]]\nnpm error [--include <prod|dev|optional|peer> [--include <prod|dev|optional|peer> ...]]\nnpm error [--strict-peer-deps] [--foreground-scripts] [--ignore-scripts] [--no-audit]\nnpm error [--no-bin-links] [--no-fund] [--dry-run]\nnpm error [-w|--workspace <workspace-name> [-w|--workspace <workspace-name> ...]]\nnpm error [--workspaces] [--include-workspace-root] [--install-links]\nnpm error\nnpm error aliases: clean-install, ic, install-clean, isntall-clean\nnpm error\nnpm error Run \"npm help ci\" for more info\nnpm error A complete log of this run can be found in: /home/user/.npm/_logs/2026-10-11T21_16_36_719Z-debug-0.log\n";
const NPM_VIEW_E404_STDERR = "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/wingfoil-no-such-package-xyz - Not found\nnpm error 404\nnpm error 404  The requested resource 'wingfoil-no-such-package-xyz@*' could not be found or you do not have permission to access it.\nnpm error 404\nnpm error 404 Note that you can also install from a\nnpm error 404 tarball, folder, http url, or git url.\nnpm error A complete log of this run can be found in: /home/user/.npm/_logs/2026-10-11T21_21_03_749Z-debug-0.log\n";

type Outcome = Partial<ToolResult> | ((call: ToolCall) => Partial<ToolResult>);

/** A stub runner: every step succeeds with a well-formed output unless `overrides` says otherwise; it records the calls. */
function stubTools(overrides: Readonly<Record<string, Outcome>> = {}): { tools: ToolRunner; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  const arg = (call: ToolCall, prefix: string): string => call.args.find((a) => a.startsWith(prefix))!.slice(prefix.length);
  const defaults: Record<string, Outcome> = {
    test: (call) => {
      writeFileSync(arg(call, '--outputFile='), jestJson(call.cwd));
      return { status: 1 };
    },
    coverage: (call) => {
      mkdirSync(arg(call, '--coverageDirectory='), { recursive: true });
      writeFileSync(join(arg(call, '--coverageDirectory='), 'coverage-summary.json'), coverageSummary(call.cwd));
      return { status: 1 };
    },
    latency: { status: 0, stdout: latencyOutput('otherwise idle') },
    'npm-view': { status: 0, stdout: '"0.3.0"\n' },
  };
  const tools: ToolRunner = (call) => {
    calls.push(call);
    const outcome = overrides[call.step] ?? defaults[call.step] ?? { status: 0 };
    // No stdout/stderr defaults: the runner reads a missing one as empty (and test/lint/no-fabricated-stderr.test.ts).
    return { status: 0, signal: null, ...(typeof outcome === 'function' ? outcome(call) : outcome) };
  };
  return { tools, calls };
}

function byId(entries: readonly MetricEntry[]): Record<string, MetricEntry> {
  return Object.fromEntries(entries.map((m) => [m.id, m]));
}

const TOOL_IDS = ['Q01', 'Q02', 'Q03', 'Q04', 'Q11', 'Q12', 'Q17'];

describe('the toolchain half — Q01–Q04, Q11, Q12, Q17 from stubbed tool outputs (task-232 AC 1)', () => {
  it('runs npm ci and then each metric\'s command in the tree, with the running Node first on PATH', async () => {
    const { tree, scratch } = toolTree();
    const { tools, calls } = stubTools();
    const entries = await measureToolchain(tree, scratch, { tools, maxWorkers: 2 });
    expect(entries.map((m) => m.id)).toEqual(TOOL_IDS);
    expect(calls.map((c) => c.step)).toEqual(['install', 'build', 'typecheck', 'lint', 'test', 'coverage', 'examples/01-first', 'examples/02-second', 'latency', 'npm-view']);
    expect(calls.map((c) => [c.command, ...c.args].join(' ')).slice(0, 4)).toEqual(['npm ci', 'npm run build', 'npm run typecheck', 'npm run lint']);
    for (const c of calls) {
      expect(c.cwd).toBe(tree);
      expect(String(c.env['PATH']).split(delimiter)[0]).toBe(dirname(process.execPath));
      expect(c.env['WINGFOIL_LATENCY']).toBeUndefined();
      expect(c.env['GIT_DIR']).toBeUndefined();
    }
    const step = (name: string): ToolCall => calls.find((c) => c.step === name)!;
    expect(step('test').args).toEqual(expect.arrayContaining(['test', '--', '--json', '--maxWorkers=2']));
    expect(step('coverage').args).toEqual(expect.arrayContaining(['run', 'test:coverage', '--', '--coverageReporters=json-summary', '--maxWorkers=2']));
    expect(step('test').args.find((a) => a.startsWith('--outputFile='))!.startsWith(`--outputFile=${scratch}`)).toBe(true);
    expect(step('examples/01-first')).toMatchObject({ command: 'bash', args: [join(tree, 'docs', 'examples', '01-first', 'run.sh')] });
    expect(step('examples/01-first').env['WINGFOIL']).toBe(`node ${join(tree, 'dist', 'cli.js')}`);
    expect(step('latency')).toMatchObject({ command: 'npm', args: ['run', 'test:latency'] });
    expect(step('latency').env['WINGFOIL_LATENCY_REPORT']).toBe('1');
    expect(step('npm-view')).toMatchObject({ command: 'npm', args: ['view', 'wingfoil', 'version', '--json'] });
  });

  it('Q01 — build, typecheck and lint: true when all three exit 0, else false naming each that did not', async () => {
    const first = toolTree();
    const green = byId(await measureToolchain(first.tree, first.scratch, { tools: stubTools().tools }));
    expect(green['Q01']).toMatchObject({ status: 'measured', value: true, raw: { build: 0, typecheck: 0, lint: 0 }, failing: [] });
    const { tree, scratch } = toolTree();
    const red = byId(await measureToolchain(tree, scratch, { tools: stubTools({ lint: { status: 1 } }).tools }));
    expect(red['Q01']).toMatchObject({ status: 'measured', value: false, raw: { build: 0, typecheck: 0, lint: 1 }, failing: ['npm run lint (exit 1)'] });
  });

  it('Q01 — an exit that means the npm script\'s tool could not run (eslint 2, a shell\'s 126/127) is not-measurable; an example\'s 126 is a measured failure (review F7, re-review N4)', async () => {
    const lint = toolTree();
    expect(byId(await measureToolchain(lint.tree, lint.scratch, { tools: stubTools({ lint: { status: 2 } }).tools }))['Q01'])
      .toMatchObject({ status: 'not-measurable', reason: 'npm run lint exited 2, which means the tool itself could not run' });
    const build = toolTree();
    const m = byId(await measureToolchain(build.tree, build.scratch, { tools: stubTools({ typecheck: { status: 127 }, 'examples/02-second': { status: 126 } }).tools }));
    expect(m['Q01']).toMatchObject({ status: 'not-measurable', reason: 'npm run typecheck exited 127, which means the tool itself could not run' });
    expect(m['Q01']).not.toHaveProperty('value');
    // Re-review N4 (coordinator ruling): bash runs run.sh by its absolute path, so an example's 126/127 is a command
    // missing inside the example, a defect it reports: a measured failure.
    expect(m['Q11']).toMatchObject({ status: 'measured', value: 50, failing: ['docs/examples/02-second/run.sh (exit 126)'] });
  });

  it('Q02 — total, failing and disabled tests read from jest\'s JSON, each failing test and broken suite named', async () => {
    const { tree, scratch } = toolTree();
    const q = byId(await measureToolchain(tree, scratch, { tools: stubTools().tools }))['Q02'];
    expect(q).toMatchObject({
      status: 'measured',
      value: { total: 10, failing: 2, disabled: 2 },
      raw: { total: 10, passed: 7, failed: 1, skipped: 1, todo: 1, failed_suites: 1 },
      failing: ['test/a.test.ts › a works', 'test/b.test.ts (suite failed to run)'],
    });
  });

  it('Q03 — the coverage totals with their counts; Q04 — branch coverage of the three critical modules, floor 90 % (AC 2)', async () => {
    const { tree, scratch } = toolTree();
    const m = byId(await measureToolchain(tree, scratch, { tools: stubTools().tools }));
    expect(m['Q03']).toMatchObject({
      status: 'measured',
      value: { statements: 98.33, branches: 94, functions: 97, lines: 99 },
      raw: { statements_covered: 1180, statements_total: 1200, branches_covered: 470, branches_total: 500, functions_covered: 291, functions_total: 300, lines_covered: 990, lines_total: 1000, files: 4 },
    });
    expect(m['Q04']).toMatchObject({
      status: 'measured',
      value: { 'src/memory/audit.ts': 85, 'src/memory/commit-message.ts': 100, 'src/memory/state-machine.ts': 92 },
      raw: { 'src/memory/audit.ts covered': 17, 'src/memory/audit.ts total': 20, 'src/memory/state-machine.ts covered': 46, 'src/memory/state-machine.ts total': 50 },
      failing: ['src/memory/audit.ts: branches 85% (17/20) < 90%'],
    });
  });

  it('Q04 — a critical module missing from the coverage summary is not-measurable, naming it', async () => {
    const { tree, scratch } = toolTree();
    const tools = stubTools({
      coverage: (call) => {
        const dir = call.args.find((a) => a.startsWith('--coverageDirectory='))!.slice('--coverageDirectory='.length);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'coverage-summary.json'), coverageSummary(call.cwd, ['audit', 'commit-message']));
        return { status: 0 };
      },
    }).tools;
    const m = byId(await measureToolchain(tree, scratch, { tools }));
    expect(m['Q04']).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('src/memory/state-machine.ts') });
    expect(m['Q03']).toMatchObject({ status: 'measured' });
  });

  it('Q11 — the share of docs/examples scripts that pass, each failing one named; none can run without the build', async () => {
    const { tree, scratch } = toolTree();
    const m = byId(await measureToolchain(tree, scratch, { tools: stubTools({ 'examples/01-first': { status: 1, stdout: 'FAIL: first' } }).tools }));
    expect(m['Q11']).toMatchObject({ status: 'measured', value: 50, raw: { executed: 2, passed: 1 }, failing: ['docs/examples/01-first/run.sh (exit 1)'] });
    const unbuilt = toolTree();
    const n = byId(await measureToolchain(unbuilt.tree, unbuilt.scratch, { tools: stubTools({ build: { status: 2 } }).tools }));
    expect(n['Q11']).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('npm run build') });
    expect(n['Q01']).toMatchObject({ value: false, failing: ['npm run build (exit 2)'] });
  });

  it('Q12 — the highest total p95 of the standard commands, with the floor, every p95 and the load of the run', async () => {
    const { tree, scratch } = toolTree();
    const m = byId(await measureToolchain(tree, scratch, { tools: stubTools({ latency: { status: 1, stdout: latencyOutput('otherwise idle', { marginal: 1010, total: 1200 }) } }).tools }));
    expect(m['Q12']).toMatchObject({
      status: 'measured',
      value: 1200,
      raw: {
        machine: 'otherwise idle', load_1m_before: 1.5, load_1m_after: 1.75, floor_p95_ms: 210,
        'memory search total_p95_ms': 287, 'memory search marginal_p95_ms': 106, 'dna show total_p95_ms': 250, 'memory history total_p95_ms': 1200, 'memory history marginal_p95_ms': 1010,
      },
      failing: ['memory history: total p95 1200 ms >= 1000 ms', 'memory history: marginal p95 1010 ms >= 1000 ms'],
    });
  });

  it('Q12 — a loaded run is not-measurable, quoting the suite\'s own verdict, and still records the load (R4)', async () => {
    const { tree, scratch } = toolTree();
    const loaded = 'loaded: floor p95 826 ms (n=25, min 700 ms, max 900 ms) >= 500 ms; load average (1-min / 5-min): before 18.00 / 12.00, after 19.00 / 13.00; not a REQ-PERF-02 measurement';
    const m = byId(await measureToolchain(tree, scratch, { tools: stubTools({ latency: { status: 1, stdout: latencyOutput(loaded) } }).tools }));
    expect(m['Q12']).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('loaded: floor p95 826 ms'), raw: { load_1m_before: 1.5, load_1m_after: 1.75, floor_p95_ms: 210 } });
    expect(m['Q12']).not.toHaveProperty('value');
  });

  it('Q17 — the documented install command resolves to the documented version through npm view', async () => {
    const { tree, scratch } = toolTree();
    const ok = byId(await measureToolchain(tree, scratch, { tools: stubTools().tools }));
    expect(ok['Q17']).toMatchObject({
      status: 'measured', value: true, failing: [],
      raw: { install_command: 'npm install -g wingfoil', documented: '0.3.0', resolved: '0.3.0', documented_in: 'docs/user-guide.md', resolved_from: 'the registry at run time' },
      evidence: { command: 'npm view wingfoil version --json' },
    });
    const stale = byId(await measureToolchain(tree, scratch, { tools: stubTools({ 'npm-view': { status: 0, stdout: '"0.2.2"\n' } }).tools }));
    expect(stale['Q17']).toMatchObject({ value: false, failing: ['npm install -g wingfoil resolves to 0.2.2, the documentation says 0.3.0'] });
    const offline = byId(await measureToolchain(tree, scratch, { tools: stubTools().tools, offline: true }));
    expect(offline['Q17']).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('offline') });
  });
});

describe('the toolchain half — a tool that fails is not-measurable with the reason, never a zero (task-232 AC 3)', () => {
  const noZero = (entries: readonly MetricEntry[]): void => {
    for (const m of entries) if (m.status !== 'measured') expect(m).not.toHaveProperty('value');
  };

  it('npm ci failing makes all seven not-measurable, naming npm ci and its last error line', async () => {
    const { tree, scratch } = toolTree();
    const { tools, calls } = stubTools({ install: { status: 1, stderr: NPM_CI_EUSAGE_STDERR } });
    const entries = await measureToolchain(tree, scratch, { tools });
    expect(entries.map((m) => [m.id, m.status, m.reason])).toEqual(TOOL_IDS.map((id) => [id, 'not-measurable', 'npm ci failed (exit 1): npm error code EUSAGE']));
    expect(calls.map((c) => c.step)).toEqual(['install']);
  });

  it('a script missing from package.json, a spawn error, a signal, unreadable output: each not-measurable', async () => {
    const scripts: Record<string, string> = { ...TOOL_SCRIPTS };
    delete scripts['lint'];
    delete scripts['test:latency'];
    const { tree, scratch } = toolTree({ 'package.json': toolPackageJson(scripts), 'docs/user-guide.md': '# Guide\n\nNo install here.\n' });
    const m = byId(await measureToolchain(tree, scratch, {
      tools: stubTools({
        test: { status: null, error: 'spawn npm ENOENT' },
        coverage: { status: null, signal: 'SIGKILL' },
        'examples/02-second': { status: null, error: 'spawn bash ENOENT' },
      }).tools,
    }));
    expect(m['Q01']).toMatchObject({ status: 'not-measurable', reason: 'package.json at the measurement point has no `lint` script' });
    expect(m['Q02']).toMatchObject({ status: 'not-measurable', reason: 'npm test could not run: spawn npm ENOENT' });
    expect(m['Q03']).toMatchObject({ status: 'not-measurable', reason: 'npm run test:coverage was killed by SIGKILL' });
    expect(m['Q04']).toMatchObject({ status: 'not-measurable', reason: 'npm run test:coverage was killed by SIGKILL' });
    expect(m['Q11']).toMatchObject({ status: 'not-measurable', reason: 'docs/examples/02-second/run.sh could not run: spawn bash ENOENT' });
    expect(m['Q12']).toMatchObject({ status: 'not-measurable', reason: 'package.json at the measurement point has no `test:latency` script' });
    expect(m['Q17']).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('no `npm install -g` command') });
    noZero(Object.values(m));
  });

  it('a reason names paths relative to the tree, never the random worktree path (re-review, as F2)', async () => {
    const { tree, scratch } = toolTree();
    const m = byId(await measureToolchain(tree, scratch, {
      tools: stubTools({ test: (call) => ({ status: 1, stderr: `Error: Cannot find module '${call.cwd}/dist/core/index.js' from ${call.cwd}\n` }) }).tools,
    }));
    expect(m['Q02']).toMatchObject({ status: 'not-measurable', reason: "npm test wrote no readable JSON results (exit 1): Error: Cannot find module 'dist/core/index.js' from ." });
  });

  it('jest leaving no JSON, a coverage run leaving no summary, a latency run printing no report: not-measurable', async () => {
    const { tree, scratch } = toolTree();
    const m = byId(await measureToolchain(tree, scratch, {
      tools: stubTools({ test: { status: 1, stderr: 'boom' }, coverage: { status: 1 }, latency: { status: 0, stdout: 'PASS test/cli/command-latency.test.ts\n' }, 'npm-view': { status: 1, stderr: NPM_VIEW_E404_STDERR } }).tools,
    }));
    expect(m['Q02']).toMatchObject({ status: 'not-measurable', reason: expect.stringMatching(/^npm test wrote no readable JSON results \(exit 1\)/) });
    expect(m['Q03']).toMatchObject({ status: 'not-measurable', reason: expect.stringMatching(/^npm run test:coverage wrote no readable coverage summary/) });
    expect(m['Q12']).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('printed no latency report') });
    expect(m['Q17']).toMatchObject({ status: 'not-measurable', reason: 'npm view wingfoil version --json failed (exit 1): npm error code E404' });
    for (const x of Object.values(m)) expect(x.reason ?? '').not.toMatch(/_logs|complete log/);
    noZero(Object.values(m));
  });
});

describe('the toolchain half — the pipeline\'s pinned Node (dl-089 §6, task-232 AC 1)', () => {
  it('a running Node other than publish.yml\'s NODE_VERSION makes the seven not-measurable, naming both, and runs nothing', async () => {
    const { tree, scratch } = toolTree({ '.github/workflows/publish.yml': publishYml('0.0.1') });
    const { tools, calls } = stubTools();
    const entries = await measureToolchain(tree, scratch, { tools });
    const reason = `the running Node ${process.version} is not the pipeline's pinned v0.0.1 (.github/workflows/publish.yml env.NODE_VERSION at the point): run under it, or pass --any-node`;
    expect(entries.map((m) => [m.id, m.status, m.reason])).toEqual(TOOL_IDS.map((id) => [id, 'not-measurable', reason]));
    expect(calls).toEqual([]);
  });

  it('--any-node measures anyway and records both versions on every entry', async () => {
    const { tree, scratch } = toolTree({ '.github/workflows/publish.yml': publishYml('0.0.1') });
    const entries = await measureToolchain(tree, scratch, { tools: stubTools().tools, anyNode: true });
    for (const m of entries) expect(m.raw).toMatchObject({ node: process.version, node_pinned: 'v0.0.1' });
    expect(byId(entries)['Q01']).toMatchObject({ status: 'measured', value: true });
  });

  it('a point with no pinned Node is refused the same way, unless --any-node', async () => {
    const { tree, scratch } = toolTree({ '.github/workflows/publish.yml': null });
    expect((await measureToolchain(tree, scratch, { tools: stubTools().tools }))[0]).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('no pinned Node') });
    const any = await measureToolchain(tree, scratch, { tools: stubTools().tools, anyNode: true });
    expect(any[0]!.raw).toMatchObject({ node: process.version, node_pinned: null });
  });
});

describe('measureRelease runs the toolchain half in its worktree (task-232)', () => {
  function toolFixture(): { repo: Repo; base: string; point: string } {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: { ...BASE_FILES, ...TOOL_FILES } });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    return { repo: r, base, point };
  }

  it('writes the seven entries in catalogue order, in a report the schema accepts, beside task-233\'s static half', async () => {
    const h = toolFixture();
    const { tools, calls } = stubTools();
    const report = await measureRelease(h.repo.root, { release: 'v0.2', at: h.point, previous: h.base, external: () => ({ ok: false, error: 'stub' }), tools });
    expect(TOOL_IDS.map((id) => entry(report, id).status)).toEqual(TOOL_IDS.map(() => 'measured'));
    expect(entry(report, 'Q05')).toMatchObject({ status: 'measured' });
    expect(calls[0]!.cwd).not.toBe(h.repo.root);
    expect(calls[0]!.cwd.startsWith(tmpdir())).toBe(true);
    expect(schemaErrors(report)).toEqual([]);
  });
});

describe('bug-329 — a signal removes the throw-away worktree and its directory, then re-raises', () => {
  it('SIGTERM during a tool: the handler removes the worktree and the directory, then dies on SIGTERM', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: { ...BASE_FILES, ...TOOL_FILES } });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    const worktreesBefore = git(r.root, ['worktree', 'list', '--porcelain']);
    const target = new EventEmitter();
    const died: string[] = [];
    let cwd = '';
    const { tools } = stubTools({
      test: (call) => {
        cwd = call.cwd;
        expect(existsSync(cwd)).toBe(true);
        target.emit('SIGTERM');
        return { status: null, signal: 'SIGTERM' };
      },
    });
    await expect(measureRelease(r.root, { release: 'v0.2', at: point, previous: base, offline: true, tools, interrupts: { target, die: (s) => void died.push(s) } })).rejects.toThrow('interrupted by SIGTERM');
    expect(died).toEqual(['SIGTERM']);
    expect(existsSync(dirname(cwd))).toBe(false);
    expect(git(r.root, ['worktree', 'list', '--porcelain'])).toBe(worktreesBefore);
    expect(target.listenerCount('SIGTERM') + target.listenerCount('SIGINT') + target.listenerCount('SIGHUP')).toBe(0);
  });

  it('a normal return removes the handlers too', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: { ...BASE_FILES, ...TOOL_FILES } });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    const target = new EventEmitter();
    await measureRelease(r.root, { release: 'v0.2', at: point, previous: base, offline: true, tools: stubTools().tools, interrupts: { target, die: () => undefined } });
    expect(target.eventNames()).toEqual([]);
  });

  it('a real process killed with SIGTERM while a tool runs leaves no worktree and no directory, and exits by the signal', async () => {
    const r = repo();
    // `build` hangs: the default runner spawns it through npm, so the handler has a real child to stop.
    const hang = toolPackageJson({ ...TOOL_SCRIPTS, build: 'node -e "setInterval(() => {}, 1000)"' });
    const base = r.commit('chore: configure wingfoil', { author: ADA, date: DAY0, files: { ...BASE_FILES, ...TOOL_FILES, 'package.json': hang } });
    const point = r.commit('docs: note', { files: { 'docs/note.md': 'Note.\n' } });
    const worktreesBefore = git(r.root, ['worktree', 'list', '--porcelain']);
    const script = [
      `const { measureRelease } = require(${JSON.stringify(join(REPO_ROOT, 'scripts', 'release-health', 'measure.cjs'))});`,
      `measureRelease(${JSON.stringify(r.root)}, { release: 'v0.2', at: ${JSON.stringify(point)}, previous: ${JSON.stringify(base)}, offline: true,`,
      '  log: (line) => process.stdout.write(line + "\\n") }).then(() => process.exit(3), (e) => { process.stderr.write(String(e) + "\\n"); process.exit(4); });',
    ].join('\n');
    const child = spawn(process.execPath, ['-e', script], { cwd: r.root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    await new Promise<void>((resolve) => {
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        if (/build: npm run build/.test(out)) resolve();
      });
      void exited.then(() => resolve());
    });
    child.kill('SIGTERM');
    const { code, signal } = await exited;
    expect({ code, signal, err }).toMatchObject({ code: null, signal: 'SIGTERM' });
    const tree = /in (\S+)\n/.exec(out)?.[1] ?? '';
    expect(tree).toMatch(/wf-release-health-/);
    expect(existsSync(dirname(tree))).toBe(false);
    expect(git(r.root, ['worktree', 'list', '--porcelain'])).toBe(worktreesBefore);
  });
});

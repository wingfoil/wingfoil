/**
 * task-233 — the static and Memory half of `scripts/release-health/measure.cjs` (`dl-089` §2): Q05–Q10, Q13–Q16 and
 * Q18–Q20, plus the production dependency count (`dl-010` Action 3) and `bug-331` (Q18/Q19 read `task.stop_the_line`'s
 * classification, not its threshold).
 *
 * Every figure is a known answer on a throwaway fixture repository; the ledger of `staticFixture` says what each file
 * and commit is built to show. Identities and dates go per command, never through `git config` (`dl-089` §6). No
 * clock, no network: the toolchain half is skipped (`toolchain: false`) except where a stub runner stands in for it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import yaml from 'js-yaml';

import { classifyTask, formatReportJson, measureRelease } from '../../scripts/release-health/measure.cjs';
import type { MetricEntry, Report, ToolCall, ToolResult, ToolRunner } from '../../scripts/release-health/measure.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const REPO_ROOT = join(__dirname, '..', '..');

// Every measure runs the static half (task-233), which loads ESLint and TypeScript once per test file (about 4 s)
// and lints and parses the fixture's files on each run: the default 5 s is too short for a hook or a test that measures.
jest.setTimeout(60_000);
const CATALOGUE = readFileSync(join(REPO_ROOT, 'docs', '08_health', 'metrics.yaml'), 'utf-8');

const ADA = { name: 'Ada Approver', email: 'ada@wingfoil.dev' };
const DEV = { name: 'Dev Eloper', email: 'dev@wingfoil.dev' };
const day = (n: number): string => `2026-09-${String(n).padStart(2, '0')}T10:00:00+00:00`;

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    template:
      frontmatter:
        values:
          kind: [ feature, fix ]
    stop_the_line:
      field: kind
      counts: fix
      blocks: feature
      open: "status not in [done, deprecated]"
      scope: release
      max_share: 30
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
      gates:
        pending: { reject: draft }
        in-review: { reject: in-progress }
  bug:
    path: "docs/memory/bugs/{id}.md"
    states:
      sequence: [draft, open, triaged, planned, in-progress, in-review, resolved, closed]
  decision-log:
    path: "docs/memory/dls/{id}.md"
    states:
      sequence: [draft, in-discussion, ready]
  release:
    path: "docs/memory/release/{id}.md"
    states:
      sequence: [draft, planning, in-development, releasing, released]
`;

const DNA_YAML = `version: 1.1
team:
  members:
    - name: ${ADA.name}
      email: ${ADA.email}
      roles: [ approver, developer ]
    - name: ${DEV.name}
      email: ${DEV.email}
      roles: [ developer ]
  agents: []
paths:
  sources: [ src/ ]
  tests: [ test/ ]
  health: [ docs/08_health/ ]
`;

const PACKAGE = { name: 'wingfoil', version: '0.3.0', repository: { type: 'git', url: 'git+https://github.com/wingfoil/wingfoil.git' }, dependencies: { 'js-yaml': '^4.1.0', 'left-pad': '^1.3.0' } };
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

// ── the sources (paths.sources) ─────────────────────────────────────────────────────────────────────────────

const ifs = (count: number, v: string): string => Array.from({ length: count }, (_, i) => `  if (${v} > ${i + 1}) r += ${i + 1};`).join('\n');
const adds = (count: number, v: string): string => Array.from({ length: count }, (_, i) => `  ${v} += ${i + 1};`).join('\n');
/** Eight lines two files share (a clone), and seven two others share (one short of a clone). */
const SHARED8 = [
  "  const list = ['alpha', 'beta', 'gamma'];",
  '  const upper = list.map((s) => s.toUpperCase());',
  "  const joined = upper.join(',');",
  "  const parts = joined.split(',');",
  '  const sizes = parts.map((p) => p.length);',
  '  const total = sizes.reduce((a, b) => a + b, 0);',
  '  const label = `total ${total}`;',
  '  const result = [label, joined];',
].join('\n');
const SHARED7 = [
  '  const n1 = seed + 1;',
  '  const n2 = n1 * 2;',
  '  const n3 = n2 - 3;',
  '  const n4 = n3 / 4;',
  '  const n5 = Math.floor(n4);',
  '  const n6 = Math.abs(n5);',
  '  const n7 = String(n6);',
].join('\n');

/** The sources at the base; the window adds src/core/fix.ts, feature.ts and flake.ts. */
const SOURCES: Readonly<Record<string, string>> = {
  // A runtime cycle a ↔ b (Q07); a comment citing a missing bug and an existing task (Q09, Q16).
  'src/core/a.ts': "// See bug-777 and task-004.\nimport { b } from './b';\nexport const a = (): number => b() + 1;\n",
  // Three comment lines (Q16).
  'src/core/b.ts': "import { a } from './a';\n\n/**\n * B.\n */\nexport function b(): number {\n  return 1;\n}\nexport const twice = (): number => a() * 2;\n",
  // c ↔ d import each other for types only: no runtime cycle (Q07); left-pad is imported for a type only (Q08).
  'src/core/c.ts': "import type { D } from './d';\nexport interface C {\n  d?: D;\n}\n",
  'src/core/d.ts': "import type { C } from './c';\nimport type { Pad } from 'left-pad';\nexport interface D {\n  c?: C;\n  pad?: Pad;\n}\n",
  'src/core/index.ts': "export { a } from './a';\nexport * from './c';\nimport yaml from 'js-yaml';\nexport const load = (text: string): unknown => yaml.load(text);\n",
  // Complexity 16 (above 15) and 15 (not above) (Q05).
  'src/core/complex.ts': `export function branchy(n: number): number {\n  let r = 0;\n${ifs(15, 'n')}\n  return r;\n}\n\nexport function edge(m: number): number {\n  let r = 0;\n${ifs(14, 'm')}\n  return r;\n}\n`,
  // 81 lines (above 80) and 80 lines (not above) (Q05).
  'src/core/long.ts': `export function long(): number {\n  let r = 0;\n${adds(77, 'r')}\n  return r;\n}\n\nexport function fits(): number {\n  let s = 0;\n${adds(76, 's')}\n  return s;\n}\n`,
  // An eight-line clone (Q06): 16 duplicated lines.
  'src/dup/one.ts': `export function one(): string[] {\n${SHARED8}\n  return [...result, 'one'];\n}\n`,
  'src/dup/two.ts': `export function two(): string[] {\n${SHARED8}\n  return result.reverse();\n}\n`,
  // Seven shared lines: not a clone (Q06).
  'src/dup/three.ts': `export function three(seed: number): string {\n${SHARED7}\n  return n7 + 'three';\n}\n`,
  'src/dup/four.ts': `export function four(seed: number): string {\n${SHARED7}\n  return n7.padStart(4);\n}\n`,
  'src/storage/io.ts': "export const read = (): string => '';\n",
  'src/memory/q.ts': "export const q = (): string => '';\n",
  // Two surfaces importing underneath src/core (Q07): one at runtime, one for a type; neither recorded.
  'src/cli/run.ts': "import { read } from '../storage/io';\nimport { a } from '../core';\nexport const run = (): string => read() + String(a());\n",
  'src/cli.ts': "import type { Doc } from './storage/io';\nexport const main = (doc?: Doc): void => undefined;\n",
  // A bypass that task-004's body records as a deviation (Q07).
  'src/mcp/serve.ts': "import { q } from '../memory/q';\nexport const serve = (): string => q();\n",
};
const FIX_TS = 'export const guard = (n: number): number => Math.max(n, 0);\n';
const FEATURE_TS = 'export const feature = (): string => \'big\';\n';
const FEATURE_TS_DOCUMENTED = `// Guide: see docs/guide.md.\n${FEATURE_TS}`;
const FLAKE_TS = 'export const stable = (): boolean => true;\n';

// ── the tests (paths.tests) ─────────────────────────────────────────────────────────────────────────────────

const TESTS: Readonly<Record<string, string>> = {
  // A comment citing REQ-SYS-01 and task-003; a title citing a missing bug; a string literal that is fixture data.
  'test/a.test.ts': "// Covers REQ-SYS-01 (task-003).\ndescribe('bug-888 — a title citing a missing bug', () => {\n  it('works', () => {\n    const fake = 'task-555';\n    expect(fake).toBe('task-555');\n  });\n});\n",
  // Fixtures are excluded: neither dl-999 (Q09) nor REQ-SYS-02 (Q10) counts.
  'test/fixtures/data.ts': "// dl-999 is fixture data.\nexport const REQ = 'REQ-SYS-02';\n",
};

const nonBlank = (files: Readonly<Record<string, string>>): number =>
  Object.values(files).reduce((sum, text) => sum + text.split('\n').filter((line) => line.trim() !== '').length, 0);
const SOURCES_AT_POINT = { ...SOURCES, 'src/core/fix.ts': FIX_TS, 'src/core/feature.ts': FEATURE_TS_DOCUMENTED, 'src/core/flake.ts': FLAKE_TS };
const SOURCE_LINES = nonBlank(SOURCES_AT_POINT);
const TEST_LINES = nonBlank(TESTS);

// ── Memory documents ────────────────────────────────────────────────────────────────────────────────────────

function doc(fields: Readonly<Record<string, string>>, body: string): string {
  return `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body}\n`;
}
const task = (id: string, status: string, release: string, extra: Readonly<Record<string, string>>, body: string): Record<string, string> => ({
  [`docs/memory/task/${id}.md`]: doc({ id: `"${id}"`, type: 'task', title: `"${id}"`, status, release: `"${release}"`, ...extra }, body),
});
const bug = (id: string, status: string, severity: string, release: string, body: string): Record<string, string> => ({
  [`docs/memory/bugs/${id}.md`]: doc({ id: `"${id}"`, type: 'bug', title: `"${id}"`, status, severity: `"${severity}"`, release: `"${release}"` }, body),
});
const dl = (id: string, status: string, body: string): Record<string, string> => ({
  [`docs/memory/dls/${id}.md`]: doc({ id: `"${id}"`, type: 'decision-log', title: `"${id}"`, status }, body),
});
const release = (id: string, version: string, status: string, extra: Readonly<Record<string, string>> = {}): Record<string, string> => ({
  [`docs/memory/release/${id}.md`]: doc({ id: `"${id}"`, type: 'release', title: `"${version}"`, status, version: `"${version}"`, ...extra }, 'Scope.'),
});

interface Repo {
  readonly root: string;
  commit(subject: string, date: string, files?: Readonly<Record<string, string>>, author?: typeof DEV): string;
}

const repos: string[] = [];
afterAll(() => repos.forEach(removeTempDir));

function repo(): Repo {
  const root = makeTempGitRepo();
  repos.push(root);
  return {
    root,
    commit(subject, date, files = {}, author = DEV) {
      for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
      git(root, ['add', '-A']);
      execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', subject], {
        cwd: root,
        env: { ...process.env, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email, GIT_COMMITTER_DATE: date },
      });
      return git(root, ['rev-parse', 'HEAD']).trim();
    },
  };
}

const CONFIG: Readonly<Record<string, string>> = {
  '.wingfoil/memory.yaml': MEMORY_YAML,
  '.wingfoil/dna.yaml': DNA_YAML,
  'docs/08_health/metrics.yaml': CATALOGUE,
  'package.json': json(PACKAGE),
  'package-lock.json': json({ name: 'wingfoil', lockfileVersion: 3, packages: {} }),
};

interface Fixture {
  readonly repo: Repo;
  readonly base: string;
  readonly point: string;
  readonly commitBacklog: string;
}

/**
 * The fixture. Before the window: dl-001 is added (day 1); the base (day 2) holds the configuration, the sources and
 * tests above, bug-001 (`open`, high) and bug-002 (`triaged`, medium, no release), task-010 (a v0.2 task) and the
 * release minor-v0.3 (`planning`, its `requirements:` naming two REQs). The window:
 *
 *  d3 wf(bug): add bug-003 … bug-007   five bugs added (Q13, Q15, Q20): 003 closed, 004 open low, 005 open high no
 *                                       release, 006 triaged medium, 007 deprecated
 *  d4 wf(task): add task-003, task-004  fix task-003 (bug-003); feature task-004 absorbs bug-004 and records the
 *                                       src/mcp/serve.ts deviation
 *  d5 wf(decision-log): add dl-002      in-discussion (Q14)
 *  d6 wf(decision-log): add dl-003      ready: not counted (Q14)
 *  d7 wf(release): approve minor-v0.3 [planning → in-development]   the commit-backlog commit (Q19)
 *  d8 wf(task): add task-006, 008, 009  added after commit-backlog: fix, feature, no kind (Q19)
 *  d9 fix(core): task-003 … (bug-003)   an executable line under src/: bug-003 is not a divergence (Q15)
 *  d9 feat(core): task-004 …            code, but it does not cite bug-004: not judged for it (Q15, the B4 handover)
 *  d9 docs: task-004 … (bug-004)        docs/ and a comment-only line under src/: bug-004 is a divergence (Q15)
 * d10 fix(core): task-006 …             cites the task, not bug-006 (Q15: bug-006 not classifiable)
 * d10 wf(bug): sync bug-006 … (task-006) a flow commit: never a fix commit (Q15)
 * d10 wf(bug): sync bug-001 [resolved → closed]
 * d11 docs: note                        the point
 */
function staticFixture(): Fixture {
  const r = repo();
  r.commit('wf(decision-log): add dl-001-alpha', day(1), dl('dl-001-alpha', 'in-discussion', 'Alpha.'), ADA);
  const base = r.commit('chore: configure wingfoil', day(2), {
    ...CONFIG,
    ...SOURCES,
    ...TESTS,
    'docs/backlog/v0.3.json': json([{ id: 'TASK-1', ref: 'REQ-SYS-01' }, { id: 'TASK-2', ref: 'REQ-SYS-02' }]),
    ...bug('bug-001-alpha', 'open', 'high', 'v0.3', 'A.'),
    ...bug('bug-002-beta', 'triaged', 'medium', '', 'B b.'),
    ...task('task-010-old', 'done', 'v0.2', {}, 'Old.'),
    ...release('minor-v0.3', 'v0.3', 'planning', { requirements: '"docs/backlog/v0.3.json"' }),
  }, ADA);
  r.commit('wf(bug): add bug-003-crash, bug-004-guide, bug-005-nofix, bug-006-flake, bug-007-dropped', day(3), {
    ...bug('bug-003-crash', 'closed', 'high', 'v0.3', 'C c c.'),
    ...bug('bug-004-guide', 'open', 'low', 'v0.3', 'D d d d.'),
    ...bug('bug-005-nofix', 'open', 'high', '', 'E e e e e.'),
    ...bug('bug-006-flake', 'triaged', 'medium', 'v0.3', 'F f f f f f.'),
    ...bug('bug-007-dropped', 'deprecated', 'low', 'v0.3', 'G g g g g g g.'),
  });
  r.commit('wf(task): add task-003-fix-crash, task-004-big-feature', day(4), {
    ...task('task-003-fix-crash', 'done', 'v0.3', { kind: 'fix', bug: '["bug-003"]' }, 'Fix the crash.'),
    ...task('task-004-big-feature', 'in-progress', 'v0.3', { kind: 'feature', bug: '["bug-004"]' }, 'Deviation: src/mcp/serve.ts imports src/memory directly.'),
  });
  r.commit('wf(decision-log): add dl-002-beta', day(5), dl('dl-002-beta', 'in-discussion', 'Beta beta.'));
  r.commit('wf(decision-log): add dl-003-gamma', day(6), dl('dl-003-gamma', 'ready', 'Gamma gamma gamma.'));
  const commitBacklog = r.commit('wf(release): approve minor-v0.3 [planning → in-development]', day(7), release('minor-v0.3', 'v0.3', 'in-development', { requirements: '"docs/backlog/v0.3.json"' }), ADA);
  r.commit('wf(task): add task-006-fix-flake, task-008-another-feature, task-009-unknown', day(8), {
    ...task('task-006-fix-flake', 'in-progress', 'v0.3', { kind: 'fix', bug: '["bug-006"]' }, 'Fix a flake now.'),
    ...task('task-008-another-feature', 'backlog', 'v0.3', { kind: 'feature' }, 'Add a thing.'),
    ...task('task-009-unknown', 'backlog', 'v0.3', {}, 'No kind here at all.'),
  });
  r.commit('fix(core): task-003 — guard the crash (bug-003)', day(9), { 'src/core/fix.ts': FIX_TS });
  r.commit('feat(core): task-004 — the big feature', day(9), { 'src/core/feature.ts': FEATURE_TS });
  r.commit('docs: task-004 — correct the guide (bug-004)', day(9), { 'docs/guide.md': 'The guide.\n', 'src/core/feature.ts': FEATURE_TS_DOCUMENTED });
  r.commit('fix(core): task-006 — stabilise the flake', day(10), { 'src/core/flake.ts': FLAKE_TS });
  r.commit('wf(bug): sync bug-006-flake [triaged → triaged] (task-006)', day(10), bug('bug-006-flake', 'triaged', 'medium', 'v0.3', 'F f f f f f.'));
  r.commit('wf(bug): sync bug-001-alpha [resolved → closed]', day(10), bug('bug-001-alpha', 'closed', 'high', 'v0.3', 'A.'));
  const point = r.commit('docs: note', day(11), { 'docs/note.md': 'Note.\n' });
  return { repo: r, base, point, commitBacklog };
}

function entry(report: Report, id: string): MetricEntry {
  const found = report.metrics.find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} in the report`);
  return found;
}

const OFFLINE = { offline: true, toolchain: false } as const;
const pct = (part: number, whole: number): number => Math.round((part * 10000) / whole) / 100;

describe('the static and Memory metrics on a fixture with known answers (task-233 AC 1)', () => {
  const f = staticFixture();
  let report: Report;
  beforeAll(async () => {
    report = await measureRelease(f.repo.root, { release: 'v0.3', at: f.point, previous: f.base, ...OFFLINE });
  });

  it('measures every metric of the quality half; none is left to an owning task any more', () => {
    for (const id of ['Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q13', 'Q14', 'Q15', 'Q16', 'Q18', 'Q19', 'Q20']) {
      expect([id, entry(report, id).status]).toEqual([id, 'measured']);
    }
    expect(report.metrics.filter((m) => /not written yet|task-233/.test(m.reason ?? ''))).toEqual([]);
  });

  it('Q05 — functions above complexity 15 and above 80 lines, each named (ESLint\'s complexity and max-lines-per-function)', () => {
    expect(entry(report, 'Q05')).toMatchObject({
      value: { complex: 1, long: 1 },
      raw: { functions_over_complexity: 1, functions_over_lines: 1 },
      failing: ["src/core/complex.ts:1 Function 'branchy': complexity 16", "src/core/long.ts:1 Function 'long': 81 lines"],
    });
  });

  it('Q06 — duplicated-line share of clones of at least 8 lines, per category; 7 shared lines are no clone', () => {
    expect(entry(report, 'Q06')).toMatchObject({
      value: { sources: pct(16, SOURCE_LINES), tests: 0 },
      raw: { sources_duplicated: 16, sources_lines: SOURCE_LINES, tests_duplicated: 0, tests_lines: TEST_LINES },
    });
  });

  it('Q07 — runtime import cycles (type-only imports erased) and unrecorded imports bypassing src/core (spec-006 §1)', () => {
    expect(entry(report, 'Q07')).toMatchObject({
      value: { cycles: 1, bypasses: 2 },
      raw: { cycles: 1, bypasses: 2, recorded_deviations: 1 },
      failing: [
        'bypass: src/cli.ts imports ./storage/io (src/storage)',
        'bypass: src/cli/run.ts imports ../storage/io (src/storage)',
        'cycle: src/core/a.ts → src/core/b.ts',
      ],
    });
  });

  it('Q08 — runtime dependencies no source imports at runtime; the dependency count (dl-010 Action 3, AC 4); no install size without the toolchain', () => {
    const q08 = entry(report, 'Q08');
    expect(q08).toMatchObject({
      value: { unused_runtime_dependencies: 1, install_size_bytes: null },
      raw: { runtime_dependencies: 2, runtime_dependencies_from: 'package.json dependencies at the point', unused: 1 },
      failing: ['left-pad'],
    });
    expect(String(q08.raw?.['install_size'])).toContain('--no-toolchain');
  });

  it('Q09 — process ids cited in comments and test titles that resolve to no Memory element; fixtures excluded', () => {
    expect(entry(report, 'Q09')).toMatchObject({
      value: 2,
      raw: { references: 4, dangling: 2 },
      failing: ['src/core/a.ts: bug-777', 'test/a.test.ts: bug-888'],
    });
  });

  it('Q10 — the share of the release\'s requirements cited by a test, each uncited one named', () => {
    expect(entry(report, 'Q10')).toMatchObject({ value: 50, raw: { cited: 1, total: 2 }, items: 2, small_sample: true, failing: ['REQ-SYS-02'] });
  });

  it('Q13 — bugs added and closed in the window, open bugs by severity and without a release', () => {
    expect(entry(report, 'Q13')).toMatchObject({
      value: { added: 5, closed: 2, closure_ratio: 40, open_unassigned: 2 },
      raw: { added: 5, closed: 2, open: 4, open_unassigned: 2, 'open high': 1, 'open medium': 2, 'open low': 1 },
      items: 5,
    });
  });

  it('Q14 — decision-logs in-discussion at the point, and their median age in days since their add commit', () => {
    expect(entry(report, 'Q14')).toMatchObject({ value: { count: 2, median_age_days: 8 }, raw: { in_discussion: 2, oldest_age_days: 10 } });
  });

  it('Q15 — document divergences among the bugs added, judged on the commits that cite the bug (the B4 handover)', () => {
    expect(entry(report, 'Q15')).toMatchObject({
      value: 50,
      raw: { divergences: 1, classified: 2, unclassified: 3, added: 5 },
      items: 5,
      failing: ['bug-004-guide'],
    });
  });

  it('Q16 — words per Memory document, median per type; the comment-line ratio of the sources', () => {
    expect(entry(report, 'Q16')).toMatchObject({
      value: { words_median: { bug: 4, 'decision-log': 2, release: 1, task: 3.5 }, comment_line_ratio: pct(5, SOURCE_LINES) },
      raw: { comment_lines: 5, non_blank_lines: SOURCE_LINES, 'bug documents': 7, 'decision-log documents': 3, 'release documents': 1, 'task documents': 6 },
    });
  });

  it('Q18 — the fix share of the release\'s tasks by `kind` (v0.3+); an absorbed bug stays a feature (AC 2, dl-133 §1)', () => {
    expect(entry(report, 'Q18')).toMatchObject({
      value: 50,
      raw: { fix: 2, feature: 2, unclassified: 1, tasks: 5, deprecated: 0, classified_by: 'kind', counts: 'fix' },
      items: 4,
    });
  });

  it('Q19 — the tasks added after the commit-backlog commit, split fix / feature, with the fix share (AC 2)', () => {
    expect(entry(report, 'Q19')).toMatchObject({
      value: { added_after: 3, fix: 1, feature: 1, unclassified: 1, fix_share: 50 },
      raw: { commit_backlog: f.commitBacklog },
      items: 3,
    });
  });

  it('Q20 — bugs moved to closed or deprecated minus bugs added; a negative flow breaches the floor', () => {
    expect(entry(report, 'Q20')).toMatchObject({
      value: -2,
      raw: { terminal: 3, added: 5 },
      failing: ['net flow -2: 3 bugs reached closed or deprecated, 5 were added'],
    });
  });

  it('is byte-identical on a second run at the same point (REQ-SYS-07)', async () => {
    const again = await measureRelease(f.repo.root, { release: 'v0.3', at: f.point, previous: f.base, ...OFFLINE });
    expect(formatReportJson(again)).toBe(formatReportJson(report));
  });
});

describe('Q18/Q19 before v0.3: the name-or-bug: heuristic (AC 2, dl-133 §1)', () => {
  const r = repo();
  const base = r.commit('chore: configure wingfoil', day(1), { ...CONFIG, ...SOURCES, ...release('minor-v0.2', 'v0.2', 'in-development') }, ADA);
  r.commit('wf(task): add task-020-fix-thing, task-021-absorb, task-022-feature, task-023-prefix-fixture-loader', day(2), {
    ...task('task-020-fix-thing', 'done', 'v0.2', {}, 'A fix by its name.'),
    // Declares kind: feature, but before v0.3 the heuristic decides: its bug: list makes it a fix.
    ...task('task-021-absorb', 'done', 'v0.2', { kind: 'feature', bug: '["bug-001"]' }, 'Absorbs a bug.'),
    ...task('task-022-feature', 'done', 'v0.2', {}, 'A feature.'),
    ...task('task-023-prefix-fixture-loader', 'done', 'v0.2', {}, 'A segment `fixture` is not `fix`.'),
  });
  const point = r.commit('wf(release): approve minor-v0.2 [releasing → released]', day(3), release('minor-v0.2', 'v0.2', 'released'), ADA);
  let report: Report;
  beforeAll(async () => {
    report = await measureRelease(r.root, { release: 'v0.2', at: point, previous: base, ...OFFLINE });
  });

  it('Q18 classifies v0.2 tasks by an id segment `fix` or a non-empty bug:, whatever their kind', () => {
    expect(entry(report, 'Q18')).toMatchObject({ value: 50, raw: { fix: 2, feature: 2, unclassified: 0, tasks: 4, classified_by: 'heuristic (name or bug:)' } });
  });

  it('Q19 with no commit-backlog transition of the release is not-measurable, with the reason; Q10 with no requirements: too', () => {
    expect(entry(report, 'Q19')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('commit-backlog') });
    expect(entry(report, 'Q19')).not.toHaveProperty('value');
    expect(entry(report, 'Q10')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('requirements:') });
  });

  it('this repository\'s v0.2 tasks: 46 fix of 75, dl-133\'s baseline (characterization)', () => {
    const tasks = readdirSync(join(REPO_ROOT, 'docs', '04_memory'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => readdirSync(join(REPO_ROOT, 'docs', '04_memory', d.name)).filter((n) => /^task-\d+.*\.md$/.test(n)).map((n) => join(REPO_ROOT, 'docs', '04_memory', d.name, n)))
      .map((path) => {
        const text = readFileSync(path, 'utf-8');
        return yaml.load(text.slice(3, text.indexOf('\n---', 3))) as Record<string, unknown>;
      })
      .filter((fm) => fm['release'] === 'v0.2');
    const kinds = tasks.map((fm) => classifyTask(fm, { version: 'v0.2', field: 'kind', counts: 'fix', values: ['feature', 'fix'] }));
    expect({ tasks: tasks.length, fix: kinds.filter((k) => k === 'fix').length }).toEqual({ tasks: 75, fix: 46 });
  });
});

describe('Q05 — a source that does not parse is not-measurable, never a zero', () => {
  it('names the file', async () => {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', day(1), { ...CONFIG, ...release('minor-v0.3', 'v0.3', 'in-development') }, ADA);
    const point = r.commit('feat(core): task-001 — broken', day(2), { 'src/broken.ts': 'export const = ;\n' });
    const report = await measureRelease(r.root, { release: 'v0.3', at: point, previous: base, ...OFFLINE });
    expect(entry(report, 'Q05')).toMatchObject({ status: 'not-measurable', reason: expect.stringContaining('src/broken.ts') });
    expect(entry(report, 'Q05')).not.toHaveProperty('value');
  });
});

// ── Q08's install size and dependency count from the toolchain's npm ci (stubbed, R4) ──────────────────────

const toolPackage = { ...PACKAGE, scripts: { build: 'tsc', typecheck: 'tsc --noEmit', lint: 'eslint .', test: 'jest', 'test:coverage': 'jest --coverage', 'test:latency': 'jest' } };
const TOOL_CONFIG = { ...CONFIG, 'package.json': json(toolPackage), '.github/workflows/publish.yml': `name: publish\nenv:\n  NODE_VERSION: '${process.version.slice(1)}'\njobs: {}\n` };

/**
 * `npm ls --omit=dev --all --json --long`, trimmed to the keys the reader uses, in the shape of a real run (npm 11.6.2 in
 * this repository): the root's path, and per package its version, name, path and nested dependencies.
 */
function npmLsLong(tree: string): string {
  const pkg = (name: string, version: string, path: string, dependencies: Record<string, unknown> = {}): Record<string, unknown> =>
    ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, overridden: false, name, _id: `${name}@${version}`, extraneous: false, path, _dependencies: {}, devDependencies: {}, peerDependencies: {}, dependencies });
  return JSON.stringify({
    version: '0.3.0',
    name: 'wingfoil',
    _id: 'wingfoil@0.3.0',
    extraneous: false,
    path: tree,
    dependencies: {
      'js-yaml': pkg('js-yaml', '4.3.2', join(tree, 'node_modules', 'js-yaml'), { argparse: pkg('argparse', '2.0.1', join(tree, 'node_modules', 'js-yaml', 'node_modules', 'argparse')) }),
      'left-pad': pkg('left-pad', '1.3.0', join(tree, 'node_modules', 'left-pad')),
    },
  }, null, 2);
}

/** `npm pack --dry-run --json --ignore-scripts`, trimmed, in the shape of a real run (npm 11.6.2). */
const NPM_PACK = JSON.stringify([{ id: 'wingfoil@0.3.0', name: 'wingfoil', version: '0.3.0', size: 300, unpackedSize: 1000, shasum: '0'.repeat(40), integrity: 'sha512-x', filename: 'wingfoil-0.3.0.tgz', files: [{ path: 'package.json', size: 1000, mode: 420 }], entryCount: 1, bundled: [] }], null, 2);

function writeAt(root: string, path: string, bytes: number): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), 'x'.repeat(bytes));
}

function footprintTools(overrides: Readonly<Record<string, (call: ToolCall) => Partial<ToolResult>>> = {}): { tools: ToolRunner; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  const defaults: Record<string, (call: ToolCall) => Partial<ToolResult>> = {
    'footprint-ls': (call) => {
      writeAt(call.cwd, 'node_modules/js-yaml/index.js', 100);
      writeAt(call.cwd, 'node_modules/js-yaml/node_modules/argparse/a.js', 50);
      writeAt(call.cwd, 'node_modules/left-pad/i.js', 30);
      return { status: 0, stdout: npmLsLong(call.cwd) };
    },
    'footprint-pack': () => ({ status: 0, stdout: NPM_PACK }),
  };
  const tools: ToolRunner = (call) => {
    calls.push(call);
    const outcome = overrides[call.step] ?? defaults[call.step];
    return { status: 0, signal: null, ...(outcome ? outcome(call) : {}) };
  };
  return { tools, calls };
}

describe('Q08 with the toolchain half: install size and the npm ls dependency count (AC 4)', () => {
  function toolFixture(): { root: string; base: string; point: string } {
    const r = repo();
    const base = r.commit('chore: configure wingfoil', day(1), { ...TOOL_CONFIG, ...SOURCES, ...release('minor-v0.3', 'v0.3', 'in-development') }, ADA);
    const point = r.commit('docs: note', day(2), { 'docs/note.md': 'Note.\n' });
    return { root: r.root, base, point };
  }

  it('runs npm ls and npm pack in the tree after the toolchain, and adds the packages\' bytes to the tarball\'s', async () => {
    const t = toolFixture();
    const { tools, calls } = footprintTools();
    const report = await measureRelease(t.root, { release: 'v0.3', at: t.point, previous: t.base, offline: true, tools });
    const step = (name: string): ToolCall => calls.find((c) => c.step === name)!;
    expect([step('footprint-ls').command, ...step('footprint-ls').args]).toEqual(['npm', 'ls', '--omit=dev', '--all', '--json', '--long']);
    expect([step('footprint-pack').command, ...step('footprint-pack').args]).toEqual(['npm', 'pack', '--dry-run', '--json', '--ignore-scripts']);
    expect(calls.map((c) => c.step).indexOf('footprint-ls')).toBeGreaterThan(calls.map((c) => c.step).indexOf('install'));
    expect(entry(report, 'Q08')).toMatchObject({
      value: { unused_runtime_dependencies: 1, install_size_bytes: 1180 },
      raw: { runtime_dependencies: 2, runtime_dependencies_from: 'npm ls --omit=dev --depth=0', transitive_runtime_packages: 3, own_unpacked_bytes: 1000, dependencies_bytes: 180 },
      failing: ['left-pad'],
    });
  });

  it('an npm ls that fails leaves the install size null with the reason, the count from package.json, never a zero', async () => {
    const t = toolFixture();
    const { tools } = footprintTools({ 'footprint-ls': () => ({ status: 1, stderr: 'npm error code ELSPROBLEMS\nnpm error missing: left-pad@^1.3.0, required by wingfoil@0.3.0\n' }) });
    const report = await measureRelease(t.root, { release: 'v0.3', at: t.point, previous: t.base, offline: true, tools });
    const q08 = entry(report, 'Q08');
    expect(q08).toMatchObject({ value: { unused_runtime_dependencies: 1, install_size_bytes: null }, raw: { runtime_dependencies: 2, runtime_dependencies_from: 'package.json dependencies at the point' } });
    expect(String(q08.raw?.['install_size'])).toContain('ELSPROBLEMS');
  });
});

describe('classifyTask — the classification Q18/Q19 share with memory.yaml task.stop_the_line (bug-331)', () => {
  const rule = { version: 'v0.3', field: 'kind', counts: 'fix', values: ['feature', 'fix'] };
  it('from v0.3 reads the declared field: counts → fix, the other declared value → feature, else unclassified', () => {
    expect(classifyTask({ id: 'task-1-fix-x', kind: 'feature', bug: ['bug-1'] }, rule)).toBe('feature');
    expect(classifyTask({ id: 'task-2-y', kind: 'fix' }, rule)).toBe('fix');
    expect(classifyTask({ id: 'task-3-fix-z' }, rule)).toBeNull();
    expect(classifyTask({ id: 'task-4-w', kind: 'chore' }, rule)).toBeNull();
    expect(classifyTask({ id: 'task-5-v', category: 'bugfix' }, { ...rule, field: 'category', counts: 'bugfix', values: ['bugfix', 'feature'] })).toBe('fix');
  });
});

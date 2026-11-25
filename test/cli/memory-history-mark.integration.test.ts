/**
 * task-378 AC 1 and AC 2 (red-first; `bug-496`, `bug-287`; `spec-020` §4.13, T-34, T-36, T-37 and `spec-008` §12, as
 * amended at the design gate; design D1 (a), D2 (a)) — `wingfoil memory history` and `wingfoil memory search --verify`
 * through the REAL compiled `dist/cli.js`, beside `wingfoil verify` on the same throwaway repositories
 * (`test/core/helpers/history-mark-fixture.ts`).
 *
 * - AC 2 / T-34: on T-8's repository the set of entries `memory history` marks is the set of commits `verify`'s
 *   `authority` findings name, and the marked entry's `unverified` equals those findings (`rule`, `check`, `message`),
 *   in `spec-020` §3's order.
 * - AC 1 / T-37: the second task's marked entry equals `verify`'s findings on that commit; the first task's entry for
 *   the same commit is not marked.
 * - AC 1 / T-36: `memory search --verify --format json` marks T-9's `t-1` with the `docs: tidy` sha and no match of
 *   T-1's shape; `memory search --help` lists `--verify`; `--format console` prints the json form (the same keys and
 *   values) and `--format yaml` parses to it, for `memory history` and for `memory search --verify`.
 * - The BDD scenarios committed at `79b0525c9`, one test each, titled with the scenario's name:
 *   `P1.10-memory-history.feature` "Edge - an entry no check verified is marked" and "Each entry reports the content
 *   its submit declared", `P1.5-memory-search.feature` "Mark the matches whose history no check verified".
 *
 * Every child runs with `withoutAgentMarkers(process.env)`.
 *
 * Expected values: the T-8 and T-9 messages were printed by `node dist/cli.js verify --format json --project <scratch>`
 * on scratch repositories of the same commits (the red notes name the runs); here each mark is compared with the verb's
 * own report on the same repository.
 *
 * Expected red: no entry carries `unverified` or `carries` today, and `memory search` refuses `--verify` with
 * `error: unknown option '--verify'` (exit 2). `dist/` is built once by jest's `globalSetup`.
 */
import { load } from 'js-yaml';

import { removeTempDir } from '../storage/helpers/git-fixture';
import {
  APPROVER,
  DEVELOPER,
  STRANGER,
  TASK,
  approvalBody,
} from '../core/helpers/in-memory-history-reader';
import {
  ENTRY_KEYS,
  MARK_DNA,
  MarkFixture,
  NO_ROLE,
  OTHER,
  VERB_TASK,
  t1,
  t37,
  t8,
  t9,
  verbFixture,
} from '../core/helpers/history-mark-fixture';

jest.setTimeout(180_000);

interface Mark {
  readonly rule: string;
  readonly check: string;
  readonly message: string;
}

interface HistoryEntry {
  readonly sha: string;
  readonly operation: string | null;
  readonly subject: string;
  readonly carries?: readonly string[] | null;
  readonly unverified?: readonly Mark[];
}

interface HistoryValue {
  readonly entries: readonly HistoryEntry[];
}

interface VerifyReport {
  readonly findings: readonly { sha: string; rule: string; check: string; message: string }[];
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

function keep<T extends { f: MarkFixture } | MarkFixture>(fixture: T): T {
  roots.push('f' in fixture ? fixture.f.root : fixture.root);
  return fixture;
}

/** A json run's parsed stdout; the exit and stderr are checked first, so a refusal reads as one. */
function json<T>(f: MarkFixture, args: readonly string[]): T {
  const run = f.wingfoil([...args, '--format', 'json']);
  expect({ args: args.join(' '), status: run.status, stderr: run.stderr }).toEqual({ args: args.join(' '), status: 0, stderr: '' });
  return JSON.parse(run.stdout) as T;
}

/** `verify --format json`'s report (whole history: exit 1 when gated findings exist, the report on stdout either way). */
function verifyReport(f: MarkFixture): VerifyReport {
  const run = f.wingfoil(['verify', '--format', 'json']);
  if (run.stdout.trim() === '') throw new Error(`no verify report (exit ${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout) as VerifyReport;
}

const marks = (report: VerifyReport, sha: string): Mark[] =>
  report.findings.filter((entry) => entry.sha === sha).map((entry) => ({ rule: entry.rule, check: entry.check, message: entry.message }));

const marked = (value: HistoryValue): HistoryEntry[] => value.entries.filter((entry) => 'unverified' in entry);

describe('task-378 AC 2 — on T-8\'s repository the marked entry is the commit verify\'s authority check names (T-34)', () => {
  it('the marked shas are the authority findings\' shas, and the entry\'s messages are theirs, in §3\'s order', () => {
    const { f, bad } = keep(t8());
    const report = verifyReport(f);
    const authority = report.findings.filter((entry) => entry.check === 'authority');
    expect(authority.map((entry) => entry.message)).toEqual([OTHER('nobody@example.invalid', STRANGER.email), NO_ROLE(STRANGER.email)]);
    const value = json<HistoryValue>(f, ['memory', 'history', 't-1']);
    expect(marked(value).map((entry) => entry.sha)).toEqual([...new Set(authority.map((entry) => entry.sha))]);
    expect(marked(value).map((entry) => entry.sha)).toEqual([bad]);
    expect(value.entries.find((entry) => entry.sha === bad)?.unverified).toEqual(authority.map((entry) => ({ rule: entry.rule, check: entry.check, message: entry.message })));
  });
});

describe('task-378 AC 1 — a commit that touches two documents marks only the one whose transition is wrong (T-37)', () => {
  it('t-2\'s entry carries verify\'s mismatch finding on that commit; t-1\'s entry for the same commit is not marked', () => {
    const { f, bad } = keep(t37());
    const expected = marks(verifyReport(f), bad);
    expect(expected).toEqual([{ rule: 'state', check: 'state', message: `${TASK('t-2')}: the bracket declares pending → backlog, the frontmatter went pending → in-progress` }]);
    const second = json<HistoryValue>(f, ['memory', 'history', 't-2']);
    expect(second.entries.find((entry) => entry.sha === bad)?.unverified).toEqual(expected);
    const first = json<HistoryValue>(f, ['memory', 'history', 't-1']);
    expect(first.entries.some((entry) => entry.sha === bad)).toBe(true);
    expect(marked(first)).toEqual([]);
    expect(first.entries.map((entry) => Object.keys(entry))).toEqual(first.entries.map(() => ENTRY_KEYS));
  });
});

describe('task-378 AC 1 — memory history and memory search --verify through the CLI (T-36)', () => {
  it('memory history on T-9: the docs: tidy entry is marked, as verify reports it; console prints the json form, yaml parses to it', () => {
    const { f, tidy } = keep(t9());
    const value = json<HistoryValue>(f, ['memory', 'history', 't-1']);
    expect(marked(value).map((entry) => [entry.sha, entry.unverified])).toEqual([[tidy, marks(verifyReport(f), tidy)]]);
    const consoleRun = f.wingfoil(['memory', 'history', 't-1', '--format', 'console']);
    expect(consoleRun.status).toBe(0);
    expect(JSON.parse(consoleRun.stdout)).toEqual(value);
    const yaml = f.wingfoil(['memory', 'history', 't-1', '--format', 'yaml']);
    expect(yaml.status).toBe(0);
    expect(load(yaml.stdout)).toEqual(value);
  });

  it('memory search --verify on T-9 marks t-1 with the docs: tidy sha; console prints the json form, yaml parses to it', () => {
    const { f, tidy } = keep(t9());
    const value = json<{ matches: { id: string; unverified?: string[] }[] }>(f, ['memory', 'search', '--verify']);
    expect(value.matches.map((match) => [match.id, match.unverified])).toEqual([['t-1', [tidy]]]);
    const consoleRun = f.wingfoil(['memory', 'search', '--verify', '--format', 'console']);
    expect(consoleRun.status).toBe(0);
    expect(JSON.parse(consoleRun.stdout)).toEqual(value);
    const yaml = f.wingfoil(['memory', 'search', '--verify', '--format', 'yaml']);
    expect(yaml.status).toBe(0);
    expect(load(yaml.stdout)).toEqual(value);
  });

  it("memory search --verify on T-1's shape marks no match; without the flag no match has the key either", () => {
    const f = keep(t1());
    const verified = json<{ matches: { id: string; unverified?: string[] }[] }>(f, ['memory', 'search', '--verify']);
    expect(verified.matches.map((match) => match.id)).toEqual(expect.arrayContaining(['task-001-approve-me', 'task-002-reject-me']));
    expect(verified.matches.filter((match) => 'unverified' in match)).toEqual([]);
    const plain = json<{ matches: { id: string; unverified?: string[] }[] }>(f, ['memory', 'search']);
    expect(verified).toEqual(plain);
  });

  it('memory search --help lists --verify', () => {
    const f = keep(verbFixture());
    const run = f.wingfoil(['memory', 'search', '--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^\s+--verify\b/m);
  });
});

describe('task-378 — P1.10-memory-history.feature, one test per scenario', () => {
  const DECISION_MEMORY_YAML = `version: 1
types:
  decision-log:
    path: "docs/memory/dls/{id}.md"
    states:
      sequence: [draft, in-discussion, ready]
      gates:
        in-discussion: { reject: draft }
`;
  const DECISION = 'docs/memory/dls/decision-12.md';
  const decisionDoc = (status: string, body = 'Body.'): string =>
    ['---', 'id: "decision-12"', 'type: decision-log', 'title: "Decision 12"', `status: ${status}`, '---', '', body, ''].join('\n');

  function decisionFixture(): MarkFixture {
    const f = keep(new MarkFixture());
    f.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': DECISION_MEMORY_YAML, '.wingfoil/dna.yaml': MARK_DNA });
    f.commit('wf(decision-log): add decision-12', { [DECISION]: decisionDoc('draft') });
    return f;
  }

  it('Edge - an entry no check verified is marked', () => {
    const f = decisionFixture();
    f.commit('wf(decision-log): submit decision-12', { [DECISION]: decisionDoc('in-discussion') });
    const forged = f.commit(
      'wf(decision-log): approve decision-12 [in-discussion → ready]\n\nApprover: Nobody <nobody@example.invalid> (approver)\nReason: Looks fine.',
      { [DECISION]: decisionDoc('ready') },
      STRANGER,
    );
    const expected = marks(verifyReport(f), forged);
    expect(expected.map((entry) => entry.check)).toEqual(['authority', 'authority']);
    const value = json<HistoryValue>(f, ['memory', 'history', 'decision-12']);
    expect(value.entries.find((entry) => entry.sha === forged)?.unverified).toEqual(expected);
    expect(marked(value).map((entry) => entry.sha)).toEqual([forged]);
    for (const entry of value.entries.filter((candidate) => candidate.sha !== forged)) expect(Object.keys(entry)).toEqual(ENTRY_KEYS);
  });

  it('Each entry reports the content its submit declared', () => {
    const f = decisionFixture();
    f.edit(DECISION, 'Body.', 'The decision, written out.');
    f.run(['memory', 'submit', 'decision-12']);
    f.commit(`wf(decision-log): approve decision-12 [in-discussion → ready]\n\n${approvalBody('Ratified.')}`, { [DECISION]: decisionDoc('ready', 'The decision, written out.') }, APPROVER);
    const value = json<HistoryValue>(f, ['memory', 'history', 'decision-12']);
    expect(value.entries.map((entry) => [entry.operation, entry.carries])).toEqual([
      ['add', null],
      ['submit', ['the body']],
      ['approve', null],
    ]);
  });
});

describe('task-378 — P1.5-memory-search.feature, one test per scenario', () => {
  it('Mark the matches whose history no check verified', () => {
    const f = keep(verbFixture());
    f.run(['memory', 'add', '--type', 'task', '--title', 'One']);
    f.run(['memory', 'submit', 'task-001-one']);
    f.run(['memory', 'add', '--type', 'task', '--title', 'Two']);
    f.edit(VERB_TASK('task-002-two'), '<!-- body -->', 'The scope.');
    f.run(['memory', 'submit', 'task-002-two']);
    f.edit(VERB_TASK('task-001-one'), 'status: pending', 'status: backlog');
    const tidy = f.commit('docs: tidy', {}, DEVELOPER);
    const value = json<{ matches: { id: string; unverified?: string[] }[] }>(f, ['memory', 'search', '--verify']);
    const byId = new Map(value.matches.map((match) => [match.id, match]));
    expect(byId.get('task-001-one')?.unverified).toEqual([tidy]);
    expect(byId.get('task-002-two')).toBeDefined();
    expect('unverified' in (byId.get('task-002-two') ?? {})).toBe(false);
  });
});

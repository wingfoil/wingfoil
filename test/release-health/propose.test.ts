/**
 * task-241 AC 2 (red-first) — `compare.cjs` drafts the Proposals section (`dl-089` §4, approver ruling E): for each
 * finding — a breached floor, or a regressed trend metric outside small-sample — it searches Memory for a
 * tracking element before proposing anything; an untracked finding becomes a proposal `RH-<version>-NN`, `bug` for
 * a breached floor and `decision-log` for a regressed trend, targeting the next minor (ruling F). G07, G10 and G14
 * breaches, and Q01/Q02 breaches at a published tag, are flagged for immediate `bug-ingest` (`dl-089` §5). The
 * previous run's proposals are settled from the retrospective's `## Release health` table (ruling G).
 *
 * The search is a stub returning what `wingfoil memory search <id> --format json` prints; the state machines come
 * from a fixture `memory.yaml` (a tracking element is one whose status is neither its type's last `sequence` state
 * nor `deprecated`). One block spawns `compare.cjs` with the real search (the built `dist/cli.js`) in a temporary
 * repository holding no Memory element, to see the immediate finding named on stderr.
 *
 * Deterministic: fixed fixture reports, no clock, no network.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import type { MetricEntry, Report } from '../../scripts/release-health/measure.cjs';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { COMPARE_SCRIPT, FIXTURES, REPO_ROOT, fixtureReport, liveCatalogue, loadCompare, section, withEntry } from './helpers/compare-api';
import type { Comparison, SearchMatch, SearchResult } from './helpers/compare-api';

const CATALOGUE = liveCatalogue();

const MEMORY_YAML = yamlLoad(`version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog, in-progress, in-review, approved, done]
  bug:
    path: "docs/memory/bugs/{id}.md"
    states:
      sequence: [draft, open, triaged, planned, in-progress, in-review, resolved, closed]
  decision-log:
    path: "docs/memory/dls/{id}.md"
    states:
      sequence: [draft, in-discussion, ready]
  change-proposal:
    path: "docs/memory/cps/{id}.md"
    states:
      sequence: [draft, in-analysis, accepted, scheduled]
  adr:
    path: "docs/memory/adrs/{id}.md"
    states:
      sequence: [draft, pending, accepted, superseded]
`);

const SHA = (c: string): string => c.repeat(40);

function floorBreach(id: string, value: unknown, failing: string[] = []): Omit<MetricEntry, 'id'> {
  return { status: 'measured', value, items: 40, small_sample: false, failing };
}

/** v0.2 against v0.1 with two findings: G04 regressed (a trend, mean +20 %) and G07 breached (a floor). */
function twoFindings(): Report {
  const g04 = withEntry(fixtureReport('v0.2'), 'G04', { status: 'measured', value: { mean: 60, share_over_72: 5 }, raw: { over_72: 2, total: 40, characters: 2400 }, items: 40, small_sample: false, failing: [] });
  return withEntry(g04, 'G07', floorBreach('G07', 2, [SHA('a'), SHA('b')]));
}

async function compareWith(current: Report): Promise<Comparison> {
  return loadCompare().compareReports({ catalogue: CATALOGUE, current, previous: fixtureReport('v0.1'), history: [fixtureReport('v0.1'), current] });
}

function stub(answers: Readonly<Record<string, readonly SearchMatch[]>>): jest.Mock<SearchResult, [string]> {
  return jest.fn((keyword: string): SearchResult => ({ query: keyword, matches: answers[keyword] ?? [] }));
}

/** The `### RH-…` entries of the Proposals section, by heading. */
function proposals(markdown: string): Record<string, string> {
  const body = section(markdown, 'Proposals');
  const out: Record<string, string> = {};
  for (const chunk of body.split(/^(?=### )/m).filter((c) => c.startsWith('### '))) out[chunk.split('\n')[0]!] = chunk;
  return out;
}

async function proposedMarkdown(current: Report, search: jest.Mock<SearchResult, [string]>): Promise<string> {
  const { propose, renderReport } = loadCompare();
  return renderReport(await propose(await compareWith(current), { search, memoryYaml: MEMORY_YAML }));
}

const IMMEDIATE = '- Immediate: file through bug-ingest in this run (dl-089 §5)';

describe('propose — search Memory before proposing (dl-089 §4)', () => {
  it('searches once per finding, with the metric id, in catalogue order', async () => {
    const search = stub({});
    await proposedMarkdown(twoFindings(), search);
    expect(search.mock.calls.map((call) => call[0])).toEqual(['G04', 'G07']);
  });

  it('an open element that matches tracks the finding: cited with its status, no proposal for it', async () => {
    const search = stub({ G07: [{ id: 'bug-301-unknown-identities', type: 'bug', status: 'open' }] });
    const md = await proposedMarkdown(twoFindings(), search);
    expect(section(md, 'Proposals')).toMatch(/^- G07 — tracked: bug-301-unknown-identities \(open; .+\)$/m);
    expect(Object.keys(proposals(md))).toEqual(['### RH-v0.2-01 — G04 Subject length']);
  });

  it('an element in its last state, a deprecated one, or one of another type does not track: each finding becomes a proposal, numbered in finding order', async () => {
    const search = stub({
      G04: [
        { id: 'dl-300-subject-length', type: 'decision-log', status: 'ready' },
        { id: 'task-300-subjects', type: 'task', status: 'done' },
        { id: 'adr-300-subjects', type: 'adr', status: 'pending' },
      ],
      G07: [
        { id: 'bug-300-identities', type: 'bug', status: 'closed' },
        { id: 'bug-302-identities', type: 'bug', status: 'deprecated' },
      ],
    });
    const md = await proposedMarkdown(twoFindings(), search);
    const entries = proposals(md);
    expect(Object.keys(entries)).toEqual(['### RH-v0.2-01 — G04 Subject length', '### RH-v0.2-02 — G07 Unknown identities']);
    const g04 = entries['### RH-v0.2-01 — G04 Subject length']!;
    for (const field of ['- Finding:', '- Evidence:']) expect(g04).toContain(field);
    expect(g04).toContain('- Proposed element: decision-log');
    expect(g04).toContain('- Proposed target release: v0.3');
    expect(g04).not.toContain(IMMEDIATE);
    const g07 = entries['### RH-v0.2-02 — G07 Unknown identities']!;
    for (const field of ['- Finding:', '- Evidence:']) expect(g07).toContain(field);
    expect(g07).toContain('- Proposed element: bug');
    expect(g07).toContain('- Proposed target release: v0.3');
    expect(g07).toContain(SHA('a'));
    expect(g07).toContain(IMMEDIATE);
  });

  it('an open change-proposal tracks a finding too', async () => {
    const search = stub({ G04: [{ id: 'cp-300-subjects', type: 'change-proposal', status: 'accepted' }] });
    const md = await proposedMarkdown(twoFindings(), search);
    expect(section(md, 'Proposals')).toMatch(/^- G04 — tracked: cp-300-subjects \(accepted; .+\)$/m);
  });

  it('a regressed trend metric under small-sample is no finding: no search, no proposal', async () => {
    const current = withEntry(fixtureReport('v0.2'), 'G04', { status: 'measured', value: { mean: 60, share_over_72: 5 }, raw: { over_72: 1, total: 10, characters: 600 }, items: 10, small_sample: true, failing: [] });
    const search = stub({});
    const md = await proposedMarkdown(current, search);
    expect(search).not.toHaveBeenCalled();
    expect(Object.keys(proposals(md))).toEqual([]);
    expect(section(md, 'Findings')).not.toMatch(/\bG04\b/);
  });
});

describe('propose — immediate bug-ingest (dl-089 §5)', () => {
  const atBasis = (report: Report, basis: string): Report => ({ ...report, measurement_point: { ...report.measurement_point, basis } as Report['measurement_point'] });

  it.each([
    ['G07', 2],
    ['G10', 99],
    ['G14', 1],
  ])('a %s breach is immediate at any measurement point', async (id, value) => {
    for (const basis of ['published-tag', 'released-transition']) {
      const md = await proposedMarkdown(atBasis(withEntry(fixtureReport('v0.2'), id, floorBreach(id, value)), basis), stub({}));
      const entry = Object.entries(proposals(md)).find(([heading]) => heading.includes(` — ${id} `));
      expect(entry).toBeDefined();
      expect(entry![1]).toContain(IMMEDIATE);
    }
  });

  it.each([
    ['Q01', false],
    ['Q02', { total: 1000, failing: 1, disabled: 0 }],
  ])('a %s breach is immediate at a published tag, not at a released transition', async (id, value) => {
    const tagged = await proposedMarkdown(atBasis(withEntry(fixtureReport('v0.2'), id, floorBreach(id, value)), 'published-tag'), stub({}));
    const atTag = Object.entries(proposals(tagged)).find(([heading]) => heading.includes(` — ${id} `));
    expect(atTag).toBeDefined();
    expect(atTag![1]).toContain(IMMEDIATE);
    const untagged = await proposedMarkdown(atBasis(withEntry(fixtureReport('v0.2'), id, floorBreach(id, value)), 'released-transition'), stub({}));
    const atTransition = Object.entries(proposals(untagged)).find(([heading]) => heading.includes(` — ${id} `));
    expect(atTransition).toBeDefined();
    expect(atTransition![1]).toContain('- Proposed element: bug');
    expect(atTransition![1]).not.toContain(IMMEDIATE);
  });
});

describe('parseProposals — reads back what renderReport wrote', () => {
  it('returns each RH id with its metric, in order', async () => {
    const { parseProposals } = loadCompare();
    const md = await proposedMarkdown(twoFindings(), stub({}));
    expect(parseProposals(md)).toMatchObject([
      { id: 'RH-v0.2-01', metric: 'G04' },
      { id: 'RH-v0.2-02', metric: 'G07' },
    ]);
  });
});

describe('settle — the previous proposals (dl-089 §4, ruling G)', () => {
  const PREVIOUS = [
    '# Release health — v0.1',
    '',
    '## Proposals',
    '',
    ...[
      ['01', 'G02', 'Commit bodies', 'decision-log'],
      ['02', 'G04', 'Subject length', 'decision-log'],
      ['03', 'G09', 'Verbs outside the grammar', 'decision-log'],
      ['04', 'Q05', 'Complexity', 'decision-log'],
      ['05', 'Q06', 'Duplication', 'decision-log'],
      ['06', 'Q14', 'Open decision-logs', 'decision-log'],
      ['07', 'Q15', 'Document divergences', 'decision-log'],
    ].flatMap(([n, id, name, element]) => [
      `### RH-v0.1-${n} — ${id} ${name}`,
      '',
      `- Finding: ${id} regressed.`,
      '- Evidence: the fixture.',
      `- Proposed element: ${element}`,
      '- Proposed target release: v0.2',
      '',
    ]),
    '## Previous proposals',
    '',
  ].join('\n');

  const RETRO = [
    '## Release health',
    '',
    '| Proposal | Outcome | Element |',
    '|---|---|---|',
    '| RH-v0.1-01 | element | dl-901-commit-bodies |',
    '| RH-v0.1-02 | element | dl-902-subject-length |',
    '| RH-v0.1-03 | covered | dl-079 |',
    '| RH-v0.1-04 | restated | dl-903-complexity |',
    '| RH-v0.1-05 | superseded | dl-904-duplication |',
    '| RH-v0.1-06 | declined | |',
    '',
  ].join('\n');

  it('maps each disposition: element + improved → adopted and effective; element + not moved → adopted, no effect yet; covered/restated/superseded → superseded; declined or no row → not adopted', async () => {
    const { parseProposals, settle } = loadCompare();
    // v0.2 against v0.1: G02 improved (40.25 → 45.5), G04 stable.
    const comparison = await compareWith(fixtureReport('v0.2'));
    const settled = settle(parseProposals(PREVIOUS), RETRO, comparison);
    expect(settled).toMatchObject([
      { id: 'RH-v0.1-01', settled: 'adopted and effective' },
      { id: 'RH-v0.1-02', settled: 'adopted, no effect yet' },
      { id: 'RH-v0.1-03', settled: 'superseded' },
      { id: 'RH-v0.1-04', settled: 'superseded' },
      { id: 'RH-v0.1-05', settled: 'superseded' },
      { id: 'RH-v0.1-06', settled: 'not adopted' },
      { id: 'RH-v0.1-07', settled: 'not adopted' },
    ]);
    expect(JSON.stringify(settled[6])).toContain('no disposition recorded');
    expect(JSON.stringify(settled[5])).not.toContain('no disposition recorded');
  });

  it('with no retrospective, every previous proposal is not adopted, no disposition recorded', async () => {
    const { parseProposals, settle } = loadCompare();
    const settled = settle(parseProposals(PREVIOUS), null, await compareWith(fixtureReport('v0.2')));
    expect(settled.map((s) => s.settled)).toEqual(Array(7).fill('not adopted'));
    for (const entry of settled) expect(JSON.stringify(entry)).toContain('no disposition recorded');
  });
});

describe('compare.cjs — an untracked immediate finding is named on stderr', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach(removeTempDir));

  it('G07 breached, nothing in Memory tracks it: exit 0, one stderr line naming it', () => {
    const dir = makeTempGitRepo();
    roots.push(dir);
    const health = join(dir, 'docs', '08_health');
    mkdirSync(health, { recursive: true });
    mkdirSync(join(dir, '.wingfoil'), { recursive: true });
    copyFileSync(join(REPO_ROOT, '.wingfoil', 'memory.yaml'), join(dir, '.wingfoil', 'memory.yaml'));
    copyFileSync(join(REPO_ROOT, '.wingfoil', 'dna.yaml'), join(dir, '.wingfoil', 'dna.yaml'));
    for (const name of ['metrics.yaml', 'release-health.schema.json']) copyFileSync(join(REPO_ROOT, 'docs', '08_health', name), join(health, name));
    copyFileSync(join(FIXTURES, 'release-health-v0.1.json'), join(health, 'release-health-v0.1.json'));
    writeFileSync(join(health, 'release-health-v0.2.json'), `${JSON.stringify(withEntry(fixtureReport('v0.2'), 'G07', floorBreach('G07', 2, [SHA('a'), SHA('b')])), null, 2)}\n`);
    const result = spawnSync(process.execPath, [COMPARE_SCRIPT, '--release', 'v0.2', '--root', dir], { cwd: dir, encoding: 'utf-8' });
    expect(result.stderr.split('\n').filter((line) => line.startsWith('release-health compare: immediate bug-ingest: '))).toEqual([expect.stringMatching(/^release-health compare: immediate bug-ingest: G07\b/)]);
    expect(result.status).toBe(0);
  });
});

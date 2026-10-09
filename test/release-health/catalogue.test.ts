/**
 * task-222 — the release-health metric catalogue (`dl-089` §2, catalogue v2: `dl-133` §1, `dl-131` Action 8,
 * `dl-130` Q2 (a), `dl-100` §4 (a), `dl-116` Action 2, `dl-111` Action 4, `dl-117` Action 3, `dl-101` Action 4).
 *
 * AC 4 (red-first): `validateCatalogue` checks a catalogue against `dl-089` §2's rules — unique ids; every
 * metric has a scope and a kind; a `retired` metric keeps its entry, with the release that retired it; a
 * metric is never dropped silently (every id the `changes` log ever added is still listed). The live
 * catalogue at `paths.health` passes it.
 *
 * AC 1 (characterization): the live catalogue holds G01–G16, Q01–Q20, D01, P01–P07 and E01–E05, D01 is the
 * Determinism Index's outcome component O with `dl-089`'s equivalence criterion.
 *
 * Deterministic: issues are reported in document order; no clock, no randomness.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { catalogueLocation, validateCatalogue } from '../../scripts/release-health/catalogue.cjs';

const ROOT = join(__dirname, '..', '..');

/** A minimal valid catalogue: two metrics added in version 1. */
function minimal(): Record<string, unknown> {
  return {
    version: 1,
    metrics: [
      { id: 'G01', name: 'Conventional subjects', definition: 'Share of non-merge subjects in conventional form.', scope: 'window', kind: 'floor', floor: '100%' },
      { id: 'G02', name: 'Bodies', definition: 'Share of non-merge commits with a body.', scope: 'window', kind: 'trend', direction: 'up' },
    ],
    changes: [{ version: 1, source: 'dl-089', added: ['G01', 'G02'] }],
  };
}

function metrics(doc: Record<string, unknown>): Record<string, unknown>[] {
  return doc['metrics'] as Record<string, unknown>[];
}

describe('validateCatalogue — dl-089 §2 catalogue rules (AC 4, red-first)', () => {
  it('a well-formed catalogue has no issue', () => {
    expect(validateCatalogue(minimal())).toEqual([]);
  });

  it('refuses a duplicate id', () => {
    const doc = minimal();
    metrics(doc)[1]!['id'] = 'G01';
    expect(validateCatalogue(doc)).toContain("metrics[1]: duplicate id 'G01'");
  });

  it('refuses an id outside the <family letter><two digits> shape', () => {
    const doc = minimal();
    metrics(doc)[0]!['id'] = 'g1';
    expect(validateCatalogue(doc)).toContain("metrics[0]: id 'g1' is not a letter followed by two digits");
  });

  it('refuses a metric with no scope, and one whose scope is not window, snapshot or window+snapshot', () => {
    const doc = minimal();
    delete metrics(doc)[0]!['scope'];
    metrics(doc)[1]!['scope'] = 'release';
    const issues = validateCatalogue(doc);
    expect(issues).toContain('metrics[0] (G01): scope is missing');
    expect(issues).toContain("metrics[1] (G02): scope 'release' is not one of window, snapshot, window+snapshot");
  });

  it('refuses a metric with no kind, and one whose kind is not floor, trend or info', () => {
    const doc = minimal();
    delete metrics(doc)[0]!['kind'];
    metrics(doc)[1]!['kind'] = 'gate';
    const issues = validateCatalogue(doc);
    expect(issues).toContain('metrics[0] (G01): kind is missing');
    expect(issues).toContain("metrics[1] (G02): kind 'gate' is not one of floor, trend, info");
  });

  it('a floor declares its floor and a trend its direction', () => {
    const doc = minimal();
    delete metrics(doc)[0]!['floor'];
    delete metrics(doc)[1]!['direction'];
    const issues = validateCatalogue(doc);
    expect(issues).toContain('metrics[0] (G01): a floor metric declares its floor');
    expect(issues).toContain('metrics[1] (G02): a trend metric declares its direction (up, down or pending)');
  });

  it('a metric has a name and a definition', () => {
    const doc = minimal();
    metrics(doc)[0]!['definition'] = '  ';
    delete metrics(doc)[1]!['name'];
    const issues = validateCatalogue(doc);
    expect(issues).toContain('metrics[0] (G01): definition is missing');
    expect(issues).toContain('metrics[1] (G02): name is missing');
  });

  it('a retired metric keeps its entry, marked with the release that retired it', () => {
    const doc = minimal();
    doc['version'] = 2;
    metrics(doc)[1]!['status'] = 'retired';
    metrics(doc)[1]!['retired_in'] = 'v0.4';
    (doc['changes'] as unknown[]).push({ version: 2, source: 'dl-999', retired: ['G02'] });
    expect(validateCatalogue(doc)).toEqual([]);
  });

  it('a retired metric with no retired_in is refused, and so is a retirement the changes log does not record', () => {
    const doc = minimal();
    metrics(doc)[1]!['status'] = 'retired';
    const issues = validateCatalogue(doc);
    expect(issues).toContain('metrics[1] (G02): a retired metric names the release that retired it (retired_in)');
    expect(issues).toContain('metrics[1] (G02): retired, but no changes entry retires it');
  });

  it('a metric dropped from the list is refused: every id the changes log added is still listed', () => {
    const doc = minimal();
    metrics(doc).pop();
    expect(validateCatalogue(doc)).toContain("changes: G02 was added in version 1 and is no longer listed (retire it, never drop it)");
  });

  it('a metric no changes entry adds is refused, and so is one added twice', () => {
    const doc = minimal();
    metrics(doc).push({ id: 'Q01', name: 'Build', definition: 'Build passes.', scope: 'snapshot', kind: 'info' });
    (doc['changes'] as Record<string, unknown>[])[0]!['added'] = ['G01', 'G02', 'G02'];
    const issues = validateCatalogue(doc);
    expect(issues).toContain('metrics[2] (Q01): no changes entry adds it');
    expect(issues).toContain('changes: G02 is added more than once');
  });

  it('the changes log ends at the catalogue version, in ascending order', () => {
    const doc = minimal();
    doc['version'] = 3;
    expect(validateCatalogue(doc)).toContain('changes: the last entry is version 1, the catalogue is version 3');
  });

  it('a document that is not a catalogue is one issue, not a throw', () => {
    expect(validateCatalogue(null)).toEqual(['the catalogue is not a mapping with version, metrics and changes']);
    expect(validateCatalogue({ version: 1, metrics: 'x', changes: [] })).toEqual(['the catalogue is not a mapping with version, metrics and changes']);
  });
});

describe("this repository's catalogue (AC 1, AC 2, characterization)", () => {
  const location = catalogueLocation(ROOT);
  const doc = yamlLoad(readFileSync(join(ROOT, location), 'utf-8')) as Record<string, unknown>;
  const byId = new Map(metrics(doc).map((m) => [m['id'] as string, m]));

  it('lives in the folder dna.yaml declares as paths.health (dl-089 §1 (A), numbered by bug-299)', () => {
    expect(location).toBe('docs/08_health/metrics.yaml');
  });

  it('passes the catalogue rules and is version 2', () => {
    expect(validateCatalogue(doc)).toEqual([]);
    expect(doc['version']).toBe(2);
  });

  it('holds G01–G16, Q01–Q20, D01, P01–P07 and E01–E05, in that order', () => {
    const range = (family: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${family}${String(i + 1).padStart(2, '0')}`);
    expect([...byId.keys()]).toEqual([...range('G', 16), ...range('Q', 20), 'D01', ...range('P', 7), ...range('E', 5)]);
  });

  it('D01 is the outcome component O, with dl-089\'s equivalence criterion, on major and minor releases only', () => {
    const d01 = byId.get('D01')!;
    expect(d01['component']).toBe('O');
    expect(d01['kind']).toBe('trend');
    expect(d01['criterion']).toEqual({ agreeing_min: '90%', critical_scenarios: 'all pass on both runs' });
    expect(d01['releases']).toEqual(['major', 'minor']);
  });

  it('the P measures are the process-conformance component P, one per REQ-STATE-10 fit-criterion item', () => {
    const p = metrics(doc).filter((m) => (m['id'] as string).startsWith('P'));
    expect(p.map((m) => m['component'])).toEqual(Array(7).fill('P'));
    expect(p.map((m) => m['requirement'])).toEqual(Array(7).fill('REQ-STATE-10'));
  });

  it('the external visibility snapshot is info only (dl-130 Q2 (a))', () => {
    const e = metrics(doc).filter((m) => (m['id'] as string).startsWith('E'));
    expect(e.map((m) => [m['scope'], m['kind']])).toEqual(Array(5).fill(['snapshot', 'info']));
  });
});

describe('the report schema and layout (AC 2, characterization)', () => {
  const dir = join(ROOT, 'docs', '08_health');
  const schema = JSON.parse(readFileSync(join(dir, 'release-health.schema.json'), 'utf-8')) as Record<string, any>;

  it('is a draft 2020-12 JSON schema whose top level requires the run identity, the toolchain and the metrics', () => {
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['required']).toEqual(['schema_version', 'catalogue_version', 'release', 'measurement_point', 'previous', 'toolchain', 'metrics']);
  });

  it("a metric entry's id is the catalogue's id shape, and a value that was not measured carries a reason", () => {
    const metric = schema['$defs']['metric'];
    expect(metric['properties']['id']['pattern']).toBe('^[A-Z][0-9]{2}$');
    expect(metric['properties']['status']['enum']).toEqual(['measured', 'not-measurable', 'not-comparable']);
    expect(metric['allOf']).toEqual([
      { if: { properties: { status: { const: 'measured' } } }, then: { required: ['value'] }, else: { required: ['reason'] } },
    ]);
  });

  it('the .md layout names its sections in order', () => {
    const layout = readFileSync(join(dir, 'report-layout.md'), 'utf-8');
    const headings = [...layout.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(['Summary', 'Comparison', 'Trend', 'Findings', 'Proposals', 'Previous proposals', 'Improvements']);
  });
});

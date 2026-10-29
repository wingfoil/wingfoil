/**
 * task-331 (bug-445): the release-kind-rule test reads a release's required fields as the engine does.
 *
 * `test/workflow/release-kind-rule.test.ts` used its own `missingFields`, which counted an empty list as
 * missing on every field, ignoring the release type's `template.frontmatter.lists: [ features ]` in
 * `.wingfoil/memory.yaml` (bug-147, task-168): `patch-v0.3.2`'s `features: []` failed the suite. The reading
 * moves to `test/workflow/helpers/release-required-check.ts`, whose `missingCheckFields` applies the engine's
 * `missingRequiredFields` and `notApplicableRefusals` (`src/memory/submit.ts`) to the check's fields minus its
 * exempt ids (design gate D1 (a), D2 (a)). This file pins that reading; the inputs are the real declarations
 * of `memory.yaml`, and the fixture an in-memory copy of `patch-v0.3.2`'s frontmatter (nothing under
 * `docs/04_memory` is read or written).
 */
import { join } from 'node:path';

import { loadMemoryYaml } from '../../src/core/loaders';
import { requireRequiredFields } from '../../src/core/required-fields';

import { missingCheckFields, type RequiredCheck, type RequiredReading } from './helpers/release-required-check';

const repoRoot = join(__dirname, '..', '..');

/** `patch-v0.3.2`'s frontmatter as committed on `release/0.3` (docs/04_memory/planning/rl-v1/patch-v0.3.2.md). */
const PATCH_V032: Readonly<Record<string, unknown>> = {
  id: 'patch-v0.3.2',
  type: 'release',
  title: "WingFoil v0.3.2 - Bug fixes from the v0.3 backlog, the patch line's release steps",
  status: 'in-development',
  kind: 'patch',
  'patch-of': 'minor-v0.3',
  version: 'v0.3.2',
  pillar: 'P4',
  features: [],
  requirements:
    'docs/04_memory/design/dls/dl-186-wingfoil-s-own-development-moves-onto-the-v0.3-workflow-engine-in-a-fixed-order-pin-templates-then-state-adoption-before-v0.4-s-planning.md',
  'release-line': 'v1',
  backlog_committed: 26,
  waves: ['w0'],
  tmpl_version: 261012,
};

function without(data: Readonly<Record<string, unknown>>, field: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...data };
  delete copy[field];
  return copy;
}

describe("task-331 (bug-445): a release's required fields read as the engine reads them", () => {
  const memoryYaml = loadMemoryYaml(repoRoot);
  const template = memoryYaml.types['release']?.template?.frontmatter;
  const reading = (template ?? {}) as RequiredReading;
  const check: RequiredCheck = {
    fields: template?.required ?? [],
    exempt: ((template as Record<string, unknown> | undefined)?.['exempt'] ?? {}) as RequiredCheck['exempt'],
  };

  const fixtures: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
    ['base', PATCH_V032],
    ["version ''", { ...PATCH_V032, version: '' }],
    ["version '  '", { ...PATCH_V032, version: '  ' }],
    ['release-line absent', without(PATCH_V032, 'release-line')],
    ['requirements []', { ...PATCH_V032, requirements: [] }],
    ['features null', { ...PATCH_V032, features: null }],
    ['kind absent, minor-v0.3', { ...without(PATCH_V032, 'kind'), id: 'minor-v0.3' }],
    ['kind absent, patch-v0.3.2', without(PATCH_V032, 'kind')],
    ['pillar n/a with reason', { ...PATCH_V032, pillar: 'n/a — patch release' }],
    ['pillar bare n/a', { ...PATCH_V032, pillar: 'n/a' }],
    ['pillar n/a, hyphen', { ...PATCH_V032, pillar: 'n/a - x' }],
    ['version n/a', { ...PATCH_V032, version: 'n/a — x' }],
  ];

  it('the inputs are the real memory.yaml declarations', () => {
    expect(check.fields.length).toBeGreaterThan(0);
    expect(check.fields).toContain('features');
    expect(Object.keys(check.exempt)).toEqual(['kind']);
  });

  it('a list field declared in memory.yaml lists is filled by []', () => {
    expect(reading.lists).toContain('features');
    expect(missingCheckFields('patch-v0.3.2', PATCH_V032, check, reading)).toEqual([]);
  });

  it('a required non-list field left empty is still missing', () => {
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, version: '' }, check, reading)).toEqual(['version']);
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, version: '  ' }, check, reading)).toEqual(['version']);
    expect(missingCheckFields('patch-v0.3.2', without(PATCH_V032, 'release-line'), check, reading)).toEqual([
      'release-line',
    ]);
  });

  it('an empty list on a non-list field is missing, a null list field is missing', () => {
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, requirements: [] }, check, reading)).toEqual([
      'requirements',
    ]);
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, features: null }, check, reading)).toEqual(['features']);
  });

  it("the check's exemption reads by id", () => {
    const noKind = without(PATCH_V032, 'kind');
    expect(missingCheckFields('minor-v0.3', { ...noKind, id: 'minor-v0.3' }, check, reading)).toEqual([]);
    expect(missingCheckFields('patch-v0.3.2', noKind, check, reading)).toEqual(['kind']);
  });

  it('a not-applicable value stands only where memory.yaml allows it, with a reason', () => {
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, pillar: 'n/a — patch release' }, check, reading)).toEqual(
      [],
    );
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, pillar: 'n/a' }, check, reading)).toEqual([
      'pillar (n/a: no-reason)',
    ]);
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, pillar: 'n/a - x' }, check, reading)).toEqual([
      'pillar (n/a: bad-form)',
    ]);
    expect(missingCheckFields('patch-v0.3.2', { ...PATCH_V032, version: 'n/a — x' }, check, reading)).toEqual([
      'version (n/a: undeclared)',
    ]);
  });

  it("the verdict agrees with the engine's submit check", () => {
    const verdicts = fixtures.map(([name, data]) => {
      const id = String(data['id']);
      const helper = missingCheckFields(id, data, check, reading).length === 0;
      const engine = requireRequiredFields(memoryYaml, 'release', data, 'submit').ok;
      return [name, helper, engine] as const;
    });
    expect(verdicts.filter(([, helper, engine]) => helper !== engine)).toEqual([]);
    // The fixtures cover both verdicts, so the agreement is not vacuous.
    expect(new Set(verdicts.map(([, helper]) => helper))).toEqual(new Set([true, false]));
  });
});

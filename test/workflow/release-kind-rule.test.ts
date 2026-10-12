/**
 * One rule for the release `kind` field (task-148, bug-175; dl-092 Q1 (A)).
 *
 * `memory.yaml` lists `kind` among the release type's required fields and declares that the releases
 * added before dl-092 (`minor-v0.1` … `minor-v1.0`) are immutable and carry no `kind:` field. The
 * `release-planning` workflow's `define-scope` post-check restates the required list. Approver ruling
 * 2026-09-30 (release-planning-rel-v0.3-plan R20): the pre-dl-092 minors are exempt from `kind` in the
 * check, and gain no `kind:`.
 *
 * This test holds the three declarations together:
 * - the check's field list is the release type's `template.frontmatter.required` list;
 * - `initial-design`'s `seed-releases`, the phase that adds a release-line's minors, states the same
 *   check and passes the `kind` the type's `id_pattern` (`{kind}-{version}`) needs;
 * - the check states the exemption, and only for `kind`;
 * - every release document under `docs/04_memory/planning/` — `minor-v0.3` first among them, the
 *   release the contradiction was found on — carries every field the check requires of it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { loadMemoryYaml, loadWorkflowsYaml } from '../../src/core/loaders';
import { splitFrontmatter } from '../../src/storage';

const repoRoot = join(__dirname, '..', '..');
const planningDir = join(repoRoot, 'docs', '04_memory', 'planning');

/** The `define-scope` check, parsed: its required fields and the per-field exempt release ids. */
interface RequiredCheck {
  readonly fields: readonly string[];
  readonly exempt: Readonly<Record<string, readonly string[]>>;
}

const CHECK_RE = /^frontmatter\.required: \[([^\]]*)\](?: except ([a-z][a-z-]*) for \[([^\]]*)\])?$/;

function list(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** The `frontmatter.required` post-check of `workflow`'s `phase`, parsed. */
function requiredCheck(workflow: string, phaseName: string): RequiredCheck {
  const { workflows } = loadWorkflowsYaml(repoRoot);
  const owner = workflows.find((w) => w.name === workflow);
  const phase = owner?.phases.find((p) => p.name === phaseName);
  const checks = (phase?.checks?.post ?? []).filter((c) => c.startsWith('frontmatter.required:'));
  expect(checks).toHaveLength(1);
  const match = CHECK_RE.exec(checks[0]!);
  expect(match).not.toBeNull();
  const [, fields, field, ids] = match!;
  return { fields: list(fields!), exempt: field ? { [field]: list(ids!) } : {} };
}

function defineScopeCheck(): RequiredCheck {
  return requiredCheck('release-planning', 'define-scope');
}

/** The `actions` of `initial-design`'s `seed-releases` phase, the step that adds a release-line's minors. */
function seedReleasesActions(): readonly string[] {
  const { workflows } = loadWorkflowsYaml(repoRoot);
  const phase = workflows.find((w) => w.name === 'initial-design')?.phases.find((p) => p.name === 'seed-releases');
  expect(phase).toBeDefined();
  return phase?.actions ?? [];
}

/** Every release document under `docs/04_memory/planning/{release-line}/`, as `[id, frontmatter]`. */
function releaseDocuments(): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [];
  for (const line of readdirSync(planningDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const file of readdirSync(join(planningDir, line.name)).filter((f) => f.endsWith('.md')).sort()) {
      const { frontmatter } = splitFrontmatter(readFileSync(join(planningDir, line.name, file), 'utf8'));
      const data = (load(frontmatter ?? '') ?? {}) as Record<string, unknown>;
      if (data['type'] === 'release') out.push([String(data['id']), data]);
    }
  }
  return out.sort(([a], [b]) => a.localeCompare(b));
}

function missingFields(id: string, data: Record<string, unknown>, check: RequiredCheck): string[] {
  return check.fields.filter((field) => {
    if ((check.exempt[field] ?? []).includes(id)) return false;
    const value = data[field];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
}

describe('release `kind`: memory.yaml, the define-scope check and the release documents agree (bug-175)', () => {
  const required = loadMemoryYaml(repoRoot).types['release']?.template?.frontmatter.required ?? [];
  const check = defineScopeCheck();

  it("the define-scope check requires exactly the release type's required fields", () => {
    expect([...check.fields].sort()).toEqual([...required].sort());
  });

  it('the check exempts only `kind`, and only for the pre-dl-092 minors', () => {
    expect(Object.keys(check.exempt)).toEqual(['kind']);
    expect([...(check.exempt['kind'] ?? [])].sort()).toEqual([
      'minor-v0.1',
      'minor-v0.2',
      'minor-v0.3',
      'minor-v0.4',
      'minor-v1.0',
    ]);
  });

  it('minor-v0.3 carries every field the check requires of it', () => {
    const doc = releaseDocuments().find(([id]) => id === 'minor-v0.3');
    expect(doc).toBeDefined();
    expect(missingFields('minor-v0.3', doc![1], check)).toEqual([]);
  });

  it("initial-design's seed-releases check states the same rule as define-scope (review F2)", () => {
    const seed = requiredCheck('initial-design', 'seed-releases');
    expect([...seed.fields].sort()).toEqual([...required].sort());
    expect(seed.exempt).toEqual(check.exempt);
  });

  it("task-279 (bug-342, D1 (a)): both checks' `except kind for [...]` equal memory.yaml's release `template.frontmatter.exempt`", () => {
    const declared = (loadMemoryYaml(repoRoot).types['release']?.template?.frontmatter as Record<string, unknown> | undefined)?.['exempt'];
    expect(declared).toBeDefined();
    expect(check.exempt).toEqual(declared);
    expect(requiredCheck('initial-design', 'seed-releases').exempt).toEqual(declared);
  });

  it("initial-design's seed-releases action passes the `kind` its id_pattern needs (review F2)", () => {
    const adds = seedReleasesActions().filter((action) => action.includes('memory.add(type: release,'));
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatch(/\bkind: "minor"/);
  });

  it('every release document carries every field the check requires of it', () => {
    const failures = releaseDocuments()
      .map(([id, data]) => [id, missingFields(id, data, check)] as const)
      .filter(([, missing]) => missing.length > 0)
      .map(([id, missing]) => `${id}: ${missing.join(', ')}`);
    expect(failures).toEqual([]);
  });
});

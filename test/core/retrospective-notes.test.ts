/**
 * task-213 — retrospective notes are written during the release (`dl-115` Q1 (A), Q3 (x); `dl-163`'s
 * handover: six outcomes for a consumer feedback note).
 *
 * Every assertion reads this repository's configuration **as `HEAD` holds it** (the templates through
 * `git show HEAD:…`, the workflows through `loadWorkflowRegistryAtHead`), so a dirty working tree changes
 * nothing.
 *
 * - AC 1 (red-first): the `task`, `bug` and `plan` templates close their running-log section — `## Execution
 *   Notes`, the bug's `## Triage & Execution Notes`, and the `## Execution Notes` the plan template gains — with
 *   a `### Retrospective` subsection, the last heading of the file: one line per item, "None" valid.
 * - AC 2 (red-first): `retrospective.yaml` — `explore` reads that subsection first and lists every secondary
 *   source it was given; `additional-points` gains a `checks.pre` that every proposal has one of `dl-115`'s four
 *   outcomes, six for a consumer note; the version is bumped. Zero errors at `HEAD` is
 *   `workflow-repository-conformance.test.ts`'s, which pins the two new unbound checks.
 * - AC 3 (characterization): `memory add` through the compiled `dist/cli.js`, in a throwaway repository that
 *   holds this repository's committed `memory.yaml` and templates, copies the subsection verbatim (spec-010:
 *   `add` sets only `id`, `title`, `status` and the `--set` fields; the body is the template's).
 *
 * Deterministic: fixed type order, fixed titles; no wall-clock.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from '../cli/helpers/spawn-cli';

const ROOT = join(__dirname, '..', '..');

/** A file as `HEAD` holds it in this repository. */
function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** The body after the frontmatter block (the second `---` line). */
function body(document: string): string {
  const lines = document.split('\n');
  const close = lines.indexOf('---', 1);
  return lines.slice(close + 1).join('\n');
}

/** Every `##`/`###` heading of a Markdown body, in order, outside HTML comments. */
function headings(text: string): string[] {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => /^#{2,3} /.test(line));
}

/** Each template and the section its `### Retrospective` closes. */
const TEMPLATES: ReadonlyArray<[type: string, section: string]> = [
  ['task', '## Execution Notes'],
  ['bug', '## Triage & Execution Notes'],
  ['plan', '## Execution Notes'],
];

describe('AC 1 — the task, bug and plan templates end their running log with ### Retrospective (dl-115 Q1 (A))', () => {
  it.each(TEMPLATES)('%s.md: the last section is %s, and its last heading — the last of the file — is ### Retrospective', (type, section) => {
    const template = atHead(`.wingfoil/memory/templates/${type}.md`);
    const found = headings(body(template));
    expect(found.filter((h) => h.startsWith('## ')).at(-1)).toBe(section);
    expect(found.at(-1)).toBe('### Retrospective');
    expect(found.filter((h) => h === '### Retrospective')).toHaveLength(1);
  });

  it.each(TEMPLATES)('%s.md: the subsection asks for one line per item with its evidence, and says "None" is valid', (type) => {
    const template = atHead(`.wingfoil/memory/templates/${type}.md`);
    const subsection = template.slice(template.indexOf('\n### Retrospective\n'));
    expect(subsection).toMatch(/one line per item/i);
    expect(subsection).toMatch(/evidence/);
    expect(subsection).toMatch(/"None" is a valid entry/);
    expect(subsection).toMatch(/dl-115/);
  });
});

describe('AC 2 — retrospective.yaml: explore lists its secondary sources; additional-points disposes of every proposal (dl-115 Q3 (x), dl-163)', () => {
  const retrospective = (): NonNullable<ReturnType<typeof loadWorkflowRegistryAtHead>['workflows'][number]> =>
    loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'retrospective')!;

  it('the version is bumped from 1.3 (task-199) and the header names this change', () => {
    // A later change bumps again (1.5 task-222, dl-089); the 1.4 entry stays in the header's history.
    expect(retrospective().version).toBeGreaterThanOrEqual(1.4);
    expect(atHead('.wingfoil/workflows/custom/retrospective.yaml')).toMatch(/^version: [0-9.]+ .*1\.4 dl-115 .*task-213/m);
  });

  it('explore reads the ### Retrospective subsections first, then lists every secondary source it was given', () => {
    const explore = retrospective().phases.find((p) => p.name === 'explore')!;
    expect(explore.description).toMatch(/### Retrospective/);
    expect(explore.description).toMatch(/first/);
    expect(explore.description).toMatch(/secondary source/);
    expect(explore.description).toMatch(/never as a finding/);
    expect(explore.checks?.post).toEqual([expect.stringMatching(/^secondary-sources\.listed\(/)]);
  });

  it('additional-points gains one checks.pre: every proposal has one outcome — the four of dl-115, six for a consumer note', () => {
    const points = retrospective().phases.find((p) => p.name === 'additional-points')!;
    expect(points.checks?.pre).toHaveLength(1);
    const check = points.checks!.pre![0]!;
    expect(check).toMatch(/^proposals\.disposed\(/);
    // dl-115's four outcomes, in its order …
    const four = ['covered', 'element', 'restated', 'superseded'].map((o) => check.indexOf(`${o} (`));
    expect(four.every((at) => at > 0)).toBe(true);
    expect([...four].sort((a, b) => a - b)).toEqual(four);
    // … and the two dl-163 adds, for a consumer feedback note only.
    expect(check).toMatch(/consumer feedback note[^;]*declined \([^)]*\) \| needs-info \(/);
    // Written over every source listed before the gate, so a read-only phase added between explore and this one
    // (dl-163 S3d collect-feedback) brings one more source with no change to the check.
    expect(check).toMatch(/in every secondary source listed before this gate \(the friction inventory's list, and the read record of any read-only phase run between explore and this one\)/);
    // Review F2: every consumer note gets an outcome, not only a proposal — a defect note is not a proposal (dl-163 S3d).
    expect(check).toMatch(/^proposals\.disposed\(every item that is a proposal, and every consumer feedback note \(dl-163\),/);
  });

  it('the other phases keep their shape (task-199 pins approve; capture keeps its one post check)', () => {
    const phases = retrospective().phases;
    expect(phases.map((p) => p.name)).toEqual(['explore', 'additional-points', 'capture', 'approve']);
    expect(phases.find((p) => p.name === 'capture')?.checks).toEqual({ post: ['frontmatter.required: [title]'] });
    expect(phases.find((p) => p.name === 'additional-points')?.approval).toEqual({ by_role: 'approver' });
  });
});

describe('AC 3 — memory add copies the subsection verbatim (dist/cli.js, a throwaway repository)', () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', atHead('.wingfoil/memory.yaml'));
    for (const [type] of TEMPLATES) {
      writeFixtureFile(repo, `.wingfoil/memory/templates/${type}.md`, atHead(`.wingfoil/memory/templates/${type}.md`));
    }
    commitAll(repo, 'seed: this repository\'s memory.yaml and the task, bug, plan templates');
  });

  afterAll(() => {
    removeTempDir(repo);
  });

  const ADDS: ReadonlyArray<[type: string, sets: readonly string[]]> = [
    ['task', ['--set', 'release=v0.9']],
    ['bug', []],
    ['plan', ['--set', 'workflow=dev-loop', '--set', 'phase=rel-v0.9', '--set', 'scope=rl-v1/rel-v0.9']],
  ];

  it.each(ADDS)('memory add --type %s scaffolds the template body unchanged, ### Retrospective included', (type, sets) => {
    const run = runCliEntry(repo, ['memory', 'add', '--type', type, '--title', `Retrospective scaffold ${type}`, ...sets, '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const { path } = JSON.parse(run.stdout) as { path: string };
    const scaffolded = readFileSync(join(repo, path), 'utf-8');
    expect(body(scaffolded)).toBe(body(atHead(`.wingfoil/memory/templates/${type}.md`)));
    expect(headings(body(scaffolded)).at(-1)).toBe('### Retrospective');
  });
});

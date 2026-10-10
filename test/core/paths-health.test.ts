/**
 * task-222 — `dna.yaml` declares the `health` paths category: the one directory holding the release-health
 * catalogue and reports (`dl-089-release-health-analyses-before-retrospective` §1 (A); `spec-002-dna-yaml-schema`
 * Categories, pending amendment).
 *
 * Before this task a `health` entry rode `.passthrough()` as an unknown key: every command loading this
 * repository's `dna.yaml` printed `unknown field(s) ignored: paths.health`, and any number of directories
 * was accepted. Like `runs` (task-138), `health` holds exactly one directory, because the release-health
 * scripts read `<health>/metrics.yaml` and write `<health>/release-health-<version>.{json,md}` there.
 *
 * Drives the registered `CORE_MODULES` operations against a throwaway git repository.
 */
import { join } from 'node:path';

import { CORE_MODULES, loadDnaYaml } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { withWarningSink } from '../../src/validation/warning';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DNA_FIXTURE = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: roberto
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
`;

function operation(name: string): { fn: CoreFn<unknown, unknown>; positionalDescription?: string } {
  const found = CORE_MODULES.find((module) => module.name === 'paths')?.operations[name];
  if (!found) throw new Error(`fixture bug: paths.${name} is not registered`);
  return { fn: found.fn, positionalDescription: found.positional?.description };
}

describe('task-222 — the health paths category (dl-089 §1 (A))', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('a dna.yaml declaring paths.health loads with no unknown-field warning', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}  health: [ docs/health/ ]\n`);
    const warnings: string[] = [];
    const dna = withWarningSink((text) => warnings.push(text), () => loadDnaYaml(repo));
    expect(warnings).toEqual([]);
    expect(dna.paths.health).toEqual(['docs/health/']);
  });

  it('a document declaring two health directories does not load, and the error names paths.health', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}  health: [ docs/health/, var/health/ ]\n`);
    expect(() => loadDnaYaml(repo)).toThrow(/paths\.health/);
  });

  it('`paths health` returns the declared directory', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}  health: [ docs/health/ ]\n`);
    commitAll(repo, 'fixture');
    const result = await operation('paths').fn({ root: repo, positional: 'health' });
    expect(result).toEqual({ ok: true, value: { category: 'health', paths: ['docs/health/'] } });
  });

  it('the `paths` positional description lists health', () => {
    expect(operation('paths').positionalDescription ?? '').toContain('health');
  });

  it("this repository's dna.yaml declares docs/08_health/ (bug-299 numbering)", () => {
    const warnings: string[] = [];
    const dna = withWarningSink((text) => warnings.push(text), () => loadDnaYaml(join(__dirname, '..', '..')));
    expect(warnings).toEqual([]);
    expect(dna.paths.health).toEqual(['docs/08_health/']);
  });
});

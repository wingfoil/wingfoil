/**
 * task-312 AC 3 (`bug-316`) — an extra `paths` category is accepted: `spec-002-dna-yaml-schema` Categories
 * lets a project declare its own categories ("Each maps to an ordered `string[]`"), so `extras: [ notes/ ]`
 * loads with no unknown-field warning and `paths extras` serves it, while an unknown field anywhere else
 * still warns. The design gate (approver, 2026-10-30, D3 (A)) settled the mechanism: `Paths` takes a typed
 * catchall `string[]`, so an extra category that is not a list of strings is a validation error naming
 * `paths.<name>`, and the unknown-field warning skips the keys a typed catchall covers. The write side stays
 * closed (`dl-081`): `dna add paths.extras` is still refused.
 *
 * The warning texts below were copied from a real run of the code build of this branch before the fix:
 * `loadDnaYaml(<absolute root>)` under `withWarningSink` on a scratch repository carrying this fixture plus,
 * in turn, `extras: [ notes/ ]` and a root `mystery: 1` (→ `.wingfoil/dna.yaml: unknown field(s) ignored:
 * paths.extras, mystery`), a root `mystery: 1` alone (→ `… ignored: mystery`), and `mystery: 1` under `team:`
 * (→ `… ignored: team.mystery`). `wingfoil dna add paths.extras --value x` on the same repository printed
 * `error: unknown DNA field 'paths.extras': 'extras' is not declared under 'paths'` and exited 1.
 *
 * Shaped like `test/core/paths-health.test.ts`: drives the registered `CORE_MODULES` operations against a
 * throwaway git repository.
 */
import { CORE_MODULES, loadDnaYaml } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
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

const EXTRAS = '  extras: [ notes/ ]\n';

function operation(module: string, name: string): CoreFn<unknown, unknown> {
  const found = CORE_MODULES.find((candidate) => candidate.name === module)?.operations[name];
  if (!found) throw new Error(`fixture bug: ${module}.${name} is not registered`);
  return found.fn;
}

/** Load the fixture repository's dna.yaml, collecting every warning raised while it loads. */
function loadCollecting(repo: string): { warnings: string[]; dna: ReturnType<typeof loadDnaYaml> } {
  const warnings: string[] = [];
  const dna = withWarningSink((text) => warnings.push(text), () => loadDnaYaml(repo));
  return { warnings, dna };
}

describe('task-312 AC 3 — an extra paths category is accepted (bug-316, red-first)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('(a) a dna.yaml declaring paths.extras loads with no unknown-field warning', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}${EXTRAS}`);
    const { warnings, dna } = loadCollecting(repo);
    expect(warnings).toEqual([]);
    expect((dna.paths as Record<string, unknown>).extras).toEqual(['notes/']);
  });

  it('(b) P2.5 "a project-specific category is served with no warning": `paths extras` returns its directories', async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}${EXTRAS}`);
    commitAll(repo, 'fixture');
    const warnings: string[] = [];
    const result = await withWarningSink(
      (text) => warnings.push(text),
      () => operation('paths', 'paths')({ root: repo, positional: 'extras' }),
    );
    expect(warnings).toEqual([]);
    expect(result).toEqual({ ok: true, value: { category: 'extras', paths: ['notes/'] } });
  });

  it('(c) with an extra category AND an unknown root field, the warning names only the unknown field', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}${EXTRAS}mystery: 1\n`);
    const { warnings } = loadCollecting(repo);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/dna\.yaml: unknown field\(s\) ignored: mystery$/);
  });

  it('(d) an extra category that is not a list of strings does not load, and the error names paths.extras (D3 (A))', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}  extras: 3\n`);
    expect(() => loadDnaYaml(repo)).toThrow(/paths\.extras/);
  });
});

describe('task-312 AC 3 — unknown fields elsewhere still warn, and the write side stays closed (characterization)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repo);
  });

  it('(e) an unknown root field still warns', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}mystery: 1\n`);
    const { warnings } = loadCollecting(repo);
    expect(warnings).toEqual(['.wingfoil/dna.yaml: unknown field(s) ignored: mystery']);
  });

  it('(e) an unknown field nested under team still warns, by its dotted path', () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_FIXTURE.replace('    - name: approver\n', '    - name: approver\n  mystery: 1\n'));
    const { warnings } = loadCollecting(repo);
    expect(warnings).toEqual(['.wingfoil/dna.yaml: unknown field(s) ignored: team.mystery']);
  });

  it("(f) `dna add paths.extras --value x` is still refused at exit 1: unknown DNA field 'paths.extras' (dl-081)", async () => {
    writeFixtureFile(repo, '.wingfoil/dna.yaml', `${DNA_FIXTURE}${EXTRAS}`);
    commitAll(repo, 'fixture');
    const result = await operation('dna', 'dnaAdd')({ root: repo, positionals: ['paths.extras'], options: { value: 'x' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain("unknown DNA field 'paths.extras'");
  });
});

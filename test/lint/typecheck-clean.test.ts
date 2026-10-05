/**
 * Typecheck-clean gate — `typecheck.clean` (task-173-add-whole-project-typecheck-clean-gate-control-character,
 * `dl-044`).
 *
 * `test/**` never had a semantic typecheck behind any gate: ts-jest runs transpile-only
 * (`isolatedModules: true`), `tsconfig.build.json` excludes `test`, and `eslint.config.js` is not
 * type-aware. `bug-026` (a TS2339 in a test file) reached `main` with every declared gate green. This
 * suite is the executable half of the gate, in the shape `dl-034` gave `lint.clean`
 * (`test/lint/lint-clean.test.ts`):
 *
 * 1. `npm run typecheck` exists and runs exactly {@link TYPECHECK_PROJECTS}, in order — the command a
 *    human, `ci.yml` and `release-submit`'s `pre-release-checks` run is the one this suite asserts;
 * 2. each project typechecks with zero diagnostics;
 * 3. the runner really fails on a planted semantic error (the `bug-026` shape, which transpile-only
 *    ts-jest lets through), so a green verdict above is not a runner that cannot say red.
 *
 * Deterministic: `tsc` reads a fixed configuration over a fixed source tree.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fixtureDirPrefix, removeTempDir } from '../storage/helpers/git-fixture';
import { TYPECHECK_PROJECTS, typecheckScript, runTypecheck } from './helpers/typecheck';

const REPO_ROOT = join(__dirname, '..', '..');

// Two full-project `tsc` runs take ~50 s of CPU on an idle machine and compete with every other
// suite; a wide fixed budget makes the gate report type status rather than machine load (`bug-011`).
const TYPECHECK_TIMEOUT_MS = 300_000;

describe('typecheck.clean (dl-044, task-173)', () => {
  it('declares `npm run typecheck` as `tsc --noEmit` over exactly the gate\'s projects', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    expect(TYPECHECK_PROJECTS).toEqual(['tsconfig.json', 'tsconfig.build.json']);
    expect(pkg.scripts?.typecheck).toBe(typecheckScript());
    expect(pkg.scripts?.typecheck).toBe('tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.build.json');
  });

  it.each(['tsconfig.json', 'tsconfig.build.json'])(
    '%s typechecks with zero diagnostics',
    async (project) => {
      const result = await runTypecheck(REPO_ROOT, project);
      if (result.status !== 0) throw new Error(`typecheck.clean failed for ${project}:\n${result.output}`);
      expect(result.status).toBe(0);
    },
    TYPECHECK_TIMEOUT_MS,
  );

  describe('the runner says red when it should', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(fixtureDirPrefix());
      // The repository's own full-project configuration, narrowed to one planted file. `rootDir` and
      // `typeRoots` are re-anchored, because the fixture lives outside the repository.
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          extends: join(REPO_ROOT, 'tsconfig.json'),
          compilerOptions: { rootDir: dir, typeRoots: [join(REPO_ROOT, 'node_modules', '@types')] },
          include: ['planted.ts'],
          exclude: [],
        }),
      );
    });

    afterEach(() => removeTempDir(dir));

    it('fails on a planted semantic type error, naming the file and the diagnostic', async () => {
      writeFileSync(join(dir, 'planted.ts'), "export const n: number = 'definitely not a number';\n");
      const result = await runTypecheck(dir, 'tsconfig.json');
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('planted.ts');
      expect(result.output).toContain('TS2322');
    }, TYPECHECK_TIMEOUT_MS);

    it('passes the same fixture once the error is removed (the red above is the error, not the fixture)', async () => {
      writeFileSync(join(dir, 'planted.ts'), 'export const n: number = 42;\n');
      const result = await runTypecheck(dir, 'tsconfig.json');
      expect(result.output).toBe('');
      expect(result.status).toBe(0);
    }, TYPECHECK_TIMEOUT_MS);
  });
});

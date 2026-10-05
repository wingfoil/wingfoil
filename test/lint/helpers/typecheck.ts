/**
 * The `typecheck.clean` runner (task-173, `dl-044`), shared by `test/lint/typecheck-clean.test.ts` and
 * the `typecheck` npm script it pins. Not a `.test.ts` file, so jest never collects it as a suite.
 */
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';

/**
 * The projects `npm run typecheck` checks, in order:
 *
 * - `tsconfig.json` — the whole project, `src` AND `test`, under the real `module: Node16` semantics.
 *   This is the one `dl-044` asks for: nothing else typechecks `test/**`.
 * - `tsconfig.build.json` — `src` alone, as `npm run build` compiles it (`rootDir: src`).
 *
 * `tsconfig.test.json` is deliberately absent: it is ts-jest's runtime configuration
 * (`module: CommonJS`), strictly more permissive than `tsconfig.json`, so it would add time and no
 * diagnostic (`dl-044` Context).
 */
export const TYPECHECK_PROJECTS: readonly string[] = ['tsconfig.json', 'tsconfig.build.json'];

/** The exact `typecheck` npm script {@link TYPECHECK_PROJECTS} implies. */
export function typecheckScript(): string {
  return TYPECHECK_PROJECTS.map((project) => `tsc --noEmit -p ${project}`).join(' && ');
}

/** The installed TypeScript compiler's CLI, resolved through its package root. */
const TSC_BIN = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');

/** What one `tsc --noEmit` run reported. */
export interface TypecheckResult {
  /** The process exit code: 0 when the project has no diagnostic. */
  readonly status: number;
  /** stdout followed by stderr, as `tsc` printed them. */
  readonly output: string;
}

/**
 * Run `tsc --noEmit -p <project>` in `cwd`, without throwing on a non-zero exit. Asynchronous, so a
 * long typecheck does not block the jest worker's event loop.
 */
export function runTypecheck(cwd: string, project: string): Promise<TypecheckResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [TSC_BIN, '--noEmit', '-p', project],
      { cwd, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ status: code, output: `${stdout}${stderr}` });
      },
    );
  });
}

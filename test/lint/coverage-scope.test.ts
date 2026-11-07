/**
 * Coverage-scope gate — the coverage report measures every `src/` file that holds logic, and the only
 * files `collectCoverageFrom` leaves out are true re-export barrels
 * (task-122-coverage-measures-every-index-file-with-logic, `bug-021-core-index-excluded-from-coverage`).
 *
 * `jest.config.js` used to exclude `!src/**\/index.ts` wholesale. The glob meant to skip barrels, and
 * it also hid `src/core/index.ts` (every registered operation's `fn` body) and `src/mcp/index.ts`
 * (`registerReadOnlyResources`). Barrels stay excluded for a measured reason: a CommonJS re-export
 * compiles to a getter thunk per name, which counts as an uncalled function and drags the
 * `functions` total down without saying anything about the code (`bug-021`'s Notes).
 *
 * The configuration this gate holds:
 *
 * 1. every negated `collectCoverageFrom` entry is a literal file path — no glob — so the review can
 *    read the list, and a new `index.ts` that nobody adds to it is MEASURED rather than hidden;
 * 2. every such path exists and is a barrel by {@link barrelViolations}'s rule;
 * 3. `src/core/index.ts` is matched by an include entry and by no exclusion (`src/mcp/index.ts` was too until
 *    task-354 made it a barrel).
 *
 * Deterministic by construction: a fixed file list, a pure AST walk of each file, and Node's own glob
 * matcher — no clock, no network, no subprocess.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = join(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jestConfig = require(join(REPO_ROOT, 'jest.config.js')) as { collectCoverageFrom?: string[] };

/** The two `index.ts` files `bug-021` and this task found holding logic. */
// `src/mcp/index.ts` left this list when task-354 (`bug-345`) moved `registerReadOnlyResources` to
// `src/mcp/read-only-resources.ts`: it is a re-export barrel now. It stays measured all the same, since
// `jest.config.js` does not list it.
const LOGIC_INDEX_FILES = ['src/core/index.ts'];

/** Characters that make a `collectCoverageFrom` entry a pattern rather than a literal path. */
const GLOB_CHARS = /[*?[\]{}()!]/;

function patterns(): { includes: string[]; excludes: string[] } {
  const entries = jestConfig.collectCoverageFrom ?? [];
  return {
    includes: entries.filter((p) => !p.startsWith('!')),
    excludes: entries.filter((p) => p.startsWith('!')).map((p) => p.slice(1)),
  };
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

/** A literal constant initializer — `'x'`, `1`, or either of those `as const`. */
function isLiteralInitializer(expr: ts.Expression | undefined): boolean {
  if (expr === undefined) return false;
  if (ts.isAsExpression(expr)) return isLiteralInitializer(expr.expression);
  return ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isNumericLiteral(expr);
}

/**
 * The top-level statements of `source` that stop it from being a barrel, as short descriptions; an
 * empty list means the file IS a barrel. A barrel holds only:
 *
 * - re-exports (`export { … } from '…'`, `export * from '…'`, `export type { … } from '…'`);
 * - type-only statements, which compile to nothing (`import type`, `export type { … }`, interfaces,
 *   type aliases);
 * - exported `const` declarations whose initializer is a string or number literal (the
 *   `MODULE_NAME` constant every module carries).
 *
 * Anything else — a function, a class, a value import, a computed constant, a bare expression — is
 * logic, and the file is measured.
 */
function barrelViolations(source: string, fileName = 'index.ts'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: string[] = [];
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier !== undefined || stmt.isTypeOnly) continue;
    } else if (ts.isImportDeclaration(stmt)) {
      if (stmt.importClause?.isTypeOnly === true) continue;
    } else if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      continue;
    } else if (
      ts.isVariableStatement(stmt) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword) &&
      (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
      stmt.declarationList.declarations.every((d) => isLiteralInitializer(d.initializer))
    ) {
      continue;
    }
    const { line } = sf.getLineAndCharacterOfPosition(stmt.getStart(sf));
    // `SyntaxKind` aliases `VariableStatement` as `FirstStatement`; name it by what it is.
    const kind = ts.isVariableStatement(stmt) ? 'VariableStatement' : ts.SyntaxKind[stmt.kind];
    violations.push(`line ${line + 1}: ${kind}`);
  }
  return violations;
}

describe('barrelViolations — the rule that decides which index.ts may be excluded', () => {
  it('accepts re-exports, type-only statements and a literal MODULE_NAME', () => {
    const src = [
      "import type { X } from './x';",
      "export const MODULE_NAME = 'm' as const;",
      "export { a, b } from './a';",
      "export type { T } from './t';",
      "export * from './all';",
      'export interface I { readonly x: X }',
      'export type U = string;',
    ].join('\n');
    expect(barrelViolations(src)).toEqual([]);
  });

  it.each([
    ['a function', 'export function f(): void {}', 'FunctionDeclaration'],
    ['a value import', "import { a } from './a';", 'ImportDeclaration'],
    ['a computed constant', 'export const N = [1].length;', 'VariableStatement'],
    ['a non-exported constant', "const M = 'm';", 'VariableStatement'],
    ['a mutable export', "export let M = 'm';", 'VariableStatement'],
    ['a class', 'export class C {}', 'ClassDeclaration'],
    ['a bare expression', 'console.log(1);', 'ExpressionStatement'],
  ])('rejects %s', (_label, src, kind) => {
    expect(barrelViolations(src)).toEqual([`line 1: ${kind}`]);
  });
});

describe('jest.config.js collectCoverageFrom (task-122, bug-021)', () => {
  it.each(LOGIC_INDEX_FILES)('measures %s: an include matches it and no exclusion does', (file) => {
    const { includes, excludes } = patterns();
    expect(includes.some((p) => matchesGlob(file, p))).toBe(true);
    expect(excludes.filter((p) => matchesGlob(file, p))).toEqual([]);
  });

  it.each(LOGIC_INDEX_FILES)('%s holds logic, so it is not a barrel', (file) => {
    expect(barrelViolations(readFileSync(join(REPO_ROOT, file), 'utf8'), file)).not.toEqual([]);
  });

  it('lists every exclusion as a literal path, so a file nobody lists is measured', () => {
    const { excludes } = patterns();
    expect(excludes.length).toBeGreaterThan(0);
    expect(excludes.filter((p) => GLOB_CHARS.test(p))).toEqual([]);
  });

  it('excludes only existing files that are true re-export barrels', () => {
    const offenders = patterns()
      .excludes.map((file) => {
        const abs = join(REPO_ROOT, file);
        if (!existsSync(abs)) return `${file}: does not exist`;
        const v = barrelViolations(readFileSync(abs, 'utf8'), file);
        return v.length === 0 ? null : `${file}: ${v.join(', ')}`;
      })
      .filter((o): o is string => o !== null);
    expect(offenders).toEqual([]);
  });
});

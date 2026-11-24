/**
 * task-365 AC 8 (red-first; `spec-020` §4.13, AC-8; design item 1, D1 (a)) — in `src/core/governance-check.ts` the
 * history reader `createGitHistoryReader` is the only part that calls git.
 *
 * The module is parsed with the repository's `typescript` at test run time. Every call whose callee is one of the
 * git-running functions below — by name, as an identifier (`execFileSync(…)`) or as the property of an access
 * (`childProcess.execFileSync(…)`) — must lie inside the body of `createGitHistoryReader`, the module's one exported
 * reader factory (a function declaration, or a `const` bound to an arrow function or a function expression). The other
 * half of the seam, that every check runs on an in-memory reader with no repository, is
 * `test/core/governance-check.test.ts`.
 *
 * The git-running functions (design, AC 8 row): `execFileSync`, `spawnSync`, `runGitRead`, `runGitReadBytes`,
 * `readBlobs`, `readRevisionPaths`, `resolveCommitAtRev`, `verifyTransitionConsistency`, `reconstructMemoryTransitions`,
 * `loadMemoryDocumentsAtRev`, `getMemoryHistory`.
 *
 * Expected red: `src/core/governance-check.ts` does not exist: `the module exists` fails on its assertion, and the
 * reader-body cases find no `createGitHistoryReader` (an empty source).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

const MODULE = join(__dirname, '..', '..', 'src', 'core', 'governance-check.ts');
const GIT_CALLS = new Set([
  'execFileSync',
  'spawnSync',
  'runGitRead',
  'runGitReadBytes',
  'readBlobs',
  'readRevisionPaths',
  'resolveCommitAtRev',
  'verifyTransitionConsistency',
  'reconstructMemoryTransitions',
  'loadMemoryDocumentsAtRev',
  'getMemoryHistory',
]);

/** The name a call is made by: `f(…)` → `f`, `a.b.f(…)` → `f`; anything else has none. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** The body of `createGitHistoryReader`: a function declaration, or a `const` bound to an arrow or function expression. */
function readerBody(source: ts.SourceFile): ts.Node | undefined {
  let body: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'createGitHistoryReader' && node.body !== undefined) body = node.body;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'createGitHistoryReader' && node.initializer !== undefined) {
      const initializer = node.initializer;
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) body = initializer.body;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return body;
}

describe('task-365 AC 8 — createGitHistoryReader is the only part of src/core/governance-check.ts that calls git (spec-020 §4.13)', () => {
  it('the module exists', () => {
    expect(existsSync(MODULE)).toBe(true);
  });

  // Read at collection time only when present, so a missing module is the assertion above, not a suite that cannot run.
  const text = existsSync(MODULE) ? readFileSync(MODULE, 'utf-8') : '';
  const source = ts.createSourceFile(MODULE, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const body = readerBody(source);
  const calls: { name: string; line: number; inside: boolean }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name !== undefined && GIT_CALLS.has(name)) {
        const inside = body !== undefined && node.getStart(source) >= body.getStart(source) && node.getEnd() <= body.getEnd();
        calls.push({ name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, inside });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  it('declares createGitHistoryReader, exported, with a body', () => {
    expect(body).toBeDefined();
    expect(text).toMatch(/export\s+(?:async\s+)?(?:function\s+createGitHistoryReader\b|const\s+createGitHistoryReader\b)/);
  });

  it('calls git at all (inside the reader)', () => {
    expect(calls.filter((call) => call.inside).length).toBeGreaterThan(0);
  });

  it('every git-running call lies inside createGitHistoryReader\'s body', () => {
    expect(calls.filter((call) => !call.inside).map((call) => `${call.name} at line ${call.line}`)).toEqual([]);
  });
});

/**
 * The `details` keys core errors use, read from the sources (task-375 AC 2, `bug-303`; `spec-005` §3.1 "One rule for
 * every `details` key").
 *
 * Every tracked `src/**\/*.ts` file outside `src/cli/` and `src/mcp/` (those render errors, they do not build them) is
 * parsed with the repository's `typescript`. For each `details:` property assignment:
 *
 * - an object literal gives its property names (an identifier or a string literal name; a spread is skipped: it
 *   forwards keys that are found at their own site);
 * - a call to a function declared in the same file (a function declaration, or a `const` bound to an arrow function or
 *   a function expression) is followed to the object literal(s) it returns;
 * - `<expr>.details` is forwarding and is skipped;
 * - anything else is reported as an unsupported site, `file:line`.
 *
 * Parentheses and `as` / `satisfies` / non-null wrappers around an initializer are looked through: they do not change
 * which keys the object carries. The walk is deterministic: files in `git ls-files` order, sites in source order.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

/** One `details` key found in the sources, with the site that sets it. */
export interface DetailKeySite {
  readonly key: string;
  /** `src/<path>:<line>`, 1-based. */
  readonly site: string;
}

/** What the walk found: every key with its sites, and every `details:` initializer it could not read. */
export interface DetailKeysScan {
  readonly keys: readonly DetailKeySite[];
  readonly unsupported: readonly string[];
}

/** The repository root (this file lives in `test/core/helpers/`). */
export const REPO_ROOT = join(__dirname, '..', '..', '..');

/** The tracked `.ts` files that build core errors: `src/` minus `src/cli/` and `src/mcp/`, in `git ls-files` order. */
export function errorBuildingSources(root: string = REPO_ROOT): string[] {
  return execFileSync('git', ['-C', root, 'ls-files', '--', 'src'], { encoding: 'utf-8' })
    .split('\n')
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.d.ts'))
    .filter((path) => !path.startsWith('src/cli/') && !path.startsWith('src/mcp/'));
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression;
    } else if (ts.isSatisfiesExpression(current)) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return undefined;
}

function isDetailsAssignment(node: ts.Node): node is ts.PropertyAssignment {
  return ts.isPropertyAssignment(node) && propertyName(node.name) === 'details';
}

/** The same-file functions a `details:` initializer may call, by name. */
function localFunctions(source: ts.SourceFile): Map<string, ts.FunctionLikeDeclaration> {
  const found = new Map<string, ts.FunctionLikeDeclaration>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) found.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) found.set(node.name.text, init);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The expressions a function returns: an arrow's expression body, or every `return <expr>` of its own body. */
function returnedExpressions(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return; // a nested function's returns are not this function's
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out;
}

/** Scan the error-building sources for the `details` keys they set. */
export function scanDetailKeys(root: string = REPO_ROOT): DetailKeysScan {
  const keys: DetailKeySite[] = [];
  const unsupported: string[] = [];
  for (const path of errorBuildingSources(root)) {
    const text = readFileSync(join(root, path), 'utf-8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const functions = localFunctions(source);
    const at = (node: ts.Node): string => `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;

    const collect = (expr: ts.Expression, site: ts.Node, seen: ReadonlySet<string>): void => {
      const init = unwrap(expr);
      if (ts.isObjectLiteralExpression(init)) {
        for (const property of init.properties) {
          if (ts.isSpreadAssignment(property)) continue;
          const name = property.name ? propertyName(property.name) : undefined;
          if (name === undefined) unsupported.push(`${at(property)} (a computed key)`);
          else keys.push({ key: name, site: at(site) });
        }
        return;
      }
      if (ts.isPropertyAccessExpression(init) && init.name.text === 'details') return; // forwarding
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
        const name = init.expression.text;
        const fn = functions.get(name);
        if (fn && !seen.has(name)) {
          const returned = returnedExpressions(fn);
          if (returned.length === 0) unsupported.push(`${at(init)} (${name} returns nothing readable)`);
          for (const value of returned) collect(value, site, new Set([...seen, name]));
          return;
        }
      }
      unsupported.push(at(init));
    };

    const visit = (node: ts.Node): void => {
      if (isDetailsAssignment(node)) collect(node.initializer, node, new Set());
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { keys, unsupported };
}

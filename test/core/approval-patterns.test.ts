/**
 * task-365 AC 4 (red-first; `spec-020` §4.9, AC-4; design item 2, D2 (a)) — `approval-agent-trailer`'s two patterns
 * are one exported pair, defined once in `src/`.
 *
 * - `APPROVER_LINE_RE` and `AGENT_TRAILER_LINE_RE` are exported by `src/storage/commit.ts` and re-exported, as the
 *   same objects, by the `src/storage` barrel: `RegExp`s whose sources are `^approver:` and
 *   `^(co-authored-by|ai-model):`, flags `i` and `m`, never `g` (so `test` keeps no state between calls).
 * - Structural: every tracked `src/**\/*.ts` file is parsed with the repository's `typescript`, and every
 *   regular-expression literal token is read (comments are trivia, so a pattern quoted in a comment is not one). A
 *   literal whose pattern, lower-cased and with `(?:` read as `(`, equals one of the two sources and whose flags contain
 *   `i` is a definition of that pattern: each source has exactly one, in `src/storage/commit.ts`. No `new RegExp(…)`
 *   builds either source from a string literal.
 * - Out of the rule on purpose: a literal without the `i` flag is another pattern, not a definition of the pair — for
 *   example the case-sensitive first-body-line reader `APPROVER_KEY_RE = /^Approver:/` of `src/memory/commit-message.ts`
 *   (design, "What the code does at this head"), which keeps its own meaning.
 *
 * Expected red: the two constants are not exported (`tsc` TS2305; at run time `undefined`), and the scan finds the
 * second definition of the agent-trailer pattern in `src/memory/commit-message.ts` (the `--reason` defect's own copy).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

import * as storage from '../../src/storage';
import { AGENT_TRAILER_LINE_RE, APPROVER_LINE_RE } from '../../src/storage/commit';

const REPO_ROOT = join(__dirname, '..', '..');
const SOURCES = { approver: '^approver:', agentTrailer: '^(co-authored-by|ai-model):' } as const;

/** The tracked `.ts` sources under `src/`, in `git ls-files` order. */
function trackedSources(): string[] {
  return execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--', 'src'], { encoding: 'utf-8' })
    .split('\n')
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.d.ts'));
}

/** A pattern as the rule compares it: lower-cased, `(?:` read as `(`. */
const normalized = (pattern: string): string => pattern.toLowerCase().split('(?:').join('(');

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Every regular-expression literal and every `new RegExp('<literal>', …)` of `src/`, with the file and line. */
function scan(): { literals: (Site & { pattern: string; flags: string })[]; constructed: (Site & { pattern: string })[] } {
  const literals: (Site & { pattern: string; flags: string })[] = [];
  const constructed: (Site & { pattern: string })[] = [];
  for (const file of trackedSources()) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const lineOf = (node: ts.Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const visit = (node: ts.Node): void => {
      if (ts.isRegularExpressionLiteral(node)) {
        const literal = node.text;
        const end = literal.lastIndexOf('/');
        literals.push({ file, line: lineOf(node), text: literal, pattern: literal.slice(1, end), flags: literal.slice(end + 1) });
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'RegExp') {
        const first = node.arguments?.[0];
        if (first !== undefined && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          constructed.push({ file, line: lineOf(node), text: node.getText(source), pattern: first.text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { literals, constructed };
}

describe('task-365 AC 4 — the exported pair (spec-020 §4.9, design item 2)', () => {
  it.each([
    ['APPROVER_LINE_RE', SOURCES.approver, () => APPROVER_LINE_RE],
    ['AGENT_TRAILER_LINE_RE', SOURCES.agentTrailer, () => AGENT_TRAILER_LINE_RE],
  ] as const)('%s is a RegExp, source %s, flags with i and m and without g', (_name, source, get) => {
    const pattern = get();
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.source).toBe(source);
    expect(pattern.flags).toContain('i');
    expect(pattern.flags).toContain('m');
    expect(pattern.flags).not.toContain('g');
  });

  it('the src/storage barrel re-exports the same two objects', () => {
    const barrel = storage as unknown as Record<string, unknown>;
    expect(barrel.APPROVER_LINE_RE).toBe(APPROVER_LINE_RE);
    expect(barrel.AGENT_TRAILER_LINE_RE).toBe(AGENT_TRAILER_LINE_RE);
  });

  it('one object serves a whole message and a single line, in any letter case, and keeps no state between calls', () => {
    const message = 'wf(task): approve t-1 [pending → backlog]\n\napprover: A <a@example.invalid> (approver)\nReason: ok.\n\nAI-Model: m-1';
    expect(APPROVER_LINE_RE.test(message)).toBe(true);
    expect(APPROVER_LINE_RE.test(message)).toBe(true);
    expect(AGENT_TRAILER_LINE_RE.test(message)).toBe(true);
    expect(AGENT_TRAILER_LINE_RE.test('CO-AUTHORED-BY: X <x@example.invalid>')).toBe(true);
    expect(AGENT_TRAILER_LINE_RE.test('Reason: ok.')).toBe(false);
  });
});

describe('task-365 AC 4 — no second definition of the pair in src/ (structural)', () => {
  const { literals, constructed } = scan();

  it('the scan reads regular-expression literals at all (it finds the many of src/)', () => {
    expect(literals.length).toBeGreaterThan(20);
  });

  it.each([
    ['approver', SOURCES.approver],
    ['agent-trailer', SOURCES.agentTrailer],
  ] as const)('the %s pattern (%s) is defined exactly once, in src/storage/commit.ts', (_label, source) => {
    const definitions = literals
      .filter((literal) => normalized(literal.pattern) === source && literal.flags.includes('i'))
      .map((literal) => `${literal.file}:${literal.line} ${literal.text}`);
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatch(/^src\/storage\/commit\.ts:\d+ /);
  });

  it('no new RegExp(…) builds either pattern from a string literal', () => {
    const built = constructed
      .filter((entry) => normalized(entry.pattern) === SOURCES.approver || normalized(entry.pattern) === SOURCES.agentTrailer)
      .map((entry) => `${entry.file}:${entry.line} ${entry.text}`);
    expect(built).toEqual([]);
  });
});

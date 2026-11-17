/**
 * task-334 AC 9 (red-first, structural; `bug-531`, design-gate ruling D1 (a); `spec-006` §7 step 2, `spec-018` §2.6,
 * `spec-017` §7.9) — the gated agent context is resolved where `spec-006` §7 places it, read from the source as
 * task-333's call-site parity is (`test/cli/agent-context-refusal.integration.test.ts`, T-9):
 *
 * - `resolveGatedAgentContext(` is called only in `src/core/memory-transition.ts`, `workflow-adopt.ts`,
 *   `workflow-rekey.ts` and `workflow-finalize.ts` — once each — and nowhere else outside its own module
 *   (`src/core/agent-context.ts`); the three `src/core/index.ts` callers of today use the transition's context (D1);
 * - in `memory-transition.ts`, `workflow-adopt.ts` and `workflow-rekey.ts` it is the first statement after the
 *   membership pre-flight (`if (!member.ok) return member;`), before any other read: right after membership;
 * - in `workflow-finalize.ts` it stays in the `approval:` branch (`if (phase.approval !== undefined) {`), after the
 *   deduction (`readDeductionSnapshotAtHead(`): only there is the operation known to be gated (`spec-017` §7.9).
 *
 * Comment lines are skipped. Red until green: today the function is called in `src/core/index.ts` three times and not
 * in `memory-transition.ts`. Deterministic: files read in a sorted order.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const CALL_RE = /\bresolveGatedAgentContext\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith('.ts') ? [path] : [];
    })
    .sort();
}

const isComment = (line: string): boolean => {
  const code = line.trim();
  return code.startsWith('*') || code.startsWith('//') || code.startsWith('/*');
};

/** Each code line calling `resolveGatedAgentContext(` outside `src/core/agent-context.ts`, as `{ file, index }`. */
function callSites(): { file: string; lines: string[]; index: number }[] {
  const sites: { file: string; lines: string[]; index: number }[] = [];
  for (const path of sourceFiles(join(REPO_ROOT, 'src'))) {
    const file = relative(REPO_ROOT, path).split('\\').join('/');
    if (file === 'src/core/agent-context.ts') continue;
    const lines = readFileSync(path, 'utf-8').split('\n');
    lines.forEach((line, index) => {
      if (!isComment(line) && CALL_RE.test(line)) sites.push({ file, lines, index });
    });
  }
  return sites;
}

/** The first statement after line `from` (exclusive): code lines joined up to the first one ending with `;`. */
function nextStatement(lines: readonly string[], from: number): { text: string; lastIndex: number } {
  const parts: string[] = [];
  for (let at = from + 1; at < lines.length; at += 1) {
    const line = lines[at] as string;
    if (line.trim() === '' || isComment(line)) continue;
    parts.push(line.trim());
    if (/;\s*$/.test(line)) return { text: parts.join(' '), lastIndex: at };
  }
  return { text: parts.join(' '), lastIndex: lines.length - 1 };
}

const MEMBERSHIP_CHECK = /^\s*if \(!member\.ok\) return member;\s*$/;

describe('task-334 AC 9 — resolveGatedAgentContext( is resolved where spec-006 §7 places it (bug-531)', () => {
  const sites = callSites();

  it('is called once in each of memory-transition.ts, workflow-adopt.ts, workflow-finalize.ts, workflow-rekey.ts, and nowhere else', () => {
    expect(sites.map((site) => site.file).sort()).toEqual([
      'src/core/memory-transition.ts',
      'src/core/workflow-adopt.ts',
      'src/core/workflow-finalize.ts',
      'src/core/workflow-rekey.ts',
    ]);
  });

  it.each(['src/core/memory-transition.ts', 'src/core/workflow-adopt.ts', 'src/core/workflow-rekey.ts'])(
    '%s: the call is the first statement after the membership pre-flight',
    (file) => {
      const site = sites.find((candidate) => candidate.file === file);
      expect(site).toBeDefined();
      if (site === undefined) return;
      let membership = -1;
      for (let at = site.index - 1; at >= 0; at -= 1) {
        if (MEMBERSHIP_CHECK.test(site.lines[at] as string)) {
          membership = at;
          break;
        }
      }
      expect(membership).toBeGreaterThanOrEqual(0);
      const statement = nextStatement(site.lines, membership);
      expect(statement.text).toMatch(CALL_RE);
      expect(statement.lastIndex).toBeGreaterThanOrEqual(site.index);
    },
  );

  it('src/core/workflow-finalize.ts: the call stays in the approval: branch, after the deduction', () => {
    const site = sites.find((candidate) => candidate.file === 'src/core/workflow-finalize.ts');
    expect(site).toBeDefined();
    if (site === undefined) return;
    const indent = (line: string): number => (/^\s*/.exec(line) as RegExpExecArray)[0].length;
    const own = indent(site.lines[site.index] as string);
    let branch = '';
    for (let at = site.index - 1; at >= 0; at -= 1) {
      const line = site.lines[at] as string;
      if (line.trim() !== '' && !isComment(line) && indent(line) < own) {
        branch = line.trim();
        break;
      }
    }
    expect(branch).toBe('if (phase.approval !== undefined) {');
    const deduction = site.lines.findIndex((line) => !isComment(line) && /\breadDeductionSnapshotAtHead\(/.test(line));
    expect(deduction).toBeGreaterThanOrEqual(0);
    expect(deduction).toBeLessThan(site.index);
  });
});

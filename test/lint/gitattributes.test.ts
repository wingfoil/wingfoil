/**
 * task-355 AC 2 (red-first, `bug-318`; `testing` T2) — the run log's end-of-line rule.
 *
 * `agent execute` appends one JSON line per run to `<paths.runs>/<element-id>.jsonl` and commits it
 * (`spec-016` §4.1). With no attribute, a checkout under `core.autocrlf=true` rewrites those files with CRLF,
 * and the next append mixes line endings in a committed record. `.gitattributes` at the repository root
 * declares `*.jsonl text eol=lf`; this suite asserts the line, what git resolves for a path in the run log
 * directory `dna.yaml` declares, and that every committed `*.jsonl` is LF in the index (the last half a
 * characterization: no renormalization is needed).
 *
 * Deterministic: a fixed file, git's attribute and index reads, no clock.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

const REPO_ROOT = join(__dirname, '..', '..');

/** `git <args>` at the repository root, its stdout. */
const git = (args: readonly string[]): string => execFileSync('git', [...args], { cwd: REPO_ROOT, encoding: 'utf-8' });

/** The first directory of `dna.yaml`'s `paths.runs`, the run log. */
function runLogDir(): string {
  const dna = load(readFileSync(join(REPO_ROOT, '.wingfoil', 'dna.yaml'), 'utf-8')) as { paths: { runs: string[] } };
  const dir = dna.paths.runs[0]!;
  return dir.endsWith('/') ? dir : `${dir}/`;
}

describe('task-355 AC 2 — .gitattributes keeps the run log LF (bug-318, spec-016 §4.1)', () => {
  it('.gitattributes declares the line *.jsonl text eol=lf', () => {
    const lines = readFileSync(join(REPO_ROOT, '.gitattributes'), 'utf-8').split('\n').map((line) => line.trim());
    expect(lines).toContain('*.jsonl text eol=lf');
  });

  it('git resolves text: set and eol: lf for a run record path', () => {
    const probe = `${runLogDir()}probe.jsonl`;
    expect(git(['check-attr', 'text', 'eol', '--', probe])).toBe(`${probe}: text: set\n${probe}: eol: lf\n`);
  });

  it('every committed *.jsonl is LF in the index (characterization)', () => {
    const entries = git(['ls-files', '--eol', '--', '*.jsonl'])
      .split('\n')
      .filter((line) => line !== '');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((entry) => !entry.startsWith('i/lf '))).toEqual([]);
  });
});

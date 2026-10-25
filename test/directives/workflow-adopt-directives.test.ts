/**
 * task-294 AC 5 (red until green edits the two directives; `dl-187` "What changes elsewhere") — the directives
 * name what `workflow adopt` adds:
 *
 * - `git-conventions` §4 names the record's subject, `workflow: adopt <instance> <key> <type>:<id>`, as a commit
 *   outside the `wf()` grammar, and §8 the `WingFoil-Adopted:` trailer its final paragraph carries;
 * - `command-baseline`'s declared `HEAD` reads name `workflow adopt --plan` (`spec-017` §11; `spec-008` §11's
 *   "committed at `HEAD`, declared" row).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIRECTIVES = join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom');

function section(file: string, heading: string): string {
  const text = readFileSync(join(DIRECTIVES, file), 'utf-8');
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`${file} has no section "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

describe('task-294 — git-conventions names the adoption record', () => {
  it('§4 names the subject workflow: adopt <instance> <key> <type>:<id>', () => {
    expect(section('git-conventions.md', '4. Commit subjects')).toContain('workflow: adopt <instance> <key> <type>:<id>');
  });

  it('§8 names the WingFoil-Adopted: trailer of the final paragraph', () => {
    expect(section('git-conventions.md', '8. Amending a tool-written commit')).toContain('WingFoil-Adopted:');
  });
});

describe('task-294 — command-baseline names workflow adopt --plan among the declared HEAD reads', () => {
  it('the "Declared `HEAD` reads" section names it', () => {
    expect(section('command-baseline.md', 'Declared `HEAD` reads')).toContain('workflow adopt --plan');
  });
});

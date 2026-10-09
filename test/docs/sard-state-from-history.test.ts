/**
 * task-203 — REQ-SYS-03 and REQ-STATE-02 say what the deduction reads (`spec-017` Consequences → SARD).
 *
 * Workflow state is deduced from Memory files **and** from the commit history reachable from the
 * commit: an instance's start commit (§3.3), and the step linkage, phase records and re-entries of its
 * walk (§4.8). Both requirements said "from Memory files" alone, which the deduction no longer is;
 * recomputability at a fixed commit is unchanged, and no `.wingfoil/state/` index exists. The behaviour
 * half — two computations at one commit agree — is `test/core/workflow-deduction-history.test.ts`
 * AC 4.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const sard = (file: string): string => readFileSync(join(__dirname, '..', '..', 'docs', '02_requirements', '03_sard', file), 'utf-8');

/** The `* **Description:** …` bullet of requirement `id`, unwrapped onto one line. */
function description(text: string, id: string): string {
  const section = text.slice(text.indexOf(`### ${id} `));
  const start = section.indexOf('* **Description:**');
  const end = section.indexOf('\n* **', start + 1);
  return section
    .slice(start, end)
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const PHRASE = 'from Memory files and the commit history reachable from the commit';

describe('task-203 AC 4 — the SARD says state is deduced from Memory files and the reachable history', () => {
  it.each([
    ['01_architecture.md', 'REQ-SYS-03'],
    ['03_state-context.md', 'REQ-STATE-02'],
  ])('%s %s', (file, id) => {
    const text = description(sard(file), id);
    expect(text).toContain(PHRASE);
    expect(text).toContain('.wingfoil/state/');
  });
});

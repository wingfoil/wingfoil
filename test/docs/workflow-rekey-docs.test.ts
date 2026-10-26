/**
 * task-295 AC 4 (red-first part; design D9) — the directives name the `workflow rekey` record:
 *
 * - `git-conventions.md` §4 (the text between `## 4.` and `## 5.`) gives its subject
 *   `` `workflow: rekey <instance-id> <from> <to>` ``;
 * - `git-conventions.md` §8 (between `## 8.` and `## 9.`) names the `` `WingFoil-Rekey-From:` `` and
 *   `` `WingFoil-Rekey-To:` `` trailers and `` `workflow rekey` ``, the command that writes them;
 * - `command-baseline.md` names `` `workflow rekey` `` (D9: the sentence after the declared-`HEAD`-reads table).
 *
 * The other AC 4 clauses are gated by existing suites (`test/docs/cli-reference.test.ts`,
 * `test/docs/x-cli-cmds.test.ts`, the two allowlist suites) and the governance-check clause by the CLI file's
 * governance pin and task-294's AC 4 test; document versions are checked at review (`doc-versioning`), not here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIRECTIVES = join(__dirname, '..', '..', '.wingfoil', 'directives', 'custom');
const GIT_CONVENTIONS = readFileSync(join(DIRECTIVES, 'git-conventions.md'), 'utf-8');
const COMMAND_BASELINE = readFileSync(join(DIRECTIVES, 'command-baseline.md'), 'utf-8');

/** The text of section `n` of `text`: from the line starting `## <n>.` up to the line starting `## <n+1>.`. */
function section(text: string, n: number): string {
  const start = text.indexOf(`\n## ${n}. `);
  const end = text.indexOf(`\n## ${n + 1}. `);
  if (start < 0 || end < 0 || end < start) throw new Error(`no section ${n}`);
  return text.slice(start, end);
}

describe('task-295 AC 4 — the directives name the workflow rekey record', () => {
  it('git-conventions §4 gives the subject `workflow: rekey <instance-id> <from> <to>`', () => {
    expect(section(GIT_CONVENTIONS, 4)).toContain('`workflow: rekey <instance-id> <from> <to>`');
  });

  it('git-conventions §8 names the WingFoil-Rekey-From: / WingFoil-Rekey-To: trailers of a `workflow rekey` record', () => {
    const text = section(GIT_CONVENTIONS, 8);
    expect(text).toContain('`WingFoil-Rekey-From:`');
    expect(text).toContain('`WingFoil-Rekey-To:`');
    expect(text).toContain('`workflow rekey`');
  });

  it('command-baseline names `workflow rekey` (D9)', () => {
    expect(COMMAND_BASELINE).toContain('`workflow rekey`');
  });
});

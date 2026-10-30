/**
 * task-313 AC 3 (`bug-262`; approver design gate 2026-10-30) — `wingfoil memory history` on the compiled CLI reports
 * a past revision written in a newer `format` as unreadable, through the channel it already uses for a revision
 * whose frontmatter does not parse: exit 0, the entry's `to` is `null` and its `unreadable` names
 * `E_INVALID_FORMAT`, the next entry's `from` is `null`, and stderr carries one `W_MEMORY_UNREADABLE` warning naming
 * the file and the commit. Run with `--format json`, so stdout is the result and the warning is one JSON line.
 *
 * bug-262's steps, on a fresh `wingfoil init --template scrum`: `memory add --type task --title "Older probe"`
 * (`format: 1`, `draft`), then by hand `format: 2` + `status: pending` committed as `wf(task): submit …`, then
 * `format: 1` + `status: draft` committed as `wf(task): reject … [pending → draft]`. The operation's own case is
 * `test/core/memory-history.test.ts`; the reader's is `test/memory/audit-parent-unreadable.test.ts`.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const PROBE = 'docs/memory/task/task-001-older-probe.md';
const NEWER = 'E_INVALID_FORMAT: this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil';

describe('task-313 AC 3 (bug-262) — wingfoil memory history over a past revision in a newer format', () => {
  let repo: string;
  let submit: string;

  /** Rewrite the probe's `status` and `format` lines and commit the result with `subject`. */
  const rewrite = (status: string, format: number, subject: string): string => {
    const file = join(repo, PROBE);
    const text = readFileSync(file, 'utf-8')
      .replace(/^status: .*$/m, `status: ${status}`)
      .replace(/^format: .*$/m, `format: ${format}`);
    writeFileSync(file, text, 'utf-8');
    git(repo, ['commit', '--quiet', '-am', subject]);
    return git(repo, ['rev-parse', 'HEAD']).trim();
  };

  beforeAll(() => {
    repo = makeTempGitRepo();
    const init = runCliEntry(repo, ['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
    const add = runCliEntry(repo, ['memory', 'add', '--type', 'task', '--title', 'Older probe']);
    if (add.status !== 0) throw new Error(`fixture bug: wingfoil memory add failed — ${add.stderr}`);
    const scaffold = readFileSync(join(repo, PROBE), 'utf-8');
    if (!/^status: draft$/m.test(scaffold) || !/^format: 1$/m.test(scaffold)) {
      throw new Error(`fixture bug: the added task is not at status draft, format 1:\n${scaffold}`);
    }
    submit = rewrite('pending', 2, 'wf(task): submit task-001-older-probe');
    rewrite('draft', 1, 'wf(task): reject task-001-older-probe [pending → draft]');
  });

  afterAll(() => removeTempDir(repo));

  it('red-first: exit 0; the submit entry has to null and the E_INVALID_FORMAT reason, the reject entry from null; one JSON warning on stderr', () => {
    const run = runCliEntry(repo, ['memory', 'history', 'task-001-older-probe', '--format', 'json']);
    expect(run.status).toBe(0);
    const entries = (JSON.parse(run.stdout) as { entries: Array<Record<string, unknown>> }).entries;
    expect(entries.map((entry) => [entry.operation, entry.from, entry.to, entry.unreadable ?? null])).toEqual([
      ['add', null, 'draft', null],
      ['submit', 'draft', null, NEWER],
      ['reject', null, 'draft', null],
    ]);
    expect(entries[1]!.sha).toBe(submit);
    // Under `--format json` a warning is one JSON line on stderr (checked on a revision whose frontmatter does not parse).
    expect(run.stderr).toBe(`${JSON.stringify({ warning: `W_MEMORY_UNREADABLE (${PROBE}): unreadable frontmatter in ${PROBE}: ${NEWER} (at ${submit})` })}\n`);
  });
});

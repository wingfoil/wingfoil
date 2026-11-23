/**
 * task-380 AC 4 (characterization under design gate D1 (b); `bug-514`) — `spec-008-cli-grammar` §2 and the program
 * agree on the negatable globals. The approver's amend `a7ff8c07c` made §2 name the registered `--no-color` and
 * `--no-interactive` and say that their positive forms are refused as unknown options, so this suite pins an
 * agreement that already holds and passes on first run:
 *
 * - (a) every long option the root program registers is the first flag of a row of §2's table, and no row's first flag
 *   is `--color` or `--interactive`;
 * - (b) the compiled CLI refuses the positive forms: `node dist/cli.js --interactive capabilities` → exit 2, stderr
 *   `error: unknown option '--interactive'` / `hint: did you mean "--no-interactive"?`; `--color capabilities` → the
 *   `--color` / `--no-color` pair (both copied from a real run of the built CLI).
 *
 * `agent execute`'s own `--interactive`, which a root `--interactive` would take, is pinned by
 * `test/cli/agent-execute-launch-kind.integration.test.ts` ("AC 2 (d)"). Unasserted here (T1): §2's other columns.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry } from '../cli/helpers/spawn-cli';

const SPECS = join(__dirname, '..', '..', 'docs', '04_memory', 'design', 'specs');

function specFile(prefix: string): string {
  const name = readdirSync(SPECS).find((entry) => entry.startsWith(`${prefix}-`) && entry.endsWith('.md'));
  if (name === undefined) throw new Error(`no ${prefix} under ${SPECS}`);
  return readFileSync(join(SPECS, name), 'utf-8');
}

/** The lines of §2 from its heading up to (excluding) the `Notes:` line. */
function section2(): string[] {
  const lines = specFile('spec-008').split('\n');
  const from = lines.findIndex((line) => line.startsWith('### 2. Global flags'));
  if (from < 0) throw new Error('no heading ### 2. Global flags');
  const to = lines.findIndex((line, index) => index > from && line.startsWith('Notes:'));
  return lines.slice(from, to < 0 ? undefined : to);
}

/** The long flag each table row of §2 starts with: the first word of its first backticked span. */
function rowFlags(): string[] {
  return section2()
    .filter((line) => line.startsWith('| `'))
    .map((line) => ((/`([^`]+)`/.exec(line)?.[1] ?? '').split(' ')[0] ?? '').replace(/,$/, ''));
}

describe('task-380 AC 4 — spec-008 §2 names the negatable globals as the program registers them (bug-514, D1 (b))', () => {
  it('§2 has a table to read (guard against a vacuous read)', () => {
    expect(rowFlags()).toEqual(expect.arrayContaining(['--format', '--no-color', '--no-interactive']));
  });

  it('every long option the root program registers is the first flag of a §2 row', async () => {
    const program = await buildProgram(CORE_MODULES, { resolveRoot: () => '/unused', buildParams: () => ({}) });
    const registered = program.options.map((option) => option.long ?? '');
    expect(registered).toEqual(expect.arrayContaining(['--no-color', '--no-interactive']));
    const flags = rowFlags();
    expect(registered.filter((flag) => !flags.includes(flag))).toEqual([]);
  });

  it('no §2 row starts with the positive forms `--color` or `--interactive`', () => {
    expect(rowFlags().filter((flag) => flag === '--color' || flag === '--interactive')).toEqual([]);
  });

  describe('the compiled CLI refuses the positive forms as unknown options', () => {
    let repo: string;

    beforeAll(() => {
      expect(existsSync(CLI_ENTRY)).toBe(true);
      repo = makeTempGitRepo();
    });

    afterAll(() => removeTempDir(repo));

    it.each([
      ['--interactive', '--no-interactive'],
      ['--color', '--no-color'],
    ])('`wingfoil %s capabilities` exits 2 with the unknown-option line and the `%s` hint', (flag, negated) => {
      const result = runCliEntry(repo, [flag, 'capabilities']);
      expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
        status: 2,
        stdout: '',
        stderr: `error: unknown option '${flag}'\nhint: did you mean "${negated}"?\n`,
      });
    });
  });
});

/**
 * task-365 AC 1 and AC 7 (red-first; `spec-020` §2.1, §2.2, §8.1, §8.2, T-35; design items 4, 8, D5 (a), D9 (a)) —
 * `wingfoil verify` in `CORE_MODULES`, and its operation run in-process.
 *
 * - AC 1: a module `verify`, no module description, whose one operation is the self-named `verify`: `mutates: false`,
 *   no `readsProject`, no `positional`, no `flags`; the options `base` and `introduced-at`, in that order, each with
 *   `valueName: 'rev'`; design item 8's description and example; `renderConsole` is `renderVerifyConsole`;
 *   `deriveVerb('verify', 'verify')` is `''`; the Commander program registers `verify` with `--base <rev>` and
 *   `--introduced-at <rev>`.
 * - AC 7, in-process (a spawned run counts toward no coverage): a gated finding is a success that carries `failed`
 *   (`coreFailed(report, verifyFindingsMessage(report))`); a passing range is a plain `coreOk` with no `failed` key; a
 *   revision that names nothing is a `NOT_FOUND` error whose `details` are `{ rev, flag }`; a blank `--base` is the
 *   `UsageError` `invalid flag value: --base must not be blank`.
 *
 * Fixture: a throwaway repository with the governed base of `test/cli/verify.integration.test.ts` (the `MEMORY_YAML`,
 * `DNA` and `taskDoc` of `./helpers/in-memory-history-reader`, copied there from
 * `test/cli/check-governance-parent-state.test.ts`), fixed dates, identities per commit.
 *
 * Expected red: no module `verify` (assertions on `undefined`, `Error: no operation verify.verify in CORE_MODULES`);
 * `src/core/governance-check.ts` does not exist (`tsc` TS2307; jest `Cannot find module` in the one case that loads it).
 */
import { execFileSync } from 'node:child_process';

import type { Command } from 'commander' with { 'resolution-mode': 'import' };

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES } from '../../src/core';
import type * as GovernanceCheck from '../../src/core/governance-check';
import { deriveVerb } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { APPROVER, DEVELOPER, DNA, MEMORY_YAML, TASK, approvalBody, taskDoc, type Person } from './helpers/in-memory-history-reader';

const DESCRIPTION = 'check a commit range against the Memory and approval contracts';
const EXAMPLE = 'wingfoil verify --base origin/main';

function verifyOperation() {
  const operation = CORE_MODULES.find((module) => module.name === 'verify')?.operations.verify;
  if (operation === undefined) throw new Error('no operation verify.verify in CORE_MODULES');
  return operation;
}

describe('task-365 AC 1 — the verify operation in CORE_MODULES (spec-020 §2.1, §2.2, T-35)', () => {
  it('a module `verify` with no description whose one operation is the self-named `verify`, mutates false, no readsProject, positional or flags', () => {
    const module = CORE_MODULES.find((candidate) => candidate.name === 'verify');
    expect(module).toBeDefined();
    expect((module as unknown as { description?: unknown }).description).toBeUndefined();
    expect(Object.keys(module!.operations)).toEqual(['verify']);
    const operation = module!.operations.verify!;
    expect(operation.name).toBe('verify');
    expect(operation.mutates).toBe(false);
    expect((operation as unknown as { readsProject?: unknown }).readsProject).toBeUndefined();
    expect(operation.positional).toBeUndefined();
    expect(operation.flags).toBeUndefined();
  });

  it('the options are `base` then `introduced-at`, each `valueName: \'rev\'` with a description', () => {
    const options = verifyOperation().options ?? [];
    expect(options.map((option) => option.name)).toEqual(['base', 'introduced-at']);
    for (const option of options) {
      expect((option as { valueName?: unknown }).valueName).toBe('rev');
      expect(typeof option.description).toBe('string');
      expect((option.description ?? '').trim()).not.toBe('');
    }
  });

  it('its description and example are design item 8\'s, and it renders the console with renderVerifyConsole', () => {
    // Loaded here, not at the top, so the other cases of this file report their own red while the module is missing.
    const { renderVerifyConsole } = jest.requireActual<typeof GovernanceCheck>('../../src/core/governance-check');
    const operation = verifyOperation() as unknown as { description?: unknown; example?: unknown; renderConsole?: unknown };
    expect(operation.description).toBe(DESCRIPTION);
    expect(operation.example).toBe(EXAMPLE);
    expect(operation.renderConsole).toBe(renderVerifyConsole);
  });

  it('deriveVerb gives the empty verb: the command is the flat `wingfoil verify`', () => {
    expect(deriveVerb('verify', 'verify')).toBe('');
  });

  it('the Commander program registers a top-level `verify` with --base <rev> and --introduced-at <rev>, and no subcommand', async () => {
    const program: Command = await buildProgram(CORE_MODULES, { resolveRoot: () => '/fixture-root', buildParams: () => ({}) });
    const command = program.commands.find((candidate) => candidate.name() === 'verify');
    expect(command).toBeDefined();
    expect(command!.description()).toBe(DESCRIPTION);
    expect(command!.options.map((option) => option.flags)).toEqual(expect.arrayContaining(['--base <rev>', '--introduced-at <rev>']));
    expect(command!.commands.filter((sub) => sub.name() !== 'help')).toEqual([]);
  });
});

describe('task-365 AC 7 — the verify operation in-process (spec-020 §8, design items 4 and 8)', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach(removeTempDir));

  /** The governed base, then (optionally) T-6's approval by the developer; returns the root and the base sha. */
  function repository(withT6: boolean): { root: string; base: string } {
    const root = makeTempGitRepo();
    roots.push(root);
    let minute = 0;
    const commit = (message: string, files: Record<string, string>, author: Person = DEVELOPER): string => {
      for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
      git(root, ['add', '-A']);
      const date = `2026-01-01T08:${String(minute).padStart(2, '0')}:00Z`;
      minute += 1;
      execFileSync('git', ['commit', '--quiet', '-m', message], {
        cwd: root,
        encoding: 'utf-8',
        env: { ...process.env, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
      return git(root, ['rev-parse', 'HEAD']).trim();
    };
    commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA });
    commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
    const base = commit('wf(task): submit t-1', { [TASK('t-1')]: taskDoc('pending') });
    if (withT6) commit(`wf(task): approve t-1 [pending → backlog]\n\n${approvalBody('Ready.', APPROVER)}`, { [TASK('t-1')]: taskDoc('backlog') }, DEVELOPER);
    return { root, base };
  }

  const run = async (params: Record<string, unknown>): Promise<CoreResult<unknown>> => (await verifyOperation().fn(params as never)) as CoreResult<unknown>;

  it('a gated finding: a success whose value is the report (verdict fail) and whose `failed` is the E_VERIFY_FINDINGS reason', async () => {
    const { root, base } = repository(true);
    const result = await run({ root, options: { base } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as { verdict: string }).verdict).toBe('fail');
    expect((result as { failed?: unknown }).failed).toEqual({ message: 'E_VERIFY_FINDINGS: 2 findings on 1 commits fail the governance check (authority 2)' });
  });

  it('a passing range: coreOk with the report (verdict pass) and no `failed` key', async () => {
    const { root, base } = repository(false);
    const result = await run({ root, options: { base } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as { verdict: string; findings: unknown[] }).verdict).toBe('pass');
    expect('failed' in result).toBe(false);
  });

  it('a --base naming no commit: NOT_FOUND, resolveRevision\'s message, details { rev, flag: \'--base\' }', async () => {
    const { root } = repository(false);
    const result = await run({ root, options: { base: 'nosuchrev' } });
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'revision "nosuchrev" does not name a commit', details: { rev: 'nosuchrev', flag: '--base' } } });
  });

  it('an --introduced-at naming no commit: details { rev, flag: \'--introduced-at\' }', async () => {
    const { root } = repository(false);
    const result = await run({ root, options: { 'introduced-at': 'nosuchrev' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ rev: 'nosuchrev', flag: '--introduced-at' });
  });

  it('a blank --base is the UsageError `invalid flag value: --base must not be blank`, before any revision is resolved', async () => {
    const { root } = repository(false);
    await expect((async () => run({ root, options: { base: '' } }))()).rejects.toThrow('invalid flag value: --base must not be blank');
  });
});

/**
 * A usage error is a usage error whether or not git has an identity (task-125, `bug-172`).
 *
 * REQ-INT-04 / `spec-005-cli-command-contract` §1: a missing or malformed required argument exits
 * `2`. REQ-SEC-01: with no git identity, a state-mutating command refuses (exit `1`) and writes
 * nothing. Both hold only if the argument check comes first — an invocation that is not a valid
 * command yet has nothing to attribute, and an argument check reads and writes nothing. Before
 * task-125 eight verbs ran the identity pre-flight first, so the answer to the same malformed command
 * depended on the machine: exit `2` on a developer's, exit `1` on the CI runner `publish.yml`'s `gate`
 * job uses, which has no identity (run `36621412441`).
 *
 * The sweep is generic on purpose: every registered operation with `mutates: true` is invoked with
 * each malformed argument set below, once in a repository WITH a local identity and once in one
 * WITHOUT (git config isolated to an empty file, as `git-identity.test.ts` does). Whatever the first
 * run throws as a `UsageError`, the second must throw identically. A future mutating verb joins the
 * sweep by being registered.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForThrow } from '../../src/core/exit-code';
import { enumerateOperations, type CoreFn } from '../../src/core/registry';
import { UsageError } from '../../src/core/usage-error';

const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;

/** The outcome of one invocation: the usage error it threw, or `null` for anything else. */
async function usageOutcome(fn: CoreFn<unknown, unknown>, params: Record<string, unknown>): Promise<string | null> {
  try {
    await fn(params);
    return null;
  } catch (error) {
    if (!(error instanceof UsageError)) return null;
    expect(exitCodeForThrow(error).exitCode).toBe(2);
    return error.message;
  }
}

/**
 * Malformed argument sets, each missing or spoiling one required piece. The operation-specific ones
 * name the positional or option that verb requires; the empty set catches everything else.
 */
const MALFORMED: readonly (readonly [string, Record<string, unknown>])[] = [
  ['nothing at all', {}],
  ['a blank positional', { positional: '   ' }],
  ['an id but no --reason', { positional: 'task-001' }],
  ['an id and a blank --reason', { positional: 'task-001', options: { reason: '   ' } }],
  ['an id and a trailer-shaped --reason', { positional: 'task-001', options: { reason: 'Approver: Someone Else <x@example.invalid> (approver)' } }],
  ['a non-kebab-case --name', { options: { name: 'BadName' } }],
  ['a --directive that parses to no ids', { options: { directive: ',', role: 'developer' } }],
  ['--name only', { options: { name: 'x' } }],
  ['--directive only', { options: { directive: 'x' } }],
  ['--type only', { options: { type: 'task' } }],
  ['--type and --title with a --set lacking "="', { options: { type: 'task', title: 'T', set: 'novalue' } }],
];

const MUTATING = enumerateOperations(CORE_MODULES).filter(({ operation }) => operation.mutates);

/**
 * Mutating operations that take no required operand, so no argument set here is malformed for them:
 * `workflow end [<ref>]` (task-217, `spec-017` §7.2) acts on the active instance when given nothing. Its
 * surplus operand is refused by the registrar, before any read (`spec-008` §1). They are still swept: any
 * usage error they did throw would have to be identity-independent.
 */
const NOTHING_REQUIRED: ReadonlySet<string> = new Set(['workflow.workflowEnd']);

describe('usage errors do not depend on the git identity (task-125, bug-172)', () => {
  let withIdentity: string;
  let withoutIdentity: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    withIdentity = mkdtempSync(join(tmpdir(), 'wf-usage-id-'));
    withoutIdentity = mkdtempSync(join(tmpdir(), 'wf-usage-noid-'));
    for (const repo of [withIdentity, withoutIdentity]) execFileSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf-8' });
    const emptyConfig = join(withoutIdentity, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    execFileSync('git', ['-C', withIdentity, 'config', 'user.name', 'Test Dev'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', withIdentity, 'config', 'user.email', 'dev@example.com'], { encoding: 'utf-8' });
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(withIdentity, { recursive: true, force: true });
    rmSync(withoutIdentity, { recursive: true, force: true });
  });

  it('sweeps every mutating operation (guard against a vacuous sweep)', () => {
    // memory add/submit/approve/reject/deprecate, directive create/assign/remove, dna set/add/update/remove.
    // `init` is a bootstrap command outside CORE_MODULES; it already validates `--template` first.
    expect(MUTATING.length).toBeGreaterThanOrEqual(12);
  });

  it.each(MUTATING.map(({ module, operation }) => [`${module.name}.${operation.name}`, operation.fn] as const))(
    '%s refuses a malformed invocation with the same usage error with and without a git identity',
    async (label, fn) => {
      let usageErrorsSeen = 0;
      for (const [, params] of MALFORMED) {
        const expected = await usageOutcome(fn as CoreFn<unknown, unknown>, { root: withIdentity, ...params });
        if (expected === null) continue;
        usageErrorsSeen += 1;
        await expect(usageOutcome(fn as CoreFn<unknown, unknown>, { root: withoutIdentity, ...params })).resolves.toBe(expected);
      }
      // Every other mutating verb requires something, so the empty set alone must produce a usage error.
      if (NOTHING_REQUIRED.has(label)) expect(usageErrorsSeen).toBe(0);
      else expect(usageErrorsSeen).toBeGreaterThan(0);
    },
  );
});

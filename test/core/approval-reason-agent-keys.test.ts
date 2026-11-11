/**
 * task-333 AC 4 (b) (`spec-018` §3.3, §6 T-18; design "src/memory/commit-message.ts, src/core/require-reason.ts") —
 * on an operation that writes an `Approver:` line, a `--reason` carrying a line that starts `Co-Authored-By:` or
 * `AI-Model:` (any case) is a usage error, exit 2, with §3.3's message; on every other operation the same reason is
 * recordable, as today.
 *
 * - unit: `reasonRefusalMessage(reason, { approval: true })` returns the message, `reasonRefusalMessage(reason)` and
 *   `{ approval: false }` return `null`; `requireReason(options, { approval: true })` throws the `UsageError`;
 * - in-process, through the registered `CORE_MODULES` operations (the CLI cases are
 *   `test/cli/agent-context-refusal.integration.test.ts`): `memoryApprove`, `memoryReject`, `memoryAmend` refuse
 *   before any write; `memoryDeprecate` and `memoryPark`, which write no `Approver:` line, record the reason.
 *
 * The new option is passed through a widened function type, so the file typechecks before `src` takes it; at red
 * the extra argument is ignored and every refusal case fails on its assertion. The controls pass today.
 */
import { CORE_MODULES } from '../../src/core';
import { exitCodeForThrow } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { requireReason } from '../../src/core/require-reason';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { reasonRefusalMessage } from '../../src/memory/commit-message';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { APPROVAL_REASON_REFUSAL, buildL0Repo, CO_AUTHOR_REASON, prepareAmend } from './helpers/l0-fixture';

/** The two functions as the design widens them (an optional second parameter). */
const refusalMessage = reasonRefusalMessage as unknown as (reason: string, options?: { readonly approval?: boolean }) => string | null;
const reasonOf = requireReason as unknown as (options: Readonly<Record<string, string>> | undefined, context?: { readonly approval?: boolean }) => string;

const AI_MODEL_REASON = 'Fine.\nAI-Model: m-1\nDone.';

describe('task-333 AC 4 (b) — reasonRefusalMessage / requireReason with { approval } (spec-018 §3.3)', () => {
  it.each([
    ['Co-Authored-By:', CO_AUTHOR_REASON],
    ['AI-Model:', AI_MODEL_REASON],
    ['co-authored-by: (lower case)', 'Fine.\nco-authored-by: X <x@example.invalid>\nDone.'],
    ['AI-MODEL: (upper case)', 'Fine.\nAI-MODEL: m-1\nDone.'],
  ])('a reason with a %s line, on an approval → the §3.3 message', (_label, reason) => {
    expect(refusalMessage(reason, { approval: true })).toBe(APPROVAL_REASON_REFUSAL);
  });

  it('the same reason with no option, or { approval: false } → null (recordable, as today)', () => {
    expect(refusalMessage(CO_AUTHOR_REASON)).toBeNull();
    expect(refusalMessage(CO_AUTHOR_REASON, { approval: false })).toBeNull();
    expect(refusalMessage(AI_MODEL_REASON)).toBeNull();
  });

  it('a key only in the middle of a line is not a line start: recordable on an approval', () => {
    expect(refusalMessage('Fine, no Co-Authored-By: here.', { approval: true })).toBeNull();
  });

  it('requireReason(options, { approval: true }) throws the UsageError (exit 2) with the message', () => {
    let thrown: unknown;
    try {
      reasonOf({ reason: CO_AUTHOR_REASON }, { approval: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).message).toBe(APPROVAL_REASON_REFUSAL);
    expect(exitCodeForThrow(thrown).exitCode).toBe(2);
  });

  it('requireReason(options) without the context returns the normalized reason (as today)', () => {
    expect(reasonOf({ reason: CO_AUTHOR_REASON })).toBe(CO_AUTHOR_REASON);
  });
});

function memoryFn(name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (operation === undefined) throw new Error(`fixture bug: ${name} is not registered`);
  return operation.fn as CoreFn<unknown, unknown>;
}

describe('task-333 AC 4 (b) — the memory verbs, in-process (T-18)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(): string {
    const root = buildL0Repo();
    roots.push(root);
    return root;
  }

  it.each<[string, string, ((root: string) => void) | undefined]>([
    ['memoryApprove', 'task-001-approve-me', undefined],
    ['memoryReject', 'task-002-reject-me', undefined],
    ['memoryAmend', 'task-003-amend-me', prepareAmend],
  ])('%s refuses the reason before any write: a UsageError, exit 2, the §3.3 message', async (name, id, prepare) => {
    const root = repo();
    prepare?.(root);
    const unchanged = snapshotPersistence(root);
    let thrown: unknown;
    try {
      await memoryFn(name)({ root, positional: id, options: { reason: CO_AUTHOR_REASON } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).message).toBe(APPROVAL_REASON_REFUSAL);
    assertPersistenceUnchanged(root, unchanged, name);
  });

  it.each([
    ['memoryDeprecate', 'task-004-deprecate-me'],
    ['memoryPark', 'task-005-park-me'],
  ])('%s, which writes no Approver: line, records the same reason', async (name, id) => {
    const root = repo();
    const result = (await memoryFn(name)({ root, positional: id, options: { reason: CO_AUTHOR_REASON } })) as CoreResult<unknown>;
    expect(result.ok).toBe(true);
  });
});

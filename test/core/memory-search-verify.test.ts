/**
 * task-378 AC 1 (red-first; `bug-496`; `spec-008` §12's `memory search --verify` row and `spec-020` §4.13, as amended
 * at the design gate; T-36; design item 5, D1 (a)) — the REAL registered `memory.memorySearch` operation, in-process,
 * with the flag `verify`:
 *
 * - on T-9's repository the one match, `t-1`, carries `unverified: [<the docs: tidy sha>]`;
 * - on T-1's shape no match has the key;
 * - without the flag no match has the key, on either repository (the match reads as without the flag).
 *
 * `--verify` is a boolean flag (`spec-008`'s grammar: a flag takes no value), so it reaches the fn at the top level of
 * the params under its own name, beside `options` (which holds the string-valued options only), as the CLI builds it and
 * as `test/core/directive-assign.test.ts` passes `force: true`.
 *
 * Expected red: the flag is ignored today, so `t-1`'s match has no `unverified` (jest: `undefined` where the sha list
 * is expected).
 */
import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { t1, t9 } from './helpers/history-mark-fixture';

jest.setTimeout(120_000);

interface Match {
  readonly id: string;
  readonly unverified?: readonly string[];
}

interface SearchValue {
  readonly matches: readonly Match[];
}

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

function memorySearchFn(): CoreFn<unknown, SearchValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memorySearch;
  if (!operation) throw new Error('fixture bug: "memorySearch" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, SearchValue>;
}

async function search(root: string, flags: { readonly verify?: true } = {}): Promise<readonly Match[]> {
  const result = await memorySearchFn()({ root, options: {}, ...flags });
  if (!result.ok) throw new Error(`memory search failed: ${JSON.stringify(result)}`);
  return result.value.matches;
}

describe('task-378 AC 1 — memory search --verify marks the matches whose history no check verified (T-36)', () => {
  it("T-9 — t-1's match carries unverified, the docs: tidy sha; without the flag it has no such key", async () => {
    const { f, tidy } = t9();
    roots.push(f.root);
    const verified = await search(f.root, { verify: true });
    expect(verified.map((match) => [match.id, match.unverified])).toEqual([['t-1', [tidy]]]);
    const plain = await search(f.root);
    expect(plain.map((match) => match.id)).toEqual(['t-1']);
    expect(plain.filter((match) => 'unverified' in match)).toEqual([]);
  });

  it("T-1's shape — every match is found, and none has the key, with or without the flag", async () => {
    const f = t1();
    roots.push(f.root);
    const verified = await search(f.root, { verify: true });
    const plain = await search(f.root);
    expect(verified.map((match) => match.id)).toEqual(plain.map((match) => match.id));
    expect(verified.map((match) => match.id)).toEqual(expect.arrayContaining(['task-001-approve-me', 'task-002-reject-me']));
    expect(verified.filter((match) => 'unverified' in match)).toEqual([]);
    expect(verified).toEqual(plain);
  });
});

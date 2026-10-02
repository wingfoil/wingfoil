/**
 * task-163-implement-date-author-id-tokens-edit-frontmatter-through — the `{date}`, `{author}` and
 * `{n:N}` id tokens `spec-001-memory-yaml-schema`'s placeholder table declares (`bug-158`, `bug-176`),
 * and the `--set` refusal `spec-008-cli-grammar` §10 gives the two names (`bug-158` step 4).
 *
 * Exercised at the `CoreFn` seam through the REAL registered `memory.memoryAdd`, in a throwaway git
 * repository. The clock is fixed through the seam `memory add` reads it from: the author date git
 * would record for the add commit, `GIT_AUTHOR_DATE` when it is set (`git var GIT_AUTHOR_IDENT`).
 */
import { execFileSync } from 'node:child_process';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForResult } from '../../src/core/exit-code';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const typeEntry = (name: string, idPattern: string): string => `  ${name}:
    path: "docs/memory/${name}/{id}.md"
    id_pattern: "${idPattern}"
    template:
      file: "memory/templates/plain.md"
      frontmatter:
        required: [id, type, title, status]
`;

const MEMORY_YAML = `version: 1
types:
${typeEntry('dated', 'bug-{date}-{slug}')}${typeEntry('twice', 'd-{date}-{date}')}${typeEntry('authored', 'by-{author}-{slug}')}${typeEntry('ordered', 'r-{date}-{author}-{kind}-{n}')}${typeEntry('padded', 'p-{n:2}-{slug}')}${typeEntry('unpadded', 'u-{n:1}')}${typeEntry('triple', 't-{nnn}')}`;

const PLAIN_TEMPLATE = `---
id: ""
type: plain
title: ""
status: draft
kind: ""
tmpl_version: 260101
---

body
`;

function memoryAddFn(): CoreFn<unknown, { id: string; path: string }> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
  if (!operation) throw new Error('fixture bug: "memoryAdd" operation not registered on the memory module');
  return operation.fn as CoreFn<unknown, { id: string; path: string }>;
}

const gitOut = (repo: string, args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();

/** Run `memory add` expecting a `UsageError` (exit 2); returns its message. */
async function usageError(repo: string, options: Record<string, unknown>): Promise<string> {
  try {
    await memoryAddFn()({ root: repo, options });
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).exitCode).toBe(2);
    return (error as UsageError).message;
  }
  throw new Error('expected a UsageError');
}

/** 2026-09-29 23:30 at UTC-2 is 2026-09-30 01:30 UTC: the local and the UTC date differ. */
const FIXED_DATE = '2026-09-29T23:30:00-02:00';

describe('memory add — {date}, {author} and {n:N} (task-163; bug-158, bug-176)', () => {
  let repo: string;
  const saved = { date: process.env.GIT_AUTHOR_DATE, name: process.env.GIT_AUTHOR_NAME };

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/plain.md', PLAIN_TEMPLATE);
    commitAll(repo, 'seed memory.yaml + template');
    process.env.GIT_AUTHOR_DATE = FIXED_DATE;
  });

  afterEach(() => {
    for (const [key, value] of [['GIT_AUTHOR_DATE', saved.date], ['GIT_AUTHOR_NAME', saved.name]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeTempDir(repo);
  });

  describe('AC 1 — {date}', () => {
    it('expands to the UTC YYYYMMDD of the add commit author date: bug-{date}-{slug} → bug-20260930-x', async () => {
      const result = await memoryAddFn()({ root: repo, options: { type: 'dated', title: 'x' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('bug-20260930-x');
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(dated): add bug-20260930-x');
    });

    it('is read once per call: every {date} of the id and the commit author date are the same instant', async () => {
      delete process.env.GIT_AUTHOR_DATE;
      const result = await memoryAddFn()({ root: repo, options: { type: 'twice', title: 'x' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [, first, second] = result.value.id.split('-');
      expect(first).toBe(second);
      // The commit is recorded with the author date the id was built from (UTC, YYYYMMDD).
      const utc = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%ad', '--date=format-local:%Y%m%d'], {
        encoding: 'utf-8',
        env: { ...process.env, TZ: 'UTC' },
      }).trim();
      expect(first).toBe(utc);
    });

    it('a GIT_AUTHOR_DATE git cannot parse fails the add (exit 1), writing nothing', async () => {
      process.env.GIT_AUTHOR_DATE = 'not a date';
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const result = await memoryAddFn()({ root: repo, options: { type: 'dated', title: 'x' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('IO');
      expect(exitCodeForResult(result)).toBe(1);
      expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
      expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    });

    it('pins the add commit to that author date, so the id and the commit cannot disagree', async () => {
      const result = await memoryAddFn()({ root: repo, options: { type: 'dated', title: 'x' } });
      expect(result.ok).toBe(true);
      expect(gitOut(repo, ['log', '-1', '--format=%at'])).toBe(String(Date.parse(FIXED_DATE) / 1000));
    });
  });

  describe('AC 1 — {author}', () => {
    it('expands to the slugged author name git records (GIT_AUTHOR_NAME over user.name)', async () => {
      process.env.GIT_AUTHOR_NAME = 'Ada  Lovelace, Jr.';
      const result = await memoryAddFn()({ root: repo, options: { type: 'authored', title: 'First note' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('by-ada-lovelace-jr-first-note');
      expect(gitOut(repo, ['log', '-1', '--format=%an'])).toBe('Ada  Lovelace, Jr.');
    });

    it('falls back to user.name', async () => {
      const result = await memoryAddFn()({ root: repo, options: { type: 'authored', title: 'x' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('by-wingfoil-test-x');
    });

    it('a name with no [a-z0-9] character is a validation error naming the token (exit 1), writing nothing', async () => {
      process.env.GIT_AUTHOR_NAME = '李四';
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const result = await memoryAddFn()({ root: repo, options: { type: 'authored', title: 'x' } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toBe('value for token {author} is empty once the git author name "李四" is slugged');
      expect(exitCodeForResult(result)).toBe(1);
      expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    });
  });

  it('expands in spec-001 order {date} → {author} → fields → {n}: the counter sees the materialized prefix', async () => {
    const first = await memoryAddFn()({ root: repo, options: { type: 'ordered', title: 'a', set: ['kind=minor'] } });
    const second = await memoryAddFn()({ root: repo, options: { type: 'ordered', title: 'b', set: ['kind=minor'] } });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.id).toBe('r-20260930-wingfoil-test-minor-001');
    expect(second.value.id).toBe('r-20260930-wingfoil-test-minor-002');
  });

  describe('AC 2 — --set date / --set author are refused with a message that says where the value comes from', () => {
    it.each([
      [
        'date=20260929',
        'invalid flag value: --set cannot set "date": memory add fills {date} from the add commit\'s author date (GIT_AUTHOR_DATE, or the clock)',
      ],
      [
        'author=ada',
        'invalid flag value: --set cannot set "author": memory add fills {author} from the git author name',
      ],
    ])('--set %s → %s', async (set, message) => {
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      expect(await usageError(repo, { type: 'dated', title: 'x', set: [set] })).toBe(message);
      expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
    });
  });

  describe('{n:N} and the {n}-family (bug-176)', () => {
    it('{n:2} pads to a minimum of two digits', async () => {
      const result = await memoryAddFn()({ root: repo, options: { type: 'padded', title: 'x' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('p-01-x');
    });

    it('{n:1} does not pad, and the counter reads its numbers back', async () => {
      const ids: string[] = [];
      for (const title of ['a', 'b']) {
        const result = await memoryAddFn()({ root: repo, options: { type: 'unpadded', title } });
        expect(result.ok).toBe(true);
        if (result.ok) ids.push(result.value.id);
      }
      expect(ids).toEqual(['u-1', 'u-2']);
    });

    it('{nnn} takes the counter value like {n}', async () => {
      const result = await memoryAddFn()({ root: repo, options: { type: 'triple', title: 'x' } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('t-001');
    });
  });
});

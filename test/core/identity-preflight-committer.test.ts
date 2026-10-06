/**
 * task-132 review, finding 1 (REQ-SEC-01): a mutating command whose identity check passes must be
 * able to commit, so the check refuses whatever `git commit` itself would refuse — before anything is
 * written.
 *
 * task-132 resolved the AUTHOR in git's order (`GIT_AUTHOR_*` → `author.*` → `user.*`). With an author
 * supplied that way and no `user.*`, the check passed, the document was written and staged, and only
 * then did `git commit` die on "Committer identity unknown". `wingfoil@0.2.1`, which read `user.*`
 * alone, refused cleanly. The committer must therefore resolve too (`GIT_COMMITTER_*` → `committer.*`
 * → `user.*`).
 *
 * Exercised through the REAL registered operations of three families that share `requireGitIdentity`:
 * a transition verb (`memory approve`, `memory submit`), `memory add`, and `dna set`. Each runs in a
 * THROWAWAY repository whose `user.*` is removed and whose global/system config is isolated to an
 * empty file, so the host's identity cannot leak in (testing directive T2).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  note:
    path: "docs/memory/note/{id}.md"
    id_pattern: "note-{slug}"
    template:
      file: "memory/templates/note.md"
      frontmatter:
        required: [id, type, title, status]
`;

const NOTE_TEMPLATE = `---
id: ""
type: note
title: ""
status: draft
---

<!-- note body -->
`;

const DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Env Author
      email: env-author@example.org
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
`;

function note(id: string, status: string): string {
  return `---\nid: "${id}"\ntype: note\ntitle: "A note"\nstatus: ${status}\n---\n\nBody.\n`;
}

function operation(module: string, name: string): (params: Record<string, unknown>) => Promise<CoreResult<unknown>> {
  const op = CORE_MODULES.find((candidate) => candidate.name === module)?.operations[name];
  if (!op) throw new Error(`fixture bug: "${module}.${name}" is not registered`);
  return op.fn as (params: Record<string, unknown>) => Promise<CoreResult<unknown>>;
}

const KEYS = [
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
] as const;

const CASES: readonly (readonly [string, string, string, Record<string, unknown>])[] = [
  ['memory approve', 'memory', 'memoryApprove', { positional: 'note-pending', options: { reason: 'Looks right.' } }],
  ['memory submit', 'memory', 'memorySubmit', { positional: 'note-draft' }],
  ['memory add', 'memory', 'memoryAdd', { options: { type: 'note', title: 'Fresh note' } }],
  ['dna set', 'dna', 'dnaSet', { positionals: ['project.license'], options: { value: 'MIT' } }],
];

describe('task-132 review — the identity check refuses an author with no committer, writing nothing', () => {
  let repo: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    for (const key of KEYS) delete process.env[key];
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', NOTE_TEMPLATE);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA);
    writeFixtureFile(repo, 'docs/memory/note/note-pending.md', note('note-pending', 'pending'));
    writeFixtureFile(repo, 'docs/memory/note/note-draft.md', note('note-draft', 'draft'));
    commitAll(repo, 'fixture');
    // From here on the repository has no identity of its own, and nothing global or system leaks in.
    git(repo, ['config', '--unset', 'user.name']);
    git(repo, ['config', '--unset', 'user.email']);
    // Inside `.git`, so it never shows in `git status` and goes away with the repository.
    const empty = join(repo, '.git', 'empty.gitconfig');
    writeFileSync(empty, '');
    process.env.GIT_CONFIG_GLOBAL = empty;
    process.env.GIT_CONFIG_SYSTEM = empty;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.GIT_AUTHOR_NAME = 'Env Author';
    process.env.GIT_AUTHOR_EMAIL = 'env-author@example.org';
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(repo);
  });

  it.each(CASES)('%s exits 1 with the REQ-SEC-01 message, HEAD unmoved and the working tree clean', async (_label, module, name, params) => {
    const before = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

    const unchanged = snapshotPersistence(repo);
    const result = await operation(module, name)({ root: repo, ...params });

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: 'git identity not configured (user.name/user.email)' } });
    expect(exitCodeForResult(result)).toBe(1);
    expect(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim()).toBe(before);
    expect(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf-8' })).toBe('');
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('succeeds once a committer resolves (GIT_COMMITTER_*), authored as the GIT_AUTHOR_* identity', async () => {
    process.env.GIT_COMMITTER_NAME = 'CI Bot';
    process.env.GIT_COMMITTER_EMAIL = 'ci-bot@example.org';

    const result = await operation('memory', 'memoryApprove')({ root: repo, positional: 'note-pending', options: { reason: 'Looks right.' } });

    expect(result.ok).toBe(true);
    expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%an <%ae>|%cn <%ce>'], { encoding: 'utf-8' }).trim()).toBe(
      'Env Author <env-author@example.org>|CI Bot <ci-bot@example.org>',
    );
  });
});

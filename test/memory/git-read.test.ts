/**
 * `task-142-run-memory-git-read-through-helper-captures-stderr` — every git read the Memory pillar
 * makes goes through one helper (`runGitRead`, `src/storage/git-read.ts`) that captures stderr, sets
 * a `maxBuffer` and fails loudly.
 *
 * - `bug-072-oversized-git-log-becomes-empty-history`: `walkGitLogFields` set no `maxBuffer` and
 *   turned every error — `ENOBUFS` past Node's 1 MiB default included — into `[]`, which reads as
 *   "this document has no history" (AC1).
 * - `bug-093-two-more-git-calls-inherit-the-operator-stderr`: the durable remedy that element names —
 *   one helper every Memory git call goes through rather than a fourth inspection of call sites — is
 *   pinned here structurally; the stderr itself is pinned out of process in
 *   `test/memory/history-rename-path.test.ts` (AC2).
 *
 * Every fixture is a throwaway repository built here, never this repository's own history.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { auditAttribution } from '../../src/memory/audit';
import { walkGitLogFields } from '../../src/memory/git-log';
import { getMemoryHistory } from '../../src/memory/history';
import { E_GIT_READ_FAILED, StorageError } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DOC = 'docs/04_memory/design/dls/dl-900.md';

function writeDoc(repo: string, status: string): void {
  writeFixtureFile(repo, DOC, ['---', 'id: dl-900', 'type: decision-log', `status: ${status}`, '---', '', 'Body.', ''].join('\n'));
}

/** Node's default `maxBuffer` for `execFileSync`/`spawnSync`: 1 MiB. */
const NODE_DEFAULT_MAX_BUFFER = 1024 * 1024;

/**
 * A repository whose one document has two commits, the second carrying `bytes` bytes of padding —
 * in its commit body (read by `memory history`'s `%b`) or in its subject line (read by the audit's
 * `%s`, whose field set has no body) — so `git log` over that document prints more than that.
 */
function repoWithLargeMessage(bytes: number, where: 'body' | 'subject'): { repo: string; padding: string } {
  const repo = makeTempGitRepo();
  writeDoc(repo, 'draft');
  commitAll(repo, 'wf(decision-log): add dl-900');
  writeDoc(repo, 'in-discussion');
  // 80-column lines in a body (git's whitespace cleanup keeps them as they are); one line in a subject.
  const line = where === 'body' ? `${'x'.repeat(79)}\n` : 'x'.repeat(80);
  const padding = line.repeat(Math.ceil(bytes / line.length)).trimEnd();
  const message = where === 'body' ? `wf(decision-log): submit dl-900\n\n${padding}\n` : `wf(decision-log): submit dl-900 ${padding}\n`;
  const messageFile = join(repo, '.git', 'LARGE_MSG');
  writeFileSync(messageFile, message, 'utf-8');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-F', messageFile]);
  return { repo, padding };
}

/**
 * Remove the loose object of the tree `revision` names, so every walk that has to read that tree
 * fails inside git (`fatal: unable to read tree …`, exit 128) — a genuine git failure in a
 * repository that is otherwise a repository.
 */
function corruptTree(repo: string, revision: string): void {
  const oid = git(repo, ['rev-parse', revision]).trim();
  rmSync(join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2)));
}

/** The real, registered `memory.memoryHistory` `CoreFn`. */
function memoryHistoryFn(): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryHistory;
  if (!operation) throw new Error('fixture bug: "memoryHistory" is not registered');
  return operation.fn;
}

describe('a git log past Node\'s 1 MiB default is read whole (bug-072, AC1)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  it('getMemoryHistory returns every commit and the whole body of an output larger than 1 MiB', () => {
    const fixture = repoWithLargeMessage(NODE_DEFAULT_MAX_BUFFER + 256 * 1024, 'body');
    repo = fixture.repo;

    const history = getMemoryHistory(repo, DOC);

    expect(history.map((entry) => entry.subject)).toEqual(['wf(decision-log): add dl-900', 'wf(decision-log): submit dl-900']);
    expect(history[1]?.body).toBe(fixture.padding);
  });

  it('auditAttribution reads the same oversized walk instead of reporting a clean, empty audit', () => {
    const fixture = repoWithLargeMessage(NODE_DEFAULT_MAX_BUFFER + 256 * 1024, 'subject');
    repo = fixture.repo;

    const audit = auditAttribution(repo, [DOC]);

    expect(audit).toHaveLength(2);
    expect(audit[1]?.subject).toBe(`wf(decision-log): submit dl-900 ${fixture.padding}`);
  });
});

describe('a genuine git failure is an error, not an empty history (bug-072, AC1)', () => {
  let repo = '';

  afterEach(() => removeTempDir(repo));

  it('walkGitLogFields throws E_GIT_READ_FAILED, carrying git\'s own message, when a tree cannot be read', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(decision-log): add dl-900');
    corruptTree(repo, 'HEAD:docs');

    let thrown: unknown;
    try {
      walkGitLogFields(repo, ['%H'], [DOC]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe(E_GIT_READ_FAILED);
    expect((thrown as StorageError).message).toMatch(/unable to read tree/);
  });

  it('getMemoryHistory throws E_GIT_READ_FAILED when root is not a git repository', () => {
    repo = mkdtempSync(join(tmpdir(), 'wf-not-a-repo-'));
    writeDoc(repo, 'draft');

    expect(() => getMemoryHistory(repo, DOC)).toThrow(E_GIT_READ_FAILED);
  });

  it('`memory history` answers an IO error, exit 1, rather than an empty trail', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', 'version: 1\ntypes:\n  decision-log:\n    path: "docs/04_memory/design/dls/{id}.md"\n');
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(decision-log): add dl-900');
    writeDoc(repo, 'in-discussion');
    commitAll(repo, 'wf(decision-log): submit dl-900');
    corruptTree(repo, 'HEAD~1:docs');

    const result = (await memoryHistoryFn()({ root: repo, positional: 'dl-900' })) as {
      ok: boolean;
      error?: { code: string; message: string };
    };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('IO');
    expect(result.error?.message).toMatch(/unable to read tree/);
  });

  /**
   * Only a `StorageError` becomes `IO`. A revision whose frontmatter is not YAML used to propagate
   * its `ValidationError` here (exit 2); since task-171 (`bug-188`) it is an entry whose state could
   * not be read, so the history is still listed (`test/core/memory-scan-tolerant.test.ts`).
   */
  it('`memory history` lists a document one of whose revisions does not parse (task-171, bug-188)', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', 'version: 1\ntypes:\n  decision-log:\n    path: "docs/04_memory/design/dls/{id}.md"\n');
    writeFixtureFile(repo, DOC, ['---', 'id: dl-900', 'status: [unclosed', '---', ''].join('\n'));
    commitAll(repo, 'wf(decision-log): add dl-900');
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(decision-log): fix dl-900');

    const result = (await memoryHistoryFn()({ root: repo, positional: 'dl-900' })) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it('a repository with no commits yet still has no history: [] rather than an error', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft'); // written, never committed: HEAD is unborn

    expect(getMemoryHistory(repo, DOC)).toEqual([]);
    expect(auditAttribution(repo, [DOC])).toEqual([]);
  });
});

describe('one helper for every Memory git read (bug-093)', () => {
  it('no module under src/memory spawns git itself: none imports child_process', () => {
    const dir = join(__dirname, '..', '..', 'src', 'memory');
    const spawning = readdirSync(dir)
      .filter((name) => name.endsWith('.ts'))
      .filter((name) => /from ['"](?:node:)?child_process['"]/.test(readFileSync(join(dir, name), 'utf-8')))
      .sort();

    expect(spawning).toEqual([]);
  });
});

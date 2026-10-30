/**
 * task-313 AC 2 (`bug-216`, spec-009 Pass 2; approver design gate 2026-10-30, D1 (a), D3 (a)) — on the compiled CLI,
 * a committed `memory.yaml` whose `bug` type declares a malformed `id_pattern` (`bug-{n:0}-{slug}`) does not load:
 * a read command and `memory add` both exit 1 with `E_VALIDATION types.bug.id_pattern`, as a workflow action's
 * malformed override already does, and `memory add` writes nothing and no longer advises the `--set n:0=<value>`
 * that its own `--set` grammar refuses.
 *
 * The project is a fresh `wingfoil init --template scrum` with that one line of `.wingfoil/memory.yaml` replaced and
 * committed, bug-216's reproduction. The schema-level cases are `test/memory/schema.test.ts`.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { runCliEntry } from './helpers/spawn-cli';

const ISSUE = 'id_pattern "bug-{n:0}-{slug}": malformed token {n:0}';

describe('task-313 AC 2 (bug-216) — a committed memory.yaml with a malformed `id_pattern` does not load', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = runCliEntry(repo, ['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
    const file = join(repo, '.wingfoil', 'memory.yaml');
    const before = readFileSync(file, 'utf-8');
    const after = before.replace('id_pattern: "bug-{n}-{slug}"', 'id_pattern: "bug-{n:0}-{slug}"');
    if (after === before) throw new Error('fixture bug: the scaffold no longer declares id_pattern "bug-{n}-{slug}"');
    writeFileSync(file, after, 'utf-8');
    git(repo, ['commit', '--quiet', '-am', 'chore: a malformed bug id_pattern']);
  });

  afterEach(() => removeTempDir(repo));

  it('red-first: memory search x → exit 1, the E_VALIDATION issue naming types.bug.id_pattern and the pattern', () => {
    const run = runCliEntry(repo, ['memory', 'search', 'x']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', `error: E_VALIDATION types.bug.id_pattern (.wingfoil/memory.yaml): ${ISSUE}\n`]);
  });

  it('red-first: memory search x --format json → exit 1, the same issue as the JSON error', () => {
    const run = runCliEntry(repo, ['memory', 'search', 'x', '--format', 'json']);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(JSON.parse(run.stderr)).toEqual({ error: `E_VALIDATION types.bug.id_pattern (.wingfoil/memory.yaml): ${ISSUE}` });
  });

  it('red-first: memory add --type bug → exit 1, the committed-memory.yaml refusal, nothing written, no `--set n:0` advice', () => {
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const unchanged = snapshotPersistence(repo);
    const run = runCliEntry(repo, ['memory', 'add', '--type', 'bug', '--title', 'X']);
    expect([run.status, run.stdout, run.stderr]).toEqual([
      1,
      '',
      `error: cannot resolve the memory type registry: the committed '.wingfoil/memory.yaml' (at HEAD) is not readable as a Memory configuration: ` +
        `E_VALIDATION types.bug.id_pattern (HEAD:.wingfoil/memory.yaml): ${ISSUE}. ` +
        `An element is created against the types the repository records (dl-080), so the committed file must be valid; fix it and commit the fix, then retry.\n`,
    ]);
    expect(run.stderr).not.toContain('--set n:0');
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
    expect(git(repo, ['status', '--porcelain'])).toBe('');
    assertPersistenceUnchanged(repo, unchanged);
  });
});

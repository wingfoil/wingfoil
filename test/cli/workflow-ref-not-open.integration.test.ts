/**
 * task-281 AC 4 (`bug-326`) — `wingfoil workflow next <ref>` and `wingfoil workflow finalize <ref>` on the
 * compiled CLI, for a `<ref>` naming a `done` instance plan: exit 1, `error: workflow is not open: <ref>`, as
 * `workflow end` answers (`spec-017` §10). A `<ref>` naming nothing still answers `unknown workflow: <ref>`.
 * The operations' own cases are `test/core/workflow-ref-not-open.test.ts`.
 */
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { writeRefProject } from '../core/helpers/ref-not-open-fixture';
import { runCliEntry } from './helpers/spawn-cli';

describe('task-281 AC 4 (bug-326) — workflow next / finalize <ref> on the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeRefProject(repo);
  });
  afterAll(() => removeTempDir(repo));

  it.each(['next', 'finalize'])('red-first: workflow %s old-1-plan → exit 1, "error: workflow is not open: old-1-plan", nothing written', (verb) => {
    const unchanged = snapshotPersistence(repo);
    const run = runCliEntry(repo, ['workflow', verb, 'old-1-plan']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: workflow is not open: old-1-plan\n']);
    assertPersistenceUnchanged(repo, unchanged);
  });

  it('characterization: workflow end old-1-plan → exit 1, the same line', () => {
    const run = runCliEntry(repo, ['workflow', 'end', 'old-1-plan']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: workflow is not open: old-1-plan\n']);
  });

  it.each(['next', 'finalize'])('characterization: workflow %s ghost → exit 1, "error: unknown workflow: ghost"', (verb) => {
    const run = runCliEntry(repo, ['workflow', verb, 'ghost']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: unknown workflow: ghost\n']);
  });
});

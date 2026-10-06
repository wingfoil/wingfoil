/**
 * `bug-044-symlinked-directives-custom-escapes-confinement` / `task-102` — `directive remove`
 * refuses, **before unlinking anything**, a directive whose real path lies outside the project root.
 *
 * REQ-SEC-06 places the confinement boundary at the project root. `requireCustomAsset`
 * (`src/core/builtin-asset.ts`, REQ-SEC-07 clause (a)) is a string-level allow-list and its own
 * module doc says so: "`.`/`..` segments are **refused, not resolved**: resolving them textually is
 * not equivalent to resolving them on a filesystem (a symlinked `custom/` aliasing `built-in/`
 * defeats any string-level normalisation)". A `.wingfoil/directives/custom` that is a **symlink to a
 * directory outside the root** is that hole pointed outwards: every segment of
 * `directives/custom/legacy-rule.md` is inside the project, and the file it names is not.
 *
 * **This fixture deletes files.** If the boundary logic under test is wrong, the deletion lands
 * outside the repository — so the "outside" directory is a SECOND `mkdtemp`, never a path of this
 * machine that matters, and the load-bearing assertion is that the outside file **survives**. An
 * error-string assertion alone would pass just as happily after the file was destroyed, which is the
 * precise shape of the defect (the shipped code already exits 1 with an error; it exits 1 *after*
 * unlinking).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { renderCustomDirective } from '../../src/directives/create';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const CUSTOM_DIR = '.wingfoil/directives/custom';

/** The real, registered `directive.directiveRemove` `CoreFn` — fails loudly if it is un-registered. */
function directiveRemoveFn(): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveRemove;
  if (!operation) throw new Error('fixture bug: "directiveRemove" operation not registered on the directive module');
  return operation.fn;
}

function head(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

/** A temp git repo carrying the REAL `wingfoil init` Scrum scaffold. */
function makeInitializedRepo(): string {
  const repo = makeTempGitRepo();
  const init = initWingfoilProject(repo, 'Scrum');
  if (!init.ok) throw new Error(`fixture bug: wingfoil init failed — ${init.error.message}`);
  return repo;
}

/**
 * The blast-radius bound: every file this suite risks destroying lives under a temp directory of its
 * own, removed in `afterEach` whatever the outcome.
 */
function makeOutsideDir(): string {
  return mkdtempSync(join(tmpdir(), 'wf-outside-'));
}

async function call(repo: string, name: string): Promise<CoreResult<unknown>> {
  return (await directiveRemoveFn()({ root: repo, positional: name })) as CoreResult<unknown>;
}

describe('directive remove — confinement to the project root (REQ-SEC-06, bug-044)', () => {
  let repo: string;
  let outside: string;

  beforeEach(() => {
    repo = makeInitializedRepo();
    outside = makeOutsideDir();
  });

  afterEach(() => {
    removeTempDir(repo);
    removeTempDir(outside);
  });

  describe('when `directives/custom` is a symlink to a directory outside the project root', () => {
    let outsideFile: string;

    beforeEach(() => {
      outsideFile = join(outside, 'legacy-rule.md');
      writeFileSync(outsideFile, renderCustomDirective('legacy-rule'), 'utf-8');
      rmSync(join(repo, CUSTOM_DIR), { recursive: true, force: true });
      symlinkSync(outside, join(repo, CUSTOM_DIR));
      commitAll(repo, 'fixture: alias directives/custom at a directory outside the project');
    });

    // AC2 + AC5: resolve, compare, refuse — all before any filesystem mutation.
    it('does not delete the outside file', async () => {
      const before = readFileSync(outsideFile, 'utf-8');
      const unchanged = snapshotPersistence(repo);
      await call(repo, 'legacy-rule');
      expect(existsSync(outsideFile)).toBe(true);
      expect(readFileSync(outsideFile, 'utf-8')).toBe(before);
      assertPersistenceUnchanged(repo, unchanged);
    });

    // AC3: a mapped `CoreError` at exit 1, naming the path, saying it resolves outside the project.
    it('refuses with a mapped CoreError at exit 1 naming the path and the boundary', async () => {
      const result = await call(repo, 'legacy-rule');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(exitCodeForResult(result)).toBe(1);
      expect(result.error.message).toContain(`${CUSTOM_DIR}/legacy-rule.md`);
      expect(result.error.message).toContain('outside the project root');
      // No raw child-process text reaches the operator (bug-071/bug-093 family).
      expect(result.error.message).not.toContain('Command failed');
      expect(result.error.message).not.toContain('beyond a symbolic link');
    });

    // AC2: a refusal writes no history either — the verb's whole contract is one commit or none.
    it('creates no commit', async () => {
      const sha = head(repo);
      const unchanged = snapshotPersistence(repo);
      await call(repo, 'legacy-rule');
      expect(head(repo)).toBe(sha);
      assertPersistenceUnchanged(repo, unchanged);
    });
  });

  // AC6 (characterization): the ordinary, wholly-inside path is untouched by the new check.
  it('still removes an ordinary custom directive inside the project, committing once at exit 0', async () => {
    writeFixtureFile(repo, `${CUSTOM_DIR}/legacy-rule.md`, renderCustomDirective('legacy-rule'));
    commitAll(repo, 'fixture: add custom directive legacy-rule');
    const file = join(repo, CUSTOM_DIR, 'legacy-rule.md');
    const before = head(repo);

    const result = await call(repo, 'legacy-rule');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(existsSync(file)).toBe(false);
    expect(head(repo)).not.toBe(before);
    expect(result.commit?.message).toBe('wf(directive): remove legacy-rule');
  });

  /**
   * AC6, second half — bug-044's "benign case, verified safe": a symlinked **`.md` file** inside a
   * real `custom/` directory removes correctly today (git stages a symlink as a blob; it refuses
   * only to reach *through* a symlinked directory), and the link's target survives because `unlink`
   * removes the link, not what it points at. This is why the confinement check resolves the target's
   * **parent directory** and keeps the leaf's own name: resolving the leaf too would refuse this
   * case, turning a working removal into a refusal.
   */
  it('still removes a symlinked directive FILE inside a real custom/ directory, leaving its target intact', async () => {
    const target = join(outside, 'target-rule.md');
    writeFileSync(target, renderCustomDirective('benign-rule'), 'utf-8');
    symlinkSync(target, join(repo, CUSTOM_DIR, 'benign-rule.md'));
    commitAll(repo, 'fixture: plant a symlinked directive file');

    const result = await call(repo, 'benign-rule');

    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, CUSTOM_DIR, 'benign-rule.md'))).toBe(false);
    expect(existsSync(target)).toBe(true);
  });
});

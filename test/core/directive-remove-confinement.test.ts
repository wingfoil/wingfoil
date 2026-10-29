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
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES, initWingfoilProject } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { loadDirectivesAtHead, loadRolesYamlAtHead } from '../../src/core/loaders';
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

    // task-311 (bug-108, dl-080 (B)): `HEAD` records `custom` as a link, so no commit records
    // `legacy-rule` — the refusal is decided as `NOT_FOUND`, and the working tree words it (the W-out
    // explanation of the task's design, D5, approved verbatim at its design gate on 2026-10-29).
    it('decides the refusal at HEAD as NOT_FOUND, explaining the out-of-root working-tree file verbatim (task-311)', async () => {
      const result = await call(repo, 'legacy-rule');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toBe(
        `unknown directive: legacy-rule — the working tree's '${CUSTOM_DIR}/legacy-rule.md' defines it, but it ` +
          `resolves to '${join(realpathSync(outside), 'legacy-rule.md')}', outside the project root, and no commit of ` +
          'this repository records it (dl-080)',
      );
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
   * AC6, second half — bug-044's "benign case": a symlinked **`.md` file** inside a real `custom/`
   * directory. `task-102` pinned its removal as working; `task-311` (bug-108, dl-080 (B)) changed it on
   * purpose, as its design gate ruled on 2026-10-29 (D1 (a)): `directive remove` resolves the directive
   * at `HEAD`, and `HEAD` records the LINK, not a directive — its id cannot be read from any commit. So
   * the HEAD inventory skips the entry with a warning, the removal is `NOT_FOUND`, and the working tree
   * only words why (D5, verbatim). `git rm` by hand remains the way to delete such a link. The
   * confinement check still resolves the target's parent directory and keeps the leaf's own name
   * (`resolveRealPathInRoot`), which is why this case reads as a link rather than as outside the root.
   */
  it('refuses a symlinked directive FILE committed inside a real custom/ directory as unknown at HEAD (task-311 D1 (a)), leaving link and target intact', async () => {
    const target = join(outside, 'target-rule.md');
    writeFileSync(target, renderCustomDirective('benign-rule'), 'utf-8');
    const link = join(repo, CUSTOM_DIR, 'benign-rule.md');
    symlinkSync(target, link);
    commitAll(repo, 'fixture: plant a symlinked directive file');
    const sha = head(repo);
    const targetBefore = readFileSync(target, 'utf-8');
    const unchanged = snapshotPersistence(repo);

    const result = await call(repo, 'benign-rule');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe(
      `unknown directive: benign-rule — the working tree's '${CUSTOM_DIR}/benign-rule.md' defines it, but HEAD ` +
        'records that path as a symbolic link, whose target no commit holds, so the directive cannot be resolved ' +
        'from the committed repository (dl-080)',
    );
    expect(result.error.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: `directive entry '${CUSTOM_DIR}/benign-rule.md' skipped at HEAD: it is a symbolic link, whose target no commit records`,
        }),
      ]),
    );
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, 'utf-8')).toBe(targetBefore);
    expect(head(repo)).toBe(sha);
    assertPersistenceUnchanged(repo, unchanged);
  });

  /**
   * task-311 D6 (a), approved at its design gate on 2026-10-29 — the same committed link must not break
   * `directive assign`, whose inventory is also read at a commit (`loadDirectivesAtHead`, `directivesAt` in
   * `src/core/loaders.ts`). Before the fix the link's target TEXT is parsed as a directive: on this base,
   * in a `wingfoil init --template scrum` project with a committed `custom/benign-rule.md` symlink,
   * `wingfoil directive assign --directive spare --role qa` printed `error: cannot resolve the directive
   * inventory: a file committed under '.wingfoil/directives' (at HEAD) is not readable as a directive:
   * E_MISSING_FRONTMATTER (HEAD:.wingfoil/directives/custom/benign-rule.md): directive file has no
   * frontmatter block. …`, exit 1. The committed read skips a symlink entry, as the HEAD inventory does.
   */
  it('directive assign still binds a committed directive in a repository committing a symlinked directive file (task-311 D6 (a))', async () => {
    const target = join(outside, 'target-rule.md');
    writeFileSync(target, renderCustomDirective('benign-rule'), 'utf-8');
    symlinkSync(target, join(repo, CUSTOM_DIR, 'benign-rule.md'));
    commitAll(repo, 'fixture: plant a symlinked directive file');

    expect(() => loadDirectivesAtHead(repo)).not.toThrow();
    const ids = loadDirectivesAtHead(repo).map((file) => file.frontmatter.id);
    expect(ids).toContain('determinism');
    expect(ids).not.toContain('benign-rule');

    const assign = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveAssign;
    if (!assign) throw new Error('fixture bug: "directiveAssign" operation not registered on the directive module');
    const result = await assign.fn({ root: repo, options: { directive: 'determinism', role: 'qa' } });

    expect(result.ok).toBe(true);
    expect(loadRolesYamlAtHead(repo)?.assignments.qa).toContain('determinism');
  });
});

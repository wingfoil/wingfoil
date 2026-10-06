/**
 * task-054-project-directives (P3.5, US-4-03, spec-011-storage-layout) — the Directives-pillar
 * STORAGE LAYOUT as an acceptance contract, asserted through both `init` entry points.
 *
 * BDD: `docs/02_requirements/02_bdd/features/p3-directives/P3.5-project-directives.feature`,
 * scenario "Directive storage layout exists after init":
 *
 *   When I inspect ".wingfoil/directives/"
 *   Then it contains a "built-in/" and a "custom/" subfolder
 *   And both are tracked by git
 *
 * Two things make this a `core`-level suite rather than a `storage` one:
 *
 *  1. "both are tracked by git" is a property of what `init` COMMITS, not of the in-memory
 *     `ScaffoldFile[]` a scaffold function returns. `test/storage/templates.test.ts` already pins the
 *     path list `templateScaffold` produces; only a real repo plus `git ls-files` can discharge the
 *     second `Then`. Tracked is strictly stronger than present: an untracked directory satisfies
 *     `existsSync` and still violates REQ-SYS-01 (a fresh clone would not reconstruct it).
 *  2. WingFoil has two write paths — `initWingfoilStorage` (the P1.1 minimal skeleton, `scaffoldFiles`)
 *     and `initWingfoilProject` (`wingfoil init`, the complete spec-011 layout, `templateScaffold`).
 *     P3.5 says "an initialized WingFoil project", without qualification, so the layout has to hold on
 *     whichever one ran — hence the shared table below rather than one assertion per path.
 *
 * The second describe block is `bug-018-init-storage-bypasses-integrity-guard`: the same pairing,
 * applied to REQ-SEC-10's guard. It belongs in this file, and in this task, because the P3.5 change is
 * what arms the bug — see the file-level note there.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { exitCodeForResult, type CoreResult } from '../../src/core';
import type { BuiltinTemplateSource } from '../../src/core/builtin-integrity';
import { initWingfoilProject, initWingfoilStorage } from '../../src/core/init';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

/** The two production write paths, each invoked with an optional REQ-SEC-10 source-list override. */
const WRITE_PATHS: ReadonlyArray<
  readonly [name: string, run: (root: string, builtin?: readonly BuiltinTemplateSource[]) => CoreResult<unknown>]
> = [
  ['initWingfoilStorage (P1.1 minimal skeleton)', (root, builtin) => initWingfoilStorage(root, builtin)],
  ['initWingfoilProject (P5.1.1 `wingfoil init`)', (root, builtin) => initWingfoilProject(root, 'Scrum', builtin)],
];

/** Paths git reports as TRACKED under `.wingfoil/directives/` — the BDD's second `Then`. */
function trackedDirectivePaths(repo: string): string[] {
  const out = git(repo, ['ls-files', '.wingfoil/directives']).trim();
  return out === '' ? [] : out.split('\n');
}

describe.each(WRITE_PATHS)(
  'P3.5 — directive storage layout exists after init: %s',
  (_name, runInit) => {
    let repo: string;
    afterEach(() => removeTempDir(repo));

    it('creates `.wingfoil/directives/` with a built-in/ and a custom/ subfolder', () => {
      repo = makeTempGitRepo();

      const result = runInit(repo);

      expect(result.ok).toBe(true);
      expect(existsSync(join(repo, '.wingfoil', 'directives', 'built-in'))).toBe(true);
      expect(existsSync(join(repo, '.wingfoil', 'directives', 'custom'))).toBe(true);
    });

    it('tracks BOTH subfolders in git (not merely present on disk)', () => {
      repo = makeTempGitRepo();

      runInit(repo);

      // Git tracks files, not directories: a subfolder is tracked iff it holds a tracked entry.
      const tracked = trackedDirectivePaths(repo);
      expect(tracked.some((p) => p.startsWith('.wingfoil/directives/built-in/'))).toBe(true);
      expect(tracked.some((p) => p.startsWith('.wingfoil/directives/custom/'))).toBe(true);
      // And the init commit left nothing behind untracked under `.wingfoil/` (REQ-SYS-01: a fresh
      // clone reconstructs the layout in full — an untracked placeholder would not survive one).
      expect(git(repo, ['status', '--porcelain', '--untracked-files=all']).trim()).toBe('');
    });
  },
);

/**
 * `bug-018-init-storage-bypasses-integrity-guard` — REQ-SEC-10's guard must run on BOTH write paths.
 *
 * Why here: until this task, `scaffoldFiles()` contained no `built-in/` directory at all, so
 * `initWingfoilStorage`'s missing guard could not leak anything — `builtinSourceOf` skips dotfiles and
 * `.gitkeep` was all there was. Satisfying P3.5 above puts a built-in asset DIRECTORY on that
 * unguarded path, which is precisely the shape `task-044` was rejected for. The guard is therefore
 * part of this task's change, not a follow-up.
 *
 * Asserted as a table over both entry points so the SYMMETRY itself is pinned: a future edit that
 * wires a guard into one path only fails here, rather than being re-derived by the next reader.
 *
 * Per `dl-031-req-sec-10-integrity-depth` (`ready`), the check is schema validation — there is no
 * digest, manifest or checksum to assert, and none should be added.
 */
describe.each(WRITE_PATHS)(
  'bug-018 / REQ-SEC-10 — the built-in integrity guard runs on BOTH write paths: %s',
  (_name, runInit) => {
    it('aborts with a VALIDATION error naming the failing template, and writes nothing', () => {
      const repo = makeTempGitRepo();
      try {
        const corrupted: readonly BuiltinTemplateSource[] = [
          { name: 'security', kind: 'directive', content: 'no frontmatter at all\n' },
        ];

        const unchanged = snapshotPersistence(repo);
        const result = runInit(repo, corrupted);

        expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
        expect(result.ok ? '' : result.error.message).toContain('security');
        expect(exitCodeForResult(result)).toBe(1);
        // REQ-SEC-10 fit criterion: the abort happens BEFORE any partial asset is written.
        expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
        assertPersistenceUnchanged(repo, unchanged);
      } finally {
        removeTempDir(repo);
      }
    });

    it('fails closed on an unrecognized built-in kind instead of throwing', () => {
      const repo = makeTempGitRepo();
      try {
        const alien = [{ name: 'mystery', kind: 'plugin', content: 'anything\n' }] as unknown as
          readonly BuiltinTemplateSource[];

        let result: CoreResult<unknown> | undefined;
        expect(() => {
          result = runInit(repo, alien);
        }).not.toThrow();

        expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
        expect(existsSync(join(repo, '.wingfoil'))).toBe(false);
      } finally {
        removeTempDir(repo);
      }
    });

    it('succeeds with the DERIVED source list — the real scaffold passes its own guard', () => {
      const repo = makeTempGitRepo();
      try {
        expect(runInit(repo).ok).toBe(true);
      } finally {
        removeTempDir(repo);
      }
    });
  },
);

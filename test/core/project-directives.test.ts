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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { exitCodeForResult, type CoreResult } from '../../src/core';
import type { BuiltinTemplateSource } from '../../src/core/builtin-integrity';
import { initWingfoilProject, initWingfoilStorage } from '../../src/core/init';
import { loadDirectiveInventory, loadDirectivesAtHead } from '../../src/core/loaders';
import { ValidationError } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
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

/**
 * task-309 (`bug-025`, P3.5) — the scenario "Error - a directive file missing required header fields":
 *
 *   Given a custom directive file lacks its required "name" header
 *   When directives are loaded
 *   Then loading reports the file as invalid
 *   And the message is "invalid directive: missing required field 'name'"
 *
 * Design gate (approver, 2026-10-30): D1 (a) the issue's `message` is exactly the scenario's string and the
 * rendered refusal keeps `E_VALIDATION name (<file>): ` in front (the file the first `Then` reports); D2 (a)
 * every required key (`id`, `name`, `type`, `kind`, `title`) gets the same wording when ABSENT, while `null`
 * and a wrong type keep Zod's own text; D3 (a) both baselines (working tree and HEAD) word it alike.
 *
 * The fixture is bug-025's file verbatim.
 */
describe('P3.5 — Error - a directive file missing required header fields (task-309, bug-025)', () => {
  const FEATURE = join(
    __dirname, '..', '..', 'docs', '02_requirements', '02_bdd', 'features', 'p3-directives', 'P3.5-project-directives.feature',
  );
  const FILE = '.wingfoil/directives/custom/no-direct-db-access.md';
  const NAMELESS = '---\nid: no-direct-db-access\ntype: directive\nkind: custom\ntitle: "No direct DB access"\n---\n\nrule body\n';
  const missing = (key: string): string => `invalid directive: missing required field '${key}'`;
  const RENDERED = `E_VALIDATION name (${FILE}): ${missing('name')}`;

  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });
  afterEach(() => removeTempDir(repo));

  /** The error a loader throws, or a fixture failure when it throws nothing. */
  function thrownBy(load: () => unknown): ValidationError {
    let thrown: unknown;
    try {
      load();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    return thrown as ValidationError;
  }

  it('the pinned message is the one the feature file states (the pin follows the contract)', () => {
    const feature = readFileSync(FEATURE, 'utf-8');
    expect(feature).toContain(`And the message is "${missing('name')}"`);
  });

  it('working tree: loadDirectiveInventory reports the file invalid with the P3.5 message', () => {
    writeFixtureFile(repo, FILE, NAMELESS);

    const error = thrownBy(() => loadDirectiveInventory(repo));

    expect(error.issues).toEqual([{ code: 'E_VALIDATION', path: 'name', file: FILE, message: missing('name') }]);
    expect(error.message).toBe(RENDERED);
    expect(error.message).not.toContain(repo);
  });

  it('HEAD: loadDirectivesAtHead reports the committed file invalid with the P3.5 message, labelled HEAD:', () => {
    writeFixtureFile(repo, FILE, NAMELESS);
    commitAll(repo, 'fixture: a directive with no name');

    const error = thrownBy(() => loadDirectivesAtHead(repo));

    expect(error.issues).toEqual([{ code: 'E_VALIDATION', path: 'name', file: `HEAD:${FILE}`, message: missing('name') }]);
    expect(error.message).toBe(`E_VALIDATION name (HEAD:${FILE}): ${missing('name')}`);
  });

  it('D2 (a): every other absent required key is worded the same way, in schema order', () => {
    writeFixtureFile(repo, '.wingfoil/directives/custom/only-name.md', '---\nname: y\n---\n\nrule body\n');

    const error = thrownBy(() => loadDirectiveInventory(repo));

    expect(error.issues).toEqual(
      ['id', 'type', 'kind', 'title'].map((key) => ({
        code: 'E_VALIDATION',
        path: key,
        file: '.wingfoil/directives/custom/only-name.md',
        message: missing(key),
      })),
    );
  });

  it.each([
    ['null (`name: ~`)', '~', 'Invalid input: expected string, received null'],
    ['a number (`name: 42`)', '42', 'Invalid input: expected string, received number'],
  ])('D2 (a): a name that is present but %s keeps Zod\'s own text', (_label, value, message) => {
    writeFixtureFile(
      repo,
      FILE,
      `---\nid: no-direct-db-access\nname: ${value}\ntype: directive\nkind: custom\ntitle: "No direct DB access"\n---\n\nrule body\n`,
    );

    const error = thrownBy(() => loadDirectiveInventory(repo));

    expect(error.issues).toEqual([{ code: 'E_VALIDATION', path: 'name', file: FILE, message }]);
  });
});

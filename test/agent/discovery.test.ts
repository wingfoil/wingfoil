/**
 * Discovering and loading adapter manifests from `.wingfoil/agents/{built-in,custom}/` (task-177,
 * `spec-016` §2.1, §3.2 step 5, §3.3 step 2, §3.7 "manifest invalid"). Manifests gate what
 * `agent execute` launches, so they are read at `HEAD` (`dl-080` (B), `command-baseline`); a name in
 * both directories is refused at discovery; and only the adapter a caller selects is parsed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { adapterTreeDiagnosticsAtRev, ADAPTERS_DIR_PATH, E_ADAPTER_DUPLICATE, listAdaptersAtRev, loadAdapter, W_ADAPTER_IGNORED } from '../../src/agent';
import { errorDetails } from '../../src/core/error-details';
import { ValidationError } from '../../src/validation';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const FAKE = readFileSync(join(__dirname, '..', 'fixtures', 'agents', 'custom', 'fake.yaml'), 'utf-8');

/** The fake manifest renamed to `name`. */
const renamed = (name: string): string => FAKE.replace(/^name: fake$/m, `name: ${name}`);

/** A built-in manifest: built-ins must carry `verified_with`, which the fake fixture declares (task-200). */
const builtIn = (name: string): string => renamed(name);

describe('adapter discovery and loading', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'README.md', 'x\n');
  });

  afterEach(() => removeTempDir(repo));

  it('the adapter directory is .wingfoil/agents', () => {
    expect(ADAPTERS_DIR_PATH).toBe('.wingfoil/agents');
  });

  it('lists built-in and custom adapters at HEAD, sorted, without parsing them', () => {
    writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
    writeFixtureFile(repo, '.wingfoil/agents/custom/broken.yaml', 'not: [valid\n');
    writeFixtureFile(repo, '.wingfoil/agents/built-in/alpha.yaml', builtIn('alpha'));
    writeFixtureFile(repo, '.wingfoil/agents/built-in/.gitkeep', '');
    writeFixtureFile(repo, '.wingfoil/agents/custom/notes.md', '# not a manifest\n');
    commitAll(repo, 'adapters');
    expect(listAdaptersAtRev(repo, 'HEAD')).toEqual([
      { name: 'alpha', kind: 'built-in', path: '.wingfoil/agents/built-in/alpha.yaml' },
      { name: 'broken', kind: 'custom', path: '.wingfoil/agents/custom/broken.yaml' },
      { name: 'fake', kind: 'custom', path: '.wingfoil/agents/custom/fake.yaml' },
    ]);
  });

  describe('AC 4 — the same basename under built-in/ and custom/ is refused at discovery', () => {
    beforeEach(() => {
      writeFixtureFile(repo, '.wingfoil/agents/built-in/fake.yaml', builtIn('fake'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
      writeFixtureFile(repo, '.wingfoil/agents/custom/other.yaml', renamed('other'));
      commitAll(repo, 'adapters');
    });

    it('listing throws a ValidationError naming the adapter and both files', () => {
      let thrown: unknown;
      try {
        listAdaptersAtRev(repo, 'HEAD');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).issues.map((issue) => issue.code)).toEqual([E_ADAPTER_DUPLICATE]);
      const message = (thrown as ValidationError).message;
      expect(message).toContain('built-in/fake.yaml');
      expect(message).toContain('custom/fake.yaml');
    });

    it('loading any adapter is refused, with VALIDATION and the `adapter <name>:` prefix', () => {
      const result = loadAdapter(repo, 'other');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toMatch(/^adapter 'fake': /);
      expect(result.error.message).toMatch(/both/);
    });
  });

  it('a refusal for duplicates carries a dl-055 detail for every duplicated name (review F2)', () => {
    writeFixtureFile(repo, '.wingfoil/agents/built-in/fake.yaml', builtIn('fake'));
    writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
    writeFixtureFile(repo, '.wingfoil/agents/built-in/zeta.yaml', builtIn('zeta'));
    writeFixtureFile(repo, '.wingfoil/agents/custom/zeta.yaml', renamed('zeta'));
    commitAll(repo, 'adapters');
    const result = loadAdapter(repo, 'fake');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/^adapter 'fake': declared in both /);
    const details = errorDetails(result.error);
    expect(details).toHaveLength(2);
    for (const entry of details) expect(entry.file).toBe('HEAD:.wingfoil/agents');
    expect(details[0]!.detail).toContain('.wingfoil/agents/custom/fake.yaml');
    expect(details[1]!.detail).toContain('.wingfoil/agents/custom/zeta.yaml');
  });

  it('AC 4 — loading refuses a manifest whose `name` is not its file basename', () => {
    writeFixtureFile(repo, '.wingfoil/agents/custom/other.yaml', FAKE);
    commitAll(repo, 'adapters');
    const result = loadAdapter(repo, 'other');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/^adapter 'other': name: .*basename/);
  });

  it('loads the selected adapter with its kind and path', () => {
    writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
    writeFixtureFile(repo, '.wingfoil/agents/built-in/alpha.yaml', builtIn('alpha'));
    commitAll(repo, 'adapters');
    const custom = loadAdapter(repo, 'fake');
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(custom.value.kind).toBe('custom');
    expect(custom.value.path).toBe('.wingfoil/agents/custom/fake.yaml');
    expect(custom.value.manifest.command).toBe('node');
    const builtin = loadAdapter(repo, 'alpha');
    expect(builtin.ok && builtin.value.kind).toBe('built-in');
  });

  it('an adapter no directory holds at HEAD is NOT_FOUND', () => {
    commitAll(repo, 'empty');
    const result = loadAdapter(repo, 'fake');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toMatch(/^adapter 'fake': /);
  });

  it('a repository with no commit has no adapter (NOT_FOUND)', () => {
    writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
    const result = loadAdapter(repo, 'fake');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('an adapter name outside the spec-009 id class is refused before any lookup', () => {
    commitAll(repo, 'empty');
    const result = loadAdapter(repo, '../escape');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/^adapter '\.\.\/escape': /);
  });

  describe('AC 1 — the refusal of an invalid manifest', () => {
    it('is `adapter <name>: <zod issue>`, with one dl-055 detail line per issue naming the file', () => {
      writeFixtureFile(
        repo,
        '.wingfoil/agents/custom/fake.yaml',
        FAKE.replace(/^format: 1$/m, 'format: 0').replace(/^command: node\n/m, ''),
      );
      commitAll(repo, 'broken adapter');
      const result = loadAdapter(repo, 'fake');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toMatch(/^adapter 'fake': (format|command): /);
      const details = errorDetails(result.error);
      expect(details).toHaveLength(2);
      for (const entry of details) expect(entry.file).toBe('HEAD:.wingfoil/agents/custom/fake.yaml');
      expect(details.map((entry) => entry.detail?.split(':')[0]).sort()).toEqual(['command', 'format']);
    });

    it('a manifest in a newer format is refused for its format alone, with the upgrade-WingFoil message (bug-242, dl-149)', () => {
      writeFixtureFile(
        repo,
        '.wingfoil/agents/custom/fake.yaml',
        FAKE.replace(/^format: 1$/m, 'format: 2').replace(/^command: node\n/m, ''),
      );
      commitAll(repo, 'newer adapter');
      const result = loadAdapter(repo, 'fake');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toBe(
        "adapter 'fake': format: this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil",
      );
      const details = errorDetails(result.error);
      expect(details).toHaveLength(1);
      expect(details[0]).toEqual({
        file: 'HEAD:.wingfoil/agents/custom/fake.yaml',
        detail: 'format: this file is written in format 2; this WingFoil reads up to format 1: upgrade WingFoil',
      });
      expect(result.error.details?.issues).toEqual([expect.objectContaining({ code: 'E_INVALID_FORMAT', path: 'format', file: 'HEAD:.wingfoil/agents/custom/fake.yaml' })]);
    });

    it('a manifest that is not YAML is refused with the same prefix', () => {
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', 'name: [unclosed\n');
      commitAll(repo, 'broken adapter');
      const result = loadAdapter(repo, 'fake');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toMatch(/^adapter 'fake': /);
    });
  });

  describe('AC 5 — manifests are read at HEAD', () => {
    it('an uncommitted edit to a committed manifest does not change the loaded adapter', () => {
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
      commitAll(repo, 'adapters');
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE.replace(/^command: node$/m, 'command: edited'));
      const result = loadAdapter(repo, 'fake');
      expect(result.ok && result.value.manifest.command).toBe('node');
    });

    it('an uncommitted broken edit does not break the loaded adapter', () => {
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
      commitAll(repo, 'adapters');
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', 'format: 99\n');
      expect(loadAdapter(repo, 'fake').ok).toBe(true);
    });

    it('an untracked manifest is not an adapter', () => {
      commitAll(repo, 'empty');
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
      const result = loadAdapter(repo, 'fake');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('an untracked same-name file does not trip the duplicate check', () => {
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
      commitAll(repo, 'adapters');
      writeFixtureFile(repo, '.wingfoil/agents/built-in/fake.yaml', builtIn('fake'));
      expect(loadAdapter(repo, 'fake').ok).toBe(true);
    });

    it('a revision other than HEAD that names no commit is the revision refusal, not an empty adapter set', () => {
      commitAll(repo, 'empty');
      const result = loadAdapter(repo, 'fake', 'no-such-branch');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toBe('revision "no-such-branch" does not name a commit');
    });

    it('reads another revision when asked', () => {
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
      commitAll(repo, 'one');
      writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE.replace(/^command: node$/m, 'command: two'));
      commitAll(repo, 'two');
      const result = loadAdapter(repo, 'fake', 'HEAD~1');
      expect(result.ok && result.value.manifest.command).toBe('node');
    });
  });

  it('AC 6 — only the selected adapter is parsed: a broken unrelated manifest does not block it', () => {
    writeFixtureFile(repo, '.wingfoil/agents/custom/fake.yaml', FAKE);
    writeFixtureFile(repo, '.wingfoil/agents/custom/broken.yaml', 'name: broken\nformat: 7\nunknown: [\n');
    writeFixtureFile(repo, '.wingfoil/agents/built-in/nameless.yaml', 'format: 1\n');
    commitAll(repo, 'adapters');
    const result = loadAdapter(repo, 'fake');
    expect(result.ok).toBe(true);
    const broken = loadAdapter(repo, 'broken');
    expect(broken.ok).toBe(false);
  });

  describe('bug-290 — an entry that is not an adapter is reported, and the listing offers only loadable names', () => {
    const NOT_AN_ADAPTER =
      'not an adapter: an adapter is a .yaml file directly inside .wingfoil/agents/built-in/ or .wingfoil/agents/custom/ (spec-016 §2.1)';

    beforeEach(() => {
      writeFixtureFile(repo, '.wingfoil/agents/custom/ok.yaml', renamed('ok'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/a.yml', renamed('a'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/nested/b.yaml', renamed('b'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/Bad Name.yaml', renamed('Bad Name'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/.gitkeep', '');
      writeFixtureFile(repo, '.wingfoil/agents/built-in/.gitkeep', '');
      writeFixtureFile(repo, '.wingfoil/agents/stray.yaml', renamed('stray'));
      commitAll(repo, 'adapters and non-adapters');
    });

    it('the listing holds only names loadAdapter can select', () => {
      expect(listAdaptersAtRev(repo, 'HEAD').map((entry) => entry.name)).toEqual(['ok']);
    });

    it('every other entry but a .gitkeep is a W_ADAPTER_IGNORED warning naming its path, in path order', () => {
      expect(adapterTreeDiagnosticsAtRev(repo, 'HEAD')).toEqual([
        {
          code: W_ADAPTER_IGNORED,
          severity: 'warning',
          file: '.wingfoil/agents/custom/Bad Name.yaml',
          path: '',
          message: "not an adapter: its name 'Bad Name' is not an id, characters [a-z0-9-.] only (spec-009 §1), so no agent can select it",
        },
        { code: W_ADAPTER_IGNORED, severity: 'warning', file: '.wingfoil/agents/custom/a.yml', path: '', message: NOT_AN_ADAPTER },
        { code: W_ADAPTER_IGNORED, severity: 'warning', file: '.wingfoil/agents/custom/nested/b.yaml', path: '', message: NOT_AN_ADAPTER },
        { code: W_ADAPTER_IGNORED, severity: 'warning', file: '.wingfoil/agents/stray.yaml', path: '', message: NOT_AN_ADAPTER },
      ]);
    });

    it('a tree of adapters and .gitkeep files only has no diagnostic; a repository with no commit has none', () => {
      const clean = makeTempGitRepo();
      try {
        expect(adapterTreeDiagnosticsAtRev(clean, 'HEAD')).toEqual([]);
        writeFixtureFile(clean, '.wingfoil/agents/custom/ok.yaml', renamed('ok'));
        writeFixtureFile(clean, '.wingfoil/agents/built-in/.gitkeep', '');
        commitAll(clean, 'clean tree');
        expect(adapterTreeDiagnosticsAtRev(clean, 'HEAD')).toEqual([]);
      } finally {
        removeTempDir(clean);
      }
    });
  });
});

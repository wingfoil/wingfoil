/**
 * task-363 AC 1 and AC 2 (`spec-019` §8, §9 T-19, §12 AC 11; `dl-213` (a); approver rulings D1 (a), D2 (a), D3 (a))
 * — the `Formats read:` and `Capabilities:` lines of a release section, computed by `scripts/changelog-section.cjs`
 * from the previous release's capabilities document and the current build's.
 *
 * - AC 1 (red-first): `formatRange`, `releaseLines` and `previousReleaseTag`, pure, on documents derived from the
 *   committed 0.3.2 baseline by editing a deep copy; the `--lines` mode with `--previous`/`--current` files, and with
 *   its default sources in a temporary git repository (`--repo`): the fixture at the previous release's tag, the
 *   baseline when that tag holds none, `node <repo>/dist/cli.js capabilities --format json` as current.
 * - AC 2 (red-first): a capability or a file kind removed while `format` has not risen fails, naming each removal,
 *   kinds first; with a higher `format` it passes and the removal is a `### Breaking` item.
 *
 * The default mode (`test/cli/changelog-section.test.ts`, `test/cli/publish-release-scripts-edges.test.ts`) is not
 * touched here. The temporary repositories inherit the jest run's git isolation (`test/git-isolation.cjs`); their
 * commits name an identity through the environment.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatRange, previousReleaseTag, releaseLines } from '../../scripts/changelog-section.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'changelog-section.cjs');
const BASELINE_PATH = 'test/core/fixtures/capabilities-document-baseline-0.3.2.json';
const FIXTURE_PATH = 'test/core/fixtures/capabilities-document.json';
const BASELINE_FILE = join(REPO_ROOT, BASELINE_PATH);
const FIXTURE_FILE = join(REPO_ROOT, FIXTURE_PATH);

interface Range {
  lowest: number;
  highest: number;
}
interface Doc {
  format: number;
  formats: Record<string, Range>;
  commands: string[];
  capabilities: string[];
  [key: string]: unknown;
}

const BASELINE_TEXT = readFileSync(BASELINE_FILE, 'utf-8');

/** A fresh deep copy of the committed baseline, to edit. */
function baseline(): Doc {
  return JSON.parse(BASELINE_TEXT) as Doc;
}

const RELEASE_TAGS = ['v0.1.0', 'v0.2.0', 'v0.2.1', 'v0.2.2', 'v0.3.0', 'v0.3.1', 'v0.3.2'];

describe('task-363 AC 1 — formatRange', () => {
  it('writes `none` for an absent kind, `N` when lowest = highest, `L..H` otherwise', () => {
    expect(formatRange(undefined)).toBe('none');
    expect(formatRange({ lowest: 1, highest: 1 })).toBe('1');
    expect(formatRange({ lowest: 1, highest: 2 })).toBe('1..2');
  });
});

describe('task-363 AC 1 — releaseLines (T-19)', () => {
  it('equal documents: `Formats read: unchanged`, `Capabilities: none new`, no Breaking item', () => {
    expect(releaseLines(baseline(), baseline())).toEqual({
      ok: true,
      formatsRead: 'Formats read: unchanged',
      capabilities: 'Capabilities: none new',
      breaking: [],
    });
  });

  it('ignores `commands`, `wingfoil` and an unknown key (spec-019 §5)', () => {
    const current = baseline();
    current['wingfoil'] = { version: '0.4.0', commit: 'unknown' };
    current['schemas'] = ['x'];
    current.commands = ['capabilities'];
    expect(releaseLines(baseline(), current)).toEqual({
      ok: true,
      formatsRead: 'Formats read: unchanged',
      capabilities: 'Capabilities: none new',
      breaking: [],
    });
  });

  it.each<[string, (doc: Doc) => void, string]>([
    ['dna at 2..2', (doc) => { doc.formats['dna'] = { lowest: 2, highest: 2 }; }, 'Formats read: dna 1→2'],
    ['dna at 1..2', (doc) => { doc.formats['dna'] = { lowest: 1, highest: 2 }; }, 'Formats read: dna 1→1..2'],
  ])('%s gives the matching range change', (_label, edit, line) => {
    const current = baseline();
    edit(current);
    const result = releaseLines(baseline(), current);
    expect(result.formatsRead).toBe(line);
    expect(result.ok).toBe(true);
  });

  it('a kind absent on the previous side: `bindings none→1`', () => {
    const previous = baseline();
    delete previous.formats['bindings'];
    const result = releaseLines(previous, baseline());
    expect(result).toEqual({
      ok: true,
      formatsRead: 'Formats read: bindings none→1',
      capabilities: 'Capabilities: none new',
      breaking: [],
    });
  });

  it('a range `L..H` on both sides', () => {
    const previous = baseline();
    previous.formats['dna'] = { lowest: 1, highest: 2 };
    const current = baseline();
    current.formats['dna'] = { lowest: 2, highest: 3 };
    expect(releaseLines(previous, current).formatsRead).toBe('Formats read: dna 1..2→2..3');
  });

  it('two items, `, `-joined in code-unit order of the kind, whatever the documents\' key order', () => {
    const previous = baseline();
    const current = baseline();
    const reordered: Record<string, Range> = {};
    for (const kind of Object.keys(current.formats).reverse()) reordered[kind] = current.formats[kind] as Range;
    reordered['dna'] = { lowest: 2, highest: 2 };
    reordered['agent-adapter'] = { lowest: 2, highest: 2 };
    current.formats = reordered;
    expect(releaseLines(previous, current).formatsRead).toBe('Formats read: agent-adapter 1→2, dna 1→2');
  });

  it('new capability names only, in code-unit order', () => {
    const previous = baseline();
    previous.capabilities = ['dna-verbs'];
    const current = baseline();
    current.capabilities = ['workflow-tracking', 'dna-verbs', 'agent-execute'];
    expect(releaseLines(previous, current)).toEqual({
      ok: true,
      formatsRead: 'Formats read: unchanged',
      capabilities: 'Capabilities: agent-execute, workflow-tracking',
      breaking: [],
    });
  });
});

describe('task-363 AC 1 — previousReleaseTag', () => {
  it('0.4.0 after the seven release tags → v0.3.2', () => {
    expect(previousReleaseTag('0.4.0', RELEASE_TAGS)).toBe('v0.3.2');
  });

  it('0.3.3 with v0.4.0 tagged → v0.3.2 (the semver predecessor, not the newest tag)', () => {
    expect(previousReleaseTag('0.3.3', [...RELEASE_TAGS, 'v0.4.0'])).toBe('v0.3.2');
  });

  it('ignores a tag that is not vX.Y.Z (v0.4.0-rc.1, release-0.3)', () => {
    expect(previousReleaseTag('0.4.1', [...RELEASE_TAGS, 'v0.4.0-rc.1', 'release-0.3'])).toBe('v0.3.2');
  });

  it('orders versions numerically, from an unordered list', () => {
    expect(previousReleaseTag('0.3.0', ['v0.2.10', 'v0.1.0', 'v0.2.9'])).toBe('v0.2.10');
  });

  it('0.1.0 → undefined: no tag below it', () => {
    expect(previousReleaseTag('0.1.0', RELEASE_TAGS)).toBeUndefined();
  });
});

describe('task-363 AC 2 — a removal without a format bump fails; with one it is a Breaking item', () => {
  function withRemovals(currentFormat: number): { previous: Doc; current: Doc } {
    const previous = baseline();
    previous.capabilities = ['agent-execute', 'mcp-server'];
    const current = baseline();
    current.format = currentFormat;
    delete current.formats['roles'];
    current.capabilities = ['agent-execute'];
    return { previous, current };
  }

  it('at an equal format: ok false, one problem per removal, kinds first', () => {
    const { previous, current } = withRemovals(1);
    expect(releaseLines(previous, current)).toEqual({
      ok: false,
      problems: [
        'file kind `roles` removed without a capabilities document format bump (format 1→1, spec-019 §5)',
        'capability `mcp-server` removed without a capabilities document format bump (format 1→1, spec-019 §5)',
      ],
    });
  });

  it('with format 2: ok true, the removed kind as `roles 1→none`, the capability on neither line, three Breaking items', () => {
    const { previous, current } = withRemovals(2);
    expect(releaseLines(previous, current)).toEqual({
      ok: true,
      formatsRead: 'Formats read: roles 1→none',
      capabilities: 'Capabilities: none new',
      breaking: [
        '- The capabilities document\'s `format` rises from 1 to 2 (spec-019 §5).',
        '- Files of kind `roles` are no longer read: formats 1→none.',
        '- The capability `mcp-server` is no longer provided.',
      ],
    });
  });
});

describe('task-363 AC 1 and AC 2 — the --lines mode', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'wf-changelog-lines-'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  const run = (...args: string[]): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

  function writeDoc(name: string, doc: unknown): string {
    const file = join(work, name);
    writeFileSync(file, `${JSON.stringify(doc)}\n`);
    return file;
  }

  it('AC 1: --previous <baseline> --current <the §5 fixture> prints the two lines, exit 0, stderr empty', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_FILE, 'utf-8')) as Doc;
    const result = run('0.4.0', '--lines', '--previous', BASELINE_FILE, '--current', FIXTURE_FILE);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`Formats read: unchanged\n\nCapabilities: ${fixture.capabilities.join(', ')}\n`);
    expect(result.status).toBe(0);
  });

  it('AC 1: a previous file that is not a capabilities document exits 1 naming it', () => {
    const bad = writeDoc('bad.json', {});
    const result = run('0.4.0', '--lines', '--previous', bad, '--current', FIXTURE_FILE);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`error: ${bad} is not a capabilities document: `)).toBe(true);
  });

  it('AC 2: a removal at an equal format exits 1, one error line per removal, then the hint, stdout empty', () => {
    const previous = baseline();
    previous.capabilities = ['agent-execute', 'mcp-server'];
    const current = baseline();
    delete current.formats['roles'];
    current.capabilities = ['agent-execute'];
    const previousFile = writeDoc('previous.json', previous);
    const result = run('0.4.0', '--lines', '--previous', previousFile, '--current', writeDoc('current.json', current));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      [
        'error: file kind `roles` removed without a capabilities document format bump (format 1→1, spec-019 §5)',
        'error: capability `mcp-server` removed without a capabilities document format bump (format 1→1, spec-019 §5)',
        `hint: previous document: ${previousFile}`,
        '',
      ].join('\n'),
    );
  });

  it('AC 2: with format 2 it exits 0 and prints the `### Breaking` block after the two lines', () => {
    const previous = baseline();
    previous.capabilities = ['agent-execute', 'mcp-server'];
    const current = baseline();
    current.format = 2;
    delete current.formats['roles'];
    current.capabilities = ['agent-execute'];
    const result = run(
      '0.4.0', '--lines', '--previous', writeDoc('previous.json', previous), '--current', writeDoc('current.json', current),
    );
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        'Formats read: roles 1→none',
        '',
        'Capabilities: none new',
        '',
        '### Breaking',
        '',
        '- The capabilities document\'s `format` rises from 1 to 2 (spec-019 §5).',
        '- Files of kind `roles` are no longer read: formats 1→none.',
        '- The capability `mcp-server` is no longer provided.',
        '',
      ].join('\n'),
    );
    expect(result.status).toBe(0);
  });

  it('a usage error exits 2 with the usage hint naming the new options', () => {
    for (const args of [
      ['0.4.0', '--lines', '--check'],
      ['0.4.0', '--lines', '--previous'],
      ['0.4.0', '--previous', BASELINE_FILE],
      ['0.4.0', '--current', FIXTURE_FILE],
      ['0.4.0', '--repo', work],
    ]) {
      const result = run(...args);
      expect({ args, status: result.status }).toEqual({ args, status: 2 });
      expect(result.stderr).toMatch(/^error: /);
      const usage = result.stderr.split('\n').find((line) => line.startsWith('hint: usage: ')) ?? '';
      for (const option of ['--lines', '--check', '--previous', '--current', '--repo']) expect(usage).toContain(option);
    }
  });
});

describe('task-363 AC 1 — the --lines mode\'s default sources, in a temporary repository (--repo)', () => {
  const IDENTITY = {
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  let repo: string;

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8', env: { ...process.env, ...IDENTITY } });
  const run = (...args: string[]): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

  /** The document the tag v0.4.0 holds at FIXTURE_PATH: the baseline with dna at 1..2 and one capability. */
  function taggedFixture(): Doc {
    const doc = baseline();
    doc.formats['dna'] = { lowest: 1, highest: 2 };
    doc.commands = [...doc.commands, 'capabilities'].sort();
    doc.capabilities = ['agent-execute'];
    return doc;
  }

  /** What the stub build prints: the tagged fixture plus `mcp-server`, with `wingfoil` second as §3.1 orders it. */
  function stubDocument(): unknown {
    const doc = taggedFixture();
    return {
      format: doc.format,
      wingfoil: { version: '0.4.1', commit: 'unknown' },
      formats: doc.formats,
      commands: doc.commands,
      capabilities: ['agent-execute', 'mcp-server'],
    };
  }

  function writeIn(path: string, text: string): void {
    const file = join(repo, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wf-changelog-lines-repo-'));
    git('init', '--quiet', '-b', 'main');
    writeIn(BASELINE_PATH, BASELINE_TEXT);
    git('add', '-A');
    git('commit', '--quiet', '-m', 'release 0.3.2');
    git('tag', 'v0.3.2');
    writeIn(FIXTURE_PATH, `${JSON.stringify(taggedFixture())}\n`);
    git('add', '-A');
    git('commit', '--quiet', '-m', 'release 0.4.0');
    git('tag', 'v0.4.0');
    writeIn('dist/cli.js', `process.stdout.write(${JSON.stringify(`${JSON.stringify(stubDocument())}\n`)});\n`);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('0.4.1 reads the fixture at v0.4.0 as previous and the build\'s document as current', () => {
    const result = run('0.4.1', '--lines', '--repo', repo);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('Formats read: unchanged\n\nCapabilities: mcp-server\n');
    expect(result.status).toBe(0);
  });

  it('0.4.0 falls back to the baseline: its previous tag v0.3.2 holds no fixture', () => {
    const result = run('0.4.0', '--lines', '--repo', repo);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('Formats read: dna 1→1..2\n\nCapabilities: agent-execute, mcp-server\n');
    expect(result.status).toBe(0);
  });

  it('0.3.2 has no release tag below it: exit 1, `error: no release tag below v0.3.2`', () => {
    const result = run('0.3.2', '--lines', '--repo', repo);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: no release tag below v0\.3\.2$/m);
  });

  it('without dist/cli.js: exit 1, `error: cannot read the current capabilities document: …`', () => {
    rmSync(join(repo, 'dist'), { recursive: true, force: true });
    const result = run('0.4.0', '--lines', '--repo', repo);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: cannot read the current capabilities document: /m);
  });
});

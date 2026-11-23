/**
 * task-363 AC 3 (`dl-213` (a), `spec-019` §8; approver rulings D1 (a), D3 (a)) — the form of a release section:
 * the `Formats read:` and `Capabilities:` lines open it, one paragraph each, then a patch's `Feature in a patch:`
 * lines, then prose; `### Breaking` and `### Deprecated` are used when they have content, `### Breaking` first.
 *
 * - `checkReleaseSection(notes, version)` over the notes `changelogSection` returns: each problem text of the design
 *   on a fixture section; a well-formed minor and a well-formed patch pass;
 * - the `--check` mode on a temporary CHANGELOG with `--previous`/`--current` files: silent exit 0, then the
 *   differ / lack messages at exit 1;
 * - the repository: every `## [X.Y.Z]` section of `CHANGELOG.md` not in `LINES_GRANDFATHERED` passes the check;
 *   `LINES_GRANDFATHERED` is the seven sections written before `dl-213`, each present; the real 0.3.2 section fails
 *   the check (the check bites on real data).
 *
 * All red-first: `checkReleaseSection`, `LINES_GRANDFATHERED` and `--check` do not exist yet.
 */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { changelogSection, checkReleaseSection, LINES_GRANDFATHERED } from '../../scripts/changelog-section.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'changelog-section.cjs');
const BASELINE_FILE = join(REPO_ROOT, 'test', 'core', 'fixtures', 'capabilities-document-baseline-0.3.2.json');

const MINOR = [
  'Formats read: bindings none→1, dna 1→1..2',
  '',
  'Capabilities: agent-execute, dna-verbs',
  '',
  'A minor with a breaking change.',
  '',
  '### Breaking',
  '',
  '- The capability `x-y` is no longer provided.',
  '',
  '### Added',
  '',
  '- one. (task-1)',
  '',
  '### Deprecated',
  '',
  '- two. (task-2)',
].join('\n');

const PATCH = [
  'Formats read: unchanged',
  '',
  'Capabilities: none new',
  '',
  'Feature in a patch: short element references (task-332)',
  '',
  'A patch, mostly fixes.',
  '',
  '### Fixed',
  '',
  '- three. (bug-3)',
].join('\n');

/** The notes with the paragraph at `index` (blank-line separated) replaced by `text`. */
function withParagraph(notes: string, index: number, text: string): string {
  const paragraphs = notes.split('\n\n');
  paragraphs[index] = text;
  return paragraphs.join('\n\n');
}

describe('task-363 AC 3 — checkReleaseSection: well-formed sections pass', () => {
  it('a minor with the two lines, a Breaking item first and a Deprecated item', () => {
    expect(checkReleaseSection(MINOR, '0.4.0')).toEqual({ ok: true });
  });

  it('a patch with a `Feature in a patch:` line ending with its task', () => {
    expect(checkReleaseSection(PATCH, '0.3.3')).toEqual({ ok: true });
  });
});

describe('task-363 AC 3 — checkReleaseSection: each problem, named', () => {
  it.each<[string, string, string, string]>([
    [
      'the two lines in one paragraph',
      withParagraph(MINOR, 0, 'Formats read: unchanged\nCapabilities: none new'),
      '0.4.0',
      'the first paragraph is not one "Formats read: …" line',
    ],
    [
      'prose where the first line belongs',
      withParagraph(MINOR, 0, 'Some prose.'),
      '0.4.0',
      'the first paragraph is not one "Formats read: …" line',
    ],
    [
      'prose where the second line belongs',
      withParagraph(MINOR, 1, 'Some prose.'),
      '0.4.0',
      'the second paragraph is not one "Capabilities: …" line',
    ],
    [
      'an item whose two ranges are equal',
      withParagraph(MINOR, 0, 'Formats read: dna 1→1'),
      '0.4.0',
      '"Formats read:" item "dna 1→1" is not "<kind> <range>→<range>" with two different ranges',
    ],
    [
      'an item without the arrow',
      withParagraph(MINOR, 0, 'Formats read: dna 1-2'),
      '0.4.0',
      '"Formats read:" item "dna 1-2" is not "<kind> <range>→<range>" with two different ranges',
    ],
    [
      'kinds out of code-unit order',
      withParagraph(MINOR, 0, 'Formats read: dna 1→2, bindings none→1'),
      '0.4.0',
      '"Formats read:" items are not in code-unit order of the kind, or repeat a kind',
    ],
    [
      'a repeated kind',
      withParagraph(MINOR, 0, 'Formats read: dna 1→2, dna 1→2'),
      '0.4.0',
      '"Formats read:" items are not in code-unit order of the kind, or repeat a kind',
    ],
    [
      'a name that is not kebab-case',
      withParagraph(MINOR, 1, 'Capabilities: Agent_Execute'),
      '0.4.0',
      '"Capabilities:" name "Agent_Execute" is not a kebab-case capability name',
    ],
    [
      'names out of code-unit order',
      withParagraph(MINOR, 1, 'Capabilities: mcp-server, dna-verbs'),
      '0.4.0',
      '"Capabilities:" names are not in code-unit order, or repeat a name',
    ],
    [
      'a repeated name',
      withParagraph(MINOR, 1, 'Capabilities: dna-verbs, dna-verbs'),
      '0.4.0',
      '"Capabilities:" names are not in code-unit order, or repeat a name',
    ],
    [
      'a feature line in a minor',
      PATCH,
      '0.4.0',
      '"Feature in a patch:" in the section of 0.4.0, which is not a patch',
    ],
    [
      'a feature line without its task',
      withParagraph(PATCH, 2, 'Feature in a patch: short element references'),
      '0.3.3',
      '"Feature in a patch:" line does not end with its task, "(task-<n>)": "Feature in a patch: short element references"',
    ],
    [
      'a feature line after the prose',
      PATCH.replace('Feature in a patch: short element references (task-332)\n\n', '').concat(
        '\n\nFeature in a patch: short element references (task-332)',
      ),
      '0.3.3',
      '"Feature in a patch:" line outside the paragraphs right after "Capabilities:"',
    ],
    [
      'Breaking after another heading',
      MINOR.replace('### Breaking\n\n- The capability `x-y` is no longer provided.\n\n', '').concat(
        '\n\n### Breaking\n\n- The capability `x-y` is no longer provided.',
      ),
      '0.4.0',
      '"### Breaking" is not the first "###" heading',
    ],
    [
      'an empty Deprecated heading',
      MINOR.replace('### Deprecated\n\n- two. (task-2)', '### Deprecated'),
      '0.4.0',
      '"### Deprecated" has no item',
    ],
    [
      'an empty Breaking heading',
      MINOR.replace('### Breaking\n\n- The capability `x-y` is no longer provided.', '### Breaking'),
      '0.4.0',
      '"### Breaking" has no item',
    ],
    [
      'Breaking twice',
      MINOR.replace('### Added', '### Breaking\n\n- again.\n\n### Added'),
      '0.4.0',
      '"### Breaking" appears 2 times',
    ],
    [
      'Deprecated twice',
      MINOR.concat('\n\n### Deprecated\n\n- again.'),
      '0.4.0',
      '"### Deprecated" appears 2 times',
    ],
  ])('%s', (_label, notes, version, problem) => {
    const result = checkReleaseSection(notes, version);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain(problem);
  });
});

describe('task-363 AC 3 — the --check mode', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'wf-changelog-check-'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  const run = (...args: string[]): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

  /** The baseline with two capabilities: previous of the removal case. */
  function docs(): { previous: string; current: string; removal: string } {
    const base = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as { format: number; capabilities: string[] };
    const current = { ...base, capabilities: ['agent-execute', 'mcp-server'] };
    const removal = { ...base, format: 2, capabilities: ['agent-execute'] };
    const write = (name: string, doc: unknown): string => {
      const file = join(work, name);
      writeFileSync(file, `${JSON.stringify(doc)}\n`);
      return file;
    };
    return { previous: BASELINE_FILE, current: write('current.json', current), removal: write('removal.json', removal) };
  }

  function changelog(section: string): string {
    const file = join(work, 'CHANGELOG.md');
    writeFileSync(file, `# Changelog\n\nIntro.\n\n## [0.4.0] - 2026-12-01\n\n${section}\n\n## [0.3.2] - 2026-11-02\n\n- old.\n`);
    return file;
  }

  const GOOD = 'Formats read: unchanged\n\nCapabilities: agent-execute, mcp-server\n\nProse.\n\n### Added\n\n- one. (task-1)';

  it('a section whose lines equal the computed ones: exit 0, no output', () => {
    const { previous, current } = docs();
    const result = run('0.4.0', '--check', '--changelog', changelog(GOOD), '--previous', previous, '--current', current);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });

  it('a `Formats read:` line that differs: exit 1, one `error:` line naming it', () => {
    const { previous, current } = docs();
    const section = GOOD.replace('Formats read: unchanged', 'Formats read: dna 1→2');
    const result = run('0.4.0', '--check', '--changelog', changelog(section), '--previous', previous, '--current', current);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n').filter((line) => line !== '');
    const prefix = 'error: "Formats read:" line differs from the computed one: ';
    const line = lines.find((l) => l.startsWith(prefix));
    expect(line).toBeDefined();
    expect(['Formats read: unchanged', 'Formats read: dna 1→2']).toContain(line?.slice(prefix.length));
    expect(lines.every((l) => l.startsWith('error: '))).toBe(true);
  });

  it('a `Capabilities:` line that differs: exit 1, one `error:` line naming it', () => {
    const { previous, current } = docs();
    const section = GOOD.replace('Capabilities: agent-execute, mcp-server', 'Capabilities: agent-execute');
    const result = run('0.4.0', '--check', '--changelog', changelog(section), '--previous', previous, '--current', current);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n').filter((line) => line !== '');
    const prefix = 'error: "Capabilities:" line differs from the computed one: ';
    const line = lines.find((l) => l.startsWith(prefix));
    expect(line).toBeDefined();
    expect(['Capabilities: agent-execute, mcp-server', 'Capabilities: agent-execute']).toContain(line?.slice(prefix.length));
  });

  it('a computed Breaking item missing from `### Breaking`: exit 1, one `error:` line per item', () => {
    const { current, removal } = docs();
    const section = 'Formats read: unchanged\n\nCapabilities: none new\n\nProse.\n\n### Added\n\n- one. (task-1)';
    const result = run('0.4.0', '--check', '--changelog', changelog(section), '--previous', current, '--current', removal);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      [
        'error: "### Breaking" lacks the computed item: - The capabilities document\'s `format` rises from 1 to 2 (spec-019 §5).',
        'error: "### Breaking" lacks the computed item: - The capability `mcp-server` is no longer provided.',
        '',
      ].join('\n'),
    );
    expect(result.status).toBe(1);
  });

  it('the same section with the computed items under `### Breaking`: exit 0, no output', () => {
    const { current, removal } = docs();
    const section = [
      'Formats read: unchanged',
      '',
      'Capabilities: none new',
      '',
      '### Breaking',
      '',
      '- The capabilities document\'s `format` rises from 1 to 2 (spec-019 §5).',
      '- The capability `mcp-server` is no longer provided.',
    ].join('\n');
    const result = run('0.4.0', '--check', '--changelog', changelog(section), '--previous', current, '--current', removal);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('task-363 AC 3 — the repository CHANGELOG.md', () => {
  const text = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf-8');
  const versions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1] as string);

  it('LINES_GRANDFATHERED is the seven sections written before dl-213, frozen, each present', () => {
    expect(LINES_GRANDFATHERED).toEqual(['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2']);
    expect(Object.isFrozen(LINES_GRANDFATHERED)).toBe(true);
    for (const version of LINES_GRANDFATHERED) expect({ version, ok: changelogSection(text, version).ok }).toEqual({ version, ok: true });
  });

  it('every other release section passes checkReleaseSection', () => {
    for (const version of versions.filter((v) => !LINES_GRANDFATHERED.includes(v))) {
      const section = changelogSection(text, version);
      expect({ version, ok: section.ok }).toEqual({ version, ok: true });
      expect({ version, result: checkReleaseSection(section.notes ?? '', version) }).toEqual({ version, result: { ok: true } });
    }
  });

  it('the check bites on real data: the 0.3.2 section, written before dl-213, fails it', () => {
    const section = changelogSection(text, '0.3.2');
    expect(section.ok).toBe(true);
    const result = checkReleaseSection(section.notes ?? '', '0.3.2');
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('the first paragraph is not one "Formats read: …" line');
  });
});

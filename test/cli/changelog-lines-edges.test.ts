/**
 * task-363 (green, developer) — the exit paths of `scripts/changelog-section.cjs`'s `--lines` and `--check` modes that
 * the red suites (`test/cli/changelog-lines.test.ts`, `test/docs/changelog-lines.test.ts`) do not reach: the
 * document-shape refusals, an unreadable file, a directory that is not a repository, a build that fails or prints
 * something other than JSON, `--check`'s removal failure and missing section, and the usage refusals by message.
 */
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkReleaseSection, previousReleaseTag } from '../../scripts/changelog-section.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'changelog-section.cjs');
const BASELINE_FILE = join(REPO_ROOT, 'test', 'core', 'fixtures', 'capabilities-document-baseline-0.3.2.json');
const BASELINE = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as Record<string, unknown>;

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'wf-changelog-edges-'));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const run = (...args: string[]): SpawnSyncReturns<string> => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

function write(name: string, text: string): string {
  const file = join(work, name);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  return file;
}

describe('task-363 — --lines refuses what is not a capabilities document, naming why', () => {
  it.each<[string, string, string]>([
    ['not JSON', '{', 'is not a capabilities document: '],
    ['a list', '[]', 'is not a capabilities document: not a JSON object'],
    ['formats a list', JSON.stringify({ ...BASELINE, formats: [] }), 'is not a capabilities document: `formats` is not a mapping'],
    [
      'a range of zero',
      JSON.stringify({ ...BASELINE, formats: { dna: { lowest: 0, highest: 1 } } }),
      'is not a capabilities document: `formats.dna` is not a {lowest, highest} pair of positive integers',
    ],
    ['capabilities not names', JSON.stringify({ ...BASELINE, capabilities: [1] }), 'is not a capabilities document: `capabilities` is not a list of names'],
  ])('%s: exit 1', (_label, text, message) => {
    const current = write('current.json', text);
    const result = run('0.4.0', '--lines', '--previous', BASELINE_FILE, '--current', current);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`error: ${current} ${message}`)).toBe(true);
  });

  it('an unreadable --current file: exit 1, `error: cannot read <file>: ENOENT`', () => {
    const absent = join(work, 'absent.json');
    const result = run('0.4.0', '--lines', '--previous', BASELINE_FILE, '--current', absent);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`error: cannot read ${absent}: ENOENT\n`);
  });
});

describe('task-363 — --lines default sources: a directory that is not a repository, a failing build', () => {
  it('--repo naming a directory without git: exit 1, `error: cannot list the tags of <dir>`', () => {
    const result = run('0.4.0', '--lines', '--repo', work);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`error: cannot list the tags of ${work}\n`);
  });

  it('a build that exits non-zero: exit 1, its first stderr line in the message', () => {
    write('dist/cli.js', "process.stderr.write('error: unknown command \\'capabilities\\'\\n'); process.exit(2);\n");
    const result = run('0.4.0', '--lines', '--previous', BASELINE_FILE, '--repo', work);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("error: cannot read the current capabilities document: error: unknown command 'capabilities'\n");
  });

  it('a build that prints no JSON: exit 1, the command named as the source', () => {
    write('dist/cli.js', "process.stdout.write('hello\\n');\n");
    const result = run('0.4.0', '--lines', '--previous', BASELINE_FILE, '--repo', work);
    expect(result.status).toBe(1);
    expect(result.stderr.startsWith('error: node dist/cli.js capabilities --format json is not a capabilities document: ')).toBe(true);
  });
});

describe('task-363 — --check: a removal without a bump, a missing section', () => {
  const SECTION = 'Formats read: unchanged\n\nCapabilities: none new\n\nProse.';

  it('a removal without a format bump: exit 1, the error lines then the hint', () => {
    const previous = write('previous.json', JSON.stringify({ ...BASELINE, capabilities: ['mcp-server'] }));
    const changelog = write('CHANGELOG.md', `# Changelog\n\n## [0.4.0]\n\n${SECTION}\n`);
    const result = run('0.4.0', '--check', '--changelog', changelog, '--previous', previous, '--current', BASELINE_FILE);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'error: capability `mcp-server` removed without a capabilities document format bump (format 1→1, spec-019 §5)\n' +
        `hint: previous document: ${previous}\n`,
    );
  });

  it('a section that is out of form and out of date: both kinds of problem, the form first', () => {
    const changelog = write('CHANGELOG.md', '# Changelog\n\n## [0.4.0]\n\nProse.\n\nCapabilities: mcp-server\n');
    const result = run('0.4.0', '--check', '--changelog', changelog, '--previous', BASELINE_FILE, '--current', BASELINE_FILE);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      'error: the first paragraph is not one "Formats read: …" line\n' +
        'error: "Capabilities:" line differs from the computed one: Capabilities: none new\n',
    );
  });

  it('no section for the version: the default mode\'s refusal, exit 1', () => {
    const changelog = write('CHANGELOG.md', '# Changelog\n\n## [0.3.2]\n\n- old.\n');
    const result = run('0.4.0', '--check', '--changelog', changelog, '--previous', BASELINE_FILE, '--current', BASELINE_FILE);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('error: no section `## [0.4.0]` in the changelog\n');
  });
});

describe('task-363 — usage refusals, by message', () => {
  it.each<[string[], string]>([
    [['0.4.0', '--lines', '--check'], 'error: options --lines and --check exclude each other'],
    [['0.4.0', '--lines', '--repo'], 'error: option --repo needs a directory'],
    [['0.4.0', '--current', BASELINE_FILE], 'error: option --current needs --lines or --check'],
  ])('%j', (args, line) => {
    const result = run(...args);
    expect(result.status).toBe(2);
    expect(result.stderr.split('\n')[0]).toBe(line);
  });

  it('--lines given twice is one mode', () => {
    const result = run('0.4.0', '--lines', '--lines', '--previous', BASELINE_FILE, '--current', BASELINE_FILE);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Formats read: unchanged\n\nCapabilities: none new\n');
  });
});

describe('task-363 — checkReleaseSection and previousReleaseTag edges', () => {
  it('several `Feature in a patch:` paragraphs right after the lines, and a `####` heading closing a block', () => {
    const notes = [
      'Formats read: unchanged',
      '',
      'Capabilities: none new',
      '',
      'Feature in a patch: one (task-1)',
      '',
      'Feature in a patch: two (task-2)',
      '',
      '### Breaking',
      '',
      '#### Detail',
      '',
      '- under a sub-heading, not a Breaking item.',
    ].join('\n');
    expect(checkReleaseSection(notes, '0.3.3')).toEqual({ ok: false, problems: ['"### Breaking" has no item'] });
  });

  it('a version that is not X.Y.Z has no previous release tag', () => {
    expect(previousReleaseTag('v0.4.0', ['v0.3.2'])).toBeUndefined();
  });
});

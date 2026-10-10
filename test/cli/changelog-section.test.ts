/**
 * task-229 (`dl-130` step 1, spec-015 §3) — `scripts/changelog-section.cjs`, which extracts the notes of the
 * GitHub Release that `publish.yml`'s `release` job creates: the section of `CHANGELOG.md` headed
 * `## [X.Y.Z]` for the released version, up to the next `## ` heading. A missing, duplicated or empty section
 * is a failure, so the job never creates a Release with no notes or with another version's notes.
 *
 * Asserted through the exported function and the command line, on fixtures; nothing reads the network.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { changelogSection } from '../../scripts/changelog-section.cjs';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'changelog-section.cjs');

const CHANGELOG = [
  '# Changelog',
  '',
  'Intro paragraph.',
  '',
  '## [0.2.10] - 2026-11-01',
  '',
  '### Fixed',
  '',
  '- ten. (bug-10)',
  '',
  '## [0.2.1] - 2026-09-28',
  '',
  '### Added',
  '',
  '- one. (task-1)',
  '  continued line.',
  '',
  '### Fixed',
  '',
  '- two. (bug-2)',
  '',
  '',
  '## [0.2.0] - never published',
  '',
  '- zero.',
  '',
  '## [0.1.0]',
  '',
  '- first.',
  '',
  '[0.1.0]: https://example.invalid/v0.1.0',
  '',
].join('\n');

describe('changelogSection (task-229) — the notes of one version', () => {
  it('returns the section body between its heading and the next `## ` heading, blank edges trimmed', () => {
    expect(changelogSection(CHANGELOG, '0.2.1')).toEqual({
      ok: true,
      notes: ['### Added', '', '- one. (task-1)', '  continued line.', '', '### Fixed', '', '- two. (bug-2)'].join('\n'),
    });
  });

  it('matches the version exactly: 0.2.1 never reads the 0.2.10 section, and the reverse', () => {
    const ten = changelogSection(CHANGELOG, '0.2.10');
    expect(ten).toEqual({ ok: true, notes: '### Fixed\n\n- ten. (bug-10)' });
    expect(changelogSection(CHANGELOG, '0.2.1').notes).not.toContain('ten.');
  });

  it('reads a heading with no date, and drops the link reference definitions closing the file', () => {
    expect(changelogSection(CHANGELOG, '0.1.0')).toEqual({ ok: true, notes: '- first.' });
  });

  it('works on a tree that lacks later versions’ sections (a release/X.Y line, dl-159)', () => {
    const line = CHANGELOG.slice(CHANGELOG.indexOf('## [0.2.1]'));
    expect(changelogSection(`# Changelog\n\n${line}`, '0.2.1').ok).toBe(true);
  });

  it.each([
    ['0.3.0', /no section `## \[0\.3\.0\]`/],
    ['0.2', /not a version of the form X\.Y\.Z/],
    ['v0.2.1', /not a version of the form X\.Y\.Z/],
    ['', /not a version of the form X\.Y\.Z/],
  ])('fails for %p with a message naming the problem', (version, message) => {
    const result = changelogSection(CHANGELOG, version);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });

  it('fails on an empty section and on a duplicated heading', () => {
    const empty = changelogSection('# Changelog\n\n## [1.0.0] - x\n\n\n## [0.9.0]\n\n- y\n', '1.0.0');
    expect(empty.ok).toBe(false);
    expect(empty.message).toMatch(/section `## \[1\.0\.0\]` is empty/);
    const twice = changelogSection('## [1.0.0]\n\n- a\n\n## [1.0.0]\n\n- b\n', '1.0.0');
    expect(twice.ok).toBe(false);
    expect(twice.message).toMatch(/2 sections `## \[1\.0\.0\]`/);
  });
});

describe('changelog-section command line (task-229)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'wf-changelog-'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  const run = (...args: string[]): ReturnType<typeof spawnSync> =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

  it('prints the notes on stdout and exits 0', () => {
    const file = join(work, 'CHANGELOG.md');
    writeFileSync(file, CHANGELOG);
    const result = run('0.2.10', '--changelog', file);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('### Fixed\n\n- ten. (bug-10)\n');
  });

  it('exits 1 with an `error:` line on stderr, and prints nothing on stdout, when the section is missing', () => {
    const file = join(work, 'CHANGELOG.md');
    writeFileSync(file, CHANGELOG);
    const result = run('9.9.9', '--changelog', file);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: no section `## \[9\.9\.9\]`/);
  });

  it('exits 1 when the changelog file does not exist', () => {
    const result = run('0.2.1', '--changelog', join(work, 'absent.md'));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^error: cannot read /);
  });

  it('exits 2 on a usage error: no version, a malformed version, an unknown option', () => {
    expect(run().status).toBe(2);
    expect(run('v1.0.0').status).toBe(2);
    expect(run('1.0.0', '--bogus').status).toBe(2);
    expect(run('1.0.0', '--changelog').status).toBe(2);
  });

  it('reads the repository CHANGELOG.md by default: this repository has a 0.2.2 section', () => {
    const result = run('0.2.2');
    expect(result.status).toBe(0);
    const text = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf-8');
    const start = text.indexOf('## [0.2.2]');
    const next = text.indexOf('\n## ', start + 1);
    expect(text.slice(start, next)).toContain(result.stdout.trim().split('\n')[0]);
  });
});

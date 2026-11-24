/**
 * task-363 AC 5 (`dl-213` (a), `spec-019` §8; approver ruling D5 (a)) — `release-publishing`'s `release-commit`
 * phase names the two lines that open the version's CHANGELOG section, the `Feature in a patch:` line, the
 * `### Breaking` and `### Deprecated` headings, and the `--lines` and `--check` modes of
 * `scripts/changelog-section.cjs`. Only its description changes: the phase list, its one action and its absent
 * `checks` stay, and the workflow's `version:` rises to 2.4 with a history entry naming task-363.
 *
 * red-first (not characterization, per the design's AC table): the wording does not exist yet. Prose is pinned as
 * substrings of the whitespace-flattened description, every new text beside a positive that exists today (the F5
 * asset URL); the version pin is "≥" plus the history entry (bug-314). The file is read from the working tree and
 * parsed once.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const ROOT = join(__dirname, '..', '..');
const PUBLISHING_FILE = join(ROOT, '.wingfoil', 'workflows', 'custom', 'release-publishing.yaml');

interface PhaseShape {
  name: string;
  description?: string;
  actions?: string[];
  checks?: unknown;
}

const raw = readFileSync(PUBLISHING_FILE, 'utf-8');
const parsed = yamlLoad(raw) as { phases: PhaseShape[] };

/** Collapse every run of whitespace to one space. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** `version:` of the raw workflow file: the number and the rest of its line (the history comment). */
function versionLine(text: string): { value: number; rest: string } {
  const match = /^version: "?(\d+\.\d+)"?(.*)$/m.exec(text);
  if (!match) throw new Error('no version: line');
  return { value: Number(match[1]), rest: match[2] ?? '' };
}

/** The first `;`- or `(prev`-delimited segment of the history comment naming `version` as a word and `task`. */
function historyEntry(rest: string, version: string, task: string): string | undefined {
  const word = new RegExp(`(^|[\\s(])${version.replace('.', '\\.')}([\\s):,]|$)`);
  return rest.split(/;|\(prev /).find((segment) => word.test(segment) && segment.includes(task));
}

function releaseCommit(): PhaseShape {
  const found = parsed.phases.find((phase) => phase.name === 'release-commit');
  if (found === undefined) throw new Error('release-publishing has no phase release-commit');
  return found;
}

describe('task-363 AC 5 — release-publishing\'s release-commit names the CHANGELOG lines', () => {
  it('keeps the phase list, release-commit\'s one git.commit action and no checks on it', () => {
    expect(parsed.phases.map((phase) => phase.name)).toEqual([
      'release-commit', 'staging-rehearsal', 'tag', 'publish', 'mark-released', 'merge-forward',
    ]);
    expect(releaseCommit().actions).toEqual(['git.commit(message: "release {release.version}")']);
    expect(releaseCommit().checks).toBeUndefined();
  });

  it('still names the F5 test-results asset URL (the positive beside the new text)', () => {
    expect(flat(releaseCommit().description ?? '')).toContain(
      'https://github.com/wingfoil/wingfoil/releases/download/v{X.Y.Z}/test-results.md',
    );
  });

  it.each([
    'Formats read:',
    'Capabilities:',
    'Feature in a patch:',
    '### Breaking',
    '### Deprecated',
    'node scripts/changelog-section.cjs {release.version} --lines',
    'node scripts/changelog-section.cjs {release.version} --check',
    'spec-019 §8',
    'dl-213 (a)',
  ])('its flattened description contains %p', (text) => {
    expect(flat(releaseCommit().description ?? '')).toContain(text);
  });

  it('`version:` is 2.4 or later, with a 2.4 history entry naming task-363', () => {
    const { value, rest } = versionLine(raw);
    expect(value).toBeGreaterThanOrEqual(2.4);
    expect(historyEntry(rest, '2.4', 'task-363')).toBeDefined();
  });
});

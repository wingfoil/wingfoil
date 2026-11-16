/**
 * task-359-bind-vision-change-s-scoped-downcast-and-mandatory-release-exit-checks-before-cp-001-runs-dl-166, review
 * fix (the reviewer's two nits on `scripts/check-release-exit.cjs`), beside red's `test/cli/check-release-exit.test.ts`:
 *
 * - `.` (the root itself) is inside the repository: it is a directory, so the check refuses it as `no such file`
 *   (the design's exit-2 reason for a path naming no file), never as `outside the repository`;
 * - a release with no `status` field is past `draft` for the `features:` rule, and its line says `(no status)`
 *   instead of an empty `(status )`.
 *
 * Fixtures: git-less temporary roots holding this repository's committed `.wingfoil/memory.yaml`, a change-proposal and
 * a release built from the committed template and `minor-v0.4.md` (read at `HEAD`), and a one-row sequencer table.
 * Deterministic: fixed names and contents, no clock.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import { fixtureDirPrefix, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture } from './helpers/spawn-cli';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-release-exit.cjs');
const CP_PATH = 'docs/04_memory/change-proposals/cp-902-edge-fixture.md';
const MINOR_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.4.md';

const atHead = (path: string): string => execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8' });

/** Replace each `key: …` frontmatter line (`null` deletes it). */
function fill(document: string, fields: Readonly<Record<string, string | null>>): string {
  let out = document;
  for (const [key, value] of Object.entries(fields)) {
    const pattern = new RegExp(`^${key}:.*(?:\\n|$)`, 'm');
    if (!pattern.test(out)) throw new Error(`fixture: no ${key}: line`);
    out = out.replace(pattern, value === null ? '' : `${key}: ${value}\n`);
  }
  return out;
}

const SEQUENCER = ['| Release | Features | Budget | Source |', '|---|---|---|---|', '| v0.4 | 11 | ≈ 9 | ≈ 1 for P4.22 |', ''].join('\n');

const dirs: string[] = [];
afterAll(() => dirs.forEach(removeTempDir));

function project(release: string): string {
  const root = mkdtempSync(fixtureDirPrefix());
  dirs.push(root);
  writeFixtureFile(root, '.wingfoil/memory.yaml', atHead('.wingfoil/memory.yaml'));
  writeFixtureFile(root, 'docs/01_vision/07_sequencer.md', SEQUENCER);
  writeFixtureFile(
    root,
    CP_PATH,
    fill(atHead('.wingfoil/memory/templates/change-proposal.md'), {
      id: 'cp-902-edge-fixture',
      status: 'scheduled',
      kind: '"feature"',
      feature: '"P4.22"',
      release: '"v0.4"',
    }),
  );
  writeFixtureFile(root, MINOR_PATH, release);
  return root;
}

const check = (root: string, ...args: string[]): ReturnType<typeof spawnCapture> =>
  spawnCapture(process.execPath, [SCRIPT, ...args], { cwd: root });

describe('task-359 review fix — check-release-exit edges (the reviewer\'s nits)', () => {
  it('`.` is the root, inside the repository: refused as no such file, not as outside', () => {
    const root = project(fill(atHead(MINOR_PATH), { features: '[P4.22]' }));
    expect(check(root, '.')).toEqual({ status: 2, stdout: '', stderr: 'check-release-exit: .: no such file\n' });
  });

  it('a directory inside the root is refused as no such file too', () => {
    const root = project(fill(atHead(MINOR_PATH), { features: '[P4.22]' }));
    expect(check(root, 'docs')).toEqual({ status: 2, stdout: '', stderr: 'check-release-exit: docs: no such file\n' });
  });

  it('a release with no status: features: is required, and the line says (no status)', () => {
    const root = project(fill(atHead(MINOR_PATH), { status: null, features: '[P4.21]' }));
    expect(check(root, CP_PATH)).toEqual({
      status: 1,
      stdout: `${CP_PATH}: P4.22 is not in ${MINOR_PATH}'s features: (no status)\n`,
      stderr: '',
    });
  });

  it('a release with status in-development keeps the (status <s>) form', () => {
    const root = project(fill(atHead(MINOR_PATH), { status: 'in-development', features: '[P4.21]' }));
    expect(check(root, CP_PATH)).toEqual({
      status: 1,
      stdout: `${CP_PATH}: P4.22 is not in ${MINOR_PATH}'s features: (status in-development)\n`,
      stderr: '',
    });
  });
});

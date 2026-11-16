/**
 * task-359-bind-vision-change-s-scoped-downcast-and-mandatory-release-exit-checks-before-cp-001-runs-dl-166 AC 1
 * (red-first; `dl-166` Q2 (ii), approver ruling D3; `dl-132` element 4 and its note of 2026-10-12) —
 * `scripts/check-release-exit.cjs <path>`, the command `change-proposal.assigned` runs (`vision-change.schedule`'s
 * second post-check): the change-proposal at `<path>` may leave `schedule` only once its `release` is stamped, a
 * release element of that `version` exists, the release's row of `docs/01_vision/07_sequencer.md` names each of its
 * feature ids and, on a release past `draft`, the release's `features:` holds each of them.
 *
 * The interface, as the task's design states it (root = the working directory; read-only, no clock, no network):
 * - exit `0`, stdout empty;
 * - exit `1`, one stdout line per failure: `<path>: release is empty` | `<path>: no release element has version <v>`
 *   (each alone), else `<path>: docs/01_vision/07_sequencer.md has no row for <v>` (once, first), then per id in
 *   declared order `<path>: <id> is not in the <v> row of docs/01_vision/07_sequencer.md` and
 *   `<path>: <id> is not in <release path>'s features: (status <s>)`;
 * - exit `2`, stdout empty and one stderr line `check-release-exit: <reason>`: the usage line (no argument or more
 *   than one), `<path>: outside the repository`, `<path>: no such file`, `<path>: not a change-proposal`,
 *   `release <v>: <n> release elements`, or `<file>: no such file` for a missing `.wingfoil/memory.yaml` or sequencer.
 *
 * A row is the first Markdown table row whose first cell (`*` removed, trimmed) equals the release; an id is in it as a
 * whole token (`P4.22` is not in a row naming only `P4.221`). Feature ids are `feature` split on commas and whitespace,
 * or a YAML list; an empty `feature` (a `kind: vision` change) checks only the stamp and the release element.
 *
 * Fixtures: a temporary, git-less project root holding this repository's committed `.wingfoil/memory.yaml`, a
 * change-proposal built from `.wingfoil/memory/templates/change-proposal.md` (read at `HEAD`, its frontmatter filled),
 * release elements built from `docs/04_memory/planning/rl-v1/minor-v0.4.md` and `patch-v0.3.1.md` (read at `HEAD`,
 * `status:` and `features:` set per case) at the path `memory.yaml`'s `release.path` gives, and a sequencer holding the
 * heading, header and rows of `07_sequencer.md`'s "Active-day budgets per release" table, copied below (one row edited
 * per case to name an id). One live run reads this repository's own `cp-002`. The script is spawned, never imported,
 * so no declaration is needed. At red the script does not exist: every case fails on that absence (the first test
 * states it). Deterministic: fixed file names and contents, no clock.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { fixtureDirPrefix, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture } from './helpers/spawn-cli';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-release-exit.cjs');
const SEQUENCER = 'docs/01_vision/07_sequencer.md';

function atHead(path: string): string {
  return execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8' });
}

const MEMORY_YAML = atHead('.wingfoil/memory.yaml');
const CP_TEMPLATE = atHead('.wingfoil/memory/templates/change-proposal.md');
const MINOR_V04 = atHead('docs/04_memory/planning/rl-v1/minor-v0.4.md');
const PATCH_V031 = atHead('docs/04_memory/planning/rl-v1/patch-v0.3.1.md');

/** Set frontmatter fields (each `key: value` line replaced, its comment dropped). */
function fill(document: string, fields: Readonly<Record<string, string>>): string {
  let out = document;
  for (const [key, value] of Object.entries(fields)) {
    const pattern = new RegExp(`^${key}:.*$`, 'm');
    if (!pattern.test(out)) throw new Error(`fixture: no ${key}: line to fill`);
    out = out.replace(pattern, `${key}: ${value}`);
  }
  return out;
}

/**
 * The "Active-day budgets per release" table of `docs/01_vision/07_sequencer.md`, copied from
 * `git show 82967c42a:docs/01_vision/07_sequencer.md` (lines 65–75). `v04Source` replaces the v0.4 row's last cell,
 * so a case can make that row name an id.
 */
function sequencer(v04Source = 'proxy, 11 ÷ 14 × 12                                                            '): string {
  return [
    '# Sequencer — WingFoil MVP (v0.1 → v1.0)',
    '',
    '### Active-day budgets per release',
    '',
    "A budget is set by each release's own `release-planning`. Until a release has one, it carries",
    "`dl-096`'s proxy: v0.2's ≈ 12 active days for 14 features, scaled by the release's feature count.",
    '',
    '| Release | Features | Budget (active days)                                             | Source                                                                         |',
    '|---------|----------|------------------------------------------------------------------|--------------------------------------------------------------------------------|',
    "| v0.2.2  | —        | **≈ 2.2** by task count; ≈ 4 by `dl-096`'s proxy; expect nearer 4 | v0.2.2 `build-backlog`: 14 tasks ÷ 6.5 per active day; see the note below       |",
    '| v0.3    | 23       | **≈ 18.6** by task count; ≈ 66 by task size                     | v0.3 `build-backlog` (2026-09-30): 121 tasks ÷ 6.5 per active day; see the note below |',
    "| v0.3.1  | 1        | ≈ 1 for P4.21; the patch's own work is set by its `release-planning` | proxy, 1 ÷ 14 × 12 ≈ 0.9 (`cp-002`); see the note below                        |",
    `| v0.4    | 11       | ≈ 9                                                              | ${v04Source} |`,
    "| v1.0    | 3        | ≈ 5                                                              | the plan's own estimate; the proportional figure is ≈ 3                        |",
    '',
  ].join('\n');
}

/** The v0.4 row's last cell once `cp-001`'s `schedule` writes its entry (the shape of the v0.3.1 row's `cp-002`). */
const V04_NAMES_P4_22 = 'proxy, 11 ÷ 14 × 12; ≈ 1 for P4.22 (`cp-001`)';

const CP_PATH = 'docs/04_memory/change-proposals/cp-901-fixture-change-proposal.md';
const MINOR_PATH = 'docs/04_memory/planning/rl-v1/minor-v0.4.md';
const PATCH_PATH = 'docs/04_memory/planning/rl-v1/patch-v0.3.1.md';
const V04_FEATURES = 'P4.18, P4.19, P4.20, P4.21, P5.1.1, P5.1.4, P5.2.3';

function changeProposal(fields: { kind?: string; feature: string; release: string }): string {
  return fill(CP_TEMPLATE, {
    id: 'cp-901-fixture-change-proposal',
    title: '"Fixture change-proposal"',
    status: 'scheduled',
    kind: fields.kind ?? '"feature"',
    feature: fields.feature,
    target_release: fields.release,
    release: fields.release,
  });
}

function minorV04(status: string, features: string): string {
  return fill(MINOR_V04, { status, features: `[${features}]` });
}

const dirs: string[] = [];
afterAll(() => dirs.forEach(removeTempDir));

/** A git-less project root with this repository's memory.yaml (unless `withMemoryYaml` is false), the sequencer (unless null) and the given files. */
function project(files: Readonly<Record<string, string>>, sequencerContent: string | null = sequencer(), withMemoryYaml = true): string {
  const root = mkdtempSync(fixtureDirPrefix());
  dirs.push(root);
  if (withMemoryYaml) writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  if (sequencerContent !== null) writeFixtureFile(root, SEQUENCER, sequencerContent);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  return root;
}

function check(root: string, ...args: string[]): ReturnType<typeof spawnCapture> {
  return spawnCapture(process.execPath, [SCRIPT, ...args], { cwd: root });
}

/**
 * What a run did on exit 0 and 1: status, stdout and stderr. The orchestrator's ruling on red's ambiguity 3 (task-359
 * review fix): stderr is empty on both, so every exit 0 / 1 case expects `stderr: ''`.
 */
const outcome = (run: ReturnType<typeof spawnCapture>): { status: number; stdout: string; stderr: string } => ({
  status: run.status,
  stdout: run.stdout,
  stderr: run.stderr,
});
const lines = (...out: string[]): string => out.map((line) => `${line}\n`).join('');
const usage = 'check-release-exit: usage: node scripts/check-release-exit.cjs <path>\n';

describe('task-359 AC 1 — scripts/check-release-exit.cjs <path> (red-first, dl-166 Q2 (ii), D3)', () => {
  it('the script exists (the command change-proposal.assigned is bound to)', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  describe('exit 0, stdout empty', () => {
    it('a release past draft whose row names the id and whose features: holds it', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, sequencer(V04_NAMES_P4_22));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });

    it('a draft release: the row names the id, features: does not yet (not required before the release leaves draft)', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('draft', V04_FEATURES),
      }, sequencer(V04_NAMES_P4_22));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });

    it('a kind: vision change with an empty feature: only the stamp and the release element are checked', () => {
      const root = project({
        [CP_PATH]: changeProposal({ kind: '"vision"', feature: '""', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', V04_FEATURES),
      });
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });

    it('a released patch (the shape of cp-002 and patch-v0.3.1): its row names P4.21 and its features: holds it', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.21"', release: '"v0.3.1"' }),
        [PATCH_PATH]: PATCH_V031,
      });
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });

    it('feature as a YAML list, every id in the row and in features:', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '[P4.21, P4.22]', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, sequencer('proxy, 11 ÷ 14 × 12; P4.21 and P4.22 (`cp-001`)'));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });
  });

  describe('exit 1, one stdout line per failure', () => {
    it('release is empty (cp-001 today: no stamp yet)', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '""' }),
        [MINOR_PATH]: minorV04('in-development', V04_FEATURES),
      });
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 1, stdout: lines(`${CP_PATH}: release is empty`), stderr: '' });
    });

    it('no release element has the stamped version', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.5"' }),
        [MINOR_PATH]: minorV04('in-development', V04_FEATURES),
      });
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 1, stdout: lines(`${CP_PATH}: no release element has version v0.5`), stderr: '' });
    });

    // The orchestrator's ruling on red's ambiguity 1 (task-359 review fix): with no row, the no-row line is printed
    // once, first, then only the features: lines, never a per-id row line.
    it('the sequencer has no row for the release (draft): exactly the no-row line', () => {
      const v09 = fill(MINOR_V04, { id: '"minor-v0.9"', version: '"v0.9"', status: 'draft', features: '[]' });
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.9"' }),
        'docs/04_memory/planning/rl-v1/minor-v0.9.md': v09,
      });
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 1, stdout: lines(`${CP_PATH}: ${SEQUENCER} has no row for v0.9`), stderr: '' });
    });

    it('the sequencer has no row for the release (in-development): the no-row line, then only the features: line', () => {
      const v09 = fill(MINOR_V04, { id: '"minor-v0.9"', version: '"v0.9"', status: 'in-development', features: '[]' });
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.9"' }),
        'docs/04_memory/planning/rl-v1/minor-v0.9.md': v09,
      });
      expect(outcome(check(root, CP_PATH))).toEqual({
        status: 1,
        stdout: lines(
          `${CP_PATH}: ${SEQUENCER} has no row for v0.9`,
          `${CP_PATH}: P4.22 is not in docs/04_memory/planning/rl-v1/minor-v0.9.md's features: (status in-development)`,
        ),
        stderr: '',
      });
    });

    it('the id is in neither the row nor features: (cp-001 once stamped v0.4, today): two lines, row first', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', V04_FEATURES),
      });
      expect(outcome(check(root, CP_PATH))).toEqual({
        status: 1,
        stdout: lines(
          `${CP_PATH}: P4.22 is not in the v0.4 row of ${SEQUENCER}`,
          `${CP_PATH}: P4.22 is not in ${MINOR_PATH}'s features: (status in-development)`,
        ),
        stderr: '',
      });
    });

    it('a whole-token match: a row naming P4.221 does not name P4.22', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, sequencer('proxy, 11 ÷ 14 × 12; ≈ 1 for P4.221 (`cp-901`)'));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 1, stdout: lines(`${CP_PATH}: P4.22 is not in the v0.4 row of ${SEQUENCER}`), stderr: '' });
    });

    it('two ids "P4.21, P4.22", the second missing from the row: one line, for P4.22 only', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.21, P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, sequencer('proxy, 11 ÷ 14 × 12; ≈ 1 for P4.21'));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 1, stdout: lines(`${CP_PATH}: P4.22 is not in the v0.4 row of ${SEQUENCER}`), stderr: '' });
    });

    it('two ids, both missing from both: the lines per id in declared order, row before features:', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.23, P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', V04_FEATURES),
      });
      expect(outcome(check(root, CP_PATH))).toEqual({
        status: 1,
        stdout: lines(
          `${CP_PATH}: P4.23 is not in the v0.4 row of ${SEQUENCER}`,
          `${CP_PATH}: P4.23 is not in ${MINOR_PATH}'s features: (status in-development)`,
          `${CP_PATH}: P4.22 is not in the v0.4 row of ${SEQUENCER}`,
          `${CP_PATH}: P4.22 is not in ${MINOR_PATH}'s features: (status in-development)`,
        ),
        stderr: '',
      });
    });
  });

  describe('exit 2, stdout empty, one stderr line', () => {
    const valid = (): string =>
      project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, sequencer(V04_NAMES_P4_22));

    it('no argument: the usage line', () => {
      expect(check(valid())).toEqual({ status: 2, stdout: '', stderr: usage });
    });

    it('two arguments: the usage line', () => {
      expect(check(valid(), CP_PATH, CP_PATH)).toEqual({ status: 2, stdout: '', stderr: usage });
    });

    it('a path outside the repository', () => {
      expect(check(valid(), '../x.md')).toEqual({ status: 2, stdout: '', stderr: 'check-release-exit: ../x.md: outside the repository\n' });
    });

    it('a missing file', () => {
      const missing = 'docs/04_memory/change-proposals/cp-999-missing.md';
      expect(check(valid(), missing)).toEqual({ status: 2, stdout: '', stderr: `check-release-exit: ${missing}: no such file\n` });
    });

    it('a release element given as <path>: not a change-proposal', () => {
      expect(check(valid(), MINOR_PATH)).toEqual({ status: 2, stdout: '', stderr: `check-release-exit: ${MINOR_PATH}: not a change-proposal\n` });
    });

    it('two release elements with the same version', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
        'docs/04_memory/planning/rl-v2/minor-v0.4.md': minorV04('draft', ''),
      }, sequencer(V04_NAMES_P4_22));
      expect(check(root, CP_PATH)).toEqual({ status: 2, stdout: '', stderr: 'check-release-exit: release v0.4: 2 release elements\n' });
    });

    it('a missing sequencer', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, null);
      // The orchestrator's ruling on red's ambiguity 2 (task-359 review fix): named by its path relative to the root.
      expect(check(root, CP_PATH)).toEqual({ status: 2, stdout: '', stderr: `check-release-exit: ${SEQUENCER}: no such file\n` });
    });

    it('a missing .wingfoil/memory.yaml, named by its path relative to the root', () => {
      const root = project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, sequencer(V04_NAMES_P4_22), false);
      expect(check(root, CP_PATH)).toEqual({ status: 2, stdout: '', stderr: 'check-release-exit: .wingfoil/memory.yaml: no such file\n' });
    });
  });

  /*
   * The read confinement (task-359 review fix, orchestrator ruling): every file the script reads beyond `<path>` is
   * inside the root after realpath. A release-element candidate of the walk whose realpath is outside the root is
   * skipped, not counted; `.wingfoil/memory.yaml` or the sequencer whose realpath is outside gives exit 2, stdout
   * empty, stderr `check-release-exit: <relative path>: outside the repository` (the message `<path>` already uses).
   * The outside files live in a second temporary directory, beside the root.
   */
  describe('the read confinement: no file outside the root is read through a symbolic link', () => {
    /** A temporary directory outside every fixture root, holding `files`. */
    function outside(files: Readonly<Record<string, string>>): string {
      const dir = mkdtempSync(fixtureDirPrefix());
      dirs.push(dir);
      for (const [path, content] of Object.entries(files)) writeFixtureFile(dir, path, content);
      return dir;
    }

    /** A root that passes: v0.4 in-development, its row and its features: naming P4.22. */
    const passing = (seq: string | null = sequencer(V04_NAMES_P4_22), withMemoryYaml = true): string =>
      project({
        [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }),
        [MINOR_PATH]: minorV04('in-development', `${V04_FEATURES}, P4.22`),
      }, seq, withMemoryYaml);

    it('a release .md in the walk symlinked to an outside release of the same version is skipped, not counted', () => {
      const root = passing();
      const out = outside({ 'zz.md': minorV04('in-development', `${V04_FEATURES}, P4.22`) });
      symlinkSync(join(out, 'zz.md'), join(root, 'docs/04_memory/planning/rl-v1/zz.md'));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });

    it('the only release of the version reached through a symlink to an outside file: skipped, so no release element', () => {
      const root = project({ [CP_PATH]: changeProposal({ feature: '"P4.22"', release: '"v0.4"' }) }, sequencer(V04_NAMES_P4_22));
      const out = outside({ 'zz.md': minorV04('in-development', `${V04_FEATURES}, P4.22`) });
      mkdirSync(join(root, 'docs/04_memory/planning/rl-v1'), { recursive: true });
      symlinkSync(join(out, 'zz.md'), join(root, 'docs/04_memory/planning/rl-v1/zz.md'));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 1, stdout: lines(`${CP_PATH}: no release element has version v0.4`), stderr: '' });
    });

    it('a release-line directory in the walk symlinked to an outside directory: its release is skipped, not counted', () => {
      const root = passing();
      const out = outside({ 'minor-v0.4.md': minorV04('in-development', `${V04_FEATURES}, P4.22`) });
      symlinkSync(out, join(root, 'docs/04_memory/planning/rl-v9'));
      expect(outcome(check(root, CP_PATH))).toEqual({ status: 0, stdout: '', stderr: '' });
    });

    it('the sequencer symlinked to an outside file: exit 2, outside the repository', () => {
      const root = passing(null);
      const out = outside({ 'sequencer.md': sequencer(V04_NAMES_P4_22) });
      mkdirSync(join(root, 'docs/01_vision'), { recursive: true });
      symlinkSync(join(out, 'sequencer.md'), join(root, SEQUENCER));
      expect(check(root, CP_PATH)).toEqual({ status: 2, stdout: '', stderr: `check-release-exit: ${SEQUENCER}: outside the repository\n` });
    });

    it('.wingfoil/memory.yaml symlinked to an outside file: exit 2, outside the repository', () => {
      const root = passing(sequencer(V04_NAMES_P4_22), false);
      const out = outside({ 'memory.yaml': MEMORY_YAML });
      mkdirSync(join(root, '.wingfoil'), { recursive: true });
      symlinkSync(join(out, 'memory.yaml'), join(root, '.wingfoil/memory.yaml'));
      expect(check(root, CP_PATH)).toEqual({ status: 2, stdout: '', stderr: 'check-release-exit: .wingfoil/memory.yaml: outside the repository\n' });
    });
  });

  it('live, at the repository root: cp-002 (release v0.3.1, released, features: [P4.21]) passes', () => {
    const [cp002] = readdirSync(join(ROOT, 'docs/04_memory/change-proposals')).filter((name) => name.startsWith('cp-002-'));
    expect(cp002).toBeDefined();
    expect(outcome(check(ROOT, `docs/04_memory/change-proposals/${cp002}`))).toEqual({ status: 0, stdout: '', stderr: '' });
  });
});

/**
 * task-193 (`bug-019`, `bug-126`; approver ruling R20/Q9, "as `dl-062`") end to end through the REAL
 * compiled `dist/cli.js`, in a REAL `wingfoil init`-ed throwaway project:
 *
 * - the first `dna add team.agents` on the scaffold, which declares no `agents:`, keeps every comment
 *   (`bug-126`'s reproduction, verbatim);
 * - an in-place edit leaves every line outside the edited node byte-identical;
 * - a write the in-place editor cannot express is refused at exit 1 unless `--force`, and a forced
 *   rewrite prints task-169's `warning:` line on stderr while stdout stays the payload.
 *
 * The scenarios are `P2.1-dna-set.feature`'s three task-193 scenarios, labelled below. Spawned through
 * `./helpers/spawn-cli` (stderr captured on a 0-exit run too); `dist/` is built once by jest's
 * `globalSetup` (`bug-003`). Deterministic (REQ-SYS-07): fixed fixture text, fixed steps.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

const DNA_PATH = '.wingfoil/dna.yaml';

const CONFLICT = 'error: dna.yaml cannot be updated in place; edit paths.tests by hand, or pass --force to rewrite the whole file\n';
const WARNING =
  'dna.yaml was rewritten as a whole file (--force): comments are not kept, and neither are quoting, flow style, ' +
  'blank lines, line endings or number formatting (1.0 becomes 1)';

function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

function dnaText(repo: string): string {
  return readFileSync(join(repo, DNA_PATH), 'utf-8');
}

function commentLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trimStart().startsWith('#'));
}

/** The lines of `before` that `after` no longer carries, and the lines `after` added — a common prefix/suffix diff. */
function hunk(before: string, after: string): { removed: string[]; added: string[] } {
  const b = before.split('\n');
  const a = after.split('\n');
  let prefix = 0;
  while (prefix < b.length && prefix < a.length && b[prefix] === a[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < b.length - prefix && suffix < a.length - prefix && b[b.length - 1 - suffix] === a[a.length - 1 - suffix]) suffix += 1;
  return { removed: b.slice(prefix, b.length - suffix), added: a.slice(prefix, a.length - suffix) };
}

describe('`wingfoil dna` — keep dna.yaml\'s comments, or refuse the rewrite unless --force (task-193)', () => {
  let repo: string;
  let scaffold: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    expect(wingfoil(repo, 'init', '--template', 'scrum').status).toBe(0);
    scaffold = dnaText(repo);
  });

  afterEach(() => removeTempDir(repo));

  // P2.1 "Comments survive adding the first entry of a collection dna.yaml does not declare yet".
  it('bug-126: the first `dna add team.agents` keeps every comment, adding the entry\'s lines and changing none', () => {
    expect(scaffold).not.toMatch(/^\s*agents:/m); // guard: the scaffold declares no agents
    expect(commentLines(scaffold).length).toBeGreaterThan(0);

    const run = wingfoil(repo, 'dna', 'add', 'team.agents', '--value', 'claude', '--entry-executes_as', 'developer,reviewer', '--entry-approval_authority', 'false');

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    const after = dnaText(repo);
    expect(commentLines(after)).toEqual(commentLines(scaffold));
    const { removed, added } = hunk(scaffold, after);
    expect(removed).toEqual([]);
    expect(added).toEqual(['  agents:', '    - name: claude', '      executes_as: [developer, reviewer]', '      approval_authority: false']);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(dna): add team.agents claude');
  });

  it('(characterization) an in-place edit is byte-identical outside the edited node', () => {
    const run = wingfoil(repo, 'dna', 'set', 'project.name', '--value', 'Demo');

    expect(run.status).toBe(0);
    const { removed, added } = hunk(scaffold, dnaText(repo));
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(/^ {2}name: ""/);
    // The one changed line is the edited node: the new value, with the inline comment kept at its column.
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^ {2}name: Demo +# your project name$/);
    expect(added[0]!.indexOf('#')).toBe(removed[0]!.indexOf('#'));
  });

  describe('a file the in-place editor cannot edit (`paths` written as a flow mapping)', () => {
    let flow: string;

    beforeEach(() => {
      flow = scaffold.replace(/^paths:\n(?: {2}.*\n)+/m, 'paths: { sources: [src/], runs: [docs/runs/] }\n');
      expect(flow).not.toBe(scaffold); // guard: the fixture rewrite matched
      writeFileSync(join(repo, DNA_PATH), flow, 'utf-8');
      git(repo, ['add', DNA_PATH]);
      git(repo, ['commit', '--quiet', '-m', 'fixture: flow-mapping paths']);
    });

    // P2.1 "Error - dna.yaml cannot be edited in place".
    it('without --force: exit 1, the refusal on stderr, file and HEAD unchanged', () => {
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const run = wingfoil(repo, 'dna', 'add', 'paths.tests', '--value', 'test/');

      expect(run.status).toBe(1);
      expect(run.stderr).toBe(CONFLICT);
      expect(run.stdout).toBe('');
      expect(git(repo, ['status', '--porcelain'])).toBe('');
      expect(gitOut(repo, ['rev-parse', 'HEAD'])).toBe(before);
      expect(dnaText(repo)).toBe(flow);
    });

    // P2.1 "Rewrite dna.yaml as a whole file with --force".
    it('with --force: exit 0, one wf(dna) commit holding only dna.yaml, and a `warning:` line on stderr', () => {
      const before = gitOut(repo, ['rev-parse', 'HEAD']);
      const run = wingfoil(repo, 'dna', 'add', 'paths.tests', '--value', 'test/', '--force');

      expect(run.status).toBe(0);
      expect(run.stderr).toBe(`warning: ${WARNING}\n`);
      expect(JSON.parse(run.stdout)).toEqual({ key: 'paths.tests', value: 'test/' });
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(dna): add paths.tests test/');
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(DNA_PATH);
      expect(commentLines(dnaText(repo))).toEqual([]);
    });

    it('with --force under --format json: stdout is the payload, the warning one JSON document on stderr', () => {
      const run = wingfoil(repo, 'dna', 'add', 'paths.tests', '--value', 'test/', '--force', '--format', 'json');

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({ key: 'paths.tests', value: 'test/' });
      expect(JSON.parse(run.stderr)).toEqual({ warning: WARNING });
    });

    it('with --force under --format yaml: stdout is the payload, the warning one YAML document on stderr', () => {
      const run = wingfoil(repo, 'dna', 'add', 'paths.tests', '--value', 'test/', '--force', '--format', 'yaml');

      expect(run.status).toBe(0);
      expect(load(run.stdout)).toEqual({ key: 'paths.tests', value: 'test/' });
      expect(load(run.stderr)).toEqual({ warning: WARNING });
    });
  });
});

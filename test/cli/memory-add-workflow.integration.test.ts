/**
 * task-227 — `memory add --workflow <ref> [--step <key>]` through the REAL compiled `dist/cli.js`
 * (`spec-008` §12, `spec-017` §7.10, §10): what only the process boundary shows — that both options are
 * registered and advertised by `--help`, that following the command `workflow next` prints links the element,
 * and the exit codes (a refusal is exit 1, `--step` without `--workflow` exit 2). `dist/` is built once by
 * jest's `globalSetup`.
 */
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1
types:
  bug:
    path: "docs/bug/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    template:
      file: "memory/templates/bug.md"
      frontmatter:
        required: [title]
    states:
      sequence: [ draft, open, closed ]
  plan:
    path: "docs/plan/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      file: "memory/templates/plan.md"
      frontmatter:
        required: [title]
    states:
      sequence: [ draft, active, done ]
`;

const TEMPLATE = (type: string): string => `---\nid: ""\ntype: ${type}\ntitle: ""\nstatus: draft\n---\n\n<!-- body -->\n`;

const CAPTURE = `name: capture
kind: main
description: Capture one bug.
phases:
  - name: record
    actions:
      - 'memory.add(type: bug)'
      - memory.submit
`;

function wingfoil(cwd: string, ...args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

describe('wingfoil memory add --workflow / --step (task-227, spec-008 §12)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/memory/templates/bug.md', TEMPLATE('bug'));
    writeFixtureFile(repo, '.wingfoil/memory/templates/plan.md', TEMPLATE('plan'));
    writeFixtureFile(repo, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/capture.yaml\n');
    writeFixtureFile(repo, '.wingfoil/workflows/custom/capture.yaml', CAPTURE);
    writeFixtureFile(
      repo,
      'docs/plan/cap-1.md',
      '---\nid: "cap-1"\ntype: plan\ntitle: "cap-1"\nstatus: active\nworkflow: "capture"\nphase: "x"\nelement: ""\n---\n',
    );
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  it('--help advertises both options', () => {
    const run = wingfoil(repo, 'memory', 'add', '--help');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/--workflow <ref>/);
    expect(run.stdout).toMatch(/--step <key>/);
  });

  it('the command `workflow next` prints, with a title, links the bug (exit 0)', () => {
    const next = wingfoil(repo, 'workflow', 'next', '--format', 'json');
    expect(next.status).toBe(0);
    const argv = (JSON.parse(next.stdout) as { next: { actions: { binding: { argv?: string[] } }[] } }).next.actions[0]!.binding.argv!;
    expect(argv).toEqual(['wingfoil', 'memory', 'add', '--type', 'bug', '--title', '<title>', '--workflow', 'cap-1', '--step', 'capture.record']);
    const run = wingfoil(repo, ...argv.slice(1).map((arg) => (arg === '<title>' ? 'Broken link' : arg)), '--format', 'json');
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(git(repo, ['log', '-1', '--format=%(trailers:key=WingFoil-Instance,key=WingFoil-Step)']).trim()).toBe(
      'WingFoil-Instance: cap-1\nWingFoil-Step: capture.record',
    );
  });

  it('a step that adds no such type is exit 1 with one error line', () => {
    writeFixtureFile(repo, '.wingfoil/memory.yaml', `${MEMORY_YAML}  note:\n    path: "docs/note/{id}.md"\n    id_pattern: "note-{n}-{slug}"\n    template:\n      file: "memory/templates/note.md"\n`);
    writeFixtureFile(repo, '.wingfoil/memory/templates/note.md', TEMPLATE('note'));
    commitAll(repo, 'a note type');
    const run = wingfoil(repo, 'memory', 'add', '--type', 'note', '--title', 'N', '--workflow', 'cap-1');
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('error: no step of cap-1 adds a note\n');
  });

  it('--step without --workflow is exit 2', () => {
    const before = git(repo, ['rev-parse', 'HEAD']).trim();
    const run = wingfoil(repo, 'memory', 'add', '--type', 'bug', '--title', 'B', '--step', 'capture.record');
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^error: missing required argument: --workflow\n/);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });
});

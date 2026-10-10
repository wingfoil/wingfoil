/**
 * task-217 — `wingfoil workflow start` and `wingfoil workflow end` on the compiled CLI (`spec-017` §7.1, §7.2,
 * §10; `spec-008` §1, §5, §7, §10; BDD P4.2, P4.3): the exit codes and the bytes a user sees. The operations'
 * own cases are `test/core/workflow-start-end.test.ts`.
 *
 * - BDD P4.2 sc. 1 / P4.3 sc. 1 with the positional `<name>`: exit 0 and the console view.
 * - BDD P4.2 sc. 3 / P4.3 sc. 3: exit 1 with the message, nothing written.
 * - `spec-017` §10's usage row: a missing `<name>`, a malformed `--element`, a `--set` name other than
 *   `phase` / `scope` and a second positional exit 2 before anything is read.
 * - AC 5: a freshly `init`-ed project can `workflow start` with no edit (its `memory.yaml` declares `plan`).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  plan:
    path: "docs/plans/{scope}/{id}.md"
    id_pattern: "{workflow}-{phase}-plan"
    template:
      frontmatter:
        required: [ title, workflow, phase ]
      file: "memory/templates/plan.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

const PLAN_TEMPLATE = '---\nid: ""\ntype: plan\ntitle: ""\nstatus: draft\nworkflow: ""\nphase: ""\nelement: ""\nparent: ""\n---\n\n## Steps\n';

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Alex
      email: alex@example.invalid
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
phases:
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

const REPORT = `name: report
startable: true
phases:
  - name: note
    role: developer
    produces: [ "README.md" ]
`;

const DEV_LOOP = `name: dev-loop
kind: sub
phases:
  - name: red
    role: developer
`;

function writeProject(root: string): void {
  writeFixtureFile(
    root,
    '.wingfoil/workflows.yaml',
    'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/report.yaml\n  - workflows/custom/dev-loop.yaml\n',
  );
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/report.yaml', REPORT);
  writeFixtureFile(root, '.wingfoil/workflows/custom/dev-loop.yaml', DEV_LOOP);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/plan.md', PLAN_TEMPLATE);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: []\nglobal: []\n');
  writeFixtureFile(root, 'README.md', '# Fixture\n');
  writeFixtureFile(root, 'docs/releases/minor-1.md', '---\nid: "minor-1"\ntype: release\ntitle: "minor-1"\nstatus: in-development\n---\n');
  commitAll(root, 'fixture');
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();

describe('task-217 — wingfoil workflow start / end on the compiled CLI', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeProject(repo);
  });
  afterEach(() => removeTempDir(repo));

  it('BDD P4.2 sc. 1 — exit 0; the console names the instance and its first step', () => {
    const run = runCliEntry(repo, ['workflow', 'start', 'release-cycle', '--element', 'release:minor-1']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('started release-cycle as release-cycle-minor-1-plan (active)');
    expect(run.stdout).toContain('next step: release-cycle.ship@release:minor-1');
  });

  it('--format json parses as StartResult', () => {
    const run = runCliEntry(repo, ['workflow', 'start', 'report', '--format', 'json']);
    expect(run.status).toBe(0);
    const value = JSON.parse(run.stdout) as { baseline: { rev: string }; instance: { id: string }; commits: string[] };
    expect(value.baseline.rev).toBe('HEAD');
    expect(value.instance.id).toBe('report-1-plan');
    expect(value.commits).toHaveLength(2);
  });

  it('BDD P4.2 sc. 3 — a sub workflow: exit 1, the message, nothing written', () => {
    const before = head(repo);
    const run = runCliEntry(repo, ['workflow', 'start', 'dev-loop']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: cannot start a sub workflow directly: dev-loop\n']);
    expect(head(repo)).toBe(before);
  });

  it('BDD P4.3 sc. 1 — `workflow end` closes the complete active instance: exit 0', () => {
    expect(runCliEntry(repo, ['workflow', 'start', 'report']).status).toBe(0);
    const run = runCliEntry(repo, ['workflow', 'end']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('ended report (report-1-plan)');
    expect(run.stdout).toContain('active: none');
    expect(git(repo, ['log', '-1', '--format=%s']).trim()).toBe('wf(plan): finalize report-1-plan [active → done]');
  });

  it('BDD P4.3 sc. 3 — no open instance: exit 1, "no active workflow to end"', () => {
    const run = runCliEntry(repo, ['workflow', 'end']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: no active workflow to end\n']);
  });

  it('an incomplete instance: exit 1, the current step, and the `memory deprecate` hint', () => {
    expect(runCliEntry(repo, ['workflow', 'start', 'release-cycle', '--element', 'release:minor-1']).status).toBe(0);
    const run = runCliEntry(repo, ['workflow', 'end']);
    expect([run.status, run.stdout]).toEqual([1, '']);
    expect(run.stderr).toBe(
      "error: workflow 'release-cycle' is not complete: current step release-cycle.ship@release:minor-1\n" +
        'hint: wingfoil memory deprecate release-cycle-minor-1-plan abandons it\n',
    );
  });

  it.each([
    ['a missing <name>', ['workflow', 'start'], 'error: missing required argument: <name>\n'],
    ['a malformed --element', ['workflow', 'start', 'release-cycle', '--element', 'minor-1'], 'error: malformed element-ref "minor-1": expected <type>:<id>\n'],
    ['a --set name other than phase or scope', ['workflow', 'start', 'report', '--set', 'workflow=x'], 'error: invalid flag value: --set workflow: workflow start sets only phase and scope\n'],
    ['a --set with no =', ['workflow', 'start', 'report', '--set', 'phase'], 'error: invalid flag value: --set expects <name>=<value>, got "phase"\n'],
    ['a second positional to start', ['workflow', 'start', 'report', 'extra'], 'error: wingfoil workflow start takes one positional <name> (got 2 positionals)\n'],
    ['a second positional to end', ['workflow', 'end', 'report', 'extra'], 'error: wingfoil workflow end takes one positional <ref> (got 2 positionals)\n'],
  ])('%s: exit 2, nothing written', (_label, args, stderrStart) => {
    const before = head(repo);
    const run = runCliEntry(repo, args);
    expect([run.status, run.stdout]).toEqual([2, '']);
    expect(run.stderr.startsWith(stderrStart)).toBe(true);
    expect(head(repo)).toBe(before);
  });
});

describe('task-217 AC 5 — a freshly init-ed project can workflow start without edits', () => {
  it('init --template Kanban, then workflow start sw-life-cycle: exit 0, a plan the scaffold declares', () => {
    const repo = makeTempGitRepo();
    try {
      const init = runCliEntry(repo, ['init', '--template', 'Kanban']);
      expect(init.status).toBe(0);
      const memoryYaml = readFileSync(join(repo, '.wingfoil/memory.yaml'), 'utf-8');
      expect(memoryYaml).toMatch(/^ {2}plan:$/m);

      const run = runCliEntry(repo, ['workflow', 'start', 'sw-life-cycle', '--format', 'json']);
      expect([run.status, run.stderr]).toEqual([0, '']);
      const value = JSON.parse(run.stdout) as { instance: { id: string; planStatus: string; active: boolean } };
      expect(value.instance).toMatchObject({ id: 'sw-life-cycle-1-plan', planStatus: 'active', active: true });
      expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
    } finally {
      removeTempDir(repo);
    }
  });
});

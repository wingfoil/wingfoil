/**
 * task-216 — `wingfoil workflow next` on the compiled CLI (`spec-017` §7.3, §10; BDD P4.4): the exit codes and
 * the bytes a user sees. The operation's own cases are `test/core/workflow-next.test.ts`.
 *
 * - BDD P4.4 sc. 1: the console view names the step, its element, its role and the role's directives.
 * - BDD P4.4 sc. 3 / no open instance: exit 0 with the message.
 * - `spec-017` §10: an unknown `<ref>` exits 1; a second positional exits 2; `--format json` parses.
 */
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, in-development, released ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

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

const MAIN = `name: release-cycle
startable: true
element: release
phases:
  - name: ship
    role: developer
    actions:
      - element.set_state(released)
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

function writeProject(root: string, releaseStatus: string | null): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', MAIN);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  if (releaseStatus !== null) {
    writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', releaseStatus));
    writeFixtureFile(root, 'docs/plans/rc-1.md', element('plan', 'rc-1', 'active', 'workflow: "release-cycle"\nphase: "x"\nelement: "minor-1"\n'));
  }
  commitAll(root, 'fixture');
}

describe('task-216 — wingfoil workflow next on the compiled CLI', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    writeProject(repo, 'in-development');
  });
  afterAll(() => removeTempDir(repo));

  it('BDD P4.4 sc. 1 — console: exit 0, the step, its element, its role and the role directives', () => {
    const run = runCliEntry(repo, ['workflow', 'next']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('next step: release-cycle.ship@release:minor-1');
    expect(run.stdout).toContain('scope: release:minor-1 (in-development)');
    expect(run.stdout).toContain('role: developer — held by Alex');
    expect(run.stdout).toContain('directives: testing');
    expect(run.stdout).toContain('- element.set_state(released) [manual: expects wf(release): finalize minor-1 [in-development → released]]');
  });

  it('--format json parses, with next and the baseline', () => {
    const run = runCliEntry(repo, ['workflow', 'next', '--format', 'json']);
    expect(run.status).toBe(0);
    const value = JSON.parse(run.stdout) as { baseline: { rev: string }; next: { key: string } };
    expect(value.baseline.rev).toBe('HEAD');
    expect(value.next.key).toBe('release-cycle.ship@release:minor-1');
  });

  it('spec-017 §10 — a <ref> naming no workflow and no open instance: exit 1, "unknown workflow: ghost"', () => {
    const run = runCliEntry(repo, ['workflow', 'next', 'ghost']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: unknown workflow: ghost\n']);
  });

  it('a second positional: exit 2', () => {
    const run = runCliEntry(repo, ['workflow', 'next', 'release-cycle', 'extra']);
    expect([run.status, run.stdout]).toEqual([2, '']);
    expect(run.stderr).toBe('error: wingfoil workflow next takes one positional <ref> (got 2 positionals)\n');
  });
});

describe('task-216 — BDD P4.4 sc. 3 and no open instance on the compiled CLI', () => {
  it("sc. 3 — exit 0, \"no next step: workflow 'release-cycle' is complete\"", () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, 'released');
      const run = runCliEntry(repo, ['workflow', 'next']);
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect(run.stdout).toContain("no next step: workflow 'release-cycle' is complete\n");
    } finally {
      removeTempDir(repo);
    }
  });

  it('no open instance — exit 0, "no open workflows"', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, null);
      const run = runCliEntry(repo, ['workflow', 'next']);
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect(run.stdout.split('\n')[0]).toBe('no open workflows');
    } finally {
      removeTempDir(repo);
    }
  });
});

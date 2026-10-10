/**
 * task-225 — `wingfoil workflow status` on the compiled CLI (`spec-017` §7.4, §10; BDD P4.5, P4.14 sc. 3): the
 * exit codes and the bytes a user sees. The operation's own cases are `test/core/workflow-status.test.ts`.
 *
 * - BDD P4.5 sc. 1: the console view lists both open workflows, marks the active one, shows the pending approval.
 * - BDD P4.5 sc. 2: `--format json` and `--format yaml` print a valid document of that format.
 * - BDD P4.5 sc. 3: no open workflow: exit 0, `no open workflows`.
 * - BDD P4.14 sc. 3: an approval routed to nobody is reported, exit 0.
 * - `spec-017` §10: an unknown `<ref>` exits 1; a second positional exits 2.
 */
import { load as yamlLoad } from 'js-yaml';

import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry } from './helpers/spawn-cli';

const MEMORY_YAML = `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
    states:
      sequence: [ draft, planning, active ]
      gates:
        planning: { reject: draft }
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;

function dnaYaml(approver: string): string {
  return `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Morgan
      email: morgan@example.invalid
      roles: [ ${approver} ]
  roles:
    - name: developer
    - name: approver
paths:
  sources: [ src/ ]
`;
}

/** A main with a gate on its element: `approve` awaits while the release is `planning`. */
const MAIN = `name: release-line
startable: true
element: release
phases:
  - name: approve
    role: developer
    actions:
      - memory.approve
    approval: { by_role: approver }
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The configuration plus, per entry of `open`, a release and an open plan on it, each in its own commit. */
function writeProject(root: string, open: readonly [string, string][], approver = 'approver'): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-line.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-line.yaml', MAIN);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', dnaYaml(approver));
  writeFixtureFile(root, '.wingfoil/roles.yaml', 'version: 1.0\nassignments:\n  developer: [ testing ]\nglobal: []\n');
  writeFixtureFile(root, '.wingfoil/directives/custom/testing.md', '---\nid: testing\nname: "Testing"\ntype: directive\nkind: custom\ntitle: "Testing"\n---\n\n# Testing\n');
  commitAll(root, 'fixture');
  for (const [release, status] of open) {
    writeFixtureFile(root, `docs/releases/${release}.md`, element('release', release, status));
    writeFixtureFile(root, `docs/plans/rl-${release}.md`, element('plan', `rl-${release}`, 'active', `workflow: "release-line"\nphase: "x"\nelement: "${release}"\n`));
    commitAll(root, `wf(plan): add rl-${release}`);
  }
}

describe('task-225 — wingfoil workflow status on the compiled CLI (BDD P4.5)', () => {
  let repo: string;
  beforeAll(() => {
    repo = makeTempGitRepo();
    // Two open workflows, one pending approval among them (minor-1 planning; minor-2 is active already).
    writeProject(repo, [
      ['minor-1', 'planning'],
      ['minor-2', 'active'],
    ]);
  });
  afterAll(() => removeTempDir(repo));

  it('sc. 1 — console: exit 0, both open workflows listed, the active one marked, the 1 pending approval shown', () => {
    const run = runCliEntry(repo, ['workflow', 'status']);
    expect([run.status, run.stderr]).toEqual([0, '']);
    expect(run.stdout).toContain('* rl-minor-2 (release-line) — active');
    expect(run.stdout).toContain('  rl-minor-1 (release-line)');
    expect(run.stdout).toContain('pending approvals: 1');
    expect(run.stdout).toContain('human needed: approve or reject minor-1 — routed to Morgan <morgan@example.invalid> (rl-minor-1, release-line.approve@release:minor-1)');
  });

  it.each(['json', 'yaml'])('sc. 2 — --format %s prints a valid document with the StatusResult fields', (format) => {
    const run = runCliEntry(repo, ['workflow', 'status', '--format', format]);
    expect([run.status, run.stderr]).toEqual([0, '']);
    const value = (format === 'json' ? JSON.parse(run.stdout) : yamlLoad(run.stdout)) as { active: string; open: unknown[]; pendingApprovals: unknown[] };
    expect(value.active).toBe('rl-minor-2');
    expect(value.open).toHaveLength(2);
    expect(value.pendingApprovals).toHaveLength(1);
  });

  it('spec-017 §10 — a <ref> naming no workflow and no open instance: exit 1, "unknown workflow: ghost"', () => {
    const run = runCliEntry(repo, ['workflow', 'status', 'ghost']);
    expect([run.status, run.stdout, run.stderr]).toEqual([1, '', 'error: unknown workflow: ghost\n']);
  });

  it('a second positional: exit 2', () => {
    const run = runCliEntry(repo, ['workflow', 'status', 'release-line', 'extra']);
    expect([run.status, run.stdout]).toEqual([2, '']);
    expect(run.stderr).toBe('error: wingfoil workflow status takes one positional <ref> (got 2 positionals)\n');
  });
});

describe('task-225 — BDD P4.5 sc. 3 and P4.14 sc. 3 on the compiled CLI', () => {
  it('P4.5 sc. 3 — no open workflows: exit 0, "no open workflows"', () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, []);
      const run = runCliEntry(repo, ['workflow', 'status']);
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect(run.stdout.split('\n')[0]).toBe('no open workflows');
    } finally {
      removeTempDir(repo);
    }
  });

  it("P4.14 sc. 3 — no member holds the role: exit 0, the routing error reported", () => {
    const repo = makeTempGitRepo();
    try {
      writeProject(repo, [['minor-1', 'planning']], 'developer');
      const run = runCliEntry(repo, ['workflow', 'status']);
      expect([run.status, run.stderr]).toEqual([0, '']);
      expect(run.stdout).toContain("human needed: approve or reject minor-1 — routed to no approver found for role 'approver' in dna.yaml");
    } finally {
      removeTempDir(repo);
    }
  });
});

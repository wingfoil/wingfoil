/**
 * task-268 (`bug-291`, same class) — `scripts/check-governance.cjs` on signed commits, with
 * `log.showSignature` off and on.
 *
 * The check's four `git log` readers (the commit walk, the touched paths, the renames and the commit
 * that added the script) pass `--no-show-signature`, so the report is the same whichever way the option
 * is set (the gated `schedule` subject keeps the exit at 1 either way); and a name that is not a full sha — what a `git` ignoring the flag prints — is a failure to
 * run (exit 2), never a commit the check reasons about. The git configuration is isolated
 * (`isolateGitConfig`): no global or system configuration of the developer is read or written.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import type { GovernanceReport } from '../../scripts/check-governance.cjs';
import { removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { installSignatureForcingGit, isolatedGit, isolateGitConfig, makeSignedRepo, setShowSignature } from '../storage/helpers/signed-commits';
import { spawnCapture } from './helpers/spawn-cli';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'check-governance.cjs');
const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/{release}/{id}.md"
    states:
      sequence: [draft, pending, backlog]
      gates:
        pending: { reject: draft }
`;

const DNA_YAML = `version: 1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${APPROVER.name}
      email: ${APPROVER.email}
      roles: [ approver ]
  roles:
    - name: approver
paths:
  sources: [ src/ ]
`;

function commit(root: string, message: string): void {
  isolatedGit(root, ['add', '-A']);
  execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_NAME: APPROVER.name, GIT_AUTHOR_EMAIL: APPROVER.email, GIT_COMMITTER_NAME: APPROVER.name, GIT_COMMITTER_EMAIL: APPROVER.email },
  });
}

function task(status: string): string {
  return `---\nid: "t-1"\ntype: task\ntitle: "Task t-1"\nstatus: ${status}\n---\n\nBody of t-1 at ${status}.\n`;
}

describe('task-268 — check-governance is independent of log.showSignature (bug-291 class)', () => {
  let restore: () => void = () => undefined;
  let root = '';

  beforeAll(() => {
    restore = isolateGitConfig();
    root = makeSignedRepo();
    writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(root, 'scripts/check-governance.cjs', '// the introduction commit\n');
    commit(root, 'chore: configure wingfoil');
    writeFixtureFile(root, 'docs/memory/v1/t-1.md', task('draft'));
    commit(root, 'wf(task): add t-1');
    writeFixtureFile(root, 'docs/memory/v1/t-1.md', task('pending'));
    commit(root, 'wf(task): submit t-1');
    isolatedGit(root, ['mv', 'docs/memory/v1', 'docs/memory/v2']);
    commit(root, 'chore: move t-1');
    writeFixtureFile(root, 'docs/memory/v2/t-1.md', task('backlog'));
    commit(root, `wf(task): approve t-1 [pending → backlog]\n\nApprover: ${APPROVER.name} <${APPROVER.email}> (approver)\nReason: Ready.`);
    commit(root, 'wf(task): schedule t-1');
  });

  afterAll(() => {
    removeTempDir(root);
    restore();
  });

  it('reports the same with log.showSignature on as with it off, and the fixture exercises every reader', () => {
    // Spawned with `env: process.env`, so the script's git sees the isolated configuration (the in-process
    // `checkGovernance` would spawn git with node's own environment: see signed-commits.ts).
    const report = (): { status: number; json: GovernanceReport } => {
      const run = spawnCapture('node', [SCRIPT, '--root', root, '--json'], { env: process.env });
      return { status: run.status, json: JSON.parse(run.stdout) as GovernanceReport };
    };
    setShowSignature(root, false);
    const { status, json: off } = report();
    expect(status).toBe(1);
    setShowSignature(root, true);
    expect(isolatedGit(root, ['log', '-1', '--format=%H'])).toMatch(/signature/i);
    expect(report()).toEqual({ status: 1, json: off });
    expect(off.checked).toBe(4);
    expect(off.introducedAt).toMatch(/^[0-9a-f]{40}$/);
    expect(off.findings.map((finding) => finding.rule)).toEqual(['subject']);
  });

  it('a git that prints signature text despite --no-show-signature: exit 2 with the name, never a report', () => {
    setShowSignature(root, true);
    const uninstall = installSignatureForcingGit();
    try {
      const run = spawnCapture('node', [SCRIPT, '--root', root], { env: process.env });
      expect(run.status).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toMatch(/^error: git log .* printed "No signature.*" where a commit name was expected$/m);
    } finally {
      uninstall();
    }
  });
});

/**
 * task-333 AC 5 (`dl-220` Q2 (b), Action 3; `spec-006` §7 "Membership" as amended at the design gate; design D1–D3)
 * — every mutating command but `init` refuses, through the REAL compiled `dist/cli.js`, a git identity that is not a
 * `team.members` entry of the `dna.yaml` committed at `HEAD`: exit 1, stderr exactly the `E_NOT_A_MEMBER` line and its
 * `hint:` line, nothing written.
 *
 * The operations are **derived from the registry** — every `mutates: true` operation of `CORE_MODULES`, none
 * excluded — and {@link ROWS} must name exactly those, so an operation added later fails here until it has a row.
 * Each row runs on one project where every row's command succeeds for the member (the fixture of
 * `test/cli/dry-run.integration.test.ts`, rebuilt here: that suite exports nothing): first as the member with
 * `--dry-run` (exit 0, it passes the step), then as the stranger (`GIT_AUTHOR_*` / `GIT_COMMITTER_*` naming
 * `Sam Stranger <stranger@example.invalid>`), for real.
 *
 * The positive cases of D1: a committed `team.members: []` (the `init` scaffold) refuses nobody, and `init` itself
 * never takes the step.
 *
 * Red until `requireTeamMembership` lands: today the stranger's command exits 0 and commits. The member rows, the
 * empty-team case and the `init` case pass today. Child environments start from `process.env` minus the
 * `spec-018` §1 markers. `dist/` is built once by jest's `globalSetup`. Deterministic: fixed steps and fixture text.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, enumerateOperations } from '../../src/core';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { notAMemberRefusal, STRANGER } from '../core/helpers/l0-fixture';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 120_000;

const STRANGER_ENV = {
  GIT_AUTHOR_NAME: STRANGER.name,
  GIT_AUTHOR_EMAIL: STRANGER.email,
  GIT_COMMITTER_NAME: STRANGER.name,
  GIT_COMMITTER_EMAIL: STRANGER.email,
};

function wingfoil(cwd: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...withoutAgentMarkers(process.env), ...extra } as NodeJS.ProcessEnv });
}

/** A fixture step that must succeed, as the member. */
function step(repo: string, ...args: string[]): void {
  const run = wingfoil(repo, args);
  if (run.status !== 0) throw new Error(`fixture bug: wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
}

const STRANGER_STDERR = (() => {
  const { error, hint } = notAMemberRefusal(STRANGER);
  return `error: ${error}\nhint: ${hint}\n`;
})();

/**
 * A project every mutating operation can run in, as `test/cli/dry-run.integration.test.ts` builds it: the git identity
 * `WingFoil Test` is the one `team.members` entry (`approver`); `bug` has a machine with a `returns` edge; one document
 * per transition verb in the state that verb leaves; a custom directive nothing references; a module; an agent with
 * the fake adapter; workflows for `start`/`end`/`finalize`/`adopt`/`rekey`/`remove`.
 */
function buildFixture(): string {
  const repo = makeTempGitRepo();
  step(repo, 'init', '--template', 'Kanban');
  const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
  writeFileSync(
    dnaPath,
    readFileSync(dnaPath, 'utf-8').replace('  members: []', '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [approver]'),
  );
  const memoryPath = join(repo, '.wingfoil', 'memory.yaml');
  const memoryYaml = readFileSync(memoryPath, 'utf-8');
  const commented = [
    '    # states:',
    '    #   sequence: [ draft, open, in-progress, resolved, closed ]',
    '    #   gates:',
    '    #     open: { reject: closed }',
    '    #     resolved: { reject: in-progress }',
    '    #   returns: { in-progress: open }    # memory park: back to open, with a reason',
  ].join('\n');
  if (!memoryYaml.includes(commented)) throw new Error('fixture bug: the scaffolded bug machine example moved');
  const uncommented = [
    '    states:',
    '      sequence: [ draft, open, in-progress, resolved, closed ]',
    '      gates:',
    '        open: { reject: closed }',
    '        resolved: { reject: in-progress }',
    '      returns: { in-progress: open }',
  ].join('\n');
  writeFileSync(memoryPath, memoryYaml.replace(commented, uncommented));
  const dna = readFileSync(dnaPath, 'utf-8').replace(/^ {2}agents: \[\]\n/m, '');
  if (!dna.includes('    - name: approver\n')) throw new Error('fixture bug: the scaffolded role list moved');
  writeFileSync(
    dnaPath,
    dna.replace('    - name: approver\n', '    - name: approver\n  agents:\n    - name: Fake Agent\n      email: fake-agent@example.com\n      executes_as: [developer]\n      adapter: fake\n'),
  );
  const fixtures = join(__dirname, '..', 'fixtures', 'agents');
  writeFileSync(join(repo, '.wingfoil', 'agents', 'custom', 'fake.yaml'), readFileSync(join(fixtures, 'custom', 'fake.yaml')));
  mkdirSync(join(repo, 'test', 'fixtures', 'agents'), { recursive: true });
  copyFileSync(join(fixtures, 'fake-agent.cjs'), join(repo, 'test', 'fixtures', 'agents', 'fake-agent.cjs'));
  const workflowsPath = join(repo, '.wingfoil', 'workflows.yaml');
  writeFileSync(
    workflowsPath,
    `${readFileSync(workflowsPath, 'utf-8')}  - workflows/custom/quick.yaml\n  - workflows/custom/finished.yaml\n  - workflows/custom/checkpoint.yaml\n  - workflows/custom/retired.yaml\n  - workflows/custom/adoptable.yaml\n  - workflows/custom/renamed.yaml\n`,
  );
  const custom = join(repo, '.wingfoil', 'workflows', 'custom');
  writeFileSync(join(custom, 'retired.yaml'), 'name: retired\nstartable: true\nphases:\n  - name: one\n    role: developer\n');
  for (const name of ['quick', 'finished']) {
    writeFileSync(join(custom, `${name}.yaml`), `name: ${name}\nstartable: true\nphases:\n  - name: check\n    role: developer\n    produces: [ ".wingfoil/dna.yaml" ]\n`);
  }
  writeFileSync(join(custom, 'checkpoint.yaml'), 'name: checkpoint\nstartable: true\nphases:\n  - name: review-notes\n    role: approver\n  - name: close\n    role: approver\n');
  writeFileSync(join(custom, 'adoptable.yaml'), "name: adoptable\nstartable: true\nphases:\n  - name: seed\n    role: approver\n    actions:\n      - 'memory.add(type: adr)'\n  - name: close\n    role: approver\n");
  writeFileSync(join(custom, 'renamed.yaml'), 'name: renamed\nstartable: true\nphases:\n  - name: new-name\n    role: approver\n  - name: close\n    role: approver\n');
  for (const name of ['checkpoint', 'adoptable', 'renamed']) {
    mkdirSync(join(repo, 'docs', 'memory', 'plan', name), { recursive: true });
    writeFileSync(
      join(repo, 'docs', 'memory', 'plan', name, `${name}-1-plan.md`),
      `---\nid: "${name}-1-plan"\ntype: plan\ntitle: "${name} — 1"\nstatus: active\nworkflow: "${name}"\nphase: "1"\nelement: ""\nparent: ""\n---\n\n## Body\n`,
    );
  }
  mkdirSync(join(repo, 'docs', 'memory', 'adr'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'memory', 'adr', 'adr-001-adopt-me.md'), '---\nid: "adr-001-adopt-me"\ntype: adr\ntitle: "Adopt me"\nstatus: draft\n---\n\n## Body\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-am', 'configure the member, the bug machine, the fake agent and the workflows']);
  git(repo, ['commit', '--quiet', '--allow-empty', '-m', 'workflow: finalize renamed-1-plan renamed.old-name', '-m', 'WingFoil-Phase: renamed.old-name completed\nWingFoil-Instance: renamed-1-plan']);

  step(repo, 'memory', 'add', '--type', 'task', '--title', 'Submit me');
  step(repo, 'memory', 'add', '--type', 'task', '--title', 'Approve me');
  step(repo, 'memory', 'submit', 'task-002-approve-me');
  step(repo, 'memory', 'add', '--type', 'task', '--title', 'Reject me');
  step(repo, 'memory', 'submit', 'task-003-reject-me');
  step(repo, 'memory', 'add', '--type', 'task', '--title', 'Deprecate me');
  step(repo, 'memory', 'add', '--type', 'bug', '--title', 'Park me');
  step(repo, 'memory', 'submit', 'bug-001-park-me');
  step(repo, 'memory', 'approve', 'bug-001-park-me', '--reason', 'triaged');
  step(repo, 'memory', 'add', '--type', 'task', '--title', 'Amend me');
  step(repo, 'memory', 'submit', 'task-005-amend-me');
  step(repo, 'memory', 'approve', 'task-005-amend-me', '--reason', 'scope agreed');
  step(repo, 'directive', 'create', '--name', 'remove-me');
  step(repo, 'dna', 'add', 'modules', '--value', 'api');
  step(repo, 'workflow', 'start', 'finished');
  if (git(repo, ['status', '--porcelain']).trim() !== '') throw new Error('fixture bug: the fixture left the tree dirty');
  return repo;
}

interface Row {
  readonly args: readonly string[];
  /** An edit or committed step the command needs before it runs, made as the member before the snapshot. */
  readonly prepare?: (repo: string) => void;
}

/** Keyed by the operation's registry name; the completeness test holds the keys to the registry. */
const ROWS: Readonly<Record<string, Row>> = {
  agentExecute: { args: ['agent', 'execute', '--element', 'task:task-001-submit-me', '--role', 'developer'] },
  dnaSet: { args: ['dna', 'set', 'project.name', '--value', 'Membership Demo'] },
  dnaAdd: { args: ['dna', 'add', 'modules', '--value', 'core', '--entry-path', 'src/core'] },
  dnaUpdate: { args: ['dna', 'update', 'modules.api', '--entry-description', 'Public HTTP API'] },
  dnaRemove: { args: ['dna', 'remove', 'stacks.methodologies.TDD'] },
  memoryAdd: { args: ['memory', 'add', '--type', 'task', '--title', 'Added by a stranger'] },
  memorySubmit: { args: ['memory', 'submit', 'task-001-submit-me'] },
  memoryApprove: { args: ['memory', 'approve', 'task-002-approve-me', '--reason', 'Scope is clear.'] },
  memoryReject: { args: ['memory', 'reject', 'task-003-reject-me', '--reason', 'Add acceptance criteria.'] },
  memoryDeprecate: { args: ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', 'No longer needed.'] },
  memoryPark: { args: ['memory', 'park', 'bug-001-park-me', '--reason', 'Blocked on a decision.'] },
  directiveCreate: { args: ['directive', 'create', '--name', 'stranger-rule'] },
  directiveAssign: { args: ['directive', 'assign', '--directive', 'traceability', '--role', 'qa'] },
  directiveRemove: { args: ['directive', 'remove', 'remove-me'] },
  workflowStart: { args: ['workflow', 'start', 'quick'] },
  workflowEnd: {
    args: ['workflow', 'end', 'finished'],
    prepare: (repo) => {
      const path = join(repo, 'docs/memory/plan/finished/finished-1-plan.md');
      if (readFileSync(path, 'utf-8').includes('The plan of this run.')) return;
      writeFileSync(path, `${readFileSync(path, 'utf-8')}\nThe plan of this run.\n`);
      step(repo, 'memory', 'submit', 'finished-1-plan');
    },
  },
  workflowFinalize: { args: ['workflow', 'finalize', 'checkpoint-1-plan'] },
  workflowAdopt: { args: ['workflow', 'adopt', 'adoptable-1-plan', '--step', 'adoptable.seed', '--element', 'adr:adr-001-adopt-me', '--reason', 'Created before the engine.'] },
  workflowRekey: { args: ['workflow', 'rekey', 'renamed-1-plan', '--from', 'renamed.old-name', '--to', 'renamed.new-name', '--reason', 'Phase renamed.'] },
  workflowCreate: { args: ['workflow', 'create', 'stranger-flow', '--kind', 'main'] },
  workflowRemove: { args: ['workflow', 'remove', 'retired'] },
  // Last: its preparation leaves a modified document in the tree for the rows after it.
  memoryAmend: {
    args: ['memory', 'amend', 'task-005-amend-me', '--reason', 'Corrected the scope paragraph.'],
    prepare: (repo) => {
      const path = join(repo, 'docs/memory/task/task-005-amend-me.md');
      if (!readFileSync(path, 'utf-8').includes('A corrected scope paragraph.')) writeFileSync(path, `${readFileSync(path, 'utf-8')}\nA corrected scope paragraph.\n`);
    },
  },
};

function mutatingOperations(): string[] {
  return enumerateOperations(CORE_MODULES)
    .filter(({ operation }) => operation.mutates)
    .map(({ operation }) => operation.name)
    .sort();
}

describe('task-333 AC 5 — every mutating command refuses a non-member (dl-220 Q2 (b), spec-006 §7)', () => {
  let repo: string;
  beforeAll(() => {
    repo = buildFixture();
  }, TIMEOUT_MS);
  afterAll(() => removeTempDir(repo));

  it('the table names exactly the operations the registry declares mutates: true (init is not one)', () => {
    expect(Object.keys(ROWS).sort()).toEqual(mutatingOperations());
    expect(mutatingOperations()).not.toContain('init');
  });

  it.each(Object.entries(ROWS))(
    '%s: the member passes the step (--dry-run, exit 0); the stranger is refused with E_NOT_A_MEMBER, exit 1, nothing written',
    (_name, row) => {
      row.prepare?.(repo);
      const before = snapshotPersistence(repo);

      const member = wingfoil(repo, [...row.args, '--dry-run']);
      expect({ member: member.status, stderr: member.stderr }).toEqual({ member: 0, stderr: '' });
      assertPersistenceUnchanged(repo, before, 'member dry run');

      const stranger = wingfoil(repo, row.args, STRANGER_ENV);
      expect({ status: stranger.status, stdout: stranger.stdout, stderr: stranger.stderr }).toEqual({ status: 1, stdout: '', stderr: STRANGER_STDERR });
      assertPersistenceUnchanged(repo, before, 'stranger');
    },
    TIMEOUT_MS,
  );
});

describe('task-333 AC 5 — the cases membership does not refuse (D1)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it('init never takes the step, and a committed team.members: [] (the scaffold) refuses nobody: the stranger adds and submits', () => {
    const root = makeTempGitRepo();
    roots.push(root);
    const init = wingfoil(root, ['init', '--template', 'Kanban'], STRANGER_ENV);
    expect({ status: init.status, stderr: init.stderr }).toEqual({ status: 0, stderr: '' });
    expect(git(root, ['show', 'HEAD:.wingfoil/dna.yaml'])).toContain('  members: []');

    const add = wingfoil(root, ['memory', 'add', '--type', 'task', '--title', 'First task'], STRANGER_ENV);
    expect({ status: add.status, stderr: add.stderr }).toEqual({ status: 0, stderr: '' });
    expect(git(root, ['log', '-1', '--format=%ae']).trim()).toBe(STRANGER.email);
  }, TIMEOUT_MS);

  it('an uncommitted dna.yaml adding the stranger does not admit them: memory add is refused, the edit left in place', () => {
    const root = makeTempGitRepo();
    roots.push(root);
    expect(wingfoil(root, ['init', '--template', 'Kanban']).status).toBe(0);
    const dnaPath = join(root, '.wingfoil', 'dna.yaml');
    writeFileSync(dnaPath, readFileSync(dnaPath, 'utf-8').replace('  members: []', '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [approver]'));
    git(root, ['commit', '--quiet', '-am', 'fixture: the first member']);
    writeFileSync(
      dnaPath,
      readFileSync(dnaPath, 'utf-8').replace('      roles: [approver]', `      roles: [approver]\n    - name: ${STRANGER.name}\n      email: ${STRANGER.email}\n      roles: [developer]`),
    );
    const before = snapshotPersistence(root);

    const run = wingfoil(root, ['memory', 'add', '--type', 'task', '--title', 'Not yet'], STRANGER_ENV);

    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: '', stderr: STRANGER_STDERR });
    assertPersistenceUnchanged(root, before, 'uncommitted grant');
  }, TIMEOUT_MS);
});

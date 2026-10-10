/**
 * task-210 (`dl-106` W2, `spec-008-cli-grammar` §2) — `--dry-run` on every operation registered
 * `mutates: true` in `CORE_MODULES`, driven through the REAL compiled `dist/cli.js` in a REAL
 * `wingfoil init`-ed throwaway project.
 *
 * The table is **driven by the registry**: {@link ROWS} must name exactly the operations
 * `enumerateOperations(CORE_MODULES)` reports as mutating, so a mutating operation added later (task-211,
 * 217, 218, 226, 228 …) fails here until it is given a row — and once it has one, it passes only if its
 * writes go through the commit primitive (`writeAndCommit`, `src/storage/commit.ts`), where the dry run
 * is implemented once.
 *
 * For each row, three things are asserted:
 *
 * 1. **AC1 — writes nothing.** `--dry-run` exits `0` and the working tree, the index, `HEAD` and every
 *    ref are byte-for-byte what they were (`assertPersistenceUnchanged`: `git status --porcelain`,
 *    `git rev-parse HEAD`, the bytes of every path git reports).
 * 2. **AC3 — the JSON plan.** `--format json` prints one object listing `paths`, `subject` and `diff`.
 * 3. **The plan is the commit.** The same command without `--dry-run` then runs for real, and its
 *    commit has the plan's subject, the plan's full message (the `WingFoil-Version:` trailer included),
 *    exactly the plan's paths, and the plan's hunks.
 *
 * AC2 (a refused operation exits with its refusal's code) is the second `describe`.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003`). Deterministic (REQ-SYS-07): fixed steps,
 * fixed identity, fixed fixture text; rows run in declaration order on one repository, each on its own
 * documents, so no row depends on another's real run.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES, enumerateOperations } from '../../src/core';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { runCliEntry, type SpawnedRun } from './helpers/spawn-cli';

function wingfoil(cwd: string, args: readonly string[]): SpawnedRun {
  return runCliEntry(cwd, args);
}

const gitOut = (repo: string, args: readonly string[]): string => git(repo, [...args]).trim();

/** Run a fixture step that must succeed. */
function step(repo: string, ...args: string[]): void {
  const run = wingfoil(repo, args);
  if (run.status !== 0) throw new Error(`fixture bug: wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
}

/**
 * A project every mutating operation can run in: the git identity holds `approver`; `bug` has its own
 * machine with a `returns` edge (`memory park`); one document per transition verb, in the state that
 * verb leaves; a custom directive nothing references (`directive remove`); a module (`dna update`).
 */
function buildFixture(): string {
  const repo = makeTempGitRepo();
  step(repo, 'init', '--template', 'Kanban');
  const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
  writeFileSync(
    dnaPath,
    readFileSync(dnaPath, 'utf-8').replace(
      '  members: []',
      '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [approver]',
    ),
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
  // `agent execute` (task-218): an agent with the fake adapter (task-200), the script it launches, and
  // the scaffold's `paths.runs`.
  const dna = readFileSync(dnaPath, 'utf-8');
  if (!dna.includes('    - name: approver\n')) throw new Error('fixture bug: the scaffolded role list moved');
  writeFileSync(
    dnaPath,
    dna.replace(
      '    - name: approver\n',
      '    - name: approver\n  agents:\n    - name: Fake Agent\n      email: fake-agent@example.com\n      executes_as: [developer]\n      adapter: fake\n',
    ),
  );
  const fixtures = join(__dirname, '..', 'fixtures', 'agents');
  writeFileSync(join(repo, '.wingfoil', 'agents', 'custom', 'fake.yaml'), readFileSync(join(fixtures, 'custom', 'fake.yaml')));
  mkdirSync(join(repo, 'test', 'fixtures', 'agents'), { recursive: true });
  copyFileSync(join(fixtures, 'fake-agent.cjs'), join(repo, 'test', 'fixtures', 'agents', 'fake-agent.cjs'));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-am', 'configure approver, the bug machine and the fake agent']);

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
  if (gitOut(repo, ['status', '--porcelain']) !== '') throw new Error('fixture bug: the fixture left the tree dirty');
  return repo;
}

/** One mutating operation, with an invocation that succeeds on the fixture. */
interface Row {
  readonly args: readonly string[];
  /** An edit the operation needs on disk before it runs (`memory amend` records an uncommitted correction). */
  readonly prepare?: (repo: string) => void;
  /**
   * `agent execute` (task-218): its commit records a run, so it follows the agent's exit and cannot be
   * planned as bytes. Its dry run runs every pre-launch check and prints the launch plan — the record
   * commit's subject and path, without `message` or `diff` (spec-008 §2) — and its real run launches
   * the fake agent and makes the planned commit (task-228).
   */
  readonly launch?: true;
}

/** Keyed by the operation's camelCase registry name; the completeness test holds the keys to the registry. */
const ROWS: Readonly<Record<string, Row>> = {
  agentExecute: { args: ['agent', 'execute', '--element', 'task:task-001-submit-me', '--role', 'developer'], launch: true },
  dnaSet: { args: ['dna', 'set', 'project.name', '--value', 'Dry Run Demo'] },
  dnaAdd: { args: ['dna', 'add', 'modules', '--value', 'core', '--entry-path', 'src/core'] },
  dnaUpdate: { args: ['dna', 'update', 'modules.api', '--entry-description', 'Public HTTP API'] },
  dnaRemove: { args: ['dna', 'remove', 'stacks.methodologies.TDD'] },
  memoryAdd: { args: ['memory', 'add', '--type', 'task', '--title', 'Planned by a dry run'] },
  memorySubmit: { args: ['memory', 'submit', 'task-001-submit-me'] },
  memoryApprove: { args: ['memory', 'approve', 'task-002-approve-me', '--reason', 'Scope is clear.'] },
  memoryReject: { args: ['memory', 'reject', 'task-003-reject-me', '--reason', 'Add acceptance criteria.'] },
  memoryDeprecate: { args: ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', 'No longer needed.'] },
  memoryPark: { args: ['memory', 'park', 'bug-001-park-me', '--reason', 'Blocked on a decision.'] },
  directiveCreate: { args: ['directive', 'create', '--name', 'dry-rule'] },
  directiveAssign: { args: ['directive', 'assign', '--directive', 'traceability', '--role', 'qa'] },
  directiveRemove: { args: ['directive', 'remove', 'remove-me'] },
  // Last: its preparation leaves a modified document in the tree for the rows after it.
  memoryAmend: {
    args: ['memory', 'amend', 'task-005-amend-me', '--reason', 'Corrected the scope paragraph.'],
    prepare: (repo) => {
      const path = join(repo, 'docs/memory/task/task-005-amend-me.md');
      writeFileSync(path, `${readFileSync(path, 'utf-8')}\nA corrected scope paragraph.\n`);
    },
  },
};

/** Every operation the registry declares `mutates: true`, sorted. */
function mutatingOperations(): string[] {
  return enumerateOperations(CORE_MODULES)
    .filter(({ operation }) => operation.mutates)
    .map(({ operation }) => operation.name)
    .sort();
}

/** The hunk lines of a unified diff: everything but file headers (`diff --git`, `index`, modes, `---`/`+++`). */
function hunkLines(diff: string): string[] {
  const out: string[] = [];
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    else if (line.startsWith('@@')) inHunk = true;
    if (inHunk) out.push(line);
  }
  return out.filter((line) => line.length > 0);
}

interface Plan {
  readonly dryRun: boolean;
  readonly subject: string;
  readonly message: string;
  readonly paths: readonly string[];
  readonly diff: string;
}

describe('--dry-run on every mutating operation of the registry (task-210, dl-106 W2)', () => {
  let repo: string;

  beforeAll(() => {
    repo = buildFixture();
  });
  afterAll(() => removeTempDir(repo));

  it('the table names exactly the operations the registry declares mutates: true', () => {
    // Measured, not assumed: the task's "28" and the batch notes' "34" both counted
    // `grep -c "mutates: true" src/core/index.ts`, which also matches comment lines.
    expect(Object.keys(ROWS).sort()).toEqual(mutatingOperations());
    expect(mutatingOperations()).toHaveLength(15);
  });

  it.each(Object.entries(ROWS))('%s: plans the commit, writes nothing, and the real run makes that commit', (_name, row) => {
    row.prepare?.(repo);
    const before = snapshotPersistence(repo);

    const dry = wingfoil(repo, [...row.args, '--dry-run', '--format', 'json']);
    expect({ status: dry.status, stderr: dry.stderr }).toEqual({ status: 0, stderr: '' });
    assertPersistenceUnchanged(repo, before, 'dry run');

    const plan = JSON.parse(dry.stdout) as Plan;
    expect(plan.dryRun).toBe(true);
    expect(typeof plan.subject).toBe('string');
    expect(Array.isArray(plan.paths)).toBe(true);
    expect(plan.paths.length).toBeGreaterThan(0);
    if (row.launch === true) {
      expect(plan.subject).toMatch(/^agent: record task-001-submit-me\/adhoc\/1$/);
      expect(plan.paths).toEqual(['docs/runs/task-001-submit-me.jsonl']);
      // The real run launches the fake and makes the planned commit (task-228): its subject and paths.
      const launchedFrom = gitOut(repo, ['rev-parse', 'HEAD']);
      const real = wingfoil(repo, [...row.args, '--format', 'json']);
      expect(real.status).toBe(0);
      expect(real.stdout).toBe('');
      expect(gitOut(repo, ['rev-parse', 'HEAD~1'])).toBe(launchedFrom);
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(plan.subject);
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n')).toEqual(plan.paths);
      return;
    }
    expect(typeof plan.diff).toBe('string');
    expect(plan.diff.length).toBeGreaterThan(0);

    const head = gitOut(repo, ['rev-parse', 'HEAD']);
    const real = wingfoil(repo, [...row.args, '--format', 'json']);
    expect(real.status).toBe(0);
    expect(gitOut(repo, ['rev-parse', 'HEAD~1'])).toBe(head);
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(plan.subject);
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(plan.message.trim());
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n')).toEqual(plan.paths);
    const shown = git(repo, ['show', '--format=', '--no-color', '--no-ext-diff', '--unified=3', '--diff-algorithm=myers', 'HEAD']);
    expect(hunkLines(plan.diff)).toEqual(hunkLines(shown));
  });
});

describe('--dry-run of a refused operation exits with the refusal\'s code and writes nothing (task-210 AC2)', () => {
  let repo: string;

  beforeAll(() => {
    repo = buildFixture();
  });
  afterAll(() => removeTempDir(repo));

  it.each([
    ['an illegal transition (approve a draft)', ['memory', 'approve', 'task-001-submit-me', '--reason', 'ok'], 1],
    ['an unknown document', ['memory', 'submit', 'task-999-nope'], 1],
    ['a missing required option', ['memory', 'approve', 'task-002-approve-me'], 2],
    ['a blank reason', ['memory', 'reject', 'task-003-reject-me', '--reason', '   '], 2],
    ['an occupied directive name', ['directive', 'create', '--name', 'remove-me'], 1],
    ['a path the schema does not declare', ['dna', 'set', 'project.nope', '--value', 'x'], 1],
  ] as const)('%s', (_label, args, code) => {
    const before = snapshotPersistence(repo);
    const run = wingfoil(repo, [...args, '--dry-run']);
    expect(run.status).toBe(code);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^error: /);
    assertPersistenceUnchanged(repo, before, 'refused dry run');
  });

  it('a command that writes nothing does not take --dry-run (unknown option, exit 2)', () => {
    const run = wingfoil(repo, ['dna', 'show', '--dry-run']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("unknown option '--dry-run'");
  });

  it('init does not take --dry-run, so it cannot run for real by mistake (exit 2)', () => {
    const fresh = makeTempGitRepo();
    try {
      const run = wingfoil(fresh, ['init', '--template', 'Kanban', '--dry-run']);
      expect(run.status).toBe(2);
      expect(gitOut(fresh, ['status', '--porcelain'])).toBe('');
    } finally {
      removeTempDir(fresh);
    }
  });
});

describe('a dry run reports the warnings the real run would (task-210 review F4)', () => {
  it('dna add --force on a file the in-place editor cannot edit: the whole-file rewrite warning, and nothing written', () => {
    const repo = makeTempGitRepo();
    try {
      step(repo, 'init', '--template', 'Kanban');
      const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
      const scaffold = readFileSync(dnaPath, 'utf-8');
      const flow = scaffold.replace(/^paths:\n(?: {2}.*\n)+/m, 'paths: { sources: [src/], runs: [docs/runs/] }\n');
      expect(flow).not.toBe(scaffold);
      writeFileSync(dnaPath, flow, 'utf-8');
      git(repo, ['commit', '--quiet', '-am', 'fixture: flow-mapping paths']);
      const before = snapshotPersistence(repo);

      const dry = wingfoil(repo, ['dna', 'add', 'paths.tests', '--value', 'test/', '--force', '--dry-run']);

      expect(dry.status).toBe(0);
      assertPersistenceUnchanged(repo, before, 'dry run with a warning');
      // A plan words the warning for what would happen; the real run, for what did (review nit).
      expect(dry.stderr).toMatch(/^warning: dna\.yaml would be rewritten as a whole file \(--force\)/);
      const real = wingfoil(repo, ['dna', 'add', 'paths.tests', '--value', 'test/', '--force']);
      expect(real.status).toBe(0);
      expect(real.stderr).toMatch(/^warning: dna\.yaml was rewritten as a whole file \(--force\)/);
      expect(dry.stderr).toBe(real.stderr.replace('dna.yaml was rewritten', 'dna.yaml would be rewritten'));
    } finally {
      removeTempDir(repo);
    }
  });

  it('directive assign --force on a flow-style roles.yaml: the rewrite warning, worded as a plan', () => {
    const repo = makeTempGitRepo();
    try {
      step(repo, 'init', '--template', 'scrum');
      writeFileSync(join(repo, '.wingfoil', 'roles.yaml'), 'version: 1.0\n\nassignments: {developer: [code-quality]}\nglobal: ["documentation"]\n', 'utf-8');
      git(repo, ['commit', '--quiet', '-am', 'fixture: flow-style roles.yaml']);
      const before = snapshotPersistence(repo);

      const dry = wingfoil(repo, ['directive', 'assign', '--directive', 'testing', '--role', 'developer', '--force', '--dry-run']);

      expect(dry.status).toBe(0);
      assertPersistenceUnchanged(repo, before, 'roles dry run with a warning');
      expect(dry.stderr).toMatch(/^warning: roles\.yaml would be rewritten as a whole file \(--force\)/);
    } finally {
      removeTempDir(repo);
    }
  });
});


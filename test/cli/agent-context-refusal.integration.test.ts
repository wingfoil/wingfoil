/**
 * task-333 AC 1–4 (`spec-018` §1, §2.6, §3; §6 T-1…T-9, T-18, T-20; `dl-212` D1) — the approver-gated commands refuse
 * an agent's session, through the REAL compiled `dist/cli.js`, on the fixture of `test/core/helpers/l0-fixture.ts`.
 *
 * Every case runs the CLI in a child whose environment is `process.env` minus the `spec-018` §1 environment markers
 * (`withoutAgentMarkers`, `test/agent-markers.cjs`), then adds what the case names, so it behaves the same under an
 * agent and in the approver's terminal. The `E_AGENT_CONTEXT` lines are compared whole.
 *
 * - AC 1: each marker of §1 refuses `memory approve` at exit 1 with §3.2's two lines, markers in §1 order, no value
 *   printed, `--format json`'s `{error, hint}`, `HEAD`, index and tree unchanged; `CLAUDECODE=1` alone approves (T-6).
 * - AC 2: one case per caller of the shared check, the list held equal to the call sites in `src/` (T-9).
 * - AC 3: on a gated command the agent context is told `E_AGENT_CONTEXT` and nothing else (T-7); `--dry-run` is
 *   refused identically (T-20, first half).
 * - AC 4 (b): a `--reason` carrying `Co-Authored-By:` is refused at exit 2 on every command that writes `Approver:`,
 *   accepted on `deprecate` and `park` (T-18).
 *
 * Red until `spec-018` lands: today every refused case exits 0 and commits, and `--co-author` is an unknown option
 * (exit 2). The control cases (no marker, `CLAUDECODE`, `deprecate`, `park`) pass today.
 *
 * `dist/` is built once by jest's `globalSetup` (`bug-003`). Deterministic: fixed fixture, fixed identity.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import {
  agentContextRefusal,
  agentContextStderr,
  APPROVAL_REASON_REFUSAL,
  buildL0Repo,
  CO_AUTHOR_REASON,
  GATED_CASES,
  type GatedCase,
} from '../core/helpers/l0-fixture';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 60_000;
const REPO_ROOT = join(__dirname, '..', '..');

/** Run the CLI with `process.env` minus every §1 environment marker, plus `extra`. */
function wingfoil(cwd: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...withoutAgentMarkers(process.env), ...extra } as NodeJS.ProcessEnv });
}

/** `HEAD`, the index and the tree, as `spec-018` §6 T-1 compares them. */
function gitState(root: string): { head: string; status: string; cached: string } {
  return {
    head: git(root, ['rev-parse', 'HEAD']).trim(),
    status: git(root, ['status', '--porcelain']),
    cached: git(root, ['diff', '--cached', '--name-only']),
  };
}

const AGENT_TRAILER_RE = /^(co-authored-by|ai-model):/im;

describe('task-333 AC 1 — memory approve under each spec-018 §1 marker (T-1…T-6, T-8)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(): string {
    const root = buildL0Repo();
    roots.push(root);
    return root;
  }

  const APPROVE = ['memory', 'approve', 'task-001-approve-me', '--reason', 'r'] as const;

  it.each<[string, readonly string[], Record<string, string>, string]>([
    ['T-1 WINGFOIL_AGENT=Claude', [], { WINGFOIL_AGENT: 'Claude' }, 'WINGFOIL_AGENT is set'],
    ['T-2 WINGFOIL_AGENT= (empty: defined counts)', [], { WINGFOIL_AGENT: '' }, 'WINGFOIL_AGENT is set'],
    ['T-3 --co-author Claude', ['--co-author', 'Claude'], {}, '--co-author was given'],
    ['T-4 CLAUDE_CODE_CHILD_SESSION=1', [], { CLAUDE_CODE_CHILD_SESSION: '1' }, 'CLAUDE_CODE_CHILD_SESSION is set'],
    ['T-5 CODEX_SANDBOX=seatbelt', [], { CODEX_SANDBOX: 'seatbelt' }, 'CODEX_SANDBOX is set'],
    [
      'every marker at once, listed in §1 order',
      ['--co-author', 'Claude'],
      { CODEX_SANDBOX: '1', CLAUDE_CODE_CHILD_SESSION: '1', WINGFOIL_AGENT: 'Claude' },
      'WINGFOIL_AGENT is set, --co-author was given, CLAUDE_CODE_CHILD_SESSION is set, CODEX_SANDBOX is set',
    ],
  ])('%s: exit 1, the two E_AGENT_CONTEXT lines, HEAD, index and tree unchanged', (_label, extraArgs, env, markers) => {
    const root = repo();
    const before = gitState(root);
    const unchanged = snapshotPersistence(root);

    const run = wingfoil(root, [...APPROVE, ...extraArgs], env);

    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: '', stderr: agentContextStderr('memory approve', markers) });
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, 'refused approve');
  }, TIMEOUT_MS);

  it('T-8 WINGFOIL_AGENT=Claude CODEX_SANDBOX=1 memory reject: the markers in §1 order', () => {
    const root = repo();
    const before = gitState(root);

    const run = wingfoil(root, ['memory', 'reject', 'task-002-reject-me', '--reason', 'needs work'], { WINGFOIL_AGENT: 'Claude', CODEX_SANDBOX: '1' });

    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({
      status: 1,
      stdout: '',
      stderr: agentContextStderr('memory reject', 'WINGFOIL_AGENT is set, CODEX_SANDBOX is set'),
    });
    expect(gitState(root)).toEqual(before);
  }, TIMEOUT_MS);

  it('a marker value is never printed (WINGFOIL_AGENT=marker-value-xyz, CODEX_SANDBOX=sandbox-value-xyz)', () => {
    const root = repo();
    const run = wingfoil(root, [...APPROVE], { WINGFOIL_AGENT: 'marker-value-xyz', CODEX_SANDBOX: 'sandbox-value-xyz' });
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(agentContextStderr('memory approve', 'WINGFOIL_AGENT is set, CODEX_SANDBOX is set'));
    expect(run.stderr).not.toContain('marker-value-xyz');
    expect(run.stderr).not.toContain('sandbox-value-xyz');
  }, TIMEOUT_MS);

  it('--format json: stderr is the one {error, hint} object of spec-018 §3.2', () => {
    const root = repo();
    const run = wingfoil(root, [...APPROVE, '--format', 'json'], { WINGFOIL_AGENT: 'Claude' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr.endsWith('\n')).toBe(true);
    expect(JSON.parse(run.stderr) as unknown).toEqual(agentContextRefusal('memory approve', 'WINGFOIL_AGENT is set'));
  }, TIMEOUT_MS);

  it('T-6 CLAUDECODE=1 alone is not a marker: exit 0, approved, the commit carries no agent trailer', () => {
    const root = repo();
    const run = wingfoil(root, [...APPROVE], { CLAUDECODE: '1' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    const message = git(root, ['log', '-1', '--format=%B']);
    expect(message.startsWith('wf(task): approve task-001-approve-me [pending → backlog]\n')).toBe(true);
    expect(message).not.toMatch(AGENT_TRAILER_RE);
  }, TIMEOUT_MS);
});

/** The enclosing top-level declaration of each line of `source`: the last `function <name>` / `const <name>` above it. */
function enclosingDeclaration(lines: readonly string[], index: number): string {
  for (let at = index; at >= 0; at -= 1) {
    const match = /^(?:export )?(?:async )?function (\w+)|^(?:export )?const (\w+)\b/.exec(lines[at] as string);
    if (match !== null) return (match[1] ?? match[2]) as string;
  }
  return '<module>';
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** Every call of the shared approver check outside its own module, as `<file>#<enclosing declaration>`, sorted. */
function approverCheckCallSites(): string[] {
  const sites: string[] = [];
  for (const path of sourceFiles(join(REPO_ROOT, 'src'))) {
    const file = relative(REPO_ROOT, path).split('\\').join('/');
    if (file === 'src/core/approval-authority.ts') continue;
    const lines = readFileSync(path, 'utf-8').split('\n');
    lines.forEach((line, index) => {
      const code = line.trim();
      if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;
      if (/\brequireApproverAuthority\(|\brequireApprovalAuthority\(/.test(line)) sites.push(`${file}#${enclosingDeclaration(lines, index)}`);
    });
  }
  return sites.sort();
}

/** Where each command of {@link GATED_CASES} calls the shared check today (`grep -rn … src`, six lines). */
const CALL_SITE_OF: Readonly<Record<string, string>> = {
  'memory approve': 'src/core/index.ts#memoryApproveFn',
  'memory reject': 'src/core/index.ts#memoryRejectFn',
  'memory amend': 'src/core/index.ts#memoryAmendFn',
  'workflow finalize': 'src/core/workflow-finalize.ts#workflowFinalizeAtHead',
  'workflow adopt --plan --apply': 'src/core/workflow-adopt.ts#workflowAdoptAtHead',
  'workflow rekey': 'src/core/workflow-rekey.ts#workflowRekeyAtHead',
};

describe('task-333 AC 2 — every caller of the shared approver check refuses an agent context (T-9)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(gated: GatedCase): string {
    const root = buildL0Repo();
    roots.push(root);
    gated.prepare?.(root);
    return root;
  }

  it('the case list is the list of call sites of requireApproverAuthority( / requireApprovalAuthority( outside src/core/approval-authority.ts', () => {
    expect(GATED_CASES.map((gated) => CALL_SITE_OF[gated.command]).sort()).toEqual(approverCheckCallSites());
  });

  it.each(GATED_CASES.map((gated) => [gated.command, gated] as const))(
    '%s under WINGFOIL_AGENT=Claude: exit 1, E_AGENT_CONTEXT naming the command, HEAD, index and tree unchanged',
    (command, gated) => {
      const root = repo(gated);
      const before = gitState(root);
      const unchanged = snapshotPersistence(root);

      const run = wingfoil(root, gated.args, { WINGFOIL_AGENT: 'Claude' });

      expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: '', stderr: agentContextStderr(command, 'WINGFOIL_AGENT is set') });
      expect(gitState(root)).toEqual(before);
      assertPersistenceUnchanged(root, unchanged, command);
    },
    TIMEOUT_MS,
  );

  it.each(GATED_CASES.map((gated) => [gated.command, gated] as const))(
    'control: %s with no marker succeeds on the fixture (exit 0, one commit)',
    (_command, gated) => {
      const root = repo(gated);
      const head = git(root, ['rev-parse', 'HEAD']).trim();

      const run = wingfoil(root, gated.args);

      expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
      expect(git(root, ['rev-parse', 'HEAD~1']).trim()).toBe(head);
    },
    TIMEOUT_MS,
  );
});

describe('task-333 AC 3 — a gated command tells the agent context E_AGENT_CONTEXT and nothing else (T-7, T-20)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));

  it.each<[string, boolean, Record<string, string>, string]>([
    ['WINGFOIL_AGENT=Nobody (no such team.agents entry)', true, { WINGFOIL_AGENT: 'Nobody' }, 'WINGFOIL_AGENT is set'],
    ['CLAUDE_CODE_CHILD_SESSION=1 with team.agents: []', false, { CLAUDE_CODE_CHILD_SESSION: '1' }, 'CLAUDE_CODE_CHILD_SESSION is set'],
  ])('T-7 %s: exit 1, the two §3.2 lines only — no agent name, no unknown-entry refusal, no warning', (_label, agents, env, markers) => {
    const root = buildL0Repo({ agents });
    roots.push(root);
    const unchanged = snapshotPersistence(root);

    const run = wingfoil(root, ['memory', 'approve', 'task-001-approve-me', '--reason', 'r'], env);

    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: '', stderr: agentContextStderr('memory approve', markers) });
    for (const absent of ['unknown team.agents entry', 'Claude', 'Other', 'Nobody', 'W_NO_AGENT_ENTRY', 'W_AGENT_ENTRY_GUESSED']) expect(run.stderr).not.toContain(absent);
    assertPersistenceUnchanged(root, unchanged, 'T-7');
  }, TIMEOUT_MS);

  it('T-20 (first half): T-1 with --dry-run is refused identically — the same exit, the same stderr, nothing written', () => {
    const root = buildL0Repo();
    roots.push(root);
    const unchanged = snapshotPersistence(root);
    const before = gitState(root);

    const dry = wingfoil(root, ['memory', 'approve', 'task-001-approve-me', '--reason', 'r', '--dry-run'], { WINGFOIL_AGENT: 'Claude' });
    const real = wingfoil(root, ['memory', 'approve', 'task-001-approve-me', '--reason', 'r'], { WINGFOIL_AGENT: 'Claude' });

    expect({ status: dry.status, stdout: dry.stdout, stderr: dry.stderr }).toEqual({ status: 1, stdout: '', stderr: agentContextStderr('memory approve', 'WINGFOIL_AGENT is set') });
    expect({ status: dry.status, stdout: dry.stdout, stderr: dry.stderr }).toEqual({ status: real.status, stdout: real.stdout, stderr: real.stderr });
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, 'T-20');
  }, TIMEOUT_MS);
});

describe('task-333 AC 4 (b) — a --reason carrying an agent trailer on an approval is a usage error (T-18, spec-018 §3.3)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(prepare?: (root: string) => void): string {
    const root = buildL0Repo();
    roots.push(root);
    prepare?.(root);
    return root;
  }

  it.each(GATED_CASES.map((gated) => [gated.command, gated] as const))(
    '%s --reason $\'Fine.\\nCo-Authored-By: X <x@example.invalid>\\nDone.\', no marker: exit 2, the §3.3 message, nothing written',
    (_command, gated) => {
      const root = repo(gated.prepare);
      const unchanged = snapshotPersistence(root);
      const args = [...gated.args];
      args[args.indexOf('--reason') + 1] = CO_AUTHOR_REASON;

      const run = wingfoil(root, args);

      expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 2, stdout: '', stderr: `error: ${APPROVAL_REASON_REFUSAL}\n` });
      assertPersistenceUnchanged(root, unchanged, 'T-18');
    },
    TIMEOUT_MS,
  );

  it.each([
    ['memory deprecate', ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', CO_AUTHOR_REASON]],
    ['memory park', ['memory', 'park', 'task-005-park-me', '--reason', CO_AUTHOR_REASON]],
  ])('%s, which writes no Approver: line, accepts the same reason (exit 0)', (_command, args) => {
    const root = repo();
    const run = wingfoil(root, args);
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
  }, TIMEOUT_MS);
});

/**
 * task-334 AC 1–5 (`spec-018` §2, §6 T-10…T-17, T-20 second half, T-21; `dl-212` D1; design D3–D7) — in an agent's
 * session the mutating commands write the agent attribution trailers themselves, through the REAL compiled
 * `dist/cli.js`, on the fixture of `test/core/helpers/attribution-fixture.ts`.
 *
 * Every case runs the CLI in a child whose environment is `process.env` minus the `spec-018` §1 environment markers
 * (`withoutAgentMarkers`, `test/agent-markers.cjs`) and minus `WINGFOIL_AGENT_MODEL`, then adds what the case names,
 * so it behaves the same under an agent and in the approver's terminal. Messages are read with `git log --format=%B`
 * and with git's own trailer reader (`%(trailers:key=Co-Authored-By,valueonly)`, `spec-018` §6 T-11). The
 * `WingFoil-Version:` value is the compiled build's stamp (`distBuildStamp()`), never typed.
 *
 * - AC 1: one case per operation of `spec-018` §2.1 under `WINGFOIL_AGENT=Claude`, the list held equal to the
 *   registry (every `mutates: true` operation but `agentAttribution: false` and the four always-gated ones): each
 *   commit the command writes ends with `WingFoil-Version:`, `Co-Authored-By: Claude <…>`, `AI-Model: not-reported`
 *   in ONE final paragraph, its workflow trailers before them.
 * - AC 2: §2.3's precedence (T-12, T-13, T-14), the guessed entry's body line placed first so `memory history` reads
 *   a reason alone, and one warning per invocation (D3).
 * - AC 3: §2.4's model precedence and the `--ai-model` usage refusals (T-21; D4), before `resolveRoot()`.
 * - AC 4: §2.5's refusals (T-15, T-16), nothing written, `--dry-run` refused identically; `W_NO_AGENT_ENTRY` (T-17).
 * - AC 5: no marker, the commit is byte-identical to a fixture copied from a real run of the code build at this
 *   branch's head (T-10; characterization, passes before green); `--dry-run`'s message holds the two trailers (T-20).
 *
 * Red until green: today no command writes an agent trailer, `--ai-model` is an unknown option (exit 2), and no §2.5
 * refusal or warning exists. `dist/` is built once by jest's `globalSetup` (`bug-003`). Deterministic: fixed fixture,
 * fixed identity.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { buildAttributionRepo, type AgentsVariant } from '../core/helpers/attribution-fixture';
import { git, removeTempDir } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { distBuildStamp } from './helpers/dist-stamp';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

const TIMEOUT_MS = 60_000;

const CLAUDE_LINE = 'Co-Authored-By: Claude <noreply@anthropic.com>';
const NOT_REPORTED = 'AI-Model: not-reported';
const guessedNote = (name: string): string => `Attributed to the first team.agents entry, ${name}: no entry is named for this agent.`;
const GUESSED_WARNING = `warning: W_AGENT_ENTRY_GUESSED: ${guessedNote('Claude')}\n`;

/** The environment every child starts from: no `spec-018` §1 marker, no `WINGFOIL_AGENT_MODEL`. */
function baseEnv(): Record<string, string | undefined> {
  const env = withoutAgentMarkers(process.env);
  delete env.WINGFOIL_AGENT_MODEL;
  return env;
}

/** Run the CLI in `cwd` with {@link baseEnv} plus `extra`. */
function wingfoil(cwd: string, args: readonly string[], extra: Record<string, string> = {}): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd, env: { ...baseEnv(), ...extra } as NodeJS.ProcessEnv });
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();
const stampLine = (): string => `WingFoil-Version: ${distBuildStamp()}`;

/** `HEAD`, the index and the tree. */
function gitState(root: string): { head: string; status: string; cached: string } {
  return { head: head(root), status: git(root, ['status', '--porcelain']), cached: git(root, ['diff', '--cached', '--name-only']) };
}

/** The raw message of `rev`, as `git log -1 --format=%B` prints it. */
const messageOf = (root: string, rev = 'HEAD'): string => git(root, ['log', '-1', '--format=%B', rev]);

/** The lines of a message's final paragraph (the text after its last blank line). */
function finalParagraph(message: string): string[] {
  const paragraphs = message.replace(/\n+$/, '').split(/\n\n+/);
  return (paragraphs[paragraphs.length - 1] as string).split('\n');
}

/** The commits `root` gained after `before`, oldest first. */
const commitsSince = (root: string, before: string): string[] =>
  git(root, ['rev-list', '--reverse', `${before}..HEAD`]).trim().split('\n').filter((sha) => sha.length > 0);

const coAuthorByGit = (root: string, rev = 'HEAD'): string => git(root, ['log', '-1', '--format=%(trailers:key=Co-Authored-By,valueonly)', rev]).trim();

/** One operation of `spec-018` §2.1 on the fixture: its registry name, its invocation, and what it needs first. */
interface AttributedCase {
  readonly operation: string;
  readonly args: readonly string[];
  /** Run with no marker before the case (its own commit), when the target must exist first. */
  readonly prepare?: readonly string[];
}

const ATTRIBUTED_CASES: readonly AttributedCase[] = [
  { operation: 'memoryAdd', args: ['memory', 'add', '--type', 'task', '--title', 'A probe'] },
  { operation: 'memorySubmit', args: ['memory', 'submit', 'task-006-submit-me'] },
  { operation: 'memoryDeprecate', args: ['memory', 'deprecate', 'task-004-deprecate-me'] },
  { operation: 'memoryPark', args: ['memory', 'park', 'task-005-park-me', '--reason', 'r'] },
  { operation: 'dnaSet', args: ['dna', 'set', 'modules.core.path', '--value', 'src/kernel'] },
  { operation: 'dnaAdd', args: ['dna', 'add', 'stacks.technologies', '--value', 'Jest', '--entry-category', 'testing'] },
  { operation: 'dnaUpdate', args: ['dna', 'update', 'stacks.technologies.TypeScript', '--entry-version', '5'] },
  { operation: 'dnaRemove', args: ['dna', 'remove', 'stacks.technologies.TypeScript'] },
  { operation: 'directiveCreate', args: ['directive', 'create', '--name', 'lint-rules'] },
  { operation: 'directiveAssign', args: ['directive', 'assign', '--directive', 'testing', '--role', 'approver'] },
  { operation: 'directiveRemove', args: ['directive', 'remove', 'lint-rules'], prepare: ['directive', 'create', '--name', 'lint-rules'] },
  { operation: 'workflowStart', args: ['workflow', 'start', 'report'] },
  { operation: 'workflowEnd', args: ['workflow', 'end', 'report-1-plan'] },
  { operation: 'workflowCreate', args: ['workflow', 'create', 'probe-flow', '--kind', 'main'] },
  { operation: 'workflowRemove', args: ['workflow', 'remove', 'probe-flow'], prepare: ['workflow', 'create', 'probe-flow', '--kind', 'main'] },
  { operation: 'workflowAdopt', args: ['workflow', 'adopt', 'adoptable-1-plan', '--step', 'adoptable.seed', '--element', 'adr:adr-001-adopt-me', '--reason', 'r'] },
  { operation: 'workflowFinalize', args: ['workflow', 'finalize', 'notes-1-plan', '--reason', 'r'] },
];

/** The four operations that are approver-gated in every form (`spec-018` §0, §3.1): no attribution half (§2.6). */
const ALWAYS_GATED = ['memoryApprove', 'memoryReject', 'memoryAmend', 'workflowRekey'];

/** Every registered `mutates: true` operation that takes the agent attribution, sorted (`spec-018` §2.1). */
function attributedOperations(): string[] {
  return CORE_MODULES.flatMap((module) => Object.values(module.operations))
    .filter((operation) => operation.mutates && operation.agentAttribution !== false && !ALWAYS_GATED.includes(operation.name))
    .map((operation) => operation.name)
    .sort();
}

describe('task-334 AC 1 — every spec-018 §2.1 commit in an agent context ends with the two trailers (T-11)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(variant: AgentsVariant = 'two'): string {
    const root = buildAttributionRepo({ agents: variant });
    roots.push(root);
    return root;
  }

  it('the case list is the registry: every mutating operation but agentAttribution: false and the four always-gated', () => {
    expect(ATTRIBUTED_CASES.map((attributed) => attributed.operation).sort()).toEqual(attributedOperations());
  });

  it.each(ATTRIBUTED_CASES.map((attributed) => [attributed.args.slice(0, 2).join(' '), attributed] as const))(
    '%s under WINGFOIL_AGENT=Claude: exit 0, each commit\'s final paragraph ends WingFoil-Version:, Co-Authored-By:, AI-Model:',
    (_label, attributed) => {
      const root = repo();
      if (attributed.prepare !== undefined) {
        const prepared = wingfoil(root, attributed.prepare);
        expect({ status: prepared.status, stderr: prepared.stderr }).toEqual({ status: 0, stderr: '' });
      }
      const before = head(root);

      const run = wingfoil(root, attributed.args, { WINGFOIL_AGENT: 'Claude' });

      expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
      const commits = commitsSince(root, before);
      expect(commits.length).toBeGreaterThan(0);
      for (const sha of commits) {
        const message = messageOf(root, sha);
        const paragraph = finalParagraph(message);
        expect(paragraph.slice(-3)).toEqual([stampLine(), CLAUDE_LINE, NOT_REPORTED]);
        for (const line of paragraph.slice(0, -3)) expect(line).toMatch(/^WingFoil-[A-Za-z-]+: /);
        expect(message.match(/^Co-Authored-By:/gim)).toHaveLength(1);
        expect(message.match(/^AI-Model:/gim)).toHaveLength(1);
        expect(coAuthorByGit(root, sha)).toBe('Claude <noreply@anthropic.com>');
      }
    },
    TIMEOUT_MS,
  );

  it('memory deprecate --reason r under WINGFOIL_AGENT=Claude: the Reason: body, then the trailer paragraph', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', 'r'], { WINGFOIL_AGENT: 'Claude' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(messageOf(root)).toBe(`wf(task): deprecate task-004-deprecate-me [draft → deprecated]\n\nReason: r\n\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}\n\n`);
  }, TIMEOUT_MS);
});

describe('task-334 AC 2 — the signing entry follows spec-018 §2.3\'s precedence (T-12, T-13, T-14)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(variant: AgentsVariant = 'two'): string {
    const root = buildAttributionRepo({ agents: variant });
    roots.push(root);
    return root;
  }

  it('T-12: WINGFOIL_AGENT=Claude memory submit --co-author Other --ai-model m-1 → Other, m-1', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'submit', 'task-006-submit-me', '--co-author', 'Other', '--ai-model', 'm-1'], { WINGFOIL_AGENT: 'Claude' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(finalParagraph(messageOf(root)).slice(-2)).toEqual(['Co-Authored-By: Other <other@example.com>', 'AI-Model: m-1']);
    expect(coAuthorByGit(root)).toBe('Other <other@example.com>');
  }, TIMEOUT_MS);

  it('T-13: CLAUDE_CODE_CHILD_SESSION=1 memory add → the claude-code entry, though a first entry without adapter precedes it; no warning', () => {
    const root = repo('unadaptedFirst');
    const run = wingfoil(root, ['memory', 'add', '--type', 'task', '--title', 'A probe'], { CLAUDE_CODE_CHILD_SESSION: '1' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(messageOf(root)).toBe(`wf(task): add task-007-a-probe\n\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}\n\n`);
  }, TIMEOUT_MS);

  it('CODEX_SANDBOX=1 with no codex-cli entry: the first entry, the body line and W_AGENT_ENTRY_GUESSED', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'add', '--type', 'task', '--title', 'A probe'], { CODEX_SANDBOX: '1' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: GUESSED_WARNING });
    expect(messageOf(root)).toBe(`wf(task): add task-007-a-probe\n\n${guessedNote('Claude')}\n\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}\n\n`);
  }, TIMEOUT_MS);

  it('T-14: WINGFOIL_AGENT= (empty) memory park --reason r → the body line first, memory history reads the reason as r alone', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'park', 'task-005-park-me', '--reason', 'r'], { WINGFOIL_AGENT: '' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: GUESSED_WARNING });
    expect(messageOf(root)).toBe(
      `wf(task): park task-005-park-me [in-progress → backlog]\n\n${guessedNote('Claude')}\n\nReason: r\n\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}\n\n`,
    );

    const history = wingfoil(root, ['memory', 'history', 'task-005-park-me', '--format', 'json']);
    expect(history.status).toBe(0);
    const entries = (JSON.parse(history.stdout) as { entries: { operation: string | null; reason: string | null }[] }).entries;
    expect(entries[entries.length - 1]).toMatchObject({ operation: 'park', reason: 'r' });
  }, TIMEOUT_MS);

  it('WINGFOIL_AGENT= (empty) memory deprecate --reason r: the body line before the Reason: block', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', 'r'], { WINGFOIL_AGENT: '' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: GUESSED_WARNING });
    expect(messageOf(root)).toBe(
      `wf(task): deprecate task-004-deprecate-me [draft → deprecated]\n\n${guessedNote('Claude')}\n\nReason: r\n\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}\n\n`,
    );
  }, TIMEOUT_MS);

  it('WINGFOIL_AGENT= (empty) workflow finalize on a phase without approval: --reason r: the body line first, the phase trailers kept', () => {
    const root = repo();
    const run = wingfoil(root, ['workflow', 'finalize', 'notes-1-plan', '--reason', 'r'], { WINGFOIL_AGENT: '' });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(GUESSED_WARNING);
    expect(messageOf(root)).toBe(
      `workflow: finalize notes-1-plan notes.write\n\n${guessedNote('Claude')}\n\nReason: r\n\nWingFoil-Phase: notes.write completed\nWingFoil-Instance: notes-1-plan\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}\n\n`,
    );
  }, TIMEOUT_MS);

  it('one warning per invocation (D3): WINGFOIL_AGENT= workflow start, which adds its plan through memory add, warns once', () => {
    const root = repo();
    const run = wingfoil(root, ['workflow', 'start', 'report'], { WINGFOIL_AGENT: '' });
    expect(run.status).toBe(0);
    expect(run.stderr.split('\n').filter((line) => line.includes('W_AGENT_ENTRY_GUESSED'))).toEqual([GUESSED_WARNING.replace(/\n$/, '')]);
  }, TIMEOUT_MS);
});

describe('task-334 AC 3 — the model identifier and the --ai-model refusals (spec-018 §2.4, T-21; D4)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(): string {
    const root = buildAttributionRepo();
    roots.push(root);
    return root;
  }
  const SUBMIT = ['memory', 'submit', 'task-006-submit-me'] as const;
  const ADD = ['memory', 'add', '--type', 'task', '--title', 'A probe'] as const;

  it.each<[string, readonly string[], Record<string, string>, string]>([
    ['--ai-model m-1', ['--ai-model', 'm-1'], { WINGFOIL_AGENT: 'Claude' }, 'AI-Model: m-1'],
    ['WINGFOIL_AGENT_MODEL=m-2 alone', [], { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: 'm-2' }, 'AI-Model: m-2'],
    ['both: --ai-model wins', ['--ai-model', 'm-1'], { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: 'm-2' }, 'AI-Model: m-1'],
    ['neither', [], { WINGFOIL_AGENT: 'Claude' }, NOT_REPORTED],
    ['a blank WINGFOIL_AGENT_MODEL counts as unset', [], { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: ' ' }, NOT_REPORTED],
    ['--ai-model \' m-1 \' is trimmed', ['--ai-model', ' m-1 '], { WINGFOIL_AGENT: 'Claude' }, 'AI-Model: m-1'],
  ])('%s → %s', (_label, extraArgs, env, line) => {
    const root = repo();
    const run = wingfoil(root, [...SUBMIT, ...extraArgs], env);
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(finalParagraph(messageOf(root)).slice(-1)).toEqual([line]);
  }, TIMEOUT_MS);

  it.each<[string, readonly string[], Record<string, string>, string]>([
    [
      'T-21 --ai-model m-1 with no marker',
      ['--ai-model', 'm-1'],
      {},
      'error: invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)\n',
    ],
    ['--ai-model $\'a\\nb\' with a marker', ['--ai-model', 'a\nb'], { WINGFOIL_AGENT: 'Claude' }, 'error: invalid flag value: --ai-model must be one line\n'],
    ['--ai-model \'\' with a marker (D4)', ['--ai-model', ''], { WINGFOIL_AGENT: 'Claude' }, 'error: invalid flag value: --ai-model must not be blank\n'],
    [
      'WINGFOIL_AGENT_MODEL=$\'a\\nb\' with a marker (D4)',
      [],
      { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: 'a\nb' },
      'error: invalid environment value: WINGFOIL_AGENT_MODEL must be one line\n',
    ],
  ])('%s: exit 2, the usage line, nothing written', (_label, extraArgs, env, stderr) => {
    const root = repo();
    const before = gitState(root);
    const unchanged = snapshotPersistence(root, ['docs/tasks/task-007-a-probe.md']);
    const run = wingfoil(root, [...ADD, ...extraArgs], env);
    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 2, stdout: '', stderr });
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, 'refused --ai-model');
  }, TIMEOUT_MS);

  it('the combination check runs before resolveRoot(): outside a repository, the same exit 2 line', () => {
    const outside = mkdtempSync(join(tmpdir(), 'wf-no-repo-'));
    try {
      const run = wingfoil(outside, [...ADD, '--ai-model', 'm-1']);
      expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({
        status: 2,
        stdout: '',
        stderr: 'error: invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)\n',
      });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  }, TIMEOUT_MS);

  it('a gated command with a marker and --ai-model m-1: E_AGENT_CONTEXT, exit 1', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'approve', 'task-001-approve-me', '--reason', 'r', '--ai-model', 'm-1'], { WINGFOIL_AGENT: 'Claude' });
    expect(run.status).toBe(1);
    expect(run.stderr.startsWith("error: E_AGENT_CONTEXT: 'memory approve' needs the approver")).toBe(true);
  }, TIMEOUT_MS);

  it('a gated command with no marker and --ai-model m-1: the combination refusal, exit 2 (usage first)', () => {
    const root = repo();
    const run = wingfoil(root, ['memory', 'approve', 'task-001-approve-me', '--reason', 'r', '--ai-model', 'm-1']);
    expect({ status: run.status, stderr: run.stderr }).toEqual({
      status: 2,
      stderr: 'error: invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)\n',
    });
  }, TIMEOUT_MS);
});

describe('task-334 AC 4 — the refusals of the trailer half write nothing; no entry at all only warns (T-15, T-16, T-17)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(variant: AgentsVariant = 'two'): string {
    const root = buildAttributionRepo({ agents: variant });
    roots.push(root);
    return root;
  }
  const ADD = ['memory', 'add', '--type', 'task', '--title', 'A probe'] as const;

  it.each<[string, AgentsVariant, readonly string[], Record<string, string>, string]>([
    [
      'T-15 WINGFOIL_AGENT=Nobody',
      'two',
      [],
      { WINGFOIL_AGENT: 'Nobody' },
      "error: unknown team.agents entry 'Nobody' (from WINGFOIL_AGENT): the committed dna.yaml declares Claude, Other\n",
    ],
    ['--co-author Nobody', 'two', ['--co-author', 'Nobody'], {}, "error: unknown team.agents entry 'Nobody' (from --co-author): the committed dna.yaml declares Claude, Other\n"],
    [
      'WINGFOIL_AGENT=Claude with team.agents: [] (D6)',
      'none',
      [],
      { WINGFOIL_AGENT: 'Claude' },
      "error: unknown team.agents entry 'Claude' (from WINGFOIL_AGENT): the committed dna.yaml declares none\n",
    ],
    [
      'T-16 --co-author NoMail',
      'noMail',
      ['--co-author', 'NoMail'],
      {},
      "error: team.agents entry 'NoMail' has no email, and a commit it co-authors must name one; declare it first (wingfoil dna update team.agents.NoMail --entry-email <address>), then retry\n",
    ],
  ])('%s: exit 1, the §2.5 line, HEAD, index and tree unchanged, no file created; --dry-run refused identically', (_label, variant, extraArgs, env, stderr) => {
    const root = repo(variant);
    const before = gitState(root);
    const unchanged = snapshotPersistence(root, ['docs/tasks/task-007-a-probe.md']);

    const run = wingfoil(root, [...ADD, ...extraArgs], env);
    const dry = wingfoil(root, [...ADD, ...extraArgs, '--dry-run'], env);

    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({ status: 1, stdout: '', stderr });
    expect({ status: dry.status, stdout: dry.stdout, stderr: dry.stderr }).toEqual({ status: 1, stdout: '', stderr });
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, 'refused attribution');
  }, TIMEOUT_MS);

  it('T-17: CLAUDE_CODE_CHILD_SESSION=1 with team.agents: []: exit 0, no agent trailer, W_NO_AGENT_ENTRY on stderr', () => {
    const root = repo('none');
    const run = wingfoil(root, [...ADD], { CLAUDE_CODE_CHILD_SESSION: '1' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({
      status: 0,
      stderr:
        "warning: W_NO_AGENT_ENTRY: this command runs in an agent's session (CLAUDE_CODE_CHILD_SESSION is set) but dna.yaml declares no team.agents entry, so its commit names no AI co-author; declare one (wingfoil dna add team.agents …)\n",
    });
    expect(messageOf(root)).toBe(`wf(task): add task-007-a-probe\n\n${stampLine()}\n\n`);
  }, TIMEOUT_MS);
});

describe('task-334 AC 5 — no marker, no change (T-10); --dry-run shows the two trailers (T-20, second half)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  function repo(): string {
    const root = buildAttributionRepo();
    roots.push(root);
    return root;
  }

  /**
   * T-10's fixtures: the `%B` of each commit, copied from a real run of the code build at this branch's head
   * (`0.3.2 (007fc72387d7c9aa908b3a890a5ef02b6b44722e)`) with no marker, on this suite's fixture — the stamp
   * replaced by the running build's. The producing command is recorded in the task's red notes.
   */
  const T10: readonly [string, readonly string[], (stamp: string) => string][] = [
    ['memory add', ['memory', 'add', '--type', 'task', '--title', 'A probe'], (stamp) => `wf(task): add task-007-a-probe\n\n${stamp}\n\n`],
    ['memory submit', ['memory', 'submit', 'task-006-submit-me'], (stamp) => `wf(task): submit task-006-submit-me\n\n${stamp}\n\n`],
    [
      'memory approve',
      ['memory', 'approve', 'task-001-approve-me', '--reason', 'r'],
      (stamp) => `wf(task): approve task-001-approve-me [pending → backlog]\n\nApprover: WingFoil Test <wf-test@example.invalid> (approver)\nReason: r\n\n${stamp}\n\n`,
    ],
    [
      'workflow finalize (a phase without approval:)',
      ['workflow', 'finalize', 'notes-1-plan', '--reason', 'r'],
      (stamp) => `workflow: finalize notes-1-plan notes.write\n\nReason: r\n\nWingFoil-Phase: notes.write completed\nWingFoil-Instance: notes-1-plan\n${stamp}\n\n`,
    ],
  ];

  it.each(T10)('T-10 %s with no marker: exit 0, the commit byte-identical to the pre-L0 fixture', (_label, args, expected) => {
    const root = repo();
    const run = wingfoil(root, args);
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(messageOf(root)).toBe(expected(stampLine()));
  }, TIMEOUT_MS);

  it.each(['json', 'console'])('T-20: WINGFOIL_AGENT=Claude memory submit --dry-run --format %s: the message ends with the two trailers, tree unchanged', (format) => {
    const root = repo();
    const before = gitState(root);
    const unchanged = snapshotPersistence(root);

    const run = wingfoil(root, ['memory', 'submit', 'task-006-submit-me', '--dry-run', '--format', format], { WINGFOIL_AGENT: 'Claude' });

    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    // Both formats print the plan as JSON today (`--format console` pretty-printed), copied from a real run.
    const plan = JSON.parse(run.stdout) as { dryRun: boolean; message: string };
    expect(plan.dryRun).toBe(true);
    expect(plan.message).toBe(`wf(task): submit task-006-submit-me\n\n${stampLine()}\n${CLAUDE_LINE}\n${NOT_REPORTED}`);
    expect(gitState(root)).toEqual(before);
    assertPersistenceUnchanged(root, unchanged, 'T-20');
  }, TIMEOUT_MS);
});

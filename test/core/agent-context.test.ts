/**
 * task-333 AC 1, AC 3 (`spec-018` §1, §2.6, §3.1–§3.2; design "src/core/agent-context.ts", D5) — the new module
 * `src/core/agent-context.ts`, in-process:
 *
 * - `AGENT_MARKERS`: frozen, the four markers of §1 in §1 order, each with its kind and the phrase §3.2 lists;
 * - `resolveAgentContext(root, { env, coAuthor?, gated: true })`: the markers present, in §1 order, a variable that is
 *   defined (empty included) counting, `CLAUDECODE` not; `attribution: null`, and no `team.agents` read — a root whose
 *   `dna.yaml` is not committed still resolves;
 * - `refuseAgentContext(context, command)`: `ok` with no marker; otherwise the §3.2 `VALIDATION` error, its `hint`,
 *   `details.markers` the ids, no value printed;
 * - the registered operations reach it with no CLI in between (D5): an in-process `memoryApprove` reads
 *   `process.env` when no surface set an invocation (fail-closed), and `withAgentInvocation` hands it an environment
 *   and `--co-author`.
 *
 * Red until the module exists: `tsc` reports TS2307 for `../../src/core/agent-context`, and jest fails the suite on
 * "Cannot find module". Deterministic: pure inputs, throwaway repositories.
 */
import { CORE_MODULES } from '../../src/core';
import {
  AGENT_MARKERS,
  E_AGENT_CONTEXT,
  refuseAgentContext,
  resolveAgentContext,
  withAgentInvocation,
} from '../../src/core/agent-context';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { agentContextRefusal, buildL0Repo } from './helpers/l0-fixture';

interface MarkerView {
  readonly id: string;
  readonly kind: string;
  readonly phrase: string;
}
interface ContextView {
  readonly markers: readonly MarkerView[];
  readonly attribution: unknown;
}

const ids = (context: ContextView): string[] => context.markers.map((marker) => marker.id);

/** A fixture refusal `{ error, hint }` as the `CoreError` it is carried in: `VALIDATION`, the text as `message`. */
const asCoreError = (refusal: { readonly error: string; readonly hint: string }): { code: string; message: string; hint: string } => ({
  code: 'VALIDATION',
  message: refusal.error,
  hint: refusal.hint,
});

/** `resolveAgentContext`'s value; throws on a refusal, which the gated form never returns. */
async function resolved(root: string, request: Record<string, unknown>): Promise<ContextView> {
  const result = (await resolveAgentContext(root, request as never)) as CoreResult<ContextView>;
  if (!result.ok) throw new Error(`refused: ${result.error.message}`);
  return result.value;
}

describe('task-333 AC 1 — AGENT_MARKERS (spec-018 §1)', () => {
  // task-367 (`spec-018` §1 row 5, §1.2; approver ruling D1): the MCP Tools channel joins as the fifth marker, `mcp`.
  it('is frozen and lists WINGFOIL_AGENT, --co-author, CLAUDE_CODE_CHILD_SESSION, CODEX_SANDBOX, mcp, in §1 order', () => {
    const markers = AGENT_MARKERS as readonly MarkerView[];
    expect(Object.isFrozen(markers)).toBe(true);
    expect(markers.map((marker) => marker.id)).toEqual(['WINGFOIL_AGENT', '--co-author', 'CLAUDE_CODE_CHILD_SESSION', 'CODEX_SANDBOX', 'mcp']);
  });

  it('gives each marker its kind and the phrase a refusal lists (§3.2)', () => {
    expect((AGENT_MARKERS as readonly MarkerView[]).map((marker) => [marker.id, marker.kind, marker.phrase])).toEqual([
      ['WINGFOIL_AGENT', 'environment', 'WINGFOIL_AGENT is set'],
      ['--co-author', 'option', '--co-author was given'],
      ['CLAUDE_CODE_CHILD_SESSION', 'environment', 'CLAUDE_CODE_CHILD_SESSION is set'],
      ['CODEX_SANDBOX', 'environment', 'CODEX_SANDBOX is set'],
      ['mcp', 'surface', 'the call came through the MCP server'],
    ]);
  });

  it('names no CLAUDECODE marker (§1: an IDE terminal sets it for the human too)', () => {
    expect((AGENT_MARKERS as readonly MarkerView[]).map((marker) => marker.id)).not.toContain('CLAUDECODE');
  });

  it('exports E_AGENT_CONTEXT', () => {
    expect(E_AGENT_CONTEXT).toBe('E_AGENT_CONTEXT');
  });
});

describe('task-333 AC 1/AC 3 — resolveAgentContext, gated form (spec-018 §2.6)', () => {
  let root: string;
  beforeAll(() => {
    // A repository with a commit but no committed dna.yaml: the gated form reads no team.agents, so it still resolves.
    root = makeTempGitRepo();
    writeFixtureFile(root, 'README.md', 'x\n');
    commitAll(root, 'fixture: no configuration');
    writeFixtureFile(root, '.wingfoil/dna.yaml', 'not: [ valid\n');
  });
  afterAll(() => removeTempDir(root));

  it('T-7 unit: WINGFOIL_AGENT=Nobody → ok, markers [WINGFOIL_AGENT], attribution null, no dna.yaml read', async () => {
    const context = await resolved(root, { env: { WINGFOIL_AGENT: 'Nobody' }, gated: true });
    expect(ids(context)).toEqual(['WINGFOIL_AGENT']);
    expect(context.attribution).toBeNull();
  });

  it.each<[string, Record<string, string>, string | undefined, string[]]>([
    ['no marker', {}, undefined, []],
    ['WINGFOIL_AGENT defined but empty', { WINGFOIL_AGENT: '' }, undefined, ['WINGFOIL_AGENT']],
    ['CLAUDE_CODE_CHILD_SESSION, empty', { CLAUDE_CODE_CHILD_SESSION: '' }, undefined, ['CLAUDE_CODE_CHILD_SESSION']],
    ['CODEX_SANDBOX=seatbelt', { CODEX_SANDBOX: 'seatbelt' }, undefined, ['CODEX_SANDBOX']],
    ['--co-author alone', {}, 'Claude', ['--co-author']],
    ['CLAUDECODE=1 alone', { CLAUDECODE: '1' }, undefined, []],
    ['all four, given in reverse', { CODEX_SANDBOX: '1', CLAUDE_CODE_CHILD_SESSION: '1', WINGFOIL_AGENT: 'Claude' }, 'Other', ['WINGFOIL_AGENT', '--co-author', 'CLAUDE_CODE_CHILD_SESSION', 'CODEX_SANDBOX']],
  ])('%s → markers in §1 order', async (_label, env, coAuthor, expected) => {
    const context = await resolved(root, { env, ...(coAuthor === undefined ? {} : { coAuthor }), gated: true });
    expect(ids(context)).toEqual(expected);
    expect(context.attribution).toBeNull();
  });

  // task-367 (`spec-018` §1 row 5, §1.2, §2.6; approver ruling D1): the MCP registrar's invocation carries the surface.
  it('task-367: { env: {}, surface: mcp } → markers [mcp], attribution null', async () => {
    const context = await resolved(root, { env: {}, surface: 'mcp', gated: true });
    expect(ids(context)).toEqual(['mcp']);
    expect(context.attribution).toBeNull();
  });

  it('task-367: { env: { CLAUDE_CODE_CHILD_SESSION }, surface: mcp } → the environment marker, then mcp, in §1 order', async () => {
    const context = await resolved(root, { env: { CLAUDE_CODE_CHILD_SESSION: '1' }, surface: 'mcp', gated: true });
    expect(ids(context)).toEqual(['CLAUDE_CODE_CHILD_SESSION', 'mcp']);
  });
});

describe('task-333 AC 1 — refuseAgentContext (spec-018 §3.1–§3.2)', () => {
  const contextOf = (markerIds: readonly string[]): ContextView => ({
    markers: (AGENT_MARKERS as readonly MarkerView[]).filter((marker) => markerIds.includes(marker.id)),
    attribution: null,
  });

  it('no marker → ok', async () => {
    const result = (await refuseAgentContext(contextOf([]) as never, 'memory approve')) as CoreResult<void>;
    expect(result.ok).toBe(true);
  });

  it.each<[string, string[], string]>([
    ['memory approve', ['WINGFOIL_AGENT'], 'WINGFOIL_AGENT is set'],
    ['workflow adopt --plan --apply', ['WINGFOIL_AGENT', 'CODEX_SANDBOX'], 'WINGFOIL_AGENT is set, CODEX_SANDBOX is set'],
    ['workflow rekey', ['--co-author', 'CLAUDE_CODE_CHILD_SESSION'], '--co-author was given, CLAUDE_CODE_CHILD_SESSION is set'],
  ])("'%s' with %j → VALIDATION, the §3.2 message and hint, details.markers the ids", async (command, markerIds, phrases) => {
    const result = (await refuseAgentContext(contextOf(markerIds) as never, command)) as CoreResult<void>;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const { error, hint } = agentContextRefusal(command, phrases);
    expect(result.error).toEqual({ code: 'VALIDATION', message: error, hint, details: { markers: markerIds } });
  });
});

function memoryFn(name: string): CoreFn<unknown, unknown> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (operation === undefined) throw new Error(`fixture bug: ${name} is not registered`);
  return operation.fn as CoreFn<unknown, unknown>;
}

describe('task-333 AC 1 — the registered operation refuses in-process too (design D5: fail-closed on process.env)', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(removeTempDir));
  const saved = process.env.WINGFOIL_AGENT;
  afterEach(() => {
    if (saved === undefined) delete process.env.WINGFOIL_AGENT;
    else process.env.WINGFOIL_AGENT = saved;
  });

  const approve = (root: string): Promise<CoreResult<unknown>> =>
    memoryFn('memoryApprove')({ root, positional: 'task-001-approve-me', options: { reason: 'r' } }) as Promise<CoreResult<unknown>>;

  it('memoryApprove with WINGFOIL_AGENT in process.env and no invocation set: E_AGENT_CONTEXT, nothing written', async () => {
    const root = buildL0Repo();
    roots.push(root);
    const unchanged = snapshotPersistence(root);
    process.env.WINGFOIL_AGENT = 'Claude';

    const result = await approve(root);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject(asCoreError(agentContextRefusal('memory approve', 'WINGFOIL_AGENT is set')));
    assertPersistenceUnchanged(root, unchanged, 'in-process refusal');
  });

  it('withAgentInvocation({ env, coAuthor }) hands the operation its markers: --co-author was given', async () => {
    const root = buildL0Repo();
    roots.push(root);
    const unchanged = snapshotPersistence(root);

    const result = (await withAgentInvocation({ env: withoutAgentMarkers(process.env), coAuthor: 'Claude' } as never, () => approve(root))) as CoreResult<unknown>;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject(asCoreError(agentContextRefusal('memory approve', '--co-author was given')));
    assertPersistenceUnchanged(root, unchanged, 'in-process --co-author refusal');
  });

  it('withAgentInvocation with an unmarked env decides over process.env: the approve succeeds', async () => {
    const root = buildL0Repo();
    roots.push(root);
    process.env.WINGFOIL_AGENT = 'Claude';

    const result = (await withAgentInvocation({ env: withoutAgentMarkers(process.env) } as never, () => approve(root))) as CoreResult<unknown>;

    expect(result.ok).toBe(true);
  });
});

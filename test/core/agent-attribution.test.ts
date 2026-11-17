/**
 * task-334 AC 2, AC 3, AC 4 (the core half) (`spec-018` §2.3–§2.6; design "src/core/agent-context.ts", D4, D5, D6) —
 * the ungated form of `resolveAgentContext(root, { env, coAuthor?, aiModel?, gated: false })`, in-process on a
 * committed fixture repository (`./helpers/attribution-fixture.ts`), where coverage sees it. The CLI drive is
 * `test/cli/agent-attribution.integration.test.ts`.
 *
 * - The signing entry by §2.3's precedence: `--co-author`, then a non-blank `WINGFOIL_AGENT`, then the entry whose
 *   `adapter` is the vendor marker's built-in adapter, then the first entry with `note` (the body line) and the
 *   `W_AGENT_ENTRY_GUESSED` warning;
 * - the model by §2.4 as D4 rules it: `aiModel` (trimmed), else a non-blank `WINGFOIL_AGENT_MODEL` (trimmed), else
 *   `not-reported`;
 * - §2.5's refusals as `VALIDATION` errors (an unknown name, the empty `team.agents` included per D6; a signing entry
 *   without email); a vendor marker with no entry: `attribution: null` and `W_NO_AGENT_ENTRY` (D5's marker phrases);
 * - no marker: `attribution: null`, no warning; `gated: true` keeps task-333's shape (`test/core/agent-context.test.ts`).
 *
 * Red until green: today the function returns the markers with `attribution: null` for every request and never
 * refuses. Every `env` is an explicit object, never `process.env` (pure inputs). Deterministic.
 */
import { resolveAgentContext } from '../../src/core/agent-context';
import type { CoreResult } from '../../src/core/types';
import { removeTempDir } from '../storage/helpers/git-fixture';
import { buildAttributionRepo, type AgentsVariant } from './helpers/attribution-fixture';

const CLAUDE = { name: 'Claude', email: 'noreply@anthropic.com' } as const;
const OTHER = { name: 'Other', email: '0+other@users.noreply.github.com' } as const;
const guessedNote = (name: string): string => `Attributed to the first team.agents entry, ${name}: no entry is named for this agent.`;

interface Request {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly coAuthor?: string;
  readonly aiModel?: string;
}

describe('task-334 — resolveAgentContext, ungated: the signing entry, the model, the refusals and the warnings', () => {
  const roots = new Map<AgentsVariant, string>();
  afterAll(() => [...roots.values()].forEach(removeTempDir));
  function repo(variant: AgentsVariant = 'two'): string {
    if (!roots.has(variant)) roots.set(variant, buildAttributionRepo({ agents: variant }));
    return roots.get(variant) as string;
  }
  const resolve = (request: Request, variant: AgentsVariant = 'two'): CoreResult<unknown> =>
    resolveAgentContext(repo(variant), { ...request, gated: false }) as CoreResult<unknown>;
  const attributionOf = (result: CoreResult<unknown>): unknown => (result.ok ? (result.value as { attribution: unknown }).attribution : result.error);
  const warningsOf = (result: CoreResult<unknown>): readonly string[] => (result.ok ? (result.warnings ?? []) : ['<refused>']);

  it('no marker: attribution null, no warning', () => {
    const result = resolve({ env: {} });
    expect(result.ok).toBe(true);
    expect(attributionOf(result)).toBeNull();
    expect(warningsOf(result)).toEqual([]);
  });

  it('rule 2 — WINGFOIL_AGENT=Claude: Claude, model not-reported, no note, no warning', () => {
    const result = resolve({ env: { WINGFOIL_AGENT: 'Claude' } });
    expect(attributionOf(result)).toEqual({ ...CLAUDE, model: 'not-reported' });
    expect(warningsOf(result)).toEqual([]);
  });

  it('rule 1 — --co-author Other wins over WINGFOIL_AGENT=Claude; --ai-model m-1 fills the model (T-12)', () => {
    const result = resolve({ env: { WINGFOIL_AGENT: 'Claude' }, coAuthor: 'Other', aiModel: 'm-1' });
    expect(attributionOf(result)).toEqual({ ...OTHER, model: 'm-1' });
    expect(warningsOf(result)).toEqual([]);
  });

  it('rule 1 alone — --co-author Claude with no environment marker: Claude', () => {
    expect(attributionOf(resolve({ env: {}, coAuthor: 'Claude' }))).toEqual({ ...CLAUDE, model: 'not-reported' });
  });

  it('rule 3 — CLAUDE_CODE_CHILD_SESSION=1 picks the claude-code entry though a first entry without adapter precedes it (T-13)', () => {
    const result = resolve({ env: { CLAUDE_CODE_CHILD_SESSION: '1' } }, 'unadaptedFirst');
    expect(attributionOf(result)).toEqual({ ...CLAUDE, model: 'not-reported' });
    expect(warningsOf(result)).toEqual([]);
  });

  it('rule 4 — a blank WINGFOIL_AGENT: the first entry, with the note and W_AGENT_ENTRY_GUESSED (T-14)', () => {
    const result = resolve({ env: { WINGFOIL_AGENT: '' } }, 'unadaptedFirst');
    expect(attributionOf(result)).toEqual({ name: 'Plain', email: '0+plain@users.noreply.github.com', model: 'not-reported', note: guessedNote('Plain') });
    expect(warningsOf(result)).toEqual([`W_AGENT_ENTRY_GUESSED: ${guessedNote('Plain')}`]);
  });

  it('rule 4 — CODEX_SANDBOX=1 with no codex-cli entry: the first entry, guessed', () => {
    const result = resolve({ env: { CODEX_SANDBOX: '1' } });
    expect(attributionOf(result)).toEqual({ ...CLAUDE, model: 'not-reported', note: guessedNote('Claude') });
    expect(warningsOf(result)).toEqual([`W_AGENT_ENTRY_GUESSED: ${guessedNote('Claude')}`]);
  });

  it.each<[string, Request, string]>([
    ['WINGFOIL_AGENT_MODEL=m-2 alone', { env: { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: 'm-2' } }, 'm-2'],
    ['--ai-model over WINGFOIL_AGENT_MODEL', { env: { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: 'm-2' }, aiModel: 'm-1' }, 'm-1'],
    ['a blank WINGFOIL_AGENT_MODEL counts as unset (D4)', { env: { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: ' ' } }, 'not-reported'],
    ['--ai-model trimmed (D4)', { env: { WINGFOIL_AGENT: 'Claude' }, aiModel: ' m-1 ' }, 'm-1'],
    ['WINGFOIL_AGENT_MODEL trimmed (D4)', { env: { WINGFOIL_AGENT: 'Claude', WINGFOIL_AGENT_MODEL: ' m-2 ' } }, 'm-2'],
  ])('the model — %s → %s', (_label, request, model) => {
    expect(attributionOf(resolve(request))).toEqual({ ...CLAUDE, model });
  });

  it.each<[string, Request, AgentsVariant, string]>([
    [
      'WINGFOIL_AGENT=Nobody (T-15)',
      { env: { WINGFOIL_AGENT: 'Nobody' } },
      'two',
      "unknown team.agents entry 'Nobody' (from WINGFOIL_AGENT): the committed dna.yaml declares Claude, Other",
    ],
    ['--co-author Nobody', { env: {}, coAuthor: 'Nobody' }, 'two', "unknown team.agents entry 'Nobody' (from --co-author): the committed dna.yaml declares Claude, Other"],
    [
      '--co-author Claude with team.agents: [] (D6)',
      { env: {}, coAuthor: 'Claude' },
      'none',
      "unknown team.agents entry 'Claude' (from --co-author): the committed dna.yaml declares none",
    ],
    [
      '--co-author NoMail, an entry with no email (T-16)',
      { env: {}, coAuthor: 'NoMail' },
      'noMail',
      "team.agents entry 'NoMail' has no email, and a commit it co-authors must name one; declare it first (wingfoil dna update team.agents.NoMail --entry-email <address>), then retry",
    ],
  ])('refused — %s: VALIDATION with spec-018 §2.5\'s message', (_label, request, variant, message) => {
    const result = resolve(request, variant);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect({ code: result.error.code, message: result.error.message }).toEqual({ code: 'VALIDATION', message });
  });

  it('a vendor marker with team.agents: []: attribution null and W_NO_AGENT_ENTRY naming the marker (T-17, D5)', () => {
    const result = resolve({ env: { CLAUDE_CODE_CHILD_SESSION: '1' } }, 'none');
    expect(result.ok).toBe(true);
    expect(attributionOf(result)).toBeNull();
    expect(warningsOf(result)).toEqual([
      "W_NO_AGENT_ENTRY: this command runs in an agent's session (CLAUDE_CODE_CHILD_SESSION is set) but dna.yaml declares no team.agents entry, so its commit names no AI co-author; declare one (wingfoil dna add team.agents …)",
    ]);
  });

  it('a blank WINGFOIL_AGENT and CODEX_SANDBOX with team.agents: []: the markers listed in §1 order in W_NO_AGENT_ENTRY (D5)', () => {
    const result = resolve({ env: { CODEX_SANDBOX: '1', WINGFOIL_AGENT: '' } }, 'none');
    expect(attributionOf(result)).toBeNull();
    expect(warningsOf(result)).toEqual([
      "W_NO_AGENT_ENTRY: this command runs in an agent's session (WINGFOIL_AGENT is set, CODEX_SANDBOX is set) but dna.yaml declares no team.agents entry, so its commit names no AI co-author; declare one (wingfoil dna add team.agents …)",
    ]);
  });

  it('gated: true keeps task-333\'s shape — markers only, attribution null, no refusal on an unknown name', () => {
    const result = resolveAgentContext(repo(), { env: { WINGFOIL_AGENT: 'Nobody' }, gated: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attribution).toBeNull();
    expect(result.value.markers.map((marker) => marker.id)).toEqual(['WINGFOIL_AGENT']);
    expect(result.warnings).toBeUndefined();
  });
});

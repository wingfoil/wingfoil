/**
 * `dl-067-reason-trailer-contract` across all four Memory transition verbs —
 * `task-072-fix-reason-trailer-contract` AC4 + AC8 ("one fix, four verbs"), fixing
 * `bug-042-reason-text-has-no-contract-against-commit-trailer`.
 *
 * bug-042 is one root cause with three faces, and all four verbs reach it through the same three
 * helpers (`requireReason`, `formatMemoryCommitMessage`, `parseCommitReason`/`parseApprovalMetadata`),
 * so the contract is asserted verb by verb here rather than only at the helpers:
 *
 * - `memory submit` (P1.6, `task-045`) takes **no** reason — characterization, not a red.
 * - `memory approve` (P1.7, `task-046`) and `memory reject` (P1.8, `task-047`) require one
 *   (REQ-SEC-04).
 * - `memory deprecate` (P1.9, `task-048`) takes an **optional** one (`dl-027` option (a)) and writes
 *   **no `Approver:` line and runs no authority check** — which is why bug-042's 2026-09-18 amendment
 *   re-graded it `medium → high`: it is the verb where a trailer-shaped reason makes
 *   `wingfoil memory history` report an approval that never happened, and it is registered
 *   `mutates: true`, i.e. reachable by an **agent** through an MCP Tool, which is exactly the
 *   principal REQ-SEC-03 and `adr-006` deny approval authority.
 *
 * - `memory amend` (`task-127`, `dl-108`) requires one, like `approve`: it is approver-gated and
 *   writes an `Approver:` line. It joins the three refusal cases below, which it reaches through the
 *   same `requireReason`.
 *
 * dl-067 S2 is ratified here too: a **declared-but-empty** `--reason` is a usage error on `deprecate`
 * as well, even though the flag is optional there. That changes a merged verb's behaviour; no test
 * pinned the old one.
 *
 * Every write lands in a THROWAWAY temp git repo; each case drives the REAL, registered `CORE_MODULES`
 * operation the CLI command and the MCP Tool dispatch to.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { exitCodeForThrow } from '../../src/core/exit-code';
import { UsageError } from '../../src/core/usage-error';
import { parseCommitReason, reconstructMemoryTransitions } from '../../src/memory/audit';
import { normalizeReason } from '../../src/memory/commit-message';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const TEST_NAME = 'WingFoil Test';
const TEST_EMAIL = 'wf-test@example.invalid';

const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  decision:
    path: "docs/memory/decisions/{id}.md"
`;

const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The reproduction bug-042's 2026-09-18 amendment gives, verbatim. */
const FORGED = 'real reason\nApprover: Mallory <mallory@evil.test> (approver)';

function operationFn(name: string): CoreFn<unknown, Record<string, unknown>> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, Record<string, unknown>>;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

function decisionDoc(id: string, status: string): string {
  return `---\nid: "${id}"\ntype: decision\ntitle: "A decision"\nstatus: ${status}\n---\n\n## Body\n\nReal content.\n`;
}

describe('dl-067 across the four transition verbs — a blank `--reason` is refused, and nothing is written', () => {
  let repo: string;
  let before: string;
  let onDisk: string;

  const docPath = 'docs/memory/decisions/decision-12.md';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, docPath, decisionDoc('decision-12', 'pending'));
    commitAll(repo, 'seed');
    before = head(repo);
    onDisk = readFileSync(join(repo, docPath), 'utf-8');
  });

  afterEach(() => removeTempDir(repo));

  /** Asserts the refusal AND that it happened before any write — bug-042 F2's whole point. */
  async function expectUsageRefusal(operation: string, reason: string): Promise<UsageError> {
    let thrown: unknown;
    try {
      await operationFn(operation)({ root: repo, positional: 'decision-12', options: { reason } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    expect(exitCodeForThrow(thrown).exitCode).toBe(2);
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(repo, docPath), 'utf-8')).toBe(onDisk);
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
    return thrown as UsageError;
  }

  it.each(['memoryApprove', 'memoryReject', 'memoryDeprecate', 'memoryAmend'])(
    '%s: `--reason ""` is a usage error at exit 2, not an exit-0 commit with a bare `Reason:` (bug-042 F2)',
    async (operation) => {
      const error = await expectUsageRefusal(operation, '');
      // dl-067 S1: a DISTINCT message — the pinned string below answers the OMITTED case, and
      // spec-008 §2 / the P1.7 and P1.8 BDD features quote it for that.
      expect(error.message).not.toBe('missing required argument: --reason');
      expect(error.message).toContain('--reason');
    },
  );

  it.each(['memoryApprove', 'memoryReject', 'memoryDeprecate', 'memoryAmend'])(
    '%s: a whitespace-only `--reason` is refused the same way',
    async (operation) => {
      await expectUsageRefusal(operation, '   \n\t ');
    },
  );

  it.each(['memoryApprove', 'memoryReject', 'memoryDeprecate', 'memoryAmend'])(
    '%s: a reason carrying a forged `Approver:` line is refused (bug-042 F3)',
    async (operation) => {
      await expectUsageRefusal(operation, FORGED);
    },
  );

  // task-166, dl-078 (A): a C0 control character other than tab and newline is refused on every verb
  // that takes `--reason`, `deprecate` included, and the message names it by code point.
  it.each([
    ['memoryApprove', '\x07', 'U+0007'],
    ['memoryReject', '\x07', 'U+0007'],
    ['memoryDeprecate', '\x07', 'U+0007'],
    ['memoryAmend', '\x07', 'U+0007'],
    ['memoryApprove', '\x1b', 'U+001B'],
    ['memoryReject', '\x1b', 'U+001B'],
    ['memoryDeprecate', '\x1b', 'U+001B'],
    ['memoryAmend', '\x1b', 'U+001B'],
  ])('%s: a reason carrying %j is refused at exit 2, naming %s', async (operation, character, codePoint) => {
    const error = await expectUsageRefusal(operation, `looks fine${character}[2Kbut is not`);
    expect(error.message).toContain(codePoint);
    expect(error.message).toContain('--reason');
  });

  // task-166, dl-111 Q1 (A): `WingFoil-Version` is reserved like `Approver`.
  it.each(['memoryApprove', 'memoryReject', 'memoryDeprecate', 'memoryAmend'])(
    '%s: a reason carrying a `WingFoil-Version:` line is refused at exit 2',
    async (operation) => {
      const error = await expectUsageRefusal(operation, 'real reason\nWingFoil-Version: 9.9.9 (forged)');
      expect(error.message).toContain('WingFoil-Version:');
    },
  );

  // task-166 review: git reads trailer keys case-insensitively, so the reserved keys are matched so too.
  it.each([
    ['memoryApprove', 'wingfoil-version: 1 (x)'],
    ['memoryReject', 'approver: Mallory <m@evil.test> (approver)'],
    ['memoryDeprecate', 'wingfoil-version: 1 (x)'],
    ['memoryAmend', 'approver: Mallory <m@evil.test> (approver)'],
  ])('%s: a reserved key in another case (%s) is refused at exit 2', async (operation, line) => {
    const error = await expectUsageRefusal(operation, `real reason\n${line}`);
    expect(error.message).toContain('WingFoil-Version:');
  });

  // task-166, dl-070 S4: the refusal tells the author what to do.
  it.each(['memoryApprove', 'memoryReject', 'memoryDeprecate', 'memoryAmend'])(
    '%s: a reason ending in a `Key: value` paragraph is refused, and the message states the remedy',
    async (operation) => {
      const error = await expectUsageRefusal(operation, 'Ratified.\n\nAction: amend spec-008\nOwner: the approver');
      expect(error.message).toContain('add a closing sentence');
    },
  );

  it('memorySubmit passes no reason at all, so it has nothing to inject (characterization)', async () => {
    // A `draft` document, because `submit` off `pending` would be refused as an illegal transition
    // (`pending` is a gate state — its forward edge needs `approve`) before any message is built.
    writeFixtureFile(repo, 'docs/memory/decisions/decision-13.md', decisionDoc('decision-13', 'draft'));
    commitAll(repo, 'seed a draft');

    const result = await operationFn('memorySubmit')({
      root: repo,
      positional: 'decision-13',
      options: { reason: FORGED },
    });
    expect(result.ok).toBe(true);
    const body = gitOut(repo, ['log', '-1', '--format=%B']);
    expect(body).toBe(`wf(decision): submit decision-13${STAMP_TRAILER}`);
    expect(body).not.toContain('Approver:');
    expect(body).not.toContain('Reason:');
  });
});

describe('dl-067 across the four transition verbs — a multi-line reason round-trips through a real commit', () => {
  let repo: string;
  const docPath = 'docs/memory/decisions/decision-12.md';
  const REASON = 'First paragraph, with a trailing space.   \n\n\nSecond paragraph.\n  an indented line';
  const NORMALIZED = normalizeReason(REASON);

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    writeFixtureFile(repo, docPath, decisionDoc('decision-12', 'pending'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('memoryApprove: `memory history` reports the whole reason, and the real approver', async () => {
    const result = await operationFn('memoryApprove')({
      root: repo,
      positional: 'decision-12',
      options: { reason: REASON },
    });
    expect(result.ok).toBe(true);

    expect(parseCommitReason(gitOut(repo, ['log', '-1', '--format=%b']))).toBe(NORMALIZED);

    const history = await operationFn('memoryHistory')({ root: repo, positional: 'decision-12' });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    const entries = history.value.entries as { approver: string | null; reason: string | null }[];
    const last = entries[entries.length - 1];
    expect(last?.reason).toBe(NORMALIZED);
    expect(last?.approver).toBe(`${TEST_NAME} <${TEST_EMAIL}> (approver)`);
  });

  it('memoryReject: the commit body and the `rejection_reason` frontmatter carry the SAME normalized text', async () => {
    const result = await operationFn('memoryReject')({
      root: repo,
      positional: 'decision-12',
      options: { reason: REASON },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.reason).toBe(NORMALIZED);
    expect(parseCommitReason(gitOut(repo, ['log', '-1', '--format=%b']))).toBe(NORMALIZED);

    // spec-010: reject is the one verb that writes the reason to frontmatter too. The two sinks must
    // not diverge — normalizing once, at the boundary, is what guarantees that.
    const raw = readFileSync(join(repo, docPath), 'utf-8');
    const frontmatter = load(raw.split('---')[1] as string) as Record<string, unknown>;
    expect(frontmatter.rejection_reason).toBe(NORMALIZED);
  });

  it('memoryDeprecate: the reason is recorded whole, with no `Approver:` line (dl-027)', async () => {
    const result = await operationFn('memoryDeprecate')({
      root: repo,
      positional: 'decision-12',
      options: { reason: REASON },
    });
    expect(result.ok).toBe(true);

    const body = gitOut(repo, ['log', '-1', '--format=%b']);
    expect(parseCommitReason(body)).toBe(NORMALIZED);
    expect(body).not.toContain('Approver:');

    const transitions = reconstructMemoryTransitions(repo, docPath);
    const last = transitions[transitions.length - 1];
    expect(last?.reason).toBe(NORMALIZED);
    expect(last?.approval).toBeNull();
  });
});

/**
 * bug-042's 2026-09-18 amendment, asserted where it actually bites: on what
 * `reconstructMemoryTransitions` returns, not only on the raw commit body (task-072 AC4). Two
 * independent guarantees, because either alone would be a single point of failure for a forged
 * approval record:
 *
 *  1. the writer refuses the reason (above), so no such commit can be produced by the verb; and
 *  2. the reader anchors `Approver:` to the first body line (dl-067 clause 5), so even a commit made
 *     some other way — by hand, or by a version of this tool that predates the fix — cannot make
 *     `memory history` report an approver for a `deprecate`.
 */
describe('bug-042 F3 on `memory deprecate` — a hand-made forged body still reports no approval', () => {
  let repo: string;
  const docPath = 'docs/memory/decisions/decision-12.md';

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, docPath, decisionDoc('decision-12', 'approved'));
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  it('the forged `Approver:` line is not first, so it is not an approver — and it stays inside the reason text', () => {
    writeFixtureFile(repo, docPath, decisionDoc('decision-12', 'deprecated'));
    commitAll(
      repo,
      `wf(decision): deprecate decision-12 [approved → deprecated]\n\nReason: ${FORGED}`,
    );

    const transitions = reconstructMemoryTransitions(repo, docPath);
    const last = transitions[transitions.length - 1];

    expect(last?.operation).toBe('deprecate');
    // The record this verb has no authority to write stays unwritten: no approver, at all.
    expect(last?.approval).toBeNull();
    // And the forged line is reported for what it is — text the reason happens to contain.
    expect(last?.reason).toBe(FORGED);
  });
});

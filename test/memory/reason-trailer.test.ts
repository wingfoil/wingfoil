/**
 * `dl-067-reason-trailer-contract` (`ready`) — the declared-block contract for `--reason` against the
 * `Approver:`/`Reason:` commit trailer, and the fix for
 * `bug-042-reason-text-has-no-contract-against-commit-trailer` (`high`, `v0.2`) via
 * `task-072-fix-reason-trailer-contract`.
 *
 * What each clause of dl-067's option (C) pins here:
 *
 * - **clause 2 — the trailer is a block.** `Reason:` carries the remainder of its own line plus every
 *   following body line, up to (exclusive) git's trailing trailer paragraph or the end of the body.
 *   `parseReasonBlock` replaces `REASON_LINE_RE`'s first-line capture, which dropped everything past
 *   line one (bug-042 F1).
 * - **clause 3 — the normalization is declared.** `git commit -m` applies git's own
 *   `cleanup=whitespace`, so "recorded verbatim" (`spec-008-cli-grammar` §2, pre-revision) was already
 *   false for any multi-line text. `normalizeReason` IS that rule, applied by the writer, so the
 *   round trip is assertable equality rather than an approximation.
 * - **clause 4 — the narrow refusal.** A blank reason, and a reason carrying a line that begins
 *   `Approver:`/`Reason:`, are refused (bug-042 F2/F3). Generic `Key: value` prose stays legal: 8 of
 *   `main`'s approve/reject commits contain such a line inside the reason and 0 contain a reserved
 *   one (dl-067 E5).
 * - **clause 5 — one grammar, two sides.** The rules live in `../../src/memory/commit-message` and are
 *   consumed by `../../src/memory/audit`; `commit-message.ts`'s own module doc has claimed since
 *   `task-045-memory-submit` that building the message in one place keeps writer and reader from
 *   drifting. These cases are that claim, asserted.
 * - **clause 6 — degrade, don't vanish.** `parseApprovalMetadata` keeps a successfully parsed
 *   `Approver:` line when the reason is unreadable, instead of discarding both (bug-042 F2's second
 *   half). Lives in `./audit.test.ts` alongside that function's other cases.
 *
 * The corpus figures quoted above and below were measured on `main`; the block-accurate count is
 * **79 of 171** approve/reject commits carrying a multi-line reason (dl-067 E1 — bug-042's 66/156 and
 * task-072's own 72/169 both used a measure that stops at the first blank line and therefore
 * undercount).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  formatMemoryCommitMessage,
  normalizeReason,
  parseApproverTrailerLine,
  reasonDefect,
  reasonDefectMessage,
  reasonRefusalMessage,
} from '../../src/memory/commit-message';
import { parseApprovalMetadata, parseCommitReason } from '../../src/memory/audit';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** The pre-fix reader, kept here verbatim so the cases below can show what it used to lose. */
const FIRST_LINE_ONLY_RE = /^Reason:\s*(.+)$/m;

const APPROVER = { name: 'Roberto Pompermaier', email: 'robypomper@gmail.com', role: 'approver' } as const;

describe('normalizeReason — dl-067 clause 3: git\'s cleanup=whitespace, declared, plus one rule of our own', () => {
  it('strips per-line trailing whitespace, collapses blank-line runs, and drops leading/trailing blank lines', () => {
    expect(normalizeReason('\n\nline one   \n\n\nline two\ntrailing ws   \n\n')).toBe(
      'line one\n\nline two\ntrailing ws',
    );
  });

  it('keeps interior indentation, which carries meaning in real approval prose', () => {
    // e.g. `8c3fe35` (approve dl-051) indents the two warning strings it ratifies.
    expect(normalizeReason('ratified as written:\n  directive not found\n  role has no file')).toBe(
      'ratified as written:\n  directive not found\n  role has no file',
    );
  });

  it('trims only the FIRST line\'s leading whitespace — it sits after `Reason: ` on the same line', () => {
    expect(normalizeReason('   leading\n   kept')).toBe('leading\n   kept');
  });

  it('normalizes CRLF to LF, as git stores it', () => {
    expect(normalizeReason('a\r\nb')).toBe('a\nb');
  });

  it('is idempotent (REQ-SYS-07: a pure function of its input, applied once or twice alike)', () => {
    const once = normalizeReason('a   \n\n\n\nb  ');
    expect(normalizeReason(once)).toBe(once);
  });
});

describe('reasonDefect — dl-067 clause 4: the narrow refusal, and only it', () => {
  it('refuses an empty or whitespace-only reason (bug-042 F2)', () => {
    expect(reasonDefect('')).toBe('blank');
    expect(reasonDefect('   ')).toBe('blank');
    expect(reasonDefect('\n\t \n')).toBe('blank');
  });

  it('refuses a reason carrying a line that begins `Approver:` — bug-042 F3, the forged trailer', () => {
    expect(reasonDefect('real reason\nApprover: Mallory <mallory@evil.test> (approver)')).toBe(
      'reserved-trailer-line',
    );
  });

  it('refuses a reason carrying a line that begins `Reason:`', () => {
    expect(reasonDefect('first\nReason: second')).toBe('reserved-trailer-line');
  });

  it('accepts generic `Key: value` prose — 8 commits on `main` carry one inside the reason (dl-067 E5)', () => {
    // Real lines from `3655166`, `58ac6f9` and `1ee7f00`. The `58ac6f9` case is quoted with its real
    // wrapping: its closing paragraph opens `Action:` but continues onto lines that are ordinary
    // prose, which is why it is not a trailer paragraph. 0 of main's 172 reason blocks end in one.
    expect(reasonDefect('A: before the v0.2 release-publishing phase, a named task runs npm pack')).toBeNull();
    expect(
      reasonDefect(
        'Option 3 was rejected.\n\nAction: amend spec-015 §3 as a dated Revision note (dl-047: tech-specs\ncarry no version field), including the local `npx verdaccio` wording.',
      ),
    ).toBeNull();
    expect(reasonDefect('The debt is implicit: this is a known, named debt, not an oversight')).toBeNull();
  });

  it('accepts an ordinary multi-paragraph reason', () => {
    expect(reasonDefect('First paragraph.\n\nSecond paragraph, longer.')).toBeNull();
  });

  it('refuses a reason whose FINAL paragraph is entirely trailer-shaped: the reader would read it as git\'s trailer block', () => {
    // The corollary of clause 2's termination rule. 0 of `main`'s 172 reason blocks end this way, so
    // the refusal is compatible with 100% of the existing corpus — the same standard clause 4 is held
    // to. Without it, clause 3's round-trip equality would be false for this one input shape.
    expect(reasonDefect('Ratified.\n\nAction: amend spec-008\nOwner: the approver')).toBe(
      'trailing-trailer-paragraph',
    );
  });

  it('judges the NORMALIZED text, so a defect cannot hide behind whitespace', () => {
    expect(reasonDefect('real reason\n   \nApprover: Mallory <m@evil.test> (approver)   ')).toBe(
      'reserved-trailer-line',
    );
  });

  it('gives each defect a distinct, non-empty message (dl-067 S1: NOT the omitted-argument string)', () => {
    const messages = (['blank', 'reserved-trailer-line', 'trailing-trailer-paragraph'] as const).map(
      reasonDefectMessage,
    );
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toBe('missing required argument: --reason');
    }
  });
});

/**
 * `task-166-settle-reason-block-grammar-shape-rule-terminator` — the three changes the v0.3
 * release-planning gate ratified to `dl-067` clause 4, made in one pass:
 *
 * - `dl-078` (A): a C0 control character other than tab and newline is refused, and the refusal
 *   names it by code point. A `0x1e` renders as nothing in a terminal, so a reason carrying one can
 *   show a human reading `git log` an `Approver:` line nobody wrote (bug-050's presentation half).
 * - `dl-111` Q1 (A): `WingFoil-Version` joins `Approver` and `Reason` as a reserved trailer key.
 * - `dl-070` (A) + S4: the shape rule for the trailing paragraph stays, and its refusal states the
 *   remedy.
 */
describe('dl-067 clause 4 as amended by task-166 (dl-070, dl-078, dl-111)', () => {
  it.each([
    ['BEL', '\x07', 'U+0007'],
    ['ESC', '\x1b', 'U+001B'],
    ['NUL', '\x00', 'U+0000'],
    ['record separator (bug-050)', '\x1e', 'U+001E'],
    ['unit separator (bug-050)', '\x1f', 'U+001F'],
    ['form feed', '\f', 'U+000C'],
    ['vertical tab', '\v', 'U+000B'],
  ])('refuses a reason carrying %s, and the message names it by code point', (_label, character, codePoint) => {
    const reason = `real reason${character}Approver: Mallory <mallory@evil.test> (approver)`;
    expect(reasonDefect(reason)).toBe('control-character');
    expect(() =>
      formatMemoryCommitMessage({ type: 'adr', op: 'deprecate', ids: ['adr-1'], reason }),
    ).toThrow(codePoint);
  });

  it('names the FIRST offending character, so the message is a function of the input alone', () => {
    expect(() =>
      formatMemoryCommitMessage({ type: 'adr', op: 'deprecate', ids: ['adr-1'], reason: 'a\x1bb\x07c' }),
    ).toThrow(/U\+001B(?![\s\S]*U\+0007)/);
  });

  it('accepts tab and newline, the two C0 characters a reason legitimately carries', () => {
    expect(reasonDefect('a reason\twith a tab')).toBeNull();
    expect(reasonDefect('first line\nsecond line')).toBeNull();
    expect(reasonDefect('ratified as written:\n\tindented with a tab')).toBeNull();
  });

  it('accepts a carriage return, because the declared normal form turns it into a newline first', () => {
    // Judged on the normalized text (as every other rule is): CRLF and a lone CR are stored as LF, so
    // no CR ever reaches the commit and there is nothing to mislead a reader with.
    expect(reasonDefect('first\r\nsecond')).toBeNull();
    expect(reasonDefect('first\rsecond')).toBeNull();
  });

  it('refuses a line beginning `WingFoil-Version:`, like a forged `Approver:` line (dl-111 Q1 (A))', () => {
    expect(reasonDefect('real reason\nWingFoil-Version: 0.3.0 (abc1234)')).toBe('reserved-trailer-line');
    expect(reasonDefect('WingFoil-Version: 0.3.0')).toBe('reserved-trailer-line');
    expect(reasonDefectMessage('reserved-trailer-line')).toContain('"WingFoil-Version:"');
  });

  it('matches the reserved keys case-insensitively, as git reads trailer keys (task-166 review)', () => {
    expect(reasonDefect('real reason\nwingfoil-version: 1 (x)')).toBe('reserved-trailer-line');
    expect(reasonDefect('real reason\nWINGFOIL-VERSION: 1 (x)')).toBe('reserved-trailer-line');
    expect(reasonDefect('real reason\napprover: Mallory <m@evil.test> (approver)')).toBe('reserved-trailer-line');
    expect(reasonDefect('first\nREASON: second')).toBe('reserved-trailer-line');
  });

  it('keeps `WingFoil-Version` prose that is not at the start of a line legal', () => {
    expect(reasonDefect('the WingFoil-Version: trailer is reserved for task-192')).toBeNull();
  });

  it('states the remedy when it refuses a trailing `Key: value` paragraph (dl-070 S4)', () => {
    const message = reasonDefectMessage('trailing-trailer-paragraph');
    expect(message).toContain('must not end in a paragraph of "Key: value" lines');
    expect(message).toContain('add a closing sentence');
  });

  it('gives the control-character class a message of its own, distinct from the other three', () => {
    const messages = (
      ['blank', 'reserved-trailer-line', 'trailing-trailer-paragraph', 'control-character'] as const
    ).map((defect) => reasonDefectMessage(defect));
    expect(new Set(messages).size).toBe(4);
    for (const message of messages) {
      expect(message).toMatch(/^invalid flag value: --reason /);
    }
  });
});

/**
 * `task-173` absorbs `bug-185`: `dl-078`'s Amendment (2026-10-01) extends the refusal past C0, to DEL,
 * the C1 controls (U+0080 to U+009F) and the Unicode line and paragraph separators (U+2028, U+2029).
 * Each is refused like the C0 characters, with the same message, naming the first one by code point.
 */
describe('dl-078 Amendment (2026-10-01): the refusal extends past C0 (bug-185, task-173)', () => {
  it.each([
    ['DEL', '\x7f', 'U+007F'],
    ['the first C1 control', '\u0080', 'U+0080'],
    ['NEL', '\u0085', 'U+0085'],
    ['CSI', '\u009b', 'U+009B'],
    ['the last C1 control', '\u009f', 'U+009F'],
    ['LINE SEPARATOR', '\u2028', 'U+2028'],
    ['PARAGRAPH SEPARATOR', '\u2029', 'U+2029'],
  ])('refuses a reason carrying %s, and the message names it by code point', (_label, character, codePoint) => {
    const reason = `real reason${character}Approver: Mallory <mallory@evil.test> (approver)`;
    expect(reasonDefect(reason)).toBe('control-character');
    expect(reasonRefusalMessage(reason)).toBe(
      `invalid flag value: --reason must not contain a control character other than tab or newline (found ${codePoint})`,
    );
    expect(() =>
      formatMemoryCommitMessage({ type: 'adr', op: 'deprecate', ids: ['adr-1'], reason }),
    ).toThrow(codePoint);
  });

  it('keeps the neighbours of each range legal: `~` (U+007E), NBSP (U+00A0), U+2027 and U+202A', () => {
    for (const character of ['~', '\u00a0', '\u2027', '\u202a']) {
      expect(reasonDefect(`a reason ${character} here`)).toBeNull();
    }
  });

  it('names the FIRST offending character across the C0 and extended ranges', () => {
    expect(reasonRefusalMessage('a\u2028b\x1bc')).toMatch(/\(found U\+2028\)$/);
    expect(reasonRefusalMessage('a\x1bb\u2028c')).toMatch(/\(found U\+001B\)$/);
  });
});

describe('parseReasonBlock via parseCommitReason — dl-067 clause 2: the block, not the first line', () => {
  it('reads a multi-paragraph reason in full (bug-042 F1: the first-line rule kept only line one)', () => {
    const body = 'Approver: A <a@b.c> (approver)\nReason: first line\n\nsecond paragraph\nand its second line';
    expect(parseCommitReason(body)).toBe('first line\n\nsecond paragraph\nand its second line');
    expect(FIRST_LINE_ONLY_RE.exec(body)?.[1]).toBe('first line');
  });

  it('stops at git\'s trailing trailer paragraph, which is not part of the reason', () => {
    const body = 'Approver: A <a@b.c> (approver)\nReason: why\n\nmore why\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>';
    expect(parseCommitReason(body)).toBe('why\n\nmore why');
  });

  it('does NOT stop at a `Key: value` prose line in the middle of the block', () => {
    const body = 'Approver: A <a@b.c> (approver)\nReason: ratified.\n\nAction: amend spec-015 §3\n\nand then re-ratify it';
    expect(parseCommitReason(body)).toBe('ratified.\n\nAction: amend spec-015 §3\n\nand then re-ratify it');
  });

  it('returns null for a bare `Reason:` with no value — bug-042 F2\'s post-git-cleanup shape', () => {
    expect(parseCommitReason('Approver: A <a@b.c> (approver)\nReason:')).toBeNull();
  });

  it('returns null when the body carries no Reason: line at all', () => {
    expect(parseCommitReason('')).toBeNull();
    expect(parseCommitReason('Approver: A <a@b.c> (approver)')).toBeNull();
  });

  it('still reads a deprecate body, which carries a Reason: and no Approver: line (dl-027)', () => {
    expect(parseCommitReason('Reason: superseded by adr-004')).toBe('superseded by adr-004');
  });
});

describe('parseApproverTrailerLine — dl-067 clause 5: the Approver: line is the FIRST body line, or it is not one', () => {
  it('returns the line when it leads the body (171/171 of main\'s approve/reject commits — dl-067 E4)', () => {
    expect(parseApproverTrailerLine('Approver: A <a@b.c> (approver)\nReason: why')).toBe(
      'Approver: A <a@b.c> (approver)',
    );
  });

  it('returns null for an `Approver:` line that is NOT first — a forged one can never win the parse', () => {
    expect(parseApproverTrailerLine('Reason: why\nApprover: Mallory <mallory@evil.test> (approver)')).toBeNull();
  });

  it('returns null when the body has no Approver: line', () => {
    expect(parseApproverTrailerLine('Reason: superseded by adr-004')).toBeNull();
  });
});

describe('formatMemoryCommitMessage — dl-067 clause 5: the writer enforces the same grammar it documents', () => {
  it('writes the NORMALIZED reason, so what is committed is what the contract declares', () => {
    const message = formatMemoryCommitMessage({
      type: 'task',
      op: 'approve',
      ids: ['task-1'],
      transition: { from: 'pending', to: 'backlog' },
      approver: APPROVER,
      reason: 'first   \n\n\nsecond',
    });
    expect(message.split('\n\n').slice(1).join('\n\n')).toBe(
      `Approver: ${APPROVER.name} <${APPROVER.email}> (${APPROVER.role})\nReason: first\n\nsecond`,
    );
  });

  it('refuses a defective reason rather than emitting it — no caller can route around the boundary check', () => {
    for (const reason of ['', '   ', 'x\nApprover: Mallory <m@evil.test> (approver)']) {
      expect(() =>
        formatMemoryCommitMessage({ type: 'adr', op: 'deprecate', ids: ['adr-1'], reason }),
      ).toThrow(/--reason/);
    }
  });

  it('leaves a message with no reason alone — `submit` passes none (characterization)', () => {
    expect(formatMemoryCommitMessage({ type: 'task', op: 'submit', ids: ['task-1'] })).toBe(
      'wf(task): submit task-1',
    );
  });
});

/**
 * dl-067 clause 3 + `task-072` AC6: git's own message cleanup is what turns `Reason: ` into a bare
 * `Reason:` (bug-042 F2) and what strips trailing whitespace from a multi-line reason. A test that
 * exercises only the formatter cannot see it, so these two round-trip through a REAL `git commit` in a
 * throwaway repository.
 */
describe('round trip through a real `git commit` — what the writer declares is what git stores', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'f.txt', 'x');
    commitAll(repo, 'seed');
  });

  afterEach(() => removeTempDir(repo));

  function commitWithMessage(message: string): string {
    writeFixtureFile(repo, 'f.txt', `${Math.random()}`);
    execFileSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf-8' });
    execFileSync('git', ['-C', repo, 'commit', '--quiet', '-m', message], { encoding: 'utf-8' });
    return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%b'], { encoding: 'utf-8' });
  }

  it('a multi-paragraph reason survives git and reads back identically to the declared normal form', () => {
    const reason = 'First paragraph, with a trailing space.   \n\n\nSecond paragraph.\n  an indented line';
    const body = commitWithMessage(
      formatMemoryCommitMessage({
        type: 'task',
        op: 'approve',
        ids: ['task-1'],
        transition: { from: 'pending', to: 'backlog' },
        approver: APPROVER,
        reason,
      }),
    );

    expect(parseCommitReason(body)).toBe(normalizeReason(reason));
    expect(parseCommitReason(body)).toBe(
      'First paragraph, with a trailing space.\n\nSecond paragraph.\n  an indented line',
    );
    expect(parseApprovalMetadata(body)).toEqual({
      approverName: APPROVER.name,
      approverEmail: APPROVER.email,
      approverRole: APPROVER.role,
      reason: normalizeReason(reason),
    });
  });

  it('a reason carrying an interior tab is accepted and round-trips (task-166: tab is one of the two legal C0 characters)', () => {
    const reason = 'ratified as written:\n\tdirective not found\tsee spec-008';
    const body = commitWithMessage(
      formatMemoryCommitMessage({ type: 'adr', op: 'deprecate', ids: ['adr-1'], reason }),
    );
    expect(parseCommitReason(body)).toBe(reason);
  });

  it('the first-line trim is OURS, not git\'s: git keeps that whitespace, and the writer is what removes it', () => {
    // The provenance matters because spec-008 §2 and CLAUDE.md §5.1 both describe the normal form, and
    // three of its four rules are git's `cleanup=whitespace` while this one is not. Proven, not
    // asserted: the same text committed WITHOUT going through the formatter keeps its leading spaces.
    const raw = commitWithMessage('wf(task): approve task-1 [pending → backlog]\n\nApprover: A <a@b.c> (approver)\nReason:    leading spaces');
    expect(raw).toContain('Reason:    leading spaces');

    const written = commitWithMessage(
      formatMemoryCommitMessage({
        type: 'task',
        op: 'approve',
        ids: ['task-1'],
        transition: { from: 'pending', to: 'backlog' },
        approver: APPROVER,
        reason: '   leading spaces',
      }),
    );
    expect(written).toContain('Reason: leading spaces');
    expect(parseCommitReason(written)).toBe('leading spaces');
  });

  it('git\'s cleanup is exactly what clause 3 declares — a hand-written `Reason: ` still collapses to a bare `Reason:`', () => {
    // The pre-fix write path could produce this; the fix makes it unreachable through the verbs, and
    // clause 6 (see `./audit.test.ts`) keeps the approver readable when it is met in old history.
    const body = commitWithMessage('wf(task): approve task-1 [pending → backlog]\n\nApprover: A <a@b.c> (approver)\nReason: ');
    expect(body).toContain('Reason:\n');
    expect(parseCommitReason(body)).toBeNull();
  });
});

/**
 * dl-067's accepted consequence, pinned against a REAL commit of this repository rather than an
 * invented body: the multi-line commits already on `main` start reading back in full. The worked case
 * is dl-067 E2's worst — `wf(task): approve task-054-project-directives`, `546b76e` at the time
 * dl-067 measured it — where the pre-fix reader kept 64 of 3298 characters, 2%, of that approval's
 * reasoning.
 *
 * The commit BODY is checked in, at `./fixtures/approve-task-054-commit-body.txt`, and the assertion
 * runs against the fixture unconditionally. An earlier revision of this case read the commit out of
 * the repository at test time with `git log --grep` and threw when it found nothing — which fails in
 * a **shallow clone**, and `actions/checkout` defaults to `fetch-depth: 1` with `npm test` inside the
 * pipeline (adr-009/spec-015), so it would have broken the first CI run with a message that reads
 * like a code regression.
 *
 * A fixture can drift from the thing it claims to quote, so the second case below closes that gap: it
 * re-reads the commit from git and asserts the fixture is byte-identical. That cross-check needs the
 * history, so it cannot run everywhere — and rather than skip quietly (a vacuous pass is what
 * `bug-045`/`task-076` are about) it asserts the only legitimate reasons the commit can be missing:
 * the repository is shallow, or there is no repository at all.
 */
describe('the existing corpus — a real approve commit from this repository reads back in full', () => {
  const repoRoot = resolve(__dirname, '../..');
  const SUBJECT = 'wf(task): approve task-054-project-directives [in-review → approved]';
  const FIXTURE_PATH = resolve(__dirname, 'fixtures/approve-task-054-commit-body.txt');
  const FIXTURE_BODY = readFileSync(FIXTURE_PATH, 'utf-8');

  /** How much of this repository's history the test run can actually see. */
  function historyAvailability(): 'full' | 'shallow' | 'not-a-repo' {
    try {
      const shallow = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--is-shallow-repository'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return shallow === 'true' ? 'shallow' : 'full';
    } catch {
      return 'not-a-repo';
    }
  }

  /** The sha of the commit with exactly that subject, or `null` when this checkout does not have it. */
  function shaBySubject(): string | null {
    let out: string;
    try {
      out = execFileSync(
        'git',
        ['-C', repoRoot, 'log', '--format=%H', `--grep=^${SUBJECT.replace(/[[\]]/g, '\\$&')}$`],
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      return null;
    }
    const shas = out.trim().split('\n').filter(Boolean);
    if (shas.length > 1) {
      throw new Error(`expected at most one commit with subject "${SUBJECT}", found ${shas.length}`);
    }
    return shas[0] ?? null;
  }

  it('recovers the whole reason where the first-line rule kept 2% of it (dl-067 E2, worked case)', () => {
    const block = parseCommitReason(FIXTURE_BODY);
    const firstLineOnly = FIRST_LINE_ONLY_RE.exec(FIXTURE_BODY)?.[1] ?? '';

    expect(firstLineOnly).toHaveLength(64);
    expect(block).not.toBeNull();
    expect(block).toHaveLength(3298);
    // The old reading is a strict PREFIX of the new one: the reader recovers, it does not reinterpret.
    expect(block?.startsWith(firstLineOnly)).toBe(true);
    expect((block as string).length).toBeGreaterThan(firstLineOnly.length);
    // Nothing is invented: every byte the block adds already exists in the commit git stores.
    expect(FIXTURE_BODY).toContain(block as string);
    // And the approval record itself survives the change — identity unchanged, reason now whole.
    expect(parseApprovalMetadata(FIXTURE_BODY)).toEqual({
      approverName: 'Roberto Pompermaier',
      approverEmail: 'robypomper@gmail.com',
      approverRole: 'approver',
      reason: block,
    });
  });

  it('the fixture is byte-identical to the commit it quotes — or this checkout demonstrably cannot see it', () => {
    const sha = shaBySubject();

    if (sha === null) {
      // Not a quiet skip: assert the ONLY legitimate reasons the commit is unreachable. A full
      // checkout that cannot find it means the history changed under the fixture, and fails here.
      expect(['shallow', 'not-a-repo']).toContain(historyAvailability());
      return;
    }

    const live = execFileSync('git', ['-C', repoRoot, 'log', '-1', '--format=%b', sha], { encoding: 'utf-8' });
    expect(live).toBe(FIXTURE_BODY);
  });
});

/**
 * task-015-complete-audit-trail (REQ-SEC-02) — the audit/verification layer built on top of
 * task-011's `getMemoryHistory` git-log walk: attribution auditing, Approver/Reason parsing, full
 * transition reconstruction, and the frontmatter-vs-commit-message consistency check. See
 * `src/memory/audit.ts`'s module doc for how each piece maps to REQ-SEC-02's fit criterion.
 */
import {
  auditAttribution,
  isValidAttribution,
  parseApprovalMetadata,
  parseCommitReason,
  reconstructMemoryTransitions,
  verifyTransitionConsistency,
} from '../../src/memory/audit';
import { isConfiguredIdentity } from '../../src/core/git-identity';
import type { StateMachine } from '../../src/memory/schema';
import { rmSync } from 'fs';
import { join } from 'path';

import {
  commitAll,
  commitAllAs,
  git,
  makeBoundedOutsideDir,
  makeTempGitRepo,
  removeTempDir,
  withGitCeiling,
  writeFixtureFile,
} from '../storage/helpers/git-fixture';

const DOC_PATH = 'docs/04_memory/v0.1/task-901-doc.md';
const OTHER_DOC_PATH = 'docs/04_memory/v0.1/task-902-doc.md';

function writeDoc(repo: string, path: string, status: string): void {
  writeFixtureFile(
    repo,
    path,
    ['---', `id: ${path}`, `status: ${status}`, '---', '', 'Body.', ''].join('\n'),
  );
}

describe('isValidAttribution — pure predicate, no git involved', () => {
  it('accepts a fully-configured, non-placeholder name + email', () => {
    expect(isValidAttribution('Roberto Pompermaier', 'robypomper@gmail.com')).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(isValidAttribution('', 'a@b.com')).toBe(false);
  });

  it('rejects an empty email', () => {
    expect(isValidAttribution('Someone', '')).toBe(false);
  });

  it('rejects a whitespace-only name/email', () => {
    expect(isValidAttribution('   ', '  ')).toBe(false);
  });

  it('rejects an email with no "@"', () => {
    expect(isValidAttribution('Someone', 'not-an-email')).toBe(false);
  });

  it('rejects git\'s own guessed-identity domain marker "user@host.(none)"', () => {
    expect(isValidAttribution('root', 'root@buildhost.(none)')).toBe(false);
  });

  // task-132 AC3 (`bug-153`): RFC 2606 reserves these four top-level domains for testing,
  // documentation and invalid addresses. An author on one of them is a placeholder, the same class
  // of "not a deliberately-configured identity" as git's own `.(none)` marker.
  it.each([
    ['.invalid', 'scratch@example.invalid'],
    ['.example', 'scratch@acme.example'],
    ['.test', 'scratch@example.test'],
    ['.localhost', 'scratch@example.localhost'],
    ['.invalid, upper case', 'scratch@EXAMPLE.INVALID'],
    ['.test, bare second level', 'scratch@build.test'],
    // task-132 review, finding 6: a fully-qualified domain's trailing dot names the same domain.
    ['.test, trailing dot', 'scratch@foo.test.'],
    ['.invalid, trailing dots', 'scratch@foo.invalid..'],
  ])('rejects an email on the RFC 2606 reserved domain %s', (_label, email) => {
    expect(isValidAttribution('Scratch User', email)).toBe(false);
  });

  it.each([
    ['a domain that merely contains a reserved label', 'dev@test.example.com'],
    ['a domain ending in a longer label', 'dev@contest.org'],
    ['a domain whose TLD starts like a reserved one', 'dev@company.testing'],
  ])('still accepts %s', (_label, email) => {
    expect(isValidAttribution('Dev', email)).toBe(true);
  });
});

describe('isValidAttribution reconciled with isConfiguredIdentity (task-014 ↔ task-015, REQ-SEC-01/REQ-SEC-02)', () => {
  it('agrees with the shared isConfiguredIdentity base rule for a real, non-".(none)" identity', () => {
    const name = 'Roberto Pompermaier';
    const email = 'robypomper@gmail.com';
    expect(isConfiguredIdentity(name, email)).toBe(true);
    expect(isValidAttribution(name, email)).toBe(isConfiguredIdentity(name, email));
  });

  it('agrees with the shared isConfiguredIdentity base rule when both name and email are empty', () => {
    expect(isConfiguredIdentity('', '')).toBe(false);
    expect(isValidAttribution('', '')).toBe(isConfiguredIdentity('', ''));
  });

  it('is strictly narrower than isConfiguredIdentity only on the git-guessed ".(none)" case: same non-empty base, audit-only rejection layered on top', () => {
    const name = 'root';
    const email = 'root@buildhost.(none)';
    // The shared base rule (task-014) considers this a "configured" identity — both fields are
    // non-empty — because requireGitIdentity only ever checks *live* config, which git itself never
    // populates with a ".(none)" marker going forward.
    expect(isConfiguredIdentity(name, email)).toBe(true);
    // The historical audit (task-015) is stricter: it additionally rejects git's own guessed-domain
    // marker, which can only appear in commits made before task-014's write-time guard existed.
    expect(isValidAttribution(name, email)).toBe(false);
  });
});

/**
 * A fixture repository whose configured author is NOT a placeholder. `makeTempGitRepo`'s identity is on
 * `example.invalid`, an RFC 2606 reserved top-level domain the audit itself counts as unattributed
 * since task-132 (`bug-153`), so the "every commit is valid" baseline needs another domain.
 * `example.org` is IANA-reserved too, but at the second level, which the top-level-only rule accepts
 * — so no registrable name is used; a future second-level rule would have to move it.
 */
function makeAttributedRepo(): string {
  const dir = makeTempGitRepo();
  git(dir, ['config', 'user.email', 'wf-test@example.org']);
  return dir;
}

describe('auditAttribution — git-log walk with a 0-"unknown author" attribution check', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('reports every commit as valid when every commit has a real configured identity', () => {
    repo = makeAttributedRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');

    const entries = auditAttribution(repo, [DOC_PATH]);

    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.valid)).toBe(true);
    expect(entries.filter((e) => !e.valid)).toHaveLength(0);
  });

  it('flags a commit with a git-guessed placeholder identity as invalid ("unknown author")', () => {
    repo = makeAttributedRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAllAs(repo, 'wf(task): submit task-901-doc', { name: 'root', email: 'root@buildhost.(none)' });

    const entries = auditAttribution(repo, [DOC_PATH]);

    expect(entries).toHaveLength(2);
    const invalid = entries.filter((e) => !e.valid);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.subject).toBe('wf(task): submit task-901-doc');
  });

  it('merges multiple pathspecs without duplicating a commit that touches more than one', () => {
    repo = makeAttributedRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    writeDoc(repo, OTHER_DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc, task-902-doc');

    const entries = auditAttribution(repo, [DOC_PATH, OTHER_DOC_PATH]);

    expect(entries).toHaveLength(1);
  });

  it('is deterministic — repeated calls over unchanged state produce the exact same result', () => {
    repo = makeAttributedRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');

    const first = auditAttribution(repo, [DOC_PATH]);
    const second = auditAttribution(repo, [DOC_PATH]);
    expect(second).toEqual(first);
  });

  it('returns [] over a pathspec with no history at all', () => {
    repo = makeAttributedRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');

    expect(auditAttribution(repo, ['docs/04_memory/v0.1/does-not-exist.md'])).toEqual([]);
  });

  it('throws E_GIT_READ_FAILED, rather than reporting a clean empty audit, when `root` is not a git repository (task-142, bug-072)', () => {
    // task-350 AC 3 (bug-453): a directory outside any repository below a ceiling that is one.
    const { dir, ceiling } = makeBoundedOutsideDir();
    repo = ceiling;
    writeDoc(dir, DOC_PATH, 'draft'); // plain file write, no `git init`
    expect(() => withGitCeiling(ceiling, () => auditAttribution(dir, [DOC_PATH]))).toThrow(/E_GIT_READ_FAILED: .*not a git repository/s);
  });
});

describe('parseApprovalMetadata — Approver:/Reason: commit-body parsing (CLAUDE.md §5.1)', () => {
  it('parses a well-formed approve commit body', () => {
    const body =
      'Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: meets standards';
    expect(parseApprovalMetadata(body)).toEqual({
      approverName: 'Roberto Pompermaier',
      approverEmail: 'robypomper@gmail.com',
      approverRole: 'approver',
      reason: 'meets standards',
    });
  });

  it('returns null when the body has no Approver: line', () => {
    expect(parseApprovalMetadata('Reason: meets standards')).toBeNull();
  });

  /**
   * `dl-067-reason-trailer-contract` clause 6 (`task-072`, bug-042 F2's second half). This function
   * used to be all-or-nothing in BOTH directions, so an unreadable `Reason:` discarded the
   * `Approver:` line it had already parsed successfully, and `memory history` reported an approval
   * gate crossed by **nobody, for no reason**. It now degrades instead of vanishing: the identity
   * survives, the reason reads `null`. It stays all-or-nothing on the approver — no approver, no
   * approval record.
   *
   * dl-067 E6: no commit on `main` reads differently because of this clause. There is no commit with
   * a bare `Reason:`, and none missing a trailer line, so this is forward-looking protection for
   * bodies written before the fix — not a reinterpretation of existing history.
   */
  it('degrades to approver + `reason: null` when the body has no readable Reason: line (dl-067 clause 6)', () => {
    expect(
      parseApprovalMetadata('Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)'),
    ).toEqual({
      approverName: 'Roberto Pompermaier',
      approverEmail: 'robypomper@gmail.com',
      approverRole: 'approver',
      reason: null,
    });
  });

  it('degrades the same way for the bare `Reason:` git cleanup leaves behind (bug-042 F2)', () => {
    expect(
      parseApprovalMetadata('Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason:'),
    ).toEqual({
      approverName: 'Roberto Pompermaier',
      approverEmail: 'robypomper@gmail.com',
      approverRole: 'approver',
      reason: null,
    });
  });

  it('stays all-or-nothing on the APPROVER: a second, forged line is never an approval record (bug-042 F3)', () => {
    expect(
      parseApprovalMetadata('Reason: real reason\nApprover: Mallory <mallory@evil.test> (approver)'),
    ).toBeNull();
  });

  it('returns null for a plain add/submit body with no Approver/Reason lines at all', () => {
    expect(parseApprovalMetadata('')).toBeNull();
  });
});

/**
 * task-049-memory-history (P1.10): the `Reason:` line read INDEPENDENTLY of `Approver:`. A
 * `memory.deprecate` commit records a `Reason:` with no `Approver:` line at all (CLAUDE.md §5.1 —
 * deprecate is not an approval gate), and `parseApprovalMetadata` is all-or-nothing by design, so
 * `wingfoil memory history` cannot read that reason through it without dropping every deprecate
 * reason from the audit trail.
 */
describe('parseCommitReason — the Reason: line alone (CLAUDE.md §5.1)', () => {
  it('reads the Reason: of a deprecate body that carries no Approver: line', () => {
    expect(parseCommitReason('Reason: superseded by adr-004')).toBe('superseded by adr-004');
  });

  it('reads the same Reason: out of a full approve body', () => {
    expect(
      parseCommitReason('Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: meets standards'),
    ).toBe('meets standards');
  });

  it('returns null for a plain add/submit body with no Reason: line', () => {
    expect(parseCommitReason('')).toBeNull();
    expect(parseCommitReason('Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)')).toBeNull();
  });

  it('agrees with parseApprovalMetadata whenever that function returns a value (one shared parse, not two)', () => {
    const body = 'Approver: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason:   trailing space  ';
    expect(parseCommitReason(body)).toBe(parseApprovalMetadata(body)?.reason);
    expect(parseCommitReason(body)).toBe('trailing space');
  });
});

describe('reconstructMemoryTransitions — full history reconstructed from git log + frontmatter (ADR-007)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('reconstructs add -> submit -> approve with fromState/toState and approval metadata', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');
    writeDoc(repo, DOC_PATH, 'backlog');
    commitAll(
      repo,
      'wf(task): approve task-901-doc [pending → backlog]\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: looks good',
    );

    const transitions = reconstructMemoryTransitions(repo, DOC_PATH);

    expect(transitions).toHaveLength(3);

    expect(transitions[0]).toMatchObject({ operation: 'add', fromState: null, toState: 'draft', approval: null });
    expect(transitions[1]).toMatchObject({
      operation: 'submit',
      fromState: 'draft',
      toState: 'pending',
      approval: null,
    });
    expect(transitions[2]).toMatchObject({
      operation: 'approve',
      fromState: 'pending',
      toState: 'backlog',
      approval: {
        approverName: 'Roberto Pompermaier',
        approverEmail: 'robypomper@gmail.com',
        approverRole: 'approver',
        reason: 'looks good',
      },
    });
    for (const t of transitions) {
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(t.authorName).toBe('WingFoil Test');
    }
  });

  it('reconstructs a reject transition with its Approver/Reason', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(
      repo,
      'wf(task): reject task-901-doc [pending → draft]\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: tests missing',
    );

    const transitions = reconstructMemoryTransitions(repo, DOC_PATH);

    expect(transitions[2]).toMatchObject({
      operation: 'reject',
      fromState: 'pending',
      toState: 'draft',
      approval: { reason: 'tests missing' },
    });
  });

  it('carries each commit\'s `reason` independently of `approval` — a deprecate reason survives, an add/submit stays null (task-049, P1.10)', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'deprecated');
    commitAll(repo, 'wf(task): deprecate task-901-doc [draft → deprecated]\n\nReason: superseded by task-902');

    const transitions = reconstructMemoryTransitions(repo, DOC_PATH);

    expect(transitions.map((t) => t.reason)).toEqual([null, 'superseded by task-902']);
    // `approval` stays null for BOTH: the deprecate body has a `Reason:` but no `Approver:` line, and
    // `parseApprovalMetadata` requires both — the two fields are deliberately not the same read.
    expect(transitions.map((t) => t.approval)).toEqual([null, null]);
  });

  it('returns exactly 1 entry for a document created and never touched again (creation event)', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');

    const transitions = reconstructMemoryTransitions(repo, DOC_PATH);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ operation: 'add', fromState: null, toState: 'draft' });
  });

  it('is deterministic — repeated calls over unchanged state produce the exact same result', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');

    const first = reconstructMemoryTransitions(repo, DOC_PATH);
    const second = reconstructMemoryTransitions(repo, DOC_PATH);
    expect(second).toEqual(first);
  });

  it('yields toState null for a commit where the path no longer exists (e.g. deprecate-and-remove)', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    rmSync(join(repo, DOC_PATH));
    commitAll(repo, 'wf(task): deprecate task-901-doc [draft → deprecated]');

    const transitions = reconstructMemoryTransitions(repo, DOC_PATH);

    expect(transitions).toHaveLength(2);
    expect(transitions[1]).toMatchObject({ fromState: 'draft', toState: null });
  });
});

describe('verifyTransitionConsistency — frontmatter-derived state agrees with the commit-message bracket (no drift)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  it('reports no mismatches for a well-formed add/submit/approve sequence', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');
    writeDoc(repo, DOC_PATH, 'backlog');
    commitAll(
      repo,
      'wf(task): approve task-901-doc [pending → backlog]\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: looks good',
    );

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([]);
  });

  it('detects drift when the commit-message bracket disagrees with the frontmatter status actually written', () => {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');
    // Bug scenario: subject claims "pending -> backlog" but the frontmatter actually committed is
    // "approved" — the two views disagree.
    writeDoc(repo, DOC_PATH, 'approved');
    commitAll(
      repo,
      'wf(task): approve task-901-doc [pending → backlog]\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: looks good',
    );

    const mismatches = verifyTransitionConsistency(repo, DOC_PATH);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      declared: { from: 'pending', to: 'backlog' },
      derived: { from: 'pending', to: 'approved' },
    });
  });
});

// task-109-transition-brackets-accept-the-ascii-arrow (bug-137). The bracket reader accepted only the
// Unicode arrow, so an ASCII `[from -> to]` bracket — a form this repository's own history carries —
// was passed over in silence, and so was any bracket that parsed in neither form. AC classification
// (T1) is recorded in the task's Execution Notes: the `→` rows and the multi-hop pin are
// characterization, the `->` rows and the unparseable cases are red-first. The multi-hop pin (its AC4)
// was replaced by task-126's chain reading (bug-155), in the describe block after this one.
describe('verifyTransitionConsistency — both arrow forms, and brackets that parse in neither (task-109)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  /** `draft` → `pending` via plain add/submit, then one bracketed commit writing `writtenStatus`. */
  function bracketedHistory(subject: string, writtenStatus: string): void {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    writeDoc(repo, DOC_PATH, 'pending');
    commitAll(repo, 'wf(task): submit task-901-doc');
    writeDoc(repo, DOC_PATH, writtenStatus);
    commitAll(
      repo,
      `${subject}\n\nApprover: Roberto Pompermaier <robypomper@gmail.com> (approver)\nReason: looks good`,
    );
  }

  it.each(['→', '->'])('AC1/AC2: a `[pending %s backlog]` bracket that agrees with the frontmatter yields no finding', (arrow) => {
    bracketedHistory(`wf(task): approve task-901-doc [pending ${arrow} backlog]`, 'backlog');

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([]);
  });

  it.each(['→', '->'])('AC1/AC2: a `[pending %s backlog]` bracket that disagrees with the frontmatter is a mismatch with the same declared states', (arrow) => {
    bracketedHistory(`wf(task): approve task-901-doc [pending ${arrow} backlog]`, 'approved');

    const findings = verifyTransitionConsistency(repo, DOC_PATH);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      declared: { from: 'pending', to: 'backlog' },
      derived: { from: 'pending', to: 'approved' },
    });
  });

  it('AC3: every finding says which kind it is — a disagreement is `kind: \'mismatch\'`', () => {
    bracketedHistory('wf(task): approve task-901-doc [pending → backlog]', 'approved');

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([
      expect.objectContaining({ kind: 'mismatch' }),
    ]);
  });

  it.each(['→', '->'])('AC1/AC2: the arrow may sit without surrounding spaces (`[pending%sbacklog]`)', (arrow) => {
    bracketedHistory(`wf(task): approve task-901-doc [pending${arrow}backlog]`, 'approved');

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([
      expect.objectContaining({ declared: { from: 'pending', to: 'backlog' } }),
    ]);
  });

  it.each([
    ['an unknown arrow', 'wf(task): approve task-901-doc [pending => backlog]'],
    ['an unbalanced bracket (no closing `]`)', 'wf(task): approve task-901-doc [pending → backlog'],
    ['a bracket with no from-state', 'wf(bug): sync task-901-doc [-> backlog, v0.3]'],
    ['a trailing bracket that is not a transition, after one that is', 'wf(bug): sync task-901-doc [pending -> backlog] and task-902 [-> release v0.2]'],
  ])('AC3: a wf() subject carrying %s is reported as an unparseable transition', (_label, subject) => {
    bracketedHistory(subject, 'backlog');

    const findings = verifyTransitionConsistency(repo, DOC_PATH);
    const sha = reconstructMemoryTransitions(repo, DOC_PATH)[2]?.sha;

    expect(findings).toEqual([{ kind: 'unparseable', sha, subject }]);
  });

  it('AC3: a non-wf() subject that quotes a bracket in prose is not reported', () => {
    bracketedHistory('docs(self): the [from → to] bracket belongs to approver-gated verbs', 'backlog');

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([]);
  });
});

// task-126-declare-closed-wf-operation-grammar-bracket-set-state (dl-079 (A), bug-155). A bracket may
// chain states: `[a → b → c]` is read as from `a`, to `c`, and — given the type's machine — every hop
// must be a legal edge of it. This REPLACES task-109's AC4 pin, which read the chain as from `a`, to
// `b → c`, and therefore reported every multi-hop `sync` as drift (bug-155).
describe('verifyTransitionConsistency — a multi-hop bracket is a chain (task-126, bug-155)', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  /** The `bug` machine of `.wingfoil/memory.yaml`, inline so the fixture needs no config file. */
  const BUG_MACHINE: StateMachine = {
    sequence: ['draft', 'open', 'triaged', 'planned', 'in-progress', 'in-review', 'resolved', 'closed'],
    gates: {
      open: { reject: 'closed' },
      triaged: { reject: 'closed' },
      planned: { reject: 'closed' },
      'in-review': { reject: 'in-progress' },
      resolved: { reject: 'in-progress' },
    },
    waiting: ['triaged', 'planned'],
  };

  /** `in-review` via add, then one `sync` commit carrying `bracket` and writing `writtenStatus`. */
  function chainHistory(bracket: string, writtenStatus: string): string {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'in-review');
    commitAll(repo, 'wf(bug): add task-901-doc');
    writeDoc(repo, DOC_PATH, writtenStatus);
    const subject = `wf(bug): sync task-901-doc ${bracket}`;
    commitAll(repo, subject);
    return subject;
  }

  it.each(['→', '->'])('AC2: a `[in-review %s resolved … closed]` chain that ends where the frontmatter does is no finding — from the first state, to the last', (arrow) => {
    chainHistory(`[in-review ${arrow} resolved ${arrow} closed]`, 'closed');

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([]);
    expect(verifyTransitionConsistency(repo, DOC_PATH, BUG_MACHINE)).toEqual([]);
  });

  it.each(['→', '->'])('AC2: a chain written with `%s` whose last state disagrees with the frontmatter is a mismatch declared from the first state to the last', (arrow) => {
    chainHistory(`[in-review ${arrow} resolved ${arrow} closed]`, 'resolved');

    expect(verifyTransitionConsistency(repo, DOC_PATH, BUG_MACHINE)).toEqual([
      expect.objectContaining({
        kind: 'mismatch',
        declared: { from: 'in-review', to: 'closed' },
        derived: { from: 'in-review', to: 'resolved' },
      }),
    ]);
  });

  it.each(['→', '->'])('AC2: a chain written with `%s` whose intermediate hop is not an edge of the machine is an `illegal-hop` finding naming that hop', (arrow) => {
    // in-review → draft is no edge of the bug machine (neither the forward edge nor a reject target),
    // and neither is draft → closed; draft → open → closed would be (forward, then open's reject).
    const subject = chainHistory(`[in-review ${arrow} draft ${arrow} closed]`, 'closed');
    const sha = reconstructMemoryTransitions(repo, DOC_PATH)[1]?.sha;

    expect(verifyTransitionConsistency(repo, DOC_PATH, BUG_MACHINE)).toEqual([
      { kind: 'illegal-hop', sha, subject, hop: { from: 'in-review', to: 'draft' } },
      { kind: 'illegal-hop', sha, subject, hop: { from: 'draft', to: 'closed' } },
    ]);
  });

  it('AC2: a reject edge and the implicit `deprecated` edge are legal hops of a chain', () => {
    chainHistory('[in-review → in-progress → deprecated]', 'deprecated');

    expect(verifyTransitionConsistency(repo, DOC_PATH, BUG_MACHINE)).toEqual([]);
  });

  it.each([
    ['an empty middle state', '[in-review →  → closed]'],
    ['an empty last state', '[in-review → resolved →]'],
  ])('AC2: a chain with %s is reported as unparseable', (_label, bracket) => {
    const subject = chainHistory(bracket, 'closed');
    const sha = reconstructMemoryTransitions(repo, DOC_PATH)[1]?.sha;

    expect(verifyTransitionConsistency(repo, DOC_PATH, BUG_MACHINE)).toEqual([
      { kind: 'unparseable', sha, subject },
    ]);
  });
});

// task-126 (dl-079 (A)): the closed `wf()` operation list — the five CLI verbs plus `start`,
// `finalize`, `sync`, `amend`, `park`, `assign` — and the scopes and subjects that are not Memory
// operations.
describe('reconstructMemoryTransitions — the declared operation list (task-126, dl-079 (A))', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  /** One `add`, then one commit per subject, each writing a fresh status so git has a change to record. */
  function operationsOf(subjects: readonly string[]): (string | null)[] {
    repo = makeTempGitRepo();
    writeDoc(repo, DOC_PATH, 'draft');
    commitAll(repo, 'wf(task): add task-901-doc');
    subjects.forEach((subject, index) => {
      writeDoc(repo, DOC_PATH, `state-${index}`);
      commitAll(repo, subject);
    });
    return reconstructMemoryTransitions(repo, DOC_PATH)
      .slice(1)
      .map((t) => t.operation);
  }

  it('AC1: reports `start`, `finalize`, `sync`, `amend` and `park` for subjects of those verbs', () => {
    expect(
      operationsOf([
        'wf(task): start task-901-doc [backlog → in-progress]',
        'wf(task): park task-901-doc [in-progress → backlog]',
        'wf(task): amend task-901-doc [backlog → backlog]',
        'wf(task): finalize task-901-doc [approved → done]',
        'wf(bug): sync task-901-doc [in-review -> resolved -> closed]',
      ]),
    ).toEqual(['start', 'park', 'amend', 'finalize', 'sync']);
  });

  it('AC1: an undeclared verb still reports `operation: null` — history is not rewritten (dl-035)', () => {
    expect(
      operationsOf([
        'wf(bug): schedule task-901-doc into v0.2',
        'wf(release): enter-releasing minor-v0.2 [in-development → releasing]',
        'wf(task): start-fix task-901-doc [backlog → in-progress]',
        'wf(task): task-901-doc [backlog → in-progress]',
      ]),
    ).toEqual([null, null, null, null]);
  });

  // Approver ruling 2026-10-01 (reverses release-planning R20/Q6 on this point): `assign` joins the
  // list as `element.set_release`'s verb, in the canonical form history already carries.
  it('reports `assign` for the canonical `assign release {version} to {id}, …` subject, the four practised ones included', () => {
    expect(
      operationsOf([
        'wf(adr): assign release v0.3 to task-901-doc',
        'wf(bug): assign release v0.2.2 to task-901-doc, bug-092-dna-set-and-dna-update-are-indistinguishable',
        'wf(tech-spec): assign release v0.2 to spec-015',
        'wf(decision-log): assign release v0.2.2 to dl-026-repo-versioned-mcp-server-config',
      ]),
    ).toEqual(['assign', 'assign', 'assign', 'assign']);
  });

  it('an `assign` subject outside the canonical form reads `operation: null`', () => {
    expect(
      operationsOf([
        'wf(task): assign task-901-doc',
        'wf(task): assign release v0.3',
        'wf(task): assign owner bob to task-901-doc',
        'wf(task): assign release v0.3 to task-901-doc [backlog → backlog]',
      ]),
    ).toEqual([null, null, null, null]);
  });

  it('AC3: `wf(workflow): create|remove` and `wf(directive): …` commits touching a Memory path are not Memory operations', () => {
    expect(
      operationsOf([
        'wf(workflow): create x',
        'wf(workflow): remove x',
        'wf(directive): create x',
        'wf(directive): assign x to developer',
      ]),
    ).toEqual([null, null, null, null]);
  });

  it('AC3: a configuration scope is not a Memory operation even when its verb token is a declared one (`wf(dna): add`, as `dna add` writes it)', () => {
    expect(
      operationsOf([
        'wf(dna): add stacks.technologies.cli Commander',
        'wf(workflow): finalize x',
        'wf(directive): sync x',
      ]),
    ).toEqual([null, null, null]);
  });

  it('AC6: the non-`wf()` records `workflow: finalize …` (spec-017) and `agent: record …` (spec-016) are not Memory operations', () => {
    expect(operationsOf(['workflow: finalize dev-loop-1 red', 'agent: record run-0001'])).toEqual([null, null]);
  });

  it('a bracket on a configuration scope is not a Memory transition to check', () => {
    operationsOf(['wf(workflow): create x [a → b]']);

    expect(verifyTransitionConsistency(repo, DOC_PATH)).toEqual([]);
  });
});

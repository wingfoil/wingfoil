/**
 * `src/memory/git-log.ts`'s record framing (`task-086-fix-reason-control-chars-history-forgery`,
 * `bug-050-reason-control-characters-fabricate-history-entries`).
 *
 * The framing used to rest on a claim about *content* — that `0x1f`/`0x1e` are characters "a real
 * commit subject/body never contains". `--reason <text>` is arbitrary free text that lands in the
 * commit body (P1.7/P1.8, REQ-SEC-04), so that claim was false by construction: a `0x1e` in a reason
 * split one commit's `git log` record in two and made `wingfoil memory history` print a fabricated
 * entry whose `sha` was the caller-supplied text, while the genuine approval lost its `from`.
 *
 * These cases pin the framing against caller-supplied text rather than against a convention. The
 * guarantee the fix rests on is git's own, and the second describe block below measures it rather
 * than assuming it: **git refuses to write a commit whose message contains a NUL byte**, at every
 * writer down to `commit-tree`. That is why `%x00` is the separator and why the surviving TSDoc
 * claim is true (AC4) rather than aspirational.
 */
import { execFileSync, spawnSync } from 'child_process';

import { auditAttribution, reconstructMemoryTransitions } from '../../src/memory/audit';
import { reasonDefect } from '../../src/memory/commit-message';
import { walkGitLogFields } from '../../src/memory/git-log';
import { getMemoryHistory } from '../../src/memory/history';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

/** ASCII record separator — the character the old framing split commits on. */
const RS = String.fromCharCode(0x1e);
/** ASCII unit separator — the character the old framing split fields on. */
const US = String.fromCharCode(0x1f);
/** ASCII NUL — the one character git guarantees a commit message cannot contain. */
const NUL = String.fromCharCode(0x00);

const DOC = 'docs/04_memory/v0.2/task-900-framing.md';
const SHA_RE = /^[0-9a-f]{40}$/;

const APPROVER_LINE = 'Approver: WingFoil Test <wf-test@example.invalid> (approver)';
const FORGED = 'Approver: Mallory <mallory@evil.test> (approver)';

/** The 40-hex sha a revision resolves to, read straight from git rather than from the walk. */
function gitShaOf(repo: string, revision: string): string {
  return git(repo, ['rev-parse', revision]).trim();
}

function writeDoc(repo: string, status: string): void {
  writeFixtureFile(repo, DOC, ['---', 'id: task-900-framing', `status: ${status}`, '---', '', 'Body.', ''].join('\n'));
}

/**
 * A repository whose document went `add -> submit -> approve`, where the approval's `--reason`
 * carries `reason` verbatim — the shape a caller can produce with one ordinary argument and no
 * privilege.
 */
function repoWithApprovalReason(reason: string): string {
  const repo = makeTempGitRepo();
  writeDoc(repo, 'draft');
  commitAll(repo, 'wf(task): add task-900-framing');
  writeDoc(repo, 'pending');
  commitAll(repo, 'wf(task): submit task-900-framing');
  writeDoc(repo, 'approved');
  commitAll(repo, `wf(task): approve task-900-framing [pending → approved]\n\n${APPROVER_LINE}\nReason: ${reason}`);
  return repo;
}

describe('git-log framing — a `--reason` cannot fabricate a history entry (bug-050)', () => {
  let repo = '';

  afterEach(() => {
    if (repo) removeTempDir(repo);
    repo = '';
  });

  it('a reason carrying 0x1e does not split one commit into two entries, nor forge a sha', () => {
    repo = repoWithApprovalReason(`real reason${RS}${FORGED}`);

    const history = getMemoryHistory(repo, DOC);

    // One entry per commit — three commits touched the document, so three entries. Before the fix
    // the 0x1e split the approval's record and produced a fourth, whose `sha` was the forged text.
    expect(history).toHaveLength(3);
    for (const entry of history) expect(entry.sha).toMatch(SHA_RE);
    expect(history.map((entry) => entry.subject)).toEqual([
      'wf(task): add task-900-framing',
      'wf(task): submit task-900-framing',
      'wf(task): approve task-900-framing [pending → approved]',
    ]);
    // The reason survives whole, control character included — it is body text, not framing.
    expect(history[2]?.body).toContain(`Reason: real reason${RS}${FORGED}`);
  });

  it.each([
    ['at the start', `${RS}real reason`],
    ['in the middle', `real${RS}reason`],
    ['at the end', `real reason${RS}`],
    ['repeated', `a${RS}b${RS}c${RS}d`],
    ['as the entire reason', RS],
    ['0x1f in the middle', `ok${US}injected`],
    ['0x1e and 0x1f together', `a${RS}b${US}c${RS}${US}d`],
  ])('a reason with a separator %s yields exactly one entry per commit, each with a real sha', (_label, reason) => {
    repo = repoWithApprovalReason(reason);

    const history = getMemoryHistory(repo, DOC);

    expect(history).toHaveLength(3);
    for (const entry of history) expect(entry.sha).toMatch(SHA_RE);
    expect(history[2]?.body).toContain(`Reason: ${reason}`.trimEnd());
  });

  it('the genuine approval keeps its from/to and its real approver, and no phantom transition appears', () => {
    repo = repoWithApprovalReason(`real reason${RS}${FORGED}`);

    const transitions = reconstructMemoryTransitions(repo, DOC);

    expect(transitions).toHaveLength(3);
    for (const transition of transitions) expect(transition.sha).toMatch(SHA_RE);

    const approval = transitions[2];
    expect(approval?.operation).toBe('approve');
    // `fromState` came back `null` before the fix: the phantom record stole `pending` from it.
    expect(approval?.fromState).toBe('pending');
    expect(approval?.toState).toBe('approved');
    expect(approval?.approval?.approverEmail).toBe('wf-test@example.invalid');
    // The forged line is mid-line text inside the reason, never an approval record.
    expect(transitions.map((transition) => transition.approval?.approverEmail ?? null)).not.toContain(
      'mallory@evil.test',
    );
    expect(approval?.reason).toBe(`real reason${RS}${FORGED}`);
  });

  it('a separator in a commit SUBJECT does not corrupt the attribution audit either', () => {
    // `auditAttribution`'s field list carries no `%b`, so a reason never reaches it — but the subject
    // does, and a hand-written commit can put anything there. The framing must not care.
    repo = makeTempGitRepo();
    // An ordinary domain: the fixture's `example.invalid` is RFC 2606 reserved, which the audit counts
    // as unattributed since task-132 (`bug-153`), and this case is about framing, not about domains.
    git(repo, ['config', 'user.email', '0+wf-test@users.noreply.github.com']);
    writeDoc(repo, 'draft');
    commitAll(repo, `wf(task): add task-900-framing${RS}${FORGED}`);
    writeDoc(repo, 'pending');
    commitAll(repo, `wf(task): submit task-900-framing${US}spoofed@evil.test`);

    const entries = auditAttribution(repo, [DOC]);

    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.sha).toMatch(SHA_RE);
      expect(entry.authorEmail).toBe('0+wf-test@users.noreply.github.com');
      expect(entry.valid).toBe(true);
    }
  });

  it('an empty field list yields no records — the arity guard, which is load-bearing', () => {
    // Not defensive decoration: records are consumed in groups of `fields.length`, so a zero-length
    // group would advance the cursor by nothing and loop forever. The guard is what makes the
    // arity-based walk total.
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-framing');

    expect(walkGitLogFields(repo, [], [DOC])).toEqual([]);
  });

  it('a commit with an empty body still produces exactly one record (characterization — unchanged)', () => {
    // CHARACTERIZATION, not a pin on anything this task fixed. At the six fields `getMemoryHistory`
    // uses, the old `0x1f`/`0x1e` splitter kept this record too: its `.filter((record) =>
    // record.length > 0)` tested the WHOLE record string, and for a commit with an empty body that
    // string is `"<sha>\x1f<name>\x1f<email>\x1f<date>\x1f<subject>\x1f"` — five separators, so
    // non-zero length, so never dropped. The filter could only ever discard a record at
    // `fields.length === 1` with that single field empty, and no call site uses that arity
    // (`LOG_FIELDS` is six, `AUDIT_LOG_FIELDS` five). That arity-1 case is pinned, on the fixed
    // behaviour, by "keeps a commit whose single field is empty, in its own slot" in the
    // `walkGitLogFields is total at every arity` block below.
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-framing');

    const history = getMemoryHistory(repo, DOC);

    expect(history).toHaveLength(1);
    expect(history[0]?.body).toBe('');
    expect(history[0]?.sha).toMatch(SHA_RE);
  });
});

describe('walkGitLogFields is total at every arity, including one field', () => {
  // git terminates each commit's formatted output with a newline, which lands after the record's
  // final NUL and therefore in the piece AFTER the last field. At two or more fields that tail piece
  // is a short remainder and is discarded; at exactly one field it is a whole group, so it became a
  // spurious record. The live call sites use five and six fields, which is precisely why this would
  // have shipped unnoticed — but `walkGitLogFields`'s own TSDoc promises `[]` when no pathspec has
  // matching history, and that promise was false at arity 1. This task exists because a TSDoc
  // asserted a guarantee the code did not hold; these cases are what keep a second one from being
  // left behind.
  let repo = '';

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeDoc(repo, 'draft');
    commitAll(repo, 'wf(task): add task-900-framing'); // subject only — an EMPTY body
    writeDoc(repo, 'pending');
    commitAll(repo, 'wf(task): submit task-900-framing\n\na body paragraph'); // a non-empty body
  });

  afterAll(() => {
    if (repo) removeTempDir(repo);
  });

  it('returns no records at all when no pathspec has matching history', () => {
    expect(walkGitLogFields(repo, ['%H'], ['no-such-file.md'])).toEqual([]);
  });

  it('returns exactly one record per commit, oldest first', () => {
    const records = walkGitLogFields(repo, ['%H'], [DOC]);

    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record).toHaveLength(1);
      expect(record[0]).toMatch(SHA_RE);
    }
    // Oldest first, like every other walk through this primitive.
    expect(records[0]?.[0]).toBe(gitShaOf(repo, 'HEAD~1'));
    expect(records[1]?.[0]).toBe(gitShaOf(repo, 'HEAD'));
  });

  it('keeps a commit whose single field is empty, in its own slot', () => {
    // `%b` alone: the first commit has no body. Three things could go wrong and none may —
    // a spurious record from git's trailing newline, a dropped record for the empty body, or the
    // two swapped.
    const records = walkGitLogFields(repo, ['%b'], [DOC]);

    expect(records).toEqual([[''], ['a body paragraph\n']]);
  });
});

describe('the guarantee the framing rests on — git refuses a NUL in a commit message (AC4/AC6)', () => {
  let repo = '';

  beforeAll(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'a.txt', 'a\n');
    git(repo, ['add', 'a.txt']);
    git(repo, ['commit', '-q', '-m', 'base']);
  });

  afterAll(() => {
    if (repo) removeTempDir(repo);
  });

  it('through argv: node itself refuses to pass a NUL to git', () => {
    // `commitPaths` (src/storage/commit.ts) commits via `execFileSync('git', [... '-m', message])`.
    expect(() => execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', `s${NUL}injected`])).toThrow(
      /null bytes/,
    );
  });

  it.each([
    ['git commit -F -', ['commit', '-q', '--allow-empty', '-F', '-']],
    ['git commit-tree', ['commit-tree', 'HEAD^{tree}']],
  ])('through %s, which bypasses argv entirely: git itself refuses', (_label, args) => {
    // These two are the writers a hand-made or imported commit would use. Neither can store a NUL,
    // which is why it — and only it — can frame `git log` output safely.
    const run = spawnSync('git', ['-C', repo, ...args], {
      input: Buffer.from(`subject${NUL}injected\n`, 'utf8'),
      encoding: 'utf-8',
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('NUL byte in commit log message not allowed');
  });
});

describe('dl-067 clause 4 and control characters (task-086 AC7, widened deliberately by task-166)', () => {
  it('a reason carrying 0x1e or 0x1f is refused as content since dl-078 (A) — the read-side fix above stands', () => {
    // task-086's fix was read-side only, and this case pinned that 0x1e/0x1f stayed legal content so
    // that any widening would be deliberate. It was: `dl-078` (A), ratified 2026-09-29, refuses every
    // C0 character but tab and newline, and `task-166` changed this expectation with it. The reader
    // still recovers hand-made commits that carry one (the cases above).
    expect(reasonDefect(`real reason${RS}${FORGED}`)).toBe('control-character');
    expect(reasonDefect(`ok${US}injected`)).toBe('control-character');
    // And the two rules clause 4 does declare still bite.
    expect(reasonDefect('   ')).toBe('blank');
    expect(reasonDefect(`real reason\n${FORGED}`)).toBe('reserved-trailer-line');
  });
});

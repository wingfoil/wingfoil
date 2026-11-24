/**
 * task-365 AC 2, AC 3, AC 6 and AC 8 (red-first; `spec-020` §4.1–§4.11, §4.13, §5, §7, §8.2; design item 1, D1 (a),
 * D3 (a)) — the checks of `src/core/governance-check.ts`, each an exported function of one commit, a `HistoryReader`
 * and the context `{ gated }`, driven with the in-memory reader of `./helpers/in-memory-history-reader` and no
 * repository at all (the reader throws on a call it has no answer for).
 *
 * - AC 2: every row of `spec-020` §4.2–§4.11 is reached once, with its exact message, its `rule` (the category) and
 *   its `check` (equal to `rule` for the five base checks, D3 (a)); and each check returns nothing for a commit its
 *   section does not name (a merge for the non-merge checks, a `wf(dna):` commit for `subject`, a commit that is no
 *   `workflow:` record for `workflow-record-authority`).
 * - AC 3: `memory.yaml` and `dna.yaml` are the first parent's (§4.1): a type declared, a machine widened, a role granted
 *   or a content root added in the judged commit itself does not count.
 * - AC 6: `GOVERNANCE_CHECKS` is §7's list; `renderVerifyConsole` prints §7's console layout for a hand-written report;
 *   `verifyFindingsMessage` is §8.2's reason.
 * - AC 8: no check needs a repository (this file builds none).
 *
 * Expected messages: `spec-020` §4's tables word for word; the interpolated values and the `stateUnchecked` reasons (which
 * §4.5 leaves to the script's wording, kept for T-30's parity) were read from real runs of
 * `node scripts/check-governance.cjs --root <fixture> --json [--base <rev>]` on fixtures of the same shape (the red notes
 * name each run); the §4.1 departures (the parent's `memory.yaml`) are the spec's text, since the script reads the
 * commit's own.
 *
 * Expected red: `src/core/governance-check.ts` does not exist (`tsc` TS2307; jest `Cannot find module`).
 */
import {
  GOVERNANCE_CHECKS,
  VERIFY_WHOLE_HISTORY,
  checkApprovalAgentTrailer,
  checkAuthority,
  checkBody,
  checkBracket,
  checkState,
  checkStatusOutsideWf,
  checkSubject,
  checkSupersedesPair,
  checkTrailerParagraph,
  checkVerbEdge,
  checkWorkflowRecordAuthority,
  renderVerifyConsole,
  verifyFindingsMessage,
  type GovernanceReport,
  type HistoryCommit,
  type HistoryReader,
} from '../../src/core/governance-check';
import {
  ADR,
  APPROVER,
  DEVELOPER,
  DNA,
  INVALID_DNA,
  INVALID_MEMORY_YAML,
  MEMORY_YAML,
  STRANGER,
  TASK,
  adrDoc,
  approvalBody,
  approverLine,
  dnaYaml,
  governedModel,
  HistoryModel,
  taskDoc,
} from './helpers/in-memory-history-reader';

type Check = (commit: HistoryCommit, reader: HistoryReader, context: { gated: boolean }) => {
  findings: readonly { rule: string; check: string; message: string }[];
  stateUnchecked: readonly string[];
};

interface Finding {
  readonly rule: string;
  readonly check: string;
  readonly message: string;
}

const finding = (rule: string, check: string, message: string): Finding => ({ rule, check, message });
const byMessage = (a: Finding, b: Finding): number => (a.message < b.message ? -1 : a.message > b.message ? 1 : 0);

/** The findings of `check` on `commit`, sorted by message (one check's own order is not §3's; the report sorts). */
function findingsOf(check: Check, commit: HistoryCommit, reader: HistoryReader, gated = true): Finding[] {
  return check(commit, reader, { gated }).findings.map((entry: Finding) => ({ rule: entry.rule, check: entry.check, message: entry.message })).sort(byMessage);
}

const DECLARED = 'add, submit, approve, reject, deprecate, start, finalize, sync, amend, park, assign';
const ANCHOR = '(git-conventions §8, bug-391)';
const AGENT = 'an approval commit (it has an Approver: line) carries no agent trailer (spec-018 §4, git-conventions §7), yet it has';
const NO_NAMED = 'no document it touches is named by its subject';

describe('task-365 AC 6 — GOVERNANCE_CHECKS and VERIFY_WHOLE_HISTORY (spec-020 §7, §8.2)', () => {
  it('GOVERNANCE_CHECKS is §7\'s eleven { check, rule, since } in §4\'s order, frozen', () => {
    expect(GOVERNANCE_CHECKS).toEqual([
      { check: 'subject', rule: 'subject', since: '0.4.0' },
      { check: 'bracket', rule: 'bracket', since: '0.4.0' },
      { check: 'body', rule: 'body', since: '0.4.0' },
      { check: 'authority', rule: 'authority', since: '0.4.0' },
      { check: 'state', rule: 'state', since: '0.4.0' },
      { check: 'verb-edge', rule: 'state', since: '0.4.0' },
      { check: 'status-outside-wf', rule: 'state', since: '0.4.0' },
      { check: 'supersedes-pair', rule: 'state', since: '0.4.0' },
      { check: 'approval-agent-trailer', rule: 'body', since: '0.4.0' },
      { check: 'workflow-record-authority', rule: 'body', since: '0.4.0' },
      { check: 'trailer-paragraph', rule: 'body', since: '0.4.0' },
    ]);
    expect(Object.isFrozen(GOVERNANCE_CHECKS)).toBe(true);
    for (const entry of GOVERNANCE_CHECKS as readonly object[]) expect(Object.keys(entry)).toEqual(['check', 'rule', 'since']);
  });

  it('VERIFY_WHOLE_HISTORY is §8.2\'s warning text, its code included and no `warning: ` prefix', () => {
    expect(VERIFY_WHOLE_HISTORY).toBe(
      'W_VERIFY_WHOLE_HISTORY: no --base and no --introduced-at, so every commit reachable from HEAD is judged and gated; pass --base <rev> to judge a range, or --introduced-at <rev> to report older history without failing',
    );
  });
});

describe('task-365 AC 2 — subject (spec-020 §4.2)', () => {
  const S = (message: string): Finding => finding('subject', 'subject', message);
  const model = governedModel();
  const grammar = model.commit({ subject: 'wf(task) submit t-1' });
  const assign = model.commit({ subject: 'wf(task): assign t-1' });
  const verb = model.commit({ subject: 'wf(task): aprove t-1 [pending → backlog]' });
  const type = model.commit({ subject: 'wf(unicorn): add unicorn-1', files: { 'docs/memory/unicorn/unicorn-1.md': '---\nid: "unicorn-1"\ntype: unicorn\ntitle: "U"\nstatus: draft\n---\n\nBody.\n' } });
  const ids = model.commit({ subject: 'wf(task): submit t-1 t-2' });
  const side = model.commit({ subject: 'docs: side note', files: { 'notes.md': 'x\n' }, detached: true });
  const merge = model.commit({ subject: 'wf(task): aprove t-1', parents: [ids.sha, side.sha] });
  const dna = model.commit({ subject: 'wf(dna): set project.name' });
  const other = model.commit({ subject: 'docs: tidy' });
  const valid = model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER });
  const reader = model.reader();

  it.each<[string, HistoryCommit, string]>([
    ['the subject does not match the grammar', grammar, 'not in the wf({type}): {verb} {ids} grammar'],
    ['an assign subject not in its canonical form', assign, 'an assign subject must be `wf({type}): assign release {version} to {ids}`, with no bracket'],
    ['a verb that is not declared', verb, `'aprove' is not one of the declared verbs (${DECLARED})`],
    ['a type memory.yaml does not declare', type, "'unicorn' is not a type of the memory.yaml committed at this commit"],
    ['ids not separated by ", "', ids, "the ids after the verb must be a list separated by ', '"],
    ['a merge with a wf() subject is judged (merges included)', merge, "'aprove' is not one of the declared verbs (" + DECLARED + ')'],
  ])('%s', (_label, commit, message) => {
    expect(findingsOf(checkSubject, commit, reader)).toEqual([S(message)]);
  });

  it.each<[string, HistoryCommit]>([
    ['a wf(dna): commit (a configuration scope)', dna],
    ['an other commit', other],
    ['a canonical subject', valid],
  ])('judges nothing on %s', (_label, commit) => {
    expect(findingsOf(checkSubject, commit, reader)).toEqual([]);
  });

  it('AC 3 — the type is read from the first parent\'s memory.yaml: declaring it in the same commit does not count', () => {
    const widened = governedModel();
    const declares = widened.commit({
      subject: 'wf(unicorn): add unicorn-1',
      files: {
        '.wingfoil/memory.yaml': `${MEMORY_YAML}  unicorn:\n    path: "docs/memory/unicorn/{id}.md"\n`,
        'docs/memory/unicorn/unicorn-1.md': '---\nid: "unicorn-1"\ntype: unicorn\ntitle: "U"\nstatus: draft\n---\n\nBody.\n',
      },
    });
    expect(findingsOf(checkSubject, declares, widened.reader())).toEqual([S("'unicorn' is not a type of the memory.yaml committed at this commit")]);
  });
});

describe('task-365 AC 2 — bracket (spec-020 §4.3)', () => {
  const B = (message: string): Finding => finding('bracket', 'bracket', message);
  const model = governedModel();
  const cases: [string, string, string][] = [
    ['add/submit/assign with a bracket', 'wf(task): submit t-1 [draft → pending]', "'submit' carries no bracket"],
    ['a bracket that is not canonical', 'wf(task): approve t-1 [pending -> backlog]', 'the bracket is not canonical: [from → to], with the U+2192 arrow and single spaces, closing the subject'],
    ['no bracket at all', 'wf(task): approve t-1', "'approve' needs a [from → to] bracket"],
    ['a chain under a verb that is not sync', 'wf(task): approve t-1 [pending → backlog → in-progress]', "only 'sync' may chain states; 'approve' brackets one hop"],
    ['deprecate not ending in deprecated', 'wf(task): deprecate t-1 [pending → backlog]', "'deprecate' ends in 'deprecated'"],
    ['amend not [s → s]', 'wf(task): amend t-1 [pending → backlog]', "'amend' brackets the unchanged state, [s → s]"],
    ['park not one hop between two different states', 'wf(task): park t-1 [backlog → backlog]', "'park' brackets one hop between two different states, [from → to]"],
  ];
  const commits = cases.map(([, subject]) => model.commit({ subject, body: approvalBody(), author: APPROVER }));
  const unparsed = model.commit({ subject: 'wf(task): aprove t-1 [pending -> backlog]' });
  const reader = model.reader();

  it.each(cases.map(([label, , message], index) => [label, index, message] as const))('%s', (_label, index, message) => {
    expect(findingsOf(checkBracket, commits[index] as HistoryCommit, reader)).toEqual([B(message)]);
  });

  it('judges nothing when the verb did not parse', () => {
    expect(findingsOf(checkBracket, unparsed, reader)).toEqual([]);
  });
});

describe('task-365 AC 2 — body (spec-020 §4.4, category body)', () => {
  const Y = (message: string): Finding => finding('body', 'body', message);
  const A = approverLine();
  const SUBJECT = 'wf(task): approve t-1 [pending → backlog]';
  const model = governedModel();
  const assign = model.commit({ subject: 'wf(task): assign release v1 to t-1', body: A, author: APPROVER });
  const noApprover = model.commit({ subject: SUBJECT, body: 'Reason: ok.', author: APPROVER });
  const second = model.commit({ subject: SUBJECT, body: `Reason: ok.\n${A}`, author: APPROVER });
  const role = model.commit({ subject: SUBJECT, body: approvalBody('ok.', APPROVER, 'developer'), author: APPROVER });
  const two = model.commit({ subject: SUBJECT, body: `${A}\n${A}\nReason: ok.`, author: APPROVER });
  const noReason = model.commit({ subject: SUBJECT, body: A, author: APPROVER });
  const blank = model.commit({ subject: SUBJECT, body: `${A}\nReason:`, author: APPROVER });
  const twoReasons = model.commit({ subject: SUBJECT, body: `${A}\nReason: a.\nReason: b.`, author: APPROVER });
  const keyCase = model.commit({ subject: SUBJECT, body: `${A}\nreason: a.`, author: APPROVER });
  const parkNone = model.commit({ subject: 'wf(task): park t-1 [in-progress → backlog]' });
  const unparsed = model.commit({ subject: 'wf(task): aprove t-1 [pending → backlog]', body: 'Reason: ok.' });
  const valid = model.commit({ subject: SUBJECT, body: approvalBody(), author: APPROVER });
  const park = model.commit({ subject: 'wf(task): park t-1 [in-progress → backlog]', body: 'Reason: Not now.' });
  const reader = model.reader();
  const DEFECT = 'the Reason: block must not contain a line starting with "Approver:", "Reason:" or "WingFoil-Version:" (dl-067)';

  it.each<[string, HistoryCommit, string[]]>([
    ['assign with an Approver: line', assign, ["'assign' is not an approval: it carries no Approver: line"]],
    ['an approval with no Approver: line', noApprover, ["'approve' needs an Approver: line"]],
    ['the Approver: line not the first body line (it also lands in the Reason: block)', second, ['the Approver: line must be the first body line, as `Approver: Name <email> (role)`', DEFECT]],
    ['an Approver: role that is not approver', role, ["the Approver: role is 'developer', not 'approver'"]],
    ['two Approver: lines', two, ['2 Approver: lines; an approval records one']],
    ['approve with no Reason: line', noReason, ["'approve' needs a Reason: block"]],
    ['a blank Reason: block (dl-067)', blank, ['the Reason: block must not be blank (dl-067)']],
    ['two Reason: lines', twoReasons, ['2 Reason: lines; a commit records one Reason: block', DEFECT]],
    ['a Reason: key not spelled Reason:', keyCase, ['the Reason: key is written `Reason:`']],
    ['park with no Reason: line', parkNone, ["'park' needs a Reason: block"]],
  ])('%s', (_label, commit, messages) => {
    expect(findingsOf(checkBody, commit, reader)).toEqual(messages.map(Y).sort(byMessage));
  });

  it.each<[string, HistoryCommit]>([
    ['a verb that did not parse', unparsed],
    ['a well-formed approval', valid],
    ['a park with its Reason:', park],
  ])('judges nothing on %s', (_label, commit) => {
    expect(findingsOf(checkBody, commit, reader)).toEqual([]);
  });
});

describe('task-365 AC 2 / AC 3 — authority (spec-020 §4.4, category authority; dna.yaml at the first parent)', () => {
  const U = (message: string): Finding => finding('authority', 'authority', message);
  const SUBJECT = 'wf(task): approve t-1 [pending → backlog]';
  const NO_ROLE = (email: string): string => `the author <${email}> holds no approver role in team.members (dl-094)`;
  const OTHER = (named: string, author: string): string => `the Approver: line names <${named}>, but <${author}> authored the commit (dl-094)`;

  it('the author holds no approver role', () => {
    const model = governedModel();
    const commit = model.commit({ subject: SUBJECT, body: approvalBody('ok.', DEVELOPER), author: DEVELOPER, files: { [TASK('t-1')]: taskDoc('backlog') } });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([U(NO_ROLE(DEVELOPER.email))]);
  });

  it('the Approver: email differs from the author\'s', () => {
    const model = governedModel();
    const commit = model.commit({ subject: SUBJECT, body: 'Approver: Nobody <nobody@example.invalid> (approver)\nReason: ok.', author: APPROVER });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([U(OTHER('nobody@example.invalid', APPROVER.email))]);
  });

  it('T-6 — the developer authors, the Approver: line names the approver: both findings', () => {
    const model = governedModel();
    const commit = model.commit({ subject: SUBJECT, body: approvalBody('Ready.'), author: DEVELOPER, files: { [TASK('t-1')]: taskDoc('backlog') } });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([U(OTHER(APPROVER.email, DEVELOPER.email)), U(NO_ROLE(DEVELOPER.email))].sort(byMessage));
  });

  it('T-8 — a non-member forges an approval naming another non-member', () => {
    const model = governedModel();
    const commit = model.commit({ subject: SUBJECT, body: 'Approver: Nobody <nobody@example.invalid> (approver)\nReason: Looks fine.', author: STRANGER, files: { [TASK('t-1')]: taskDoc('backlog') } });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([U(OTHER('nobody@example.invalid', STRANGER.email)), U(NO_ROLE(STRANGER.email))].sort(byMessage));
  });

  it('no dna.yaml is committed at the first parent', () => {
    const model = governedModel();
    model.commit({ subject: 'chore: drop dna', files: { '.wingfoil/dna.yaml': null } });
    const commit = model.commit({ subject: SUBJECT, body: approvalBody('x.'), author: APPROVER, files: { [TASK('t-1')]: taskDoc('backlog') } });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([U('no .wingfoil/dna.yaml is committed before this commit, so no approval authority can be established')]);
  });

  it('the dna.yaml of the first parent does not validate (its first issue)', () => {
    const model = governedModel();
    model.commit({ subject: 'chore: broken dna', files: { '.wingfoil/dna.yaml': INVALID_DNA } });
    const commit = model.commit({ subject: 'wf(task): start t-1 [pending → backlog]', body: approvalBody('x.'), author: APPROVER });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([
      U('the .wingfoil/dna.yaml committed before this commit does not validate (Invalid input: expected array, received undefined)'),
    ]);
  });

  it('AC 3 / T-7 — the approver added to team.members in the approving commit itself holds no role yet', () => {
    const model = governedModel({ dna: dnaYaml([{ ...DEVELOPER, roles: ['developer'] }]) });
    const commit = model.commit({ subject: SUBJECT, body: approvalBody('Ready.'), author: APPROVER, files: { [TASK('t-1')]: taskDoc('backlog'), '.wingfoil/dna.yaml': DNA } });
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([U(NO_ROLE(APPROVER.email))]);
  });

  it.each<[string, (model: HistoryModel) => HistoryCommit]>([
    ['a well-formed approval by the approver', (model) => model.commit({ subject: SUBJECT, body: approvalBody(), author: APPROVER })],
    ['an assign with an Approver: line (not an approval)', (model) => model.commit({ subject: 'wf(task): assign release v1 to t-1', body: approverLine(DEVELOPER), author: DEVELOPER })],
    ['a submit (records no approval)', (model) => model.commit({ subject: 'wf(task): submit t-1', author: STRANGER })],
  ])('judges nothing on %s', (_label, build) => {
    const model = governedModel();
    const commit = build(model);
    expect(findingsOf(checkAuthority, commit, model.reader())).toEqual([]);
  });
});

describe('task-365 AC 2 / AC 3 — state (spec-020 §4.5; memory.yaml at the first parent)', () => {
  const T = (message: string): Finding => finding('state', 'state', message);
  const DOC = TASK('t-1');

  it('a gated commit with no memory.yaml at the first parent is a finding; the same commit as history is state not checked', () => {
    const model = new HistoryModel();
    model.commit({ subject: 'chore: team', files: { '.wingfoil/dna.yaml': DNA } });
    model.markBase();
    const early = model.commit({ subject: 'wf(task): add t-1', files: { [DOC]: taskDoc('draft') } });
    const reader = model.reader();
    expect(checkState(early, reader, { gated: true })).toEqual({
      findings: [T('no .wingfoil/memory.yaml is committed at this commit: its state cannot be checked')],
      stateUnchecked: [],
    });
    expect(checkState(early, reader, { gated: false })).toEqual({
      findings: [],
      stateUnchecked: ['no .wingfoil/memory.yaml is committed at this commit: transitions not judged'],
    });
  });

  it('a gated commit whose first parent\'s memory.yaml does not validate', () => {
    const model = governedModel();
    model.commit({ subject: 'chore: broken memory', files: { '.wingfoil/memory.yaml': INVALID_MEMORY_YAML } });
    const commit = model.commit({ subject: 'wf(task): start t-1 [pending → backlog]', files: { [DOC]: taskDoc('backlog') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([
      T('the .wingfoil/memory.yaml committed at this commit does not validate (Invalid input: expected record, received number): its state cannot be checked'),
    ]);
  });

  it('a single-hop bracket that is no edge of the machine', () => {
    const model = governedModel();
    model.commit({ subject: 'docs: set', files: { [DOC]: taskDoc('done') } });
    const commit = model.commit({ subject: 'wf(task): approve t-1 [done → pending]', body: approvalBody('x.'), author: APPROVER, files: { [DOC]: taskDoc('pending') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T("done → pending is not an edge of the 'task' machine at this commit")]);
  });

  it('a park hop that is not a returns edge', () => {
    const model = governedModel();
    model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('backlog') } });
    const commit = model.commit({ subject: 'wf(task): park t-1 [backlog → in-progress]', body: 'Reason: Not now.', files: { [DOC]: taskDoc('in-progress') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T("backlog → in-progress is not a returns edge of the 'task' machine at this commit")]);
  });

  it('the consistency walk reports a mismatch on the named document', () => {
    const model = governedModel();
    const subject = 'wf(task): approve t-1 [pending → backlog]';
    const commit = model.commit({ subject, body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('in-progress') } });
    const reader = model.reader({
      transitionFindings: { [DOC]: [{ kind: 'mismatch', sha: commit.sha, subject, declared: { from: 'pending', to: 'backlog' }, derived: { from: 'pending', to: 'in-progress' } }] as never },
    });
    expect(findingsOf(checkState, commit, reader)).toEqual([T(`${DOC}: the bracket declares pending → backlog, the frontmatter went pending → in-progress`)]);
  });

  it('the consistency walk reports an illegal hop on the named document', () => {
    const model = governedModel();
    const subject = 'wf(task): sync t-1 [pending → draft → backlog]';
    const commit = model.commit({ subject, files: { [DOC]: taskDoc('backlog') } });
    const reader = model.reader({ transitionFindings: { [DOC]: [{ kind: 'illegal-hop', sha: commit.sha, subject, hop: { from: 'draft', to: 'backlog' } }] as never } });
    expect(findingsOf(checkState, commit, reader)).toEqual([T(`${DOC}: the hop draft → backlog is not an edge of the 'task' machine at this commit`)]);
  });

  it('the consistency walk reports a bracket that does not read as a transition', () => {
    const model = governedModel();
    const subject = 'wf(task): start t-1 [pending →]';
    const commit = model.commit({ subject, files: { [DOC]: taskDoc('backlog') } });
    const reader = model.reader({ transitionFindings: { [DOC]: [{ kind: 'unparseable', sha: commit.sha, subject }] as never } });
    expect(findingsOf(checkState, commit, reader)).toEqual([T(`${DOC}: the bracket does not read as a transition`)]);
  });

  it('a document the subject does not name, whose status the commit changed (T-13)', () => {
    const model = governedModel();
    model.commit({ subject: 'wf(task): add t-2', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
    const commit = model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('backlog'), [TASK('t-2')]: taskDoc('pending', '', 't-2') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T(`${TASK('t-2')}: the subject does not name it, yet its status went draft → pending`)]);
  });

  it('assign that changed status', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'wf(task): assign release v1 to t-1', files: { [DOC]: taskDoc('backlog') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T(`${DOC}: 'assign' never changes status, yet it went pending → backlog`)]);
  });

  it('add leaving a state other than the machine\'s first', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'wf(task): add t-3', files: { [TASK('t-3')]: taskDoc('pending', '', 't-3') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T(`${TASK('t-3')}: 'add' leaves it in the initial state 'draft', not 'pending'`)]);
  });

  it('submit moving along no edge', () => {
    const model = governedModel();
    model.commit({ subject: 'docs: set', files: { [DOC]: taskDoc('backlog') } });
    const commit = model.commit({ subject: 'wf(task): submit t-1', files: { [DOC]: taskDoc('done') } });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T(`${DOC}: 'submit' moved it backlog → done, not an edge of the 'task' machine at this commit`)]);
  });

  it('AC 3 / T-22 — a state added to memory.yaml and used in the same commit is judged against the parent\'s machine', () => {
    const model = new HistoryModel();
    model.commit({ subject: 'chore: configure wingfoil', files: { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA } });
    model.commit({ subject: 'wf(task): add t-1', files: { [DOC]: taskDoc('draft') } });
    model.markBase();
    const commit = model.commit({
      subject: 'wf(task): submit t-1',
      files: { '.wingfoil/memory.yaml': MEMORY_YAML.replace('[draft, pending,', '[draft, submitted, pending,'), [DOC]: taskDoc('submitted') },
    });
    expect(findingsOf(checkState, commit, model.reader())).toEqual([T(`${DOC}: 'submit' moved it draft → submitted, not an edge of the 'task' machine at this commit`)]);
  });

  it('state not checked: no document the commit touches is named by its subject', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER });
    expect(checkState(commit, model.reader(), { gated: true })).toEqual({ findings: [], stateUnchecked: [NO_NAMED] });
  });

  it('state not checked: the type has no machine', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'wf(unicorn): add unicorn-1', files: { 'docs/memory/unicorn/unicorn-1.md': '---\nid: "unicorn-1"\ntype: unicorn\ntitle: "U"\nstatus: draft\n---\n\nBody.\n' } });
    expect(checkState(commit, model.reader(), { gated: true })).toEqual({
      findings: [],
      stateUnchecked: ["no machine for 'unicorn' in the .wingfoil/memory.yaml at this commit: transitions not judged"],
    });
  });

  it('judges nothing on an other commit', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'docs: tidy', files: { [DOC]: taskDoc('backlog') } });
    expect(checkState(commit, model.reader(), { gated: true })).toEqual({ findings: [], stateUnchecked: [] });
  });
});

describe('task-365 AC 2 — verb-edge (spec-020 §4.6, category state)', () => {
  const V = (message: string): Finding => finding('state', 'verb-edge', message);
  const model = governedModel();
  const approve = model.commit({ subject: 'wf(task): approve t-1 [pending → draft]', body: approvalBody('x.'), author: APPROVER });
  const start = model.commit({ subject: 'wf(task): start t-1 [approved → done]' });
  const finalize = model.commit({ subject: 'wf(task): finalize t-1 [in-progress → in-review]' });
  const reject = model.commit({ subject: 'wf(task): reject t-1 [pending → backlog]', body: approvalBody('x.'), author: APPROVER });
  const rejected = model.commit({ subject: 'wf(task): reject t-1 [in-review → in-progress]', body: approvalBody('Fix it.'), author: APPROVER });
  const cited = model.commit({ subject: 'wf(task): sync t-1 [in-review → in-progress]', body: `Follows the reject ${rejected.sha.slice(0, 12)}.` });
  const bare = model.commit({ subject: 'wf(task): sync t-1 [in-review → in-progress]' });
  const legal = model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER });
  const reader = model.reader();

  it.each<[string, HistoryCommit, string]>([
    ['approve on no forward edge', approve, "'approve' moves along a forward edge; pending → draft is a reject edge of the 'task' machine"],
    ['start into the last state', start, "'start' moves along a forward edge not into the last state 'done' (that is 'finalize'); approved → done is a forward edge of the 'task' machine"],
    ['finalize not into the last state', finalize, "'finalize' moves along the forward edge into the last state 'done'; in-progress → in-review is a forward edge of the 'task' machine"],
    ['reject on no gates reject edge', reject, "'reject' moves along a gates reject edge; pending → backlog is a forward edge of the 'task' machine"],
    ['T-15 — a sync along a reject edge with no reject commit cited', bare, "in-review → in-progress is a reject edge of the 'task' machine: the body must cite the approver's reject commit by sha (dl-061 B.1)"],
  ])('%s', (_label, commit, message) => {
    expect(findingsOf(checkVerbEdge, commit, reader)).toEqual([V(message)]);
  });

  it.each<[string, HistoryCommit]>([
    ['T-15 — the same sync citing the reject commit by sha', cited],
    ['an approve along the forward edge', legal],
  ])('judges nothing on %s', (_label, commit) => {
    expect(findingsOf(checkVerbEdge, commit, reader)).toEqual([]);
  });

  it('a named document gone at HEAD whose bracket differs from its frontmatter before and after', () => {
    const gone = governedModel();
    gone.commit({ subject: 'wf(task): add t-4', files: { [TASK('t-4')]: taskDoc('draft', '', 't-4') } });
    const commit = gone.commit({ subject: 'wf(task): submit t-4 [draft → backlog]', files: { [TASK('t-4')]: taskDoc('pending', '', 't-4') } });
    gone.commit({ subject: 'chore: drop t-4', files: { [TASK('t-4')]: null } });
    expect(findingsOf(checkVerbEdge, commit, gone.reader())).toEqual([V(`${TASK('t-4')} (gone at HEAD): the bracket declares draft → backlog, the frontmatter went draft → pending`)]);
  });
});

describe('task-365 AC 2 / AC 3 — status-outside-wf (spec-020 §4.7, category state)', () => {
  const O = (path: string, from: string, to: string): Finding =>
    finding('state', 'status-outside-wf', `${path}: its status went ${from} → ${to} in a commit that is not a wf() Memory operation (dl-139)`);
  const DOC = TASK('t-1');

  it.each<[string, string, Record<string, string | null>, Finding[]]>([
    ['T-9 — a hand commit changing a status', 'docs: tidy', { [DOC]: taskDoc('backlog') }, [O(DOC, 'pending', 'backlog')]],
    ['T-10 — a configuration scope is an other commit', 'wf(dna): set project.name', { [DOC]: taskDoc('backlog') }, [O(DOC, 'pending', 'backlog')]],
    ['an added Memory document: (none) before', 'docs: seed t-5', { [TASK('t-5')]: taskDoc('draft', '', 't-5') }, [O(TASK('t-5'), '(none)', 'draft')]],
    ['a deletion is not judged', 'docs: drop t-1', { [DOC]: null }, []],
    ['a body edit that keeps the status', 'docs: reword', { [DOC]: taskDoc('pending', 'More.') }, []],
  ])('%s', (_label, subject, files, expected) => {
    const model = governedModel();
    const commit = model.commit({ subject, files });
    expect(findingsOf(checkStatusOutsideWf, commit, model.reader())).toEqual(expected);
  });

  it('judges nothing on a Memory wf() commit', () => {
    const model = governedModel();
    const commit = model.commit({ subject: 'wf(task): approve t-1 [pending → backlog]', body: approvalBody(), author: APPROVER, files: { [DOC]: taskDoc('backlog') } });
    expect(findingsOf(checkStatusOutsideWf, commit, model.reader())).toEqual([]);
  });

  it('judges nothing on a merge, whatever it changes', () => {
    const model = governedModel();
    const tip = model.commit({ subject: 'docs: note', files: { 'notes.md': 'a\n' } });
    const side = model.commit({ subject: 'docs: side', files: { 'side.md': 'b\n' }, detached: true, parents: [tip.sha] });
    const merge = model.commit({ subject: "Merge branch 'side'", parents: [tip.sha, side.sha], files: { [DOC]: taskDoc('backlog') } });
    expect(findingsOf(checkStatusOutsideWf, merge, model.reader())).toEqual([]);
  });

  it('AC 3 — a type declared in the same commit as the document it adds is not a Memory document yet (the parent\'s types)', () => {
    const model = governedModel();
    const commit = model.commit({
      subject: 'docs: start notes',
      files: {
        '.wingfoil/memory.yaml': `${MEMORY_YAML}  note:\n    path: "docs/memory/note/{id}.md"\n    states:\n      sequence: [draft, done]\n`,
        'docs/memory/note/n-1.md': '---\nid: "n-1"\ntype: note\ntitle: "N"\nstatus: draft\n---\n\nBody.\n',
      },
    });
    expect(findingsOf(checkStatusOutsideWf, commit, model.reader())).toEqual([]);
  });
});

describe('task-365 AC 2 — supersedes-pair (spec-020 §4.8, category state)', () => {
  const P = (message: string): Finding => finding('state', 'supersedes-pair', message);

  function approved(supersedes: string): { model: HistoryModel; approve: HistoryCommit } {
    const model = governedModel();
    model.commit({ subject: 'wf(adr): add a-0', files: { [ADR('a-0')]: adrDoc('a-0', 'accepted'), [ADR('a-1')]: adrDoc('a-1', 'pending', supersedes) } });
    const approve = model.commit({ subject: 'wf(adr): approve a-1 [pending → accepted]', body: approvalBody('Yes.'), author: APPROVER, files: { [ADR('a-1')]: adrDoc('a-1', 'accepted', supersedes) } });
    return { model, approve };
  }

  it('T-16 — the target is not superseded at HEAD: the finding names the finalize to run', () => {
    const { model, approve } = approved('a-0');
    expect(findingsOf(checkSupersedesPair, approve, model.reader())).toEqual([
      P(
        `${ADR('a-1')}: approved into 'accepted' with supersedes: a-0, but a-0 is 'accepted' at HEAD, not 'superseded': complete the pair with \`wf(adr): finalize a-0 [accepted → superseded]\`, Reason: superseded by a-1 (its supersedes: field), approved in ${approve.sha}.`,
      ),
    ]);
  });

  it('the target is missing at HEAD: the bracket starts from the approved state', () => {
    const { model, approve } = approved('a-9');
    expect(findingsOf(checkSupersedesPair, approve, model.reader())).toEqual([
      P(
        `${ADR('a-1')}: approved into 'accepted' with supersedes: a-9, but a-9 is missing at HEAD, not 'superseded': complete the pair with \`wf(adr): finalize a-9 [accepted → superseded]\`, Reason: superseded by a-1 (its supersedes: field), approved in ${approve.sha}.`,
      ),
    ]);
  });

  it('T-16 — no finding once the pair is complete at HEAD', () => {
    const { model, approve } = approved('a-0');
    model.commit({ subject: 'wf(adr): finalize a-0 [accepted → superseded]', body: `Reason: superseded by a-1 (its supersedes: field), approved in ${approve.sha}.`, files: { [ADR('a-0')]: adrDoc('a-0', 'superseded') } });
    expect(findingsOf(checkSupersedesPair, approve, model.reader())).toEqual([]);
  });

  it('judges nothing on an approve with no supersedes:', () => {
    const { model, approve } = approved('');
    expect(findingsOf(checkSupersedesPair, approve, model.reader())).toEqual([]);
  });
});

describe('task-365 AC 2 — approval-agent-trailer (spec-020 §4.9, category body)', () => {
  const G = (tail: string): Finding => finding('body', 'approval-agent-trailer', `${AGENT} ${tail}`);
  const model = governedModel();
  const other = model.commit({ subject: 'chore: note', body: `${approverLine()}\nCo-Authored-By: Claude <noreply@anthropic.com>`, author: APPROVER });
  const amend = model.commit({ subject: 'wf(task): amend t-1 [pending → pending]', body: `${approvalBody('A fix.')}\n\nAI-Model: m-1`, author: APPROVER, files: { [TASK('t-1')]: taskDoc('pending', 'A fix.') } });
  const rekey = model.commit({
    subject: 'workflow: rekey p-1 a.old a.new',
    body: `${approvalBody('Renamed.')}\n\nWingFoil-Instance: p-1\nCo-Authored-By: Claude <noreply@anthropic.com>\nco-authored-by: Claude <noreply@anthropic.com>`,
    author: APPROVER,
  });
  const lower = model.commit({ subject: 'chore: lower', body: 'approver: Ada Approver <approver@example.invalid> (approver)\nAI-Model: m-1', author: APPROVER });
  const submit = model.commit({ subject: 'wf(task): add t-2', body: 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: m-1', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
  const side = model.commit({ subject: 'docs: side note', files: { 'notes.md': 'x\n' }, detached: true });
  const merge = model.commit({ subject: "Merge branch 'side'", body: `${approverLine()}\nCo-Authored-By: Claude <noreply@anthropic.com>`, parents: [submit.sha, side.sha] });
  const reader = model.reader();

  it.each<[string, HistoryCommit, Finding[]]>([
    ['T-17 — an other commit with Approver: and Co-Authored-By:', other, [G('a Co-Authored-By: line')]],
    ['T-17 — an amend with AI-Model:', amend, [G('an AI-Model: line')]],
    ['T-17 — a workflow: rekey record with Co-Authored-By: twice: the key as written, the second numbered', rekey, [G('a Co-Authored-By: line'), G('a co-authored-by: line (occurrence 2)')].sort(byMessage)],
    ['an approver: line in any letter case', lower, [G('an AI-Model: line')]],
  ])('%s', (_label, commit, expected) => {
    expect(findingsOf(checkApprovalAgentTrailer, commit, reader)).toEqual(expected);
  });

  it.each<[string, HistoryCommit]>([
    ['T-18 — a commit with agent trailers and no Approver: line', submit],
    ['T-19 — a merge with Approver: and Co-Authored-By: (non-merge only)', merge],
  ])('judges nothing on %s', (_label, commit) => {
    expect(findingsOf(checkApprovalAgentTrailer, commit, reader)).toEqual([]);
  });
});

describe('task-365 AC 2 — workflow-record-authority (spec-020 §4.10, categories body and authority)', () => {
  const model = governedModel();
  const finalize = model.commit({
    subject: 'workflow: finalize p-1 rc.go',
    body: `${approverLine(DEVELOPER, 'developer')}\n\nWingFoil-Phase: rc.go completed\nWingFoil-Instance: p-1`,
    author: DEVELOPER,
  });
  const adopt = model.commit({ subject: 'workflow: adopt p-1 s.one task:t-1', body: 'Approver: Nobody <nobody@example.invalid> (approver)\n\nWingFoil-Instance: p-1', author: APPROVER });
  const rekey = model.commit({ subject: 'workflow: rekey p-1 a b', body: `Reason: x\n${approverLine()}`, author: APPROVER });
  const notRecord = model.commit({ subject: 'chore: finalize', body: approverLine(DEVELOPER, 'developer') });
  const unapproved = model.commit({ subject: 'workflow: finalize p-1 rc.ship', body: 'WingFoil-Phase: rc.ship completed\nWingFoil-Instance: p-1' });
  const side = model.commit({ subject: 'docs: side note', files: { 'notes.md': 'x\n' }, detached: true });
  const merge = model.commit({ subject: 'workflow: finalize p-1 rc.go', body: approverLine(DEVELOPER, 'developer'), parents: [unapproved.sha, side.sha], author: DEVELOPER });
  const reader = model.reader();

  it.each<[string, HistoryCommit, Finding[]]>([
    [
      'T-20 — a finalize record whose Approver: names a developer, authored by the developer',
      finalize,
      [finding('body', 'workflow-record-authority', "the Approver: role is 'developer', not 'approver'"), finding('authority', 'workflow-record-authority', `the author <${DEVELOPER.email}> holds no approver role in team.members (dl-094)`)].sort(byMessage),
    ],
    ['an adopt record whose Approver: names another email', adopt, [finding('authority', 'workflow-record-authority', `the Approver: line names <nobody@example.invalid>, but <${APPROVER.email}> authored the commit (dl-094)`)]],
    ['a rekey record whose Approver: line is not the first body line', rekey, [finding('body', 'workflow-record-authority', 'the Approver: line must be the first body line, as `Approver: Name <email> (role)`')]],
  ])('%s', (_label, commit, expected) => {
    expect(findingsOf(checkWorkflowRecordAuthority, commit, reader)).toEqual(expected);
  });

  it.each<[string, HistoryCommit]>([
    ['a commit that is no workflow: record', notRecord],
    ['a workflow: record with no Approver: line', unapproved],
    ['a merge', merge],
  ])('judges nothing on %s', (_label, commit) => {
    expect(findingsOf(checkWorkflowRecordAuthority, commit, reader)).toEqual([]);
  });
});

describe('task-365 AC 2 — trailer-paragraph (spec-020 §4.11, category body)', () => {
  const model = governedModel();
  const split = model.commit({ subject: 'chore: wire', body: 'WingFoil-Instance: p-1\nwingfoil-step: s.one\nWingFoil-Instance: p-2\n\nWingFoil-Version: 0.4.0' });
  const final = model.commit({ subject: 'chore: wire', body: 'Prose.\n\nWingFoil-Instance: p-1\nWingFoil-Step: s.one\nWingFoil-Version: 0.4.0' });
  const side = model.commit({ subject: 'docs: side note', files: { 'notes.md': 'x\n' }, detached: true });
  const merge = model.commit({ subject: "Merge branch 'side'", body: 'WingFoil-Instance: p-1\n\nWingFoil-Version: 0.4.0', parents: [final.sha, side.sha] });
  const reader = model.reader();

  it('T-21 — one finding per distinct WingFoil-* key before the final paragraph, first spelling kept, in the order written', () => {
    expect(checkTrailerParagraph(split, reader, { gated: true }).findings.map((entry: Finding) => ({ rule: entry.rule, check: entry.check, message: entry.message }))).toEqual([
      finding('body', 'trailer-paragraph', `a WingFoil-Instance: line sits outside the commit's final paragraph, where the workflow deduction does not read it ${ANCHOR}`),
      finding('body', 'trailer-paragraph', `a wingfoil-step: line sits outside the commit's final paragraph, where the workflow deduction does not read it ${ANCHOR}`),
    ]);
  });

  it.each<[string, HistoryCommit]>([
    ['every WingFoil-* line in the final paragraph', final],
    ['a merge', merge],
  ])('judges nothing on %s', (_label, commit) => {
    expect(findingsOf(checkTrailerParagraph, commit, reader)).toEqual([]);
  });
});

// task-366 AC 8 (red-first; `bug-438`, design D10; `spec-020` §7 as amended): the three summary lines name what their
// commit count counts — "on <m> commits with a finding" / "with an entry" — and a line whose count is 0 drops its commit
// count and its count list. The E_VERIFY_FINDINGS reason keeps its words.
describe('task-365 AC 6 / AC 7 — the console form and the E_VERIFY_FINDINGS reason (spec-020 §7, §8.2)', () => {
  const H = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const I = 'c'.repeat(40);
  const S0 = 'd'.repeat(40);
  const S1 = 'e'.repeat(40);
  const SUBJECT = 'wf(task): approve t-1 [pending → backlog]';
  const M1 = 'the Approver: line names <approver@example.invalid>, but <developer@example.invalid> authored the commit (dl-094)';
  const M2 = 'the author <developer@example.invalid> holds no approver role in team.members (dl-094)';
  const M3 = `a WingFoil-Instance: line sits outside the commit's final paragraph, where the workflow deduction does not read it ${ANCHOR}`;
  const CHECKS_LINE =
    'checks: subject 0.4.0, bracket 0.4.0, body 0.4.0, authority 0.4.0, state 0.4.0, verb-edge 0.4.0, status-outside-wf 0.4.0, supersedes-pair 0.4.0, approval-agent-trailer 0.4.0, workflow-record-authority 0.4.0, trailer-paragraph 0.4.0';
  const UNCHECKED_TAIL = '(history with no machine, no named document, a document gone at HEAD, or a revision that does not parse or is in a newer format)';

  const failing = (): GovernanceReport =>
    ({
      head: H,
      base: B,
      introducedAt: I,
      checks: GOVERNANCE_CHECKS.map((entry: { check: string; rule: string; since: string }) => ({ ...entry })),
      commits: { range: 3, memory: 2, other: 1, gated: 2 },
      findings: [
        { sha: S0, subject: 'wf(task): submit t-1', rule: 'body', check: 'trailer-paragraph', message: M3, gated: false },
        { sha: S1, subject: SUBJECT, rule: 'authority', check: 'authority', message: M1, gated: true },
        { sha: S1, subject: SUBJECT, rule: 'authority', check: 'authority', message: M2, gated: true },
      ],
      stateUnchecked: [{ sha: S0, subject: 'wf(task): submit t-1', reason: NO_NAMED }],
      verdict: 'fail',
    }) as unknown as GovernanceReport;

  const passing = (): GovernanceReport =>
    ({
      head: H,
      base: null,
      introducedAt: null,
      checks: GOVERNANCE_CHECKS.map((entry: { check: string; rule: string; since: string }) => ({ ...entry })),
      commits: { range: 1, memory: 1, other: 0, gated: 1 },
      findings: [],
      stateUnchecked: [],
      verdict: 'pass',
    }) as unknown as GovernanceReport;

  /** The rendered text without one trailing newline (the registrar's line ending is not §7's concern). */
  const rendered = (report: GovernanceReport): string => renderVerifyConsole(report).replace(/\n$/, '');

  it('a failing report: the header with the range and the introduction, the checks line, both blocks, the three summary lines', () => {
    expect(rendered(failing())).toBe(
      [
        `wingfoil verify: 2 wf() commits and 1 other commits in ${B}..HEAD (2 gated; introduced at ${I})`,
        CHECKS_LINE,
        'FAIL — gated:',
        `  ${S1} authority/authority: ${M1}`,
        `      ${SUBJECT}`,
        `  ${S1} authority/authority: ${M2}`,
        `      ${SUBJECT}`,
        'history — reported, not failing:',
        `  ${S0} body/trailer-paragraph: ${M3}`,
        '      wf(task): submit t-1',
        'gated: 2 findings on 1 commits with a finding (authority 2)',
        'history: 1 findings on 1 commits with a finding (body 1)',
        `state not checked: 1 entries on 1 commits with an entry ${UNCHECKED_TAIL}`,
      ].join('\n'),
    );
  });

  it('a passing whole-history report: `HEAD` and "every commit gated"; both blocks and the empty count lists omitted', () => {
    expect(rendered(passing())).toBe(
      [
        'wingfoil verify: 1 wf() commits and 0 other commits in HEAD (1 gated; every commit gated)',
        CHECKS_LINE,
        'gated: 0 findings',
        'history: 0 findings',
        `state not checked: 0 entries ${UNCHECKED_TAIL}`,
      ].join('\n'),
    );
  });

  it('verifyFindingsMessage counts the gated findings only, by rule', () => {
    expect(verifyFindingsMessage(failing())).toBe('E_VERIFY_FINDINGS: 2 findings on 1 commits fail the governance check (authority 2)');
  });
});

/**
 * task-378, the fix round after the independent review (F1 and F2, `spec-020` §4.14's closing sentence):
 *
 * - F1 — a `Carries content:` line inside a `Reason:` block, from `Reason:` up to the trailer paragraph as
 *   `parseReasonBlock` bounds it, is text the reason holds, never a declaration. `memory approve` and
 *   `memory deprecate`, run through the REAL compiled `dist/cli.js`, write such a reason; `wingfoil verify` reports
 *   no `carries-content` finding on either commit and `memory history` reads `carries: null` on both entries. Positive
 *   controls: a `memory submit`'s own line is still read (`carries: ['the body']`), and a hand approve whose line sits
 *   OUTSIDE its `Reason:` block is still row 1. The git reader's `carriesLineBefore` does not take an approve whose
 *   reason holds the line for a line commit (the same class, in `createGitHistoryReader`).
 * - F2 — a key not followed by exactly one space (`Carries content:the body`) is row 3, its items still judged.
 *
 * Fixture: `buildL0Repo` (`test/core/helpers/l0-fixture.ts`); the approver-gated verbs run with
 * `withoutAgentMarkers(process.env)` (`spec-018` §1). In-process cases use the in-memory model of
 * `test/core/helpers/in-memory-history-reader.ts`.
 */
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { checkCarriesContent, createGitHistoryReader, type HistoryCommit, type HistoryReader } from '../../src/core/governance-check';
import { linesOutsideReasonBlock, parseCarriesContent } from '../../src/memory/commit-message';
import { buildL0Repo, element, TASK_PATH } from '../core/helpers/l0-fixture';
import { APPROVER, TASK, approvalBody, approverLine, governedModel, taskDoc } from '../core/helpers/in-memory-history-reader';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from './helpers/spawn-cli';

jest.setTimeout(120_000);

const roots: string[] = [];
afterAll(() => roots.forEach(removeTempDir));

/** A reason whose middle line is a `Carries content:` line, as a person could type it. */
const REASON_WITH_LINE = 'Approve it: the submit wrote the line\nCarries content: the body\nas memory submit declares it.';

interface Finding {
  readonly sha: string;
  readonly rule: string;
  readonly check: string;
  readonly message: string;
}
interface Entry {
  readonly sha: string;
  readonly operation: string;
  readonly carries: readonly string[] | null;
  readonly reason: string | null;
  readonly unverified?: readonly { readonly check: string }[];
}

function wingfoil(root: string, args: readonly string[]): SpawnedRun {
  return spawnCapture('node', [CLI_ENTRY, ...args], { cwd: root, env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv });
}

function ok(root: string, args: readonly string[]): SpawnedRun {
  const run = wingfoil(root, args);
  expect({ args, status: run.status, stderr: run.stderr }).toEqual({ args, status: 0, stderr: expect.any(String) });
  return run;
}

function history(root: string, id: string): Entry[] {
  return (JSON.parse(ok(root, ['memory', 'history', id, '--format', 'json']).stdout) as { entries: Entry[] }).entries;
}

function carriesFindings(root: string): Finding[] {
  const run = wingfoil(root, ['verify', '--format', 'json']);
  const report = JSON.parse(run.stdout) as { findings: Finding[] };
  return report.findings.filter((finding) => finding.check === 'carries-content');
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();

describe('task-378 F1 — a Carries content: line inside a Reason: block, written by the verb, declares nothing', () => {
  it('memory approve and memory deprecate: no carries-content finding, carries null; a submit line is still read', () => {
    const root = buildL0Repo();
    roots.push(root);

    // Positive control: `memory submit` of a body edit left in the tree writes its own `Carries content: the body`.
    writeFixtureFile(root, TASK_PATH('task-004-deprecate-me'), element('task', 'task-004-deprecate-me', 'draft').replace('The scope.', 'The scope, filled in.'));
    ok(root, ['memory', 'submit', 'task-004-deprecate-me']);
    const submit = head(root);
    expect(git(root, ['log', '-1', '--format=%B']).split('\n')).toContain('Carries content: the body');

    ok(root, ['memory', 'approve', 'task-001-approve-me', '--reason', REASON_WITH_LINE]);
    const approve = head(root);
    ok(root, ['memory', 'deprecate', 'task-002-reject-me', '--reason', REASON_WITH_LINE]);
    const deprecate = head(root);
    for (const sha of [approve, deprecate]) expect(git(root, ['log', '-1', '--format=%B', sha]).split('\n')).toContain('Carries content: the body');

    expect(carriesFindings(root)).toEqual([]);

    const approved = history(root, 'task-001-approve-me').find((entry) => entry.sha === approve);
    const deprecated = history(root, 'task-002-reject-me').find((entry) => entry.sha === deprecate);
    expect([approved?.operation, approved?.carries, approved?.reason, approved?.unverified]).toEqual(['approve', null, REASON_WITH_LINE, undefined]);
    expect([deprecated?.operation, deprecated?.carries, deprecated?.reason]).toEqual(['deprecate', null, REASON_WITH_LINE]);

    const submitted = history(root, 'task-004-deprecate-me').find((entry) => entry.sha === submit);
    expect([submitted?.operation, submitted?.carries]).toEqual(['submit', ['the body']]);
  });

  it("the git reader's carriesLineBefore takes no approve whose reason holds the line for a line commit", () => {
    const root = buildL0Repo();
    roots.push(root);
    ok(root, ['memory', 'approve', 'task-001-approve-me', '--reason', REASON_WITH_LINE]);
    const approve = head(root);
    ok(root, ['memory', 'deprecate', 'task-004-deprecate-me', '--reason', 'Retire it, nothing carried.']);
    const after = head(root);
    const reader = createGitHistoryReader(root, { head: after });
    expect([reader.carriesLineBefore(approve), reader.carriesLineBefore(after)]).toEqual([false, false]);
  });
});

/** The findings of `checkCarriesContent` on `commit`, on `message` alone. */
function messages(commit: HistoryCommit, reader: HistoryReader): string[] {
  return checkCarriesContent(commit, reader, { gated: true }).findings.map((finding) => finding.message);
}

describe('task-378 F1 — the readers bound the Reason: block as parseReasonBlock does', () => {
  it('linesOutsideReasonBlock keeps the lines before Reason: and the trailer paragraph, every line without a reason', () => {
    expect(linesOutsideReasonBlock('Approver: A <a@x> (approver)\nReason: r\nCarries content: the body\n\nWingFoil-Version: 0.4.0 (abc)')).toEqual([
      'Approver: A <a@x> (approver)',
      'WingFoil-Version: 0.4.0 (abc)',
    ]);
    expect(linesOutsideReasonBlock('Carries content: the body\n\nWingFoil-Version: 0.4.0 (abc)')).toEqual(['Carries content: the body', '', 'WingFoil-Version: 0.4.0 (abc)']);
    expect(linesOutsideReasonBlock('Reason:\r\nCarries content: the body')).toEqual([]);
  });

  it('parseCarriesContent reads no line inside a reason, and still reads a submit line and one before Reason:', () => {
    expect(parseCarriesContent('Reason: Approve.\nCarries content: the body')).toBeNull();
    expect(parseCarriesContent('Reason: Approve.\n\nCarries content: the body')).toBeNull();
    expect(parseCarriesContent('Carries content: the body\n\nWingFoil-Version: 0.4.0 (abc)')).toEqual(['the body']);
    expect(parseCarriesContent('Carries content: the body\nReason: Approve.')).toEqual(['the body']);
  });

  it("checkCarriesContent: a line inside an approve's reason is no finding; one before its Reason: line is row 1", () => {
    const model = governedModel();
    const inside = model.commit({
      subject: 'wf(task): approve t-1 [pending → backlog]',
      body: approvalBody(REASON_WITH_LINE),
      author: APPROVER,
      files: { [TASK('t-1')]: taskDoc('backlog') },
    });
    expect(messages(inside, model.reader())).toEqual([]);
    const outside = model.commit({
      subject: 'wf(task): approve t-1 [backlog → in-progress]',
      body: `${approverLine()}\nCarries content: the body\nReason: Start it.`,
      author: APPROVER,
      files: { [TASK('t-1')]: taskDoc('in-progress') },
    });
    expect(messages(outside, model.reader())).toEqual(["'approve' declares no carried content: only a submit writes a Carries content: line (spec-008 §2, bug-287)"]);
  });
});

describe('task-378 F2 — a key not followed by exactly one space is row 3, its items still judged', () => {
  function submitWith(body: string): string[] {
    const model = governedModel();
    model.commit({ subject: 'wf(task): add t-2', files: { [TASK('t-2')]: taskDoc('draft', '', 't-2') } });
    const commit = model.commit({ subject: 'wf(task): submit t-2', body, files: { [TASK('t-2')]: taskDoc('pending', 'More.', 't-2') } });
    return messages(commit, model.reader());
  }
  const ROW_3 = 'the Carries content: key is written `Carries content:` (spec-008 §2, bug-287)';

  it.each([
    ['no space', 'Carries content:the body'],
    ['two spaces', 'Carries content:  the body'],
    ['a tab', 'Carries content:\tthe body'],
  ])('%s after the key, items agreeing: row 3 alone', (_label, body) => {
    expect(submitWith(body)).toEqual([ROW_3]);
  });

  it('no space and an item that disagrees: row 3, then row 6', () => {
    expect(submitWith("Carries content:frontmatter field 'title'")).toEqual([
      ROW_3,
      "the Carries content: line declares frontmatter field 'title', but the commit carries the body (spec-008 §2, bug-287)",
    ]);
  });

  it('exactly one space: no finding (the control)', () => {
    expect(submitWith('Carries content: the body')).toEqual([]);
  });
});

describe('task-378 F1 — the code and the in-memory reader agree on which ancestor carries a line (block-rule parity)', () => {
  // Each body: the edge the two definitions of the block could read differently. The code's block is
  // `parseReasonBlock`'s (`linesOutsideReasonBlock`); the in-memory reader's is its own `declaresCarriedContent`.
  const bodies: readonly [string, string][] = [
    ['no Reason: line', 'Carries content: the body'],
    ['the line inside the reason', `${approvalBody('Ready.')}\nCarries content: the body`],
    ['the line in a later paragraph of the reason', `${approvalBody('Ready.')}\n\nCarries content: the body`],
    ['the line before Reason:', `${approverLine()}\nCarries content: the body\nReason: Ready.`],
    ['the reason, then a trailer paragraph', `${approvalBody('Ready.')}\n\nWingFoil-Version: 0.4.0 (abc)\nCo-Authored-By: C <c@x>`],
    ['a last paragraph whose token starts with a digit', `${approvalBody('Ready.')}\nCarries content: the body\n\n1x: y`],
    ['the reason paragraph itself last and trailer-shaped', 'Carries content: the body\n\nReason: r\nKey: v'],
    ['the miscased key outside', 'carries content: the body\n\nReason: r'],
    ['no space after the key', 'Carries content:the body'],
    ['CRLF line breaks', 'Reason: r\r\nCarries content: the body'],
  ];

  it.each(bodies)('%s', (_label, body) => {
    const model = governedModel();
    model.commit({ subject: 'chore: an ancestor', body });
    const later = model.commit({ subject: 'chore: a later commit' });
    const code = linesOutsideReasonBlock(body).some((line) => line.startsWith('Carries content: '));
    expect(model.reader().carriesLineBefore(later.sha)).toBe(code);
  });
});

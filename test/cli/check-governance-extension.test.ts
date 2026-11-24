/**
 * task-366 (`spec-020` §6 as amended, AC-9, AC-11; `bug-438`; design items 1 and 3, D2, D3 (a), D4, D10) —
 * `scripts/check-governance.cjs` becomes the extension of `wingfoil verify`: it runs the code build's verb as a child
 * process, re-decides `gated` with its own per-check introductions, keeps only its three extension checks and keeps
 * its interface, report shape and exit codes.
 *
 * - AC 1 (red-first): through a stub `<cli>` (`./helpers/stub-verify-cli`, D3 (a)), the argv of the child, a finding
 *   the verb invents carried into the script's report, the re-decided `gated`, `check` dropped on the five base
 *   checks, and the stderr documents dropped or re-rendered (§6.1 steps 1–3). Structural, over the script's code: the
 *   generic predicates are gone (red-first) and every `CHECKS` marker occurs exactly once (characterization, the
 *   `git log -S` invariant). The real build: the `--json` keys (characterization).
 * - AC 2 (red-first): T-32 and T-33, and the other "could not run" answers of §6.1 step 2.
 * - AC 4 (red-first, D14): the script's leading comment states what it runs and the accepted weakness (§6.3).
 * - AC 8 (red-first): the script's three summary lines name what they count (§7's words, `bug-438`); its first two
 *   lines and `--json` keep their shape.
 *
 * Canned verb reports are not written by hand: each case builds its fixture, runs the real build
 * (`node dist/cli.js verify --format json --project <fixture> …`, through `runCliEntry`) and edits the report it
 * printed only where the case needs it. The stderr documents are copied from real runs of the same build: the
 * `W_VERIFY_WHOLE_HISTORY` warning from `verify --format json` with neither `--base` nor `--introduced-at`, the
 * `E_VERIFY_FINDINGS` error from a failing run, the T-33 error from `verify --base x --format json`, the blank-flag
 * error (exit 2) from `verify --base '' --format json`. Expected messages are the amended `spec-020`'s, word for word.
 *
 * Fixtures: throwaway repositories (`test/storage/helpers/git-fixture.ts`), identities per commit (`dl-094` (ii)).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHECKS } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { runCliEntry, spawnCapture } from './helpers/spawn-cli';
import { makeStubCheckout, runWithStub, type StubAnswer, type StubCheckout } from './helpers/stub-verify-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-governance.cjs');

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, backlog]
      gates:
        pending: { reject: draft }
`;

const DNA_YAML = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Ada Approver
      email: approver@example.invalid
      roles: [ approver, developer ]
    - name: Dev Eloper
      email: developer@example.invalid
      roles: [ developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

/** `spec-020` §7's tail of the `state not checked` line. */
const UNCHECKED_TAIL = '(history with no machine, no named document, a document gone at HEAD, or a revision that does not parse or is in a newer format)';

/** Copied from `node dist/cli.js verify --format json --project <fixture>` (no `--base`, no `--introduced-at`), stderr. */
const WHOLE_HISTORY_LINE =
  '{"warning":"W_VERIFY_WHOLE_HISTORY: no --base and no --introduced-at, so every commit reachable from HEAD is judged and gated; pass --base <rev> to judge a range, or --introduced-at <rev> to report older history without failing"}';
/** Copied from a failing run of `node dist/cli.js verify --format json --project <fixture> --base HEAD~1`, stderr. */
const FINDINGS_LINE = '{"error":"E_VERIFY_FINDINGS: 1 findings on 1 commits fail the governance check (subject 1)"}';
/** Copied from `node dist/cli.js verify --base x --format json --project <fixture>`, stderr (exit 1, stdout empty). */
const NO_COMMIT_LINE = '{"error":"revision \\"x\\" does not name a commit","details":[{"detail":"flag: --base"}]}';
/** Copied from `node dist/cli.js verify --base '' --format json --project <fixture>`, stderr (exit 2, stdout empty). */
const BLANK_FLAG_LINE = '{"error":"invalid flag value: --base must not be blank"}';

interface Finding {
  readonly sha: string;
  readonly subject: string;
  readonly rule: string;
  readonly check?: string;
  readonly message: string;
  readonly gated: boolean;
}

interface VerbReport {
  head: string;
  base: string | null;
  introducedAt: string | null;
  checks: { check: string; rule: string; since: string }[];
  commits: Record<string, number>;
  findings: Finding[];
  stateUnchecked: { sha: string; subject: string; reason: string }[];
  verdict: string;
}

interface ScriptReport {
  readonly findings: readonly Finding[];
  readonly stateUnchecked: readonly { sha: string; subject: string; reason: string }[];
}

const dirs: string[] = [];
afterAll(() => dirs.forEach(removeTempDir));

/** A throwaway repository; `commit` writes `files`, commits everything as the developer and returns the sha. */
function repository(): { root: string; commit(message: string, files?: Readonly<Record<string, string>>): string } {
  const root = makeTempGitRepo();
  dirs.push(root);
  let minute = 0;
  const commit = (message: string, files: Readonly<Record<string, string>> = {}): string => {
    for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
    git(root, ['add', '-A']);
    const date = `2026-01-01T10:${String(minute).padStart(2, '0')}:00Z`;
    minute += 1;
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: DEVELOPER.name,
        GIT_AUTHOR_EMAIL: DEVELOPER.email,
        GIT_COMMITTER_NAME: DEVELOPER.name,
        GIT_COMMITTER_EMAIL: DEVELOPER.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': DNA_YAML });
  return { root, commit };
}

const taskDoc = (status: string): string => `---\nid: "t-1"\ntype: task\ntitle: "T"\nstatus: ${status}\n---\n\nBody.\n`;

/** The real build's report on `root`: `node dist/cli.js verify --format json --project <root> …args`. */
function realReport(root: string, args: readonly string[]): VerbReport {
  const run = runCliEntry(root, ['verify', '--format', 'json', '--project', root, ...args]);
  expect({ status: run.status, verdict: (JSON.parse(run.stdout) as VerbReport).verdict }).toEqual({ status: 0, verdict: 'pass' });
  return JSON.parse(run.stdout) as VerbReport;
}

/** A stub answer printing `report` on stdout, with the given stderr lines and exit code. */
function answer(report: VerbReport | null, stderrLines: readonly string[], exit: number): StubAnswer {
  return { stdout: report === null ? '' : `${JSON.stringify(report)}\n`, stderr: stderrLines.map((line) => `${line}\n`).join(''), exit };
}

/**
 * Fixture A: configure; X adds `scripts/check-governance.cjs` (the script's introduction); c1 `add t-1`; M brings the
 * `approval-agent-trailer` marker into the script (that check's introduction, as check-governance-enforcement does);
 * c2 `submit t-1`. Every commit conforms, so the real report has no finding.
 */
function fixtureA(): { root: string; x: string; c1: string; m: string; c2: string } {
  const repo = repository();
  const x = repo.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
  const c1 = repo.commit('wf(task): add t-1', { 'docs/memory/task/t-1.md': taskDoc('draft') });
  const m = repo.commit('chore: add the rule', { 'scripts/check-governance.cjs': `// placeholder\n// ${CHECKS['approval-agent-trailer']}\n` });
  const c2 = repo.commit('wf(task): submit t-1', { 'docs/memory/task/t-1.md': taskDoc('pending') });
  return { root: repo.root, x, c1, m, c2 };
}

let checkout: StubCheckout;
beforeAll(() => {
  checkout = makeStubCheckout();
  dirs.push(checkout.dir);
});

describe('task-366 AC 1 — the script runs the code build\'s verify as a child (spec-020 §6.1 steps 1–3; stub <cli>, D3 (a))', () => {
  const a = fixtureA();

  it('red-first: the child is `node --no-warnings <dist>/cli.js verify --format json --project <root> --base <full sha> --introduced-at <full sha>`', () => {
    const base = git(a.root, ['rev-parse', 'HEAD~1']).trim();
    const report = realReport(a.root, ['--base', base, '--introduced-at', a.x]);
    const run = runWithStub(checkout, a.root, answer(report, [], 0), ['--base', 'HEAD~1']);
    expect(run.argv).toEqual(['--no-warnings', checkout.cli, 'verify', '--format', 'json', '--project', a.root, '--base', base, '--introduced-at', a.x]);
    expect(run.status).toBe(0);
  });

  it('red-first: with no introduction (the script never committed) and no --base, the child gets neither flag; the whole-history warning is dropped', () => {
    const b = repository();
    b.commit('wf(task): add t-1', { 'docs/memory/task/t-1.md': taskDoc('draft') });
    const report = realReport(b.root, []);
    const run = runWithStub(checkout, b.root, answer(report, [WHOLE_HISTORY_LINE], 0));
    expect(run.argv).toEqual(['--no-warnings', checkout.cli, 'verify', '--format', 'json', '--project', b.root]);
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('W_VERIFY_WHOLE_HISTORY');
  });

  describe('red-first: the verb\'s findings and stateUnchecked are the script\'s, gated by the script\'s introductions', () => {
    const invented = (sha: string, subject: string, rule: string, check: string, message: string, gated: boolean): Finding => ({ sha, subject, rule, check, message, gated });
    let findings: readonly Finding[] = [];
    let stateUnchecked: ScriptReport['stateUnchecked'] = [];
    let status = -1;

    beforeAll(() => {
      const report = realReport(a.root, ['--introduced-at', a.x]);
      report.findings = [
        invented(a.c1, 'wf(task): add t-1', 'body', 'approval-agent-trailer', 'stub: an agent trailer on c1', true),
        invented(a.c2, 'wf(task): submit t-1', 'body', 'approval-agent-trailer', 'stub: an agent trailer on c2', false),
        invented(a.c1, 'wf(task): add t-1', 'subject', 'subject', 'stub: a subject finding on c1', false),
        invented(a.c2, 'wf(task): submit t-1', 'state', 'verb-edge', 'stub: a verb-edge finding on c2', false),
      ];
      report.stateUnchecked = [{ sha: a.c2, subject: 'wf(task): submit t-1', reason: 'stub: not checked' }];
      report.verdict = 'fail';
      const run = runWithStub(checkout, a.root, answer(report, [FINDINGS_LINE], 1), ['--json']);
      status = run.status;
      const parsed = (run.stdout.trim().startsWith('{') ? JSON.parse(run.stdout) : { findings: [], stateUnchecked: [] }) as ScriptReport;
      findings = parsed.findings;
      stateUnchecked = parsed.stateUnchecked;
    });

    const byMessage = (message: string): Finding | undefined => findings.find((finding) => finding.message === message);

    it('a finding the stub invents on a real commit is in the script\'s report', () => {
      expect(byMessage('stub: a verb-edge finding on c2')).toEqual({ sha: a.c2, subject: 'wf(task): submit t-1', rule: 'state', check: 'verb-edge', message: 'stub: a verb-edge finding on c2', gated: true });
    });

    it('a later check\'s finding is gated by its marker\'s introduction, whatever the verb said', () => {
      expect(byMessage('stub: an agent trailer on c1')?.gated).toBe(false);
      expect(byMessage('stub: an agent trailer on c2')?.gated).toBe(true);
    });

    it('a base check\'s finding is gated by the script\'s own introduction and carries no `check` key', () => {
      const subject = byMessage('stub: a subject finding on c1');
      expect(subject).toEqual({ sha: a.c1, subject: 'wf(task): add t-1', rule: 'subject', message: 'stub: a subject finding on c1', gated: true });
      expect(subject !== undefined && 'check' in subject).toBe(false);
    });

    it('stateUnchecked is the verb\'s, and a gated finding exits 1', () => {
      expect(stateUnchecked).toEqual([{ sha: a.c2, subject: 'wf(task): submit t-1', reason: 'stub: not checked' }]);
      expect(status).toBe(1);
    });
  });

  it('red-first: stderr — W_VERIFY_WHOLE_HISTORY and E_VERIFY_FINDINGS documents are dropped, any other warning is printed `warning: <text>`', () => {
    const report = realReport(a.root, ['--introduced-at', a.x]);
    report.findings = [{ sha: a.c2, subject: 'wf(task): submit t-1', rule: 'subject', check: 'subject', message: 'stub: a subject finding on c2', gated: true }];
    report.verdict = 'fail';
    const run = runWithStub(checkout, a.root, answer(report, [WHOLE_HISTORY_LINE, '{"warning":"x: y"}', FINDINGS_LINE], 1));
    expect(run.stderr.split('\n')).toContain('warning: x: y');
    expect(run.stderr).not.toContain('W_VERIFY_WHOLE_HISTORY');
    expect(run.stderr).not.toContain('E_VERIFY_FINDINGS');
    expect(run.status).toBe(1);
  });

  it('characterization: the real build — the --json report keeps its keys, in order', () => {
    const run = spawnCapture(process.execPath, [SCRIPT, '--root', a.root, '--json']);
    expect(run.status).toBe(0);
    expect(Object.keys(JSON.parse(run.stdout) as object)).toEqual([
      'head',
      'base',
      'introducedAt',
      'checkIntroductions',
      'checked',
      'otherCommits',
      'gatedCommits',
      'findings',
      'stateUnchecked',
    ]);
  });
});

describe('task-366 AC 1 — structure of the script (spec-020 §6.1, §4.13, AC-9)', () => {
  const text = readFileSync(SCRIPT, 'utf-8');
  /** The script's code: comment lines (`//`, and `/*` / `*` lines of a block comment) blanked. */
  const code = text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

  it.each([
    'verifyTransitionConsistency',
    'reconstructMemoryTransitions',
    'parseApprovalMetadata',
    'isMachineEdge',
    'parseBracketHops',
    'readFileChanges',
    'APPROVAL_LINE_RE',
    'AGENT_TRAILER_RE',
    'WORKFLOW_RECORD_RE',
    'WINGFOIL_TRAILER_RE',
  ])('red-first: the script\'s code names no generic predicate or reader: %s', (identifier) => {
    expect([identifier, new RegExp(`\\b${identifier}\\b`).test(code)]).toEqual([identifier, false]);
  });

  it('characterization: every CHECKS marker occurs exactly once in the script (git log -S finds its introduction)', () => {
    for (const marker of Object.values(CHECKS)) expect([marker, text.split(marker).length - 1]).toEqual([marker, 1]);
  });
});

describe('task-366 AC 2 — what the script does with an answer it cannot use (spec-020 §6.1 steps 2–3, T-32, T-33)', () => {
  const a = fixtureA();
  const head = git(a.root, ['rev-parse', 'HEAD']).trim();
  const real = (): VerbReport => realReport(a.root, ['--introduced-at', a.x]);

  it('T-32: a check id with no marker in CHECKS, in the report\'s checks, exits 2 with §6.1 step 3\'s message', () => {
    const report = real();
    report.checks.push({ check: 'no-such-check', rule: 'body', since: '0.4.0' });
    const run = runWithStub(checkout, a.root, answer(report, [], 0));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe("error: the verb reports check 'no-such-check', which has no introduction in scripts/check-governance.cjs: add its marker to CHECKS\n");
    expect(run.stdout).toBe('');
  });

  it('T-32: a finding whose check has no marker in CHECKS exits 2 with the same message', () => {
    const report = real();
    report.findings = [{ sha: a.c2, subject: 'wf(task): submit t-1', rule: 'body', check: 'no-such-check', message: 'stub: an unknown check', gated: true }];
    report.verdict = 'fail';
    const run = runWithStub(checkout, a.root, answer(report, [FINDINGS_LINE], 1));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe("error: the verb reports check 'no-such-check', which has no introduction in scripts/check-governance.cjs: add its marker to CHECKS\n");
  });

  it('T-33: the verb exits 1 with no report: exit 2 with the text of its error document', () => {
    const run = runWithStub(checkout, a.root, answer(null, [NO_COMMIT_LINE], 1));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe('error: revision "x" does not name a commit\n');
    expect(run.stdout).toBe('');
  });

  it('the verb exits 2: exit 2 with the text of its error document', () => {
    const run = runWithStub(checkout, a.root, answer(null, [BLANK_FLAG_LINE], 2));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe('error: invalid flag value: --base must not be blank\n');
  });

  it('the verb exits 1 with no report and nothing on stderr: `wingfoil verify exited 1 with no report`', () => {
    const run = runWithStub(checkout, a.root, answer(null, [], 1));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe('error: wingfoil verify exited 1 with no report\n');
  });

  it('a stderr line that is not a JSON document with a warning or an error string: exit 2, naming the line', () => {
    const line = '(node:4242) ExperimentalWarning: something the verb did not write';
    const run = runWithStub(checkout, a.root, answer(real(), [line], 0));
    expect(run.status).toBe(2);
    expect(run.stderr.startsWith('error: ')).toBe(true);
    expect(run.stderr).toContain(line);
  });

  it('a report whose checks lack a check the script gates: exit 2 naming it', () => {
    const report = real();
    report.checks = report.checks.filter((entry) => entry.check !== 'trailer-paragraph');
    const run = runWithStub(checkout, a.root, answer(report, [], 0));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe("error: the verb's report lacks the checks scripts/check-governance.cjs gates: trailer-paragraph\n");
  });

  it('a report whose head is not the HEAD the script resolved: exit 2, HEAD moved', () => {
    const report = real();
    report.head = a.c1;
    const run = runWithStub(checkout, a.root, answer(report, [], 0));
    expect(run.status).toBe(2);
    expect(run.stderr).toBe(`error: HEAD moved from ${head} to ${a.c1} while the verb ran\n`);
  });
});

describe('task-366 AC 4 — the script\'s leading comment (spec-020 §6.3, AC-11; red-first, D14)', () => {
  /** The leading comment of the script — after a `#!` line, a block comment or a run of `//` lines — flattened, markers and backticks removed. */
  function leadingComment(source: string): string {
    const lines = source.split('\n');
    let at = lines[0]?.startsWith('#!') ? 1 : 0;
    while (at < lines.length && (lines[at] ?? '').trim() === '') at += 1;
    const taken: string[] = [];
    if ((lines[at] ?? '').trim().startsWith('/*')) {
      for (; at < lines.length; at += 1) {
        taken.push(lines[at] ?? '');
        if ((lines[at] ?? '').includes('*/')) break;
      }
    } else {
      for (; at < lines.length && (lines[at] ?? '').trim().startsWith('//'); at += 1) taken.push(lines[at] ?? '');
    }
    return taken
      .join('\n')
      .replace(/\/\*\*?|\*\/|^\s*\*|^\s*\/\//gm, ' ')
      .replace(/`/g, '')
      .replace(/\s+/g, ' ');
  }

  const header = leadingComment(readFileSync(SCRIPT, 'utf-8'));

  it('names wingfoil verify and the three extension checks, and no longer says it checks "against five rules"', () => {
    expect(header).toContain('wingfoil verify');
    for (const check of ['config-version', 'plan-retrospective', 'co-author-identity']) expect([check, header.includes(check)]).toEqual([check, true]);
    expect(header).not.toContain('against five rules');
  });

  it('states the accepted weakness, citing spec-020 §6.3', () => {
    expect(header).toContain('accepted weakness');
    expect(header).toContain('spec-020 §6.3');
  });
});

describe('task-366 AC 8 — the script\'s summary lines name what they count (spec-020 §7 as amended, bug-438; D10)', () => {
  it('red-first: a run with gated, history and unchecked entries — "on <m> commits with a finding" / "with an entry"', () => {
    const repo = repository();
    repo.commit('wf(task): schedule t-1');
    repo.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
    repo.commit('wf(task): schedule t-1 again');
    const run = spawnCapture(process.execPath, [SCRIPT, '--root', repo.root]);
    expect(run.status).toBe(1);
    expect(run.stdout.trimEnd().split('\n').slice(-3)).toEqual([
      'gated: 1 findings on 1 commits with a finding (subject 1)',
      'history: 1 findings on 1 commits with a finding (subject 1)',
      `state not checked: 2 entries on 2 commits with an entry ${UNCHECKED_TAIL}`,
    ]);
  });

  it('red-first: a clean run — `gated: 0 findings`, `history: 0 findings`, `state not checked: 0 entries (…)`; the first two lines unchanged', () => {
    const a = fixtureA();
    const base = git(a.root, ['rev-parse', 'HEAD~1']).trim();
    const run = spawnCapture(process.execPath, [SCRIPT, '--root', a.root, '--base', 'HEAD~1']);
    expect(run.status).toBe(0);
    const lines = run.stdout.trimEnd().split('\n');
    expect(lines[0]).toBe(`governance check: 1 wf() commits in ${base}..HEAD (1 after the introduction commit ${a.x}), and 0 other commits`);
    expect(lines[1]?.startsWith('later checks introduced at: ')).toBe(true);
    expect(lines[1]).toContain(`approval-agent-trailer ${a.m}`);
    expect(lines.slice(-3)).toEqual(['gated: 0 findings', 'history: 0 findings', `state not checked: 0 entries ${UNCHECKED_TAIL}`]);
  });
});

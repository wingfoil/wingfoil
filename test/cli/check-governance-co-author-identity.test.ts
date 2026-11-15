/**
 * task-352 (`bug-475`, `bug-535`; `git-conventions` §7, §9; `dl-190` item 1; design D1–D9, approved at the design
 * gate) — `scripts/check-governance.cjs`'s later check `co-author-identity`: on every commit of the range, merges
 * included (D2), that has no `Approver:` line, each `Co-Authored-By:` line of the body's final paragraph (D3) names a
 * `team.agents` or `team.members` entry of the `.wingfoil/dna.yaml` committed at the commit's first parent (D1), the
 * name compared exactly and the email ignoring case (D5); no `dna.yaml` there, or one that does not validate, is a
 * finding (D6). The same check reports a final paragraph with two `Co-Authored-By:` lines of the same value or more
 * than one `AI-Model:` line (AC 5, `bug-535`, absorbed at the design gate as D9).
 *
 * - AC 1 (red-first): the unknown co-author on a `wf(task): start`, a `docs:` commit and a `--no-ff` merge; the
 *   accepted agent, member and case variants; the malformed value; the non-final paragraph; the first-parent reading;
 *   the missing and the invalid `dna.yaml`; an approval left to `approval-agent-trailer`.
 * - AC 3 (red-first): starting mode through the check's own marker (`git-conventions` §9).
 * - AC 4 (characterization, passes before green): the trailers the verbs write after `task-334` (`spec-018` §2.2,
 *   T-11): the final paragraph of `740f184bf` copied verbatim, and a real `memory submit` of the compiled CLI under
 *   `WINGFOIL_AGENT=Claude` on the L0 fixture.
 * - AC 5 (red-first): the duplicated pair, written by the very `git commit --amend --trailer` of `bug-535`'s
 *   reproduction; two `AI-Model:` lines; one pair and two different valid co-authors stay unreported.
 *
 * Fixture style of `test/cli/check-governance-approval-agent-trailer.test.ts`: a throwaway repository, an identity per
 * commit, and no `scripts/check-governance.cjs` in the fixture (so every commit is gated) except in AC 3's. Messages
 * are the design's exact text. Red until the check exists: today no finding carries `check: 'co-author-identity'`.
 * The marker is written literally (the `CHECKS` pin of the enforcement suite holds the script to the same string).
 * Deterministic: fixed text, fixed identities.
 */
import { execFileSync } from 'node:child_process';

import { checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import type { GovernanceReport } from '../../scripts/check-governance.cjs';
import { withoutAgentMarkers } from '../agent-markers.cjs';
import { buildL0Repo } from '../core/helpers/l0-fixture';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const MARKER = 'governance-check:co-author-identity';
const CHECK = 'co-author-identity';
const DNA_PATH = '.wingfoil/dna.yaml';
const APPROVER = { name: 'Ada Approver', email: 'approver@example.invalid' };
const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    amendable: true
    states:
      sequence: [draft, pending, backlog, in-progress, done]
      gates:
        pending: { reject: draft }
`;

const AGENTS = `  agents:
    - name: Claude
      email: noreply@anthropic.com
      executes_as: [ developer ]
    - name: Other
      email: 0+other-agent@users.noreply.github.com
      executes_as: [ developer ]
`;

const BOT = `    - name: Bot
      email: 0+bot@users.noreply.github.com
      executes_as: [ developer ]
`;

function dnaYaml(agents: string = AGENTS): string {
  return `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${APPROVER.name}
      email: ${APPROVER.email}
      roles: [ approver, developer ]
    - name: ${DEVELOPER.name}
      email: ${DEVELOPER.email}
      roles: [ developer ]
${agents}  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;
}

const DNA = dnaYaml();
/** The fixture's `dna.yaml` with `team: 1`, which `DnaYaml` refuses (D6). */
const INVALID_DNA = DNA.replace(/team:\n[\s\S]*?(?=paths:)/, 'team: 1\n');

const APPROVER_LINE = `Approver: ${APPROVER.name} <${APPROVER.email}> (approver)`;
const AI_MODEL = 'AI-Model: claude-opus-5-5';
/** The final paragraph of `740f184bf` (`git log -1 --format=%B 740f184bf | tail -3`), a verb-written commit of task-334's format. */
const VERB_TRAILERS = 'WingFoil-Version: 0.3.2 (dcfe8ab073b941afdcd3336afaebda54b1db1761)\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5';

/** Message 1 of the design, for `<name> <<email>>`. */
const unknownCoAuthor = (value: string): string =>
  `the co-author ${value} is neither a team.agents nor a team.members entry of the .wingfoil/dna.yaml committed before this commit (name and email both; git-conventions §7, bug-475)`;
/** Message 2 of the design, for the value written after the key. */
const malformedCoAuthor = (value: string): string => `a Co-Authored-By: line of the final paragraph is not \`Name <email>\` (git-conventions §7): ${value}`;
/** Message 3 of the design. */
const noDna = (value: string): string =>
  `no .wingfoil/dna.yaml is committed before this commit, so the co-author ${value} cannot be matched against team.agents or team.members`;

const fixtures: string[] = [];
afterAll(() => fixtures.forEach(removeTempDir));

type Who = { readonly name: string; readonly email: string };

interface Fixture {
  readonly root: string;
  commit(message: string, files?: Readonly<Record<string, string | null>>, author?: Who): string;
  task(id: string, status: string, message: string, author?: Who): string;
}

const identityEnv = (author: Who): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_AUTHOR_NAME: author.name,
  GIT_AUTHOR_EMAIL: author.email,
  GIT_COMMITTER_NAME: author.name,
  GIT_COMMITTER_EMAIL: author.email,
});

function fixture(dna: string = DNA): Fixture {
  const root = makeTempGitRepo();
  fixtures.push(root);
  let revision = 0;
  const commit: Fixture['commit'] = (message, files = {}, author = DEVELOPER) => {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) git(root, ['rm', '--quiet', path]);
      else writeFixtureFile(root, path, content);
    }
    git(root, ['add', '-A']);
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], { cwd: root, encoding: 'utf-8', env: identityEnv(author) });
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  const task: Fixture['task'] = (id, status, message, author) => {
    revision += 1;
    return commit(message, { [`docs/memory/task/${id}.md`]: `---\nid: "${id}"\ntype: task\ntitle: "Task ${id}"\nstatus: ${status}\n---\n\nRevision ${revision}.\n` }, author);
  };
  commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, [DNA_PATH]: dna });
  return { root, commit, task };
}

function coAuthorFindings(report: GovernanceReport, sha: string): { rule: string; message: string; gated: boolean }[] {
  return report.findings
    .filter((finding) => finding.sha === sha && (finding.check as string | undefined) === CHECK)
    .map((finding) => ({ rule: finding.rule, message: finding.message, gated: finding.gated }));
}

/** A `docs:` commit whose body is one paragraph: `Co-Authored-By: <value>` and the model line. */
const docsWith = (f: Fixture, label: string, value: string): string => f.commit(`docs: ${label}\n\nCo-Authored-By: ${value}\n${AI_MODEL}`);

describe('task-352 AC 1 — co-author-identity reports a Co-Authored-By outside team.agents and team.members (bug-475, D1–D6)', () => {
  const f = fixture();
  f.task('t-1', 'draft', 'wf(task): add t-1');
  const start = f.task('t-1', 'in-progress', `wf(task): start t-1 [backlog → in-progress]\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n${AI_MODEL}`);
  const docs = docsWith(f, 'runtime-injected name', 'Claude Opus 5.5 <noreply@anthropic.com>');

  // A --no-ff merge whose message carries the runtime-injected name (D2: 6 of the v0.3.2 breach's 21 were merges).
  git(f.root, ['checkout', '--quiet', '-b', 'side']);
  f.commit('docs: side work', { 'docs/side.md': 'side\n' });
  git(f.root, ['checkout', '--quiet', 'main']);
  f.commit('docs: main work', { 'docs/main.md': 'main\n' });
  execFileSync('git', ['merge', '--quiet', '--no-ff', '--no-edit', '--cleanup=whitespace', '-m', `Merge branch 'side' into main\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n${AI_MODEL}`, 'side'], {
    cwd: f.root,
    encoding: 'utf-8',
    env: identityEnv(DEVELOPER),
  });
  const merge = git(f.root, ['rev-parse', 'HEAD']).trim();

  const claude = docsWith(f, 'the agent entry', 'Claude <noreply@anthropic.com>');
  const claudeEmailCase = docsWith(f, 'the agent entry, email in another case', 'Claude <NoReply@Anthropic.com>');
  const claudeNameCase = docsWith(f, 'the agent name in another case', 'claude <noreply@anthropic.com>');
  const other = docsWith(f, 'the second agent entry', 'Other <0+other-agent@users.noreply.github.com>');
  const member = f.commit(`docs: a human co-author\n\nCo-Authored-By: ${DEVELOPER.name} <${DEVELOPER.email}>`);
  const mallory = docsWith(f, 'a known email under an unknown name', 'Mallory <noreply@anthropic.com>');
  const malformed = docsWith(f, 'no angle brackets', 'Claude noreply@anthropic.com');
  const nonFinal = f.commit(
    `docs: prose quoting a trailer\n\nCo-Authored-By: Nobody <n@x.org>\nis how a trailer is quoted in this paragraph.\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n${AI_MODEL}`,
  );

  // D1: the commit that declares Bot cannot legitimise its own co-author; the next one is matched against it.
  const declaresBot = f.commit(`chore: declare the Bot agent\n\nCo-Authored-By: Bot <0+bot@users.noreply.github.com>`, { [DNA_PATH]: dnaYaml(AGENTS + BOT) });
  const afterBot = f.commit(`docs: after the Bot entry\n\nCo-Authored-By: Bot <0+bot@users.noreply.github.com>`);

  f.task('a-1', 'pending', 'wf(task): submit a-1');
  const approve = f.task('a-1', 'backlog', `wf(task): approve a-1 [pending → backlog]\n\n${APPROVER_LINE}\nReason: Ready.\nCo-Authored-By: Mallory <m@x.org>`, APPROVER);

  const report = checkGovernance(f.root);

  it.each([
    ['a wf(task): start', start],
    ['a docs: commit', docs],
    ['a --no-ff merge commit (D2)', merge],
  ] as const)('the runtime-injected name on %s gives one gated body finding, message 1 exactly', (_label, sha) => {
    expect(coAuthorFindings(report, sha)).toEqual([{ rule: 'body', message: unknownCoAuthor('Claude Opus 5.5 <noreply@anthropic.com>'), gated: true }]);
  });

  it.each([
    ['the team.agents entry Claude', claude],
    ['the same entry with its email in another case (D5)', claudeEmailCase],
    ['the second team.agents entry Other', other],
    ['a team.members entry (a human co-author passes)', member],
  ] as const)('%s gives no finding', (_label, sha) => {
    expect(coAuthorFindings(report, sha)).toEqual([]);
  });

  it('the name is compared exactly: claude <noreply@anthropic.com> gives one finding (D5)', () => {
    expect(coAuthorFindings(report, claudeNameCase)).toEqual([{ rule: 'body', message: unknownCoAuthor('claude <noreply@anthropic.com>'), gated: true }]);
  });

  it('a known email under an unknown name gives one finding: name and email both (D5)', () => {
    expect(coAuthorFindings(report, mallory)).toEqual([{ rule: 'body', message: unknownCoAuthor('Mallory <noreply@anthropic.com>'), gated: true }]);
  });

  it('a value that is not `Name <email>` gives message 2 exactly', () => {
    expect(coAuthorFindings(report, malformed)).toEqual([{ rule: 'body', message: malformedCoAuthor('Claude noreply@anthropic.com'), gated: true }]);
  });

  it('a Co-Authored-By: line outside the final paragraph is not read (D3)', () => {
    expect(coAuthorFindings(report, nonFinal)).toEqual([]);
  });

  it('the commit that adds Bot to dna.yaml is matched against its first parent: one finding (D1)', () => {
    expect(coAuthorFindings(report, declaresBot)).toEqual([{ rule: 'body', message: unknownCoAuthor('Bot <0+bot@users.noreply.github.com>'), gated: true }]);
  });

  it('the next commit co-authored by Bot gives no finding (D1)', () => {
    expect(coAuthorFindings(report, afterBot)).toEqual([]);
  });

  it('an approval is left to approval-agent-trailer: no co-author-identity finding, its approval-agent-trailer finding still there', () => {
    expect(coAuthorFindings(report, approve)).toEqual([]);
    expect(report.findings.filter((finding) => finding.sha === approve && (finding.check as string | undefined) === 'approval-agent-trailer')).toHaveLength(1);
  });

  it('the positive cases are the only co-author-identity findings of the range', () => {
    const shas = new Set(report.findings.filter((finding) => (finding.check as string | undefined) === CHECK).map((finding) => finding.sha));
    expect([...shas].sort()).toEqual([start, docs, merge, claudeNameCase, mallory, malformed, declaresBot].sort());
  });
});

describe('task-352 AC 1 — no or an invalid dna.yaml at the first parent is a finding (D6, fail-closed)', () => {
  it('a co-authored commit after the one that deletes .wingfoil/dna.yaml gives message 3 exactly', () => {
    const f = fixture();
    f.commit('chore: drop the dna', { [DNA_PATH]: null });
    const sha = docsWith(f, 'no dna at the parent', 'Claude <noreply@anthropic.com>');
    expect(coAuthorFindings(checkGovernance(f.root), sha)).toEqual([{ rule: 'body', message: noDna('Claude <noreply@anthropic.com>'), gated: true }]);
  });

  it('a co-authored commit after the one that makes it invalid (team: 1) gives message 4', () => {
    const f = fixture();
    f.commit('chore: break the dna', { [DNA_PATH]: INVALID_DNA });
    const sha = docsWith(f, 'an invalid dna at the parent', 'Claude <noreply@anthropic.com>');
    const findings = coAuthorFindings(checkGovernance(f.root), sha);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'body', gated: true });
    expect(findings[0]?.message).toMatch(
      /^the \.wingfoil\/dna\.yaml committed before this commit does not validate \(.+\), so the co-author Claude <noreply@anthropic\.com> cannot be matched$/,
    );
  });
});

describe('task-352 AC 3 — the rule runs in starting mode through its own marker (git-conventions §9, dl-190 item 1)', () => {
  const f = fixture();
  f.commit('chore: introduce the check', { 'scripts/check-governance.cjs': '// placeholder\n' });
  const before = docsWith(f, 'residue before the rule', 'Claude Opus 5.5 <noreply@anthropic.com>');
  const introduction = f.commit('chore: add the rule', { 'scripts/check-governance.cjs': `// placeholder\n// ${MARKER}\n` });
  const historyOnly = checkGovernance(f.root);
  const after = docsWith(f, 'after the rule', 'Claude Opus 5.5 <noreply@anthropic.com>');
  const report = checkGovernance(f.root);

  it("the check's introduction is the commit that brought its marker in", () => {
    expect((report.checkIntroductions as Record<string, string | null>)[CHECK]).toBe(introduction);
  });

  it('a commit before the introduction is reported as residue, not gated', () => {
    expect(coAuthorFindings(report, before)).toEqual([{ rule: 'body', message: unknownCoAuthor('Claude Opus 5.5 <noreply@anthropic.com>'), gated: false }]);
  });

  it('a commit after the introduction is gated', () => {
    expect(coAuthorFindings(report, after)).toEqual([{ rule: 'body', message: unknownCoAuthor('Claude Opus 5.5 <noreply@anthropic.com>'), gated: true }]);
  });

  it('with only the residue, the check exits 0, the residue still reported', () => {
    expect(coAuthorFindings(historyOnly, before)).toHaveLength(1);
    expect(exitCodeFor(historyOnly)).toBe(0);
  });
});

describe("task-352 AC 4 — the trailers the verbs write after task-334 pass the rule (spec-018 §2.2, T-11; characterization)", () => {
  it("a wf(task): submit whose final paragraph is 740f184bf's, verbatim, gives no finding", () => {
    const f = fixture();
    f.task('t-1', 'draft', 'wf(task): add t-1');
    const sha = f.task('t-1', 'pending', `wf(task): submit t-1\n\nCarries content: the body\n\n${VERB_TRAILERS}`);
    expect(coAuthorFindings(checkGovernance(f.root), sha)).toEqual([]);
  });

  it('a real memory submit of the compiled CLI under WINGFOIL_AGENT=Claude writes the team.agents entry, and gives no finding', () => {
    const root = buildL0Repo();
    fixtures.push(root);
    const env = withoutAgentMarkers(process.env);
    delete env.WINGFOIL_AGENT_MODEL;
    const run = spawnCapture('node', [CLI_ENTRY, 'memory', 'submit', 'task-004-deprecate-me'], { cwd: root, env: { ...env, WINGFOIL_AGENT: 'Claude' } as NodeJS.ProcessEnv });
    expect(run.status).toBe(0);
    expect(git(root, ['log', '-1', '--format=%(trailers:key=Co-Authored-By,valueonly)']).trim()).toBe('Claude <noreply@anthropic.com>');
    const sha = git(root, ['rev-parse', 'HEAD']).trim();
    expect(coAuthorFindings(checkGovernance(root), sha)).toEqual([]);
  });
});

describe('task-352 AC 5 — a duplicated attribution pair is reported by the same check (bug-535, D9)', () => {
  const f = fixture();
  f.task('t-1', 'draft', 'wf(task): add t-1');
  // bug-535's reproduction: the verb's commit, then the hand amend that adds the pair a second time.
  f.task('t-1', 'pending', `wf(task): submit t-1\n\nCarries content: the body\n\n${VERB_TRAILERS}`);
  execFileSync(
    'git',
    ['commit', '--quiet', '--amend', '--no-edit', '--cleanup=whitespace', '--trailer', 'Co-Authored-By: Claude <noreply@anthropic.com>', '--trailer', AI_MODEL],
    { cwd: f.root, encoding: 'utf-8', env: identityEnv(DEVELOPER) },
  );
  const twoPairs = git(f.root, ['rev-parse', 'HEAD']).trim();
  const twoModels = f.commit(`docs: two model lines\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: claude-opus-5-5\nAI-Model: claude-sonnet-5`);
  const onePair = f.commit(`docs: one pair\n\n${VERB_TRAILERS}`);
  const agentAndMember = f.commit(`docs: an agent and a member\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By: ${DEVELOPER.name} <${DEVELOPER.email}>\n${AI_MODEL}`);
  const report = checkGovernance(f.root);

  it("the fixture is bug-535's shape: the amend left two equal pairs in the final paragraph", () => {
    const message = git(f.root, ['log', '-1', '--format=%B', twoPairs]);
    expect(message.split('\n').filter((line) => line === 'Co-Authored-By: Claude <noreply@anthropic.com>')).toHaveLength(2);
    expect(message.split('\n').filter((line) => line === AI_MODEL)).toHaveLength(2);
  });

  it('two equal Co-Authored-By: lines and two AI-Model: lines give one gated body finding', () => {
    const findings = coAuthorFindings(report, twoPairs);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'body', gated: true });
  });

  it('two AI-Model: lines under one valid co-author give one gated body finding', () => {
    const findings = coAuthorFindings(report, twoModels);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'body', gated: true });
  });

  it('one pair gives no finding', () => {
    expect(coAuthorFindings(report, onePair)).toEqual([]);
  });

  it('two different valid co-authors (an agent and a member) and one model line give no finding', () => {
    expect(coAuthorFindings(report, agentAndMember)).toEqual([]);
  });
});

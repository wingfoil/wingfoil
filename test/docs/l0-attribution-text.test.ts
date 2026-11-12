/**
 * task-334 AC 6 (red-first, `testing` T3) — the documents the attribution half of `spec-018` (§2, Consequences
 * "Docs"; `dl-212` D1, D4) changes, pinned to the exact text of the task's design (AGENTS.md §5.1, `git-conventions`
 * §7–§8, `docs/user-guide.md` §8.3 and §9, `docs/cli-reference.md`'s Global options):
 *
 * - AGENTS.md §5.1: the AI-attribution paragraph says the verbs write the two trailers and keeps the hand
 *   `git commit --amend --trailer` recipe only for a plain `git commit`; the same-class sentence of the paragraph above
 *   it is reworded (design D8); the old sentences are gone;
 * - `git-conventions` §7 gains its five sentences (which commits, which name, which entry signs, who applies it twice),
 *   §8 its reworded amend sentence; `version:` 2.8 or later, its line naming task-334 ("≥" plus history, bug-314);
 * - `docs/user-guide.md` §8.3 names `E_AGENT_CONTEXT` and states L0's limit; §9 states the trailers;
 * - `docs/cli-reference.md`: an `--ai-model <id>` row with its three exit-`2` messages, the preamble names it, and the
 *   `--co-author` row no longer says it changes nothing;
 * - none of the four files claims "signed" or "human-approved" (`dl-212` D4): `grep -n -i "\bsigned\b\|human-approved"`
 *   over them prints nothing at the red commit, so an absence over each whole file is the "no added line" rule.
 *
 * Text is compared with whitespace runs (and Markdown blockquote markers) collapsed, so a re-wrap does not break a
 * pin; the words are pinned verbatim; each absence sits beside its positive (task-276).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (...path: string[]): string => readFileSync(join(REPO_ROOT, ...path), 'utf-8');

/** `text` with blockquote markers dropped and every whitespace run a single space. */
const flat = (text: string): string => text.replace(/^>[ \t]?/gm, '').replace(/\s+/g, ' ').trim();

/** The text from the line starting `start` to the next match of `end` (exclusive), or to the end. */
function between(text: string, start: string, end: RegExp): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`not found: ${start}`);
  const rest = text.slice(from + start.length);
  const stop = rest.search(end);
  return start + (stop === -1 ? rest : rest.slice(0, stop));
}

const AGENTS = read('AGENTS.md');
const GIT_CONVENTIONS = read('.wingfoil', 'directives', 'custom', 'git-conventions.md');
const USER_GUIDE = read('docs', 'user-guide.md');
const CLI_REFERENCE = read('docs', 'cli-reference.md');

describe('task-334 AC 6 — AGENTS.md §5.1 states that the verbs write the agent trailers', () => {
  const text = flat(AGENTS);

  it('holds the design\'s AI-attribution paragraph verbatim', () => {
    expect(text).toContain(
      flat(`**AI attribution** (\`git-conventions\` §7, \`dl-117\`, \`spec-018\` §2). Every commit an agent causes, **except an
approval commit** (\`approve\`, \`reject\`, \`amend\` and a \`workflow:\` record with an \`Approver:\` line, which the verbs
refuse in an agent's session), ends with the trailer paragraph
\`Co-Authored-By: <team.agents name> <<team.agents email>>\` and \`AI-Model: <the model identifier you run as>\`, the
values read from \`dna.yaml\` \`team.agents\`. A \`wingfoil\` command that writes a commit in an agent's session writes
the two lines itself, after \`WingFoil-Version:\`: pass \`--ai-model <the model identifier you run as>\` (or set
\`WINGFOIL_AGENT_MODEL\`), or it writes \`AI-Model: not-reported\`; never add them again to such a commit, which would
leave two pairs. The hand recipe \`git commit --amend --no-edit --trailer …\` stays only for a commit an agent writes
with plain \`git commit\`. \`wingfoil agent execute\` hands this rule to the agents it launches; an agent started from
its own CLI has only this file.`),
    );
  });

  it('no longer tells an agent to amend a commit wingfoil wrote', () => {
    expect(text).not.toContain('On a commit `wingfoil` wrote, add the two with');
    expect(text).not.toContain('Every commit an agent writes, **except an `approve` or `reject` commit**');
  });

  it('the trailer-paragraph sentence above it says an agent\'s two are already there (design D8)', () => {
    expect(text).toContain(
      "To add a trailer to such a commit — one it lacks: the agent's two are already there when an agent ran the command —, amend with",
    );
    expect(text).not.toContain('To add a trailer to such a commit, amend with');
  });
});

describe('task-334 AC 6 — git-conventions §7 and §8 follow spec-018 §2', () => {
  const header = between(GIT_CONVENTIONS, '---', /^# /m);
  const s7 = flat(between(GIT_CONVENTIONS, '## 7. AI attribution', /^## 8\. /m));
  const s8 = flat(between(GIT_CONVENTIONS, '## 8. Amending a tool-written commit', /^## 9\. /m));

  it('§7 "Which commits": every commit an agent caused carries the two trailers, whoever writes it', () => {
    expect(s7).toContain(
      'Every commit an agent caused carries the two trailers, whoever writes it: `wingfoil` on the commits it writes in an agent\'s session (`spec-018` §2.1), the agent on a commit it makes with `git commit`.',
    );
  });

  it('§7 "Which name": the model from --ai-model or WINGFOIL_AGENT_MODEL, else not-reported', () => {
    expect(s7).toContain(
      'carries the model identifier the running agent reports — the `--ai-model` value or `WINGFOIL_AGENT_MODEL` on a commit `wingfoil` writes, and `not-reported` when the agent reports none (`spec-018` §2.4)',
    );
  });

  it('§7 "Which entry signs": spec-018 §2.3\'s precedence, the body line and W_AGENT_ENTRY_GUESSED', () => {
    expect(s7).toContain(
      'On a commit `wingfoil` writes, the first rule that applies decides (`spec-018` §2.3): `--co-author <name>`; else a non-blank `WINGFOIL_AGENT`; else the entry whose `adapter` is the built-in adapter of the vendor marker (`CLAUDE_CODE_CHILD_SESSION` → `claude-code`, `CODEX_SANDBOX` → `codex-cli`); else the first entry, with the body line `Attributed to the first team.agents entry, <name>: no entry is named for this agent.` and the warning `W_AGENT_ENTRY_GUESSED`.',
    );
  });

  it('§7 "Who applies it": wingfoil writes the two lines itself; an approver\'s amend carries no co-author', () => {
    expect(s7).toContain(
      "`wingfoil` writes the two lines itself on every commit it writes in an agent's session, after `WingFoil-Version:`, and an agent never adds them again to such a commit.",
    );
    expect(s7).toContain(
      "An amend the approver writes carries no co-author; an agent's credit, if any, goes in its `Reason:` prose (`spec-018` Process Notes).",
    );
  });

  it('§8: the amend sentence is for a trailer the commit lacks, and names no Co-Authored-By: example', () => {
    expect(s8).toContain(
      "To add a trailer to such a commit by hand — one it lacks: an agent's `Co-Authored-By:` and `AI-Model:` are already there when an agent ran the command (§7) —, amend with `git commit --amend --no-edit --trailer \"<Key>: …\"`,",
    );
    expect(s8).not.toContain('(e.g. `Co-Authored-By:`)');
  });

  it('the version is 2.8 or later and its line names task-334', () => {
    const version = /^version: "(\d+)\.(\d+)"(.*)$/m.exec(header);
    expect(version).not.toBeNull();
    expect(Number(version![1]) * 1000 + Number(version![2])).toBeGreaterThanOrEqual(2008);
    expect(version![3]).toContain('task-334');
  });
});

describe('task-334 AC 6 — the user documentation follows spec-018 Consequences "Docs"', () => {
  const s83 = flat(between(USER_GUIDE, '### 8.3 Approve or reject', /^### 8\.4 /m));
  const s9 = flat(between(USER_GUIDE, '## 9. Connect an AI agent', /^### 9\.1 /m));
  const globalOptions = between(CLI_REFERENCE, 'Accepted by every command, except `--dry-run`', /^#/m);
  /** The Global options table row of `option`, or `''` when the table has none (the pins then fail on `toMatch`). */
  const row = (option: string): string =>
    globalOptions.split('\n').find((candidate) => candidate.startsWith(`| \`${option}\``)) ?? '';

  it('user guide §8.3 names E_AGENT_CONTEXT and states the limit of L0', () => {
    expect(s83).toContain(
      flat(`Only the approver approves, from a
  terminal of their own. In a session an AI agent started — \`WINGFOIL_AGENT\`, \`CLAUDE_CODE_CHILD_SESSION\` or
  \`CODEX_SANDBOX\` defined, or \`--co-author\` given — \`approve\`, \`reject\` and \`amend\` refuse with \`error: E_AGENT_CONTEXT:
  …\` (exit \`1\`) and write nothing: run them yourself, from a terminal no agent started.`),
    );
    expect(s83).toContain(
      'This stops an agent that cooperates or makes a mistake, not one working against you: an agent that removes its markers, or runs the command through a process that drops its environment, is not stopped, and its commit looks like yours (Codex marks only the commands it runs sandboxed).',
    );
  });

  it('user guide §9 states the trailers an agent\'s commits carry', () => {
    expect(s9).toContain(
      flat(`Commits an agent causes carry its trailers: in an agent's
  session every \`wingfoil\` command that writes ends its commit with \`Co-Authored-By: <name> <<email>>\` — the
  \`team.agents\` entry \`--co-author <name>\` names, else the one the session selects — and \`AI-Model: <model>\`, from
  \`--ai-model <id>\` or \`WINGFOIL_AGENT_MODEL\`, else \`not-reported\`. An agent never approves: the approval commands
  refuse its session (§8.3).`),
    );
  });

  it('cli-reference: an --ai-model <id> row with its three exit-2 messages, named by the preamble', () => {
    const aiModel = row('--ai-model <id>');
    expect(aiModel).toMatch(/^\| `--ai-model <id>` \|/);
    for (const message of [
      'invalid flag combination: --ai-model needs an agent context (--co-author, or a session an agent started)',
      'invalid flag value: --ai-model must be one line',
      'invalid flag value: --ai-model must not be blank',
    ]) expect(aiModel).toContain(message);
    expect(flat(globalOptions.split('\n')[0] as string)).toContain('`--ai-model`');
  });

  it('cli-reference: the --co-author row no longer says it changes nothing on the other commands', () => {
    const coAuthor = row('--co-author <name>');
    expect(coAuthor).toMatch(/^\| `--co-author <name>` \|/);
    expect(coAuthor).toContain('E_AGENT_CONTEXT');
    expect(coAuthor).not.toContain('On the other commands it changes nothing yet');
  });
});

describe('task-334 AC 6 — no "signed" or "human-approved" claim (dl-212 D4)', () => {
  it.each([
    ['AGENTS.md', AGENTS],
    ['git-conventions', GIT_CONVENTIONS],
    ['docs/user-guide.md', USER_GUIDE],
    ['docs/cli-reference.md', CLI_REFERENCE],
  ])('%s carries neither word', (_file, text) => {
    expect(text).not.toMatch(/\bsigned\b/i);
    expect(text).not.toMatch(/human-approved/i);
  });
});

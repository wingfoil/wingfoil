/**
 * task-378 (`spec-020` §4.13 and T-34, T-36 to T-38, as amended at the design gate) — the throwaway repositories of the
 * `memory history` mark and `memory search --verify` suites (`test/core/memory-history-mark.test.ts`,
 * `test/core/memory-search-verify.test.ts`, `test/cli/memory-history-mark.integration.test.ts`).
 *
 * - {@link MarkFixture}: a repository whose hand commits carry fixed, increasing dates and a chosen identity (the
 *   `Fixture` of `test/cli/verify.integration.test.ts`, with the `MEMORY_YAML`, `taskDoc` and identities of
 *   `./in-memory-history-reader`), and which runs the built CLI with the `spec-018` §1 markers scrubbed
 *   (`withoutAgentMarkers`), as the git identity the repository configures (`WingFoil Test <wf-test@example.invalid>`).
 * - `spec-020` T-8 ({@link t8}), T-9 ({@link t9}), T-37 ({@link t37}) and the commit made before any `memory.yaml`
 *   ({@link preMemory}) — the same commits as the verify suite's.
 * - T-1's shape ({@link t1}): every commit that touches an element written by a verb (`memory add`, `submit`,
 *   `approve`, `reject`, `amend`, `deprecate`) run through the CLI; the configuration commit touches no element.
 *
 * Not a `.test.ts` file. Deterministic but for the dates the verbs' own commits carry (never asserted).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutAgentMarkers } from '../../agent-markers.cjs';
import { CLI_ENTRY, spawnCapture, type SpawnedRun } from '../../cli/helpers/spawn-cli';
import { git, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';
import { APPROVER, DEVELOPER, MEMORY_YAML, STRANGER, TASK, approvalBody, dnaYaml, taskDoc, type Person } from './in-memory-history-reader';

/** The git identity every fixture repository configures (`makeTempGitRepo`), the one the spawned verbs run as. */
export const ME: Person = { name: 'WingFoil Test', email: 'wf-test@example.invalid' };

/** The fixture's `dna.yaml`: the approver, the developer, and {@link ME} as a developer (so `memory submit` runs). */
export const MARK_DNA = dnaYaml([
  { ...APPROVER, roles: ['approver', 'developer'] },
  { ...DEVELOPER, roles: ['developer'] },
  { ...ME, roles: ['developer'] },
]);

/** The keys of a `memory history` entry no check flags, in order (`spec-008` §12 as amended: `carries` after `reason`). */
export const ENTRY_KEYS = ['sha', 'author', 'timestamp', 'operation', 'from', 'to', 'approver', 'reason', 'carries', 'subject', 'wingfoil'];

/** `spec-020` §4.7's message. */
export const OUTSIDE = (path: string, from: string, to: string): string => `${path}: its status went ${from} → ${to} in a commit that is not a wf() Memory operation (dl-139)`;
/** `spec-020` §4.4's two `authority` messages. */
export const NO_ROLE = (email: string): string => `the author <${email}> holds no approver role in team.members (dl-094)`;
export const OTHER = (named: string, author: string): string => `the Approver: line names <${named}>, but <${author}> authored the commit (dl-094)`;
/** `spec-020` §4.5's first row, gated. */
export const NO_MEMORY_YAML = 'no .wingfoil/memory.yaml is committed at this commit: its state cannot be checked';

/** A throwaway repository with fixed-date hand commits and the built CLI. */
export class MarkFixture {
  readonly root: string;
  private minute = 0;

  constructor() {
    this.root = makeTempGitRepo();
  }

  /** Write (text) or delete (`null`) `files`, then commit everything with `message` as `author`; returns the sha. */
  commit(message: string, files: Record<string, string | null> = {}, author: Person = DEVELOPER): string {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) git(this.root, ['rm', '--quiet', path]);
      else writeFixtureFile(this.root, path, content);
    }
    git(this.root, ['add', '-A']);
    if (this.minute > 59) throw new Error('fixture bug: more than 60 commits');
    const date = `2026-01-01T08:${String(this.minute).padStart(2, '0')}:00Z`;
    this.minute += 1;
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', message], {
      cwd: this.root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    });
    return this.head();
  }

  head(): string {
    return git(this.root, ['rev-parse', 'HEAD']).trim();
  }

  /** The built CLI in this repository, the agent markers scrubbed. */
  wingfoil(args: readonly string[]): SpawnedRun {
    return spawnCapture('node', [CLI_ENTRY, ...args], { cwd: this.root, env: withoutAgentMarkers(process.env) as NodeJS.ProcessEnv });
  }

  /** {@link wingfoil}, which must exit 0 with an empty stderr; returns its stdout. */
  run(args: readonly string[]): string {
    const run = this.wingfoil(args);
    if (run.status !== 0 || run.stderr !== '') throw new Error(`fixture bug: wingfoil ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
    return run.stdout;
  }

  /** Replace `from` with `to` in the working-tree file `path` (an author's edit before a verb). */
  edit(path: string, from: string, to: string): void {
    const absolute = join(this.root, path);
    const text = readFileSync(absolute, 'utf-8');
    if (!text.includes(from)) throw new Error(`fixture bug: ${path} holds no ${JSON.stringify(from)}`);
    writeFileSync(absolute, text.replace(from, to));
  }
}

/** The governed base: configure (the two files, {@link MARK_DNA}), `add t-1` (`draft`), `submit t-1` (`pending`). */
export function governedFixture(): { f: MarkFixture; add: string; submit: string } {
  const f = new MarkFixture();
  f.commit('chore: configure wingfoil', { '.wingfoil/memory.yaml': MEMORY_YAML, '.wingfoil/dna.yaml': MARK_DNA });
  const add = f.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
  const submit = f.commit('wf(task): submit t-1', { [TASK('t-1')]: taskDoc('pending') });
  return { f, add, submit };
}

/** T-8: `bug-496`'s forged approval of `t-1` by a non-member. */
export function t8(): { f: MarkFixture; bad: string } {
  const { f } = governedFixture();
  const bad = f.commit('wf(task): approve t-1 [pending → backlog]\n\nApprover: Nobody <nobody@example.invalid> (approver)\nReason: Looks fine.', { [TASK('t-1')]: taskDoc('backlog') }, STRANGER);
  return { f, bad };
}

/** T-9: a hand commit `docs: tidy` moving `t-1` `pending → backlog`. */
export function t9(): { f: MarkFixture; add: string; submit: string; tidy: string } {
  const { f, add, submit } = governedFixture();
  const tidy = f.commit('docs: tidy', { [TASK('t-1')]: taskDoc('backlog') });
  return { f, add, submit, tidy };
}

/** T-37: one hand approve of `t-1, t-2` whose bracket contradicts `t-2`'s frontmatter only (`pending → in-progress`). */
export function t37(): { f: MarkFixture; bad: string } {
  const { f } = governedFixture();
  f.commit('wf(task): add t-2', { [TASK('t-2')]: taskDoc('draft', '', 't-2') });
  f.commit('wf(task): submit t-2', { [TASK('t-2')]: taskDoc('pending', '', 't-2') });
  const bad = f.commit(`wf(task): approve t-1, t-2 [pending → backlog]\n\n${approvalBody()}`, { [TASK('t-1')]: taskDoc('backlog'), [TASK('t-2')]: taskDoc('in-progress', '', 't-2') }, APPROVER);
  return { f, bad };
}

/** `wf(task): add t-1` committed after `dna.yaml` and before any `memory.yaml`, which a later commit adds. */
export function preMemory(): { f: MarkFixture; early: string } {
  const f = new MarkFixture();
  f.commit('chore: team', { '.wingfoil/dna.yaml': MARK_DNA });
  const early = f.commit('wf(task): add t-1', { [TASK('t-1')]: taskDoc('draft') });
  f.commit('chore: memory', { '.wingfoil/memory.yaml': MEMORY_YAML });
  return { f, early };
}

/** T-1's `memory.yaml`: a `task` type the verbs can add (an `id_pattern` and a template), amendable. */
export const VERB_MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/tasks/{id}.md"
    amendable: true
    id_pattern: "task-{n}-{slug}"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [title]
    states:
      sequence: [draft, pending, backlog, in-progress, done]
      gates:
        pending: { reject: draft }
      returns: { in-progress: backlog }
`;

/** T-1's `dna.yaml`: {@link ME} holds `approver`, so the spawned approve, reject and amend run. */
export const VERB_DNA = dnaYaml([{ ...ME, roles: ['developer', 'approver'] }]);

export const VERB_TASK = (id: string): string => `docs/tasks/${id}.md`;

/** A repository configured for the verbs: {@link VERB_MEMORY_YAML}, its template and {@link VERB_DNA}, one commit. */
export function verbFixture(): MarkFixture {
  const f = new MarkFixture();
  f.commit(
    'chore: configure wingfoil',
    {
      '.wingfoil/memory.yaml': VERB_MEMORY_YAML,
      '.wingfoil/memory/templates/task.md': '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\n---\n\n<!-- body -->\n',
      '.wingfoil/dna.yaml': VERB_DNA,
    },
    ME,
  );
  return f;
}

/**
 * T-1's shape: `task-001-approve-me` added, its body filled and submitted (`Carries content: the body`), approved, then
 * amended; `task-002-reject-me` added, submitted as a pure transition, rejected; `task-003-deprecate-me` added and
 * deprecated. Every commit that touches a task is a verb's.
 */
export function t1(): MarkFixture {
  const f = verbFixture();
  f.run(['memory', 'add', '--type', 'task', '--title', 'Approve me']);
  f.edit(VERB_TASK('task-001-approve-me'), '<!-- body -->', 'The scope.');
  f.run(['memory', 'submit', 'task-001-approve-me']);
  f.run(['memory', 'approve', 'task-001-approve-me', '--reason', 'Scope is clear.']);
  f.edit(VERB_TASK('task-001-approve-me'), 'The scope.', 'The corrected scope.');
  f.run(['memory', 'amend', 'task-001-approve-me', '--reason', 'A corrected scope paragraph.']);
  f.run(['memory', 'add', '--type', 'task', '--title', 'Reject me']);
  f.run(['memory', 'submit', 'task-002-reject-me']);
  f.run(['memory', 'reject', 'task-002-reject-me', '--reason', 'Add acceptance criteria.']);
  f.run(['memory', 'add', '--type', 'task', '--title', 'Deprecate me']);
  f.run(['memory', 'deprecate', 'task-003-deprecate-me', '--reason', 'Superseded.']);
  return f;
}

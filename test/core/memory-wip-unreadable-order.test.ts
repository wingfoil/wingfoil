/**
 * task-357 (review C2, REQ-SYS-07, `determinism`): the `W_MEMORY_UNREADABLE` diagnostics a WIP-limit check
 * returns — a refusal's `details.issues`, a success's warnings — do not depend on the order the refs are read
 * in. `requireWipSlot` (`src/core/memory-transition.ts`) reads the decided commit, then every ref that moved
 * since its fork in the order of their tip shas (`refBaselineCommits`), so before this fix the diagnostics
 * followed that order: two unreadable documents on two refs were listed by which ref's sha sorted first, and of
 * two unreadable copies of one path the first read named the reason.
 *
 * Each case is run in both read orders, fixed by amending the two tips until the order the case names holds
 * (the technique of `test/core/memory-wip-limits.test.ts`), and must give the same diagnostics.
 */
import { execFileSync } from 'node:child_process';

import { CORE_MODULES } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { Diagnostic } from '../../src/validation';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1
types:
  card:
    path: "docs/memory/cards/{id}.md"
    states:
      sequence: [draft, in-progress, done]
      limits: { in-progress: 1 }
  wide:
    path: "docs/memory/wide/{id}.md"
    states:
      sequence: [draft, in-progress, done]
      limits: { in-progress: 2 }
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
    - name: WingFoil Test
      email: wf-test@example.invalid
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** Two documents whose frontmatter fails to parse, each with its own parse error (js-yaml: a flow collection left open; a bad mapping indentation). */
const UNREADABLE_BRACKET = '---\nid: [unclosed\n---\n\nBody.\n';
const UNREADABLE_MAPPING = '---\nid: a: b\n---\n\nOther bytes.\n';

function doc(id: string, type: string, status: string): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "A ${type}"\nstatus: ${status}\n---\n\nBody.\n`;
}

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}

function submit(repo: string, id: string): ReturnType<CoreFn<unknown, unknown>> {
  const op = CORE_MODULES.find((module) => module.name === 'memory')?.operations['memorySubmit'];
  if (!op) throw new Error('fixture bug: "memorySubmit" operation not registered on the memory module');
  return (op.fn as CoreFn<unknown, unknown>)({ root: repo, positional: id, positionals: [id] });
}

describe('WIP-limit diagnostics are independent of the order the refs are read in (task-357, REQ-SYS-07)', () => {
  let repo: string;
  let trunk: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
    writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
    writeFixtureFile(repo, 'docs/memory/cards/card-001.md', doc('card-001', 'card', 'in-progress'));
    writeFixtureFile(repo, 'docs/memory/cards/card-002.md', doc('card-002', 'card', 'draft'));
    writeFixtureFile(repo, 'docs/memory/wide/wide-001.md', doc('wide-001', 'wide', 'draft'));
    commitAll(repo, 'seed');
    trunk = gitOut(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  });

  afterEach(() => removeTempDir(repo));

  /** Amend both tips until `first`'s full sha sorts before `second`'s, the order the refs are read in. */
  function readFirst(first: string, second: string): void {
    for (let tries = 1; gitOut(repo, ['rev-parse', first]) > gitOut(repo, ['rev-parse', second]); tries++) {
      if (tries > 64) throw new Error(`fixture bug: the tip of ${first} still sorts after the tip of ${second} after 64 amends`);
      for (const ref of [second, first]) {
        git(repo, ['checkout', '--quiet', ref]);
        const subject = gitOut(repo, ['log', '-1', '--format=%s']);
        git(repo, ['commit', '--amend', '--quiet', '-m', `${subject} (reorder ${tries})`]);
      }
    }
    git(repo, ['checkout', '--quiet', trunk]);
    expect(gitOut(repo, ['rev-parse', first]) < gitOut(repo, ['rev-parse', second])).toBe(true);
  }

  /** A branch cut from the trunk holding `files`, back on the trunk afterwards. */
  function branchWith(name: string, files: Record<string, string>): void {
    git(repo, ['checkout', '--quiet', '-b', name, trunk]);
    for (const [path, content] of Object.entries(files)) writeFixtureFile(repo, path, content);
    commitAll(repo, `${name}: an unreadable document`);
    git(repo, ['checkout', '--quiet', trunk]);
  }

  /** The refusal's `details.issues` of submitting card-002 (the limit of 1 is held by card-001). */
  async function refusalIssues(): Promise<readonly Diagnostic[]> {
    const result = await submit(repo, 'card-002');
    expect(result.ok).toBe(false);
    if (result.ok) return [];
    return (result.error.details as { issues?: readonly Diagnostic[] } | undefined)?.issues ?? [];
  }

  it.each([
    ['a', 'b'],
    ['b', 'a'],
  ])('two refs adding an unreadable document each: the refusal lists them in path order (read first: %s)', async (first, second) => {
    branchWith('a', { 'docs/memory/cards/card-zzz.md': UNREADABLE_BRACKET });
    branchWith('b', { 'docs/memory/cards/card-aaa.md': UNREADABLE_MAPPING });
    readFirst(first, second);
    const issues = await refusalIssues();
    expect(issues.map((issue) => issue.file)).toEqual(['docs/memory/cards/card-aaa.md', 'docs/memory/cards/card-zzz.md']);
  });

  it.each([
    ['a', 'b'],
    ['b', 'a'],
  ])('two refs holding one unreadable path with other bytes: one diagnostic, the same whichever ref is read first (read first: %s)', async (first, second) => {
    branchWith('a', { 'docs/memory/cards/card-mid.md': UNREADABLE_BRACKET });
    branchWith('b', { 'docs/memory/cards/card-mid.md': UNREADABLE_MAPPING });
    readFirst(first, second);
    const issues = await refusalIssues();
    expect(issues).toHaveLength(1);
    // The message that sorts first (UTF-16 code units) of the copies' diagnostics names the reason.
    const messages = issues.map((issue) => issue.message);
    expect(messages).toEqual([expect.stringContaining('unreadable frontmatter in docs/memory/cards/card-mid.md: ')]);
    const other = await (async () => {
      readFirst(second, first);
      return (await refusalIssues()).map((issue) => issue.message);
    })();
    expect(other).toEqual(messages);
  });

  it.each([
    ['a', 'b'],
    ['b', 'a'],
  ])('a success carries the same warnings in path order whichever ref is read first (read first: %s)', async (first, second) => {
    branchWith('a', { 'docs/memory/wide/wide-zzz.md': UNREADABLE_BRACKET });
    branchWith('b', { 'docs/memory/wide/wide-aaa.md': UNREADABLE_MAPPING });
    readFirst(first, second);
    const result = await submit(repo, 'wide-001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const named = (result.warnings ?? []).filter((line) => line.includes('W_MEMORY_UNREADABLE'));
    expect(named.map((line) => /docs\/memory\/wide\/wide-[a-z]+\.md/.exec(line)?.[0])).toEqual(['docs/memory/wide/wide-aaa.md', 'docs/memory/wide/wide-zzz.md']);
  });
});

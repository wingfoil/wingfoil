/**
 * task-092-writes-refuse-a-dirty-target — the committed-tree post-condition for targets that carry
 * no declared frontmatter fields, and the refusal describer that tells a user what is in the way.
 *
 * `verifyCommittedPaths` is the content-agnostic sibling of `verifyCommittedScope` (`task-088`,
 * `src/core/memory-transition.ts`): where that one asks "did the commit change only the frontmatter
 * fields this verb owns", this one asks "does the commit carry, for each declared path, exactly the
 * bytes this operation wrote — and nothing else". `dna.yaml` and `roles.yaml` have no frontmatter
 * block at all, so byte equality is both the applicable question and the stricter one.
 *
 * Exercised **directly**, on hand-made commits, rather than only through the verbs it guards —
 * `task-088`'s precedent for `verifyCommittedScope`, and for the same reason: with
 * `requireUnmodifiedTarget` in place no argument to a verb can reach the alarm, so an indirect test
 * could only ever assert that it stays silent. The one realistic trigger is a repository-local
 * `pre-commit` hook that rewrites and re-stages the target from inside `git commit`, after every
 * pre-write check has already passed; that case is driven through the real `dna set` operation below.
 *
 * Deterministic (REQ-SYS-07): fixed fixture text, fixed git identity, fixed case order.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CORE_MODULES,
  committedScopeError,
  initWingfoilProject,
  requireAbsentTarget,
  requireUnmodifiedTarget,
  undeclaredCommittedPaths,
  verifyCommittedPaths,
} from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { EMPTY_TREE_SHA } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const A = 'a.txt';
const B = 'b.txt';
const DNA = '.wingfoil/dna.yaml';

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();

/** A repo with `a.txt` and `b.txt` committed, and one further commit that changed only `a.txt`. */
function repoWithOneChangedPath(): { repo: string; sha: string } {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, A, 'first\n');
  writeFixtureFile(repo, B, 'other\n');
  commitAll(repo, 'seed');
  writeFixtureFile(repo, A, 'second\n');
  commitAll(repo, 'change a');
  return { repo, sha: head(repo) };
}

describe('verifyCommittedPaths — what a commit contains, against its own parent', () => {
  let repo: string;
  let sha: string;

  beforeEach(() => {
    ({ repo, sha } = repoWithOneChangedPath());
  });
  afterEach(() => removeTempDir(repo));

  it('reports nothing when the commit carries exactly the declared path with the declared bytes', () => {
    expect(verifyCommittedPaths(repo, sha, new Map([[A, 'second\n']]))).toEqual([]);
  });

  it('names a path that rode in alongside the declared one', () => {
    writeFixtureFile(repo, A, 'third\n');
    writeFixtureFile(repo, B, 'changed too\n');
    commitAll(repo, 'change both');

    expect(verifyCommittedPaths(repo, head(repo), new Map([[A, 'third\n']]))).toEqual([`it also contains '${B}'`]);
  });

  it('names a declared path the commit does not contain at all', () => {
    const problems = verifyCommittedPaths(repo, sha, new Map([['never-written.txt', 'x']]));

    expect(problems).toContain("it does not contain 'never-written.txt'");
    // `a.txt` was not declared, so it is reported as an extra path — both halves fire together.
    expect(problems).toContain(`it also contains '${A}'`);
  });

  it('names a declared path whose committed bytes differ from what the operation wrote', () => {
    expect(verifyCommittedPaths(repo, sha, new Map([[A, 'what the operation thought it wrote\n']]))).toEqual([
      `'${A}' at the commit differs from what this operation wrote`,
    ]);
  });

  it('names a path a removal declared but did not remove', () => {
    expect(verifyCommittedPaths(repo, sha, new Map([[A, null]]))).toEqual([
      `it still contains '${A}', which this operation removed`,
    ]);
  });

  it('accepts a removal that did remove the path', () => {
    git(repo, ['rm', '--quiet', B]);
    git(repo, ['commit', '--quiet', '-m', 'remove b']);

    expect(verifyCommittedPaths(repo, head(repo), new Map([[B, null]]))).toEqual([]);
  });

  it('compares a ROOT commit against git\'s empty tree, so the check is total rather than conditional', () => {
    const fresh = makeTempGitRepo();
    try {
      writeFixtureFile(fresh, A, 'only\n');
      commitAll(fresh, 'root');
      const root = head(fresh);

      expect(undeclaredCommittedPaths(fresh, root, [A]).parent).toBe(EMPTY_TREE_SHA);
      expect(verifyCommittedPaths(fresh, root, new Map([[A, 'only\n']]))).toEqual([]);
    } finally {
      removeTempDir(fresh);
    }
  });
});

describe('committedScopeError — the post-condition as the CoreResult every caller returns', () => {
  let repo: string;
  let sha: string;

  beforeEach(() => {
    ({ repo, sha } = repoWithOneChangedPath());
  });
  afterEach(() => removeTempDir(repo));

  it('returns undefined when the commit is exactly what was declared', () => {
    expect(committedScopeError(repo, sha, A, 'second\n')).toBeUndefined();
  });

  it('returns a VALIDATION error naming the sha and the leak, at exit 1', () => {
    const result = committedScopeError(repo, sha, A, 'not what is committed\n');

    expect(result).toBeDefined();
    expect(result?.ok).toBe(false);
    expect(exitCodeForResult(result!)).toBe(1);
    expect(result?.ok === false && result.error.message).toContain(sha);
    expect(result?.ok === false && result.error.message).toContain('carries more than the change it declares');
  });
});

describe('the alarm is reachable — a pre-commit hook that rewrites the target (task-088 precedent)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
  });
  afterEach(() => removeTempDir(repo));

  it('`dna set` reports the commit it produced rather than rewriting history behind the user', async () => {
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    expect(scaffolded.ok).toBe(true);

    // Runs INSIDE `git commit`, after `requireUnmodifiedTarget` (the tree WAS clean) and after the
    // write: nothing before the commit can see it. A formatter or a linter run with `--fix` is the
    // real-world shape of this.
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf "\\n# rewritten by a pre-commit hook\\n" >> .wingfoil/dna.yaml\ngit add .wingfoil/dna.yaml\n', 'utf-8');
    chmodSync(hook, 0o755);

    const operation = CORE_MODULES.find((module) => module.name === 'dna')?.operations.dnaSet;
    const result = await operation!.fn({ root: repo, positionals: ['project.name'], options: { value: 'Renamed' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    const message = result.ok === false ? result.error.message : '';
    expect(message).toContain('carries more than the change it declares');
    expect(message).toContain(DNA);
    // An alarm, not a rollback (dl-035): the commit it names still exists and history is untouched.
    expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim()).toBe(
      'wf(dna): set project.name',
    );
  });

  it('`directive assign` reports the same way — the post-condition is wired at every write site', async () => {
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    expect(scaffolded.ok).toBe(true);

    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf "\\n# rewritten by a pre-commit hook\\n" >> .wingfoil/roles.yaml\ngit add .wingfoil/roles.yaml\n', 'utf-8');
    chmodSync(hook, 0o755);

    const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveAssign;
    const result = await operation!.fn({ root: repo, options: { directive: 'architecture', role: 'developer' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.ok === false && result.error.message).toContain('carries more than the change it declares');
  });

  // task-189 (bug-161): the three remaining write sites in `src/core/index.ts` whose alarm no test
  // reached. Same trigger, same report; each names the path it wrote and keeps the commit it made.
  it('`directive create` reports the same way', async () => {
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    expect(scaffolded.ok).toBe(true);
    const target = '.wingfoil/directives/custom/hooked.md';

    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, `#!/bin/sh\nprintf "\\n<!-- rewritten by a pre-commit hook -->\\n" >> ${target}\ngit add ${target}\n`, 'utf-8');
    chmodSync(hook, 0o755);

    const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveCreate;
    const result = await operation!.fn({ root: repo, options: { name: 'hooked' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    const message = result.ok === false ? result.error.message : '';
    expect(message).toContain('carries more than the change it declares');
    expect(message).toContain(target);
    expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim()).toBe(
      'wf(directive): create hooked',
    );
  });

  it('`directive remove` reports a removal commit that carries an extra path', async () => {
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    expect(scaffolded.ok).toBe(true);
    const created = await CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveCreate!.fn({
      root: repo,
      options: { name: 'doomed' },
    });
    expect(created?.ok).toBe(true);

    // A removal has no bytes for a hook to rewrite, so the hook stages a file of its own instead —
    // the other half of the same post-condition ("and nothing else").
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf "hook\\n" > hook-output.txt\ngit add hook-output.txt\n', 'utf-8');
    chmodSync(hook, 0o755);

    const operation = CORE_MODULES.find((module) => module.name === 'directive')?.operations.directiveRemove;
    const result = await operation!.fn({ root: repo, positional: 'doomed' });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    const message = result.ok === false ? result.error.message : '';
    expect(message).toContain('carries more than the change it declares');
    expect(message).toContain("it also contains 'hook-output.txt'");
    expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim()).toBe(
      'wf(directive): remove doomed',
    );
  });

  it('`memory add` reports the same way', async () => {
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    expect(scaffolded.ok).toBe(true);

    // The hook cannot know the id in advance, so it rewrites whatever Memory file the commit stages.
    const hook = join(repo, '.git', 'hooks', 'pre-commit');
    writeFileSync(
      hook,
      '#!/bin/sh\nfor f in $(git diff --cached --name-only -- docs/memory); do\n  printf "\\n<!-- rewritten by a pre-commit hook -->\\n" >> "$f"\n  git add "$f"\ndone\n',
      'utf-8',
    );
    chmodSync(hook, 0o755);

    const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations.memoryAdd;
    const result = await operation!.fn({ root: repo, options: { type: 'bug', title: 'Hooked' } });

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    const message = result.ok === false ? result.error.message : '';
    expect(message).toContain('carries more than the change it declares');
    expect(message).toContain('docs/memory/bug/bug-001-hooked.md');
    expect(execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s'], { encoding: 'utf-8' }).trim()).toBe(
      'wf(bug): add bug-001-hooked',
    );
  });
});

describe('requireUnmodifiedTarget / requireAbsentTarget — what the refusals name', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, A, 'first\n');
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  it('passes a clean, tracked target and an absent one alike', () => {
    expect(requireUnmodifiedTarget(repo, A).ok).toBe(true);
    expect(requireUnmodifiedTarget(repo, 'never-existed.txt').ok).toBe(true);
  });

  it('names the porcelain code and reports a plain file as "the file content", never "the body"', () => {
    writeFixtureFile(repo, A, 'first\nedited\n');

    const result = requireUnmodifiedTarget(repo, A);

    expect(result.ok).toBe(false);
    const message = result.ok === false ? result.error.message : '';
    expect(message).toContain("[git status ' M']");
    expect(message).toContain('the file content');
    expect(message).not.toContain('the body');
    expect(message).toContain('commit or stash');
  });

  it('names an UNTRACKED target as not tracked at HEAD', () => {
    writeFixtureFile(repo, 'fresh.txt', 'never committed\n');

    const result = requireUnmodifiedTarget(repo, 'fresh.txt');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('is not tracked at HEAD');
  });

  it('reports a target that is staged-but-deleted from the working tree as missing from both places', () => {
    git(repo, ['rm', '--cached', '--quiet', A]);

    const result = requireUnmodifiedTarget(repo, A);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('is not in the index');
  });

  it('requireAbsentTarget passes an unused path and names each place an occupant lives', () => {
    expect(requireAbsentTarget(repo, 'docs/new.md').ok).toBe(true);

    const result = requireAbsentTarget(repo, A);

    expect(result.ok).toBe(false);
    expect(exitCodeForResult(result)).toBe(1);
    const message = result.ok === false ? result.error.message : '';
    expect(message).toContain('at HEAD');
    expect(message).toContain('in the index');
    expect(message).toContain('in the working tree');
  });

  it('requireAbsentTarget refuses a path that exists ONLY at HEAD (deleted in the working tree)', () => {
    git(repo, ['rm', '--quiet', A]);

    const result = requireAbsentTarget(repo, A);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('at HEAD');
  });
});

/**
 * task-358 AC 2 (b) (red-first, `bug-320` Expected; `dl-115` Q1 (A), Q2 (a), Action 3; approver ruling D2 (b)) —
 * `scripts/check-retrospective.cjs <path>`, the command `retrospective.present` runs (`dev-loop.done`): the Memory
 * document at `<path>` holds a `### Retrospective` subsection in its running log with at least one line outside HTML
 * comments ("None" is an entry; the template's comment alone is not), and for a `task`, so does every bug of its `bug:`
 * list whose `status` is `closed`, found at the path `memory.yaml`'s `bug.path` gives.
 *
 * Exit `0` every entry present (stdout empty); `1` one or more missing, one stdout line per file
 * `<path>: no ### Retrospective entry`; `2` a path outside the repository root, a missing file, a file that is not a
 * Memory document, or no argument, with the reason on stderr (`spec-003` Layer 3's exit table). The module also exports
 * the pure predicate `hasRetrospectiveEntry(markdown)`.
 *
 * Fixtures: a temporary, git-less directory holding this repository's committed `.wingfoil/memory.yaml` and Memory
 * files built from this repository's templates (`.wingfoil/memory/templates/task.md`, `bug.md`, `plan.md`, read at
 * `HEAD`), their frontmatter filled. The task's `bug:` list holds the short ids this repository's tasks carry
 * (`bug: [bug-469, bug-320, …]`), each naming the file `bug-<n>-<slug>.md`. The script is loaded with `require` against
 * the local interface below (its `.d.cts` is the implementation's), so the type check is clean before it exists.
 * Deterministic: fixed file names and contents, no clock.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import { fixtureDirPrefix, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { spawnCapture } from './helpers/spawn-cli';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-retrospective.cjs');

/** The exports this suite uses (the implementation's `scripts/check-retrospective.d.cts` declares them). */
interface CheckRetrospectiveModule {
  hasRetrospectiveEntry(markdown: string): boolean;
}

function load(): CheckRetrospectiveModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(SCRIPT) as CheckRetrospectiveModule;
}

function atHead(path: string): string {
  return execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf-8' });
}

const MEMORY_YAML = atHead('.wingfoil/memory.yaml');
const TEMPLATES = {
  task: atHead('.wingfoil/memory/templates/task.md'),
  bug: atHead('.wingfoil/memory/templates/bug.md'),
  plan: atHead('.wingfoil/memory/templates/plan.md'),
};

/** Set frontmatter fields of a template (each `key: value` line replaced, its comment dropped). */
function fill(template: string, fields: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [key, value] of Object.entries(fields)) {
    out = out.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`);
  }
  return out;
}

/** Append an entry after the `### Retrospective` heading's comment (the template's last block). */
function withEntry(document: string, entry: string): string {
  return `${document.trimEnd()}\n\n${entry}\n`;
}

/** Remove the `### Retrospective` subsection (the heading and everything after it). */
function withoutSubsection(document: string): string {
  return `${document.slice(0, document.indexOf('### Retrospective')).trimEnd()}\n`;
}

const TASK_PATH = 'docs/04_memory/v9.9/task-901-fixture-task.md';
const CLOSED_BUG_PATH = 'docs/04_memory/bugs/bug-902-fixture-closed-bug.md';
const OPEN_BUG_PATH = 'docs/04_memory/bugs/bug-903-fixture-bug-in-review.md';
const PLAN_PATH = 'docs/05_plans/rl-v9/rel-v9.9/dev-loop-rel-v9.9-plan.md';

function task(bugs: string): string {
  return fill(TEMPLATES.task, {
    id: 'task-901-fixture-task',
    title: '"Fixture task"',
    status: 'done',
    release: '"v9.9"',
    kind: '"fix"',
    bug: bugs,
  });
}

function bug(id: string, status: string): string {
  return fill(TEMPLATES.bug, { id, title: '"Fixture bug"', status, severity: '"low"', release: '"v9.9"' });
}

const PLAN = fill(TEMPLATES.plan, {
  id: 'dev-loop-rel-v9.9-plan',
  title: '"Dev-loop — rel-v9.9"',
  status: 'active',
  workflow: '"dev-loop"',
  phase: '"rel-v9.9"',
  parent: '"release-cycle.implementation"',
  release: '"v9.9"',
});

const dirs: string[] = [];
afterAll(() => dirs.forEach(removeTempDir));

/** A git-less project root with this repository's memory.yaml and the given files. */
function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(fixtureDirPrefix());
  dirs.push(root);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  return root;
}

function check(root: string, ...args: string[]): ReturnType<typeof spawnCapture> {
  return spawnCapture(process.execPath, [SCRIPT, ...args], { cwd: root });
}

describe('task-358 AC 2 (b) — scripts/check-retrospective.cjs <path> (bug-320, D2 (b))', () => {
  it('exit 0, stdout empty: a task whose subsection holds "None." and whose closed bug (a short id in bug:) holds an entry', () => {
    const root = project({
      [TASK_PATH]: withEntry(task('[bug-902]'), '- None.'),
      [CLOSED_BUG_PATH]: withEntry(bug('bug-902-fixture-closed-bug', 'closed'), '- The finding came from the e2e smoke (sha 0123abc).'),
    });
    const run = check(root, TASK_PATH);
    expect({ status: run.status, stdout: run.stdout }).toEqual({ status: 0, stdout: '' });
  });

  it('exit 1: the task\'s subsection holds the template\'s comment only', () => {
    const root = project({ [TASK_PATH]: task('[]') });
    const run = check(root, TASK_PATH);
    expect({ status: run.status, stdout: run.stdout }).toEqual({ status: 1, stdout: `${TASK_PATH}: no ### Retrospective entry\n` });
  });

  it('exit 1 naming the bug only: the task has an entry, its closed bug has no subsection', () => {
    const root = project({
      [TASK_PATH]: withEntry(task('[bug-902]'), '- None.'),
      [CLOSED_BUG_PATH]: withoutSubsection(bug('bug-902-fixture-closed-bug', 'closed')),
    });
    const run = check(root, TASK_PATH);
    expect({ status: run.status, stdout: run.stdout }).toEqual({ status: 1, stdout: `${CLOSED_BUG_PATH}: no ### Retrospective entry\n` });
  });

  it('exit 1, the task first, then the bug: neither has an entry (files in the order given, then bug: order)', () => {
    const root = project({
      [TASK_PATH]: task('[bug-902]'),
      [CLOSED_BUG_PATH]: withoutSubsection(bug('bug-902-fixture-closed-bug', 'closed')),
    });
    const run = check(root, TASK_PATH);
    expect({ status: run.status, stdout: run.stdout }).toEqual({
      status: 1,
      stdout: `${TASK_PATH}: no ### Retrospective entry\n${CLOSED_BUG_PATH}: no ### Retrospective entry\n`,
    });
  });

  it('exit 0: a bug of bug: still in-review, without the subsection, is not checked (only closed bugs count)', () => {
    const root = project({
      [TASK_PATH]: withEntry(task('[bug-903]'), '- None.'),
      [OPEN_BUG_PATH]: withoutSubsection(bug('bug-903-fixture-bug-in-review', 'in-review')),
    });
    const run = check(root, TASK_PATH);
    expect({ status: run.status, stdout: run.stdout }).toEqual({ status: 0, stdout: '' });
  });

  it('a plan: exit 0 with an entry, exit 1 without', () => {
    const withOne = project({ [PLAN_PATH]: withEntry(PLAN, '- None.') });
    expect((({ status, stdout }) => ({ status, stdout }))(check(withOne, PLAN_PATH))).toEqual({ status: 0, stdout: '' });
    const without = project({ [PLAN_PATH]: PLAN });
    expect((({ status, stdout }) => ({ status, stdout }))(check(without, PLAN_PATH))).toEqual({ status: 1, stdout: `${PLAN_PATH}: no ### Retrospective entry\n` });
  });

  describe('exit 2, with the reason on stderr', () => {
    const root = project({
      [TASK_PATH]: withEntry(task('[]'), '- None.'),
      'docs/notes.md': '# Notes\n\nNot a Memory document: no frontmatter.\n\n### Retrospective\n\n- None.\n',
    });

    it.each([
      ['a path outside the repository root', ['../outside.md']],
      ['a missing file', ['docs/04_memory/v9.9/task-999-missing.md']],
      ['a file that is not a Memory document', ['docs/notes.md']],
      ['no argument', []],
    ])('%s', (_label, args) => {
      const run = check(root, ...args);
      expect(run.status).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr.trim()).not.toBe('');
      expect(run.stderr).not.toMatch(/Cannot find module/);
    });

    it('a bug: id with no file', () => {
      const missing = project({ [TASK_PATH]: withEntry(task('[bug-904]'), '- None.') });
      const run = check(missing, TASK_PATH);
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('bug-904');
    });
  });
});

describe('task-358 AC 2 (b) — hasRetrospectiveEntry(markdown), the pure predicate (D2 (b))', () => {
  const NOTES = '## Execution Notes\n\n<!-- Filled by the dev-loop. -->\n\n### Retrospective\n\n';
  const COMMENT = '<!-- Notes for the release\'s retrospective.\n     "None" is a valid entry. -->\n';

  it('true for "None." under ## Execution Notes', () => {
    expect(load().hasRetrospectiveEntry(`${NOTES}${COMMENT}\n- None.\n`)).toBe(true);
  });

  it('true for the task template with one entry appended', () => {
    expect(load().hasRetrospectiveEntry(withEntry(TEMPLATES.task, '- None.'))).toBe(true);
  });

  it('false for the template\'s comment alone', () => {
    expect(load().hasRetrospectiveEntry(`${NOTES}${COMMENT}`)).toBe(false);
    expect(load().hasRetrospectiveEntry(TEMPLATES.task)).toBe(false);
  });

  it('false with no ### Retrospective heading', () => {
    expect(load().hasRetrospectiveEntry('## Execution Notes\n\n- design: done.\n')).toBe(false);
  });

  it('false when the heading is outside ## Execution Notes', () => {
    expect(load().hasRetrospectiveEntry('## Description\n\n### Retrospective\n\n- None.\n\n## Execution Notes\n\n- design: done.\n')).toBe(false);
  });
});

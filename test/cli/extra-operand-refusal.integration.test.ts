/**
 * task-129-refuse-operand-beyond-command-declares-exit-2-before (`bug-171`, `bug-131`) — through the
 * compiled CLI, in a throwaway repository scaffolded by the real `wingfoil init`: every command takes
 * at most the one positional it declares (`dl-082-cli-parameter-shape`), and an operand beyond it is
 * refused at exit `2` (`spec-005-cli-command-contract` §1), with a message naming the command and the
 * count, before anything is written.
 *
 * The sweep is derived from `CORE_MODULES` (`enumerateOperations`), never from a hand-copied list, so a
 * command registered later is covered without editing this file. Each command gets one operand more
 * than it declares; the repository's HEAD and working tree must be unchanged afterwards.
 *
 * The headline case is `bug-171`'s reproduction verbatim: two `pending` tasks, an approver identity, and
 * `memory approve <first> <second> --reason x`, which approved the first, ignored the second and
 * exited `0` — the scenario `P5.1.4-cli-ux.feature` states as "an operand beyond the one a command
 * declares is refused".
 *
 * `spawnSync`, not `execFileSync` + `catch` (see `./dirty-target-refusal.integration.test.ts`): stderr
 * is read back even when the exit code is `0`. `dist/` is built once by `test/global-setup.cjs`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import { deriveVerb, enumerateOperations } from '../../src/core/registry';
import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');

function runCli(repo: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function statusOf(repo: string, relativePath: string): string {
  return /^status:\s*"?([A-Za-z0-9-]+)"?\s*$/m.exec(readFileSync(join(repo, relativePath), 'utf-8'))?.[1] ?? '';
}

/** HEAD plus the porcelain status: equal before and after means nothing was committed or written. */
function snapshot(repo: string): string {
  return `${git(repo, ['rev-parse', 'HEAD']).trim()}\n${git(repo, ['status', '--porcelain', '--untracked-files=all'])}`;
}

const COMMANDS = enumerateOperations(CORE_MODULES).map(({ module, operation }) => {
  const verb = deriveVerb(module.name, operation.name);
  const name = verb ? `${module.name} ${verb}` : module.name;
  const operands = operation.positional ? ['first-operand', 'second-operand'] : ['first-operand'];
  return { name, args: [...name.split(' '), ...operands], count: operands.length };
});

describe('an operand beyond the one a command declares is refused at exit 2, before any write (task-129)', () => {
  let repo: string;
  const tasks: { id: string; path: string }[] = [];

  beforeAll(() => {
    expect(existsSync(CLI)).toBe(true);
    repo = makeTempGitRepo();
    const init = runCli(repo, ['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
    // The approver role for the fixture identity, as `./fresh-init-transitions.test.ts` grants it.
    const dnaPath = join(repo, '.wingfoil', 'dna.yaml');
    const member = '  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [approver]';
    writeFileSync(dnaPath, readFileSync(dnaPath, 'utf-8').replace('  members: []', member), 'utf-8');
    git(repo, ['commit', '--quiet', '-am', 'configure approver']);
    for (const title of ['First task', 'Second task']) {
      const added = runCli(repo, ['memory', 'add', '--type', 'task', '--title', title, '--format', 'json']);
      if (added.status !== 0) throw new Error(`fixture bug: memory add failed — ${added.stderr}`);
      const task = JSON.parse(added.stdout) as { id: string; path: string };
      const submitted = runCli(repo, ['memory', 'submit', task.id]);
      if (submitted.status !== 0) throw new Error(`fixture bug: memory submit failed — ${submitted.stderr}`);
      tasks.push(task);
    }
  });

  afterAll(() => removeTempDir(repo));

  it('`memory approve <a> <b> --reason x` (bug-171) exits 2, names the command and the count, and approves neither', () => {
    const [first, second] = tasks;
    expect(statusOf(repo, first!.path)).toBe('pending');
    const before = snapshot(repo);

    const result = runCli(repo, ['memory', 'approve', first!.id, second!.id, '--reason', 'x']);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe('error: wingfoil memory approve takes one positional <id> (got 2 positionals)\n');
    expect(result.stdout).toBe('');
    expect(snapshot(repo)).toBe(before);
    expect(statusOf(repo, first!.path)).toBe('pending');
    expect(statusOf(repo, second!.path)).toBe('pending');
  });

  it('`workflow list x` and `directives list developer` exit 2 (bug-131)', () => {
    const workflow = runCli(repo, ['workflow', 'list', 'sw-life-cycle']);
    expect([workflow.status, workflow.stderr]).toEqual([2, 'error: wingfoil workflow list takes no positional (got 1 positional)\n']);
    const directives = runCli(repo, ['directives', 'list', 'developer']);
    expect([directives.status, directives.stderr]).toEqual([2, 'error: wingfoil directives list takes no positional (got 1 positional)\n']);
  });

  it('the sweep covers every registered command (guard against a vacuous table)', () => {
    expect(COMMANDS.length).toBeGreaterThanOrEqual(18);
  });

  it.each(COMMANDS.map(({ name, args, count }) => [name, args, count] as const))(
    '`wingfoil %s` with one operand too many',
    (name, args, count) => {
      const before = snapshot(repo);

      const result = runCli(repo, args);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`wingfoil ${name} takes `);
      expect(result.stderr).toContain(`(got ${count} positional${count === 1 ? '' : 's'})`);
      expect(snapshot(repo)).toBe(before);
    },
  );

  // bug-179 (task-165): the two bootstrap commands are wired by hand outside `CORE_MODULES`, so the
  // sweep above cannot reach them; they refused a surplus at exit 2 in Commander's own wording
  // (`too many arguments for 'init'`). They now give the shared refusal, before the root is resolved.
  it.each([['init'], ['mcp']] as const)('`wingfoil %s extra` gives the shared refusal (bug-179)', (name) => {
    const before = snapshot(repo);

    const result = runCli(repo, [name, 'extra']);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(`error: wingfoil ${name} takes no positional (got 1 positional)\n`);
    expect(snapshot(repo)).toBe(before);
  });

  it('`dna set`\'s migration message is unchanged (characterization)', () => {
    const result = runCli(repo, ['dna', 'set', 'project.name', 'bogus', '--value', 'y']);
    expect([result.status, result.stderr]).toEqual([
      2,
      'error: wingfoil dna set takes one positional <path>; the value travels in --value (got 2 positionals)\n',
    ]);
  });

  it('`dna set ..language python` still reports the malformed path first (P2.1-dna-set.feature)', () => {
    const result = runCli(repo, ['dna', 'set', '..language', 'python']);
    expect([result.status, result.stderr]).toEqual([2, "error: invalid key path: '..language'\n"]);
  });
});

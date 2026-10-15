/**
 * task-283 AC 1 (red-first, `bug-309`; REQ-PERF-03, `spec-017` §4.8 "Cost") — the number of git processes one
 * `workflow next` starts, pinned on a synthetic fixture at the value the batched reads reach: the snapshot's
 * commit resolved **once** and shared by every `…AtRev` loader, `memory.yaml` and `dna.yaml` read once each, the
 * Memory templates and the directives each read through **one** `git cat-file --batch` (as `0fa5c0f1` did for the
 * workflow files, 27 → 3 `cat-file` spawns).
 *
 * **Observable.** The git processes started by one call of the registered `workflowNext` `CoreFn` (the operation
 * the CLI dispatches to, as `test/core/workflow-next.test.ts` calls it), counted with spies on
 * `child_process.spawnSync` / `execFileSync` that call through. Only calls whose file is `'git'` count; the leading
 * `-C <root>` is dropped. Nothing is timed here, so this file does not import `test/core/helpers/latency.ts`
 * (`test/core/latency-budget-placement.test.ts` rule 2).
 *
 * **Fixture.** Built in this file at `HEAD`: a `memory.yaml` with typed `template:` files, `dna.yaml` (one
 * `paths.runs` directory), `roles.yaml`, directives under `.wingfoil/directives/custom/`, a `workflows.yaml` including two
 * files, `bindings.yaml`, and one open `release-cycle` instance plan whose next step (`dev-loop.start`) has a role,
 * so `roles.yaml` and the directives are read. The history walk re-enters no element (a re-entry adds one
 * `log -1` per element and one bracketless `cat-file`, §4.8).
 *
 * The pinned clone's 47 → 18 (`b56e8721`) is recorded by the developer's wrapper probe in the task's Execution
 * Notes, not asserted here: a `b56e8721` clone inside `npm test` would need full history in every checkout.
 */
// The module object itself (not a namespace copy, whose bindings are read-only), so a spy replaces the function
// every `src/` caller looks up at call time.
import childProcess from 'child_process';

import { CORE_MODULES } from '../../src/core';
import type { NextResult } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const TEMPLATE = (type: string): string =>
  `---\nid: ""\ntype: ${type}\ntitle: ""\nstatus: draft\ncodename: ""\nbug: []\nworkflow: ""\nphase: ""\nelement: ""\n---\n\n## Body\n`;

/** Two types carry a `template:` (the base fixture); {@link EXTENDED_MEMORY_YAML} adds a third. */
function memoryYaml(bugTemplate: boolean): string {
  const template = (type: string): string => `    template:\n      file: "memory/templates/${type}.md"\n      frontmatter:\n        required: [ title ]\n`;
  return `version: 1.0
types:
  release:
    path: "docs/releases/{id}.md"
${template('release')}    states:
      sequence: [ draft, planning, in-development, releasing, released ]
  task:
    path: "docs/tasks/{id}.md"
${template('task')}    states:
      sequence: [ draft, pending, backlog, in-progress, in-review, approved, done ]
      gates:
        pending:   { reject: draft }
        in-review: { reject: in-progress }
  bug:
    path: "docs/bugs/{id}.md"
${bugTemplate ? template('bug') : ''}    states:
      sequence: [ draft, open, triaged, planned, in-progress, in-review, resolved, closed ]
  plan:
    path: "docs/plans/{id}.md"
    states:
      sequence: [ draft, active, done ]
      waiting: [ active ]
`;
}

const BASE_MEMORY_YAML = memoryYaml(false);
const EXTENDED_MEMORY_YAML = memoryYaml(true);

const DNA_YAML = `version: 1.0
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Alex
      email: alex@example.invalid
      roles: [ developer ]
    - name: Morgan
      email: morgan@example.invalid
      roles: [ reviewer, approver, tech-lead ]
  roles:
    - name: developer
    - name: reviewer
    - name: approver
    - name: tech-lead
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer: [ testing ]
  reviewer: [ code-review ]
global: [ security ]
`;

function directive(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nBody of ${id}.\n`;
}

const BASE_DIRECTIVES = ['testing', 'code-review', 'security'];
const EXTRA_DIRECTIVES = ['architecture', 'determinism', 'traceability'];

const RELEASE_CYCLE = `name: release-cycle
startable: true
element: release
phases:
  - name: develop
    iterate_over: task
    where: { status: [ backlog ] }
    include: dev-loop
  - name: ship
    role: tech-lead
    actions:
      - 'cli.run(note: "{release.codename}")'
      - element.set_state(released)
`;

const DEV_LOOP = `name: dev-loop
includable: true
element: task
phases:
  - name: start
    role: developer
    actions:
      - 'git.create_branch(task: "{task.id}")'
      - element.set_state(in-progress)
      - 'bug.sync_state(for_each: task.bug)'
  - name: review
    role: reviewer
    actions:
      - memory.submit
    approval: { by_role: approver }
`;

const BINDINGS_YAML = `version: 1.0
actions:
  git.create_branch: { manual: true }
  cli.run: { manual: true }
`;

function element(type: string, id: string, status: string, extra = ''): string {
  return `---\nid: "${id}"\ntype: ${type}\ntitle: "${id}"\nstatus: ${status}\n${extra}---\n\n## Body\n`;
}

/** The fixture: configuration, elements, then the instance plan, each its own commit. */
function writeProject(root: string, extended: boolean): void {
  writeFixtureFile(root, '.wingfoil/workflows.yaml', 'version: 1.0\ninclude:\n  - workflows/custom/release-cycle.yaml\n  - workflows/custom/dev-loop.yaml\n');
  writeFixtureFile(root, '.wingfoil/workflows/custom/release-cycle.yaml', RELEASE_CYCLE);
  writeFixtureFile(root, '.wingfoil/workflows/custom/dev-loop.yaml', DEV_LOOP);
  writeFixtureFile(root, '.wingfoil/workflows/bindings.yaml', BINDINGS_YAML);
  writeFixtureFile(root, '.wingfoil/memory.yaml', extended ? EXTENDED_MEMORY_YAML : BASE_MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/memory/templates/release.md', TEMPLATE('release'));
  writeFixtureFile(root, '.wingfoil/memory/templates/task.md', TEMPLATE('task'));
  if (extended) writeFixtureFile(root, '.wingfoil/memory/templates/bug.md', TEMPLATE('bug'));
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', ROLES_YAML);
  for (const id of extended ? [...BASE_DIRECTIVES, ...EXTRA_DIRECTIVES] : BASE_DIRECTIVES) {
    writeFixtureFile(root, `.wingfoil/directives/custom/${id}.md`, directive(id));
  }
  commitAll(root, 'fixture configuration');
  writeFixtureFile(root, 'docs/releases/minor-1.md', element('release', 'minor-1', 'in-development', 'codename: ""\n'));
  writeFixtureFile(root, 'docs/tasks/task-1.md', element('task', 'task-1', 'backlog', 'bug: []\n'));
  commitAll(root, 'seed elements');
  writeFixtureFile(root, 'docs/plans/rc-1.md', element('plan', 'rc-1', 'active', 'workflow: "release-cycle"\nphase: "x"\nelement: "minor-1"\n'));
  commitAll(root, 'wf(plan): add rc-1');
}

function workflowNextFn(): CoreFn<unknown, NextResult> {
  const operation = CORE_MODULES.find((module) => module.name === 'workflow')?.operations['workflowNext'];
  if (!operation) throw new Error('fixture bug: "workflowNext" operation not registered on the workflow module');
  return operation.fn as CoreFn<unknown, NextResult>;
}

/** One git process: its arguments after `-C <root>`, and its stdin when given (the `cat-file --batch` requests). */
interface GitCall {
  readonly args: string[];
  readonly input: string;
}

/** Run one `workflow next` on `root`, recording every git process it starts (the spies call through). */
async function recordGitCalls(root: string): Promise<{ calls: GitCall[]; ok: boolean; commit: string }> {
  const calls: GitCall[] = [];
  const record = (file: unknown, args: unknown, options: unknown): void => {
    if (file !== 'git' || !Array.isArray(args)) return;
    const list = args.map(String);
    const rest = list[0] === '-C' ? list.slice(2) : list;
    const input = (options as { input?: unknown } | undefined)?.input;
    calls.push({ args: rest, input: input === undefined ? '' : String(input) });
  };
  const spawn = jest.spyOn(childProcess, 'spawnSync').mockImplementation(((file: string, args: string[], options: object) => {
    record(file, args, options);
    return realSpawnSync(file, args, options);
  }) as unknown as typeof childProcess.spawnSync);
  const exec = jest.spyOn(childProcess, 'execFileSync').mockImplementation(((file: string, args: string[], options: object) => {
    record(file, args, options);
    return realExecFileSync(file, args, options);
  }) as unknown as typeof childProcess.execFileSync);
  try {
    const outcome = (await workflowNextFn()({ root })) as CoreResult<NextResult>;
    return { calls, ok: outcome.ok, commit: outcome.ok ? outcome.value.baseline.commit : '' };
  } finally {
    spawn.mockRestore();
    exec.mockRestore();
  }
}

const realSpawnSync = childProcess.spawnSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;
const realExecFileSync = childProcess.execFileSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;

/** The git subcommand of a call, past any leading `-c <key>=<value>` (the history walk's `-c core.quotePath=false log`). */
function subcommandOf(call: GitCall): string {
  let index = 0;
  while (call.args[index] === '-c') index += 2;
  return call.args[index] ?? '';
}

function bySubcommand(calls: readonly GitCall[], subcommand: string): GitCall[] {
  return calls.filter((call) => subcommandOf(call) === subcommand);
}

function describeCalls(calls: readonly GitCall[]): string {
  return calls.map((call) => `git ${call.args.join(' ')}${call.input === '' ? '' : ` <<< ${JSON.stringify(call.input)}`}`).join('\n');
}

describe('task-283 AC 1 — the git spawns of one workflow next, on a synthetic fixture (bug-309, spec-017 §4.8)', () => {
  let base: string;
  let extended: string;
  let baseRun: { calls: GitCall[]; ok: boolean; commit: string };
  let extendedRun: { calls: GitCall[]; ok: boolean; commit: string };
  let sha: string;

  beforeAll(async () => {
    base = makeTempGitRepo();
    writeProject(base, false);
    extended = makeTempGitRepo();
    writeProject(extended, true);
    sha = git(base, ['rev-parse', 'HEAD']).trim();
    baseRun = await recordGitCalls(base);
    extendedRun = await recordGitCalls(extended);
  });

  afterAll(() => {
    removeTempDir(base);
    removeTempDir(extended);
  });

  it('the fixture answers: workflow next reports a step at HEAD', () => {
    expect({ ok: baseRun.ok, commit: baseRun.commit }).toEqual({ ok: true, commit: sha });
    expect(extendedRun.ok).toBe(true);
  });

  it('(a) the snapshot commit is resolved by exactly 1 rev-parse, and no other git call names HEAD', () => {
    const revParse = bySubcommand(baseRun.calls, 'rev-parse');
    expect({ count: revParse.length, calls: describeCalls(revParse) }).toEqual({ count: 1, calls: describeCalls(revParse.slice(0, 1)) });
    const others = baseRun.calls.filter((call) => subcommandOf(call) !== 'rev-parse');
    expect(describeCalls(others.filter((call) => /HEAD/.test(call.args.join(' ') + call.input)))).toBe('');
  });

  it('(a) every revision-reading call names the resolved sha (show, cat-file requests, ls-tree)', () => {
    const offSha = baseRun.calls.filter((call) => {
      if (subcommandOf(call) === 'show' || subcommandOf(call) === 'ls-tree') return !call.args.some((arg) => arg.startsWith(sha));
      if (subcommandOf(call) === 'cat-file') return !call.input.split('\n').filter((line) => line !== '').every((line) => line.startsWith(`${sha}:`));
      return false;
    });
    expect(describeCalls(offSha)).toBe('');
  });

  it('(b) exactly 3 git show, of memory.yaml, dna.yaml and roles.yaml at the sha; none of a directive or a template', () => {
    expect(bySubcommand(baseRun.calls, 'show').map((call) => call.args.slice(1).join(' '))).toEqual([
      `${sha}:.wingfoil/memory.yaml`,
      `${sha}:.wingfoil/dna.yaml`,
      `${sha}:.wingfoil/roles.yaml`,
    ]);
  });

  it('(c) exactly 5 git cat-file --batch: manifest, included files + bindings, templates, Memory documents, directives', () => {
    const catFile = bySubcommand(baseRun.calls, 'cat-file');
    expect({ count: catFile.length, calls: describeCalls(catFile) }).toEqual({ count: 5, calls: expect.any(String) });
    const requested = catFile.flatMap((call) => call.input.split('\n').filter((line) => line !== '').map((line) => line.slice(sha.length + 1)));
    for (const path of ['.wingfoil/memory/templates/release.md', '.wingfoil/memory/templates/task.md', ...BASE_DIRECTIVES.map((id) => `.wingfoil/directives/custom/${id}.md`)]) {
      expect(requested).toContain(path);
    }
  });

  it('(d) invariance: 3 more directives and 1 more template type start no more git processes', () => {
    expect({ total: extendedRun.calls.length, calls: describeCalls(extendedRun.calls) }).toEqual({ total: baseRun.calls.length, calls: expect.any(String) });
  });

  /**
   * (e) The exact total on the base fixture, from the design's formula:
   *   rev-parse 1 + show 3 + cat-file 5 + ls-tree (Memory content roots + 2) + log 2 + merge-base 1
   *   + status (one per `paths.runs` directory, plus one).
   * This fixture's Memory content roots are `docs/bugs`, `docs/plans`, `docs/releases`, `docs/tasks` (4), so ls-tree
   * is 4 + 2 = 6 (the roots, the full tree, `.wingfoil/directives`); `dna.yaml` declares one `paths.runs` directory
   * (`docs/runs/`), so status is 1 + 1 = 2; log 2 is the start lookup (`-c core.quotePath=false log --diff-filter=A`)
   * and the history walk. Total 1 + 3 + 5 + 6 + 2 + 1 + 2 = **20**. The current code makes 34 on this fixture:
   * rev-parse 10, show 10, cat-file 3, ls-tree 6, log 2, merge-base 1, status 2 (the red run in the task's
   * Execution Notes); the four subcommands the cuts do not touch already make the counts pinned here.
   */
  it('(e) exactly 20 git processes per call on the base fixture', () => {
    const counts: Record<string, number> = {};
    for (const call of baseRun.calls) counts[subcommandOf(call)] = (counts[subcommandOf(call)] ?? 0) + 1;
    expect({ total: baseRun.calls.length, counts }).toEqual({
      total: 20,
      counts: { 'rev-parse': 1, show: 3, 'cat-file': 5, 'ls-tree': 6, log: 2, 'merge-base': 1, status: 2 },
    });
  });
});

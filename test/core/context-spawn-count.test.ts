/**
 * task-379 AC 3 (`bug-381`, REQ-SYS-07, `spec-012` §9) — the git processes one `assembleExecutionContext` starts: the
 * `stateRef` resolved once, `memory.yaml`, `dna.yaml` and `roles.yaml` read once each, and the directive bodies read
 * in one batch, so the total does not grow with the number of directives.
 *
 * **Observable.** Spies on `child_process.spawnSync` / `execFileSync` that call through, as
 * `test/core/workflow-next-spawn-count.test.ts` does. Only calls whose file is `'git'` count; the leading `-C <root>`
 * is dropped. Nothing is timed here.
 *
 * **Fixture.** One Memory content root, one element and D directives bound to the role, at `HEAD`.
 */
// The module object itself (not a namespace copy, whose bindings are read-only), so a spy replaces the function
// every `src/` caller looks up at call time.
import childProcess from 'child_process';

import { assembleExecutionContext, type ContextRequest } from '../../src/core/context';
import type { CoreResult } from '../../src/core/types';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
`;

const DNA_YAML = `version: 1.1
project:
  name: Fixture
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
  methodologies:
    - name: TDD
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: developer
paths:
  sources: [ src/ ]
`;

const ELEMENT_ID = 'task-001-active';

function directiveMd(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nBody of ${id}.\n`;
}

function directiveIds(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => `directive-${index + 1}`);
}

function writeProject(root: string, directives: number): void {
  const ids = directiveIds(directives);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', `version: 1.0\nassignments:\n  developer: [ ${ids.join(', ')} ]\nglobal: []\n`);
  for (const id of ids) writeFixtureFile(root, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  writeFixtureFile(root, `docs/04_memory/v0.2/${ELEMENT_ID}.md`, `---\nid: ${ELEMENT_ID}\ntype: task\nrelease: "v0.2"\nstatus: backlog\n---\n\nBody.\n`);
  commitAll(root, 'fixture');
}

/** One git process: its arguments after `-C <root>`. */
type GitCall = readonly string[];

const realSpawnSync = childProcess.spawnSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;
const realExecFileSync = childProcess.execFileSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;

/** Run one assembly on `root`, recording every git process it starts (the spies call through). */
function recordGitCalls(root: string, element: ContextRequest['element']): { calls: GitCall[]; outcome: CoreResult<unknown> } {
  const calls: GitCall[] = [];
  const record = (file: unknown, args: unknown): void => {
    if (file !== 'git' || !Array.isArray(args)) return;
    const list = args.map(String);
    calls.push(list[0] === '-C' ? list.slice(2) : list);
  };
  const spawn = jest.spyOn(childProcess, 'spawnSync').mockImplementation(((file: string, args: string[], options: object) => {
    record(file, args);
    return realSpawnSync(file, args, options);
  }) as unknown as typeof childProcess.spawnSync);
  const exec = jest.spyOn(childProcess, 'execFileSync').mockImplementation(((file: string, args: string[], options: object) => {
    record(file, args);
    return realExecFileSync(file, args, options);
  }) as unknown as typeof childProcess.execFileSync);
  try {
    return { calls, outcome: assembleExecutionContext(root, { role: 'developer', element, stateRef: 'HEAD' }) };
  } finally {
    spawn.mockRestore();
    exec.mockRestore();
  }
}

function bySubcommand(calls: readonly GitCall[], subcommand: string): GitCall[] {
  return calls.filter((call) => call[0] === subcommand);
}

function describeCalls(calls: readonly GitCall[]): string {
  return calls.map((call) => `git ${call.join(' ')}`).join('\n');
}

describe('task-379 AC 3 — the git spawns of one assembleExecutionContext (bug-381)', () => {
  const present = { type: 'task', id: ELEMENT_ID };
  let three: string;
  let six: string;
  let sha: string;
  let threeRun: ReturnType<typeof recordGitCalls>;
  let sixRun: ReturnType<typeof recordGitCalls>;
  let absentRun: ReturnType<typeof recordGitCalls>;

  beforeAll(() => {
    three = makeTempGitRepo();
    writeProject(three, 3);
    six = makeTempGitRepo();
    writeProject(six, 6);
    sha = git(three, ['rev-parse', 'HEAD']).trim();
    threeRun = recordGitCalls(three, present);
    sixRun = recordGitCalls(six, present);
    absentRun = recordGitCalls(three, { type: 'task', id: 'task-999-absent' });
  });

  afterAll(() => {
    removeTempDir(three);
    removeTempDir(six);
  });

  it('the fixture answers: both assemblies build, and an absent element is NOT_FOUND', () => {
    expect(threeRun.outcome.ok).toBe(true);
    expect(sixRun.outcome.ok).toBe(true);
    expect(absentRun.outcome).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it("(a) stateRef 'HEAD' is resolved by exactly 1 rev-parse", () => {
    const revParse = bySubcommand(threeRun.calls, 'rev-parse');
    expect({ count: revParse.length, calls: describeCalls(revParse) }).toEqual({ count: 1, calls: describeCalls(revParse.slice(0, 1)) });
  });

  it('(b) exactly 3 git show with 3 directives, of memory.yaml, dna.yaml and roles.yaml at the sha', () => {
    expect(bySubcommand(threeRun.calls, 'show').map((call) => call[1]).sort()).toEqual(
      [`${sha}:.wingfoil/dna.yaml`, `${sha}:.wingfoil/memory.yaml`, `${sha}:.wingfoil/roles.yaml`],
    );
  });

  it('(c) exactly 4 git cat-file --batch', () => {
    const catFile = bySubcommand(threeRun.calls, 'cat-file');
    expect(catFile.every((call) => call.includes('--batch'))).toBe(true);
    expect({ count: catFile.length, calls: describeCalls(catFile) }).toEqual({ count: 4, calls: expect.any(String) });
  });

  it('(d) exactly 10 git processes with 3 directives', () => {
    expect({ total: threeRun.calls.length, calls: describeCalls(threeRun.calls) }).toEqual({ total: 10, calls: expect.any(String) });
  });

  it('(d) exactly 10 git processes with 6 directives', () => {
    expect({ total: sixRun.calls.length, calls: describeCalls(sixRun.calls) }).toEqual({ total: 10, calls: expect.any(String) });
  });

  it('(e) every show and ls-tree names the full sha rev-parse answered', () => {
    const reads = [...bySubcommand(threeRun.calls, 'show'), ...bySubcommand(threeRun.calls, 'ls-tree')];
    expect(reads.length).toBeGreaterThan(0);
    expect(describeCalls(reads.filter((call) => !call.some((arg) => arg.startsWith(sha))))).toBe('');
  });

  it('(f) exactly 1 rev-parse when the element is absent', () => {
    const revParse = bySubcommand(absentRun.calls, 'rev-parse');
    expect({ count: revParse.length, calls: describeCalls(revParse) }).toEqual({ count: 1, calls: describeCalls(revParse.slice(0, 1)) });
  });
});

/**
 * task-379 AC 3 (red-first, `bug-381`; `spec-012` §9) — the git processes one `assembleExecutionContext` starts:
 * `stateRef` is resolved to its commit once, every read names that commit, and the bodies of the resolved
 * directives are read in one batch, so the total does not grow with the number of directives.
 *
 * **Observable.** Spies on `child_process.spawnSync` / `execFileSync` that call through, as
 * `test/core/workflow-next-spawn-count.test.ts` does. Only calls whose file is `'git'` count; the leading
 * `-C <root>` is dropped. Nothing is timed.
 *
 * **Fixture.** One Memory content root, one element, one linked document, and D directives bound to the role.
 */
// The module object itself (not a namespace copy, whose bindings are read-only), so a spy replaces the function
// every `src/` caller looks up at call time.
import childProcess from 'child_process';

import { assembleExecutionContext, type ContextRequest } from '../../src/core/context';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const MEMORY_YAML = `
version: 1.1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
`;

const DNA_YAML = `
version: 1.1
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

function taskMd(id: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, 'type: task', 'release: "v0.2"', 'status: backlog', ...extra, '---', '', `Body of ${id}.`, ''].join('\n');
}

function directiveMd(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nBody of ${id}.\n`;
}

function writeProject(root: string, directives: number): void {
  const ids = Array.from({ length: directives }, (_, index) => `directive-${index + 1}`);
  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, '.wingfoil/roles.yaml', `version: 1.0\nassignments:\n  developer: [ ${ids.join(', ')} ]\nglobal: []\n`);
  for (const id of ids) writeFixtureFile(root, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  writeFixtureFile(root, `docs/04_memory/v0.2/${ELEMENT_ID}.md`, taskMd(ELEMENT_ID, ['depends_on: [task-002-linked]']));
  writeFixtureFile(root, 'docs/04_memory/v0.2/task-002-linked.md', taskMd('task-002-linked'));
  commitAll(root, 'seed');
}

/** One git process: its arguments after `-C <root>`. */
type GitCall = readonly string[];

const realSpawnSync = childProcess.spawnSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;
const realExecFileSync = childProcess.execFileSync.bind(childProcess) as (file: string, args: string[], options: object) => unknown;

/** Assemble one context on `root`, recording every git process it starts (the spies call through). */
function recordAssembly(root: string, request: ContextRequest): { calls: GitCall[]; result: ReturnType<typeof assembleExecutionContext> } {
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
    return { calls, result: assembleExecutionContext(root, request) };
  } finally {
    spawn.mockRestore();
    exec.mockRestore();
  }
}

/** The git subcommand of a call, past any leading `-c <key>=<value>`. */
function subcommandOf(call: GitCall): string {
  let index = 0;
  while (call[index] === '-c') index += 2;
  return call[index] ?? '';
}

function bySubcommand(calls: readonly GitCall[], subcommand: string): GitCall[] {
  return calls.filter((call) => subcommandOf(call) === subcommand);
}

function countsOf(calls: readonly GitCall[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of calls) counts[subcommandOf(call)] = (counts[subcommandOf(call)] ?? 0) + 1;
  return counts;
}

describe('task-379 AC 3 — the git spawns of one execution context (bug-381, spec-012 §9)', () => {
  const REQUEST: ContextRequest = { role: 'developer', element: { type: 'task', id: ELEMENT_ID }, stateRef: 'HEAD' };
  let three: string;
  let six: string;
  let sha: string;
  let threeRun: ReturnType<typeof recordAssembly>;
  let sixRun: ReturnType<typeof recordAssembly>;

  beforeAll(() => {
    three = makeTempGitRepo();
    writeProject(three, 3);
    six = makeTempGitRepo();
    writeProject(six, 6);
    sha = git(three, ['rev-parse', 'HEAD']).trim();
    threeRun = recordAssembly(three, REQUEST);
    sixRun = recordAssembly(six, REQUEST);
  });

  afterAll(() => {
    removeTempDir(three);
    removeTempDir(six);
  });

  it('the fixture answers: both assemblies build a context', () => {
    expect({ three: threeRun.result.ok, six: sixRun.result.ok }).toEqual({ three: true, six: true });
  });

  it("(a) stateRef 'HEAD' is resolved by exactly 1 rev-parse", () => {
    expect(bySubcommand(threeRun.calls, 'rev-parse')).toHaveLength(1);
  });

  it('(b) exactly 3 git show with 3 directives: memory.yaml, dna.yaml and roles.yaml at the sha', () => {
    const shown = bySubcommand(threeRun.calls, 'show').map((call) => call.slice(1).join(' ')).sort();
    expect(shown).toEqual([`${sha}:.wingfoil/dna.yaml`, `${sha}:.wingfoil/memory.yaml`, `${sha}:.wingfoil/roles.yaml`]);
  });

  it('(c) exactly 4 git cat-file --batch: the scan, the directive listing, the bodies, the written frontmatter', () => {
    expect(bySubcommand(threeRun.calls, 'cat-file').filter((call) => call.includes('--batch'))).toHaveLength(4);
  });

  it('(d) 10 git processes with 3 directives', () => {
    expect({ total: threeRun.calls.length, counts: countsOf(threeRun.calls) }).toEqual({
      total: 10,
      counts: { 'rev-parse': 1, show: 3, 'cat-file': 4, 'ls-tree': 2 },
    });
  });

  it('(d) 10 git processes with 6 directives: the total does not grow with the directives', () => {
    expect({ total: sixRun.calls.length, counts: countsOf(sixRun.calls) }).toEqual({
      total: 10,
      counts: { 'rev-parse': 1, show: 3, 'cat-file': 4, 'ls-tree': 2 },
    });
  });

  it('(e) characterization: every show and ls-tree names the full sha rev-parse answered', () => {
    const reads = [...bySubcommand(threeRun.calls, 'show'), ...bySubcommand(threeRun.calls, 'ls-tree')];
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter((call) => !call.some((arg) => arg.includes(sha)))).toEqual([]);
  });

  it('(f) an absent element answers NOT_FOUND after exactly 1 rev-parse', () => {
    const { calls, result } = recordAssembly(three, { ...REQUEST, element: { type: 'task', id: 'task-404-absent' } });
    expect(result.ok ? 'ok' : result.error.code).toBe('NOT_FOUND');
    expect(bySubcommand(calls, 'rev-parse')).toHaveLength(1);
  });
});

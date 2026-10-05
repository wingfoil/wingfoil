/**
 * task-030-implement-mcp-resources (P5.2.1, spec-014-mcp-server-entry-point §1) — `runMcp`, the
 * `wingfoil mcp` command handler. Mirrors `test/cli/init-command.test.ts`: the side-effecting server
 * start is INJECTED, so the resolve-root / error / exit path is asserted without ever opening a real
 * `StdioServerTransport` against a repo (HARD RULE — no real stdio server in a test). The production
 * `startMcpServer` is only wired as the default `deps.start`; here it is always overridden.
 *
 * task-174 (`bug-035`, `dl-049` (b)): the pre-flight also refuses a git root with no `.wingfoil/`,
 * with the shared not-initialized message (`WINGFOIL_NOT_INITIALIZED`, task-143), and reads the DNA
 * role set the Prompts channel serves for the server's whole life.
 */
import { WINGFOIL_NOT_INITIALIZED } from '../../src/core';
import { runMcp, type McpCliDeps } from '../../src/cli/mcp-command';
import { createMcpServer } from '../../src/mcp/server';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const DNA_YAML = `
version: 1.1
project:
  name: "Fixture Project"
modules:
  - name: mcp-server
    path: src/mcp
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Test User
      roles: [ developer ]
  roles:
    - name: reviewer
    - name: developer
paths:
  sources: [ src/ ]
`;

/** An initialized project: a git root with a `.wingfoil/dna.yaml` declaring two roles. */
function seedProject(dna: string = DNA_YAML): string {
  const root = makeTempGitRepo();
  writeFixtureFile(root, '.wingfoil/dna.yaml', dna);
  commitAll(root, 'seed task-174 mcp pre-flight fixture');
  return root;
}

describe('runMcp — the `wingfoil mcp` command handler (spec-014 §1)', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let startCalls: Array<{ root: string; roles: readonly string[]; name: string; version: string }>;
  let project: string;

  beforeAll(() => {
    project = seedProject();
  });
  afterAll(() => removeTempDir(project));

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    startCalls = [];
  });
  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function deps(over: Partial<McpCliDeps> = {}): McpCliDeps {
    return {
      resolveRoot: () => project,
      version: '1.2.3',
      start: async (options) => {
        startCalls.push({ root: options.resolveRoot(), roles: options.roles, name: options.name, version: options.version });
        return undefined;
      },
      ...over,
    };
  }

  function emitted(): string {
    return stderrSpy.mock.calls.map((call) => String(call[0])).join('');
  }

  it('starts the server with the resolved root, the DNA role set, the wingfoil name, and the given version — no exit, no error', async () => {
    await runMcp(deps());

    expect(startCalls).toEqual([{ root: project, roles: ['reviewer', 'developer'], name: 'wingfoil', version: '1.2.3' }]);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('when the project root cannot be resolved, emits an error and exits 1 without ever starting the server', async () => {
    await runMcp(
      deps({
        resolveRoot: () => {
          throw new Error('not a git repository');
        },
      }),
    );

    expect(startCalls).toEqual([]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(emitted()).toContain('not a git repository');
  });

  // task-174 (`bug-035`): a git root that never ran `wingfoil init` used to start, and every read then
  // leaked a raw ENOENT with an absolute path. The pre-flight now refuses it with the shared message.
  it.each([
    ['console', `error: ${WINGFOIL_NOT_INITIALIZED}\n`],
    ['json', `${JSON.stringify({ error: WINGFOIL_NOT_INITIALIZED })}\n`],
  ] as const)(
    'with --format %s, a git root with no .wingfoil/ exits 1 with the not-initialized message, naming no path, before any start',
    async (format, expected) => {
      const bare = makeTempGitRepo();
      try {
        await runMcp(deps({ resolveRoot: () => bare, format }));

        expect(startCalls).toEqual([]);
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(emitted()).toBe(expected);
        expect(emitted()).not.toContain(bare);
      } finally {
        removeTempDir(bare);
      }
    },
  );

  it('a .wingfoil/ whose dna.yaml is invalid refuses the start with the loader reason (dl-049 (b): the role set is read here)', async () => {
    const broken = seedProject('version: 1.1\nteam: [ not, a, mapping ]\n');
    try {
      await runMcp(deps({ resolveRoot: () => broken }));

      expect(startCalls).toEqual([]);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(emitted()).toMatch(/^error: /);
    } finally {
      removeTempDir(broken);
    }
  });

  // The real production server is built from what the pre-flight read, and building it reads nothing
  // (spec-014 §2): `start` builds it with createMcpServer but never opens stdio.
  it('the role set the pre-flight read is what the real production server is built with', async () => {
    let built = 0;
    await runMcp(
      deps({
        start: async (options) => {
          createMcpServer(options);
          built += 1;
          startCalls.push({ root: options.resolveRoot(), roles: options.roles, name: options.name, version: options.version });
        },
      }),
    );

    expect(built).toBe(1);
    expect(startCalls[0]?.roles).toEqual(['reviewer', 'developer']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('the injected start receives a resolveRoot that returns the already-resolved root (resolved once, up front)', async () => {
    let resolveCount = 0;
    await runMcp(
      deps({
        resolveRoot: () => {
          resolveCount += 1;
          return project;
        },
      }),
    );
    // The pre-flight resolves the root exactly once; the closure handed to start returns that value.
    expect(resolveCount).toBe(1);
    expect(startCalls).toEqual([{ root: project, roles: ['reviewer', 'developer'], name: 'wingfoil', version: '1.2.3' }]);
  });
});

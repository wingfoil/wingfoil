/**
 * task-218 — `wingfoil agent execute --element`, the pre-launch half (`spec-016-agent-execution` §3.1,
 * §3.2 steps 2–6, §3.3 steps 1–12, §3.7 up to `NO_TERMINAL`), on the compiled CLI with the fake adapter
 * (`test/fixtures/agents/`, task-200) and no terminal: under Jest the child's stdin and stdout are pipes.
 *
 * What is asserted:
 * - every §3.7 row from "element absent" to `NO_TERMINAL` is reached: exit `1`, its message, nothing on
 *   stdout, nothing written to the repository (`git status --porcelain`, `HEAD` and the bytes of every
 *   path git reports are unchanged), and nothing left in the temporary directory (`TMPDIR`);
 * - the usage errors: no flag at all, a malformed element-ref, and the v0.4 `--resume` / `--ref`, all
 *   exit `2`;
 * - the `developer` default and its `warning:` line (P5.3.1 sc. 2, with a full id);
 * - `dl-050` option 4: the role's §5.1 directive warnings on stderr, in order, before the MCP pre-flight's
 *   refusal, and nothing on stdout, under `console` and `json`;
 * - the bootstrap of §2.4, carried by the `--dry-run` launch plan: the template's bytes for
 *   `(role, element, run id, state_ref)`, the same on two runs from one `HEAD`, and its handoff line
 *   chosen by the type template's `## Execution Notes` heading;
 * - the MCP pre-flight passes against the running build while the project's own `.mcp.json` registers a
 *   `wingfoil` server that cannot start, and the file is left byte for byte as it was (§2.5).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { CLI_ENTRY } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const AGENTS_FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'agents');
const FAKE_SCRIPT_REL = 'test/fixtures/agents/fake-agent.cjs';

const TASK_ID = 'task-202-explicit-override';
const BUG_ID = 'bug-007-handoff-fallback';
const TASK_REF = `task:${TASK_ID}`;

const DNA_YAML = `version: 1
project:
  name: Fixture
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
      email: wf-test@example.com
      roles: [ approver ]
  roles:
    - name: developer
    - name: reviewer
    - name: qa
    - name: approver
  agents:
    - name: Fake Agent
      email: fake-agent@example.com
      executes_as: [ developer, reviewer, approver ]
      approval_authority: false
      adapter: fake
    - name: Plain Agent
      email: plain-agent@example.com
      executes_as: [ developer ]
paths:
  sources: [ src/ ]
  runs: [ docs/runs/ ]
`;

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/04_memory/{release}/{id}.md"
    id_pattern: "task-{n}-{slug}"
    template:
      file: "memory/templates/task.md"
      frontmatter:
        required: [ title ]
  bug:
    path: "docs/04_memory/bugs/{id}.md"
    id_pattern: "bug-{n}-{slug}"
    template:
      file: "memory/templates/bug.md"
      frontmatter:
        required: [ title ]
`;

const ROLES_YAML = `version: 1.0
assignments:
  developer:
    - testing
  reviewer:
    - code-review
global:
  - doc-versioning
`;

const TASK_TEMPLATE = '---\nid: ""\ntype: task\ntitle: ""\nstatus: draft\n---\n\n## Description\n\n## Execution Notes\n';
const BUG_TEMPLATE = '---\nid: ""\ntype: bug\ntitle: ""\nstatus: draft\n---\n\n## Summary\n\n## Triage & Execution Notes\n';

function directiveMd(id: string): string {
  return `---\nid: ${id}\nname: "${id}"\ntype: directive\nkind: custom\ntitle: "${id}"\n---\n\n# ${id}\n\nRule body of ${id}.\n`;
}

function elementMd(type: string, id: string, body: string): string {
  // A shared tag makes the elements relevant to each other (spec-012 §6), so no context has the
  // "no relevant Memory" note and the warnings a test expects are only its own.
  return ['---', `id: ${id}`, `type: ${type}`, `title: "${id}"`, 'release: "v0.1"', 'status: draft', 'tags: [ context ]', '---', '', body, ''].join('\n');
}

/** A manifest derived from the fake's: `fake.yaml` with its `name` and, optionally, other lines replaced. */
function manifest(name: string, edit: (text: string) => string = (text) => text): string {
  const fake = readFileSync(join(AGENTS_FIXTURES, 'custom', 'fake.yaml'), 'utf-8');
  return edit(fake.replace(/^name: fake$/m, `name: ${name}`));
}

/** A project the fake adapter can be selected in; `tweak` edits the tree before the one commit. */
function seed(tweak: (repo: string) => void = () => undefined): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(repo, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(repo, '.wingfoil/roles.yaml', ROLES_YAML);
  writeFixtureFile(repo, '.wingfoil/memory/templates/task.md', TASK_TEMPLATE);
  writeFixtureFile(repo, '.wingfoil/memory/templates/bug.md', BUG_TEMPLATE);
  for (const id of ['testing', 'code-review', 'doc-versioning']) {
    writeFixtureFile(repo, `.wingfoil/directives/custom/${id}.md`, directiveMd(id));
  }
  for (const name of ['fake', 'fake-terminal']) {
    writeFixtureFile(repo, `.wingfoil/agents/custom/${name}.yaml`, readFileSync(join(AGENTS_FIXTURES, 'custom', `${name}.yaml`), 'utf-8'));
  }
  writeFixtureFile(repo, `docs/04_memory/v0.1/${TASK_ID}.md`, elementMd('task', TASK_ID, '## Description\n\nOverride the next step.'));
  writeFixtureFile(repo, `docs/04_memory/bugs/${BUG_ID}.md`, elementMd('bug', BUG_ID, '## Summary\n\nA bug.'));
  writeFixtureFile(repo, 'docs/04_memory/v0.1/task-203-sibling.md', elementMd('task', 'task-203-sibling', '## Description\n\nA sibling.'));
  // The project's own registration (dl-026), naming a `wingfoil` server that cannot start: §2.5.
  writeFixtureFile(repo, '.mcp.json', '{"mcpServers": {"wingfoil": {"command": "wingfoil-no-such-server", "args": ["mcp"]}}}\n');
  mkdirSync(join(repo, dirname(FAKE_SCRIPT_REL)), { recursive: true });
  copyFileSync(join(AGENTS_FIXTURES, 'fake-agent.cjs'), join(repo, FAKE_SCRIPT_REL));
  tweak(repo);
  commitAll(repo, 'seed task-218 agent execute fixture');
  return repo;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** What the run left in its own temporary directory. */
  readonly leftInTmp: string[];
}

const scratch: string[] = [];
const repos: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

function track(repo: string): string {
  repos.push(repo);
  return repo;
}

/** Run the compiled CLI in `repo` with a private `TMPDIR`, and report what it left there. */
function execute(repo: string, args: readonly string[], env: Record<string, string> = {}): Run {
  const tmp = mkdtempSync(join(tmpdir(), 'wf-agent-execute-tmp-'));
  scratch.push(tmp);
  // The identity variables are the test's to give: an ambient GIT_AUTHOR_* would hide a missing identity.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_(AUTHOR|COMMITTER)_/.test(name)));
  const run = spawnSync(process.execPath, [CLI_ENTRY, 'agent', 'execute', ...args], {
    cwd: repo,
    encoding: 'utf-8',
    env: { ...inherited, TMPDIR: tmp, TMP: tmp, TEMP: tmp, ...env },
  });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, leftInTmp: readdirSync(tmp) };
}

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();

interface RefusalRow {
  readonly label: string;
  readonly args: readonly string[];
  readonly message: string | RegExp;
  readonly tweak?: (repo: string) => void;
  /** A working-tree change made after the commit, part of the state the refusal must leave as it is. */
  readonly after?: (repo: string) => void;
  readonly env?: (repo: string) => Record<string, string>;
}

const FULL = ['--element', TASK_REF];

/** Every §3.7 row up to NO_TERMINAL, in pipeline order (§3.3). */
const ROWS: readonly RefusalRow[] = [
  {
    label: 'element absent at HEAD',
    args: ['--element', 'task:task-999-absent', '--role', 'developer'],
    message: 'element not found: task:task-999-absent',
  },
  {
    label: '--role not in DNA (P5.4.2 sc. 3 text)',
    args: [...FULL, '--role', 'ghost'],
    message: "unknown role 'ghost' (not defined in dna.yaml)",
  },
  {
    label: 'APPROVER_ROLE, though an agent lists approver in executes_as',
    args: [...FULL, '--role', 'approver'],
    message: "role 'approver' is never executed by an agent",
  },
  {
    label: 'NO_AGENT',
    args: [...FULL, '--role', 'qa'],
    message: "no agent in dna.yaml with an adapter executes as role 'qa'",
  },
  {
    label: 'unknown agent',
    args: [...FULL, '--role', 'developer', '--agent', 'Nobody'],
    message: "unknown agent 'Nobody'",
  },
  {
    label: 'agent without the role',
    args: [...FULL, '--role', 'qa', '--agent', 'Fake Agent'],
    message: "agent 'Fake Agent' does not execute as role 'qa'",
  },
  {
    label: 'NO_ADAPTER',
    args: [...FULL, '--role', 'developer', '--agent', 'Plain Agent'],
    message: "agent 'Plain Agent' declares no adapter",
  },
  {
    label: 'the adapter is in neither directory at HEAD',
    args: [...FULL, '--role', 'developer'],
    message: "adapter 'missing': no .wingfoil/agents/built-in/missing.yaml or .wingfoil/agents/custom/missing.yaml at HEAD",
    tweak: (repo) => writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: missing')),
  },
  {
    label: 'manifest invalid',
    args: [...FULL, '--role', 'developer'],
    message: /^adapter 'broken': /,
    tweak: (repo) => {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: broken'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/broken.yaml', manifest('broken', (text) => `${text}argz: [ oops ]\n`));
    },
  },
  {
    label: 'AGENT_NOT_FOUND',
    args: [...FULL, '--role', 'developer'],
    message: "agent command 'wingfoil-no-such-agent-cli' not found (adapter 'ghostcli')",
    tweak: (repo) => {
      writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: ghostcli'));
      writeFixtureFile(repo, '.wingfoil/agents/custom/ghostcli.yaml', manifest('ghostcli', (text) => text.replace('command: node', 'command: wingfoil-no-such-agent-cli')));
    },
  },
  {
    label: 'git identity missing',
    args: [...FULL, '--role', 'developer'],
    message: 'git identity not configured (user.name/user.email)',
    after: (repo) => {
      git(repo, ['config', '--unset', 'user.name']);
      git(repo, ['config', '--unset', 'user.email']);
    },
    env: (repo) => ({
      GIT_CONFIG_GLOBAL: join(repo, '.git', 'no-global-config'),
      GIT_CONFIG_NOSYSTEM: '1',
    }),
  },
  {
    label: 'NO_RUN_LOG',
    args: [...FULL, '--role', 'developer'],
    message: 'dna.yaml declares no run log (paths.runs)',
    tweak: (repo) => writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('  runs: [ docs/runs/ ]\n', '')),
  },
  {
    label: 'run log modified',
    args: [...FULL, '--role', 'developer'],
    message: `run log docs/runs/${TASK_ID}.jsonl has uncommitted changes`,
    after: (repo) => writeFixtureFile(repo, `docs/runs/${TASK_ID}.jsonl`, 'not a record\n'),
  },
  {
    label: 'INVALID_CONTEXT (P5.4.4 sc. 3)',
    args: [...FULL, '--role', 'developer'],
    message: "invalid execution context: missing 'directives' section",
    tweak: (repo) => unlinkSync(join(repo, '.wingfoil/roles.yaml')),
  },
  {
    label: 'MCP_UNREACHABLE (P5.4.3 sc. 3, verbatim)',
    args: [...FULL, '--role', 'developer'],
    message: 'context pre-load failed: MCP server unreachable',
    // The committed configuration is whole, so every gating read at HEAD passes; the server reads the
    // working tree's dna.yaml before it serves (spec-014 §1), and there is none.
    after: (repo) => unlinkSync(join(repo, '.wingfoil/dna.yaml')),
  },
  {
    label: 'NO_TERMINAL with the terminal: required fixture',
    args: [...FULL, '--role', 'developer'],
    message: 'interactive launch needs a terminal on stdin and stdout',
    tweak: (repo) => writeFixtureFile(repo, '.wingfoil/dna.yaml', DNA_YAML.replace('adapter: fake', 'adapter: fake-terminal')),
  },
];

describe('task-218 AC 1 — every §3.7 row up to NO_TERMINAL, with the fake adapter and no terminal', () => {
  it.each(ROWS.map((row) => [row.label, row] as const))('%s → exit 1, its message, nothing written', (_label, row) => {
    const repo = track(seed(row.tweak));
    row.after?.(repo);
    const before = snapshotPersistence(repo);

    const run = execute(repo, row.args, row.env?.(repo));

    expect(run.stdout).toBe('');
    const lines = run.stderr.split('\n');
    const errorLine = lines.find((line) => line.startsWith('error: '));
    if (typeof row.message === 'string') expect(errorLine).toBe(`error: ${row.message}`);
    else expect(errorLine?.slice('error: '.length)).toMatch(row.message);
    expect(run.status).toBe(1);
    assertPersistenceUnchanged(repo, before, row.label);
    expect(run.leftInTmp).toEqual([]);
  }, 60000);
});

describe('task-218 AC 2 — usage errors exit 2', () => {
  let repo: string;
  beforeAll(() => {
    repo = track(seed());
  });

  it('no flag at all: missing required argument: --next or --element', () => {
    const before = snapshotPersistence(repo);
    const run = execute(repo, []);
    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr.split('\n')[0]).toBe('error: missing required argument: --next or --element');
    assertPersistenceUnchanged(repo, before, 'no flag');
  });

  it.each([['--resume'], ['--ref']])('%s <run-id> is an unknown option in v0.3 (§3.1, §7)', (flag) => {
    const run = execute(repo, [...FULL, flag, `${TASK_ID}/adhoc/1`]);
    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain(`unknown option '${flag}'`);
  });

  it('a malformed element-ref is spec-008 §7’s refusal, exit 2', () => {
    const run = execute(repo, ['--element', 'task-202']);
    expect(run.status).toBe(2);
    expect(run.stderr.split('\n')[0]).toBe('error: malformed element-ref "task-202": expected <type>:<id>');
  });
});

/** The launch plan `--dry-run --format json` prints (spec-016 §3.3, spec-008 §2). */
interface LaunchPlan {
  readonly dryRun: true;
  readonly subject: string;
  readonly paths: readonly string[];
  readonly run: Record<string, string>;
  readonly bootstrap: string;
}

/** `spec-016` §2.4's template, written out by hand. */
function bootstrapOf(role: string, element: string, runId: string, stateRef: string, handoff: string): string {
  return [
    `WingFoil run ${runId}: act as role "${role}" on element ${element}.`,
    `Your context is assembled at commit ${stateRef} and served by the "wingfoil" MCP server`,
    `registered for this session. Load it before any other action: Get the MCP prompt "${role}-session" with arguments element="${element}" and state="${stateRef}".`,
    handoff,
    '',
  ].join('\n');
}

const TASK_HANDOFF = 'Record your handoff in the element\'s "## Execution Notes" section.';
const FALLBACK_HANDOFF = "Record your handoff in the element's body and in your commit messages.";

describe('task-218 AC 3 — the role defaults to developer, with a warning line (P5.3.1 sc. 2, full id)', () => {
  it('--element alone: the run is planned as developer, and stderr says so', () => {
    const repo = track(seed());
    const run = execute(repo, ['--element', TASK_REF, '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe(`${JSON.stringify({ warning: "no --role given and no workflow step to take one from: running as the default role 'developer'" })}\n`);
    const plan = JSON.parse(run.stdout) as LaunchPlan;
    expect(plan.run.role).toBe('developer');
    expect(plan.run.element).toBe(TASK_REF);
  }, 60000);

  it('console: the warning is one `warning:` line', () => {
    const repo = track(seed());
    const run = execute(repo, ['--element', TASK_REF, '--dry-run']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("warning: no --role given and no workflow step to take one from: running as the default role 'developer'\n");
  }, 60000);

  it('with --role there is no warning', () => {
    const repo = track(seed());
    const run = execute(repo, [...FULL, '--role', 'developer', '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
  }, 60000);
});

describe('task-218 AC 4 — dl-050 option 4: the role’s §5.1 warnings on stderr, in order, before the MCP pre-flight', () => {
  const DANGLING = ROLES_YAML.replace('    - testing\n', '    - testing\n    - zz-absent\n    - aa-absent\n').replace('  - doc-versioning\n', '  - doc-versioning\n  - mm-absent-global\n');
  const WARNINGS = [
    "directive 'aa-absent' bound to role 'developer' has no directive file",
    "directive 'mm-absent-global' bound to role 'developer' has no directive file",
    "directive 'zz-absent' bound to role 'developer' has no directive file",
  ];
  let repo: string;
  beforeAll(() => {
    repo = track(seed((root) => writeFixtureFile(root, '.wingfoil/roles.yaml', DANGLING)));
    // The pre-flight fails after the warnings are printed: the server finds no working-tree dna.yaml.
    unlinkSync(join(repo, '.wingfoil/dna.yaml'));
  });

  it('console: three warning lines in §5.1 order, then the pre-flight refusal; nothing on stdout', () => {
    const run = execute(repo, [...FULL, '--role', 'developer']);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    const lines = run.stderr.split('\n').filter((line) => line !== '' && !line.startsWith(' '));
    expect(lines).toEqual([...WARNINGS.map((text) => `warning: ${text}`), 'error: context pre-load failed: MCP server unreachable']);
  }, 60000);

  it('json: one document per message, the warnings first', () => {
    const run = execute(repo, [...FULL, '--role', 'developer', '--format', 'json']);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    const documents = run.stderr.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(documents.slice(0, 3)).toEqual(WARNINGS.map((warning) => ({ warning })));
    expect(documents).toHaveLength(4);
    expect(documents[3]!.error).toBe('context pre-load failed: MCP server unreachable');
  }, 60000);
});

describe('task-218 AC 5 — the bootstrap bytes (§2.4)', () => {
  let repo: string;
  let sha: string;
  beforeAll(() => {
    repo = track(seed());
    sha = head(repo);
  });

  const plan = (element: string): LaunchPlan => {
    const run = execute(repo, ['--element', element, '--role', 'developer', '--dry-run', '--format', 'json']);
    if (run.status !== 0) throw new Error(`dry run exited ${run.status}: ${run.stderr}`);
    return JSON.parse(run.stdout) as LaunchPlan;
  };

  it('equal §2.4’s template for (role, element, run id, state_ref), with the task template’s handoff line', () => {
    const first = plan(TASK_REF);
    expect(first.run.id).toBe(`${TASK_ID}/adhoc/1`);
    expect(first.run.state_ref).toBe(sha);
    expect(first.bootstrap).toBe(bootstrapOf('developer', TASK_REF, `${TASK_ID}/adhoc/1`, sha, TASK_HANDOFF));
  }, 60000);

  it('are the same on two runs from the same HEAD', () => {
    expect(plan(TASK_REF).bootstrap).toBe(plan(TASK_REF).bootstrap);
  }, 60000);

  it('carry the fallback handoff line for a type whose template has no `## Execution Notes` heading', () => {
    const bug = plan(`bug:${BUG_ID}`);
    expect(bug.bootstrap).toBe(bootstrapOf('developer', `bug:${BUG_ID}`, `${BUG_ID}/adhoc/1`, sha, FALLBACK_HANDOFF));
  }, 60000);
});

describe('task-218 — the dry run is the launch plan; the real run stops before the spawn', () => {
  let repo: string;
  beforeAll(() => {
    repo = track(seed());
  });

  it('--dry-run: exit 0, the plan names the run, its record commit and log, and nothing is written', () => {
    const before = snapshotPersistence(repo);
    const run = execute(repo, [...FULL, '--role', 'developer', '--dry-run', '--format', 'json']);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const plan = JSON.parse(run.stdout) as LaunchPlan;
    expect(plan).toMatchObject({
      dryRun: true,
      subject: `agent: record ${TASK_ID}/adhoc/1`,
      paths: [`docs/runs/${TASK_ID}.jsonl`],
      run: {
        id: `${TASK_ID}/adhoc/1`,
        element: TASK_REF,
        workflow: 'n/a',
        phase: 'adhoc',
        role: 'developer',
        mode: 'fresh',
        agent: 'Fake Agent',
        adapter: 'custom/fake',
        state_ref: head(repo),
      },
    });
    assertPersistenceUnchanged(repo, before, 'dry run');
    expect(run.leftInTmp).toEqual([]);
  }, 60000);

  it('without --dry-run: every pre-launch check passes, and the command refuses to launch (task-228 adds the launch)', () => {
    const before = snapshotPersistence(repo);
    const run = execute(repo, [...FULL, '--role', 'developer']);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr.split('\n')[0]).toBe(
      `error: agent execute cannot launch an agent yet: run ${TASK_ID}/adhoc/1 passed every pre-launch check (spec-016 §3.3 steps 1-12)`,
    );
    assertPersistenceUnchanged(repo, before, 'stopped before the spawn');
    expect(run.leftInTmp).toEqual([]);
  }, 60000);
});

describe('task-218 AC 7 — the MCP pre-flight uses the running build; the project’s .mcp.json is neither read nor modified', () => {
  it('a .mcp.json naming a wingfoil server that cannot start does not stop the pre-flight, and keeps its bytes', () => {
    const repo = track(seed());
    const mcpJson = readFileSync(join(repo, '.mcp.json'));
    const run = execute(repo, [...FULL, '--role', 'developer', '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(readFileSync(join(repo, '.mcp.json')).equals(mcpJson)).toBe(true);
  }, 60000);
});

describe('task-218 — the adapter tree’s non-adapter entries are reported where agent execute lists it (bug-290)', () => {
  it('a .yml file, a nested file and a name outside the id class each print a warning naming the path', () => {
    const repo = track(
      seed((root) => {
        writeFixtureFile(root, '.wingfoil/agents/custom/fake.yml', manifest('fake'));
        writeFixtureFile(root, '.wingfoil/agents/custom/nested/other.yaml', manifest('other'));
        writeFixtureFile(root, '.wingfoil/agents/custom/Bad Name.yaml', manifest('Bad Name'));
        writeFixtureFile(root, '.wingfoil/agents/custom/.gitkeep', '');
      }),
    );
    const run = execute(repo, [...FULL, '--role', 'developer', '--dry-run']);
    expect(run.status).toBe(0);
    expect(run.stderr.split('\n').filter((line) => line.startsWith('warning: '))).toEqual([
      "warning: W_ADAPTER_IGNORED (.wingfoil/agents/custom/Bad Name.yaml): not an adapter: its name 'Bad Name' is not an id, characters [a-z0-9-.] only (spec-009 §1), so no agent can select it",
      'warning: W_ADAPTER_IGNORED (.wingfoil/agents/custom/fake.yml): not an adapter: an adapter is a .yaml file directly inside .wingfoil/agents/built-in/ or .wingfoil/agents/custom/ (spec-016 §2.1)',
      'warning: W_ADAPTER_IGNORED (.wingfoil/agents/custom/nested/other.yaml): not an adapter: an adapter is a .yaml file directly inside .wingfoil/agents/built-in/ or .wingfoil/agents/custom/ (spec-016 §2.1)',
    ]);
  }, 60000);
});

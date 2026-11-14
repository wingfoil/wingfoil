/**
 * task-338 — `wingfoil agent execute` names and reaches the launching build, marks the spawned agent, and salts the
 * assigned session id per clone (`spec-016` §2.4, §2.6 and §3.3 step 14 as amended at the design gate; `spec-018`
 * §1.1, §6 T-22; `dl-180` invocation (c), `dl-168` Q1 (b); `bug-369`, `bug-370`), on the compiled CLI with the fake
 * adapter (`test/fixtures/agents/`), no real agent and no terminal.
 *
 * Every run's environment is `process.env` minus the `spec-018` §1 environment markers (`withoutAgentMarkers`),
 * `WINGFOIL_AGENT_MODEL`, the git identity variables and the fake's own variables, plus what the case names, so it
 * behaves the same under an agent and in the approver's terminal. Expected build strings are `distBuildStamp()`, what
 * `node dist/cli.js --version` prints.
 *
 * - AC 1 (red-first): with a decoy `wingfoil` (it prints `decoy 0.0.0`) first on `agent execute`'s `PATH`, the fake,
 *   asked to (`WINGFOIL_FAKE_AGENT_CLI=1`), reaches the launching build both as `wingfoil` and as `"$WINGFOIL_CLI"`, the
 *   shim is owner-only (`700`), the bootstrap's CLI line names that build, the dry-run plan's bootstrap does too
 *   (`--format json` and `console`), and nothing is left in the temporary directory.
 * - AC 2 (red-first, design D4): the spawned agent carries `WINGFOIL_AGENT=Fake Agent`, with no marker and under
 *   `CLAUDE_CODE_CHILD_SESSION=1`. (characterization) the post-run `--version` and `--lookup` run without it; the
 *   `agent: record <run-id>` commit has no `Co-Authored-By:` or `AI-Model:` trailer; `--co-author` exits `2` with
 *   `error: unknown option '--co-author'` (copied from a real run of `node dist/cli.js agent execute --element
 *   task:task-202-explicit-override --role developer --co-author Claude`), launching and committing nothing.
 * - AC 4 (red-first): two runs → `<git common dir>/wingfoil/session-salt` is 64 lowercase hex digits and a line feed,
 *   `0600` in a `0700` directory, untouched by the second run; each run's session id (argv and record) is the v5 UUID
 *   of `<salt>\n<run id>`, never of the root; a run from a linked worktree uses the same salt; a malformed salt is
 *   refused before the banner (exit `1`, §2.6's message, nothing launched or recorded). A dry run and a
 *   non-`assign` adapter create no salt.
 * - AC 5 (characterization): a run appended to a log holding the two task-236 records committed before the salt
 *   (`test/fixtures/run-logs/`) leaves those lines byte for byte as they were.
 * - AC 7 (characterization, design D3 (a)): a run whose lookup reports no model records `model: "not-reported"`, and
 *   `spec-016` §2.6 says that value marks the agent's `AI-Model:` trailers as its own claim.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { withoutAgentMarkers } from '../agent-markers.cjs';
import { AGENTS_FIXTURES, DNA_YAML, elementMd, seed, TASK_ID, TASK_REF } from '../agent/helpers/agent-execute-fixture';
import { git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { distBuildStamp } from './helpers/dist-stamp';
import { CLI_ENTRY, spawnCapture } from './helpers/spawn-cli';

const REPO_ROOT = join(__dirname, '..', '..');
const POSIX = process.platform !== 'win32';
const FULL = ['--element', TASK_REF, '--role', 'developer'];
const LOG = `docs/runs/${TASK_ID}.jsonl`;
const RUN_1 = `${TASK_ID}/adhoc/1`;
const RUN_2 = `${TASK_ID}/adhoc/2`;
const MALFORMED =
  'error: the session salt in the git directory (wingfoil/session-salt) is not 64 lowercase hexadecimal digits: remove it, and a new one is created at the next launch\n';

const scratch: string[] = [];
const repos: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  for (const repo of repos) removeTempDir(repo);
});

function fixture(tweak?: (repo: string) => void): string {
  const repo = seed(tweak);
  repos.push(repo);
  return repo;
}

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** What the fake wrote for one invocation (its record line, `WINGFOIL_FAKE_AGENT_CLI=1` keys included). */
interface FakeEntry {
  readonly argv: string[];
  readonly env: string[];
  readonly cli?: { readonly path: string | null; readonly variable: string | null; readonly mode: string | null };
  readonly launcher?: string | null;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly leftInTmp: string[];
  readonly fake: FakeEntry[];
}

/** `process.env` without the agent markers, the model variable, the git identity or the fake's variables. */
function baseEnv(): Record<string, string | undefined> {
  const env = withoutAgentMarkers(process.env);
  delete env.WINGFOIL_AGENT_MODEL;
  for (const name of Object.keys(env)) if (/^(GIT_(AUTHOR|COMMITTER)_|WINGFOIL_FAKE_AGENT_)/.test(name)) delete env[name];
  return env;
}

function fakeEntries(recordFile: string): FakeEntry[] {
  if (!existsSync(recordFile)) return [];
  return readFileSync(recordFile, 'utf-8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as FakeEntry);
}

/** Run `agent execute` in `cwd` to completion, with a private `TMPDIR` and the fake's record file. */
function execute(cwd: string, args: readonly string[], env: Record<string, string> = {}): Run {
  const tmp = scratchDir('wf-cli-shim-tmp-');
  const recordFile = join(scratchDir('wf-cli-shim-rec-'), 'fake.jsonl');
  const run = spawnCapture(process.execPath, [CLI_ENTRY, 'agent', 'execute', ...args], {
    cwd,
    env: { ...baseEnv(), TMPDIR: tmp, TMP: tmp, TEMP: tmp, WINGFOIL_FAKE_AGENT_RECORD: recordFile, ...env } as NodeJS.ProcessEnv,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, leftInTmp: readdirSync(tmp), fake: fakeEntries(recordFile) };
}

const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']).trim();
const commonDir = (repo: string): string => git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
const saltFile = (repo: string): string => join(commonDir(repo), 'wingfoil', 'session-salt');

/** The run log as `HEAD` holds it, one parsed record per line. */
function recordsAtHead(repo: string, log = LOG): Record<string, unknown>[] {
  return git(repo, ['show', `HEAD:${log}`])
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** RFC 4122 v5, written independently of `src/agent` (see `test/agent/launch.test.ts`). */
function uuidV5(namespace: string, name: string): string {
  const hash = createHash('sha1').update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf-8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const SESSION_NAMESPACE = uuidV5('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'wingfoil:spec-016:session');

/** The salt's 64 digits, or a placeholder no salt can equal when the file is absent. */
function saltOf(repo: string): string {
  return existsSync(saltFile(repo)) ? readFileSync(saltFile(repo), 'utf-8').replace(/\n$/, '') : '<no session salt>';
}

/** The fake's launch record: the one entry whose argv is neither `--version` nor `--lookup`. */
function launchEntry(run: Run): FakeEntry {
  const entry = run.fake.find((candidate) => !candidate.argv.includes('--version') && !candidate.argv.includes('--lookup'));
  if (entry === undefined) throw new Error(`the fake never launched: ${run.stderr}`);
  return entry;
}

/** The bootstrap the fake received (`--prompt <text>`). */
function bootstrapOf(entry: FakeEntry): string {
  return entry.argv[entry.argv.indexOf('--prompt') + 1]!;
}

const cliLine = (build: string): string =>
  `Run WingFoil commands as "wingfoil <command>": the build that launched you is first on your PATH, and "wingfoil --version" prints "${build}"; if it prints anything else, run "$WINGFOIL_CLI" in place of "wingfoil".`;

describe('task-338 AC 1 — the agent\'s wingfoil is the build that launched it, even with another wingfoil first on PATH', () => {
  let repo: string;
  let decoyPath: string;
  let run: Run;
  beforeAll(() => {
    repo = fixture();
    const decoy = scratchDir('wf-cli-shim-decoy-');
    writeFileSync(join(decoy, 'wingfoil'), "#!/bin/sh\necho 'decoy 0.0.0'\n", { mode: 0o700 });
    decoyPath = `${decoy}${delimiter}${process.env.PATH ?? ''}`;
    run = execute(repo, FULL, { PATH: decoyPath, WINGFOIL_FAKE_AGENT_CLI: '1' });
  }, 120000);

  it('the decoy is what a plain wingfoil reaches on that PATH outside agent execute (a guard on the case)', () => {
    const out = spawnCapture('wingfoil', ['--version'], { cwd: repo, env: { ...baseEnv(), PATH: decoyPath } as NodeJS.ProcessEnv });
    expect(out.stdout).toBe('decoy 0.0.0\n');
  });

  it('exits 0, and nothing is left in the temporary directory (the shim is removed with the run files)', () => {
    expect(run.stderr).not.toMatch(/^error: /m);
    expect(run.status).toBe(0);
    expect(run.leftInTmp).toEqual([]);
  });

  it('inside the agent, "wingfoil --version" prints the launching build', () => {
    expect(launchEntry(run).cli?.path).toBe(distBuildStamp());
  });

  it('inside the agent, "$WINGFOIL_CLI --version" prints the launching build', () => {
    expect(launchEntry(run).cli?.variable).toBe(distBuildStamp());
  });

  (POSIX ? it : it.skip)('the shim $WINGFOIL_CLI names is owner-only (700)', () => {
    expect(launchEntry(run).cli?.mode).toBe('700');
  });

  it('the bootstrap the agent received carries the CLI line naming that build, before the handoff line', () => {
    const lines = bootstrapOf(launchEntry(run)).split('\n');
    expect(lines[3]).toBe(cliLine(distBuildStamp()));
    expect(lines[4]).toBe('Record your handoff in the element\'s "## Execution Notes" section.');
  });

  it('the dry-run plan\'s bootstrap names that build too, under --format json and console', () => {
    const json = execute(repo, [...FULL, '--dry-run', '--format', 'json'], { PATH: decoyPath });
    expect(json.status).toBe(0);
    expect((JSON.parse(json.stdout) as { bootstrap: string }).bootstrap).toContain(`"wingfoil --version" prints "${distBuildStamp()}"`);
    const plain = execute(repo, [...FULL, '--dry-run'], { PATH: decoyPath });
    expect(plain.status).toBe(0);
    // The console plan is the same JSON document, pretty-printed (`node dist/cli.js agent execute … --dry-run`).
    expect((JSON.parse(plain.stdout) as { bootstrap: string }).bootstrap.split('\n')[3]).toBe(cliLine(distBuildStamp()));
  }, 120000);
});

describe('task-338 AC 2 — WINGFOIL_AGENT for the spawned agent only; the record commit carries no agent trailer', () => {
  const cases: readonly [string, Record<string, string>][] = [
    ['no marker', {}],
    ['under CLAUDE_CODE_CHILD_SESSION=1', { CLAUDE_CODE_CHILD_SESSION: '1' }],
  ];

  describe.each(cases)('%s', (_label, markers) => {
    let repo: string;
    let run: Run;
    beforeAll(() => {
      repo = fixture();
      run = execute(repo, FULL, { ...markers, WINGFOIL_FAKE_AGENT_CLI: '1' });
    }, 120000);

    it('the run succeeds, and the environment carries the case\'s markers to the agent\'s children (a guard on the case)', () => {
      expect(run.status).toBe(0);
      for (const name of Object.keys(markers)) expect(launchEntry(run).env).toContain(name);
    });

    it('(red-first) the agent is spawned with WINGFOIL_AGENT set to the selected entry\'s name', () => {
      expect(launchEntry(run).env).toContain('WINGFOIL_AGENT');
      expect(launchEntry(run).launcher).toBe('Fake Agent');
    });

    it('(characterization) the post-run --version and --lookup run without WINGFOIL_AGENT', () => {
      const post = run.fake.filter((entry) => entry.argv.includes('--version') || entry.argv.includes('--lookup'));
      expect(post.map((entry) => entry.argv[0])).toEqual(['--version', '--lookup']);
      for (const entry of post) expect(entry.env).not.toContain('WINGFOIL_AGENT');
    });

    it('(characterization) the `agent: record <run-id>` commit has no Co-Authored-By or AI-Model trailer', () => {
      expect(git(repo, ['log', '-1', '--format=%s%n%(trailers:key=Co-Authored-By)%(trailers:key=AI-Model)']).trim()).toBe(`agent: record ${RUN_1}`);
      expect(git(repo, ['log', '-1', '--format=%B'])).not.toMatch(/^(Co-Authored-By|AI-Model):/im);
    });
  });

  it('(characterization) --co-author is an unknown option: exit 2, nothing launched, nothing committed', () => {
    const repo = fixture();
    const before = head(repo);
    const run = execute(repo, [...FULL, '--co-author', 'Claude']);
    expect(run.status).toBe(2);
    expect(run.stderr).toBe("error: unknown option '--co-author'\n");
    expect(run.stdout).toBe('');
    expect(run.fake).toEqual([]);
    expect(head(repo)).toBe(before);
  }, 120000);
});

describe('task-338 AC 4 — the assigned session id hashes the clone\'s salt, not its path', () => {
  let repo: string;
  let first: Run;
  let second: Run;
  let afterFirst: { text: string; ino: number } | undefined;
  beforeAll(() => {
    repo = fixture();
    first = execute(repo, FULL);
    afterFirst = existsSync(saltFile(repo)) ? { text: readFileSync(saltFile(repo), 'utf-8'), ino: statSync(saltFile(repo)).ino } : undefined;
    second = execute(repo, FULL);
  }, 180000);

  it('both runs succeed', () => {
    expect([first.status, second.status]).toEqual([0, 0]);
  });

  it('the first run creates <git common dir>/wingfoil/session-salt: 64 lowercase hex digits and a line feed', () => {
    expect(afterFirst?.text ?? '<no session salt file>').toMatch(/^[0-9a-f]{64}\n$/);
  });

  (POSIX ? it : it.skip)('owner-only: the file 0600, its directory 0700', () => {
    expect(existsSync(saltFile(repo))).toBe(true);
    expect((statSync(saltFile(repo)).mode & 0o777).toString(8)).toBe('600');
    expect((statSync(join(commonDir(repo), 'wingfoil')).mode & 0o777).toString(8)).toBe('700');
  });

  it('the second run reuses it: same content, same inode', () => {
    expect(afterFirst).toBeDefined();
    expect(readFileSync(saltFile(repo), 'utf-8')).toBe(afterFirst!.text);
    expect(statSync(saltFile(repo)).ino).toBe(afterFirst!.ino);
  });

  it('each run\'s session id, in the argv and in the record, is the v5 UUID of `<salt>\\n<run id>`', () => {
    const salt = saltOf(repo);
    const expected = [uuidV5(SESSION_NAMESPACE, `${salt}\n${RUN_1}`), uuidV5(SESSION_NAMESPACE, `${salt}\n${RUN_2}`)];
    expect([launchEntry(first).argv.slice(-2), launchEntry(second).argv.slice(-2)]).toEqual([
      ['--session-id', expected[0]],
      ['--session-id', expected[1]],
    ]);
    expect(recordsAtHead(repo).map((record) => record['session'])).toEqual(expected);
  });

  it('no record holds the root-hashed id of before (dl-168 Q1 (b))', () => {
    const root = git(repo, ['rev-parse', '--show-toplevel']).trim();
    const sessions = recordsAtHead(repo).map((record) => record['session']);
    expect(sessions).not.toContain(uuidV5(SESSION_NAMESPACE, `${root}\n${RUN_1}`));
    expect(sessions).not.toContain(uuidV5(SESSION_NAMESPACE, `${root}\n${RUN_2}`));
  });

  it('nothing in the working tree: the salt is never a git path', () => {
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
    expect(git(repo, ['ls-files']).split('\n')).not.toContain('wingfoil/session-salt');
  });

  it('a run from a linked worktree of the clone uses the same salt, and writes none of its own', () => {
    const worktree = `${repo}-linked`;
    git(repo, ['worktree', 'add', '-q', '-b', 'linked', worktree]);
    repos.push(worktree);
    const salt = saltOf(repo);
    const run = execute(worktree, FULL);
    expect(run.status).toBe(0);
    const records = recordsAtHead(worktree);
    const last = records[records.length - 1]!;
    expect(last['session']).toBe(uuidV5(SESSION_NAMESPACE, `${salt}\n${String(last['id'])}`));
    expect(saltOf(repo)).toBe(salt);
    const worktreeGitDir = git(worktree, ['rev-parse', '--path-format=absolute', '--git-dir']).trim();
    expect(existsSync(join(worktreeGitDir, 'wingfoil'))).toBe(false);
  }, 120000);
});

describe('task-338 AC 4 — when no salt is created or used', () => {
  it('a malformed salt is refused before the banner: exit 1, spec-016 §2.6\'s message, nothing launched or recorded, the file kept', () => {
    const repo = fixture();
    const before = head(repo);
    const dir = join(commonDir(repo), 'wingfoil');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, 'session-salt'), 'xyz\n', { mode: 0o600 });
    const run = execute(repo, FULL);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(MALFORMED);
    expect(run.stderr).not.toContain('launching');
    expect(run.fake).toEqual([]);
    expect(head(repo)).toBe(before);
    expect(readFileSync(join(dir, 'session-salt'), 'utf-8')).toBe('xyz\n');
  }, 120000);

  it('a dry run creates no salt', () => {
    const repo = fixture();
    const run = execute(repo, [...FULL, '--dry-run', '--format', 'json']);
    expect(run.status).toBe(0);
    expect(existsSync(saltFile(repo))).toBe(false);
  }, 120000);

  it('an adapter whose session id is not assigned (session.id: none) creates no salt', () => {
    const adapter = 'fake-config-arg';
    const repo = fixture((root) => {
      writeFixtureFile(root, `.wingfoil/agents/custom/${adapter}.yaml`, readFileSync(join(AGENTS_FIXTURES, 'config-arg', `${adapter}.yaml`), 'utf-8'));
      writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML.replace('      adapter: fake\n', `      adapter: ${adapter}\n`));
    });
    const run = execute(repo, FULL);
    expect(run.status).toBe(0);
    expect(recordsAtHead(repo)).toHaveLength(1);
    expect(existsSync(saltFile(repo))).toBe(false);
  }, 120000);
});

describe('task-338 AC 5 (characterization) — records committed before the salt are left as history', () => {
  const ELEMENT = 'task-236-ship-verify-hand-builtin-claude-code-adapter-point';
  const OLD_LOG = `docs/runs/${ELEMENT}.jsonl`;
  const OLD = readFileSync(join(REPO_ROOT, 'test', 'fixtures', 'run-logs', `${ELEMENT}.jsonl`), 'utf-8');

  it('a run appended to the log keeps the two old lines byte for byte, their sessions included', () => {
    const repo = fixture((root) => {
      writeFixtureFile(root, `docs/04_memory/v0.1/${ELEMENT}.md`, elementMd('task', ELEMENT, '## Description\n\nThe pre-salt runs.'));
      writeFixtureFile(root, OLD_LOG, OLD);
    });
    const run = execute(repo, ['--element', `task:${ELEMENT}`, '--role', 'developer']);
    expect(run.status).toBe(0);
    const text = git(repo, ['show', `HEAD:${OLD_LOG}`]);
    expect(text.startsWith(OLD)).toBe(true);
    const records = recordsAtHead(repo, OLD_LOG);
    expect(records.map((record) => record['id'])).toEqual([`${ELEMENT}/adhoc/1`, `${ELEMENT}/adhoc/2`, `${ELEMENT}/adhoc/3`]);
    expect(records.slice(0, 2).map((record) => record['session'])).toEqual(['f4458e8b-b6a3-5453-8221-90a33bb558bb', 'b0fc53be-b276-5117-95e6-2e983cf4e5e9']);
  }, 120000);
});

describe('task-338 AC 7 (characterization) — a run whose lookup reports no model records not-reported, the agent\'s own claim', () => {
  it('the lookup document has no model: the record says model "not-reported", silently', () => {
    const repo = fixture();
    const run = execute(repo, FULL, { WINGFOIL_FAKE_AGENT_DOCUMENT: JSON.stringify({ usage: { input: 1, output: 2, cache_read: 3, cache_write: 4 } }) });
    expect(run.status).toBe(0);
    expect(recordsAtHead(repo)[0]).toMatchObject({ model: 'not-reported', tokens: { input: 1, output: 2, cache_read: 3, cache_write: 4 } });
    expect(run.stderr).not.toMatch(/^warning: .*model/m);
  }, 120000);

  it('spec-016 §2.6 defines that value as marking the agent\'s AI-Model: trailers as its own claim (bug-370)', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', '04_memory', 'design', 'specs', 'spec-016-agent-execution.md'), 'utf-8').replace(/\s+/g, ' ');
    expect(spec).toContain(
      "The record's `model` is a value WingFoil read from the adapter's declared lookup; `not-reported` says it read none.",
    );
    expect(spec).toContain('A record whose `model` is `not-reported` therefore says that any model those trailers name is unverified (`bug-370`).');
  });
});

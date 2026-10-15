#!/usr/bin/env node
/**
 * dl-023 fresh-init + CLI end-to-end smoke — the executable form of
 * `.wingfoil/workflows/custom/e2e-smoke.yaml`, reused verbatim as spec-015 §3 stage 3 and run by
 * `.github/workflows/ci.yml`'s `e2e-smoke` job against the packed tarball (`dl-099` §4 (c)).
 *
 * Black-box: it only spawns `wingfoil` (and `git`) and reads exit codes, stdout and stderr. For each
 * supported template it creates a throwaway git repository, runs `wingfoil init --template <T>`, and drives
 * the scaffolded project through a use scenario (`dl-099` §3, task-207):
 *
 * - every step declares the exit code it must end with (spec-005 §1). A step that must fail also has to
 *   carry spec-005 §3's error on stderr (`error: <reason>`, or `{"error": …}` under `--format json`), and
 *   its reason is asserted (`bug-132`). The scenario holds exit-2 steps (an unknown option, a missing
 *   operand) and exit-1 steps (an `approve` before an approver is bound, REQ-SEC-03; a `submit` past the
 *   last state);
 * - one task per verb of the scaffold's one machine shape (`defaults`: `draft → pending → approved`, the
 *   `pending` gate rejecting to `draft`): `add → submit → approve`, `add → submit → reject`,
 *   `add → deprecate`. The smoke's git identity is bound as an `approver` (`dna add team.members`) between
 *   the refused and the accepted `approve`;
 * - after the last writer, every artifact a command wrote is re-loaded through its own reader and its
 *   content asserted, not only its exit: `dna show` (the `dna set` value, the bound approver),
 *   `memory search` and `memory history` per task, `directives list`, then `paths` and `workflow list`
 *   (`bug-133`);
 * - the working tree must be clean after EVERY step: each mutation is its own commit, and a refusal
 *   writes nothing.
 *
 * After each template's scenario, the agent run (task-243, `spec-016` §2.7 last bullet) runs in its own fresh
 * `init` project: the fake adapter `custom/fake` and its script are copied from the checkout's
 * `test/fixtures/agents/` and committed, a `team.agents` entry points at it, and one adhoc `agent execute`
 * runs with the fake switched on. Its outcomes are asserted beyond exit 0: exactly one `agent: record`
 * commit holding only the run log, `agent show` and `agent list --past` re-loading the record, and the
 * fake's own record proving it read the session Resource from the `wingfoil` server of the build under test.
 *
 * After each template's agent run, the Journey 4 run (task-242, `bug-328`): the self-checking example
 * `docs/examples/06-workflow-approval/run.sh`, run by `bash` from the checkout with a `wingfoil` shim of the build
 * under test on `PATH`, in its own fresh `init` project. It creates and starts a workflow, reads `workflow next`
 * and `workflow status` (the "human needed" line), adds a task with `memory add --workflow`, submits and approves
 * it, records a checkpoint with `workflow finalize` and ends the instance with `workflow end`, checking each
 * command's exit code and the commit it writes; the smoke requires its exit 0, its `OK:` line, and those commands
 * in its transcript ({@link JOURNEY_COMMANDS}).
 *
 * `--report <path>` writes the run as Markdown (`bug-134`: the report `e2e-smoke.yaml`'s gate declares
 * under `produces:`), on a failure too.
 *
 * Deterministic: fixed step list and template order, fixed throwaway git identity, nothing from a clock or
 * randomness in what is asserted or reported (the temp directory name is never compared or written).
 *
 * Usage:
 *   node scripts/e2e-smoke.cjs --candidate [--report PATH]   # the packed candidate, its stamp bound (task-219)
 *   node scripts/e2e-smoke.cjs [--expect-version X.Y.Z [--expect-commit SHA]] [--report PATH]   # `wingfoil` on PATH
 *   node scripts/e2e-smoke.cjs [...] -- node "$PWD/dist/cli.js"
 * Every step runs inside a throwaway directory, so a script path after `--` must be absolute.
 * `--expect-version` alone pins the semver of the build stamp and accepts any commit in it;
 * `--expect-commit` (task-254, `bug-235`) requires the whole stamp, `X.Y.Z (SHA)`, which is how the
 * staging stage proves the tarball was built from the released commit (`dl-111`). `--candidate` (task-219,
 * the `e2e-smoke-passed` binding) packs the checked-out commit, installs it into a throwaway prefix and
 * smokes that bin with `--expect-version` = `package.json`'s version and `--expect-commit` = `HEAD`
 * (`dl-099` §1: the candidate's packed tarball, not the working tree). It refuses only a change under the
 * pack inputs (`PACK_INPUTS`, `scripts/write-build-info.cjs`: an untracked note elsewhere is no reason), and
 * removes the checkout's `dist/` before packing, so `prepack` rebuilds it whole and no module of a deleted
 * source is packed (task-282, `bug-310`). Do not run it while another build or jest uses this checkout's `dist/`.
 * Exit codes: 0 every check passed, 1 a check failed, 2 a bad argument.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, dirname, join } = require('node:path');

const { PACK_INPUTS, inputStatus } = require('./write-build-info.cjs');

/**
 * A commit an expected stamp may name: a full hex object name, SHA-1 (40) or SHA-256 (64) — the shape
 * `scripts/write-build-info.cjs` records for a clean build (`git rev-parse HEAD`). An abbreviated sha
 * could never equal a real stamp, so it is refused as an argument rather than failing every run; and
 * `unknown` and `<sha>-dirty` are stamps the check must refuse, so they can never be what it expects.
 */
const COMMIT_NAME_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Every template `wingfoil init` supports, in the order they are smoked. */
const SMOKE_TEMPLATES = Object.freeze(['Scrum', 'Kanban']);

/** The throwaway repository's git identity — bound as the scenario's approver. */
const SMOKE_NAME = 'WingFoil Smoke';
const SMOKE_EMAIL = 'smoke@wingfoil.invalid';

/** The `--format json` flag pair, appended to every step whose payload is asserted. */
const JSON_FORMAT = Object.freeze(['--format', 'json']);

/**
 * The checkout's agent fixtures (task-243), the source of every copy step: the fake adapter
 * `custom/fake.yaml` and the script it launches, `fake-agent.cjs` (`spec-016` §2.7). The tarball does not
 * ship `test/`; the smoke always runs from a checkout (the `ci.yml` job, `--candidate`, the staging rehearsal).
 */
const AGENT_FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'agents');

/**
 * The Journey 4 example (task-242, `bug-328`), run per template after the agent run. Resolved from the checkout,
 * as {@link AGENT_FIXTURES} is: the tarball does not ship `docs/examples/`.
 */
const JOURNEY_SCRIPT = join(__dirname, '..', 'docs', 'examples', '06-workflow-approval', 'run.sh');

/** The journey check's label path: fixed, so the report never depends on where the checkout lies. */
const JOURNEY_LABEL = 'bash docs/examples/06-workflow-approval/run.sh';

/**
 * The `wingfoil` commands the journey's transcript must hold, in this order, each followed by `[exit 0]`
 * (lib.sh's `expect_exit`). An entry `<a> … <b>` matches a command that starts with `<a>` and contains `<b>`.
 */
const JOURNEY_COMMANDS = Object.freeze([
  'workflow start',
  'workflow next',
  'memory add … --workflow',
  'memory submit',
  'workflow status',
  'memory approve',
  'workflow next',
  'workflow finalize',
  'workflow end',
]);

/** The prefix of every environment variable the fake agent reads; stripped from what the agent run inherits. */
const FAKE_AGENT_ENV_PREFIX = 'WINGFOIL_FAKE_AGENT_';

/** The prefix of the commit `agent execute` writes for a run (`spec-016` §4.4). */
const RECORD_SUBJECT = 'agent: record ';

/** The run log folder `wingfoil init` declares (`paths.runs`), where each run lands in `<element-id>.jsonl`. */
const SMOKE_RUNS_DIR = 'docs/runs/';

/**
 * The per-template use scenario, `init` first. Every step declares `exit` (0, 1 or 2). `json: true` means
 * stdout must parse as JSON. `capture: '<name>'` keeps a step's parsed JSON stdout under `<name>`; a later
 * arg or `expect` value `'{<name>.<field>}'` is replaced by that field. `expect` maps dotted paths
 * (`matches.0.id`, `entries.length`) to the value they must hold: in the JSON stdout of a step that exits
 * 0, in the parsed spec-005 §3 error (`{ error, hint }`) of one that does not.
 * @param {string} template
 * @returns {ReadonlyArray<{ args: readonly string[], exit: 0 | 1 | 2, json?: boolean, capture?: string,
 *                           expect?: Readonly<Record<string, string | number>> }>}
 */
function smokeSteps(template) {
  const task = (title, capture) => ({
    args: ['memory', 'add', '--type', 'task', '--title', title, ...JSON_FORMAT],
    exit: 0,
    json: true,
    capture,
    expect: { path: `docs/memory/task/{${capture}.id}.md` },
  });
  const edge = (verb, name, from, to, reason) => ({
    args: ['memory', verb, `{${name}.id}`, ...(reason === undefined ? [] : ['--reason', reason]), ...JSON_FORMAT],
    exit: 0,
    json: true,
    expect: { id: `{${name}.id}`, from, to },
  });
  const search = (name, status) => ({
    args: ['memory', 'search', `{${name}.id}`, '--status', status, ...JSON_FORMAT],
    exit: 0,
    json: true,
    expect: { 'matches.length': 1, 'matches.0.id': `{${name}.id}`, 'matches.0.status': status },
  });
  const history = (name, operations, last) => ({
    args: ['memory', 'history', `{${name}.id}`, ...JSON_FORMAT],
    exit: 0,
    json: true,
    expect: {
      'entries.length': operations.length,
      ...Object.fromEntries(operations.map((operation, i) => [`entries.${i}.operation`, operation])),
      ...Object.fromEntries(Object.entries(last).map(([field, value]) => [`entries.${operations.length - 1}.${field}`, value])),
    },
  });
  return [
    { args: ['init', '--template', template], exit: 0 },
    { args: ['dna', 'show', ...JSON_FORMAT], exit: 0, json: true, expect: { 'project.methodology': template } },
    // spec-005 §1 exit 2: an unknown option, and a missing operand — each refused with §3's error.
    { args: ['dna', 'show', '--no-such-option'], exit: 2, expect: { error: "unknown option '--no-such-option'" } },
    { args: ['memory', 'approve', ...JSON_FORMAT], exit: 2, expect: { error: 'missing required argument: <id>' } },
    { args: ['dna', 'set', 'project.name', '--value', 'WingFoil smoke'], exit: 0 },
    task('Approved task', 'approved'),
    edge('submit', 'approved', 'draft', 'pending'),
    // spec-005 §1 exit 1: no approver is bound yet (REQ-SEC-03), so the approve is refused and writes nothing.
    {
      args: ['memory', 'approve', '{approved.id}', '--reason', 'smoke: no approver bound', ...JSON_FORMAT],
      exit: 1,
      expect: { error: "user not authorized to approve type 'task'" },
    },
    {
      args: ['dna', 'add', 'team.members', '--value', SMOKE_NAME, '--entry-email', SMOKE_EMAIL, '--entry-roles', 'approver'],
      exit: 0,
    },
    edge('approve', 'approved', 'pending', 'approved', 'smoke: approve'),
    // spec-005 §1 exit 1: `approved` is the last state of the sequence, so there is no forward edge.
    {
      args: ['memory', 'submit', '{approved.id}', ...JSON_FORMAT],
      exit: 1,
      expect: { error: "illegal transition approved -> (none) for type 'task'" },
    },
    task('Rejected task', 'rejected'),
    edge('submit', 'rejected', 'draft', 'pending'),
    edge('reject', 'rejected', 'pending', 'draft', 'smoke: reject'),
    task('Deprecated task', 'deprecated'),
    edge('deprecate', 'deprecated', 'draft', 'deprecated', 'smoke: deprecate'),
    // The last writer is above. Every artifact written is re-loaded through its own reader (bug-133).
    {
      args: ['dna', 'show', ...JSON_FORMAT],
      exit: 0,
      json: true,
      expect: {
        'project.name': 'WingFoil smoke',
        'team.members.length': 1,
        'team.members.0.email': SMOKE_EMAIL,
        'team.members.0.roles.0': 'approver',
      },
    },
    search('approved', 'approved'),
    history('approved', ['add', 'submit', 'approve'], { approver: `${SMOKE_NAME} <${SMOKE_EMAIL}> (approver)`, reason: 'smoke: approve' }),
    search('rejected', 'draft'),
    history('rejected', ['add', 'submit', 'reject'], { to: 'draft', reason: 'smoke: reject' }),
    search('deprecated', 'deprecated'),
    history('deprecated', ['add', 'deprecate'], { to: 'deprecated', reason: 'smoke: deprecate' }),
    { args: ['directives', 'list', ...JSON_FORMAT], exit: 0, json: true, expect: { 'entries.length': 10 } },
    { args: ['paths', 'config', '--list', ...JSON_FORMAT], exit: 0, json: true },
    { args: ['workflow', 'list', ...JSON_FORMAT], exit: 0, json: true },
  ];
}

/**
 * The agent run's scenario for `template` (task-243, `spec-016` §2.7), `init` first. Three kinds of step,
 * told apart by their key: a CLI step (`args`, as in {@link smokeSteps}; `fakeAgent: true` runs it with the
 * fake switched on), a copy step (`copy` + `commit`: fixture files copied into the project and committed),
 * and a probe (`probe`: a check on what `agent execute` left, not a CLI call). `agent execute` is the last
 * writer; the probes and the readers `agent show` and `agent list --past` follow it (`bug-133`). The run id
 * is derived, `<element-id>/adhoc/1` (`spec-016` §4.3: no step, the first record of a fresh project).
 * @param {string} template
 */
function agentRunSteps(template) {
  const run = '{agent.id}/adhoc/1';
  return [
    { args: ['init', '--template', template], exit: 0 },
    {
      args: ['memory', 'add', '--type', 'task', '--title', 'Agent run', ...JSON_FORMAT],
      exit: 0,
      json: true,
      capture: 'agent',
      expect: { path: 'docs/memory/task/{agent.id}.md' },
    },
    {
      copy: [
        ['custom/fake.yaml', '.wingfoil/agents/custom/fake.yaml'],
        ['fake-agent.cjs', 'test/fixtures/agents/fake-agent.cjs'],
      ],
      commit: 'smoke: the fake adapter custom/fake (spec-016 §2.7)',
    },
    {
      // `.invalid` is refused for an agent's email (bug-261), so the agent is not the smoke's own identity.
      args: ['dna', 'add', 'team.agents', '--value', 'Fake Agent', '--entry-email', 'fake-agent@example.com', '--entry-executes_as', 'developer', '--entry-adapter', 'fake'],
      exit: 0,
    },
    { args: ['agent', 'execute', '--element', 'task:{agent.id}', '--role', 'developer'], exit: 0, fakeAgent: true },
    { probe: 'record-commit', run },
    {
      args: ['agent', 'show', run, ...JSON_FORMAT],
      exit: 0,
      json: true,
      expect: {
        'run.id': run,
        'run.element': 'task:{agent.id}',
        'run.role': 'developer',
        'run.agent': 'Fake Agent',
        'run.adapter': 'custom/fake',
        'run.exit_status': 0,
      },
    },
    {
      args: ['agent', 'list', '--past', ...JSON_FORMAT],
      exit: 0,
      json: true,
      expect: { 'past.length': 1, 'past.0.id': run, 'past.0.adapter': 'custom/fake', 'diagnostics.length': 0 },
    },
    { probe: 'fake-read', run, role: 'developer' },
  ];
}

/** Spawn a command synchronously and capture its exit code and output. */
function spawn(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf-8' });
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? '',
    stderr: result.error ? String(result.error.message) : (result.stderr ?? ''),
  };
}

/**
 * spec-005 §3's error on stderr, as `{ error, hint }`: the one JSON object a structured refusal writes,
 * or the console `error: <reason>` line and its optional `hint: ` line. `null` when stderr carries neither.
 */
function parseError(stderr) {
  const text = stderr.trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.error === 'string') return parsed;
  } catch {
    // not the structured form: try the console one
  }
  const lines = text.split('\n');
  if (!lines[0]?.startsWith('error: ')) return null;
  const hint = lines.find((line) => line.startsWith('hint: '));
  return { error: lines[0].slice('error: '.length), ...(hint === undefined ? {} : { hint: hint.slice('hint: '.length) }) };
}

/** The value at a dotted path (`matches.0.id`; `length` of an array), or `undefined`. */
function valueAt(value, path) {
  return path.split('.').reduce((at, key) => (at === null || at === undefined ? undefined : at[key]), value);
}

/**
 * Replace a whole `'{<name>.<field>}'` string with that field of the JSON captured under `<name>`. Returns
 * `{ value }`, or `{ unresolved }` naming the placeholder when the capture or the field is missing.
 */
function resolveValue(value, captured) {
  const ref = typeof value === 'string' ? /^(.*)\{(\w+)\.(\w+)\}(.*)$/.exec(value) : null;
  if (!ref) return { value };
  const field = captured.get(ref[2])?.[ref[3]];
  if (typeof field !== 'string' || field === '') return { unresolved: `{${ref[2]}.${ref[3]}}` };
  return { value: `${ref[1]}${field}${ref[4]}` };
}

/** Resolve every arg of a step; `{ unresolved }` on the first one that cannot be. */
function resolveArgs(args, captured) {
  const resolved = [];
  for (const arg of args) {
    const one = resolveValue(arg, captured);
    if (one.unresolved !== undefined) return one;
    resolved.push(one.value);
  }
  return { args: resolved };
}

/**
 * Judge one step's run: the exit it declares; for exit 0, parseable JSON when asked; for a non-zero exit,
 * spec-005 §3's error on stderr; then every `expect` path in that JSON or error. `parsed` carries the
 * JSON for a later `capture`. An `expect` value's placeholder may name this step's own capture.
 */
function stepCheck(label, run, step, captured) {
  const firstLine = run.stderr.trim().split('\n')[0] ?? '';
  if (run.status !== step.exit) {
    return { label, ok: false, detail: `expected exit ${step.exit}, got exit ${run.status ?? 'spawn-error'}: ${firstLine}` };
  }
  let parsed;
  if (step.exit !== 0) {
    parsed = parseError(run.stderr);
    if (parsed === null) return { label, ok: false, detail: `exit ${run.status} with no spec-005 §3 error on stderr` };
  } else if (step.json) {
    try {
      parsed = JSON.parse(run.stdout);
    } catch {
      return { label, ok: false, detail: 'stdout is not valid JSON' };
    }
  }
  const scope = step.capture === undefined ? captured : new Map([...captured, [step.capture, parsed]]);
  const mismatches = [];
  for (const [path, declared] of Object.entries(step.expect ?? {})) {
    const resolved = resolveValue(declared, scope);
    const actual = valueAt(parsed, path);
    if (resolved.unresolved !== undefined) mismatches.push(`expected ${path}=${declared}, but ${resolved.unresolved} is not in any output`);
    else if (actual !== resolved.value) mismatches.push(`expected ${path}=${resolved.value}, got ${path}=${String(actual)}`);
  }
  if (mismatches.length > 0) return { label, ok: false, detail: mismatches.join('; ') };
  return { label, ok: true, detail: `exit ${run.status}`, parsed };
}

/**
 * Make `repo` a git repository with the smoke's identity. `null` when every command passed, else the one
 * failing check, labelled `<prefix> git <command>`.
 */
function setUpRepo(git, prefix) {
  for (const args of [
    ['init', '--quiet', '--initial-branch=main'],
    ['config', 'user.name', SMOKE_NAME],
    ['config', 'user.email', SMOKE_EMAIL],
    ['config', 'commit.gpgsign', 'false'],
  ]) {
    const run = git(args);
    if (run.status !== 0) return { label: `${prefix} git ${args[0]}`, ok: false, detail: `exit ${run.status}: ${run.stderr.trim()}` };
  }
  return null;
}

/** Fail a passing `check` when the working tree is not clean after its step; else append `, tree clean`. */
function requireCleanTree(check, git) {
  if (!check.ok) return check;
  const status = git(['status', '--porcelain']);
  const dirty = status.status === 0 ? status.stdout.trim() : status.stderr.trim();
  if (status.status !== 0 || dirty !== '') {
    return { ...check, ok: false, detail: `${check.detail}; working tree not clean after the step: ${dirty.split('\n').join(', ')}` };
  }
  return { ...check, detail: `${check.detail}, tree clean` };
}

/**
 * Run one CLI step in `repo`: resolve its placeholders, invoke it, judge it ({@link stepCheck}), require
 * a clean tree. Returns the check and the parsed JSON a `capture` keeps.
 */
function runCliStep(prefix, step, captured, invoke, repo, git, env) {
  const resolved = resolveArgs(step.args, captured);
  if (resolved.unresolved !== undefined) {
    const detail = `${resolved.unresolved} not found in an earlier step's JSON output`;
    return { check: { label: `${prefix} wingfoil ${step.args.join(' ')}`, ok: false, detail } };
  }
  const label = `${prefix} wingfoil ${resolved.args.join(' ')}`;
  const run = env === undefined ? invoke(resolved.args, repo) : invoke(resolved.args, repo, env);
  const { parsed, ...check } = stepCheck(label, run, step, captured);
  return { check: requireCleanTree(check, git), parsed };
}

/**
 * Run `steps` (default: the template's scenario) in a fresh throwaway git repository; returns one check
 * per step, each also requiring a clean working tree after it. Stops at the first failing check.
 */
function smokeTemplate(template, invoke, env, steps = smokeSteps(template)) {
  const checks = [];
  const repo = mkdtempSync(join(tmpdir(), 'wingfoil-smoke-'));
  try {
    const git = (args) => spawn('git', args, repo, env);
    const failed = setUpRepo(git, `[${template}]`);
    if (failed !== null) return [failed];
    const captured = new Map();
    for (const step of steps) {
      const { check, parsed } = runCliStep(`[${template}]`, step, captured, invoke, repo, git);
      checks.push(check);
      if (!check.ok) return checks;
      if (step.capture !== undefined) captured.set(step.capture, parsed);
    }
    return checks;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

/** A copy step: each `[from, to]` copied byte for byte from `fixtures` into `repo`, then committed. */
function runCopyStep(prefix, step, repo, git, fixtures) {
  const targets = step.copy.map(([, to]) => to);
  const label = `${prefix} commit ${targets.join(', ')}`;
  try {
    for (const [from, to] of step.copy) {
      mkdirSync(dirname(join(repo, to)), { recursive: true });
      copyFileSync(join(fixtures, from), join(repo, to));
    }
  } catch (error) {
    return { label, ok: false, detail: `copy failed: ${error.message}` };
  }
  for (const args of [['add', '--', ...targets], ['commit', '--quiet', '-m', step.commit]]) {
    const run = git(args);
    if (run.status !== 0) return { label, ok: false, detail: `git ${args[0]} exited ${run.status}: ${run.stderr.trim()}` };
  }
  return requireCleanTree({ label, ok: true, detail: 'commit ok' }, git);
}

/** The commits whose subject starts with {@link RECORD_SUBJECT}, as `{ sha, subject }`, newest first. */
function recordCommits(git) {
  // `--no-show-signature`: with `log.showSignature` set, signature lines would be read as commits (bug-291).
  const log = git(['log', '--no-show-signature', '--format=%H%x09%s']);
  if (log.status !== 0) return { error: `git log exited ${log.status}: ${log.stderr.trim()}` };
  const commits = log.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const tab = line.indexOf('\t');
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    })
    .filter((commit) => commit.subject.startsWith(RECORD_SUBJECT));
  return { commits };
}

/**
 * The `record-commit` probe: exactly one `agent: record` commit, `agent: record <run>`, changing only the
 * run log `docs/runs/<element-id>.jsonl` (`spec-016` §4.4).
 */
function probeRecordCommit(run, git) {
  const found = recordCommits(git);
  if (found.error !== undefined) return { ok: false, detail: found.error };
  if (found.commits.length !== 1) return { ok: false, detail: `expected exactly one "agent: record" commit, found ${found.commits.length}` };
  const [commit] = found.commits;
  if (commit.subject !== `${RECORD_SUBJECT}${run}`) return { ok: false, detail: `expected subject "${RECORD_SUBJECT}${run}", got "${commit.subject}"` };
  const runLog = `${SMOKE_RUNS_DIR}${run.split('/')[0]}.jsonl`;
  // `diff-tree`, not `show` of a commit: plumbing, which prints no signature (bug-291).
  const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit.sha]);
  const paths = changed.stdout.split('\n').filter((line) => line !== '');
  if (changed.status !== 0 || paths.length !== 1 || paths[0] !== runLog) {
    return { ok: false, detail: `expected the commit to change only ${runLog}, got ${paths.join(', ') || changed.stderr.trim()}` };
  }
  // No sha in a passing detail: a commit name depends on the clock, and the report must not (bug-134).
  return { ok: true, detail: `the only one, changing only ${runLog}` };
}

/** The lines the fake agent recorded, parsed, each with its 1-based line number; `[]` when it wrote none. */
function fakeRecord(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split('\n')
    .map((line, index) => ({ number: index + 1, line }))
    .filter(({ line }) => line !== '')
    .map(({ number, line }) => ({ number, record: JSON.parse(line) }));
}

/**
 * The `fake-read` probe: the fake recorded exactly one launch (not its `--version`, `--lookup` or
 * `--summary` calls), which connected to the `wingfoil` server and read, with no error, the session Resource
 * the bootstrap names — `wingfoil://session/<role>/task:<element-id>/<state>`, `<state>` being the commit the
 * run started from, the parent of its record commit — and the text it got is that element's context.
 */
function probeFakeRead(run, role, git, recordFile) {
  let numbered;
  try {
    numbered = fakeRecord(recordFile);
  } catch (error) {
    return { ok: false, detail: `the fake agent's record is not JSON lines: ${error.message}` };
  }
  // task-282 (task-243 review, handover 3): a line without an `argv` array fails the probe with a reason
  // instead of throwing out of `runSmoke`.
  const malformed = numbered.find(({ record }) => record === null || typeof record !== 'object' || !Array.isArray(record.argv));
  if (malformed !== undefined) return { ok: false, detail: `line ${malformed.number} of the fake agent's record has no argv` };
  const lines = numbered.map(({ record }) => record);
  const launches = lines.filter((line) => !['--version', '--lookup', '--summary'].some((flag) => line.argv.includes(flag)));
  if (launches.length === 0) return { ok: false, detail: 'the fake agent recorded no launch' };
  if (launches.length !== 1) return { ok: false, detail: `expected one launch of the fake agent, found ${launches.length}` };
  const [launch] = launches;
  if (launch.failure !== undefined) return { ok: false, detail: `the fake agent failed: ${launch.failure}` };
  const mcp = launch.mcp;
  if (mcp === null || mcp === undefined) return { ok: false, detail: 'the fake agent did not connect to an MCP server' };
  if (mcp.server?.name !== 'wingfoil') return { ok: false, detail: `expected the "wingfoil" server, got "${mcp.server?.name}"` };
  if (mcp.error !== undefined) return { ok: false, detail: `the server answered an error: ${mcp.error.message}` };
  const found = recordCommits(git);
  if (found.error !== undefined) return { ok: false, detail: found.error };
  const commit = found.commits.find((c) => c.subject === `${RECORD_SUBJECT}${run}`);
  if (commit === undefined) return { ok: false, detail: `no "${RECORD_SUBJECT}${run}" commit` };
  const parent = git(['rev-parse', `${commit.sha}^`]);
  if (parent.status !== 0) return { ok: false, detail: `git rev-parse exited ${parent.status}: ${parent.stderr.trim()}` };
  const state = parent.stdout.trim();
  const element = `task:${run.split('/')[0]}`;
  const uri = `wingfoil://session/${role}/${element}/${state}`;
  if (mcp.resource?.uri !== uri) return { ok: false, detail: `expected the Resource ${uri}, got ${mcp.resource?.uri}` };
  const header = `<!-- format: 1 | role: ${role} | element: ${element} | state: ${state} -->`;
  if (typeof mcp.text !== 'string' || !mcp.text.includes(header)) return { ok: false, detail: `the Resource text lacks "${header}"` };
  return { ok: true, detail: `read wingfoil://session/${role}/${element}/<the run's state_ref> from the wingfoil server` };
}

/**
 * The agent run (task-243, `spec-016` §2.7): run `steps` (default {@link agentRunSteps}) in its own fresh
 * throwaway git repository; every check is labelled `[<template>/agent] …`, a CLI or copy step requires a
 * clean tree after it, and the run stops at the first failing check. Each CLI step gets its environment
 * as `invoke`'s third argument: `env` without any `WINGFOIL_FAKE_AGENT_*` variable, plus
 * `WINGFOIL_FAKE_AGENT_CONNECT=1` and `WINGFOIL_FAKE_AGENT_RECORD=<a file outside the project>` on a
 * `fakeAgent` step — so the fake's behaviour is the smoke's, never inherited.
 * @returns {Array<{ label: string, ok: boolean, detail: string }>}
 */
function smokeAgentRun(template, invoke, env, steps = agentRunSteps(template), fixtures = AGENT_FIXTURES) {
  const prefix = `[${template}/agent]`;
  const checks = [];
  const repo = mkdtempSync(join(tmpdir(), 'wingfoil-smoke-agent-'));
  const outside = mkdtempSync(join(tmpdir(), 'wingfoil-smoke-fake-'));
  const recordFile = join(outside, 'fake-agent.jsonl');
  const base = Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith(FAKE_AGENT_ENV_PREFIX)));
  const fake = { ...base, [`${FAKE_AGENT_ENV_PREFIX}CONNECT`]: '1', [`${FAKE_AGENT_ENV_PREFIX}RECORD`]: recordFile };
  try {
    const git = (args) => spawn('git', args, repo, base);
    const failed = setUpRepo(git, prefix);
    if (failed !== null) return [failed];
    const captured = new Map();
    for (const step of steps) {
      if ('args' in step) {
        const { check, parsed } = runCliStep(prefix, step, captured, invoke, repo, git, step.fakeAgent === true ? fake : base);
        checks.push(check);
        if (!check.ok) return checks;
        if (step.capture !== undefined) captured.set(step.capture, parsed);
      } else if ('copy' in step) {
        const check = runCopyStep(prefix, step, repo, git, fixtures);
        checks.push(check);
        if (!check.ok) return checks;
      } else {
        const resolved = resolveValue(step.run, captured);
        const run = resolved.unresolved === undefined ? resolved.value : step.run;
        const label =
          step.probe === 'record-commit'
            ? `${prefix} one agent: record commit for ${run}`
            : `${prefix} the fake agent read the session Resource for ${run}`;
        const result =
          resolved.unresolved !== undefined
            ? { ok: false, detail: `${resolved.unresolved} not found in an earlier step's JSON output` }
            : step.probe === 'record-commit'
              ? probeRecordCommit(run, git)
              : probeFakeRead(run, step.role ?? 'developer', git, recordFile);
        checks.push({ label, ...result });
        if (!result.ok) return checks;
      }
    }
    return checks;
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

/**
 * The `$ wingfoil …` commands of a journey transcript, each with the `[exit N]` lib.sh printed after it
 * (`null` when none followed).
 * @param {string} stdout
 * @returns {Array<{ command: string, exit: number | null }>}
 */
function journeyTranscript(stdout) {
  const entries = [];
  for (const line of stdout.split('\n')) {
    if (line.startsWith('$ wingfoil ')) {
      entries.push({ command: line.slice('$ wingfoil '.length), exit: null });
      continue;
    }
    const exit = /^\[exit (\d+)\]$/.exec(line);
    const last = entries[entries.length - 1];
    if (exit !== null && last !== undefined && last.exit === null) last.exit = Number(exit[1]);
  }
  return entries;
}

/** The first of {@link JOURNEY_COMMANDS} not found, in order, among the transcript's exit-0 commands; else `null`. */
function missingJourneyCommand(entries) {
  let at = 0;
  for (const expected of JOURNEY_COMMANDS) {
    const [head, tail] = expected.split(' … ');
    const found = entries.findIndex(
      (entry, i) => i >= at && entry.exit === 0 && entry.command.startsWith(head) && (tail === undefined || entry.command.includes(tail)),
    );
    if (found === -1) return expected;
    at = found + 1;
  }
  return null;
}

/** `text` quoted for a POSIX shell: single quotes, each embedded one closed, escaped and reopened. */
function shellQuote(text) {
  return `'${String(text).replace(/'/g, "'\\''")}'`;
}

/**
 * The Journey 4 run (task-242, `bug-328`): `bash <script>` with a `wingfoil` shim that execs `argv` (the CLI
 * under test, program first) on `PATH`, and `WINGFOIL=wingfoil` and `WINGFOIL_EXAMPLE_TEMPLATE=<template>` set
 * over `env`, so neither is ever inherited; the shim on `PATH` keeps a path with spaces out of lib.sh's
 * word-split `$WINGFOIL`. The script makes and deletes its own project. One check, never a throw.
 * @param {string} template
 * @param {readonly string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [script]
 * @returns {{ label: string, ok: boolean, detail: string }}
 */
function smokeJourney(template, argv, env, script = JOURNEY_SCRIPT) {
  const label = `[${template}/journey] ${JOURNEY_LABEL}`;
  let shimDir;
  try {
    shimDir = mkdtempSync(join(tmpdir(), 'wingfoil-smoke-journey-'));
    const shim = join(shimDir, 'wingfoil');
    writeFileSync(shim, `#!/bin/sh\nexec ${argv.map(shellQuote).join(' ')} "$@"\n`);
    chmodSync(shim, 0o755);
    const runEnv = {
      ...env,
      PATH: `${shimDir}${delimiter}${env.PATH ?? ''}`,
      WINGFOIL: 'wingfoil',
      WINGFOIL_EXAMPLE_TEMPLATE: template,
    };
    const run = spawnSync('bash', [script], { cwd: shimDir, env: runEnv, encoding: 'utf-8' });
    if (run.error) return { label, ok: false, detail: `could not run bash: ${run.error.message}` };
    const stdout = run.stdout ?? '';
    if (run.status !== 0) {
      const errLines = (run.stderr ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
      const failLines = errLines.filter((line) => line.startsWith('FAIL: '));
      const reason = failLines[failLines.length - 1] ?? errLines[errLines.length - 1] ?? 'no output on stderr';
      return { label, ok: false, detail: `exit ${run.status ?? run.signal}: ${reason}` };
    }
    const lines = stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '');
    const okLine = lines[lines.length - 1];
    if (okLine === undefined || !okLine.startsWith('OK: ')) return { label, ok: false, detail: 'exit 0, but no "OK: " line ends its output' };
    const entries = journeyTranscript(stdout);
    const missing = missingJourneyCommand(entries);
    if (missing !== null) return { label, ok: false, detail: `the transcript lacks: ${missing}` };
    return { label, ok: true, detail: `exit 0, ${entries.length} wingfoil commands, ${okLine}` };
  } catch (error) {
    return { label, ok: false, detail: `could not run the journey: ${error.message}` };
  } finally {
    if (shimDir !== undefined) rmSync(shimDir, { recursive: true, force: true });
  }
}

/**
 * Throw unless `commit` is a commit name an expected stamp may carry ({@link COMMIT_NAME_RE}).
 * @param {string} commit
 */
function assertCommitName(commit) {
  if (!COMMIT_NAME_RE.test(commit)) {
    throw new Error(`expected commit "${commit}" is not a commit name (a full sha: 40 or 64 lowercase hex digits)`);
  }
}

/**
 * The `--version` check: the stamp `<semver> (<sha>)` (task-192, `dl-111` Action 3). With an expected
 * commit the whole stamp must match exactly (task-254, `bug-235`); without one only its semver is
 * pinned, and a bare `<semver>` — what builds before 0.3 print — is accepted too.
 */
function versionCheck(run, expectedVersion, expectedCommit) {
  const expected = expectedCommit === undefined ? expectedVersion : `${expectedVersion} (${expectedCommit})`;
  const actual = run.stdout.trim();
  const matches =
    expectedCommit === undefined
      ? actual === expectedVersion || versionOfStamp(actual) === expectedVersion
      : actual === expected;
  const ok = run.status === 0 && matches;
  return {
    label: `wingfoil --version = ${expected}`,
    ok,
    detail: ok ? 'match' : `expected "${expected}", got "${actual}" (exit ${run.status})`,
  };
}

/**
 * Run the whole smoke: per template, its scenario ({@link smokeTemplate}), its agent run
 * ({@link smokeAgentRun}, task-243), then its Journey 4 run ({@link smokeJourney}, task-242). Stops at the
 * first failing check.
 * @param {{ command: string, commandArgs?: readonly string[], env?: NodeJS.ProcessEnv,
 *           expectedVersion?: string, expectedCommit?: string, log?: (line: string) => void }} options
 * @returns {{ ok: boolean, checks: ReadonlyArray<{ label: string, ok: boolean, detail: string }> }}
 */
function runSmoke(options) {
  if (options.expectedCommit !== undefined) {
    if (options.expectedVersion === undefined) throw new Error('expectedCommit requires expectedVersion');
    assertCommitName(options.expectedCommit);
  }
  const env = options.env ?? process.env;
  const prefix = options.commandArgs ?? [];
  const log = options.log ?? (() => undefined);
  // A step may carry its own environment (the agent run's fake switches, task-243); every other step gets `env`.
  const invoke = (args, cwd, stepEnv = env) => spawn(options.command, [...prefix, ...args], cwd, stepEnv);
  const checks = [];
  const record = (check) => {
    checks.push(check);
    log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.label} — ${check.detail}`);
    return check.ok;
  };
  const done = () => ({ ok: checks.every((c) => c.ok), checks });

  const help = invoke(['--help'], tmpdir());
  const helpCheck =
    help.status !== 0
      ? { label: 'wingfoil --help', ok: false, detail: `exit ${help.status ?? 'spawn-error'}: ${help.stderr.trim().split('\n')[0] ?? ''}` }
      : help.stdout.includes('Usage: wingfoil')
        ? { label: 'wingfoil --help', ok: true, detail: 'exit 0' }
        : { label: 'wingfoil --help', ok: false, detail: 'stdout does not contain "Usage: wingfoil"' };
  if (!record(helpCheck)) return done();

  if (options.expectedVersion !== undefined) {
    const check = versionCheck(invoke(['--version'], tmpdir()), options.expectedVersion, options.expectedCommit);
    if (!record(check)) return done();
  }

  for (const template of SMOKE_TEMPLATES) {
    for (const check of smokeTemplate(template, invoke, env)) {
      if (!record(check)) return done();
    }
    for (const check of smokeAgentRun(template, invoke, env)) {
      if (!record(check)) return done();
    }
    if (!record(smokeJourney(template, [options.command, ...prefix], env))) return done();
  }
  return done();
}

/** A table cell: no newline, and `|` escaped so it cannot end the cell. */
function cell(text) {
  return String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/**
 * The Markdown report `--report` writes (`bug-134`): what was driven, the verdict, and every check in run
 * order. Nothing in it comes from a clock, so the same run gives the same bytes.
 * @param {{ ok: boolean, checks: ReadonlyArray<{ label: string, ok: boolean, detail: string }> }} report
 * @param {{ command: readonly string[], expectedVersion?: string, expectedCommit?: string }} meta
 * @returns {string}
 */
function formatReport(report, meta) {
  const passed = report.checks.filter((c) => c.ok).length;
  const failed = report.checks.find((c) => !c.ok);
  const verdict = report.ok
    ? `**PASS** (${passed}/${report.checks.length} checks ok)`
    : `**FAIL** (${passed}/${report.checks.length} checks ok; stopped at: ${cell(failed?.label ?? '')})`;
  return [
    '# e2e-smoke report',
    '',
    'Written by `scripts/e2e-smoke.cjs --report` — the executable form of `.wingfoil/workflows/custom/e2e-smoke.yaml`',
    '(`dl-023`, `dl-099` §3). The gate hard-rejects: a FAIL blocks `release-submit`.',
    '',
    `- Command: \`${meta.command.join(' ')}\``,
    `- Expected version: ${meta.expectedVersion === undefined ? 'not checked' : `\`${meta.expectedVersion}\``}`,
    `- Expected commit: ${meta.expectedCommit === undefined ? 'not checked' : `\`${meta.expectedCommit}\``}`,
    `- Templates: ${SMOKE_TEMPLATES.join(', ')}`,
    '- Agent run: `agent execute` through the fake adapter `custom/fake` in a fresh project per template (spec-016 §2.7)',
    '- Journey 4: `docs/examples/06-workflow-approval/run.sh` in a fresh project per template (task-242)',
    '',
    `Result: ${verdict}`,
    '',
    '| # | Result | Check | Detail |',
    '|---|--------|-------|--------|',
    ...report.checks.map((c, i) => `| ${i + 1} | ${c.ok ? 'ok' : 'FAIL'} | ${cell(c.label)} | ${cell(c.detail)} |`),
    '',
  ].join('\n');
}

/**
 * The `<semver>` of a `--version` stamp `<semver> (<sha>)`, or `null` when `stamp` has another shape.
 *
 * @param {string} stamp
 * @returns {string | null}
 */
function versionOfStamp(stamp) {
  const match = /^(\S+) \((?:[0-9a-f]{7,64}(?:-dirty)?|unknown)\)$/.exec(stamp);
  return match ? match[1] : null;
}

/** Parse `[--candidate | --expect-version X [--expect-commit SHA]] [--report PATH] [-- command args...]`. */
function parseSmokeArgs(argv) {
  const separator = argv.indexOf('--');
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? ['wingfoil'] : argv.slice(separator + 1);
  const options = { command: command[0] ?? 'wingfoil', commandArgs: command.slice(1) };
  for (let i = 0; i < own.length; i += 1) {
    if (own[i] === '--expect-version' && own[i + 1]) {
      options.expectedVersion = own[i + 1];
      i += 1;
    } else if (own[i] === '--expect-commit' && own[i + 1]) {
      assertCommitName(own[i + 1]);
      options.expectedCommit = own[i + 1];
      i += 1;
    } else if (own[i] === '--candidate') {
      options.candidate = true;
    } else if (own[i] === '--report' && own[i + 1]) {
      options.reportPath = own[i + 1];
      i += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${own[i]}`);
    }
  }
  if (options.expectedCommit !== undefined && options.expectedVersion === undefined) {
    throw new Error('--expect-commit requires --expect-version');
  }
  if (options.candidate && (options.expectedVersion !== undefined || separator !== -1)) {
    throw new Error('--candidate takes the stamp and the command from the candidate: no --expect-version, --expect-commit or -- <command>');
  }
  return options;
}

/**
 * `--candidate` (task-219, `dl-099` §1; the `task-207` review handover): smoke the release candidate — the
 * checked-out commit — as a user installs it, with its build stamp bound. When no pack input has a change
 * (`status`, {@link candidateStatus}: a change there would make the tarball differ from the commit; task-282,
 * `bug-310`), remove the checkout's `dist/` (`removeBuild`, so the pack rebuilds it from the commit alone),
 * pack the commit (`npm pack`: its `prepack` builds `dist/` and the stamp) into a throwaway directory,
 * install that tarball into a throwaway prefix there, and return the smoke's options: the installed bin — an
 * absolute path, as the throwaway step directories need — and the stamp it must print, `package.json`'s
 * version and `HEAD`. `cleanup` removes the directory; a failed removal, pack or install removes it before
 * rethrowing.
 *
 * @param {{ status: () => string, head: () => string, version: () => string, makeDir: () => string,
 *           removeBuild: () => void, pack: (destination: string) => string,
 *           install: (tarball: string, prefix: string) => void, removeDir: (dir: string) => void }} effects
 * @returns {{ command: string, commandArgs: string[], expectedVersion: string, expectedCommit: string, cleanup: () => void }}
 */
function prepareCandidate(effects) {
  const dirty = effects.status().trim();
  if (dirty !== '') {
    throw new Error(`--candidate: a pack input has uncommitted changes, so the packed build would not be the candidate commit: ${dirty.split('\n').join(', ')}`);
  }
  const expectedCommit = effects.head();
  assertCommitName(expectedCommit);
  const expectedVersion = effects.version();
  const dir = effects.makeDir();
  const cleanup = () => effects.removeDir(dir);
  try {
    const prefix = join(dir, 'prefix');
    effects.removeBuild();
    effects.install(effects.pack(join(dir, 'pack')), prefix);
    return { command: join(prefix, 'bin', 'wingfoil'), commandArgs: [], expectedVersion, expectedCommit, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

/**
 * The porcelain status of the pack inputs ({@link PACK_INPUTS}) in `root` — `''` when none has a change,
 * tracked or untracked (task-282, `bug-310`, task-219 D4 (c)). Throws when git cannot answer.
 *
 * @param {string} root
 * @returns {string}
 */
function candidateStatus(root) {
  const status = inputStatus(root, PACK_INPUTS);
  if (status === null) throw new Error('--candidate: git could not report the status of the pack inputs');
  return status;
}

/**
 * Remove `<root>/dist` (task-282, `bug-310`): `tsc` never deletes the module of a removed source, so a pack
 * that starts from an existing `dist/` would ship it. A no-op when there is none.
 *
 * @param {string} root
 */
function removeBuildOutput(root) {
  rmSync(join(root, 'dist'), { recursive: true, force: true });
}

/* istanbul ignore next -- the real git/npm effects of `--candidate`; prepareCandidate is tested with fakes. */
/**
 * The real effects of {@link prepareCandidate}, in `repoRoot`: git for the tree and `HEAD`, `npm pack` and
 * `npm install --global --prefix` (the same two steps as `ci.yml`'s `e2e-smoke` job).
 * @param {string} repoRoot
 */
function realCandidateEffects(repoRoot) {
  const must = (command, args, cwd) => {
    const run = spawnSync(command, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] });
    if (run.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${run.status ?? run.error?.message}`);
    return run.stdout;
  };
  return {
    status: () => candidateStatus(repoRoot),
    head: () => must('git', ['rev-parse', 'HEAD'], repoRoot).trim(),
    version: () => JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')).version,
    makeDir: () => mkdtempSync(join(tmpdir(), 'wingfoil-candidate-')),
    removeBuild: () => removeBuildOutput(repoRoot),
    pack: (destination) => {
      mkdirSync(destination, { recursive: true });
      const name = must('npm', ['pack', '--silent', '--pack-destination', destination], repoRoot).trim().split('\n').pop();
      return join(destination, name);
    },
    install: (tarball, prefix) => {
      must('npm', ['install', '--global', '--prefix', prefix, tarball], repoRoot);
    },
    removeDir: (dir) => rmSync(dir, { recursive: true, force: true }),
  };
}

if (require.main === module) {
  let parsedArgs;
  try {
    parsedArgs = parseSmokeArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 2;
  }
  if (parsedArgs !== undefined) {
    const { reportPath, candidate, ...parsed } = parsedArgs;
    let prepared;
    try {
      prepared = candidate ? prepareCandidate(realCandidateEffects(dirname(__dirname))) : undefined;
    } catch (error) {
      // A candidate that cannot be packed or installed is a failed check (exit 1), not a bad argument.
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = 1;
    }
    if (!candidate || prepared !== undefined) {
      const { cleanup, ...options } = prepared ?? { ...parsed, cleanup: () => undefined };
      try {
        const report = runSmoke({ ...options, log: (line) => process.stdout.write(`${line}\n`) });
        if (reportPath !== undefined) {
          // `--candidate`'s bin lives in a throwaway directory: the report names the candidate, not that path,
          // so the same run still gives the same bytes.
          const command = candidate ? ['wingfoil (the packed candidate, installed into a throwaway prefix)'] : [options.command, ...options.commandArgs];
          mkdirSync(dirname(reportPath), { recursive: true });
          writeFileSync(reportPath, formatReport(report, { ...options, command }));
        }
        process.exitCode = report.ok ? 0 : 1;
      } catch (error) {
        // The header's contract: 1 = a check failed, 2 = anything else (a bad argument, a report that cannot
        // be written) — reported as one `error:` line, never a stack trace (task-219 review fix 5).
        process.stderr.write(`error: ${error.message}\n`);
        process.exitCode = 2;
      } finally {
        cleanup();
      }
    }
  }
}

module.exports = {
  AGENT_FIXTURES,
  JOURNEY_COMMANDS,
  JOURNEY_SCRIPT,
  SMOKE_TEMPLATES,
  agentRunSteps,
  assertCommitName,
  candidateStatus,
  formatReport,
  parseSmokeArgs,
  prepareCandidate,
  probeFakeRead,
  removeBuildOutput,
  runSmoke,
  smokeAgentRun,
  smokeJourney,
  smokeSteps,
  smokeTemplate,
};

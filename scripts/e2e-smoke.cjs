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
 * the `e2e-smoke-passed` binding) packs the clean checked-out commit, installs it into a throwaway prefix
 * and smokes that bin with `--expect-version` = `package.json`'s version and `--expect-commit` = `HEAD`
 * (`dl-099` §1: the candidate's packed tarball, not the working tree).
 * Exit codes: 0 every check passed, 1 a check failed, 2 a bad argument.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');

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
 * Run `steps` (default: the template's scenario) in a fresh throwaway git repository; returns one check
 * per step, each also requiring a clean working tree after it. Stops at the first failing check.
 */
function smokeTemplate(template, invoke, env, steps = smokeSteps(template)) {
  const checks = [];
  const repo = mkdtempSync(join(tmpdir(), 'wingfoil-smoke-'));
  try {
    const git = (args) => spawn('git', args, repo, env);
    for (const args of [
      ['init', '--quiet', '--initial-branch=main'],
      ['config', 'user.name', SMOKE_NAME],
      ['config', 'user.email', SMOKE_EMAIL],
      ['config', 'commit.gpgsign', 'false'],
    ]) {
      const run = git(args);
      if (run.status !== 0) return [{ label: `[${template}] git ${args[0]}`, ok: false, detail: `exit ${run.status}: ${run.stderr.trim()}` }];
    }
    const captured = new Map();
    for (const step of steps) {
      const resolved = resolveArgs(step.args, captured);
      if (resolved.unresolved !== undefined) {
        const detail = `${resolved.unresolved} not found in an earlier step's JSON output`;
        checks.push({ label: `[${template}] wingfoil ${step.args.join(' ')}`, ok: false, detail });
        return checks;
      }
      const label = `[${template}] wingfoil ${resolved.args.join(' ')}`;
      const { parsed, ...check } = stepCheck(label, invoke(resolved.args, repo), step, captured);
      if (check.ok) {
        const status = git(['status', '--porcelain']);
        const dirty = status.status === 0 ? status.stdout.trim() : status.stderr.trim();
        if (status.status !== 0 || dirty !== '') {
          check.ok = false;
          check.detail = `${check.detail}; working tree not clean after the step: ${dirty.split('\n').join(', ')}`;
        } else {
          check.detail = `${check.detail}, tree clean`;
        }
      }
      checks.push(check);
      if (!check.ok) return checks;
      if (step.capture !== undefined) captured.set(step.capture, parsed);
    }
    return checks;
  } finally {
    rmSync(repo, { recursive: true, force: true });
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
 * Run the whole smoke. Stops at the first failing check.
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
  const invoke = (args, cwd) => spawn(options.command, [...prefix, ...args], cwd, env);
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
 * checked-out commit — as a user installs it, with its build stamp bound. On a clean working tree (a dirty
 * one would stamp `<sha>-dirty`), pack the commit (`npm pack`: its `prepack` builds `dist/` and the stamp)
 * into a throwaway directory, install that tarball into a throwaway prefix there, and return the smoke's
 * options: the installed bin — an absolute path, as the throwaway step directories need — and the stamp it
 * must print, `package.json`'s version and `HEAD`. `cleanup` removes the directory; a failed pack or
 * install removes it before rethrowing.
 *
 * @param {{ status: () => string, head: () => string, version: () => string, makeDir: () => string,
 *           pack: (destination: string) => string, install: (tarball: string, prefix: string) => void,
 *           removeDir: (dir: string) => void }} effects
 * @returns {{ command: string, commandArgs: string[], expectedVersion: string, expectedCommit: string, cleanup: () => void }}
 */
function prepareCandidate(effects) {
  const dirty = effects.status().trim();
  if (dirty !== '') {
    throw new Error(`--candidate: the working tree is not clean, so the build would not be the candidate commit: ${dirty.split('\n').join(', ')}`);
  }
  const expectedCommit = effects.head();
  assertCommitName(expectedCommit);
  const expectedVersion = effects.version();
  const dir = effects.makeDir();
  const cleanup = () => effects.removeDir(dir);
  try {
    const prefix = join(dir, 'prefix');
    effects.install(effects.pack(join(dir, 'pack')), prefix);
    return { command: join(prefix, 'bin', 'wingfoil'), commandArgs: [], expectedVersion, expectedCommit, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
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
    status: () => must('git', ['status', '--porcelain'], repoRoot),
    head: () => must('git', ['rev-parse', 'HEAD'], repoRoot).trim(),
    version: () => JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')).version,
    makeDir: () => mkdtempSync(join(tmpdir(), 'wingfoil-candidate-')),
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
      let report;
      try {
        report = runSmoke({ ...options, log: (line) => process.stdout.write(`${line}\n`) });
      } finally {
        cleanup();
      }
      if (reportPath !== undefined) {
        // `--candidate`'s bin lives in a throwaway directory: the report names the candidate, not that path,
        // so the same run still gives the same bytes.
        const command = candidate ? ['wingfoil (the packed candidate, installed into a throwaway prefix)'] : [options.command, ...options.commandArgs];
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, formatReport(report, { ...options, command }));
      }
      process.exitCode = report.ok ? 0 : 1;
    }
  }
}

module.exports = { SMOKE_TEMPLATES, assertCommitName, formatReport, parseSmokeArgs, prepareCandidate, runSmoke, smokeSteps, smokeTemplate };

#!/usr/bin/env node
/**
 * `npm run publish:staging` — spec-015 §2/§3 stages 2–3, adr-009 §3: the local-first staging flow.
 *
 *   1. pack the package (or take `--tarball`, which CI passes: the gate job's artifact);
 *   2. install and start an ephemeral Verdaccio on http://localhost:4873/ with its storage, config and
 *      users inside a throwaway work dir;
 *   3. register a throwaway user, keep its token in a work-dir `.npmrc` (never in the repo, never in `~`);
 *   4. `npm publish <tarball>` to staging with provenance explicitly off (no OIDC issuer at staging;
 *      `publishConfig.provenance: true` would otherwise apply, see task-059's handoff);
 *   5. `npm install --global wingfoil@<version>` from staging into a work-dir prefix and cache;
 *   6. run the dl-023 smoke (`scripts/e2e-smoke.cjs`) against the `wingfoil` now on PATH — with
 *      `--expect-commit <sha>` (CI: `"$GITHUB_SHA"`), its `--version` must be exactly
 *      `<version> (<sha>)`, so a tarball not built from that clean commit fails here (task-254,
 *      `bug-235`, `dl-111`); without it the stamp's commit is not checked, and the run says so;
 *   7. tear down — remove the token, stop Verdaccio, delete the work dir — on success, on every
 *      failure, and on an interrupt: `SIGINT`, `SIGTERM` or `SIGHUP` delivered to this script runs the
 *      same teardown and then re-raises the signal, so the run still dies with the conventional
 *      `128 + N` status (task-083, `bug-059`). The one case NOT covered is `SIGKILL`, which POSIX
 *      forbids catching: nothing can tear down after it, which is why the token is removed first, so
 *      the credential is never the thing that outlives the run.
 *
 * The same script runs on a developer machine and in `.github/workflows/publish.yml`'s stage job; that is
 * the point (adr-009: no debugging CI through throwaway commits). It needs network access to npmjs (to
 * install Verdaccio and to proxy the package's dependencies) but never publishes anywhere except the
 * localhost registry it started, and it ignores any npm credentials in the calling environment.
 * Publishing a tarball runs no lifecycle scripts, so `prepublishOnly` is not re-run here — run the gate
 * (`npm run prepublishOnly`) first, as the workflow's gate job does. POSIX only (CI runs ubuntu).
 *
 *   8. with `--transcript <path>`, write this script's own log lines there (task-219): the transcript the
 *      `release-publishing` `staging-rehearsal` phase produces, on a failure too.
 *
 * `--check-transcript <path>` runs none of the above: it is that phase's `checks.post`
 * (`staging-rehearsal-passed`, `.wingfoil/workflows/bindings.yaml`). Exit 0 when the transcript's closing
 * line is the success line for `package.json`'s `name@version` and its smoke checked the stamp's commit
 * (`--expect-commit`), printing that commit — the candidate; exit 1 otherwise, the reason on stderr. It is
 * strict (task-282, `bug-311`): a line recording a failure (`FAIL`, `FAILED`), a `--version` line for another
 * stamp, or two distinct commits fail it.
 *
 * `--check-evidence-only <path> --evidence <prefix/> […]` (task-282, `bug-312`) is `release-publishing.tag`'s
 * `evidence-only-since-candidate` pre-check: the transcript must pass as above, the commit it names must be
 * an ancestor of `HEAD`, and every path `git diff --name-only <candidate>..HEAD` lists (run in the current
 * directory) must start with an `--evidence` prefix — the binding declares them; exit 1 naming the paths
 * that require a re-cut, 2 on a bad argument.
 *
 * Without `--tarball`, step 1 packs the checkout: a change under the pack inputs (`PACK_INPUTS`,
 * `scripts/write-build-info.cjs`) is refused and `dist/` is removed first, so the pack rebuilds it from the
 * commit alone (task-282, `bug-310`).
 *
 * Usage: npm run publish:staging [-- [--tarball path/to/wingfoil-X.Y.Z.tgz] [--expect-commit <sha>] [--transcript <path>]]
 *        node scripts/publish-staging.cjs --check-transcript <path>
 *        node scripts/publish-staging.cjs --check-evidence-only <path> --evidence <prefix/> [--evidence <prefix/> ...]
 */
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, dirname, join, resolve } = require('node:path');

const { assertCommitName, removeBuildOutput, runSmoke } = require('./e2e-smoke.cjs');
const { PACK_INPUTS, inputStatus } = require('./write-build-info.cjs');

/** The transient staging registry address (spec-015 §1/§5) — passed as `--registry`, stored nowhere. */
const STAGING_REGISTRY = 'http://localhost:4873/';
/** Verdaccio release line used for staging (adr-009: MIT-licensed OSS). */
const VERDACCIO_PACKAGE = 'verdaccio@6';
/** How long Verdaccio gets to answer `/-/ping` before staging gives up. */
const REGISTRY_START_TIMEOUT_MS = 60_000;
/**
 * How long a stopped child gets to honour `SIGTERM` before `SIGKILL` (dl-057 item c). An order of
 * magnitude above a healthy Verdaccio's shutdown, and well below {@link REGISTRY_START_TIMEOUT_MS},
 * so the escalation can never fire before the start timeout that may call it.
 */
const REGISTRY_STOP_TIMEOUT_MS = 10_000;
/** How long `SIGKILL` gets before {@link stopProcess} resolves regardless (dl-057 item c). */
const SIGKILL_GRACE_MS = 2_000;
/**
 * The signals that must run teardown before this process dies (task-083, `bug-059`). Chosen from what
 * actually delivers them, not from the list of what exists:
 *
 * - `SIGINT` — Ctrl-C, the way a developer ends a run that spends a minute installing Verdaccio, and
 *   the case `bug-059` measured;
 * - `SIGTERM` — bare `kill`, `timeout(1)`, `docker stop`, systemd, and the escalation a CI runner uses
 *   on a cancelled or timed-out step. Handling both means the runner's exact escalation order need not
 *   be guessed: whichever arrives first, teardown runs;
 * - `SIGHUP` — a closed terminal or a dropped SSH session, which leaks in exactly the same way with
 *   nobody present to notice the orphan.
 *
 * Deliberately absent: `SIGKILL`, which POSIX forbids catching (see the header — this script does not
 * claim to cover it); `SIGQUIT`, whose contract is *terminate now and dump core*, so honouring the
 * non-graceful exit is correct rather than a gap; and `SIGUSR1`, which node reserves for the inspector.
 */
const TEARDOWN_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

/** Every file and directory one staging run uses, all under its work dir. */
function stagingPaths(root) {
  return {
    root,
    storage: join(root, 'storage'),
    htpasswd: join(root, 'htpasswd'),
    config: join(root, 'verdaccio.yaml'),
    tools: join(root, 'tools'),
    pack: join(root, 'pack'),
    userconfig: join(root, 'npmrc'),
    globalconfig: join(root, 'npmrc-global'),
    cache: join(root, 'npm-cache'),
    prefix: join(root, 'prefix'),
  };
}

/**
 * Verdaccio config. The package under test gets NO uplink, so the smoke can only ever install the tarball
 * staged by this run — never a same-named package from npmjs; everything else proxies npmjs so the
 * package's dependencies resolve.
 */
function verdaccioConfig(paths, packageName = 'wingfoil') {
  return [
    `storage: ${JSON.stringify(paths.storage)}`,
    'auth:',
    '  htpasswd:',
    `    file: ${JSON.stringify(paths.htpasswd)}`,
    '    max_users: 1',
    'uplinks:',
    '  npmjs:',
    '    url: https://registry.npmjs.org/',
    'packages:',
    `  '${packageName}':`,
    '    access: $all',
    '    publish: $authenticated',
    "  '**':",
    '    access: $all',
    '    publish: $authenticated',
    '    proxy: npmjs',
    'listen: localhost:4873',
    'log: { type: stdout, format: pretty, level: warn }',
    '',
  ].join('\n');
}

/**
 * The environment every staging subprocess runs with: the caller's environment minus inherited npm
 * configuration (`npm run` injects `npm_config_*`) and registry credentials, with npm's user/global
 * config, cache and global prefix pointed into the work dir, and the prefix's `bin` first on PATH.
 */
function stagingEnv(base, paths) {
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    const lower = key.toLowerCase();
    if (lower.startsWith('npm_config_') || lower === 'npm_token' || lower === 'node_auth_token') continue;
    env[key] = value;
  }
  env.npm_config_userconfig = paths.userconfig;
  env.npm_config_globalconfig = paths.globalconfig;
  env.npm_config_cache = paths.cache;
  env.npm_config_prefix = paths.prefix;
  env.PATH = [join(paths.prefix, 'bin'), base.PATH].filter(Boolean).join(delimiter);
  return env;
}

/** argv for publishing the tarball to staging only. */
function publishArgs(tarball) {
  return ['publish', tarball, '--registry', STAGING_REGISTRY, '--provenance=false'];
}

/** argv for the clean global install of the exact staged version. */
function installArgs(name, version) {
  return ['install', '--global', `${name}@${version}`, '--registry', STAGING_REGISTRY];
}

/**
 * An `--evidence` prefix (task-282): a relative folder path ending in `/`, never absolute and never
 * climbing out with `..`, so it can only name a folder of the checkout.
 */
const EVIDENCE_PREFIX_RE = /^(?![/.])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]*\/$/;

/**
 * Parse `[--tarball <path>] [--expect-commit <sha>] [--transcript <path>]`, `--check-transcript <path>`
 * alone (task-219), or `--check-evidence-only <path> --evidence <prefix/> [--evidence …]` alone
 * (task-282). An empty or malformed commit throws before anything starts: an unset `"$GITHUB_SHA"` must
 * stop the stage, never run it unchecked.
 */
function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--tarball' && argv[i + 1]) {
      options.tarball = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--expect-commit' && argv[i + 1]) {
      assertCommitName(argv[i + 1]);
      options.expectCommit = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--transcript' && argv[i + 1]) {
      options.transcript = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--check-transcript' && argv[i + 1]) {
      options.checkTranscript = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--check-evidence-only' && argv[i + 1]) {
      options.checkEvidenceOnly = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--evidence' && argv[i + 1]) {
      if (!EVIDENCE_PREFIX_RE.test(argv[i + 1])) {
        throw new Error(`--evidence ${argv[i + 1]}: an evidence path is a relative folder ending in "/", without ".."`);
      }
      options.evidence = [...(options.evidence ?? []), argv[i + 1]];
      i += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${argv[i]}`);
    }
  }
  if (options.checkTranscript !== undefined && Object.keys(options).length > 1) {
    throw new Error('--check-transcript takes no other option: it only reads a transcript');
  }
  if (options.evidence !== undefined && options.checkEvidenceOnly === undefined) {
    throw new Error('--evidence belongs to --check-evidence-only');
  }
  if (options.checkEvidenceOnly !== undefined) {
    if (options.evidence === undefined) throw new Error('--check-evidence-only needs at least one --evidence <path/>');
    if (Object.keys(options).length > 2) throw new Error('--check-evidence-only takes no other option than --evidence: it only reads');
  }
  return options;
}

/** The prefix of every line this script logs, and so of every line of its `--transcript`. */
const LOG_PREFIX = '[publish:staging] ';

/**
 * The line a passing rehearsal logs last (without {@link LOG_PREFIX}): the closing line
 * `staging-rehearsal-passed` reads (task-219, `dl-099` §2).
 * @param {string} name
 * @param {string} version
 */
function stagingPassedLine(name, version) {
  return `staged ${name}@${version} and smoke passed`;
}

/** The smoke's `--version` check line with a commit, as this script logs it (indented, `runSmoke`'s format). */
const VERSION_CHECK_RE = /^\[publish:staging\] +ok +wingfoil --version = (\S+) \(([0-9a-f]{40}|[0-9a-f]{64})\) — match$/;

/** Any passing `--version` check line of the smoke, whatever stamp it names (task-282). */
const VERSION_LINE_RE = /^\[publish:staging\] +ok +wingfoil --version = /;

/** A line that records a failure: the smoke's `FAIL <label>` and this script's `… FAILED …` (task-282). */
const FAILURE_RE = /\bFAIL(?:ED)?\b/;

/**
 * `--check-transcript` (task-219, `dl-099` §1–§2; strict since task-282, `bug-311`): whether a rehearsal
 * transcript proves the candidate. It passes only when its closing line is {@link stagingPassedLine} for
 * `name@version`, no line records a failure (`FAIL`, `FAILED`), every `--version` check line names this
 * version and a full sha, and all of them name the same sha — the run had `--expect-commit`, and smoked one
 * commit. That commit is the candidate the rehearsal proved, and the one `tag` tags. A line number in a
 * reason is the 1-based line of the transcript.
 *
 * @param {string} text
 * @param {{ name: string, version: string }} pkg
 * @returns {{ ok: true, commit: string } | { ok: false, reason: string }}
 */
function checkTranscript(text, pkg) {
  const lines = text
    .split('\n')
    .map((line, index) => ({ number: index + 1, line: line.trimEnd() }))
    .filter(({ line }) => line !== '');
  const expected = `${LOG_PREFIX}${stagingPassedLine(pkg.name, pkg.version)}`;
  const closing = lines[lines.length - 1]?.line ?? '';
  if (closing !== expected) {
    return { ok: false, reason: `the closing line is not "${expected}": got "${closing}"` };
  }
  const failure = lines.find(({ line }) => FAILURE_RE.test(line));
  if (failure !== undefined) return { ok: false, reason: `line ${failure.number} records a failure: "${failure.line}"` };
  const commits = [];
  for (const { number, line } of lines.filter(({ line: l }) => VERSION_LINE_RE.test(l))) {
    const match = VERSION_CHECK_RE.exec(line);
    if (match === null || match[1] !== pkg.version) {
      return { ok: false, reason: `line ${number} checks another stamp than ${pkg.version} (<full sha>): "${line}"` };
    }
    if (!commits.includes(match[2])) commits.push(match[2]);
  }
  if (commits.length === 0) {
    return { ok: false, reason: `no smoke line checked the build stamp ${pkg.version} (<sha>): the rehearsal ran without --expect-commit <candidate sha>` };
  }
  if (commits.length > 1) return { ok: false, reason: `the smoke checked ${commits.length} distinct commits: ${commits.join(', ')}` };
  return { ok: true, commit: commits[0] };
}

/**
 * The paths that start with none of the `evidence` prefixes, sorted (task-282, `bug-312`).
 *
 * @param {readonly string[]} paths
 * @param {readonly string[]} evidence
 * @returns {string[]}
 */
function outsideEvidence(paths, evidence) {
  return paths.filter((path) => !evidence.some((prefix) => path.startsWith(prefix))).sort();
}

/**
 * `--check-evidence-only` (task-282, `bug-312`; `dl-099` §1, task-219 D2): `release-publishing.tag`'s
 * pre-check that the commits between the rehearsed candidate and the tip only record evidence, so tagging
 * the candidate leaves nothing out. The candidate is the commit {@link checkTranscript} returns; it must be
 * an ancestor of `HEAD`; and every path `git diff --name-only --no-renames -z <candidate>..HEAD` lists must
 * start with one of the `evidence` prefixes (the binding declares them). `--no-renames`, so a move out of
 * `src/` lists its source; `-z`, so no path comes back quoted. `paths` is the whole diff list.
 *
 * @param {string} text
 * @param {{ name: string, version: string }} pkg
 * @param {(args: readonly string[]) => { status: number | null, stdout: string, stderr: string }} git
 * @param {readonly string[]} evidence
 * @returns {{ ok: true, commit: string, tip: string, paths: string[] } | { ok: false, reason: string }}
 */
function checkEvidenceOnly(text, pkg, git, evidence) {
  const verdict = checkTranscript(text, pkg);
  if (!verdict.ok) return verdict;
  const candidate = verdict.commit;
  const failed = (args, run) => ({ ok: false, reason: `git ${args[0]} exited ${run.status}: ${run.stderr.trim().split('\n')[0] ?? ''}` });
  const headArgs = ['rev-parse', '--verify', 'HEAD^{commit}'];
  const head = git(headArgs);
  if (head.status !== 0) return failed(headArgs, head);
  const tip = head.stdout.trim();
  const ancestorArgs = ['merge-base', '--is-ancestor', candidate, 'HEAD'];
  const ancestor = git(ancestorArgs);
  if (ancestor.status === 1) return { ok: false, reason: `the candidate ${candidate} is not an ancestor of the tip ${tip}` };
  if (ancestor.status !== 0) return failed(ancestorArgs, ancestor);
  const diffArgs = ['diff', '--name-only', '--no-renames', '-z', `${candidate}..HEAD`];
  const diff = git(diffArgs);
  if (diff.status !== 0) return failed(diffArgs, diff);
  const paths = diff.stdout.split('\0').filter((path) => path !== '').sort();
  const outside = outsideEvidence(paths, evidence);
  if (outside.length > 0) {
    return {
      ok: false,
      reason: `the commits after the candidate ${candidate} change paths outside the evidence paths (${evidence.join(', ')}), so the candidate must be re-cut: ${outside.join(', ')}`,
    };
  }
  return { ok: true, commit: candidate, tip, paths };
}

/**
 * Die *by* `signal` rather than translating it into an exit code (task-083 AC3): remove this script's
 * own handler so the default disposition applies again, then re-send the signal to itself. A caller
 * then sees the conventional `128 + N` with `WIFSIGNALED` set — 130 for `SIGINT` — indistinguishable
 * from the un-handled death it already expects, where `process.exit(130)` would report a normal exit
 * that happens to carry that number and `process.exitCode = 1` would make an interrupt look like a
 * staging failure.
 *
 * The flush is not decoration: `process.stdout.write` is synchronous to a TTY or a file but
 * **asynchronous to a pipe**, which is what a CI step gives this script, so re-raising immediately
 * after logging can truncate the very line that says teardown ran.
 */
async function raiseSignal(signal) {
  await new Promise((flushed) => process.stdout.write('', flushed));
  process.removeAllListeners(signal);
  process.kill(process.pid, signal);
}

/**
 * Install `teardown` on every signal in `signals` (task-083, `bug-059`) and return the uninstall.
 *
 * Three properties the handler must have, and how each is obtained:
 *
 *  - **it must not double-run teardown** — the caller passes a teardown that is itself idempotent
 *    ({@link runStaging} memoises one promise), so this handler and the `finally` await the same work;
 *  - **it must not re-enter** — a second signal while teardown is in flight returns the in-flight
 *    promise and logs one line, rather than racing a second stop-and-delete over the same child and
 *    the same directory. Impatience buys nothing here: teardown is bounded at {@link
 *    REGISTRY_STOP_TIMEOUT_MS} + {@link SIGKILL_GRACE_MS} plus one `rm`;
 *  - **it must always exit** — `die` runs from a `finally`, so a teardown that throws still ends the
 *    process instead of wedging it with the registry still up.
 */
function installTeardownHandlers({ teardown, log, die = raiseSignal, target = process, signals = TEARDOWN_SIGNALS }) {
  const installed = [];
  let interrupting;
  const uninstall = () => {
    for (const [signal, handler] of installed.splice(0)) target.removeListener(signal, handler);
  };
  for (const signal of signals) {
    const handler = () => {
      if (interrupting) {
        log(`${signal} received again — teardown is already running and is bounded; ignoring`);
        return interrupting;
      }
      interrupting = (async () => {
        log(`interrupted by ${signal} — running teardown`);
        try {
          // `teardown` reports what it actually did; the message repeats that rather than a fixed
          // sentence. The fixed sentence used to claim "registry stopped" in the one case where no
          // registry had been stopped (reject 8937a51), which is the single line an operator reads to
          // decide whether the machine is clean.
          const done = await teardown();
          log(`teardown complete after ${signal}: ${done.join(', ')} — exiting on ${signal}`);
        } catch (error) {
          log(`teardown after ${signal} FAILED: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          uninstall();
          await die(signal);
        }
      })();
      return interrupting;
    };
    installed.push([signal, handler]);
    target.on(signal, handler);
  }
  return uninstall;
}

/**
 * The staging flow over injectable effects. Resolves to the process exit code (0 = staged and smoked).
 * Teardown (token removal, registry stop, work-dir removal) runs on every path, including an
 * interrupt when `interrupts` is given (task-083; `main` gives it, the offline tests do not).
 */
async function runStaging({ name, version, tarball, commit, effects, baseEnv = process.env, interrupts }) {
  const workDir = effects.makeWorkDir();
  let registry;
  let teardownRun;
  /**
   * The one teardown, memoised: the `finally` below and a signal handler both call it, and whoever
   * arrives second awaits the work already in flight instead of starting a second one (task-083 AC6).
   * Resolves to the list of what it actually did, so the handler can say so instead of asserting it.
   *
   * The token goes first, before the registry it authenticates against and before the bulk removal
   * (AC4). No signal this script handles can leave the work dir behind — the handler above absorbs a
   * second one rather than exiting early — but `SIGKILL` and a power cut can, and this ordering costs
   * three lines to make the credential the shortest-lived artefact of a run instead of the longest.
   *
   * The nesting is load-bearing: a throwing `removeToken` must not cost the registry its `stop()`, and
   * neither failure may cost the work dir its removal.
   */
  const teardown = () =>
    (teardownRun ??= (async () => {
      const done = [];
      try {
        effects.removeToken(workDir);
        done.push('token removed');
      } finally {
        try {
          if (registry) {
            await registry.stop();
            done.push('registry stopped');
          } else {
            done.push('no registry to stop');
          }
        } finally {
          effects.removeWorkDir(workDir);
          done.push('work dir removed');
        }
      }
      return done;
    })());
  const uninstall = interrupts
    ? installTeardownHandlers({ ...interrupts, teardown, log: effects.log })
    : undefined;
  try {
    const paths = stagingPaths(workDir);
    const env = stagingEnv(baseEnv, paths);
    let file = tarball;
    if (file === undefined) {
      // task-282 (D1 (a), `bug-310`): the checkout is what gets packed — refuse a pack input with changes and
      // remove `dist/` first, so the pack rebuilds it from the commit alone. A given tarball is not touched.
      effects.prepareTree();
      file = effects.packTarball(paths, env);
    }
    // `onSpawn` — not the resolved value alone — is what makes teardown able to stop a registry that
    // is still coming up (reject 8937a51). The child exists from the moment it is spawned, but
    // `startRegistry` resolves only after a readiness poll that sleeps 500 ms between probes; a signal
    // landing in between used to tear down with `registry === undefined`, leaving an orphan on :4873
    // that then tripped the in-use guard for every later run. Assigning here closes that window.
    registry = await effects.startRegistry(paths, env, (spawned) => {
      registry = spawned;
    });
    await effects.createToken(paths);
    effects.npm(publishArgs(file), env, paths);
    effects.npm(installArgs(name, version), env, paths);
    if (commit === undefined) effects.log("no --expect-commit: the build stamp's commit is not checked");
    const report = effects.smoke(env, version, commit);
    if (!report.ok) {
      effects.log('staging smoke FAILED — the build must not be promoted');
      return 1;
    }
    effects.log(stagingPassedLine(name, version));
    return 0;
  } catch (error) {
    effects.log(`staging FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    try {
      await teardown();
    } finally {
      if (uninstall) uninstall();
    }
  }
}

/** Run a command to completion with inherited stdio; throw on a non-zero exit. */
function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.error?.message}`);
  }
}

/**
 * Stop a child process without ever hanging (dl-057 item c): `SIGTERM`, then — if it has not exited
 * within `timeoutMs` — `SIGKILL`, then resolve after `killGraceMs` whether or not an `exit` was seen.
 * A child that ignores or stalls on `SIGTERM` can therefore no longer outlive the staging run, on a
 * developer machine as well as in CI. Resolves immediately, signalling nothing, if `hasExited()` is
 * already true, so a normal shutdown never waits out either interval.
 */
function stopProcess(child, options = {}) {
  const {
    hasExited = () => false,
    timeoutMs = REGISTRY_STOP_TIMEOUT_MS,
    killGraceMs = SIGKILL_GRACE_MS,
  } = options;
  return new Promise((done) => {
    if (hasExited()) return done();
    let timer;
    const finish = () => {
      if (timer) clearTimeout(timer);
      done();
    };
    child.once('exit', finish);
    child.kill('SIGTERM');
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      timer = setTimeout(finish, killGraceMs);
      if (timer.unref) timer.unref();
    }, timeoutMs);
    if (timer.unref) timer.unref();
  });
}

async function registryAnswers() {
  try {
    return (await fetch(`${STAGING_REGISTRY}-/ping`)).ok;
  } catch {
    return false;
  }
}

/** The real effects: a filesystem work dir, a Verdaccio child process, npm subprocesses. */
function realEffects(repoRoot, log) {
  return {
    makeWorkDir: () => mkdtempSync(join(tmpdir(), 'wingfoil-staging-')),
    removeWorkDir: (dir) => rmSync(dir, { recursive: true, force: true }),
    // `force` so this is a no-op before `createToken` has run, or after a partial teardown.
    removeToken: (dir) => rmSync(stagingPaths(dir).userconfig, { force: true }),
    prepareTree: () => {
      const status = inputStatus(repoRoot, PACK_INPUTS);
      if (status === null) throw new Error('git could not report the status of the pack inputs');
      const changed = status.trim();
      if (changed !== '') {
        throw new Error(`a pack input has uncommitted changes, so the staged build would not be the checked-out commit: ${changed.split('\n').join(', ')}`);
      }
      removeBuildOutput(repoRoot);
    },
    packTarball: (paths, env) => {
      mkdirSync(paths.pack, { recursive: true });
      const out = spawnSync('npm', ['pack', '--json', '--pack-destination', paths.pack], {
        cwd: repoRoot,
        env,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      if (out.status !== 0) throw new Error(`npm pack exited ${out.status}`);
      const [packed] = JSON.parse(out.stdout.slice(Math.max(0, out.stdout.search(/^\[/m))));
      return join(paths.pack, packed.filename);
    },
    startRegistry: async (paths, env, onSpawn) => {
      if (await registryAnswers()) throw new Error(`${STAGING_REGISTRY} is already in use — stop that registry first`);
      writeFileSync(paths.globalconfig, '');
      writeFileSync(paths.config, verdaccioConfig(paths));
      run('npm', ['install', '--prefix', paths.tools, '--no-save', '--no-audit', '--no-fund', VERDACCIO_PACKAGE], { env });
      const pkgDir = join(paths.tools, 'node_modules', 'verdaccio');
      const { bin } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
      const entry = join(pkgDir, typeof bin === 'string' ? bin : bin.verdaccio);
      const child = spawn(process.execPath, [entry, '--config', paths.config], { env, stdio: 'inherit' });
      let exited = false;
      child.on('exit', () => {
        exited = true;
      });
      const stop = () => stopProcess(child, { hasExited: () => exited });
      // Hand the stop out before the readiness poll, not after it: from here on an interrupt can stop
      // this child, whether or not it has finished coming up (reject 8937a51).
      if (onSpawn) onSpawn({ stop });
      for (let waited = 0; !(await registryAnswers()); waited += 500) {
        if (exited || waited >= REGISTRY_START_TIMEOUT_MS) {
          await stop();
          throw new Error(`Verdaccio did not answer on ${STAGING_REGISTRY} (exited: ${exited})`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      log(`Verdaccio up on ${STAGING_REGISTRY}`);
      return { stop };
    },
    createToken: async (paths) => {
      const user = 'wingfoil-staging';
      const response = await fetch(`${STAGING_REGISTRY}-/user/org.couchdb.user:${user}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: user, password: randomBytes(24).toString('hex'), type: 'user', roles: [] }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.token !== 'string') {
        throw new Error(`could not register the throwaway staging user (HTTP ${response.status})`);
      }
      const host = STAGING_REGISTRY.replace(/^https?:/, '');
      writeFileSync(paths.userconfig, `${host}:_authToken=${body.token}\n`, { mode: 0o600 });
    },
    npm: (args, env, paths) => run('npm', args, { env, cwd: paths.root }),
    smoke: (env, version, commit) =>
      runSmoke({ command: 'wingfoil', env, expectedVersion: version, expectedCommit: commit, log: (line) => log(`  ${line}`) }),
    log,
  };
}

async function main() {
  const repoRoot = dirname(__dirname);
  const { name, version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const { tarball, expectCommit, transcript, checkTranscript: checked, checkEvidenceOnly: evidenceOf, evidence } = parseArgs(process.argv.slice(2));
  if (evidenceOf !== undefined) {
    // task-282: the `evidence-only-since-candidate` check — reads the transcript and git, starts nothing. Git
    // runs where the binding runs (the checkout), as the transcript path is read from there.
    let text;
    try {
      text = readFileSync(evidenceOf, 'utf-8');
    } catch {
      process.stderr.write(`error: no rehearsal transcript at ${evidenceOf}\n`);
      return 1;
    }
    const git = (args) => {
      const run = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: run.error ? null : run.status, stdout: run.stdout ?? '', stderr: run.error ? run.error.message : (run.stderr ?? '') };
    };
    const verdict = checkEvidenceOnly(text, { name, version }, git, evidence);
    if (!verdict.ok) {
      process.stderr.write(`error: ${verdict.reason}\n`);
      return 1;
    }
    process.stdout.write(`only evidence paths changed between the candidate ${verdict.commit} and the tip ${verdict.tip}: ${verdict.paths.length} paths\n`);
    return 0;
  }
  if (checked !== undefined) {
    // task-219: the `staging-rehearsal-passed` check — reads a transcript, starts nothing.
    let text;
    try {
      text = readFileSync(checked, 'utf-8');
    } catch {
      process.stderr.write(`error: no rehearsal transcript at ${checked}\n`);
      return 1;
    }
    const verdict = checkTranscript(text, { name, version });
    if (!verdict.ok) {
      process.stderr.write(`error: ${verdict.reason}\n`);
      return 1;
    }
    process.stdout.write(`staging rehearsal passed for ${name}@${version} on candidate ${verdict.commit}\n`);
    return 0;
  }
  const lines = [];
  const log = (line) => {
    lines.push(`${LOG_PREFIX}${line}`);
    process.stdout.write(`${LOG_PREFIX}${line}\n`);
  };
  try {
    return await runStaging({
      name,
      version,
      tarball: tarball === undefined ? undefined : resolve(tarball),
      commit: expectCommit,
      effects: realEffects(repoRoot, log),
      // The real run — and only the real run — arms the interrupt handlers (task-083). The offline
      // orchestration tests call `runStaging` without this option and so install nothing on `process`.
      interrupts: { target: process, die: raiseSignal },
    });
  } finally {
    // task-219: the transcript the `staging-rehearsal` phase produces — this script's own lines (npm's and
    // Verdaccio's inherited output is not in it), written on a failure too. An interrupt re-raises its
    // signal before this runs, so an interrupted rehearsal leaves no transcript: it proved nothing.
    if (transcript !== undefined) {
      mkdirSync(dirname(resolve(transcript)), { recursive: true });
      writeFileSync(transcript, `${lines.join('\n')}\n`);
    }
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = 2;
    },
  );
}

module.exports = {
  LOG_PREFIX,
  checkEvidenceOnly,
  checkTranscript,
  outsideEvidence,
  stagingPassedLine,
  REGISTRY_STOP_TIMEOUT_MS,
  SIGKILL_GRACE_MS,
  STAGING_REGISTRY,
  TEARDOWN_SIGNALS,
  VERDACCIO_PACKAGE,
  installTeardownHandlers,
  stagingPaths,
  verdaccioConfig,
  stagingEnv,
  publishArgs,
  installArgs,
  parseArgs,
  realEffects,
  runStaging,
  stopProcess,
};

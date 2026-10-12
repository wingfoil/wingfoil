#!/usr/bin/env node
/**
 * `release-health.measure` (`dl-089` §1, §6; `.wingfoil/workflows/custom/release-health.yaml`): measure a release
 * with the metric catalogue at `paths.health` (`docs/08_health/metrics.yaml`) and write the machine-readable report
 * `release-health-<version>.json` (`docs/08_health/release-health.schema.json`). Not shipped in the npm package
 * (`package.json` `files`).
 *
 * It holds the **history half** (task-231): the git-history metrics G01–G16, the process-conformance measures
 * P01–P07 (`REQ-STATE-10`, `dl-131` Decision 3), the external visibility snapshot E01–E05 (`dl-130` Q2 (a)) and the
 * toolchain record; the **toolchain half** (task-232): Q01–Q04, Q11, Q12 and Q17, measured by running the
 * project's own commands; and the **static and Memory half** (task-233): Q05–Q10, Q13–Q16 and Q18–Q20, read from git
 * at the point (and the previous point, for the window). D01 and P06 need the benchmark's two runs (`dl-089` §2,
 * `dl-131`): `not-comparable` on a patch release, else `not-measurable`.
 *
 * **The measurement point** (`dl-089` §1). `--at <rev>` names it. Otherwise the release element whose `version` is
 * `--release` is read at `HEAD`, and the point is the highest tag named `<version>` or `<version>.<n>` (a patch:
 * `<version>` exactly) that is not another release element's version — the version actually published, since a
 * tag whose publish failed (`v0.2.0`, `bug-135`) is followed by a higher one — else the commit carrying the
 * release's `[… → released]` transition. **The window** is `<previous point>..<point>`: `--previous <rev>`, else
 * the most recent earlier report under `paths.health`, else the whole history (`previous: null`).
 *
 * **Read-only** (`dl-089` §6): every read is `git log`, `git show <rev>:<path>`, `git ls-tree` or
 * `git for-each-ref` at the point; the commit-dependent checks run in a throw-away worktree (`git worktree add
 * --detach`, hooks off through `git -c`, removed afterwards). Nothing writes git configuration, and nothing needs an
 * identity, since nothing is committed. The only file written is the report (the toolchain's own outputs stay in
 * the temporary directory). **Signals** (`bug-329`): SIGINT, SIGTERM and SIGHUP stop the running tool, remove the
 * worktree and its temporary directory, and re-raise. One that lands during synchronous work (the history half, a
 * `--no-toolchain` run, the pinned-Node refusal) reaches its handler once that work returns, since Node runs no
 * handler during synchronous code; the run then ends by the signal, writing no report. A run killed by SIGKILL leaves its
 * worktree registered; remove it by hand with `git worktree remove --force /tmp/wf-release-health-<suffix>/tree`
 * (the path `git worktree list` shows).
 *
 * **The toolchain half** (task-232; `dl-089` §6) runs in the same worktree, after the history half: `npm ci`, then
 * each metric's command, every tool with the running Node's directory first on `PATH`. It runs only under the
 * pipeline's pinned Node (`.github/workflows/publish.yml` `env.NODE_VERSION` at the point); with another, its seven
 * metrics are `not-measurable` naming both versions, unless `--any-node`, which measures and records `node` and
 * `node_pinned` in each entry's `raw`. To run under the pinned Node, start the script with it, e.g.
 * `n -d exec 22.12.0 node scripts/release-health/measure.cjs --release <vX.Y[.Z]>` (that Node and its npm first on
 * `PATH`; `-d` downloads the version when it is not cached, and without it `n` refuses an uncached one) or
 * `npx -p node@22.12.0 node scripts/release-health/measure.cjs --release <vX.Y[.Z]>` (npx installs the `node` package
 * when it is missing). A tool that cannot run, is killed, or leaves an output the reader cannot parse makes its
 * metric `not-measurable` with the reason, never a zero; so does an exit of a Q01 script that means its tool itself
 * failed (a shell's 126/127, eslint's 2). A check that runs and fails is a measured failure. A failure's reason is
 * npm's `npm error code …` line when there is one, never npm's pointer to its dated debug log, and it names paths
 * relative to the worktree, never the worktree's random temporary path.
 * - Q01 `npm run build`, `npm run typecheck`, `npm run lint`, all three run: `true` when each exits 0;
 * - Q02 `npm test -- --json --outputFile=…`: jest's counts; disabled = skipped + todo; failing = failed tests plus
 *   suites that failed to run, each named;
 * - Q03/Q04 `npm run test:coverage -- --coverageReporters=json-summary --coverageDirectory=…`: the totals, and the
 *   branch coverage of the three critical modules against the 90 % floor; a module missing from the summary makes Q04
 *   `not-measurable`;
 * - Q11 each `docs/examples/*\/run.sh`, `bash` with `WINGFOIL="node <worktree>/dist/cli.js"`, after a successful build;
 * - Q12 `npm run test:latency` with `WINGFOIL_LATENCY_REPORT=1`, read from the suite's own report: the highest total
 *   p95, every p95, the floor and the 1-minute load before and after; **a run the suite judges loaded is
 *   `not-measurable`** (catalogue Q12, task-263's floor verdict), its `raw` still recording the load;
 * - Q17 the first `npm install -g <spec>` of `docs/user-guide.md` (else `README.md`), the version that document states
 *   in bold, and `npm view <spec> version --json`; it reads the registry at run time, so like G15 and E01–E05 a later
 *   run can answer differently (`raw.resolved_from`); `--offline` skips it.
 *
 * **The static and Memory half** (task-233; `dl-089` §2) runs in the same worktree after the history half and before
 * the toolchain half, so `npm ci` and the build never reach what it reads: the files `git ls-tree` lists at the point,
 * read with one `git cat-file --batch`. It adds no dependency (`dl-010`): ESLint, typescript-eslint and TypeScript are
 * the measuring checkout's devDependencies, and a metric whose module is missing is `not-measurable` with the reason.
 * Definitions it fixes where the catalogue leaves a choice:
 * - Q05 ESLint's `complexity` (classic) above 15 and `max-lines-per-function` above 80 (blank and comment lines
 *   counted, IIFEs included), inline configuration ignored, over the code files of `paths.sources`; a file ESLint
 *   cannot parse makes Q05 `not-measurable`, naming it;
 * - Q06 a clone is 8 or more consecutive non-blank lines, compared trimmed, found at two places of the same category
 *   (`paths.sources`, `paths.tests`); every line of one is duplicated;
 * - Q07 imports read with the TypeScript AST; a cycle is a strongly connected component of the runtime import graph of
 *   `paths.sources` (type-only imports are erased), named by its shortest cycle from its first file; a bypass is an
 *   import, type-only included, from `src/cli.ts`, `src/cli/` or `src/mcp/` into `src/storage`, `src/memory`,
 *   `src/dna`, `src/directives` or `src/workflow` (spec-006 §1), recorded when one line of a Memory document names
 *   the importing file, the module it reaches and the word "deviation";
 * - Q08 unused: a `dependencies` or `optionalDependencies` entry that no runtime import of `paths.sources` names;
 *   install size, after the toolchain half's `npm ci` only: every production package's directory (`npm ls --omit=dev
 *   --all --json --long`, nested `node_modules` counted apart) plus the tarball's `unpackedSize` (`npm pack --dry-run
 *   --json --ignore-scripts`), else `null` with the reason in `raw.install_size`; `raw.runtime_dependencies` is the
 *   production dependency count of `dl-010` Action 3 — the top level of that `npm ls` (what `npm ls --omit=dev
 *   --depth=0` lists), else `package.json`'s, `raw.runtime_dependencies_from` saying which;
 * - Q09 a reference is a `task|bug|dl|adr|spec|svc-<n>` in a comment or in the title of a `describe`/`it`/`test`
 *   call (other string literals are fixture data), outside `fixtures/` directories; it resolves when a Memory document
 *   at the point has the same prefix and number;
 * - Q10 the scope is the `REQ-*` ids of the file the release's `requirements:` names (or of its list), cited when one
 *   appears as a word in a file of `paths.tests` outside `fixtures/`;
 * - Q13, Q20 compare each bug at the point with the document of the same name at the previous point: added = absent
 *   then; closed = `closed` now and not then; terminal = `closed` or `deprecated` now and not then; open = neither;
 * - Q14 the age runs from the oldest `wf(decision-log): add` naming the id (else the oldest commit adding the file at
 *   its path) to the point, in days of commit time;
 * - Q15 a bug added in the window is judged on the non-merge, non-`wf()` commits citing both its id and the id of a
 *   task whose `bug:` names it (a bug absorbed by a feature task is judged on its own commits, not the feature's);
 *   with no such commit it is unclassified; a changed line under `paths.sources` that is blank or starts a comment
 *   (`//`, `/*`, `*`) is not executable;
 * - Q16 words are the whitespace-separated tokens of a document's body; a comment line is a non-blank line of
 *   `paths.sources` whose every character lies in a comment;
 * - Q18, Q19 a task of the release has `release:` equal to its version (deprecated ones included); before v0.3 it is
 *   a fix when an id segment is `fix` or its `bug:` names a bug (`dl-133` §1's backfill); from v0.3 by the field and
 *   value `memory.yaml` `task.stop_the_line` declares (`field: kind`, `counts: fix`; `bug-331`), another declared
 *   value being a feature and none unclassified; Q19's commit-backlog commit is the oldest `wf(release)` transition of
 *   the release into `in-development`, and a task added after it is one whose `<id>.md` is not in that commit's tree.
 *
 * **G15 is not reproducible at a fixed point.** Unlike every other metric, it reads the live `refs/heads` and
 * `refs/remotes` of the clone that runs it, at run time, so a later run at the same point can answer differently;
 * its entry says so in `raw.refs_from`.
 *
 * **Reuse.** The commit-grammar readers come from `dist/memory` (`parseMemoryOperation`, `parseApproverTrailerLine`,
 * `parseReasonBlock`, `parseVersionTrailer`, `isValidAttribution`), the spec-007 scanner from `dist/validation`
 * (`scanText`), and P01, P02 and P05's approval half from the governance check (`scripts/check-governance.cjs`,
 * rules subject/bracket/body, state, authority), every finding counted, gated or not.
 *
 * **Definitions this script fixes where the catalogue leaves a choice** (task-231's design notes):
 * - shares are percentages rounded to two decimals, with the raw counts beside them; a share with no item is
 *   `not-measurable`; `items` < the catalogue's `small_sample` flags `small_sample` (`dl-089` §3);
 * - G01 conventional subject: `type(scope)!: text`, a lowercase type (`wf(type): verb ids` included);
 * - G02 trailer lines: the body's final paragraph when every line of it is a `Co-Authored-By`, `AI-Model`,
 *   `WingFoil-Version` or `Signed-off-by` trailer;
 * - G03 median: the mean of the two middle values on an even count; p90: nearest rank;
 * - G05 an id: `task-<n>` or `bug-<n>`;
 * - G07 a commit fails when its author or committer email is not a `team.members` email (case-insensitive), or
 *   `isValidAttribution` refuses the identity (RFC 2606 reserved top-level domains, git's `.(none)`), merges
 *   included;
 * - G08 the rule's ratification: the `wf(decision-log): approve dl-117…` commit; commits at or before it are
 *   counted apart (`before_rule`); a conforming commit has a `Co-Authored-By:` naming a `team.agents` entry (its
 *   email too, when the entry has one) and a non-blank `AI-Model:`;
 * - G09 the verb list: `MEMORY_OPERATIONS` read from `src/memory/audit.ts` at the point, the measuring build's when
 *   that file is absent; G09, G10 and G16 count the Memory `wf()` commits (configuration scopes excluded); G13 every
 *   `wf(` subject;
 * - G11 back-merges: `Merge … 'main' into task/…` subjects, over the `Merge branch 'task/…'` ones;
 * - G15 refs: the branches under refs/heads and refs/remotes (not the symbolic HEAD refs); a stale branch is a
 *   remote-tracking ref whose tip is not an ancestor of the point and is older than it; a duplicate is one `<prefix>-<n>` carried by two
 *   different ids across the refs' Memory folders and the point's;
 * - P03 a phase recorded complete: a `plan` element `done` at the point and not at the previous point; it is judged
 *   on its workflow's string `produces:` entries (the phase its `phase:` names, else every phase), tokens resolved
 *   from its `element` (`{<type>.<field>}`, `{release-line}`); an entry left with a token, or written as free text
 *   rather than a path, is counted `unresolved`, not judged; a typed `{ type, path }` entry is a Memory element, judged by P02;
 * - P02, P05: a governance finding saying no `memory.yaml`/`dna.yaml` was committed at the commit (history
 *   before the configuration existed) is counted `unchecked`, not failing;
 * - P04 the tasks touched in the window; each link must resolve at the point: `ref`, `bug`, `depends_on`,
 *   `supersedes` values (a `REQ-*` or feature id as such, else a Memory element id), feature ids in
 *   `docs/01_vision/06_features.md`, `REQ-*` headings under `docs/02_requirements/03_sard/`, `US-*` ids in
 *   `docs/02_requirements/01_user_story_map/`, cited `.feature` paths (from the root or the BDD folder);
 * - P05 the approval authority of the governance check, plus the run records the window adds under `paths.runs`:
 *   the record's role is its phase's declared role, its agent's `executes_as` holds it, and it shares no `session`
 *   with a record of a phase its `distinct_from` names;
 * - P07 P01–P06 computed twice, compared byte for byte;
 * - E01–E05: `gh api` and the npm downloads API; the date read is the response's `Date` header, so no clock is read.
 *
 * Deterministic (REQ-SYS-07): no clock, no randomness; every list is in commit order or sorted.
 *
 * Usage: node scripts/release-health/measure.cjs --release <vX.Y[.Z]> [--at <rev>] [--previous <rev>]
 *          [--out <file>] [--offline] [--root <dir>] [--no-toolchain] [--any-node] [--max-workers <n>]
 * `--no-toolchain` skips the toolchain half (its metrics `not-measurable`); `--max-workers` goes to the two jest runs.
 * Progress lines go to stderr.
 * Exit: 0 the report is written (its path on stdout) · 2 the measure could not run (message on stderr).
 */
'use strict';

const { execFileSync, spawn, spawnSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { setImmediate } = require('node:timers');
const { delimiter, dirname, isAbsolute, join, posix, relative } = require('node:path');
const yaml = require('js-yaml');

const { catalogueLocation, validateCatalogue } = require('./catalogue.cjs');
const { checkGovernance } = require('../check-governance.cjs');

const DIST = join(__dirname, '..', '..', 'dist');
const SCHEMA_VERSION = 1;
const VERSION_RE = /^v[0-9]+\.[0-9]+(\.[0-9]+)?$/;
const FULL_COMMIT_NAME_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

const CONVENTIONAL_RE = /^[a-z]+(\([^)]+\))?!?: \S/;
const WF_RE = /^wf\(([^)]*)\):\s*(\S+)/;
const TRAILER_KEYS_RE = /^(co-authored-by|ai-model|wingfoil-version|signed-off-by):/i;
const AI_TRAILER_RE = /^(co-authored-by|ai-model):/i;
const CO_AUTHOR_RE = /^co-authored-by:\s*(.*?)\s*<([^>]*)>\s*$/i;
const AI_MODEL_RE = /^ai-model:\s*\S/i;
const CITES_ID_RE = /\b(?:task|bug)-\d+\b/;
const BRACKET_RE = /\[[^\]]*(?:->|→)[^\]]*\]/;
const BACK_MERGE_RE = /^merge (?:remote-tracking )?(?:branch )?'?(?:origin\/)?main'? into '?task\//i;
const TASK_MERGE_RE = /^merge (?:remote-tracking )?branch '(?:origin\/)?task\//i;
const NUMBERED_ID_RE = /^([a-z][a-z-]*?)-(\d+)(?:-|$)/;
const FEATURE_ID_RE = /(?<![\w/.-])P\d+(?:\.\d+)+(?![\w-])/g;
const REQ_ID_RE = /\bREQ-[A-Z]+-\d+\b/g;
const US_ID_RE = /\bUS-[0-9A-Z]+-\d+\b/g;
const FEATURE_FILE_RE = /[\w./-]+\.feature\b/g;
const G08_RULE = 'dl-117';
const APPROVAL_VERBS = new Set(['approve', 'reject', 'amend']);
const NOT_REPORTED = 'not-reported';

const FEATURES_FILE = 'docs/01_vision/06_features.md';
const SARD_DIR = 'docs/02_requirements/03_sard/';
const STORY_MAP_DIR = 'docs/02_requirements/01_user_story_map/';
const BDD_DIR = 'docs/02_requirements/02_bdd/features/';
const ELEMENT_LINK_FIELDS = ['ref', 'bug', 'depends_on', 'supersedes'];

const BENCHMARK_REASON = "needs D01's two benchmark runs with the build just published (dl-089 §2, dl-131); no run of this script performs them";
const MONTHS = Object.freeze({ Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' });

class UsageError extends Error {}

// --- git ---------------------------------------------------------------------------------------------

/** @param {string} root @param {string[]} args */
function git(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** `git` that answers `null` instead of throwing (a missing blob, a failed probe). */
function gitOr(root, args) {
  try {
    return git(root, args);
  } catch {
    return null;
  }
}

/** The blob at `rev:path`, as text, or `null` when there is none. */
function readBlob(root, rev, path) {
  return gitOr(root, ['show', `${rev}:${path}`]);
}

/** The blob at `rev:path`, as bytes, or `null`. */
function readBlobBytes(root, rev, path) {
  try {
    return execFileSync('git', ['-C', root, 'show', `${rev}:${path}`], { maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/** The files under `dir` at `rev`, sorted. */
function listFiles(root, rev, dir) {
  const raw = gitOr(root, ['ls-tree', '-r', '--name-only', rev, '--', dir]);
  return raw === null ? [] : raw.split('\n').filter((line) => line !== '').sort();
}

function requireCommitName(name, command) {
  if (!FULL_COMMIT_NAME_RE.test(name)) throw new Error(`${command} printed ${JSON.stringify(name)} where a commit name was expected`);
  return name;
}

function resolveCommit(root, rev, flag) {
  const sha = gitOr(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  if (sha === null) throw new UsageError(`${flag} ${rev} is not a commit of ${root}`);
  return sha.trim();
}

function isAncestor(root, ancestor, descendant) {
  return spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant]).status === 0;
}

function commitTime(root, rev) {
  return Number(git(root, ['log', '--no-show-signature', '-1', '--format=%ct', rev]).trim());
}

/**
 * Run `fn` with a throw-away worktree checked out (detached) at `commit`, removed afterwards. Hooks are switched
 * off for the one command through `git -c`; nothing is written to any git configuration (`dl-089` §6).
 */
function withWorktree(root, commit, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wf-release-health-'));
  const tree = join(dir, 'tree');
  try {
    addWorktree(root, tree, commit);
    return fn(tree);
  } finally {
    removeWorktree(root, dir, tree);
  }
}

function addWorktree(root, tree, commit) {
  git(root, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--quiet', '--detach', tree, commit]);
}

/** Remove the worktree `tree` and its temporary directory `dir`. */
function removeWorktree(root, dir, tree) {
  const removed = gitOr(root, ['worktree', 'remove', '--force', tree]) !== null;
  rmSync(dir, { recursive: true, force: true });
  // `prune` acts on every worktree of the repository: run it only when this one could not be removed.
  if (!removed) gitOr(root, ['worktree', 'prune']);
}

/** The signals that tear the measurement worktree down (`bug-329`); SIGKILL cannot be caught. */
const TEARDOWN_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

/** How long a stopped tool gets between SIGTERM and SIGKILL. */
const STOP_GRACE_MS = 10_000;

class Interrupted extends Error {
  constructor(signal) {
    super(`interrupted by ${signal}`);
    this.signal = signal;
  }
}

/** Die of `signal` once its handlers are gone: the default action, so the exit status says which signal it was. */
function raiseSignal(signal) {
  process.kill(process.pid, signal);
}

/**
 * {@link withWorktree} for an asynchronous `fn`, guarded against signals (`bug-329`): `SIGINT`, `SIGTERM` and `SIGHUP`
 * stop the running tool (each tool registers a stopper in `guard.stoppers`), remove the worktree and its directory,
 * remove the handlers and re-raise the signal, as `scripts/publish-staging.cjs` (`installTeardownHandlers`) does.
 * Node runs a handler only in the event loop's poll phase, so a signal that lands while `fn` is synchronous waits
 * until `fn` settles; the guard then yields past the next poll phase before removing its handlers, so the signal still tears
 * down and re-raises, and the promise rejects (`interrupted by <signal>`) rather than returning a result. SIGKILL
 * is the one case left to the user (`git worktree remove --force`).
 *
 * @param {string} root @param {string} commit
 * @param {(tree: string, dir: string, guard: { interrupted: string | null, stoppers: Set<() => Promise<void>> }) => Promise<unknown>} fn
 * @param {{ target?: NodeJS.EventEmitter, die?: (signal: string) => unknown, signals?: readonly string[] }} [interrupts]
 */
async function withGuardedWorktree(root, commit, fn, interrupts = {}) {
  const target = interrupts.target ?? process;
  const die = interrupts.die ?? raiseSignal;
  const dir = mkdtempSync(join(tmpdir(), 'wf-release-health-'));
  const tree = join(dir, 'tree');
  const guard = { interrupted: null, stoppers: new Set() };
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeWorktree(root, dir, tree);
  };
  let interrupting = null;
  const handlers = (interrupts.signals ?? TEARDOWN_SIGNALS).map((signal) => [signal, () => {
    if (interrupting !== null) return;
    guard.interrupted = signal;
    interrupting = (async () => {
      try {
        await Promise.allSettled([...guard.stoppers].map((stop) => stop()));
        cleanup();
      } finally {
        // Even when the cleanup throws, the handlers go and the signal is re-raised (review F4).
        uninstall();
        await die(signal);
      }
    })();
  }]);
  const uninstall = () => {
    for (const [signal, handler] of handlers.splice(0)) target.removeListener(signal, handler);
  };
  for (const [signal, handler] of handlers) target.on(signal, handler);
  let outcome;
  try {
    addWorktree(root, tree, commit);
    outcome = { value: await fn(tree, dir, guard) };
  } catch (error) {
    outcome = { error };
  }
  // Node hands a signal to its handler only in the event loop's poll phase. A signal that landed while `fn` was
  // synchronous (the history half, `--no-toolchain`, the pinned-Node refusal) is still pending here. One immediate is
  // not enough when `fn` resumed from a poll-phase callback (a child's close, an fs read): it runs in that same
  // iteration's check phase, before the next poll. The second, scheduled from the check phase, runs only after a
  // poll phase, where the handler gets the signal before the handlers go (review F1, re-review N1).
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  if (interrupting !== null) {
    await interrupting;
    // An interrupted run returns nothing: its reads may have failed with the children the signal killed.
    throw new Interrupted(guard.interrupted);
  }
  try {
    cleanup();
  } finally {
    uninstall();
  }
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}

// --- the compiled readers ----------------------------------------------------------------------------

function loadDist() {
  if (!existsSync(join(DIST, 'memory', 'index.js'))) throw new UsageError(`${DIST} is not built: run \`npm run build\` first`);
  return { memory: require(join(DIST, 'memory')), validation: require(join(DIST, 'validation')) };
}

// --- small helpers -----------------------------------------------------------------------------------

const round2 = (value) => Math.round(value * 100) / 100;
const pct = (part, whole) => Math.round((part * 10000) / whole) / 100;
const asList = (value) => (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]).map(String).filter((v) => v.trim() !== '');
const unique = (values) => [...new Set(values)];

/** The frontmatter of a Markdown document, or `null`. */
function frontmatter(text) {
  if (text === null || !text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  try {
    const value = yaml.load(text.slice(3, end));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** The document's text after its frontmatter. */
function bodyOf(text) {
  const end = text.indexOf('\n---', 3);
  return end === -1 ? text : text.slice(end + 4);
}

function loadYamlAt(root, rev, path) {
  const text = readBlob(root, rev, path);
  if (text === null) return null;
  try {
    return yaml.load(text);
  } catch {
    return null;
  }
}

/** The content root of a Memory path pattern: the directory before its first token, with a trailing `/`. */
function contentRoot(pattern) {
  const head = pattern.split('{')[0];
  const dir = head.endsWith('/') ? head : posix.dirname(head);
  return dir.endsWith('/') ? dir : `${dir}/`;
}

function typeRoots(memoryYaml) {
  const types = memoryYaml && memoryYaml.types && typeof memoryYaml.types === 'object' ? memoryYaml.types : {};
  return Object.fromEntries(Object.keys(types).sort().filter((t) => types[t] && typeof types[t].path === 'string').map((t) => [t, contentRoot(types[t].path)]));
}

function pathsOf(dna, category) {
  const value = dna && dna.paths ? dna.paths[category] : undefined;
  return Array.isArray(value) ? value.map((p) => (String(p).endsWith('/') ? String(p) : `${p}/`)) : [];
}

function compareVersions(a, b) {
  const pa = a.slice(1).split('.').map(Number);
  const pb = b.slice(1).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** A metric entry in the schema's key order. */
function entry(id, fields) {
  const out = { id, status: fields.status ?? 'measured' };
  for (const key of ['reason', 'value', 'raw', 'items', 'small_sample', 'failing', 'evidence']) {
    if (fields[key] !== undefined) out[key] = fields[key];
  }
  return out;
}

const notMeasurable = (id, reason) => entry(id, { status: 'not-measurable', reason });

// --- reading the window ------------------------------------------------------------------------------

/** The window's commits, oldest first, with the files and lines each non-merge commit changes. */
function readWindow(root, point, base) {
  const range = base === null ? [point] : [point, `^${base}`];
  const raw = git(root, ['log', '--no-show-signature', '--reverse', '--format=%x01%H%x00%P%x00%an%x00%ae%x00%cn%x00%ce%x00%aI%x00%s%x00%b%x00', ...range]);
  const commits = [];
  for (const record of raw.split('\u0001').slice(1)) {
    const [sha, parents, an, ae, cn, ce, date, subject, body] = record.split('\0');
    commits.push({
      sha: requireCommitName(sha, 'git log --reverse'),
      merge: parents.trim().split(' ').length > 1,
      authorName: an,
      authorEmail: ae,
      committerName: cn,
      committerEmail: ce,
      date,
      subject,
      body: body.replace(/\s+$/, ''),
      files: [],
      lines: 0,
    });
  }
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const stat = git(root, ['log', '--no-show-signature', '--no-merges', '--no-renames', '--numstat', '--format=%x01%H', ...range]);
  let current = null;
  for (const line of stat.split('\n')) {
    if (line.startsWith('\u0001')) {
      current = bySha.get(requireCommitName(line.slice(1), 'git log --numstat')) ?? null;
    } else if (current !== null && line.includes('\t')) {
      const [added, deleted, path] = line.split('\t');
      current.files.push(path);
      if (added !== '-' && deleted !== '-') current.lines += Number(added) + Number(deleted);
    }
  }
  return commits;
}

/** The lines each non-merge commit of the window adds, per file: `[sha, path, lines[]]`, in commit order. */
function readAddedLines(root, point, base) {
  const range = base === null ? [point] : [point, `^${base}`];
  const raw = git(root, ['log', '--no-show-signature', '--reverse', '--no-merges', '--no-renames', '-p', '--unified=0', '--format=%x01%H', ...range]);
  const out = [];
  let sha = null;
  let file = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('\u0001')) {
      sha = requireCommitName(line.slice(1), 'git log -p');
      file = null;
    } else if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? { sha, path: line.slice(6), lines: [] } : null;
      if (file !== null) out.push(file);
    } else if (file !== null && line.startsWith('+')) {
      file.lines.push(line.slice(1));
    }
  }
  return out;
}

// --- the history metrics (G01–G16) -------------------------------------------------------------------

function hasBody(body) {
  const lines = body.split('\n');
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  let start = end;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
  const last = lines.slice(start, end);
  const kept = last.length > 0 && last.every((line) => TRAILER_KEYS_RE.test(line)) ? lines.slice(0, start) : lines;
  return kept.some((line) => line.trim() !== '');
}

function share(id, part, whole, rawKeys, items, failing, smallSample) {
  if (whole === 0) return notMeasurable(id, `no relevant commit in the window (${rawKeys[1]}: 0)`);
  return entry(id, {
    value: pct(part, whole),
    raw: { [rawKeys[0]]: part, [rawKeys[1]]: whole },
    items,
    small_sample: items < smallSample,
    failing,
  });
}

function median(sorted) {
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** The declared verbs at the point: `MEMORY_OPERATIONS` of `src/memory/audit.ts` there, else the measuring build's. */
function declaredVerbs(root, point, dist) {
  const source = readBlob(root, point, 'src/memory/audit.ts');
  const match = source === null ? null : /MEMORY_OPERATIONS\s*=\s*\[([\s\S]*?)\]/.exec(source);
  if (match) return { verbs: [...match[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]), from: 'src/memory/audit.ts at the point' };
  return { verbs: [...dist.memory.MEMORY_OPERATIONS], from: 'the measuring build' };
}

function measureHistory(ctx) {
  const { root, point, commits, dna, dist, smallSample } = ctx;
  const nonMerge = commits.filter((c) => !c.merge);
  const n = nonMerge.length;
  const sources = pathsOf(dna, 'sources');
  const tests = pathsOf(dna, 'tests');
  const touches = (c, dirs) => c.files.some((f) => dirs.some((d) => f.startsWith(d)));
  const configScopes = new Set(dist.memory.CONFIGURATION_SCOPES);
  const wfAll = nonMerge.filter((c) => WF_RE.test(c.subject));
  const wfMemory = wfAll.filter((c) => !configScopes.has(WF_RE.exec(c.subject)[1]));
  const out = [];

  // G01
  const nonConventional = nonMerge.filter((c) => !CONVENTIONAL_RE.test(c.subject));
  out.push(share('G01', n - nonConventional.length, n, ['conforming', 'total'], n, nonConventional.map((c) => c.sha), smallSample));

  // G02
  const withBody = nonMerge.filter((c) => hasBody(c.body)).length;
  out.push(share('G02', withBody, n, ['with_body', 'total'], n, undefined, smallSample));

  // G03
  if (n === 0) out.push(notMeasurable('G03', 'no non-merge commit in the window'));
  else {
    const sizes = nonMerge.map((c) => c.lines).sort((a, b) => a - b);
    const over = sizes.filter((s) => s > 500).length;
    out.push(entry('G03', {
      value: { median: round2(median(sizes)), p90: sizes[Math.ceil(0.9 * n) - 1], share_over_500: pct(over, n) },
      raw: { commits: n, over_500: over, lines_total: sizes.reduce((a, b) => a + b, 0) },
      items: n,
      small_sample: n < smallSample,
    }));
  }

  // G04
  if (n === 0) out.push(notMeasurable('G04', 'no non-merge commit in the window'));
  else {
    const long = nonMerge.filter((c) => [...c.subject].length > 72);
    const total = nonMerge.reduce((sum, c) => sum + [...c.subject].length, 0);
    out.push(entry('G04', {
      value: { mean: round2(total / n), share_over_72: pct(long.length, n) },
      raw: { over_72: long.length, total: n, characters: total },
      items: n,
      small_sample: n < smallSample,
      failing: long.map((c) => c.sha),
    }));
  }

  // G05
  const code = nonMerge.filter((c) => touches(c, [...sources, ...tests]));
  const uncited = code.filter((c) => !CITES_ID_RE.test(`${c.subject}\n${c.body}`));
  out.push(share('G05', code.length - uncited.length, code.length, ['citing', 'total'], code.length, uncited.map((c) => c.sha), smallSample));

  // G06
  const approvals = wfMemory.filter((c) => ['approve', 'reject'].includes(dist.memory.parseMemoryOperation(c.subject)));
  const unevidenced = approvals.filter((c) => dist.memory.parseApproverTrailerLine(c.body) === null || dist.memory.parseReasonBlock(c.body) === null);
  out.push(share('G06', approvals.length - unevidenced.length, approvals.length, ['conforming', 'total'], approvals.length, unevidenced.map((c) => c.sha), smallSample));

  // G07
  const members = new Set(((dna && dna.team && dna.team.members) || []).map((m) => String(m.email).toLowerCase()));
  const known = (name, email) => members.has(String(email).toLowerCase()) && dist.memory.isValidAttribution(name, email);
  const unknown = commits.filter((c) => !known(c.authorName, c.authorEmail) || !known(c.committerName, c.committerEmail));
  out.push(entry('G07', {
    value: unknown.length,
    raw: { failing: unknown.length, total: commits.length },
    items: commits.length,
    small_sample: commits.length < smallSample,
    failing: unknown.map((c) => c.sha),
  }));

  out.push(measureAttribution(ctx, nonMerge));

  // G09
  const declared = declaredVerbs(root, point, dist);
  const outside = wfMemory.filter((c) => !declared.verbs.includes(WF_RE.exec(c.subject)[2]));
  const g09 = share('G09', outside.length, wfMemory.length, ['outside', 'total'], wfMemory.length, outside.map((c) => c.sha), smallSample);
  if (g09.raw) g09.raw.verbs_from = declared.from;
  out.push(g09);

  // G10
  const bracketed = wfMemory.filter((c) => BRACKET_RE.test(c.subject));
  const ascii = bracketed.filter((c) => {
    const bracket = BRACKET_RE.exec(c.subject)[0];
    return bracket.includes('->') || !bracket.includes('→');
  });
  out.push(share('G10', bracketed.length - ascii.length, bracketed.length, ['canonical', 'total'], bracketed.length, ascii.map((c) => c.sha), smallSample));

  // G11
  const backMerges = commits.filter((c) => c.merge && BACK_MERGE_RE.test(c.subject)).length;
  const taskMerges = commits.filter((c) => c.merge && TASK_MERGE_RE.test(c.subject)).length;
  out.push(taskMerges === 0
    ? notMeasurable('G11', 'no task branch was merged in the window')
    : entry('G11', { value: round2(backMerges / taskMerges), raw: { back_merges: backMerges, task_branches_merged: taskMerges }, items: taskMerges, small_sample: taskMerges < smallSample }));

  // G12
  const sourceCommits = nonMerge.filter((c) => touches(c, sources));
  const withDocs = sourceCommits.filter((c) => c.files.some((f) => f.startsWith('docs/'))).length;
  out.push(share('G12', withDocs, sourceCommits.length, ['touching_docs', 'total'], sourceCommits.length, undefined, smallSample));

  // G13
  if (n === 0) out.push(notMeasurable('G13', 'no non-merge commit in the window'));
  else {
    const days = new Set(nonMerge.map((c) => c.date.slice(0, 10))).size;
    out.push(entry('G13', {
      value: { wf_share: pct(wfAll.length, n), per_active_day: round2(n / days) },
      raw: { wf: wfAll.length, total: n, active_days: days },
      items: n,
      small_sample: n < smallSample,
    }));
  }

  out.push(measureSecrets(ctx));
  out.push(measureBranches(ctx));

  // G16
  const signed = wfMemory.filter((c) => dist.memory.parseVersionTrailer(c.body) !== null).length;
  out.push(share('G16', signed, wfMemory.length, ['signed', 'total'], wfMemory.length, undefined, smallSample));
  return out;
}

/** G08 — AI attribution against the dl-117 rule (git-conventions §7), from the rule's ratification on. */
function measureAttribution(ctx, nonMerge) {
  const { root, point, dna, dist, smallSample } = ctx;
  const agents = (dna && dna.team && dna.team.agents) || [];
  const log = git(root, ['log', '--no-show-signature', '--format=%H%x00%s', point]);
  let ratifiedAt = null;
  for (const line of log.split('\n')) {
    const [sha, subject] = line.split('\0');
    if (!subject || !subject.startsWith('wf(decision-log):') || dist.memory.parseMemoryOperation(subject) !== 'approve') continue;
    const ids = subject.replace(/^wf\([^)]*\):\s*approve\s+/, '').replace(/\s*\[.*$/, '').split(', ');
    if (ids.some((id) => id === G08_RULE || id.startsWith(`${G08_RULE}-`))) ratifiedAt = requireCommitName(sha, 'git log');
  }
  const beforeRule = ratifiedAt === null ? null : new Set(git(root, ['rev-list', ratifiedAt]).split('\n').filter((s) => s !== ''));
  const aiLines = (c) => c.body.split('\n').map((l) => l.trim()).filter((l) => AI_TRAILER_RE.test(l));
  const attributed = nonMerge.filter((c) => aiLines(c).length > 0);
  const judged = attributed.filter((c) => beforeRule !== null && !beforeRule.has(c.sha));
  const conforms = (c) => {
    const lines = aiLines(c);
    const coAuthored = lines.map((l) => CO_AUTHOR_RE.exec(l)).filter((m) => m !== null);
    const namesAgent = coAuthored.some(([, name, email]) => agents.some((a) => a.name === name && (!a.email || String(a.email).toLowerCase() === email.toLowerCase())));
    return namesAgent && lines.some((l) => AI_MODEL_RE.test(l));
  };
  const conforming = judged.filter(conforms);
  const decisions = judged.filter((c) => ['approve', 'reject'].includes(dist.memory.parseMemoryOperation(c.subject)));
  const failingShas = new Set([...judged.filter((c) => !conforms(c)), ...decisions].map((c) => c.sha));
  return entry('G08', {
    value: {
      conforming_share: judged.length === 0 ? null : pct(conforming.length, judged.length),
      approve_reject_with_ai: decisions.length,
      distinct_trailers: unique(attributed.flatMap(aiLines)).sort(),
    },
    raw: {
      judged: judged.length,
      conforming: conforming.length,
      before_rule: attributed.length - judged.length,
      approve_reject_with_ai: decisions.length,
      ratified_at: ratifiedAt,
    },
    items: judged.length,
    small_sample: judged.length < smallSample,
    failing: nonMerge.filter((c) => failingShas.has(c.sha)).map((c) => c.sha),
  });
}

/** G14 — the spec-007 scanner over the lines the window's commits add. */
function measureSecrets(ctx) {
  const { root, point, base, dist, tree } = ctx;
  const globs = dist.validation.loadIgnoreGlobs(join(tree, '.wingfoil', 'security-ignore'));
  let blocking = 0;
  let warnings = 0;
  const failing = [];
  for (const file of readAddedLines(root, point, base)) {
    const result = dist.validation.scanText(file.lines.join('\n'), file.path, { pathIgnored: dist.validation.matchesIgnoreGlob(file.path, globs) });
    blocking += result.blocking.length;
    warnings += result.warnings.length;
    for (const finding of result.blocking) failing.push(`${file.sha} ${file.path} ${finding.patternId}`);
  }
  return entry('G14', { value: blocking, raw: { blocking, warnings }, failing });
}

/** G15 — stale remote-tracking branches, and Memory ids allocated twice across the refs (dl-101 Action 4). */
function measureBranches(ctx) {
  const { root, point, memoryYaml } = ctx;
  const refs = git(root, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads', 'refs/remotes'])
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\0'))
    .filter(([name]) => !name.endsWith('/HEAD'))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const pointTime = commitTime(root, point);
  const stale = refs
    .filter(([name, tip]) => name.startsWith('refs/remotes/') && !isAncestor(root, tip, point) && commitTime(root, tip) < pointTime)
    .map(([name]) => name);
  const roots = unique(Object.values(typeRoots(memoryYaml)));
  /** @type {Map<string, Set<string>>} */
  const byNumber = new Map();
  for (const tip of unique([point, ...refs.map(([, sha]) => sha)])) {
    for (const dir of roots) {
      for (const file of listFiles(root, tip, dir)) {
        if (!file.endsWith('.md')) continue;
        const id = posix.basename(file, '.md');
        const match = NUMBERED_ID_RE.exec(id);
        if (!match) continue;
        const key = `${match[1]}-${match[2]}`;
        if (!byNumber.has(key)) byNumber.set(key, new Set());
        byNumber.get(key).add(id);
      }
    }
  }
  const duplicates = [...byNumber.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([key, ids]) => `${key}: ${[...ids].sort().join(', ')}`)
    .sort();
  return entry('G15', {
    value: { stale_branches: stale.length, duplicate_ids: duplicates.length },
    raw: { refs_read: refs.length, refs_from: 'live refs at run time', stale_branches: stale.length, duplicate_ids: duplicates.length },
    failing: [...stale, ...duplicates],
  });
}

// --- process conformance (P01–P06, REQ-STATE-10) -----------------------------------------------------

/**
 * A governance finding that says a commit could not be judged — no `memory.yaml` or `dna.yaml` committed there
 * (history before the configuration existed): counted `unchecked`, never failing.
 */
const UNCHECKABLE_RE = /^no \.wingfoil\/(memory|dna)\.yaml is committed/;

/** The commits whose `rules` findings are all uncheckable: counted apart from the failing ones. */
function uncheckedCommits(report, rules) {
  const shas = new Set();
  for (const finding of report.findings) {
    if (rules.includes(finding.rule) && UNCHECKABLE_RE.test(finding.message)) shas.add(finding.sha);
  }
  return shas.size;
}

/** Governance findings of `rules`, one failing item per commit: `<sha> <subject>: <messages>`. */
function groupFindings(report, rules) {
  /** @type {Map<string, { subject: string, messages: string[] }>} */
  const bySha = new Map();
  for (const finding of report.findings) {
    if (!rules.includes(finding.rule) || UNCHECKABLE_RE.test(finding.message)) continue;
    if (!bySha.has(finding.sha)) bySha.set(finding.sha, { subject: finding.subject, messages: [] });
    bySha.get(finding.sha).messages.push(finding.message);
  }
  return [...bySha.entries()].map(([sha, { subject, messages }]) => `${sha} ${subject}: ${messages.join('; ')}`);
}

function countEntry(id, checked, failing, extra = {}) {
  return entry(id, { value: failing.length, raw: { checked, failing: failing.length, ...extra }, items: checked, failing });
}

/** Read a workflow definition at `rev`: `.wingfoil/workflows/custom/<name>.yaml`, else `built-in/`. */
function workflowAt(root, rev, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(String(name))) return null;
  return loadYamlAt(root, rev, `.wingfoil/workflows/custom/${name}.yaml`) ?? loadYamlAt(root, rev, `.wingfoil/workflows/built-in/${name}.yaml`);
}

/** Every Memory document at `rev`: id → { path, type root }. */
function memoryIndex(root, rev, memoryYaml) {
  const index = new Map();
  for (const dir of unique(Object.values(typeRoots(memoryYaml)))) {
    for (const file of listFiles(root, rev, dir)) {
      if (file.endsWith('.md') && !index.has(posix.basename(file, '.md'))) index.set(posix.basename(file, '.md'), file);
    }
  }
  return index;
}

function exists(root, rev, path) {
  if (path.endsWith('/')) return listFiles(root, rev, path).length > 0;
  return spawnSync('git', ['-C', root, 'cat-file', '-e', `${rev}:${path}`]).status === 0;
}

/** P03 — phases recorded complete in the window (a phase plan reaching `done`) whose produces are absent. */
function producesPresent(root, point, base, memoryYaml) {
  const roots = typeRoots(memoryYaml);
  const index = memoryIndex(root, point, memoryYaml);
  let checked = 0;
  let unresolved = 0;
  const failing = [];
  if (roots['plan'] === undefined) return countEntry('P03', 0, [], { unresolved: 0 });
  for (const path of listFiles(root, point, roots['plan'])) {
    if (!path.endsWith('.md')) continue;
    const fm = frontmatter(readBlob(root, point, path));
    if (!fm || fm.type !== 'plan' || fm.status !== 'done') continue;
    const before = base === null ? null : frontmatter(readBlob(root, base, path));
    if (before && before.status === 'done') continue;
    const workflow = workflowAt(root, point, fm.workflow);
    if (!workflow) {
      unresolved += 1; // a plan naming no workflow at the point: nothing to judge its phase against
      continue;
    }
    const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
    const named = phases.filter((p) => p && p.name === fm.phase);
    const elementPath = fm.element ? index.get(String(fm.element)) : undefined;
    const element = elementPath ? frontmatter(readBlob(root, point, elementPath)) : null;
    const scope = element && element.type ? { [element.type]: element } : {};
    for (const phase of named.length > 0 ? named : phases) {
      for (const pattern of Array.isArray(phase && phase.produces) ? phase.produces : []) {
        if (typeof pattern !== 'string') continue;
        if (/\s/.test(pattern.trim())) {
          unresolved += 1; // free text, not a path (older workflow files described an artifact in words)
          continue;
        }
        let open = false;
        const resolved = pattern.replace(/\{([^}]+)\}/g, (token, name) => {
          const [owner, field] = name.includes('.') ? name.split('.', 2) : ['release', name === 'release-line' ? 'release-line' : null];
          const value = field !== null && scope[owner] ? scope[owner][field] : undefined;
          if (value === undefined || value === null || value === '') {
            open = true;
            return token;
          }
          return String(value);
        });
        if (open) unresolved += 1;
        else {
          checked += 1;
          if (!exists(root, point, resolved)) failing.push(`${fm.id ?? posix.basename(path, '.md')}: ${resolved}`);
        }
      }
    }
  }
  return countEntry('P03', checked, failing, { unresolved });
}

/** P04 — the traceability links of the tasks the window touches, each resolved at the point. */
function traceability(root, point, commits, memoryYaml) {
  const roots = typeRoots(memoryYaml);
  if (roots['task'] === undefined) return countEntry('P04', 0, []);
  const index = memoryIndex(root, point, memoryYaml);
  const features = readBlob(root, point, FEATURES_FILE) ?? '';
  const sard = listFiles(root, point, SARD_DIR).map((f) => readBlob(root, point, f) ?? '').join('\n');
  const storyMap = listFiles(root, point, STORY_MAP_DIR).map((f) => readBlob(root, point, f) ?? '').join('\n');
  const bddFiles = listFiles(root, point, BDD_DIR);
  const touched = unique(commits.filter((c) => !c.merge).flatMap((c) => c.files).filter((f) => f.startsWith(roots['task']) && f.endsWith('.md'))).sort();
  const word = (text, id) => new RegExp(`(^|[^\\w.])${id.replace(/\./g, '\\.')}(?![\\w.]*\\d)`, 'm').test(text);
  const resolves = {
    element: (v) => index.has(v) || [...index.keys()].some((id) => id.startsWith(`${v}-`)),
    feature: (v) => word(features, v),
    req: (v) => new RegExp(`^#+\\s+${v}\\b`, 'm').test(sard),
    story: (v) => storyMap.includes(v),
    bdd: (v) => exists(root, point, v) || bddFiles.includes(`${BDD_DIR}${v}`) || (!v.includes('/') && bddFiles.some((f) => posix.basename(f) === v)),
  };
  let checked = 0;
  const failing = [];
  for (const path of touched) {
    const text = readBlob(root, point, path);
    const fm = frontmatter(text);
    if (!fm || fm.type !== 'task') continue;
    const id = fm.id ?? posix.basename(path, '.md');
    const links = [];
    // A frontmatter value is resolved by what it names: a requirement, a feature, else a Memory element.
    const kindOf = (v) => (/^REQ-[A-Z]+-\d+$/.test(v) ? 'req' : /^P\d+(?:\.\d+)+$/.test(v) ? 'feature' : 'element');
    for (const field of ELEMENT_LINK_FIELDS) for (const v of asList(fm[field])) links.push([field, v, kindOf(v)]);
    const body = bodyOf(text);
    for (const v of unique(body.match(FEATURE_ID_RE) ?? [])) links.push(['feature', v, 'feature']);
    for (const v of unique(body.match(REQ_ID_RE) ?? [])) links.push(['req', v, 'req']);
    for (const v of unique(body.match(US_ID_RE) ?? [])) links.push(['story', v, 'story']);
    for (const v of unique(body.match(FEATURE_FILE_RE) ?? [])) links.push(['bdd', v, 'bdd']);
    for (const [label, value, kind] of links) {
      checked += 1;
      if (!resolves[kind](value)) failing.push(`${id}: ${label} ${value}`);
    }
  }
  return countEntry('P04', checked, failing.sort());
}

/** The run records of `text` (JSON Lines), by id; an unreadable line is kept as `null`. */
function runRecords(text) {
  return (text ?? '').split('\n').filter((line) => line.trim() !== '').map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  });
}

/** P05 — approval authority (governance), and the roles and sessions of the run records the window adds. */
function rolesAndSessions(root, point, base, commits, dna, governance, dist) {
  const approvals = commits.filter((c) => !c.merge && APPROVAL_VERBS.has(dist.memory.parseMemoryOperation(c.subject))).length;
  const failing = groupFindings(governance, ['authority']);
  const agents = (dna && dna.team && dna.team.agents) || [];
  const runs = pathsOf(dna, 'runs')[0];
  let records = 0;
  const recordFailing = [];
  if (runs !== undefined) {
    for (const path of listFiles(root, point, runs)) {
      if (!path.endsWith('.jsonl')) continue;
      const all = runRecords(readBlob(root, point, path));
      const earlier = new Set(runRecords(base === null ? null : readBlob(root, base, path)).filter((r) => r !== null).map((r) => r.id));
      for (const record of all) {
        if (record === null) {
          records += 1;
          recordFailing.push(`${path}: a line is not a run record`);
          continue;
        }
        if (earlier.has(record.id)) continue;
        records += 1;
        const workflow = workflowAt(root, point, record.workflow);
        const phase = workflow && Array.isArray(workflow.phases) ? workflow.phases.find((p) => p && p.name === record.phase) : undefined;
        if (phase && phase.role && phase.role !== record.role) recordFailing.push(`${record.id}: role ${record.role}, the phase declares ${phase.role}`);
        const agent = agents.find((a) => a.name === record.agent);
        if (!agent) recordFailing.push(`${record.id}: agent ${record.agent} is not a team.agents entry`);
        else if (!(agent.executes_as || []).includes(record.role)) recordFailing.push(`${record.id}: agent ${record.agent} does not execute as ${record.role}`);
        const distinct = phase && Array.isArray(phase.distinct_from) ? phase.distinct_from : [];
        if (record.session === undefined || record.session === NOT_REPORTED) continue;
        for (const other of all) {
          if (other === null || other === record || other.element !== record.element || !distinct.includes(other.phase)) continue;
          if (other.session === record.session) recordFailing.push(`${record.id}: shares session ${record.session} with ${other.id} (distinct_from ${other.phase})`);
        }
      }
    }
  }
  return countEntry('P05', approvals + records, [...failing, ...recordFailing], { approvals, run_records: records, unchecked: uncheckedCommits(governance, ['authority']) });
}

function conformanceIn(root, tree, point, base, dist) {
  const governance = checkGovernance(tree, base === null ? {} : { base });
  const commits = readWindow(root, point, base);
  const memoryYaml = loadYamlAt(root, point, '.wingfoil/memory.yaml');
  const dna = loadYamlAt(root, point, '.wingfoil/dna.yaml');
  return [
    countEntry('P01', governance.checked, groupFindings(governance, ['subject', 'bracket', 'body']), { unchecked: uncheckedCommits(governance, ['subject', 'bracket', 'body']) }),
    countEntry('P02', governance.checked + governance.otherCommits, groupFindings(governance, ['state']), { unchecked: uncheckedCommits(governance, ['state']) }),
    producesPresent(root, point, base, memoryYaml),
    traceability(root, point, commits, memoryYaml),
    rolesAndSessions(root, point, base, commits, dna, governance, dist),
    notMeasurable('P06', BENCHMARK_REASON),
  ];
}

/**
 * The process conformance of `base..point` (REQ-STATE-10, P01–P06), computed from git and the configuration at the
 * point alone, in a throw-away worktree.
 */
function processConformance(root, point, base) {
  const dist = loadDist();
  const commit = resolveCommit(root, point, '--at');
  const from = base === null || base === undefined ? null : resolveCommit(root, base, '--previous');
  return withWorktree(root, commit, (tree) => conformanceIn(root, tree, commit, from, dist));
}

// --- external snapshot (E01–E05) ---------------------------------------------------------------------

/** `Fri, 09 Oct 2026 10:00:00 GMT` → `2026-10-09`, or `null`. */
function httpDay(header) {
  const match = /^\w{3}, (\d{2}) (\w{3}) (\d{4})/.exec(String(header ?? '').trim());
  return match && MONTHS[match[2]] ? `${match[3]}-${MONTHS[match[2]]}-${match[1]}` : null;
}

/** Split an HTTP response printed with its headers (`gh api --include`, `curl --include`). */
function parseHttp(text) {
  const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
  let i = 0;
  while (i < blocks.length - 1 && /^HTTP\/\S+ 1\d\d/.test(blocks[i])) i += 1; // skip interim responses
  const head = blocks[i] ?? '';
  const status = Number((/^HTTP\/\S+ (\d{3})/.exec(head) ?? [])[1]);
  const date = (/^date:\s*(.+)$/im.exec(head) ?? [])[1] ?? null;
  const rawBody = blocks.slice(i + 1).join('\n\n');
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  return status >= 200 && status < 300 ? { ok: true, date, body } : { ok: false, error: `HTTP ${status || '?'}: ${rawBody.trim().slice(0, 200)}` };
}

/** The default reader: `gh api --include` for a GitHub path, `curl --include` for a URL. */
function defaultReader(source) {
  const run = source.kind === 'gh'
    ? spawnSync('gh', ['api', '--include', source.target], { encoding: 'utf-8' })
    : spawnSync('curl', ['-sS', '--include', '--max-time', '30', source.target], { encoding: 'utf-8' });
  if (run.error) return { ok: false, error: run.error.message };
  if (run.status !== 0 && !String(run.stdout).startsWith('HTTP/')) return { ok: false, error: String(run.stderr || run.stdout).trim().split('\n')[0] };
  return parseHttp(String(run.stdout));
}

function commandOf(source) {
  return source.kind === 'gh' ? `gh api ${source.target}` : `curl ${source.target}`;
}

function measureExternal(root, point, options) {
  const ids = ['E01', 'E02', 'E03', 'E04', 'E05'];
  if (options.offline) return ids.map((id) => notMeasurable(id, 'offline run (--offline): the external snapshot was not read'));
  const pkg = (() => {
    try {
      return JSON.parse(readBlob(root, point, 'package.json') ?? 'null');
    } catch {
      return null;
    }
  })();
  const url = pkg && pkg.repository ? String(typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url) : '';
  const repo = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  const reader = options.external ?? defaultReader;
  /** Read every source; a value or the reason none was taken. */
  const read = (sources, value) => {
    const results = sources.map((source) => ({ source, response: reader(source) }));
    const failed = results.find((r) => !r.response.ok);
    if (failed) return { reason: `${commandOf(failed.source)} failed: ${failed.response.error ?? 'no response'}` };
    const day = httpDay(results[0].response.date);
    if (day === null) return { reason: `${commandOf(results[0].source)} carried no Date header, so the day it was read is unknown` };
    try {
      return { value: value(results.map((r) => r.response.body)), evidence: { command: results.map((r) => commandOf(r.source)).join(' ; '), read_on: day } };
    } catch (error) {
      return { reason: `${commandOf(results[0].source)} answered an unexpected body (${error.message})` };
    }
  };
  const num = (v) => {
    if (typeof v !== 'number') throw new Error('a count is missing');
    return v;
  };
  const make = (id, result) => (result.reason ? notMeasurable(id, result.reason) : entry(id, { value: result.value, evidence: result.evidence }));
  const out = [];
  if (!repo) for (const id of ['E01', 'E02', 'E03', 'E04']) out.push(notMeasurable(id, 'package.json at the point names no GitHub repository'));
  else {
    const target = `repos/${repo[1]}/${repo[2]}`;
    const meta = { kind: 'gh', target };
    out.push(make('E01', read([meta], ([b]) => num(b.stargazers_count))));
    out.push(make('E02', read([meta], ([b]) => num(b.forks_count))));
    out.push(make('E03', read([meta], ([b]) => num(b.subscribers_count))));
    out.push(make('E04', read([{ kind: 'gh', target: `${target}/traffic/views` }, { kind: 'gh', target: `${target}/traffic/clones` }], ([v, c]) => ({
      views: num(v.count), views_unique: num(v.uniques), clones: num(c.count), clones_unique: num(c.uniques),
    }))));
  }
  if (!pkg || typeof pkg.name !== 'string') out.push(notMeasurable('E05', 'package.json at the point names no package'));
  else {
    const api = 'https://api.npmjs.org/downloads/point';
    out.push(make('E05', read([{ kind: 'url', target: `${api}/last-week/${pkg.name}` }, { kind: 'url', target: `${api}/last-month/${pkg.name}` }], ([w, m]) => ({
      last_week: num(w.downloads), last_month: num(m.downloads),
    }))));
  }
  return out;
}

// --- the toolchain half (Q01–Q04, Q11, Q12, Q17; task-232) --------------------------------------------

/** The metrics the toolchain half measures, in catalogue order. */
const TOOLCHAIN_IDS = Object.freeze(['Q01', 'Q02', 'Q03', 'Q04', 'Q11', 'Q12', 'Q17']);
/** Q04's modules and floor (catalogue Q04, `dl-011`). */
const CRITICAL_MODULES = Object.freeze(['src/memory/audit.ts', 'src/memory/commit-message.ts', 'src/memory/state-machine.ts']);
const CRITICAL_BRANCH_FLOOR = 90;
/** Q12's budget, on the total and on the marginal p95 alike (catalogue Q12, REQ-PERF-02, `dl-146` (C)). */
const LATENCY_BUDGET_MS = 1000;
/** Q01's commands, in the order they run. */
const Q01_SCRIPTS = Object.freeze(['build', 'typecheck', 'lint']);
const COVERAGE_KINDS = Object.freeze(['statements', 'branches', 'functions', 'lines']);
/** Variables a tool must not inherit: the latency opt-ins (set per command) and git's repository overrides. */
const TOOL_ENV_DROPPED = Object.freeze(['WINGFOIL_LATENCY', 'WINGFOIL_LATENCY_REPORT', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']);
const USER_DOCS = Object.freeze(['docs/user-guide.md', 'README.md']);
const PUBLISH_WORKFLOW = '.github/workflows/publish.yml';

/** The default tool runner: spawn the command, collect its output; a stopper in `guard` lets a signal end it. */
function spawnTools(guard) {
  return (call) => new Promise((resolve) => {
    let child;
    try {
      child = spawn(call.command, call.args, { cwd: call.cwd, env: call.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    const closed = new Promise((done) => child.on('close', (code, signal) => done({ code, signal })));
    const stop = async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
      await closed;
      clearTimeout(timer);
    };
    if (guard) guard.stoppers.add(stop);
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (guard) guard.stoppers.delete(stop);
      resolve(result);
    };
    child.on('error', (error) => settle({ status: null, signal: null, stdout: '', stderr: '', error: error.message }));
    void closed.then(({ code, signal }) => settle({ status: code, signal, stdout: Buffer.concat(out).toString('utf-8'), stderr: Buffer.concat(err).toString('utf-8') }));
  });
}

/** The runner every step goes through: it logs the command, normalizes the result, and stops at an interrupt. */
function toolRunner(options, guard) {
  const tools = options.tools ?? spawnTools(guard);
  const check = () => {
    if (guard && guard.interrupted !== null) throw new Interrupted(guard.interrupted);
  };
  return async (call) => {
    check();
    if (options.log) options.log(`${call.step}: ${[call.command, ...call.args].join(' ')} in ${call.cwd}`);
    const result = await tools(call);
    check();
    // The worktree lives under a random temporary path: read relative to it, so no reason carries it.
    const relativize = (text) => String(text ?? '').split(`${call.cwd}/`).join('').split(call.cwd).join('.');
    return {
      status: typeof result.status === 'number' ? result.status : null,
      signal: result.signal ?? null,
      stdout: relativize(result.stdout),
      stderr: relativize(result.stderr),
      error: result.error === undefined ? undefined : relativize(result.error),
    };
  };
}

/** The environment of every tool: the running Node's directory first on `PATH`, so `npm` runs this Node. */
function toolEnv() {
  const env = { ...process.env };
  for (const name of TOOL_ENV_DROPPED) delete env[name];
  env.PATH = [dirname(process.execPath), process.env.PATH].filter((part) => part !== undefined && part !== '').join(delimiter);
  return env;
}

const lastLine = (text) => String(text).split('\n').map((line) => line.trim()).filter((line) => line !== '').pop() ?? '';

/** npm's pointer to its debug log (a home path and a timestamp), and its bare `npm error` separator lines. */
const NPM_NOISE_RE = /^npm (?:error|ERR!)(?:$| A complete log of this run can be found in)|\/_logs\//;

/**
 * The line of a tool's output that says why it failed, stable across runs (review F2): npm's `npm error code <CODE>`
 * when there is one, else the last line that is not npm's log pointer or a bare `npm error`.
 */
function reasonLine(text) {
  const lines = String(text).split('\n').map((line) => line.trim()).filter((line) => line !== '' && !NPM_NOISE_RE.test(line));
  return lines.find((line) => /^npm (?:error|ERR!) code \S/.test(line)) ?? lines.pop() ?? '';
}

/** Why a command gave no reading, or `null` when it ran to an exit status. */
function didNotRun(label, result) {
  if (result.error !== undefined) return `${label} could not run: ${result.error}`;
  if (result.signal !== null) return `${label} was killed by ${result.signal}`;
  if (result.status === null) return `${label} ended with no exit status`;
  return null;
}

/**
 * Exit statuses of Q01's `npm run` scripts that mean the tool itself could not run rather than that the check failed
 * (review F7): a shell's 126 (not executable) and 127 (not found), and eslint's 2 (configuration or internal error).
 * Not applied to the examples (re-review N4).
 */
const TOOL_ERROR_EXITS = Object.freeze({ '*': [126, 127], lint: [2] });

/** Why an exit status is a tool error rather than a result, or `null`. */
function toolError(label, result, name = '*') {
  const codes = [...TOOL_ERROR_EXITS['*'], ...(TOOL_ERROR_EXITS[name] ?? [])];
  return codes.includes(result.status) ? `${label} exited ${result.status}, which means the tool itself could not run` : null;
}

/** Why a command failed: did not run, or exited non-zero (with its last error line). */
function failure(label, result) {
  const reason = didNotRun(label, result);
  if (reason !== null) return reason;
  const line = reasonLine(result.stderr) || reasonLine(result.stdout);
  return `${label} failed (exit ${result.status})${line === '' ? '' : `: ${line}`}`;
}

const readText = (path) => {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
};

const readJson = (path) => {
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isCount = (value) => typeof value === 'number' && Number.isFinite(value);
const toPosix = (path) => path.split('\\').join('/');

/** The pipeline's pinned Node (`dl-089` §6): `NODE_VERSION` of the publish workflow in `tree`, as `vX.Y.Z`, or `null`. */
function pinnedNode(tree) {
  const match = /^\s*NODE_VERSION:\s*['"]?v?(\d+\.\d+\.\d+)['"]?\s*(?:#.*)?$/m.exec(readText(join(tree, PUBLISH_WORKFLOW)) ?? '');
  return match ? `v${match[1]}` : null;
}

/** An entry with `extra` merged into its `raw`, keys in the schema's order. */
const withRaw = (m, extra) => entry(m.id, { ...m, raw: { ...(m.raw ?? {}), ...extra } });

/**
 * What the latency pass's report (`WINGFOIL_LATENCY_REPORT=1`, `test/core/helpers/latency.ts` `latencyReport`) says,
 * read out of its output, or `null` when the output carries none.
 */
function parseLatencyReport(text) {
  const machine = /^[ \t]*machine: (.+?)[ \t]*$/m.exec(text);
  if (machine === null) return null;
  // The report's own load window is its header line; another latency suite (workflow next) prints a load line too.
  const load = /load average \(1-min \/ 5-min\): before ([\d.]+) \/ [\d.]+, after ([\d.]+) \/ [\d.]+ \(one window: /.exec(text);
  const floor = /^[ \t]*floor \(--version\): p95 (-?\d+) ms/m.exec(text);
  const commands = [...text.matchAll(/^[ \t]*([a-z][a-z -]*?): marginal p95 (-?\d+) ms \([^)]*\); total p95 (-?\d+) ms/gm)].map((m) => ({
    command: m[1],
    marginalP95: Number(m[2]),
    totalP95: Number(m[3]),
  }));
  return {
    machine: machine[1],
    idle: machine[1] === 'otherwise idle',
    load: load === null ? null : { before: Number(load[1]), after: Number(load[2]) },
    floorP95: floor === null ? null : Number(floor[1]),
    commands,
  };
}

/** Q01: build, typecheck and lint each exit 0. */
function q01(scripts, results) {
  const missing = Q01_SCRIPTS.find((name) => !(name in scripts));
  if (missing !== undefined) return notMeasurable('Q01', `package.json at the measurement point has no \`${missing}\` script`);
  for (const name of Q01_SCRIPTS) {
    const reason = didNotRun(`npm run ${name}`, results[name]) ?? toolError(`npm run ${name}`, results[name], name);
    if (reason !== null) return notMeasurable('Q01', reason);
  }
  const failing = Q01_SCRIPTS.filter((name) => results[name].status !== 0).map((name) => `npm run ${name} (exit ${results[name].status})`);
  return entry('Q01', { value: failing.length === 0, raw: Object.fromEntries(Q01_SCRIPTS.map((name) => [name, results[name].status])), failing });
}

/** Q02: total, failing and disabled tests, from jest's `--json` results. */
function q02(tree, result, resultsFile) {
  const reason = didNotRun('npm test', result);
  if (reason !== null) return notMeasurable('Q02', reason);
  const json = readJson(resultsFile);
  const counts = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'numRuntimeErrorTestSuites'];
  if (json === null || !counts.every((key) => isCount(json[key])) || !Array.isArray(json.testResults)) {
    const line = reasonLine(result.stderr);
    return notMeasurable('Q02', `npm test wrote no readable JSON results (exit ${result.status})${line === '' ? '' : `: ${line}`}`);
  }
  const failing = [];
  for (const suite of json.testResults) {
    const file = toPosix(relative(tree, String(suite.name)));
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    const failed = assertions.filter((a) => a.status === 'failed');
    for (const a of failed) failing.push(`${file} › ${a.fullName}`);
    if (suite.testExecError) failing.push(`${file} (suite failed to run)`);
    else if (suite.status === 'failed' && failed.length === 0) failing.push(`${file} (suite failed)`);
  }
  failing.sort();
  return entry('Q02', {
    value: { total: json.numTotalTests, failing: json.numFailedTests + json.numRuntimeErrorTestSuites, disabled: json.numPendingTests + json.numTodoTests },
    raw: {
      total: json.numTotalTests,
      passed: json.numPassedTests,
      failed: json.numFailedTests,
      skipped: json.numPendingTests,
      todo: json.numTodoTests,
      failed_suites: json.numRuntimeErrorTestSuites,
    },
    failing,
  });
}

/** Q03 (the coverage totals) and Q04 (the critical modules' branch coverage), from jest's `json-summary`. */
function q03q04(tree, result, summaryFile) {
  const reason = didNotRun('npm run test:coverage', result);
  if (reason !== null) return [notMeasurable('Q03', reason), notMeasurable('Q04', reason)];
  const summary = readJson(summaryFile);
  const readable = (counts) => counts && isCount(counts.covered) && isCount(counts.total) && isCount(counts.pct);
  if (summary === null || !summary.total || !COVERAGE_KINDS.every((kind) => readable(summary.total[kind]))) {
    const unreadable = `npm run test:coverage wrote no readable coverage summary (exit ${result.status})`;
    return [notMeasurable('Q03', unreadable), notMeasurable('Q04', unreadable)];
  }
  const files = new Map(Object.keys(summary).filter((key) => key !== 'total').map((key) => [toPosix(relative(tree, key)), summary[key]]));
  const q03 = entry('Q03', {
    value: Object.fromEntries(COVERAGE_KINDS.map((kind) => [kind, summary.total[kind].pct])),
    raw: {
      ...Object.fromEntries(COVERAGE_KINDS.flatMap((kind) => [[`${kind}_covered`, summary.total[kind].covered], [`${kind}_total`, summary.total[kind].total]])),
      files: files.size,
    },
  });
  const missing = CRITICAL_MODULES.filter((file) => !files.has(file) || !readable(files.get(file).branches));
  if (missing.length > 0) return [q03, notMeasurable('Q04', `${missing.join(', ')} not in the coverage summary of npm run test:coverage`)];
  const branches = (file) => files.get(file).branches;
  return [q03, entry('Q04', {
    value: Object.fromEntries(CRITICAL_MODULES.map((file) => [file, branches(file).pct])),
    raw: Object.fromEntries(CRITICAL_MODULES.flatMap((file) => [[`${file} covered`, branches(file).covered], [`${file} total`, branches(file).total]])),
    failing: CRITICAL_MODULES.filter((file) => branches(file).pct < CRITICAL_BRANCH_FLOOR)
      .map((file) => `${file}: branches ${branches(file).pct}% (${branches(file).covered}/${branches(file).total}) < ${CRITICAL_BRANCH_FLOOR}%`),
  })];
}

/** Q11: the share of `docs/examples/*\/run.sh` that pass against the point's build. */
async function q11(tree, run, env, built) {
  const dir = join(tree, 'docs', 'examples');
  const names = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'run.sh'))).map((d) => d.name).sort() : [];
  if (names.length === 0) return notMeasurable('Q11', 'no docs/examples/*/run.sh at the measurement point');
  if (!built) return notMeasurable('Q11', 'npm run build did not succeed, so there is no dist/cli.js for the examples to run');
  const failing = [];
  let unrunnable = null;
  for (const name of names) {
    const script = `docs/examples/${name}/run.sh`;
    const result = await run({ step: `examples/${name}`, command: 'bash', args: [join(dir, name, 'run.sh')], cwd: tree, env: { ...env, WINGFOIL: `node ${join(tree, 'dist', 'cli.js')}` } });
    // An example's 126/127 is a command missing inside it (bash runs run.sh by its absolute path): a defect it
    // reports, so a measured failure, not a tool error (re-review N4).
    const reason = didNotRun(script, result);
    if (reason !== null) unrunnable ??= reason;
    else if (result.status !== 0) failing.push(`${script} (exit ${result.status})`);
  }
  if (unrunnable !== null) return notMeasurable('Q11', unrunnable);
  const passed = names.length - failing.length;
  return entry('Q11', { value: pct(passed, names.length), raw: { executed: names.length, passed }, failing });
}

/** Q12: the latency pass's p95s; a loaded run is not-measurable (catalogue Q12; approver ruling R4, W3 B6). */
function q12(result) {
  const reason = didNotRun('npm run test:latency', result);
  if (reason !== null) return notMeasurable('Q12', reason);
  const reading = parseLatencyReport(`${result.stdout}\n${result.stderr}`);
  if (reading === null || reading.commands.length === 0) {
    return notMeasurable('Q12', `npm run test:latency printed no latency report (exit ${result.status}; WINGFOIL_LATENCY_REPORT=1 was set)`);
  }
  const raw = {
    machine: reading.machine,
    load_1m_before: reading.load === null ? null : reading.load.before,
    load_1m_after: reading.load === null ? null : reading.load.after,
    floor_p95_ms: reading.floorP95,
    ...Object.fromEntries(reading.commands.flatMap((c) => [[`${c.command} total_p95_ms`, c.totalP95], [`${c.command} marginal_p95_ms`, c.marginalP95]])),
  };
  if (!reading.idle) return entry('Q12', { status: 'not-measurable', reason: `a loaded run is not a REQ-PERF-02 measurement (catalogue Q12): ${reading.machine}`, raw });
  const failing = reading.commands.flatMap((c) => [['total', c.totalP95], ['marginal', c.marginalP95]]
    .filter(([, value]) => value >= LATENCY_BUDGET_MS)
    .map(([quantity, value]) => `${c.command}: ${quantity} p95 ${value} ms >= ${LATENCY_BUDGET_MS} ms`));
  return entry('Q12', { value: Math.max(...reading.commands.map((c) => c.totalP95)), raw, failing });
}

/** Q17: the user documentation's install command resolves (`npm view`) to the version it documents. */
async function q17(tree, run, env, offline) {
  if (offline) return notMeasurable('Q17', 'offline run (--offline): npm view was not run');
  let found = null;
  for (const doc of USER_DOCS) {
    const text = readText(join(tree, doc));
    const command = text === null ? null : /^[ \t]*(npm (?:install|i) (?:-g|--global) (\S+))[ \t]*$/m.exec(text);
    if (command !== null) {
      found = { doc, text, command: command[1].replace(/\s+/g, ' '), spec: command[2] };
      break;
    }
  }
  if (found === null) return notMeasurable('Q17', `the user documentation (${USER_DOCS.join(', ')}) gives no \`npm install -g\` command`);
  const documented = /\*\*v?(\d+\.\d+\.\d+)\*\*/.exec(found.text);
  if (documented === null) return notMeasurable('Q17', `${found.doc} states no version (a bold **X.Y.Z**) for its install command`);
  const args = ['view', found.spec, 'version', '--json'];
  const label = `npm ${args.join(' ')}`;
  const result = await run({ step: 'npm-view', command: 'npm', args, cwd: tree, env });
  if (didNotRun(label, result) !== null || result.status !== 0) return notMeasurable('Q17', failure(label, result));
  let resolved;
  try {
    const parsed = JSON.parse(result.stdout);
    resolved = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
  } catch {
    resolved = undefined;
  }
  if (typeof resolved !== 'string') return notMeasurable('Q17', `${label} answered no version: ${lastLine(result.stdout)}`);
  const ok = resolved === documented[1];
  return entry('Q17', {
    value: ok,
    raw: { install_command: found.command, documented: documented[1], documented_in: found.doc, resolved, resolved_from: 'the registry at run time' },
    failing: ok ? [] : [`${found.command} resolves to ${resolved}, the documentation says ${documented[1]}`],
    evidence: { command: label },
  });
}

/**
 * The toolchain half (task-232; `dl-089` §2, §6): in `tree`, a checkout of the measurement point, `npm ci` and then
 * each metric's command, with the pipeline's pinned Node; tool outputs go under `scratch`. A tool that cannot run, is
 * killed, or leaves an output the reader cannot parse makes its metric `not-measurable` with the reason, never a zero.
 *
 * @param {string} tree @param {string} scratch
 * @param {{ tools?: Function, anyNode?: boolean, offline?: boolean, maxWorkers?: number, log?: (line: string) => void }} [options]
 * @param {{ interrupted: string | null, stoppers: Set<() => Promise<void>> } | null} [guard] the worktree's signal guard
 */
async function measureToolchain(tree, scratch, options = {}, guard = null) {
  const pinned = pinnedNode(tree);
  if (pinned !== process.version && !options.anyNode) {
    const reason = pinned === null
      ? `no pinned Node at the point (${PUBLISH_WORKFLOW} env.NODE_VERSION): run under the pipeline's Node with --any-node`
      : `the running Node ${process.version} is not the pipeline's pinned ${pinned} (${PUBLISH_WORKFLOW} env.NODE_VERSION at the point): run under it, or pass --any-node`;
    return TOOLCHAIN_IDS.map((id) => notMeasurable(id, reason));
  }
  const entries = await toolchainEntries(tree, scratch, options, toolRunner(options, guard));
  return pinned === process.version ? entries : entries.map((m) => withRaw(m, { node: process.version, node_pinned: pinned }));
}

async function toolchainEntries(tree, scratch, options, run) {
  const env = toolEnv();
  const npm = (step, args, extraEnv = {}) => run({ step, command: 'npm', args, cwd: tree, env: { ...env, ...extraEnv } });
  const install = await npm('install', ['ci']);
  if (install.error !== undefined || install.signal !== null || install.status !== 0) {
    const reason = failure('npm ci', install);
    return TOOLCHAIN_IDS.map((id) => notMeasurable(id, reason));
  }
  const pkg = readJson(join(tree, 'package.json'));
  const scripts = pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const noScript = (id, name) => notMeasurable(id, `package.json at the measurement point has no \`${name}\` script`);
  const workers = options.maxWorkers === undefined ? [] : [`--maxWorkers=${options.maxWorkers}`];

  const q01Results = {};
  for (const name of Q01_SCRIPTS) if (name in scripts) q01Results[name] = await npm(name, ['run', name]);
  const built = 'build' in scripts && q01Results.build.status === 0 && q01Results.build.signal === null && q01Results.build.error === undefined;

  const resultsFile = join(scratch, 'jest-results.json');
  const q02Entry = 'test' in scripts
    ? q02(tree, await npm('test', ['test', '--', '--json', `--outputFile=${resultsFile}`, ...workers]), resultsFile)
    : noScript('Q02', 'test');

  const coverageDir = join(scratch, 'coverage');
  const coverage = 'test:coverage' in scripts
    ? q03q04(tree, await npm('coverage', ['run', 'test:coverage', '--', '--coverageReporters=json-summary', `--coverageDirectory=${coverageDir}`, ...workers]), join(coverageDir, 'coverage-summary.json'))
    : [noScript('Q03', 'test:coverage'), noScript('Q04', 'test:coverage')];

  const q11Entry = await q11(tree, run, env, built);
  const q12Entry = 'test:latency' in scripts ? q12(await npm('latency', ['run', 'test:latency'], { WINGFOIL_LATENCY_REPORT: '1' })) : noScript('Q12', 'test:latency');
  const q17Entry = await q17(tree, run, env, options.offline === true);
  // What measureRelease reads from the installed tree after the seven (Q08's install size, task-233).
  if (options.afterToolchain) await options.afterToolchain(run, env);
  return [q01(scripts, q01Results), q02Entry, ...coverage, q11Entry, q12Entry, q17Entry];
}

// --- the static and Memory metrics (Q05–Q10, Q13–Q16, Q18–Q20; task-233) --------------------------------

/** The code files the static metrics read (paths.sources, paths.tests). */
const CODE_FILE_RE = /\.[cm]?[jt]sx?$/;
/** A file under a `fixtures/` directory: fixture data, not a citation or a test (Q09, Q10). */
const FIXTURE_DIR_RE = /(^|\/)fixtures\//;
/** Q05's thresholds (catalogue Q05). */
const COMPLEXITY_MAX = 15;
const FUNCTION_LINES_MAX = 80;
/** Q06's smallest clone, in lines (catalogue Q06). */
const CLONE_MIN_LINES = 8;
/** spec-006 §1: the surfaces, and the modules underneath `src/core` they never import directly (Q07). */
const isSurface = (path) => path === 'src/cli.ts' || path.startsWith('src/cli/') || path.startsWith('src/mcp/');
const UNDERNEATH_CORE = Object.freeze(['src/storage', 'src/memory', 'src/dna', 'src/directives', 'src/workflow']);
/** A process id (Q09): a task, bug, decision-log, ADR, tech-spec or service id with its number. */
const PROCESS_ID_RE = /(?<![\w-])(task|bug|dl|adr|spec|svc)-(\d+)(?!\d)/g;
/** The calls whose first argument is a test title (Q09). */
const TEST_CALLS = new Set(['describe', 'it', 'test']);
/** From this release on a task's class is its declared field (`dl-133` Q1 (b), task-150); before it, the heuristic. */
const KIND_DECLARED_FROM = 'v0.3';
const TERMINAL_BUG_STATES = Object.freeze(['closed', 'deprecated']);
const SEVERITY_ORDER = Object.freeze(['critical', 'high', 'medium', 'low']);
const DAY_SECONDS = 86400;

/** A devDependency of the measuring checkout (eslint, typescript), or `null` when it is not installed. */
function devModule(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

/** The blobs at `rev` of `paths`, with one `git cat-file --batch`: path → text, or `null` when there is none. */
function readBlobs(root, rev, paths) {
  /** @type {Map<string, string | null>} */
  const out = new Map();
  if (paths.length === 0) return out;
  const raw = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: `${paths.map((p) => `${rev}:${p}`).join('\n')}\n`,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let pos = 0;
  for (const path of paths) {
    const nl = raw.indexOf(10, pos);
    const header = raw.toString('utf-8', pos, nl);
    pos = nl + 1;
    if (!/^[0-9a-f]+ blob \d+$/.test(header)) {
      out.set(path, null); // `<rev:path> missing`, or not a blob
      continue;
    }
    const size = Number(header.split(' ')[2]);
    out.set(path, raw.toString('utf-8', pos, pos + size));
    pos += size + 1;
  }
  return out;
}

/** `<prefix>-<number>` of an id (`bug-003-crash` → `bug-3`), or `null`. */
function idKey(id) {
  const match = NUMBERED_ID_RE.exec(String(id));
  return match ? `${match[1]}-${Number(match[2])}` : null;
}

/** The short form an id is cited by (`bug-003-crash` → `bug-003`), or the id itself. */
function shortId(id) {
  const match = /^([a-z][a-z-]*?-\d+)(?:-|$)/.exec(String(id));
  return match ? match[1] : String(id);
}

/** The pattern of a citation of `short` (`task-003`), not as the prefix of a longer number; built once per id. */
const CITATIONS = new Map();
/** Whether `text` cites `short`. */
function cites(text, short) {
  if (!CITATIONS.has(short)) CITATIONS.set(short, new RegExp(`(?<![\\w-])${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`));
  return CITATIONS.get(short).test(text);
}

/** The ids a `wf(...)` subject names (`wf(task): add a, b [x → y]` → `[a, b]`). */
function subjectIds(subject) {
  return subject.replace(/^wf\([^)]*\):\s*\S+\s+/, '').replace(/\s*[[(].*$/, '').split(/,\s*/).filter((id) => id !== '');
}

/** Every Memory document at `rev` under `memoryYaml`'s type folders: `{ path, id, type, fm, text }`, by path. */
function memoryDocsAt(root, rev, memoryYaml) {
  const paths = unique(Object.values(typeRoots(memoryYaml))).flatMap((dir) => listFiles(root, rev, dir)).filter((p) => p.endsWith('.md'));
  const texts = readBlobs(root, rev, unique(paths).sort());
  const docs = [];
  for (const [path, text] of texts) {
    const fm = frontmatter(text);
    if (!fm || typeof fm.type !== 'string') continue;
    docs.push({ path, id: String(fm.id ?? posix.basename(path, '.md')), type: fm.type, fm, text });
  }
  return docs;
}

/** `.md` file name (without `.md`) → path, for every Markdown file at `rev`: a document found by name across moves. */
function markdownByName(root, rev) {
  const index = new Map();
  for (const path of listFiles(root, rev, '.')) if (path.endsWith('.md') && !index.has(posix.basename(path, '.md'))) index.set(posix.basename(path, '.md'), path);
  return index;
}

/** The code files under `dirs` at the point, sorted, with their text: `[path, text][]`. */
function codeFiles(root, point, dirs, filter = () => true) {
  const paths = unique(dirs.flatMap((dir) => listFiles(root, point, dir))).filter((p) => CODE_FILE_RE.test(p) && filter(p)).sort();
  return [...readBlobs(root, point, paths)].filter(([, text]) => text !== null);
}

/** The comment ranges of a parsed file, by position (every token's leading and trailing comments). */
function commentRanges(ts, sf, text) {
  const seen = new Map();
  const add = (ranges) => {
    for (const r of ranges ?? []) if (!seen.has(r.pos)) seen.set(r.pos, r);
  };
  const walk = (node) => {
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(sf)) walk(child);
  };
  walk(sf);
  return [...seen.values()].sort((a, b) => a.pos - b.pos);
}

const parse = (ts, path, text) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, /\.[cm]?jsx?$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);

/** Every module a file imports: import/export declarations, `import x = require()`, `require()`, `import()`, `import('x').T`. */
function importsOf(ts, sf) {
  const out = [];
  const allTypes = (elements) => elements.length > 0 && elements.every((e) => e.isTypeOnly);
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = clause !== undefined && (clause.isTypeOnly || (!clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && allTypes(clause.namedBindings.elements)));
      out.push({ spec: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly || (node.exportClause !== undefined && ts.isNamedExports(node.exportClause) && allTypes(node.exportClause.elements)) });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      out.push({ spec: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node) && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      out.push({ spec: node.arguments[0].text, typeOnly: false });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** A relative import's target: the file it resolves to among `files`, else the normalized path; `null` for a package. */
function resolveImport(from, spec, files) {
  if (!spec.startsWith('.')) return null;
  const target = posix.normalize(posix.join(posix.dirname(from), spec));
  const bare = target.replace(/\.[cm]?js$/, '');
  for (const candidate of [target, ...['.ts', '.tsx', '.cts', '.mts', '.js', '.cjs', '.mjs'].map((ext) => `${bare}${ext}`), `${bare}/index.ts`, `${bare}/index.js`]) {
    if (files.has(candidate)) return candidate;
  }
  return target;
}

/** The package a bare specifier names (`@scope/name/sub` → `@scope/name`), or `null` for a Node builtin. */
function packageOf(spec) {
  if (spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** The strongly connected components of `graph` (node → sorted targets) with a cycle, each as one cycle from its first node. */
function importCycles(graph) {
  const nodes = [...graph.keys()].sort();
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;
  const connect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component.sort());
    }
  };
  for (const v of nodes) if (!index.has(v)) connect(v);
  const cyclic = components.filter((c) => c.length > 1 || (graph.get(c[0]) ?? []).includes(c[0]));
  // One cycle per component: the shortest path from its first file back to it, inside the component.
  return cyclic.map((component) => {
    const inside = new Set(component);
    const start = component[0];
    const previous = new Map([[start, null]]);
    const queue = [start];
    let last = null;
    while (queue.length > 0 && last === null) {
      const v = queue.shift();
      for (const w of graph.get(v) ?? []) {
        if (w === start) {
          last = v;
          break;
        }
        if (inside.has(w) && !previous.has(w)) {
          previous.set(w, v);
          queue.push(w);
        }
      }
    }
    const path = [];
    for (let v = last; v !== null; v = previous.get(v)) path.unshift(v);
    return path;
  }).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Q05 — functions above complexity 15 and above 80 lines (ESLint's `complexity` and `max-lines-per-function`). */
function q05(sources) {
  const eslint = devModule('eslint');
  const tseslint = devModule('typescript-eslint');
  if (eslint === null || tseslint === null) return notMeasurable('Q05', 'the measuring checkout has no eslint and typescript-eslint (devDependencies): run npm ci');
  const linter = new eslint.Linter({ configType: 'flat' });
  const config = [{
    files: ['**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}'],
    languageOptions: { parser: tseslint.parser, sourceType: 'module' },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    rules: { complexity: ['error', COMPLEXITY_MAX], 'max-lines-per-function': ['error', { max: FUNCTION_LINES_MAX, skipBlankLines: false, skipComments: false, IIFEs: true }] },
  }];
  const complex = [];
  const long = [];
  const unparsable = [];
  for (const [path, text] of sources) {
    for (const m of linter.verify(text, config, { filename: path })) {
      if (m.fatal) unparsable.push(`${path}:${m.line} ${m.message}`);
      else if (m.ruleId === 'complexity') {
        const match = /^(.*) has a complexity of (\d+)/.exec(m.message);
        complex.push({ path, line: m.line, text: match ? `${match[1]}: complexity ${match[2]}` : m.message });
      } else if (m.ruleId === 'max-lines-per-function') {
        const match = /^(.*) has too many lines \((\d+)\)/.exec(m.message);
        long.push({ path, line: m.line, text: match ? `${match[1]}: ${match[2]} lines` : m.message });
      }
    }
  }
  if (unparsable.length > 0) return notMeasurable('Q05', `ESLint could not parse ${unparsable.join('; ')}`);
  const named = (items) => items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)).map((i) => `${i.path}:${i.line} ${i.text}`);
  return entry('Q05', {
    value: { complex: complex.length, long: long.length },
    raw: { functions_over_complexity: complex.length, functions_over_lines: long.length, files: sources.length },
    failing: [...named(complex), ...named(long)],
  });
}

/** Lines of `files` inside a clone: a run of at least 8 non-blank lines (compared trimmed) found at two places or more. */
function duplicatedLines(files) {
  const trimmed = files.map(([, text]) => text.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
  const key = (lines, i) => createHash('sha1').update(lines.slice(i, i + CLONE_MIN_LINES).join('\n')).digest('hex');
  const seen = new Map();
  for (const lines of trimmed) for (let i = 0; i + CLONE_MIN_LINES <= lines.length; i += 1) seen.set(key(lines, i), (seen.get(key(lines, i)) ?? 0) + 1);
  let duplicated = 0;
  let total = 0;
  for (const lines of trimmed) {
    const marked = new Array(lines.length).fill(false);
    for (let i = 0; i + CLONE_MIN_LINES <= lines.length; i += 1) {
      if (seen.get(key(lines, i)) > 1) for (let j = i; j < i + CLONE_MIN_LINES; j += 1) marked[j] = true;
    }
    duplicated += marked.filter(Boolean).length;
    total += lines.length;
  }
  return { duplicated, total };
}

/** Q06 — the duplicated-line share of each category. */
function q06(sources, tests) {
  const s = duplicatedLines(sources);
  const t = duplicatedLines(tests);
  if (s.total + t.total === 0) return notMeasurable('Q06', 'no code line under paths.sources or paths.tests at the measurement point');
  return entry('Q06', {
    value: { sources: s.total === 0 ? null : pct(s.duplicated, s.total), tests: t.total === 0 ? null : pct(t.duplicated, t.total) },
    raw: { sources_duplicated: s.duplicated, sources_lines: s.total, tests_duplicated: t.duplicated, tests_lines: t.total },
  });
}

/** Q07 — import cycles among the sources, and surface imports bypassing src/core that no Memory element records. */
function q07(parsed, docs) {
  const files = new Set(parsed.map((p) => p.path));
  const graph = new Map();
  const bypasses = [];
  for (const { path, imports } of parsed) {
    const targets = new Set();
    for (const { spec, typeOnly } of imports) {
      const target = resolveImport(path, spec, files);
      if (target === null) continue;
      if (!typeOnly && files.has(target)) targets.add(target);
      const module = isSurface(path) ? UNDERNEATH_CORE.find((dir) => target === dir || target.startsWith(`${dir}/`)) : undefined;
      if (module !== undefined) bypasses.push({ path, spec, module });
    }
    graph.set(path, [...targets].sort());
  }
  const deviationLines = docs.flatMap((d) => d.text.split('\n')).filter((line) => /deviation/i.test(line));
  // Recorded: one line names the importing file, the module it reaches and the word "deviation".
  const recorded = (b) => deviationLines.some((line) => line.includes(b.path) && line.includes(b.module));
  const unrecorded = unique(bypasses.filter((b) => !recorded(b)).map((b) => `bypass: ${b.path} imports ${b.spec} (${b.module})`)).sort();
  const cycles = importCycles(graph).map((cycle) => `cycle: ${cycle.join(' → ')}`);
  return entry('Q07', {
    value: { cycles: cycles.length, bypasses: unrecorded.length },
    raw: { cycles: cycles.length, bypasses: unrecorded.length, recorded_deviations: unique(bypasses.filter((b) => recorded(b)).map((b) => `${b.path} ${b.spec}`)).length },
    failing: [...unrecorded, ...cycles],
  });
}

/** Q09 — process ids cited in comments and test titles that resolve to no Memory element. */
function q09(ts, files, docs) {
  const known = new Set(docs.map((d) => idKey(d.id)).filter((k) => k !== null));
  const references = new Set();
  const dangling = new Set();
  for (const { path, sf, text, comments } of files) {
    const chunks = comments.map((r) => text.slice(r.pos, r.end));
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
        let callee = node.expression;
        while (ts.isPropertyAccessExpression(callee)) callee = callee.expression;
        if (ts.isIdentifier(callee) && TEST_CALLS.has(callee.text)) chunks.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const chunk of chunks) {
      for (const match of chunk.matchAll(PROCESS_ID_RE)) {
        const item = `${path}: ${match[0]}`;
        references.add(item);
        if (!known.has(`${match[1]}-${Number(match[2])}`)) dangling.add(item);
      }
    }
  }
  return entry('Q09', { value: dangling.size, raw: { references: references.size, dangling: dangling.size }, failing: [...dangling].sort() });
}

/** Q16's second half: the share of non-blank source lines whose every character is inside a comment. */
function commentLines(files) {
  let comment = 0;
  let nonBlank = 0;
  for (const { text, comments } of files) {
    const mask = new Uint8Array(text.length);
    for (const r of comments) mask.fill(1, r.pos, r.end);
    let start = 0;
    for (const line of text.split('\n')) {
      if (line.trim() !== '') {
        nonBlank += 1;
        let inside = true;
        for (let i = 0; i < line.length && inside; i += 1) if (!/\s/.test(line[i]) && mask[start + i] !== 1) inside = false;
        if (inside) comment += 1;
      }
      start += line.length + 1;
    }
  }
  return { comment, nonBlank };
}

/** Q10 — the share of the release's requirements cited by a test outside fixtures. */
function q10(root, point, release, docs, tests, smallSample) {
  const doc = docs.find((d) => d.type === 'release' && String(d.fm.version) === release.version);
  const declared = doc ? asList(doc.fm.requirements) : [];
  if (declared.length === 0) return notMeasurable('Q10', `the release element ${release.id} at the point declares no requirements: scope`);
  const ids = unique(declared.flatMap((value) => (/^REQ-[A-Z]+-\d+$/.test(value) ? [value] : (readBlob(root, point, value) ?? '').match(REQ_ID_RE) ?? []))).sort();
  if (ids.length === 0) return notMeasurable('Q10', `the requirements: scope of ${release.id} (${declared.join(', ')}) names no REQ id at the point`);
  const text = tests.map(([, t]) => t).join('\n');
  const uncited = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(text));
  return share('Q10', ids.length - uncited.length, ids.length, ['cited', 'total'], ids.length, uncited, smallSample);
}

/** The bugs at the point, each with its frontmatter at the previous point (`null` when it did not exist then). */
function bugFlow(root, base, docs) {
  const bugs = docs.filter((d) => d.type === 'bug').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const before = base === null ? new Map() : markdownByName(root, base);
  const paths = bugs.map((b) => before.get(posix.basename(b.path, '.md'))).filter((p) => p !== undefined);
  const texts = base === null ? new Map() : readBlobs(root, base, paths);
  return bugs.map((b) => {
    const path = before.get(posix.basename(b.path, '.md'));
    return { ...b, was: path === undefined ? null : frontmatter(texts.get(path) ?? null) ?? {} };
  });
}

/** Q13 — bug flow: added and closed in the window; open bugs by severity and without a release. */
function q13(flow, smallSample) {
  const added = flow.filter((b) => b.was === null);
  const closed = flow.filter((b) => b.fm.status === 'closed' && (b.was === null || b.was.status !== 'closed'));
  const open = flow.filter((b) => !TERMINAL_BUG_STATES.includes(b.fm.status));
  const unassigned = open.filter((b) => asList(b.fm.release).length === 0);
  const severities = unique(open.map((b) => String(b.fm.severity ?? 'none')));
  const ordered = [...SEVERITY_ORDER.filter((s) => severities.includes(s)), ...severities.filter((s) => !SEVERITY_ORDER.includes(s)).sort()];
  return entry('Q13', {
    value: { added: added.length, closed: closed.length, closure_ratio: added.length === 0 ? null : pct(closed.length, added.length), open_unassigned: unassigned.length },
    raw: {
      added: added.length,
      closed: closed.length,
      open: open.length,
      open_unassigned: unassigned.length,
      ...Object.fromEntries(ordered.map((s) => [`open ${s}`, open.filter((b) => String(b.fm.severity ?? 'none') === s).length])),
    },
    items: added.length,
    small_sample: added.length < smallSample,
  });
}

/** Q20 — bugs moved to a terminal state in the window minus bugs added in it. */
function q20(flow, smallSample) {
  const added = flow.filter((b) => b.was === null).length;
  const terminal = flow.filter((b) => TERMINAL_BUG_STATES.includes(b.fm.status) && (b.was === null || !TERMINAL_BUG_STATES.includes(b.was.status))).length;
  const net = terminal - added;
  return entry('Q20', {
    value: net,
    raw: { terminal, added },
    items: added,
    small_sample: added < smallSample,
    failing: net < 0 ? [`net flow ${net}: ${terminal} bugs reached closed or deprecated, ${added} were added`] : [],
  });
}

/** Q14 — decision-logs in-discussion at the point: count and median age in days since their add commit. */
function q14(root, point, docs) {
  const open = docs.filter((d) => d.type === 'decision-log' && d.fm.status === 'in-discussion').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const log = git(root, ['log', '--no-show-signature', '--format=%H%x00%ct%x00%s', point]).split('\n').filter((line) => line !== '').map((line) => line.split('\0'));
  const pointTime = commitTime(root, point);
  const ages = open.map((d) => {
    // The oldest `wf(decision-log): add` naming it (moves keep it), else the oldest commit adding the file at its path.
    const adds = log.filter(([, , subject]) => subject.startsWith('wf(decision-log): add ') && subjectIds(subject).includes(d.id));
    let time = adds.length > 0 ? Number(adds[adds.length - 1][1]) : null;
    if (time === null) {
      const created = git(root, ['log', '--no-show-signature', '--diff-filter=A', '--format=%ct', point, '--', d.path]).split('\n').filter((line) => line !== '');
      time = created.length > 0 ? Number(created[created.length - 1]) : pointTime;
    }
    return round2((pointTime - time) / DAY_SECONDS);
  }).sort((a, b) => a - b);
  return entry('Q14', {
    value: { count: open.length, median_age_days: ages.length === 0 ? null : round2(median(ages)) },
    raw: { in_discussion: open.length, oldest_age_days: ages.length === 0 ? null : ages[ages.length - 1] },
    items: open.length,
  });
}

/** Whether `sha` changes a line under `dirs` that is neither blank nor a comment. */
function changesExecutable(root, sha, dirs) {
  if (dirs.length === 0) return false;
  // `diff-tree`, not `show`: it prints the patch alone, never a commit or its signature (task-268's readers rule).
  const diff = git(root, ['diff-tree', '--no-commit-id', '-p', '--unified=0', '--no-renames', '--root', sha, '--', ...dirs]);
  return diff.split('\n').some((line) => {
    if (!/^[+-]/.test(line) || /^(\+\+\+|---) /.test(line)) return false;
    const content = line.slice(1).trim();
    return content !== '' && !/^(\/\/|\/\*|\*)/.test(content);
  });
}

/** Q15 — the share of the bugs added in the window that are document divergences (dl-116; the B4 handover). */
function q15(root, point, flow, docs, sources, smallSample) {
  const added = flow.filter((b) => b.was === null);
  if (added.length === 0) return notMeasurable('Q15', 'no bug was added in the window');
  const tasks = docs.filter((d) => d.type === 'task');
  const commits = git(root, ['log', '--no-show-signature', '--no-merges', '--format=%x01%H%x00%s%x00%b', point]).split('\u0001').slice(1).map((record) => {
    const [sha, subject, body] = record.split('\0');
    return { sha: requireCommitName(sha, 'git log --no-merges'), subject, message: `${subject}\n${body}` };
  }).filter((c) => !WF_RE.test(c.subject));
  const divergences = [];
  let classified = 0;
  for (const b of added) {
    const short = shortId(b.id);
    const fixers = tasks.filter((t) => asList(t.fm.bug).some((v) => shortId(v) === short)).map((t) => shortId(t.id));
    const own = commits.filter((c) => cites(c.message, short) && fixers.some((t) => cites(c.message, t)));
    if (own.length === 0) continue; // no fix task, or none of its commits cites the bug: unclassified
    classified += 1;
    if (!own.some((c) => changesExecutable(root, c.sha, sources))) divergences.push(b.id);
  }
  if (classified === 0) return notMeasurable('Q15', `none of the ${added.length} bugs added in the window has a fix task with a commit citing it`);
  return entry('Q15', {
    value: pct(divergences.length, classified),
    raw: { divergences: divergences.length, classified, unclassified: added.length - classified, added: added.length },
    items: added.length,
    small_sample: added.length < smallSample,
    failing: divergences.sort(),
  });
}

/**
 * A task's class for Q18/Q19 (`dl-133` §1): before v0.3 the heuristic — fix when an id segment is `fix` or `bug:`
 * names a bug; from v0.3 the declared field (`memory.yaml` `task.stop_the_line.field`): `counts` → fix, another
 * declared value → feature (a feature that absorbed a bug stays one), else `null` (unclassified).
 */
function classifyTask(fm, rule) {
  if (compareVersions(String(rule.version), KIND_DECLARED_FROM) < 0) {
    return asList(fm.bug).length > 0 || String(fm.id ?? '').split('-').includes('fix') ? 'fix' : 'feature';
  }
  const value = fm[rule.field];
  if (typeof value !== 'string' || value === '') return null;
  if (value === rule.counts) return 'fix';
  return rule.values === undefined || rule.values.includes(value) ? 'feature' : null;
}

/** The classification rule of `memory.yaml` at the point: `task.stop_the_line`'s `field` and `counts` (bug-331). */
function taskClassRule(memoryYaml, version) {
  const taskType = memoryYaml && memoryYaml.types && memoryYaml.types.task ? memoryYaml.types.task : {};
  const stl = taskType.stop_the_line ?? {};
  const field = typeof stl.field === 'string' ? stl.field : 'kind';
  const counts = typeof stl.counts === 'string' ? stl.counts : 'fix';
  const declared = taskType.template && taskType.template.frontmatter && taskType.template.frontmatter.values ? taskType.template.frontmatter.values[field] : undefined;
  return { version, field, counts, values: Array.isArray(declared) ? declared.map(String) : undefined };
}

function classCounts(tasks, rule) {
  const classes = tasks.map((t) => classifyTask({ ...t.fm, id: t.id }, rule));
  return { fix: classes.filter((c) => c === 'fix').length, feature: classes.filter((c) => c === 'feature').length, unclassified: classes.filter((c) => c === null).length };
}

/** Q18 and Q19 — the release's fix share, and the tasks added after its commit-backlog commit. */
function q18q19(root, point, release, docs, memoryYaml, smallSample) {
  const rule = taskClassRule(memoryYaml, release.version);
  const by = compareVersions(release.version, KIND_DECLARED_FROM) < 0 ? 'heuristic (name or bug:)' : rule.field;
  const tasks = docs.filter((d) => d.type === 'task' && asList(d.fm.release)[0] === release.version).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const all = classCounts(tasks, rule);
  const classified = all.fix + all.feature;
  const q18 = classified === 0
    ? notMeasurable('Q18', `no task of ${release.version} can be classified (${tasks.length} with release: ${release.version})`)
    : entry('Q18', {
      value: pct(all.fix, classified),
      raw: { ...all, tasks: tasks.length, deprecated: tasks.filter((t) => t.fm.status === 'deprecated').length, classified_by: by, counts: rule.counts },
      items: classified,
      small_sample: classified < smallSample,
    });
  let backlog = null;
  for (const line of git(root, ['log', '--no-show-signature', '--format=%H%x00%s', point]).split('\n')) {
    const [sha, subject] = line.split('\0');
    if (subject && subject.startsWith('wf(release):') && /→ in-development\]\s*$/.test(subject) && subjectIds(subject).includes(release.id)) backlog = requireCommitName(sha, 'git log');
  }
  if (backlog === null) return [q18, notMeasurable('Q19', `no commit-backlog commit: no wf(release) transition of ${release.id} into in-development is reachable from the point`)];
  const before = markdownByName(root, backlog);
  const after = tasks.filter((t) => !before.has(posix.basename(t.path, '.md')));
  const late = classCounts(after, rule);
  const lateClassified = late.fix + late.feature;
  return [q18, entry('Q19', {
    value: { added_after: after.length, ...late, fix_share: lateClassified === 0 ? null : pct(late.fix, lateClassified) },
    raw: { added_after: after.length, ...late, classified_by: by, commit_backlog: backlog },
    items: after.length,
    small_sample: after.length < smallSample,
  })];
}

/** Q16 — words per Memory document (median per type), and the comment-line ratio of the sources. */
function q16(docs, sourceComments) {
  const types = unique(docs.map((d) => d.type)).sort();
  const words = (d) => bodyOf(d.text).split(/\s+/).filter((w) => w !== '').length;
  const medians = Object.fromEntries(types.map((type) => [type, round2(median(docs.filter((d) => d.type === type).map(words).sort((a, b) => a - b)))]));
  return entry('Q16', {
    value: { words_median: medians, comment_line_ratio: sourceComments.nonBlank === 0 ? null : pct(sourceComments.comment, sourceComments.nonBlank) },
    raw: {
      comment_lines: sourceComments.comment,
      non_blank_lines: sourceComments.nonBlank,
      ...Object.fromEntries(types.map((type) => [`${type} documents`, docs.filter((d) => d.type === type).length])),
    },
  });
}

/**
 * The static and Memory half (task-233): Q05–Q07, Q09, Q10, Q13–Q16, Q18–Q20, read from git at the point (and the
 * previous point for the window), and what Q08 needs from the sources; Q08 itself is built once the toolchain half
 * has run, since its install size needs `npm ci` ({@link q08}).
 */
function measureStatic(ctx, release) {
  const { root, point, base, dna, memoryYaml, smallSample } = ctx;
  const sourceDirs = pathsOf(dna, 'sources');
  const sources = codeFiles(root, point, sourceDirs);
  const tests = codeFiles(root, point, pathsOf(dna, 'tests'));
  const docs = memoryYaml ? memoryDocsAt(root, point, memoryYaml) : [];
  const out = [q05(sources), q06(sources, tests)];

  const ts = devModule('typescript');
  const noTs = 'the measuring checkout has no typescript (devDependency): run npm ci';
  const parsedSources = ts === null ? [] : sources.map(([path, text]) => {
    const sf = parse(ts, path, text);
    return { path, text, sf, imports: importsOf(ts, sf), comments: commentRanges(ts, sf, text) };
  });
  out.push(ts === null ? notMeasurable('Q07', noTs) : q07(parsedSources, docs));
  const pkg = (() => {
    try {
      return JSON.parse(readBlob(root, point, 'package.json') ?? 'null');
    } catch {
      return null;
    }
  })();
  const declared = pkg ? unique([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]).sort() : null;
  const used = new Set(parsedSources.flatMap((p) => p.imports.filter((i) => !i.typeOnly && !i.spec.startsWith('.')).map((i) => packageOf(i.spec))));
  const q08Static = ts === null ? { reason: noTs } : declared === null ? { reason: 'no readable package.json at the measurement point' } : { declared, unused: declared.filter((d) => !used.has(d)) };

  if (ts === null) out.push(notMeasurable('Q09', noTs));
  else {
    const citing = [...parsedSources, ...tests.filter(([path]) => !FIXTURE_DIR_RE.test(path)).map(([path, text]) => {
      const sf = parse(ts, path, text);
      return { path, text, sf, comments: commentRanges(ts, sf, text) };
    })].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    out.push(q09(ts, citing, docs));
  }
  const testTexts = unique(pathsOf(dna, 'tests').flatMap((dir) => listFiles(root, point, dir))).filter((p) => !FIXTURE_DIR_RE.test(p)).sort();
  out.push(q10(root, point, release, docs, [...readBlobs(root, point, testTexts)].filter(([, t]) => t !== null), smallSample));

  const types = typeRoots(memoryYaml);
  if (types['bug'] === undefined) for (const id of ['Q13', 'Q15', 'Q20']) out.push(notMeasurable(id, 'memory.yaml at the point declares no bug type'));
  else {
    const flow = bugFlow(root, base, docs);
    out.push(q13(flow, smallSample), q15(root, point, flow, docs, sourceDirs, smallSample), q20(flow, smallSample));
  }
  out.push(types['decision-log'] === undefined ? notMeasurable('Q14', 'memory.yaml at the point declares no decision-log type') : q14(root, point, docs));
  out.push(ts === null ? notMeasurable('Q16', noTs) : q16(docs, commentLines(parsedSources)));
  if (types['task'] === undefined) out.push(notMeasurable('Q18', 'memory.yaml at the point declares no task type'), notMeasurable('Q19', 'memory.yaml at the point declares no task type'));
  else out.push(...q18q19(root, point, release, docs, memoryYaml, smallSample));
  return { entries: out, q08: q08Static };
}

/**
 * What Q08's install size reads once the toolchain half has installed (`npm ci`): `npm ls --omit=dev --all --json
 * --long` (the production packages, and the top level that `npm ls --omit=dev --depth=0` lists) and the packed
 * tarball's `unpackedSize`. Either failing leaves the install size unmeasured, with the reason.
 */
async function footprint(tree, run, env) {
  const npm = (step, args) => run({ step, command: 'npm', args, cwd: tree, env });
  const lsArgs = ['ls', '--omit=dev', '--all', '--json', '--long'];
  const ls = await npm('footprint-ls', lsArgs);
  const lsLabel = `npm ${lsArgs.join(' ')}`;
  if (didNotRun(lsLabel, ls) !== null || ls.status !== 0) return { reason: failure(lsLabel, ls) };
  let tree0;
  try {
    tree0 = JSON.parse(ls.stdout);
  } catch {
    tree0 = null;
  }
  if (tree0 === null || typeof tree0 !== 'object') return { reason: `${lsLabel} printed no readable JSON` };
  const top = Object.keys(tree0.dependencies ?? {}).length;
  const dirs = new Set();
  const walk = (node) => {
    for (const child of Object.values(node.dependencies ?? {})) {
      if (child && typeof child.path === 'string') dirs.add(child.path);
      if (child && typeof child === 'object') walk(child);
    }
  };
  walk(tree0);
  const bytesUnder = (dir) => {
    let sum = 0;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const e of entries) {
      if (e.isDirectory()) sum += e.name === 'node_modules' ? 0 : bytesUnder(join(dir, e.name)); // nested packages count apart
      else if (e.isFile()) sum += statSync(join(dir, e.name)).size;
    }
    return sum;
  };
  const dependenciesBytes = [...dirs].sort().reduce((sum, dir) => sum + bytesUnder(isAbsolute(dir) ? dir : join(tree, dir)), 0);
  const packArgs = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const pack = await npm('footprint-pack', packArgs);
  const packLabel = `npm ${packArgs.join(' ')}`;
  if (didNotRun(packLabel, pack) !== null || pack.status !== 0) return { reason: failure(packLabel, pack) };
  let unpacked;
  try {
    const parsed = JSON.parse(pack.stdout);
    unpacked = Array.isArray(parsed) && parsed[0] ? parsed[0].unpackedSize : undefined;
  } catch {
    unpacked = undefined;
  }
  if (!isCount(unpacked)) return { reason: `${packLabel} printed no unpackedSize` };
  return { top, packages: dirs.size, dependenciesBytes, ownBytes: unpacked };
}

/** Q08 — unused runtime dependencies (floor 0), install size, and the dependency count of `dl-010` Action 3. */
function q08(q08Static, installed, notInstalled) {
  if (q08Static.reason !== undefined) return notMeasurable('Q08', q08Static.reason);
  const size = installed !== null && installed.reason === undefined ? installed : null;
  return entry('Q08', {
    value: { unused_runtime_dependencies: q08Static.unused.length, install_size_bytes: size === null ? null : size.ownBytes + size.dependenciesBytes },
    raw: {
      runtime_dependencies: size === null ? q08Static.declared.length : size.top,
      runtime_dependencies_from: size === null ? 'package.json dependencies at the point' : 'npm ls --omit=dev --depth=0',
      unused: q08Static.unused.length,
      ...(size === null
        ? { install_size: `not measured: ${installed === null ? notInstalled : installed.reason}` }
        : { transitive_runtime_packages: size.packages, own_unpacked_bytes: size.ownBytes, dependencies_bytes: size.dependenciesBytes }),
    },
    failing: q08Static.unused,
  });
}

// --- the release, the point, the previous run --------------------------------------------------------

function findRelease(root, version) {
  const memoryYaml = loadYamlAt(root, 'HEAD', '.wingfoil/memory.yaml');
  const dir = typeRoots(memoryYaml)['release'];
  if (dir === undefined) throw new UsageError('.wingfoil/memory.yaml at HEAD declares no release type');
  const releases = listFiles(root, 'HEAD', dir).filter((f) => f.endsWith('.md')).map((f) => frontmatter(readBlob(root, 'HEAD', f))).filter((fm) => fm && fm.type === 'release');
  const release = releases.find((fm) => fm.version === version);
  if (!release) throw new UsageError(`--release ${version}: no release element at HEAD has version ${version}`);
  const prefix = /^(major|minor|patch)-/.exec(String(release.id));
  const kind = ['major', 'minor', 'patch'].includes(release.kind) ? release.kind : prefix ? prefix[1] : version.split('.').length === 3 ? 'patch' : 'minor';
  return { id: String(release.id), version, kind, others: releases.filter((fm) => fm !== release).map((fm) => String(fm.version)) };
}

function measurementPoint(root, release, at) {
  if (at !== undefined) {
    const commit = resolveCommit(root, at, '--at');
    const tagged = gitOr(root, ['rev-parse', '--verify', '--quiet', `refs/tags/${at}`]) !== null;
    return { ref: at, commit, basis: tagged ? 'published-tag' : 'released-transition' };
  }
  const own = (tag) => (release.kind === 'patch' ? tag === release.version : tag === release.version || new RegExp(`^${release.version.replace(/\./g, '\\.')}\\.\\d+$`).test(tag));
  const tags = git(root, ['tag', '--list']).split('\n').filter((t) => VERSION_RE.test(t) && own(t) && !release.others.includes(t)).sort(compareVersions);
  if (tags.length > 0) {
    const tag = tags[tags.length - 1];
    return { ref: tag, commit: resolveCommit(root, tag, 'tag'), basis: 'published-tag' };
  }
  for (const line of git(root, ['log', '--no-show-signature', '--format=%H%x00%s', 'HEAD']).split('\n')) {
    const [sha, subject] = line.split('\0');
    if (subject && subject.startsWith('wf(release):') && subject.endsWith('→ released]') && subject.split(/[\s,[\]]+/).includes(release.id)) {
      const commit = requireCommitName(sha, 'git log');
      return { ref: commit, commit, basis: 'released-transition' };
    }
  }
  throw new UsageError(`--release ${release.version}: no published tag and no released transition of ${release.id} on HEAD`);
}

/** The measurement point of the release `version` at `root` (`dl-089` §1), `at` overriding it. */
function resolveMeasurementPoint(root, version, at) {
  if (!VERSION_RE.test(String(version))) throw new UsageError(`--release ${version} is not a release version (vX.Y or vX.Y.Z)`);
  return measurementPoint(root, findRelease(root, version), at);
}

function previousRun(root, healthDir, release, previous) {
  if (previous !== undefined) return { release: `--previous ${previous}`, commit: resolveCommit(root, previous, '--previous'), report: '(none: named by --previous)' };
  const dir = join(root, healthDir);
  if (!existsSync(dir)) return null;
  const runs = readdirSync(dir)
    .map((name) => /^release-health-(v[0-9.]+)\.json$/.exec(name))
    .filter((m) => m !== null && VERSION_RE.test(m[1]) && compareVersions(m[1], release.version) < 0)
    .sort((a, b) => compareVersions(a[1], b[1]));
  if (runs.length === 0) return null;
  const [name, version] = runs[runs.length - 1];
  const report = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
  return { release: version, commit: resolveCommit(root, report.measurement_point.commit, 'previous report'), report: `${healthDir}${name}` };
}

function toolchain(root, point) {
  const lock = readBlobBytes(root, point, 'package-lock.json');
  if (lock === null) throw new UsageError(`no package-lock.json at the measurement point ${point}`);
  // The npm the tools run: the one beside this Node first on PATH (review F3).
  const npm = spawnSync('npm', ['--version'], { encoding: 'utf-8', env: toolEnv() });
  return {
    node: process.version,
    npm: npm.status === 0 ? String(npm.stdout).trim() : 'unknown',
    lockfile_sha256: createHash('sha256').update(lock).digest('hex'),
  };
}

// --- the report --------------------------------------------------------------------------------------

/**
 * Measure the release `options.release` of the repository at `root` and return the report (not written).
 *
 * @param {string} root
 * @param {{ release: string, at?: string, previous?: string, offline?: boolean, external?: Function, catalogue?: string,
 *   toolchain?: boolean, tools?: Function, anyNode?: boolean, maxWorkers?: number, log?: (line: string) => void,
 *   interrupts?: { target?: NodeJS.EventEmitter, die?: (signal: string) => unknown, signals?: readonly string[] } }} options
 */
async function measureRelease(root, options) {
  if (!VERSION_RE.test(String(options.release))) throw new UsageError(`--release ${options.release} is not a release version (vX.Y or vX.Y.Z)`);
  const dist = loadDist();
  const cataloguePath = options.catalogue ?? join(root, catalogueLocation(root));
  const catalogue = yaml.load(readFileSync(cataloguePath, 'utf-8'));
  const issues = validateCatalogue(catalogue);
  if (issues.length > 0) throw new UsageError(`the catalogue ${cataloguePath} breaks its rules: ${issues.join('; ')}`);
  const healthDir = catalogueLocation(root).replace(/[^/]+$/, '');

  const release = findRelease(root, options.release);
  const point = measurementPoint(root, release, options.at);
  const previous = previousRun(root, healthDir, release, options.previous);
  const base = previous === null ? null : previous.commit;
  const smallSample = Number(catalogue.defaults && catalogue.defaults.small_sample) || 30;

  const measured = new Map();
  let staticHalf = null;
  let installed = null;
  await withGuardedWorktree(root, point.commit, async (tree, dir, guard) => {
    const ctx = {
      root,
      tree,
      point: point.commit,
      base,
      dist,
      smallSample,
      commits: readWindow(root, point.commit, base),
      dna: loadYamlAt(root, point.commit, '.wingfoil/dna.yaml'),
      memoryYaml: loadYamlAt(root, point.commit, '.wingfoil/memory.yaml'),
    };
    for (const m of measureHistory(ctx)) measured.set(m.id, m);
    const first = conformanceIn(root, tree, point.commit, base, dist);
    const second = conformanceIn(root, tree, point.commit, base, dist);
    for (const m of first) measured.set(m.id, m);
    const identical = JSON.stringify(first) === JSON.stringify(second);
    measured.set('P07', entry('P07', { value: identical, raw: { runs: 2, identical }, failing: identical ? [] : ['P01–P06 differ between two computations on the same range'] }));
    // The static half reads git at the point, before the toolchain half writes node_modules and dist/ into the tree.
    staticHalf = measureStatic(ctx, release);
    for (const m of staticHalf.entries) measured.set(m.id, m);
    if (options.toolchain !== false) {
      const scratch = join(dir, 'out');
      mkdirSync(scratch);
      const afterToolchain = async (run, env) => {
        installed = await footprint(tree, run, env);
      };
      for (const m of await measureToolchain(tree, scratch, { ...options, afterToolchain }, guard)) measured.set(m.id, m);
    }
  }, options.interrupts);
  if (options.toolchain === false) for (const id of TOOLCHAIN_IDS) measured.set(id, notMeasurable(id, 'the toolchain half was not run (--no-toolchain)'));
  const notInstalled = options.toolchain === false ? 'the toolchain half was not run (--no-toolchain)' : `the toolchain half did not install: ${measured.get('Q01').reason ?? 'npm ci did not complete'}`;
  measured.set('Q08', q08(staticHalf.q08, installed, notInstalled));
  for (const m of measureExternal(root, point.commit, options)) measured.set(m.id, m);
  if (release.kind === 'patch') {
    measured.set('D01', entry('D01', { status: 'not-comparable', reason: 'a patch release: D01 is measured on major and minor releases only (dl-089 §2)' }));
    measured.set('P06', entry('P06', { status: 'not-comparable', reason: 'a patch release: P06 is measured with D01, on major and minor releases only' }));
  } else {
    measured.set('D01', notMeasurable('D01', BENCHMARK_REASON));
  }

  const metrics = catalogue.metrics.map((metric) => {
    if (metric.status === 'retired') return notMeasurable(metric.id, `retired in ${metric.retired_in}`);
    return measured.get(metric.id) ?? notMeasurable(metric.id, 'no measurer of this script covers it');
  });
  return {
    schema_version: SCHEMA_VERSION,
    catalogue_version: catalogue.version,
    release: { id: release.id, version: release.version, kind: release.kind },
    measurement_point: point,
    previous,
    toolchain: toolchain(root, point.commit),
    metrics,
  };
}

/** The report as written: two-space JSON and a final newline. */
function formatReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--offline') options.offline = true;
    else if (flag === '--no-toolchain') options.toolchain = false;
    else if (flag === '--any-node') options.anyNode = true;
    else if (flag === '--max-workers') {
      if (!/^[1-9][0-9]*$/.test(String(argv[i + 1]))) throw new UsageError(`--max-workers needs a positive integer, got ${argv[i + 1] === undefined ? 'nothing' : JSON.stringify(argv[i + 1])}`);
      options.maxWorkers = Number(argv[i + 1]);
      i += 1;
    } else if (['--release', '--at', '--previous', '--out', '--root'].includes(flag)) {
      if (argv[i + 1] === undefined) throw new UsageError(`${flag} needs a value`);
      options[flag.slice(2)] = argv[i + 1];
      i += 1;
    } else throw new UsageError(`unknown argument ${flag}`);
  }
  if (options.release === undefined) throw new UsageError('missing required argument: --release <vX.Y[.Z]>');
  return options;
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    const root = options.root ?? git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const report = await measureRelease(root, { ...options, log: (line) => process.stderr.write(`release-health measure: ${line}\n`) });
    const out = options.out ?? join(root, catalogueLocation(root).replace(/[^/]+$/, ''), `release-health-${options.release}.json`);
    const target = isAbsolute(out) ? out : join(process.cwd(), out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, formatReportJson(report));
    process.stdout.write(`${target}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`release-health measure: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

module.exports = { measureRelease, measureToolchain, classifyTask, withGuardedWorktree, parseLatencyReport, processConformance, resolveMeasurementPoint, formatReportJson, parseHttp, httpDay, main };

if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

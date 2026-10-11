#!/usr/bin/env node
/**
 * `release-health.measure` (`dl-089` §1, §6; `.wingfoil/workflows/custom/release-health.yaml`): measure a release
 * with the metric catalogue at `paths.health` (`docs/08_health/metrics.yaml`) and write the machine-readable report
 * `release-health-<version>.json` (`docs/08_health/release-health.schema.json`). Not shipped in the npm package
 * (`package.json` `files`).
 *
 * This file is the **history half** (task-231): the git-history metrics G01–G16, the process-conformance measures
 * P01–P07 (`REQ-STATE-10`, `dl-131` Decision 3), the external visibility snapshot E01–E05 (`dl-130` Q2 (a)) and the
 * toolchain record. The quality metrics are measured by task-232 (Q01–Q04, Q11, Q12, Q17) and task-233 (the other
 * Q metrics); until they land, the report carries each of them as `not-measurable`, naming its owner. D01 and P06
 * need the benchmark's two runs (`dl-089` §2, `dl-131`): `not-comparable` on a patch release, else
 * `not-measurable`.
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
 * identity, since nothing is committed. The only file written is the report. A run killed by a signal (SIGINT,
 * SIGTERM, SIGKILL) leaves its worktree registered; remove it by hand with
 * `git worktree remove --force /tmp/wf-release-health-<suffix>/tree` (the path `git worktree list` shows).
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
 *          [--out <file>] [--offline] [--root <dir>]
 * Exit: 0 the report is written (its path on stdout) · 2 the measure could not run (message on stderr).
 */
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, isAbsolute, join, posix } = require('node:path');
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

/** The quality metrics this script leaves to their owning tasks, until those tasks land. */
const QUALITY_OWNERS = Object.freeze({
  'task-232': ['Q01', 'Q02', 'Q03', 'Q04', 'Q11', 'Q12', 'Q17'],
  'task-233': ['Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q13', 'Q14', 'Q15', 'Q16', 'Q18', 'Q19', 'Q20'],
});

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
    git(root, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--quiet', '--detach', tree, commit]);
    return fn(tree);
  } finally {
    const removed = gitOr(root, ['worktree', 'remove', '--force', tree]) !== null;
    rmSync(dir, { recursive: true, force: true });
    // `prune` acts on every worktree of the repository: run it only when this one could not be removed.
    if (!removed) gitOr(root, ['worktree', 'prune']);
  }
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
  const npm = spawnSync('npm', ['--version'], { encoding: 'utf-8' });
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
 * @param {{ release: string, at?: string, previous?: string, offline?: boolean, external?: Function, catalogue?: string }} options
 */
function measureRelease(root, options) {
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
  withWorktree(root, point.commit, (tree) => {
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
  });
  for (const m of measureExternal(root, point.commit, options)) measured.set(m.id, m);
  if (release.kind === 'patch') {
    measured.set('D01', entry('D01', { status: 'not-comparable', reason: 'a patch release: D01 is measured on major and minor releases only (dl-089 §2)' }));
    measured.set('P06', entry('P06', { status: 'not-comparable', reason: 'a patch release: P06 is measured with D01, on major and minor releases only' }));
  } else {
    measured.set('D01', notMeasurable('D01', BENCHMARK_REASON));
  }
  for (const [owner, ids] of Object.entries(QUALITY_OWNERS)) {
    for (const id of ids) if (!measured.has(id)) measured.set(id, notMeasurable(id, `measured by the quality half of measure.cjs (${owner}), not written yet`));
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
    else if (['--release', '--at', '--previous', '--out', '--root'].includes(flag)) {
      if (argv[i + 1] === undefined) throw new UsageError(`${flag} needs a value`);
      options[flag.slice(2)] = argv[i + 1];
      i += 1;
    } else throw new UsageError(`unknown argument ${flag}`);
  }
  if (options.release === undefined) throw new UsageError('missing required argument: --release <vX.Y[.Z]>');
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    const root = options.root ?? git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const report = measureRelease(root, options);
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

module.exports = { measureRelease, processConformance, resolveMeasurementPoint, formatReportJson, parseHttp, httpDay, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

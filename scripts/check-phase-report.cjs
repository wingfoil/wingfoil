#!/usr/bin/env node
/**
 * The check of a delegated phase report against git and the heavy-gate trace, and of a phase plan's `parent:`
 * against the phases of its workflow (`task-344`, P4.12; C-19 of the v0.4 planning feedback; `bug-474` in part;
 * approver rulings D1–D7 (a)). Read-only: it reads committed state, the worktree's status, the report file and the
 * trace, and writes nothing. It runs in no CI gate and is named by no workflow binding (AC 3).
 *
 * Usage:
 *   node scripts/check-phase-report.cjs report --report <file> --base <rev> [--since <ISO-8601>] [--worktree <dir>] [--trace <file>]
 *   node scripts/check-phase-report.cjs plans [--rev <rev>] [--worktree <dir>]
 *
 * `--worktree` defaults to the repository of the current directory; `--trace` to the machine's heavy-gate trace
 * (`gateTracePath(gateDir(process.env))` of `scripts/heavy-gate.cjs`, `task-349`); `--since` to the committer date
 * of `--base`; `--rev` to `HEAD`. The compiled `dist/` of this checkout is read, so the script can check another
 * worktree than its own. Exit `0`: no mismatch, one summary line. Exit `1`: one stdout line `<kind>: <detail>` per
 * mismatch, in the order of the kinds below, then the summary line. Exit `2`: a usage error (an unknown subcommand
 * or option, a missing `--report` or `--base`, an unreadable or malformed report, a revision naming no commit, not
 * a git worktree, `dist/` not built), one stderr line `check-phase-report: <message>`.
 *
 * **The report format.** The first non-blank line is the header; the lines right after it, up to the first blank
 * line, are the claims; everything after that blank line is prose, never read.
 *
 * - `REPORT <task> <phase> head=<sha>` — `<task>` is `task-<n>` or the full id; `<phase>` one token
 *   `[a-z][a-z+-]*` (`design`, `red`, `green+refactor`, `review`), recorded, not checked; `<sha>` 7–40 lowercase hex.
 * - `commit <sha> [<subject>]` — every commit the phase made on its branch, merges included, in any order; the
 *   text after the sha is ignored.
 * - `file <path>` — every path the phase's commits changed, repository-relative as
 *   `git -c core.quotePath=false` prints it.
 * - `uncommitted <path>` — every path the phase leaves changed or untracked in the worktree on purpose (a pending
 *   amendment).
 * - `gate <test|coverage|build|typecheck> exit=<integer>` — one line per heavy gate run (`npm test` with no suite
 *   filter is `test`, `test:coverage` and `test:report` are `coverage`), with its exit status. A targeted jest run
 *   is not a gate. `npm run typecheck` leaves two `typecheck` holds; one claim matches one hold.
 *
 * Any other keyword, a header that does not match, or a `gate` line without `exit=<integer>` is a format error
 * naming its line. Duplicate `commit`, `file` and `uncommitted` lines count once; two `gate` lines claim two runs.
 * An example:
 *
 * BEGIN EXAMPLE REPORT
 * REPORT task-344 green+refactor head=6a7234222
 * commit 6a7234222 feat(scripts): task-344 — the phase-report check
 * file scripts/check-phase-report.cjs
 * uncommitted docs/05_plans/rl-v1/rel-v0.4/dev-loop-rel-v0.4-plan.md
 * gate test exit=0
 * END EXAMPLE REPORT
 *
 * **The checks of `report`**, in the order they are run and printed (`MISMATCH_KINDS`); the range is
 * `git rev-list --first-parent <base>..HEAD` of the worktree:
 *
 * - `task` — the worktree's branch is neither `task/<task>` nor starts with `task/<task>-`.
 * - `head` — `git rev-parse HEAD` does not start with the claimed sha.
 * - `commit-unknown` — a listed sha names no commit.
 * - `commit-outside` — a listed commit is not in the range.
 * - `commit-unlisted` — a commit of the range is not listed, unless it is an approver record (below).
 * - `trailer-missing` — a listed commit, not an approver record, whose final paragraph lacks `Co-Authored-By:`
 *   or a non-blank `AI-Model:` (`git-conventions` §7).
 * - `trailer-identity` — a `Co-Authored-By:` of a listed commit names no `team.agents` entry `<name> <<email>>` of
 *   the `dna.yaml` committed at `HEAD` (§7 "Which name").
 * - `trailer-forbidden` — an approver record of the range (listed or not), or a listed `wf(<type>): approve` or
 *   `reject` commit, carrying `Co-Authored-By:` or `AI-Model:` (§7 "Which commits": the approver's acts carry no AI
 *   trailers).
 * - `trailer-paragraph` — a listed commit with a `WingFoil-*`, `Co-Authored-By:` or `AI-Model:` line outside its
 *   final paragraph (§8, `bug-391`; the `WingFoil-*` rule is `check-governance.cjs`'s own function).
 * - `file-unclaimed` — a path the phase's commits changed that no `file` line names. The phase's commits are the
 *   range's, less the unlisted approver records (approver ruling on R1); a non-merge contributes `git diff-tree -r` paths, a merge
 *   its `--cc` paths (what the merge itself resolved).
 * - `file-unchanged` — a `file` line naming a path those commits did not change.
 * - `uncommitted-unclaimed` — a path of `git status --porcelain -uall` (a rename: its new path) no `uncommitted`
 *   line names.
 * - `uncommitted-missing` — an `uncommitted` line naming a path the status does not list.
 * - `gate-missing` — a `gate` claim with no hold of that gate in the worktree started at or after `--since`.
 * - `gate-status` — such holds exist, but none unused released with the claimed status (the detail names the
 *   statuses found).
 * - `gate-open` — the only candidate is an `acquire` with no `release` (a gate still running, or killed and not
 *   yet taken over).
 * - `plan-parent` — a changed path that is, at `HEAD`, a `plan` document whose non-empty `parent` names no
 *   workflow, or no phase of its workflow (the rule of `plans`, applied to the changed plans only, D6).
 *
 * **An approver record** is the approver's act, the one kind of commit a phase report need not list: its subject is
 * `wf(<type>): approve|reject|amend …` or a record `workflow: finalize|rekey …`, AND its first body line is
 * `Approver: <name> <<email>> (approver)` as `parseApprovalMetadata` of `dist/memory` reads it (the grammar
 * `check-governance.cjs` holds approvals to; `/^Approver:\s*(.+?)\s*<([^>]+)>\s*\(([^)]+)\)\s*$/`, role `approver`).
 * An `Approver:` line on any other commit, or of any other shape, exempts nothing. Whether its author holds the
 * `approver` role is the governance check's (`authority`), not this script's.
 *
 * Within a kind the lines follow the report's order, then the path order. A hold is the `acquire`/`release` pair
 * of the trace with equal `pid`, `worktree` and `start`; claims are matched in the report's order, each to the
 * earliest unused matching hold; worktrees are compared after `realpathSync`. A trace line that is not a JSON
 * object with `v: 1` is skipped (several writers append); an absent trace makes every claim `gate-missing`.
 *
 * **`plans`** checks every `plan` document at `--rev` whose `parent` is non-empty (`spec-017` §3.1:
 * `<workflow>.<phase>`, empty for an instance) against the workflow registry committed at that rev, sorted by path.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const { join } = require('node:path');

const { trailerKeysOutsideFinalParagraph } = require('./check-governance.cjs');
const { gateDir, gateTracePath } = require('./heavy-gate.cjs');

const DIST = join(__dirname, '..', 'dist');

/** The mismatch kinds, in the order they are checked and printed. */
const MISMATCH_KINDS = Object.freeze([
  'task',
  'head',
  'commit-unknown',
  'commit-outside',
  'commit-unlisted',
  'trailer-missing',
  'trailer-identity',
  'trailer-forbidden',
  'trailer-paragraph',
  'file-unclaimed',
  'file-unchanged',
  'uncommitted-unclaimed',
  'uncommitted-missing',
  'gate-missing',
  'gate-status',
  'gate-open',
  'plan-parent',
]);

const GATES = new Set(['test', 'coverage', 'build', 'typecheck']);
const HEADER_RE = /^REPORT (task-\d+(?:-\S+)?) ([a-z][a-z+-]*) head=([0-9a-f]{7,40})$/;
const CLAIM_RE = /^(commit|file|uncommitted|gate) (.+)$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const GATE_RE = /^(\S+) exit=(\d+)$/;
const FULL_COMMIT_NAME_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const APPROVER_ROLE = 'approver';
const APPROVER_SUBJECT_RE = /^(?:wf\([^)]*\):\s*(?:approve|reject|amend)|workflow: (?:finalize|rekey))(?:\s|$)/;
const CO_AUTHOR_RE = /^co-authored-by:\s*(.*)$/i;
const AI_MODEL_RE = /^ai-model:\s*(.*)$/i;
const AI_TRAILER_RE = /^(co-authored-by|ai-model):/i;
const DECISION_SUBJECT_RE = /^wf\([^)]*\):\s*(approve|reject)(\s|$)/;
const PLAN_TYPE = 'plan';

/** A report whose header or claims block does not read; `line` is the 1-based line at fault. */
class ReportFormatError extends Error {
  constructor(line, message) {
    super(`line ${line}: ${message}`);
    this.name = 'ReportFormatError';
    this.line = line;
  }
}

/** A failure to run (exit 2). */
class UsageError extends Error {}

function git(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
}

/** `rev` as a full commit sha, or `null` when it names no commit. */
function commitOf(root, rev) {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).trim() || null;
  } catch {
    return null;
  }
}

function loadDist() {
  if (!existsSync(join(DIST, 'core', 'index.js')) || !existsSync(join(DIST, 'memory', 'index.js'))) {
    throw new UsageError(`${DIST} is not built: run \`npm run build\` first`);
  }
  return { core: require(join(DIST, 'core')), memory: require(join(DIST, 'memory')) };
}

function realpathOr(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Code-unit order, so the output does not depend on the locale. */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Read a report's header and claims block; throws `ReportFormatError`. */
function parseReport(text) {
  const lines = text.split('\n').map((line) => line.replace(/\s+$/, ''));
  let index = lines.findIndex((line) => line.trim() !== '');
  if (index < 0) throw new ReportFormatError(1, 'the report has no header `REPORT <task> <phase> head=<sha>`');
  const header = HEADER_RE.exec(lines[index].trim());
  if (header === null) throw new ReportFormatError(index + 1, `the header does not read as \`REPORT <task> <phase> head=<sha>\`: ${JSON.stringify(lines[index])}`);
  const commits = [];
  const files = [];
  const uncommitted = [];
  const gates = [];
  const addOnce = (list, value) => {
    if (!list.includes(value)) list.push(value);
  };
  for (index += 1; index < lines.length && lines[index].trim() !== ''; index += 1) {
    const line = lines[index].trim();
    const claim = CLAIM_RE.exec(line);
    if (claim === null) throw new ReportFormatError(index + 1, `unknown claim ${JSON.stringify(line)} (commit, file, uncommitted or gate)`);
    const [, keyword, rest] = claim;
    if (keyword === 'commit') {
      const sha = rest.split(/\s/, 1)[0];
      if (!SHA_RE.test(sha)) throw new ReportFormatError(index + 1, `a commit line names no sha: ${JSON.stringify(line)}`);
      addOnce(commits, sha);
    } else if (keyword === 'file') addOnce(files, rest);
    else if (keyword === 'uncommitted') addOnce(uncommitted, rest);
    else {
      const gate = GATE_RE.exec(rest);
      if (gate === null || !GATES.has(gate[1])) {
        throw new ReportFormatError(index + 1, `a gate line must read \`gate <test|coverage|build|typecheck> exit=<integer>\`: ${JSON.stringify(line)}`);
      }
      gates.push({ gate: gate[1], exit: Number(gate[2]) });
    }
  }
  return { task: header[1], phase: header[2], head: header[3], commits, files, uncommitted, gates };
}

/** The first-parent commits of `base..HEAD`, oldest first: sha, parents, subject, body. */
function readRangeCommits(root, base) {
  const raw = git(root, ['log', '--no-show-signature', '--first-parent', '--reverse', '--format=%H%x00%P%x00%s%x00%b%x00', `${base}..HEAD`]);
  const fields = raw.split('\0');
  const commits = [];
  for (let index = 0; index + 4 <= fields.length; index += 4) {
    const [sha, parents, subject, body] = fields.slice(index, index + 4);
    const name = sha.trim();
    if (!FULL_COMMIT_NAME_RE.test(name)) throw new Error(`git log printed ${JSON.stringify(name)} where a commit name was expected`);
    commits.push({ sha: name, merge: parents.trim().split(' ').length > 1, subject, body: body.replace(/\s+$/, '') });
  }
  return commits;
}

/** The paths a commit changed: a non-merge's tree diff, a merge's combined (`--cc`) one. */
function changedPaths(root, commit) {
  const args = commit.merge
    ? ['diff-tree', '--no-commit-id', '--cc', '--name-only', '-z', commit.sha]
    : ['diff-tree', '--no-commit-id', '--root', '-r', '--name-only', '-z', commit.sha];
  return git(root, args)
    .split('\0')
    .filter((path) => path !== '');
}

/** The paths `git status --porcelain -uall` lists (a rename or copy: its new path). */
function statusPaths(root) {
  const fields = git(root, ['status', '--porcelain=v1', '-z', '-uall']).split('\0');
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    if (entry[0] === 'R' || entry[0] === 'C') index += 1;
  }
  return [...new Set(paths)].sort(byCodeUnit);
}

/** The body's final (last blank-line-separated) paragraph, and the lines before it. */
function paragraphs(body) {
  const lines = body.split('\n');
  let lastBlank = -1;
  lines.forEach((line, index) => {
    if (line.trim() === '') lastBlank = index;
  });
  return { before: lines.slice(0, lastBlank + 1), final: lines.slice(lastBlank + 1) };
}

/** The holds of the trace at `tracePath` (`null` when it is absent), in trace order. */
function readHolds(tracePath) {
  if (!existsSync(tracePath)) return null;
  const holds = new Map();
  for (const line of readFileSync(tracePath, 'utf-8').split('\n')) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record === null || typeof record !== 'object' || record.v !== 1) continue;
    if (record.event !== 'acquire' && record.event !== 'release') continue;
    const key = JSON.stringify([record.pid, record.worktree, record.start]);
    const hold = holds.get(key) ?? { gate: record.gate, pid: record.pid, worktree: record.worktree, start: record.start, released: false, status: undefined };
    if (record.event === 'release') {
      hold.released = true;
      hold.status = record.status === undefined ? null : record.status;
    }
    holds.set(key, hold);
  }
  return [...holds.values()];
}

function shortSha(sha) {
  return sha.slice(0, 12);
}

/**
 * Check a parsed report against the worktree's git state and the heavy-gate trace; `[]` when clean.
 *
 * @param {{ worktree: string, report: object, base: string, since?: string, tracePath: string }} options
 */
function checkReport(options) {
  const { report, tracePath } = options;
  const root = git(options.worktree, ['rev-parse', '--show-toplevel']).trim();
  const base = commitOf(root, options.base);
  if (base === null) throw new UsageError(`--base ${options.base} names no commit of ${root}`);
  const since = options.since ?? git(root, ['log', '--no-show-signature', '-1', '--format=%cI', base]).trim();
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) throw new UsageError(`--since ${since} is not an ISO-8601 instant`);
  const mismatches = [];
  const add = (kind, detail) => mismatches.push({ kind, detail });

  // task, head
  const branch = git(root, ['branch', '--show-current']).trim();
  if (branch !== `task/${report.task}` && !branch.startsWith(`task/${report.task}-`)) {
    add('task', `the report names ${report.task}, the worktree's branch is ${branch === '' ? '(a detached HEAD)' : branch}`);
  }
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  if (!head.startsWith(report.head)) add('head', `the report claims head=${report.head}, HEAD is ${head}`);

  // commits
  const range = readRangeCommits(root, base);
  const inRange = new Map(range.map((commit) => [commit.sha, commit]));
  const listed = new Set();
  for (const claim of report.commits) {
    const sha = commitOf(root, claim);
    if (sha === null) add('commit-unknown', `${claim} names no commit`);
    else if (!inRange.has(sha)) add('commit-outside', `${claim} is not a commit of the first-parent range ${shortSha(base)}..HEAD`);
    else listed.add(sha);
  }
  const approverRecords = new Set(range.filter(isApproverRecord).map((commit) => commit.sha));
  const exempt = new Set();
  for (const commit of range) {
    if (listed.has(commit.sha)) continue;
    if (approverRecords.has(commit.sha)) exempt.add(commit.sha);
    else add('commit-unlisted', `${shortSha(commit.sha)} ${commit.subject} is not listed`);
  }

  // trailers: every check on the listed commits; on the unlisted approver records, trailer-forbidden only
  const agents = loadAgentIdentities(root);
  for (const commit of range.filter((candidate) => listed.has(candidate.sha) || exempt.has(candidate.sha))) {
    const lines = commit.body.split('\n');
    const at = `${shortSha(commit.sha)} ${commit.subject}`;
    const record = approverRecords.has(commit.sha);
    if ((record || DECISION_SUBJECT_RE.test(commit.subject)) && lines.some((line) => AI_TRAILER_RE.test(line))) {
      add('trailer-forbidden', `${at}: ${record ? 'an approver record' : 'an approve or reject'} carries Co-Authored-By: or AI-Model: (git-conventions §7)`);
    }
    if (!listed.has(commit.sha)) continue;
    const { before, final } = paragraphs(commit.body);
    const finalCoAuthor = final.some((line) => CO_AUTHOR_RE.test(line));
    const finalModel = final.some((line) => (AI_MODEL_RE.exec(line)?.[1] ?? '').trim() !== '');
    if (!record && !(finalCoAuthor && finalModel)) {
      const missing = [finalCoAuthor ? null : 'Co-Authored-By:', finalModel ? null : 'AI-Model:'].filter((key) => key !== null);
      add('trailer-missing', `${at}: its final paragraph has no ${missing.join(' and no ')} (git-conventions §7)`);
    }
    for (const line of lines) {
      const value = CO_AUTHOR_RE.exec(line)?.[1].trim();
      if (value !== undefined && !agents.includes(value)) {
        add('trailer-identity', `${at}: Co-Authored-By: ${value} names no team.agents entry (${agents.join(', ') || 'none declared'})`);
      }
    }
    const outside = [...trailerKeysOutsideFinalParagraph(commit.body)];
    for (const line of before) {
      const key = AI_TRAILER_RE.exec(line)?.[1];
      if (key !== undefined && !outside.some((seen) => seen.toLowerCase() === key.toLowerCase())) outside.push(key);
    }
    if (outside.length > 0) add('trailer-paragraph', `${at}: ${outside.map((key) => `${key}:`).join(', ')} outside the final paragraph (git-conventions §8)`);
  }

  // files
  const changedBy = new Map();
  for (const commit of range) {
    if (exempt.has(commit.sha)) continue;
    for (const path of changedPaths(root, commit)) if (!changedBy.has(path)) changedBy.set(path, commit.sha);
  }
  const changed = [...changedBy.keys()].sort(byCodeUnit);
  for (const path of changed) if (!report.files.includes(path)) add('file-unclaimed', `${path} (changed by ${shortSha(changedBy.get(path))}) is not claimed`);
  for (const path of report.files) if (!changedBy.has(path)) add('file-unchanged', `${path} is claimed, but no commit of the phase changed it`);

  // uncommitted
  const status = statusPaths(root);
  for (const path of status) if (!report.uncommitted.includes(path)) add('uncommitted-unclaimed', `${path} is changed or untracked in the worktree, but not claimed`);
  for (const path of report.uncommitted) if (!status.includes(path)) add('uncommitted-missing', `${path} is claimed uncommitted, but the worktree's status does not list it`);

  // gates
  checkGates(report.gates, { worktree: realpathOr(root), since, sinceMs, tracePath }, add);

  // plans the phase changed (D6)
  for (const mismatch of checkPlanParents({ worktree: root, rev: 'HEAD', paths: changed })) mismatches.push(mismatch);

  return mismatches
    .map((mismatch, index) => ({ mismatch, index }))
    .sort((a, b) => MISMATCH_KINDS.indexOf(a.mismatch.kind) - MISMATCH_KINDS.indexOf(b.mismatch.kind) || a.index - b.index)
    .map(({ mismatch }) => mismatch);
}

/**
 * Whether `commit` is an approver record: an approver-shaped subject and, as its first body line, an `Approver:` line
 * that `parseApprovalMetadata` reads with the role `approver`.
 */
function isApproverRecord(commit) {
  if (!APPROVER_SUBJECT_RE.test(commit.subject)) return false;
  const approval = loadDist().memory.parseApprovalMetadata(commit.body);
  return approval !== null && approval.approverRole === APPROVER_ROLE;
}

/** The `<name> <<email>>` identities of `team.agents` in the `dna.yaml` committed at `HEAD`. */
function loadAgentIdentities(root) {
  const { core } = loadDist();
  const dna = core.loadDnaYamlAtRev(root, 'HEAD');
  return (dna?.team?.agents ?? []).map((agent) => `${agent.name} <${agent.email}>`);
}

function checkGates(claims, window, add) {
  const holds = readHolds(window.tracePath);
  if (holds === null) {
    for (const claim of claims) add('gate-missing', `gate ${claim.gate} exit=${claim.exit}: the trace ${window.tracePath} does not exist`);
    return;
  }
  const candidates = holds
    .map((hold, order) => ({ hold, order, startMs: Date.parse(hold.start) }))
    .filter(({ hold, startMs }) => typeof hold.worktree === 'string' && realpathOr(hold.worktree) === window.worktree && !Number.isNaN(startMs) && startMs >= window.sinceMs)
    .sort((a, b) => a.startMs - b.startMs || a.order - b.order)
    .map(({ hold }) => hold);
  const used = new Set();
  for (const claim of claims) {
    const unused = candidates.filter((hold) => hold.gate === claim.gate && !used.has(hold));
    const match = unused.find((hold) => hold.released && hold.status === claim.exit);
    const at = `gate ${claim.gate} exit=${claim.exit}`;
    if (match !== undefined) used.add(match);
    else if (unused.some((hold) => hold.released)) {
      const statuses = [...new Set(unused.filter((hold) => hold.released).map((hold) => String(hold.status)))];
      add('gate-status', `${at}: the holds of ${claim.gate} in ${window.worktree} since ${window.since} ended with status ${statuses.join(', ')}`);
    } else if (unused.length > 0) {
      add('gate-open', `${at}: the only hold of ${claim.gate} in ${window.worktree} since ${window.since} is an acquire with no release (pid ${unused[0].pid}, started ${unused[0].start})`);
    } else {
      add('gate-missing', `${at}: no hold of ${claim.gate} in ${window.worktree} started at or after ${window.since} in ${window.tracePath}`);
    }
  }
}

/**
 * The `plan-parent` mismatches of the `plan` documents at `rev` (default `HEAD`) whose non-empty `parent` names no
 * workflow, or no phase of its workflow, of the registry at that rev; only the plans among `paths` when given.
 *
 * @param {{ worktree: string, rev?: string, paths?: readonly string[] }} options
 */
function checkPlanParents(options) {
  const { core, memory } = loadDist();
  const root = options.worktree;
  const rev = options.rev ?? 'HEAD';
  const only = options.paths === undefined ? null : new Set(options.paths);
  const memoryYaml = core.loadMemoryYamlAtRev(root, rev);
  if (memoryYaml === null) return [];
  const plans = memory
    .loadMemoryDocumentsAtRev(root, rev, memoryYaml)
    .filter((doc) => doc.frontmatter?.type === PLAN_TYPE && typeof doc.frontmatter.parent === 'string' && doc.frontmatter.parent.trim() !== '')
    .filter((doc) => only === null || only.has(doc.path))
    .sort((a, b) => byCodeUnit(a.path, b.path));
  if (plans.length === 0) return [];
  const phasesOf = new Map(core.loadWorkflowRegistryAtRev(root, rev).workflows.map((workflow) => [workflow.name, workflow.phases.map((phase) => phase.name)]));
  const mismatches = [];
  for (const doc of plans) {
    const parent = doc.frontmatter.parent;
    const dot = parent.indexOf('.');
    const workflow = dot < 0 ? parent : parent.slice(0, dot);
    const phase = dot < 0 ? null : parent.slice(dot + 1);
    const at = `${doc.frontmatter.id ?? doc.path} (${doc.path}): parent ${JSON.stringify(parent)}`;
    const phases = phasesOf.get(workflow);
    if (phases === undefined) mismatches.push({ kind: 'plan-parent', detail: `${at} names no workflow` });
    else if (phase === null || !phases.includes(phase)) mismatches.push({ kind: 'plan-parent', detail: `${at} names no phase of ${workflow} (${phases.join(', ')})` });
  }
  return mismatches;
}

/** Parse the options of a subcommand; throws `UsageError`. */
function parseOptions(args, valued) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!valued.includes(arg)) throw new UsageError(`unknown option ${arg}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  return options;
}

function worktreeOf(dir) {
  try {
    return git(dir, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    throw new UsageError(`${dir} is not a git worktree`);
  }
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 'es'}`;
}

function runReport(args, out) {
  const options = parseOptions(args, ['--report', '--base', '--since', '--worktree', '--trace']);
  if (options.report === undefined) throw new UsageError('report needs --report <file>');
  if (options.base === undefined) throw new UsageError('report needs --base <rev>');
  loadDist();
  const root = worktreeOf(options.worktree ?? process.cwd());
  if (commitOf(root, options.base) === null) throw new UsageError(`--base ${options.base} names no commit of ${root}`);
  let text;
  try {
    text = readFileSync(options.report, 'utf-8');
  } catch (error) {
    throw new UsageError(`cannot read the report ${options.report}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let report;
  try {
    report = parseReport(text);
  } catch (error) {
    if (error instanceof ReportFormatError) throw new UsageError(`${options.report}: ${error.message}`);
    throw error;
  }
  const tracePath = options.trace ?? gateTracePath(gateDir(process.env));
  const mismatches = checkReport({ worktree: root, report, base: options.base, since: options.since, tracePath });
  for (const mismatch of mismatches) out(`${mismatch.kind}: ${mismatch.detail}`);
  out(`report ${report.task} ${report.phase} head=${report.head}: ${mismatches.length === 0 ? 'no mismatch' : plural(mismatches.length, 'mismatch')}`);
  return mismatches.length === 0 ? 0 : 1;
}

function runPlans(args, out) {
  const options = parseOptions(args, ['--rev', '--worktree']);
  loadDist();
  const root = worktreeOf(options.worktree ?? process.cwd());
  const rev = options.rev ?? 'HEAD';
  if (commitOf(root, rev) === null) throw new UsageError(`--rev ${rev} names no commit of ${root}`);
  const mismatches = checkPlanParents({ worktree: root, rev });
  for (const mismatch of mismatches) out(`${mismatch.kind}: ${mismatch.detail}`);
  out(`plans at ${rev}: ${mismatches.length === 0 ? 'no mismatch' : plural(mismatches.length, 'mismatch')}`);
  return mismatches.length === 0 ? 0 : 1;
}

/** The command line; returns the exit code. */
function main(argv, io = {}) {
  const out = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const err = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  try {
    const [subcommand, ...args] = argv;
    if (subcommand === 'report') return runReport(args, out);
    if (subcommand === 'plans') return runPlans(args, out);
    throw new UsageError(subcommand === undefined ? 'a subcommand is needed: report or plans' : `unknown subcommand ${subcommand} (report or plans)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    err(`check-phase-report: ${message.split('\n')[0]}`);
    return 2;
  }
}

module.exports = { MISMATCH_KINDS, ReportFormatError, checkPlanParents, checkReport, main, parseReport };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

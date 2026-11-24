#!/usr/bin/env node
/**
 * The governance check over this repository's commits (`dl-103` §1, `task-167`), as the extension of `wingfoil
 * verify` (`spec-020` §6, `task-366`) — read-only, and not shipped in the npm package (`package.json` `files`;
 * `spec-015`). It is this repository's entry point: `npm run check:governance`, CI (`.github/workflows/governance.yml`)
 * and the pre-push hook (`.githooks/pre-push`).
 *
 * **What it runs** (`spec-020` §6.1). The shipped checks are the verb's: the script runs the code build's
 * `wingfoil verify` as a child process, `node --no-warnings dist/cli.js verify --format json --project <root>
 * [--base <sha>] [--introduced-at <sha>]`, each revision the full sha it resolved, and reads its report (§7). The
 * child's stderr carries one JSON document per line: a `W_VERIFY_WHOLE_HISTORY` warning and the `E_VERIFY_FINDINGS`
 * error are dropped (the script decides the gating and prints its own verdict), any other warning or error is printed
 * as `warning: <text>` / `error: <text>`, and a line that is no such document is a failure to run (exit 2). Exit 0
 * or 1 with a report whose `verdict` is `pass` or `fail` is a completed run; anything else, a report whose `checks`
 * lack a check the script gates, a check id with no marker in `CHECKS`, or a report of another `HEAD` is exit 2.
 * The generic checks — `subject`, `bracket`, `body`, `authority`, `state` and the later `verb-edge`,
 * `status-outside-wf`, `supersedes-pair`, `approval-agent-trailer`, `workflow-record-authority`, `trailer-paragraph`
 * — are defined in `src/core/governance-check.ts` alone; the script defines none of their predicates (AC-9).
 *
 * **The three extension checks** this repository adds (`spec-020` §4.12), with their predicates and messages:
 * - `config-version` (`bug-249`; rule `config`): with `--base`, each of the four versioned config files whose blob
 *   differs between the merge-base of `--base` and `HEAD`, and `HEAD`, declares a `version:` numerically greater
 *   (`isVersionIncrease`, `src/validation`, shared with `test/lint/helpers/version-bump.ts`). The finding sits on the
 *   range's last commit touching the file. Without `--base` nothing is judged.
 * - `plan-retrospective` (`bug-320`, `dl-115` Q2 (a), task-358 D2 (a) (i); rule `state`): a `wf(plan): finalize`
 *   whose bracket ends in the last state of the plan machine of the `memory.yaml` committed at that commit leaves
 *   each plan it names and touches with a `### Retrospective` entry — a line outside HTML comments, `None` included
 *   — as `scripts/check-retrospective.cjs` (`hasRetrospectiveEntry`, shared) tests a task's at `dev-loop.done`.
 * - `co-author-identity` (`bug-475`, `bug-535`, task-352; rule `body`): on every commit of the range, merges
 *   included, except a non-merge commit with a line starting `Approver:`, each `Co-Authored-By:` line (any case) of
 *   the body's final paragraph is `Name <email>` and names a `team.agents` or `team.members` entry of the
 *   `.wingfoil/dna.yaml` committed at the commit's first parent — the name exact, the email ignoring case; no
 *   `dna.yaml` there, or one that does not validate, is a finding (`git-conventions` §7). The same paragraph
 *   carries no two `Co-Authored-By:` lines naming the same co-author and at most one `AI-Model:` line.
 *
 * **Starting mode** (`dl-103` §1, `spec-020` §6.1 step 3). A finding on a commit that is not the introduction commit
 * nor one of its ancestors is gated, and fails the check (exit 1); a finding on history is reported and does not
 * fail it. The introduction commit is the commit of `HEAD`'s first-parent line that added this file — on `main`, the
 * merge that landed it — unless `--introduced-at` names one. Each check after the first five has its own
 * introduction: the oldest commit of `HEAD`'s first-parent line whose change to this file altered the count of the
 * check's marker (`CHECKS`, `git log -S`), so a check added later never fails on commits pushed before it existed; a
 * marker no commit brought in falls back to the script's introduction, and `--introduced-at` sets every check's
 * introduction at once. The script re-decides `gated` on every finding of the verb with these introductions; a
 * finding of the five base checks carries no `check` key in its report.
 *
 * **Which build, and the accepted weakness** (`spec-020` §6.3). The verb is the code build of the checkout,
 * `dist/cli.js` beside the `dist/` the script already requires (`npm run build` first). Under the code build a
 * branch that weakens a check passes its own run, because the check under review is the code under review: that
 * is the accepted weakness, which the three extension checks share whatever the build. Branch protection on
 * `main` and the review of a change to `src/core/governance-check.ts` or to this file stand against it.
 *
 * Deterministic (REQ-SYS-07): findings come out oldest commit first, then by rule (`config` last), then by message,
 * except that a commit's `trailer-paragraph` findings follow its other findings of the rule, in the order the verb
 * wrote them; no clock is read.
 *
 * Usage: node scripts/check-governance.cjs [--root <dir>] [--base <rev>] [--introduced-at <rev>] [--json]
 *   --root           the repository to check (default: the git top level of the working directory)
 *   --base           check `<rev>..HEAD` only (default: the whole history of HEAD)
 *   --introduced-at  the introduction commit (default: the first-parent commit that added this file)
 *   --json           print the report as JSON instead of lines
 * Exit: 0 no gated finding · 1 a gated finding · 2 the check could not run (bad usage, no repository or no commit,
 * `dist/` not built, a git failure, a verb that did not complete), with the message on stderr.
 */
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { basename, join } = require('node:path');

const { hasRetrospectiveEntry } = require('./check-retrospective.cjs');

/** This file's path inside the repository it governs: its introduction is the first-parent commit adding it. */
const SCRIPT_PATH = 'scripts/check-governance.cjs';
const MEMORY_YAML = '.wingfoil/memory.yaml';
const DNA_YAML = '.wingfoil/dna.yaml';
const DIST = join(__dirname, '..', 'dist');
/** The code build's command line, whose `verify` the script runs (`spec-020` §6.3, task-366 D2 (a)). */
const CLI = join(DIST, 'cli.js');

/** The rules, in the order findings are sorted within a commit. */
const RULES = ['subject', 'bracket', 'body', 'authority', 'state', 'config'];

/** The five base checks: each gated by the script's own introduction, and reported without a `check` key. */
const BASE_CHECKS = Object.freeze(['subject', 'bracket', 'body', 'authority', 'state']);

/**
 * The checks added after the script itself (task-208), each with the marker whose first appearance in
 * this file, on `HEAD`'s first-parent line, is the check's introduction commit. Each marker appears in
 * this file exactly once, here. The verb's later checks keep theirs (`spec-020` §6.1 step 3).
 */
const CHECKS = Object.freeze({
  'verb-edge': 'governance-check:verb-edge',
  'status-outside-wf': 'governance-check:status-outside-wf',
  'supersedes-pair': 'governance-check:supersedes-pair',
  'config-version': 'governance-check:config-version',
  'approval-agent-trailer': 'governance-check:approval-agent-trailer',
  'workflow-record-authority': 'governance-check:workflow-record-authority',
  'trailer-paragraph': 'governance-check:trailer-paragraph',
  'plan-retrospective': 'governance-check:plan-retrospective',
  'co-author-identity': 'governance-check:co-author-identity',
});

/** This repository's own checks (`spec-020` §4.12): the verb does not report them. */
const EXTENSION_CHECKS = Object.freeze(['config-version', 'plan-retrospective', 'co-author-identity']);
/** The checks the script gates on the verb's report: the five base checks and every later check of the verb. */
const VERB_CHECKS = Object.freeze([...BASE_CHECKS, ...Object.keys(CHECKS).filter((check) => !EXTENSION_CHECKS.includes(check))]);

/** The verb's stderr documents the script drops (`spec-020` §6.1 step 1). */
const DROPPED_WARNING_PREFIX = 'W_VERIFY_WHOLE_HISTORY:';
const DROPPED_ERROR_PREFIX = 'E_VERIFY_FINDINGS:';

/** A `Co-Authored-By:` line, any case: its value is what follows the key. */
const CO_AUTHOR_KEY_RE = /^co-authored-by:/i;
/** A `Co-Authored-By:` line's value as `Name <email>` (`git-conventions` §7). */
const CO_AUTHOR_VALUE_RE = /^co-authored-by:[ \t]*(.*?)[ \t]*<([^<>\s]+)>[ \t]*$/i;
/** An `AI-Model:` line, any case. */
const AI_MODEL_KEY_RE = /^ai-model:/i;
/** A line that makes a commit an approval commit (`spec-018` §0): `Approver:`, any letter case. */
const APPROVER_KEY_RE = /^approver:/i;

/** The four versioned config files whose `version:` the doc-versioning bump rule applies to (`bug-143`). */
const VERSIONED_CONFIG_FILES = ['.wingfoil/dna.yaml', '.wingfoil/memory.yaml', '.wingfoil/workflows.yaml', '.wingfoil/roles.yaml'];

/** The subject's `wf({scope}): {verb}` head. */
const WF_HEAD_RE = /^wf\(([^)]*)\):\s*(\S+)/;
/** The bracket closing a subject, in either arrow form (`→` or `->`), as the Memory audit reads it. */
const TRAILING_BRACKET_RE = /\[([^[\]]*)\]\s*$/;
const BRACKET_ARROW_RE = /\s*(?:→|->)\s*/;

/**
 * The compiled `src` modules the extension checks reuse, and the code build's command line, checked when a
 * check runs, so that a missing build is reported as a usage error (exit 2, "run `npm run build` first")
 * rather than as a stack trace.
 */
function loadDist() {
  if (!existsSync(join(DIST, 'memory', 'index.js')) || !existsSync(CLI)) {
    throw new UsageError(`${DIST} is not built: run \`npm run build\` first`);
  }
  return {
    memory: require(join(DIST, 'memory')),
    core: require(join(DIST, 'core')),
    validation: require(join(DIST, 'validation')),
    dnaSchema: require(join(DIST, 'dna', 'schema')),
  };
}

class UsageError extends Error {}

/**
 * @param {string} root
 * @param {string[]} args
 * @param {string} [input]
 * @returns {string}
 */
function git(root, args, input) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf-8',
    input,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    // Explicit, so the environment a caller (a test) set on `process.env` is the one git sees (bug-278).
    env: process.env,
  });
}

/** A full commit name: 40 hexadecimal digits (SHA-1), or 64 (SHA-256). */
const FULL_COMMIT_NAME_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * `name`, checked to be a full commit name where a `git log` reader expected one (task-268, `bug-291`,
 * the script's twin of `src/storage`'s `requireCommitName`). Every `git log` here passes
 * `--no-show-signature`, so a `log.showSignature` configuration cannot print signature text among the
 * formatted lines; whatever arrives there anyway is a failure to run (exit 2), never a commit.
 */
function requireCommitName(name, command) {
  if (!FULL_COMMIT_NAME_RE.test(name)) throw new Error(`${command} printed ${JSON.stringify(name)} where a commit name was expected`);
  return name;
}

/** `rev` as a full commit sha, or a usage error naming it. */
function resolveCommit(root, rev, flag) {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).trim();
  } catch {
    throw new UsageError(flag === null ? `${root} is not a git repository, or has no commit at HEAD` : `${flag} ${rev} is not a commit of ${root}`);
  }
}

/** The range's commits, oldest first: sha, first parent, author, subject, body. */
function readCommits(root, range) {
  const raw = git(root, ['log', '--no-show-signature', '--reverse', '--format=%H%x00%P%x00%an%x00%ae%x00%s%x00%b%x00', ...range]);
  const fields = raw.split('\0');
  const commits = [];
  for (let index = 0; index + 6 <= fields.length; index += 6) {
    const [sha, parents, authorName, authorEmail, subject, body] = fields.slice(index, index + 6);
    commits.push({
      sha: requireCommitName(sha.trim(), 'git log --reverse'),
      parent: parents.split(' ')[0] || null,
      merge: parents.trim().split(' ').length > 1,
      authorName,
      authorEmail,
      subject,
      body: body.replace(/\s+$/, ''),
    });
  }
  return commits;
}

/** The paths each commit of the range touches (renames as delete + add), by sha. */
function readTouchedPaths(root, range) {
  const raw = git(root, ['log', '--no-show-signature', '--no-renames', '--name-only', '--format=%x01%H', ...range]);
  const touched = new Map();
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('\u0001')) {
      current = [];
      touched.set(requireCommitName(line.slice(1), 'git log --name-only'), current);
    } else if (line !== '' && current !== null) {
      current.push(line);
    }
  }
  return touched;
}

/**
 * The blob id of `<rev>:<path>` for every request, in one `git cat-file --batch-check`, or `null` where
 * the path (or the revision) does not exist.
 */
function readBlobIds(root, requests) {
  if (requests.length === 0) return [];
  const raw = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], requests.join('\n') + '\n');
  return raw
    .split('\n')
    .slice(0, requests.length)
    .map((line) => {
      const [oid, type] = line.split(' ');
      return type === 'blob' ? oid : null;
    });
}

/**
 * The content of every `<rev>:<path>` request, in one `git cat-file --batch`, or `null` where the path
 * (or the revision) does not exist. Sizes are bytes, so the output is read as a buffer.
 */
function readBlobTexts(root, requests) {
  if (requests.length === 0) return [];
  const raw = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: requests.join('\n') + '\n',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
  const texts = [];
  let offset = 0;
  for (let index = 0; index < requests.length; index += 1) {
    const end = raw.indexOf(0x0a, offset);
    const header = raw.subarray(offset, end).toString('utf-8').split(' ');
    offset = end + 1;
    if (header.length === 3 && /^\d+$/.test(header[2])) {
      const size = Number(header[2]);
      texts.push(header[1] === 'blob' ? raw.subarray(offset, offset + size).toString('utf-8') : null);
      offset += size + 1;
    } else {
      texts.push(null);
    }
  }
  return texts;
}

/**
 * The introduction commit of a later check: the oldest commit of `HEAD`'s first-parent line whose
 * change to this script altered the count of the check's marker, or `null` when none did.
 */
function markerIntroduction(root, marker) {
  const shas = git(root, ['log', '--no-show-signature', '--first-parent', '--format=%H', '-S', marker, 'HEAD', '--', SCRIPT_PATH])
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((name) => requireCommitName(name, 'git log --first-parent -S'));
  return shas.length === 0 ? null : shas[shas.length - 1];
}

/** A memoized `blob id → parsed configuration` reader: `{ ok: true, value }` or `{ ok: false, error }`. */
function configReader(root, dist, schema) {
  const cache = new Map();
  return (oid) => {
    if (oid === null) return null;
    if (!cache.has(oid)) {
      let parsed;
      try {
        const result = schema.safeParse(dist.validation.parseYaml(git(root, ['cat-file', 'blob', oid]), oid));
        parsed = result.success ? { ok: true, value: result.data } : { ok: false, error: result.error.issues[0]?.message ?? 'invalid' };
      } catch (error) {
        parsed = { ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error) };
      }
      cache.set(oid, parsed);
    }
    return cache.get(oid);
  };
}

/** The index of the first line of the final paragraph of `lines`: the line after the last blank one. */
function finalParagraphStart(lines) {
  let lastBlank = -1;
  lines.forEach((line, index) => {
    if (line.trim() === '') lastBlank = index;
  });
  return lastBlank + 1;
}

/** The lines of a commit body's final paragraph: those after its last blank line (`git-conventions` §8). */
function finalParagraphLines(body) {
  const lines = body.split('\n');
  return lines.slice(finalParagraphStart(lines));
}

/**
 * Whether `name` <`email`> is a `team.agents` or `team.members` entry of `dna`: the name equal, the email equal
 * ignoring case; an entry without an email matches nothing (task-352 D5).
 */
function isTeamIdentity(dna, name, email) {
  const team = dna.team ?? {};
  return [...(team.agents ?? []), ...(team.members ?? [])].some(
    (entry) => entry.name === name && typeof entry.email === 'string' && entry.email.toLowerCase() === email.toLowerCase(),
  );
}

/**
 * The `co-author-identity` findings of one non-approval commit (`bug-475`, `bug-535`, task-352): `lines` are its
 * final paragraph's, `dna` the `.wingfoil/dna.yaml` of its first parent as `configReader` reads it.
 */
function coAuthorFindings(lines, dna) {
  const messages = [];
  const coAuthors = lines.filter((line) => CO_AUTHOR_KEY_RE.test(line));
  for (const line of coAuthors) {
    const parsed = CO_AUTHOR_VALUE_RE.exec(line);
    if (parsed === null) {
      messages.push(`a Co-Authored-By: line of the final paragraph is not \`Name <email>\` (git-conventions §7): ${line.slice(line.indexOf(':') + 1).trim()}`);
      continue;
    }
    const [, name, email] = parsed;
    const who = `${name} <${email}>`;
    if (dna === null) {
      messages.push(`no ${DNA_YAML} is committed before this commit, so the co-author ${who} cannot be matched against team.agents or team.members`);
    } else if (!dna.ok) {
      messages.push(`the ${DNA_YAML} committed before this commit does not validate (${dna.error}), so the co-author ${who} cannot be matched`);
    } else if (!isTeamIdentity(dna.value, name, email)) {
      messages.push(
        `the co-author ${who} is neither a team.agents nor a team.members entry of the ${DNA_YAML} committed before this commit ` +
          '(name and email both; git-conventions §7, bug-475)',
      );
    }
  }
  // bug-535: the attribution pair written twice — one finding per commit, naming each repeated key. Two lines name
  // the same co-author under D5's equivalence (the name exact, the email in any case); a line that does not parse is
  // compared as written.
  const repeated = [];
  const values = new Map();
  for (const line of coAuthors) {
    const value = line.slice(line.indexOf(':') + 1).trim();
    const parsed = CO_AUTHOR_VALUE_RE.exec(line);
    const key = parsed === null ? `\0${value}` : `${parsed[1]}\0${parsed[2].toLowerCase()}`;
    const entry = values.get(key) ?? { value, count: 0 };
    entry.count += 1;
    values.set(key, entry);
  }
  for (const { value, count } of values.values()) if (count > 1) repeated.push(`${count} Co-Authored-By: ${value} lines`);
  const models = lines.filter((line) => AI_MODEL_KEY_RE.test(line)).length;
  if (models > 1) repeated.push(`${models} AI-Model: lines`);
  if (repeated.length > 0) {
    messages.push(
      `the final paragraph repeats the agent attribution: ${repeated.join(', ')} ` +
        '(one Co-Authored-By: line per co-author and at most one AI-Model: line; git-conventions §7, bug-535)',
    );
  }
  return messages;
}

/**
 * Run the code build's `wingfoil verify` on `root` (`spec-020` §6.1 steps 1–2) and return its report, or throw the
 * failure to run (exit 2). `base` and `introducedAt` are full shas or `null` (the flag is then omitted); `head` is
 * the `HEAD` the script resolved, which the report must name.
 */
function runVerb(root, { head, base, introducedAt }) {
  const args = ['--no-warnings', CLI, 'verify', '--format', 'json', '--project', root];
  if (base !== null) args.push('--base', base);
  if (introducedAt !== null) args.push('--introduced-at', introducedAt);
  const child = spawnSync(process.execPath, args, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 1024, env: process.env });
  if (child.error) throw child.error;

  const errors = [];
  for (const line of (child.stderr ?? '').split('\n')) {
    if (line.trim() === '') continue;
    let document;
    try {
      document = JSON.parse(line);
    } catch {
      document = null;
    }
    const warning = document !== null && typeof document === 'object' ? document.warning : undefined;
    const error = document !== null && typeof document === 'object' ? document.error : undefined;
    if (typeof warning === 'string') {
      if (!warning.startsWith(DROPPED_WARNING_PREFIX)) process.stderr.write(`warning: ${warning}\n`);
    } else if (typeof error === 'string') {
      if (!error.startsWith(DROPPED_ERROR_PREFIX)) errors.push(error);
    } else {
      throw new Error(`wingfoil verify wrote a stderr line that is not a JSON document with a warning or an error string: ${line}`);
    }
  }

  let report = null;
  if (child.status === 0 || child.status === 1) {
    try {
      report = JSON.parse(child.stdout);
    } catch {
      report = null;
    }
  }
  const completed = report !== null && typeof report === 'object' && (report.verdict === 'pass' || report.verdict === 'fail');
  if (!completed) {
    throw new Error(errors[0] ?? `wingfoil verify exited ${child.status === null ? child.signal : child.status} with no report`);
  }
  for (const error of errors) process.stderr.write(`error: ${error}\n`);

  const reported = [...(report.checks ?? []).map((entry) => entry.check), ...(report.findings ?? []).map((finding) => finding.check)];
  const unknown = reported.find((check) => check !== undefined && !VERB_CHECKS.includes(check));
  if (unknown !== undefined) {
    throw new Error(`the verb reports check '${unknown}', which has no introduction in ${SCRIPT_PATH}: add its marker to CHECKS`);
  }
  const listed = new Set((report.checks ?? []).map((entry) => entry.check));
  const missing = VERB_CHECKS.filter((check) => !listed.has(check));
  if (missing.length > 0) throw new Error(`the verb's report lacks the checks ${SCRIPT_PATH} gates: ${missing.join(', ')}`);
  if (report.head !== head) throw new Error(`HEAD moved from ${head} to ${report.head} while the verb ran`);
  return report;
}

/** The last state of a subject's closing bracket (`[a → b]`, either arrow form), or `null` when it has none. */
function bracketTarget(subject) {
  const match = TRAILING_BRACKET_RE.exec(subject);
  if (!match) return null;
  const states = match[1].split(BRACKET_ARROW_RE).map((state) => state.trim());
  if (states.length < 2 || states.some((state) => state === '')) return null;
  return states[states.length - 1];
}

/**
 * Check the commits of `base..HEAD` (or of `HEAD`'s whole history) in the repository at `root`: the verb's checks,
 * gated by the script's introductions, and this repository's three extension checks.
 *
 * @param {string} root
 * @param {{ base?: string, introducedAt?: string }} [options]
 */
function checkGovernance(root, options = {}) {
  const dist = loadDist();
  const head = resolveCommit(root, 'HEAD', null);
  const base = options.base === undefined ? null : resolveCommit(root, options.base, '--base');
  const range = base === null ? ['HEAD'] : [`${base}..HEAD`];

  let introducedAt;
  if (options.introducedAt !== undefined) {
    introducedAt = resolveCommit(root, options.introducedAt, '--introduced-at');
  } else {
    // On the first-parent line, the commit that added the file is where it landed — on `main`, the
    // merge of the branch that wrote it — so every commit merged with it is history, not only those
    // older than the branch's own commit.
    const adding = git(root, ['log', '--no-show-signature', '--first-parent', '--diff-filter=A', '--format=%H', 'HEAD', '--', SCRIPT_PATH])
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((name) => requireCommitName(name, 'git log --first-parent --diff-filter=A'));
    introducedAt = adding.length === 0 ? null : adding[adding.length - 1];
  }
  const checkIntroductions = {};
  for (const [check, marker] of Object.entries(CHECKS)) {
    checkIntroductions[check] = options.introducedAt !== undefined ? introducedAt : (markerIntroduction(root, marker) ?? introducedAt);
  }
  const histories = new Map();
  const historyOf = (introduction) => {
    if (!histories.has(introduction)) {
      histories.set(introduction, new Set(introduction === null ? [] : git(root, ['rev-list', introduction]).trim().split('\n')));
    }
    return histories.get(introduction);
  };
  const history = historyOf(introducedAt);
  const isGated = (sha, check) => !historyOf(check === undefined ? introducedAt : checkIntroductions[check]).has(sha);

  const verb = runVerb(root, { head, base, introducedAt });

  const allCommits = readCommits(root, range);
  const memoryCommits = allCommits.filter((commit) => {
    const scope = WF_HEAD_RE.exec(commit.subject)?.[1];
    return commit.subject.startsWith('wf(') && (scope === undefined || !dist.memory.CONFIGURATION_SCOPES.includes(scope));
  });
  const memoryShas = new Set(memoryCommits.map((commit) => commit.sha));
  const otherCommits = allCommits.filter((commit) => !commit.merge && !memoryShas.has(commit.sha));
  const readMemoryYaml = configReader(root, dist, dist.memory.MemoryYaml);
  const readDnaYaml = configReader(root, dist, dist.dnaSchema.DnaYaml);

  const order = new Map(allCommits.map((commit, index) => [commit.sha, index]));
  const subjects = new Map(allCommits.map((commit) => [commit.sha, commit.subject]));
  const placed = (sha) => {
    if (!order.has(sha)) order.set(sha, order.size);
    return sha;
  };

  // The verb's findings, gated again by the script's introductions (spec-020 §6.1 step 3): a base check's by the
  // script's own, a later check's by its marker's; a base check's finding carries no `check` key, as before.
  const findings = (verb.findings ?? []).map((finding) => {
    const later = finding.check !== undefined && !BASE_CHECKS.includes(finding.check) ? finding.check : undefined;
    return {
      sha: placed(finding.sha),
      subject: finding.subject,
      rule: finding.rule,
      message: finding.message,
      gated: isGated(finding.sha, later),
      ...(later ? { check: later } : {}),
    };
  });
  const extensionFinding = (sha, message, check, rule) =>
    findings.push({ sha: placed(sha), subject: subjects.get(sha), rule, message, gated: isGated(sha, check), check });

  // plan-retrospective: a plan finalized into its last state holds a ### Retrospective entry (bug-320, dl-115 Q2 (a)).
  const finalizes = memoryCommits.filter(
    (commit) => WF_HEAD_RE.exec(commit.subject)?.[1] === 'plan' && dist.memory.parseMemoryOperation(commit.subject) === 'finalize',
  );
  if (finalizes.length > 0) {
    const touched = readTouchedPaths(root, range);
    const memoryOids = readBlobIds(root, finalizes.map((commit) => `${commit.sha}:${MEMORY_YAML}`));
    const planFinalizes = [];
    finalizes.forEach((commit, index) => {
      const memoryYaml = readMemoryYaml(memoryOids[index]);
      if (!memoryYaml || !memoryYaml.ok || !Object.prototype.hasOwnProperty.call(memoryYaml.value.types, 'plan')) return;
      const machine = dist.memory.resolveStateMachine(memoryYaml.value, 'plan');
      if (machine === undefined || bracketTarget(commit.subject) !== machine.sequence[machine.sequence.length - 1]) return;
      // A token of the subject names a document by its full id or by its short id, the slug left out.
      const named = new Set(commit.subject.split(/[\s,[\]]+/).filter((token) => token !== ''));
      const isNamed = (path) => {
        const id = basename(path, '.md');
        return named.has(id) || [...named].some((token) => id.startsWith(`${token}-`));
      };
      for (const path of touched.get(commit.sha) ?? []) {
        if (path.endsWith('.md') && isNamed(path)) planFinalizes.push({ sha: commit.sha, path });
      }
    });
    const texts = readBlobTexts(root, planFinalizes.map((entry) => `${entry.sha}:${entry.path}`));
    planFinalizes.forEach((entry, index) => {
      const text = texts[index];
      if (text === null || hasRetrospectiveEntry(text)) return;
      extensionFinding(
        entry.sha,
        `${entry.path}: plan ${basename(entry.path, '.md')} is finalized with no ### Retrospective entry, a line outside HTML comments ("None" counts; dl-115 Q2 (a), bug-320)`,
        'plan-retrospective',
        'state',
      );
    });
  }

  // co-author-identity: a non-approval commit's co-authors are team entries of the dna.yaml before it, and its final
  // paragraph carries the attribution pair once (bug-475, bug-535, task-352). Merges are judged: they carry the pair too.
  // Only a non-merge approval is left out, the one the verb's approval-agent-trailer judges: a merge with an Approver:
  // line is judged here, or it would escape both checks.
  const attributed = allCommits
    .filter((commit) => commit.merge || ![commit.subject, ...commit.body.split('\n')].some((line) => APPROVER_KEY_RE.test(line)))
    .map((commit) => ({ commit, lines: finalParagraphLines(commit.body) }))
    .filter(({ lines }) => lines.some((line) => CO_AUTHOR_KEY_RE.test(line) || AI_MODEL_KEY_RE.test(line)));
  const attributedDnaBlobs = readBlobIds(root, attributed.map(({ commit }) => `${commit.parent ?? commit.sha + '^'}:${DNA_YAML}`));
  attributed.forEach(({ commit, lines }, index) => {
    const dna = commit.parent === null ? null : readDnaYaml(attributedDnaBlobs[index]);
    for (const message of coAuthorFindings(lines, dna)) extensionFinding(commit.sha, message, 'co-author-identity', 'body');
  });

  // config-version: over a --base range, a versioned config file that changed bumps its version (bug-249).
  if (base !== null) {
    const mergeBase = git(root, ['merge-base', base, 'HEAD']).trim();
    const oids = readBlobIds(root, VERSIONED_CONFIG_FILES.flatMap((path) => [`${mergeBase}:${path}`, `${head}:${path}`]));
    VERSIONED_CONFIG_FILES.forEach((path, index) => {
      const [before, after] = [oids[index * 2], oids[index * 2 + 1]];
      if (before === null || after === null || before === after) return;
      const [beforeText, afterText] = readBlobTexts(root, [before, after]);
      const versionOf = (text) => {
        try {
          const document = dist.validation.parseYaml(text, path);
          return document !== null && typeof document === 'object' ? (document.version ?? null) : null;
        } catch {
          return null;
        }
      };
      const writtenOf = (text) => /^version:[ \t]*([^\s#]+)/m.exec(text)?.[1] ?? '(none)';
      if (dist.validation.isVersionIncrease(versionOf(beforeText), versionOf(afterText))) return;
      const last = git(root, ['log', '--no-show-signature', '-1', '--format=%H', `${base}..HEAD`, '--', path]).trim();
      const sha = last === '' ? head : requireCommitName(last, 'git log -1');
      if (!subjects.has(sha)) subjects.set(sha, git(root, ['log', '--no-show-signature', '-1', '--format=%s', sha]).trim());
      extensionFinding(
        sha,
        `${path}: changed in ${base}..HEAD, but version: ${writtenOf(beforeText)} → ${writtenOf(afterText)} is no numeric increase (bug-249, doc-versioning)`,
        'config-version',
        'config',
      );
    });
  }

  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.sha}\0${finding.rule}\0${finding.message}`, finding);
  // The trailer-paragraph findings of a commit follow the order the verb wrote them in (the order of the keys), after
  // its other findings of the rule; every other finding is ordered by message.
  const written = new Map([...unique.values()].map((finding, index) => [finding, index]));
  const isTrailer = (finding) => (finding.check === 'trailer-paragraph' ? 1 : 0);
  const sorted = [...unique.values()].sort(
    (a, b) =>
      order.get(a.sha) - order.get(b.sha) ||
      RULES.indexOf(a.rule) - RULES.indexOf(b.rule) ||
      isTrailer(a) - isTrailer(b) ||
      (isTrailer(a) === 1 ? written.get(a) - written.get(b) : a.message < b.message ? -1 : a.message > b.message ? 1 : 0),
  );

  return {
    head,
    base,
    introducedAt,
    checkIntroductions,
    checked: memoryCommits.length,
    otherCommits: otherCommits.length,
    gatedCommits: memoryCommits.filter((commit) => !history.has(commit.sha)).length,
    findings: sorted,
    stateUnchecked: (verb.stateUnchecked ?? []).map(({ sha, subject, reason }) => ({ sha, subject, reason })),
  };
}

/** @param {{ findings: readonly { gated: boolean }[] }} report */
function exitCodeFor(report) {
  return report.findings.some((finding) => finding.gated) ? 1 : 0;
}

/** Count `items` by `key`, as `a 3, b 1` in first-seen order of `RULES`. */
function countByRule(findings) {
  return RULES.map((rule) => [rule, findings.filter((finding) => finding.rule === rule).length])
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule} ${count}`)
    .join(', ');
}

/** The report as printed lines. */
function formatReport(report) {
  const gated = report.findings.filter((finding) => finding.gated);
  const history = report.findings.filter((finding) => !finding.gated);
  const lines = [
    `governance check: ${report.checked} wf() commits in ${report.base === null ? 'HEAD' : `${report.base}..HEAD`} ` +
      `(${report.gatedCommits} after the introduction commit ${report.introducedAt ?? '(none: every commit is gated)'}), ` +
      `and ${report.otherCommits} other commits`,
    `later checks introduced at: ${Object.entries(report.checkIntroductions)
      .map(([check, sha]) => `${check} ${sha ?? '(none)'}`)
      .join(', ')}`,
  ];
  const line = (finding) => `  ${finding.sha} ${finding.rule}: ${finding.message}\n      ${finding.subject}`;
  if (gated.length > 0) lines.push('FAIL — after the introduction commit:', ...gated.map(line));
  if (history.length > 0) lines.push('history — reported, not failing:', ...history.map(line));
  const commitsWith = (entries) => new Set(entries.map((entry) => entry.sha)).size;
  // bug-438, spec-020 §7: each count says what it counts, and a line with no entry drops its commit count and its list.
  const summary = (findings) =>
    findings.length === 0 ? '0 findings' : `${findings.length} findings on ${commitsWith(findings)} commits with a finding (${countByRule(findings)})`;
  const unchecked = report.stateUnchecked.length;
  lines.push(
    `gated: ${summary(gated)}`,
    `history: ${summary(history)}`,
    `state not checked: ${unchecked === 0 ? '0 entries' : `${unchecked} entries on ${commitsWith(report.stateUnchecked)} commits with an entry`} ` +
      '(history with no machine, no named document, a document gone at HEAD, or a revision that does not parse or is in a newer format)',
  );
  return lines.join('\n');
}

/**
 * The `WingFoil-*` keys a commit's body writes outside its final paragraph, each once, as first written
 * (`git-conventions` §8, `bug-391`): the verb's own reader (`src/core/governance-check.ts`, `spec-020` §4.11), which
 * the script delegates to so that it defines no predicate of the check (task-366 D5).
 */
function trailerKeysOutsideFinalParagraph(body) {
  return loadDist().core.trailerKeysOutsideFinalParagraph(body);
}

/** Parse the command line; throws `UsageError`. */
function parseArgs(argv) {
  const options = { json: false };
  const valued = { '--root': 'root', '--base': 'base', '--introduced-at': 'introducedAt' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (Object.prototype.hasOwnProperty.call(valued, arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      options[valued[arg]] = value;
      index += 1;
    } else throw new UsageError(`unknown argument: ${arg}`);
  }
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    const root = options.root ?? git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const report = checkGovernance(root, { base: options.base, introducedAt: options.introducedAt });
    process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatReport(report)}\n`);
    return exitCodeFor(report);
  } catch (error) {
    // Exit 1 means a gated finding and nothing else: any failure to run — bad usage, no repository,
    // no build, a git error — is exit 2, with its message.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message.split('\n')[0]}\n`);
    return 2;
  }
}

module.exports = { CHECKS, checkGovernance, exitCodeFor, formatReport, trailerKeysOutsideFinalParagraph };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

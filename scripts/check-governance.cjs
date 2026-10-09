#!/usr/bin/env node
/**
 * The governance check over `wf()` commits (`dl-103` §1, `task-167`) — read-only, and not shipped
 * in the npm package (`package.json` `files`; `spec-015`). It checks every `wf({type}): …` commit of a
 * range against five rules:
 *
 * - **subject** — `wf({type}): {verb} {id1}, {id2}`, with `{verb}` one of the eleven declared verbs
 *   (`spec-008` §2, `dl-079` (A); `assign` only in its canonical form, approver ruling 2026-10-01) and
 *   `{type}` a type of the `memory.yaml` committed at that commit. Configuration scopes (`wf(dna)`,
 *   `wf(directive)`, `wf(workflow)`) are not Memory operations and are skipped.
 * - **bracket** — none on `add`, `submit` and `assign`; on every other verb the canonical
 *   `[from → to]` (U+2192, single spaces, closing the subject). Only `sync` chains; `deprecate` ends in
 *   `deprecated`; `amend` is the self-loop `[s → s]`; `park` is one hop between two different states (the
 *   state rule requires it to be the type's `returns.<from>` edge, task-180).
 * - **body** — `approve`, `reject` and `amend` carry `Approver: Name <email> (approver)` as the first
 *   body line and a `Reason:` block; `park` carries a `Reason:` block (`spec-008` §2, `dl-110`);
 *   `assign` carries no `Approver:`. Any `Reason:` must be recordable
 *   under `dl-067` as `task-166` amended it (`reasonDefect`): not blank, no control character other
 *   than tab and newline, no line starting with a reserved key (`Approver:`, `Reason:`,
 *   `WingFoil-Version:`, in any letter case), no final `Key: value` paragraph. At most one `Approver:`
 *   and one `Reason:` key line.
 * - **authority** — wherever a commit records an approval (`approve`, `reject`, `amend`, or any other
 *   verb carrying an `Approver:` line), its author holds the `approver` role in `team.members` of the
 *   `dna.yaml` committed BEFORE it (its first parent: a commit cannot grant itself), and the
 *   `Approver:` line names that same author (`dl-094`: one identity per act).
 * - **state** — on every Memory `wf()` commit, whatever its verb:
 *   - a bracketed subject: `verifyTransitionConsistency` (`src/memory/audit.ts`) on every document the
 *     commit touches and names (by full or short id), given the type's machine as the `memory.yaml` at
 *     the checked commit declares it, so a chain's hops are judged (`illegal-hop`) and the bracket is
 *     compared with the frontmatter (`mismatch`, `unparseable`). A single hop, which that function
 *     leaves to the write-time engine, is judged here with `isMachineEdge` too, because a hand-written
 *     commit never met the engine; `amend` is exempt, its self-loop being fixed by the bracket rule;
 *     a `park` hop must be the type's declared return edge, `returns.<from>` (task-180), not merely
 *     some edge of the machine;
 *   - a bracketless subject, from the frontmatter (`reconstructMemoryTransitions`): `submit` moves a
 *     named document along an edge of the machine; `add` leaves it in the machine's initial state;
 *     `assign` leaves its status unchanged (`spec-008` §2);
 *   - every commit: a touched document the subject does not name is a finding when the commit changed
 *     its status — an element moved without being recorded;
 *   - a gated commit whose `memory.yaml` is missing or does not validate is a finding: its state cannot
 *     be checked. History before `.wingfoil/` existed is listed as "state not checked" instead.

 * **Later checks** (task-208), each gating only the commits after its own introduction (below):
 * - `verb-edge` (`bug-192`; `spec-008` §2 "Which verb a `set_state` emits"): a single-hop `approve`
 *   moves along a forward edge; `start` along a forward edge not into the last state of the
 *   `sequence`; `finalize` along a forward edge into it; `reject` along a `gates` reject edge. A
 *   bracket hop that is a reject edge and not a forward one, under any other verb (`sync`), needs the
 *   approver's reject commit cited by sha in the body (`dl-061` B.1). A named document gone at `HEAD`
 *   still has its bracket compared with its frontmatter before and after the commit.
 * - `status-outside-wf` (`dl-139` (a)): a non-merge commit that is not a Memory `wf()` operation (any
 *   other subject, a configuration scope included) changes no Memory document's `status`, nor creates
 *   one. A Memory document is a `.md` under the content roots of the `memory.yaml` committed at that
 *   commit whose frontmatter `type` is one of its types; renames are followed; a deletion is not judged.
 * - `supersedes-pair` (`bug-218`): an `approve` that leaves a document in the `waiting` state whose
 *   forward edge leads to `superseded`, with a non-empty `supersedes:`, needs the element it names to
 *   be `superseded` at `HEAD`; the finding names the `finalize` commit that completes the pair.
 * - `config-version` (`bug-249`; rule `config`): with `--base`, each of the four versioned config files
 *   whose blob differs between the merge-base of `--base` and `HEAD`, and `HEAD`, declares a `version:`
 *   numerically greater (`isVersionIncrease`, `src/validation`, shared with the pending-change gate of
 *   `test/lint/helpers/version-bump.ts`). The finding sits on the range's last commit touching the file.
 *   Without `--base` nothing is judged: a whole-history run has no range to bump over.
 * - `approval-ai-trailer` (`bug-307`; rule `body`): an `approve` or `reject` commit records the
 *   approver's decision and carries no `Co-Authored-By:` and no `AI-Model:` line (`git-conventions` §7);
 *   every other verb may. The approve/reject commits written before this check are history: they cannot
 *   be rewritten (`git-conventions` §2, §8).

 * **Starting mode** (`dl-103` §1). A finding on a commit that is not the introduction commit nor one
 * of its ancestors is gated, and fails the check (exit 1). A finding on history — the introduction
 * commit and its ancestors — is reported and does not fail it (exit 0). The introduction commit is
 * the commit of `HEAD`'s first-parent line that added this file — on `main`, the merge that landed it
 * — unless `--introduced-at` names one. Each later check has its own introduction: the oldest commit
 * of `HEAD`'s first-parent line whose change to this file altered the count of the check's marker
 * (`CHECKS`, `git log -S`), so a rule added later never fails on commits pushed before it existed; a
 * marker no commit brought in falls back to the script's introduction, and `--introduced-at` sets every
 * check's introduction at once.
 *
 * The parsers are `src/memory`'s, read from the compiled `dist/` (`npm run build` first): the verb
 * list and subject reader (`parseMemoryOperation`), the bracket reader (`parseBracketHops`), the
 * `Approver:`/`Reason:` readers and the reason grammar (`commit-message.ts`), the machine resolver and
 * edge test (`state-machine.ts`), and the consistency check (`audit.ts`). Nothing here re-implements
 * them. Deterministic (REQ-SYS-07): findings come out oldest commit first, then by rule, then by
 * message; no clock is read.
 *
 * Usage: node scripts/check-governance.cjs [--root <dir>] [--base <rev>] [--introduced-at <rev>] [--json]
 *   --root           the repository to check (default: the git top level of the working directory)
 *   --base           check `<rev>..HEAD` only (default: the whole history of HEAD)
 *   --introduced-at  the introduction commit (default: the first-parent commit that added this file)
 *   --json           print the report as JSON instead of lines
 * Exit: 0 no gated finding · 1 a gated finding · 2 the check could not run (bad usage, no repository
 * or no commit, `dist/` not built, a git failure), with the message on stderr.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { basename, join } = require('node:path');

/** This file's path inside the repository it governs: its introduction is the first-parent commit adding it. */
const SCRIPT_PATH = 'scripts/check-governance.cjs';
const MEMORY_YAML = '.wingfoil/memory.yaml';
const DNA_YAML = '.wingfoil/dna.yaml';
const DIST = join(__dirname, '..', 'dist');

/** The rules, in the order findings are sorted within a commit. */
const RULES = ['subject', 'bracket', 'body', 'authority', 'state', 'config'];

/**
 * The checks added after the script itself (task-208), each with the marker whose first appearance in
 * this file, on `HEAD`'s first-parent line, is the check's introduction commit. Each marker appears in
 * this file exactly once, here.
 */
const CHECKS = Object.freeze({
  'verb-edge': 'governance-check:verb-edge',
  'status-outside-wf': 'governance-check:status-outside-wf',
  'supersedes-pair': 'governance-check:supersedes-pair',
  'config-version': 'governance-check:config-version',
  'approval-ai-trailer': 'governance-check:approval-ai-trailer',
});

/** The verbs that record the approver's decision and carry no AI co-author (`git-conventions` §7). */
const DECISION_VERBS = new Set(['approve', 'reject']);
/** A co-author or model trailer line (`git-conventions` §7, `bug-307`). */
const AI_TRAILER_RE = /^(co-authored-by|ai-model):/i;

/** The four versioned config files whose `version:` the doc-versioning bump rule applies to (`bug-143`). */
const VERSIONED_CONFIG_FILES = ['.wingfoil/dna.yaml', '.wingfoil/memory.yaml', '.wingfoil/workflows.yaml', '.wingfoil/roles.yaml'];

/** The verbs whose single hop the `verb-edge` check pairs with a kind of edge (`spec-008` §2). */
const PAIRED_VERBS = new Set(['approve', 'start', 'finalize', 'reject']);
/** A token that may be a commit sha cited in a body. */
const SHA_TOKEN_RE = /\b[0-9a-f]{7,64}\b/g;

/** The verbs that record an approval, and therefore need `Approver:` and authority. */
const APPROVAL_VERBS = new Set(['approve', 'reject', 'amend']);
/** The verbs whose subject carries no bracket (`spec-008` §2). */
const BRACKETLESS_VERBS = new Set(['add', 'submit', 'assign']);
/** The verbs whose fixed bracket the bracket rule pins, so the machine does not judge their hop. */
const EDGE_EXEMPT_VERBS = new Set(['amend']);
/** The verbs that record a reason but no approval (`spec-008` §2): `park` (`dl-110`, task-180). */
const REASON_VERBS = new Set(['park']);

/** The subject's `wf({scope}): {verb}` head, read as `src/memory/audit.ts`'s own reader reads it. */
const WF_HEAD_RE = /^wf\(([^)]*)\):\s*(\S+)/;
/** The canonical bracket: U+2192 arrows with single spaces, closing the subject. */
const CANONICAL_BRACKET_RE = / \[([^\s[\]]+(?: → [^\s[\]]+)+)\]$/;
/** Any bracket in the subject, written or not as a transition. */
const ANY_BRACKET_RE = /[[\]]/;
/** The id list after the verb: ids separated by `, `. */
const ID_LIST_RE = /^[^\s,[\]]+(?:, [^\s,[\]]+)*$/;
/** The ids of a canonical `assign` subject. */
const ASSIGN_IDS_RE = / to (.+)$/;
const APPROVER_KEY_RE = /^approver:/i;
const REASON_KEY_RE = /^reason:/i;

/**
 * The compiled `src` modules the check reuses, loaded when a check runs, so that a missing build is
 * reported as a usage error (exit 2, "run `npm run build` first") rather than as a stack trace.
 */
function loadDist() {
  if (!existsSync(join(DIST, 'memory', 'index.js'))) {
    throw new UsageError(`${DIST} is not built: run \`npm run build\` first`);
  }
  return {
    memory: require(join(DIST, 'memory')),
    core: require(join(DIST, 'core')),
    validation: require(join(DIST, 'validation')),
    dnaSchema: require(join(DIST, 'dna', 'schema')),
    storage: require(join(DIST, 'storage')),
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
 * Where each path renamed inside the range ended up: a function from a path as some commit wrote it to
 * the path the same document has at `HEAD`, which is where `verifyTransitionConsistency` walks from.
 */
function readRenames(root, range) {
  const raw = git(root, ['-c', 'diff.renameLimit=0', 'log', '--no-show-signature', '--reverse', '-M', '--diff-filter=R', '--name-status', '--format=', ...range]);
  const forward = new Map();
  for (const line of raw.split('\n')) {
    const [status, from, to] = line.split('\t');
    if (status && status.startsWith('R') && from && to) forward.set(from, to);
  }
  return (path) => {
    let current = path;
    for (let step = 0; step < forward.size && forward.has(current); step += 1) current = forward.get(current);
    return current;
  };
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
 * A Markdown text's frontmatter `status` and `type`: `null` when there is no text, `{ unreadable }` when
 * the frontmatter does not parse, else the two fields (`null` where absent or not a string).
 */
function readFrontmatterFields(dist, text, label) {
  if (text === null) return null;
  const { frontmatter } = dist.storage.splitFrontmatter(text);
  if (!frontmatter) return { status: null, type: null, supersedes: null, id: null };
  let parsed;
  try {
    parsed = dist.validation.parseYaml(frontmatter, label);
  } catch (error) {
    return { unreadable: error instanceof Error ? error.message.split('\n')[0] : String(error) };
  }
  const field = (name) => (parsed !== null && typeof parsed === 'object' && typeof parsed[name] === 'string' ? parsed[name] : null);
  return { status: field('status'), type: field('type'), supersedes: field('supersedes'), id: field('id') };
}

/**
 * The file changes of each non-merge commit of `shas` (renames followed, `-M`): `{ from, to }` paths,
 * `from` `null` for an addition and `to` `null` for a deletion. One `git log` over the range.
 */
function readFileChanges(root, range, shas) {
  const wanted = new Set(shas);
  const changes = new Map();
  if (wanted.size === 0) return changes;
  const raw = git(root, ['-c', 'diff.renameLimit=0', 'log', '--no-show-signature', '--no-merges', '-M', '--name-status', '--format=%x01%H', ...range]);
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('\u0001')) {
      const sha = requireCommitName(line.slice(1), 'git log --name-status');
      current = wanted.has(sha) ? [] : null;
      if (current !== null) changes.set(sha, current);
    } else if (line !== '' && current !== null) {
      const [status, first, second] = line.split('\t');
      if (status.startsWith('R')) current.push({ from: first, to: second });
      else if (status.startsWith('C')) current.push({ from: null, to: second });
      else if (status === 'A') current.push({ from: null, to: first });
      else if (status === 'D') current.push({ from: first, to: null });
      else current.push({ from: first, to: first });
    }
  }
  return changes;
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

/** The kinds of edge `from → to` is in `machine`: `forward`, `reject`, `returns`, `deprecate`. */
function edgeKinds(dist, machine, from, to) {
  const kinds = [];
  const index = machine.sequence.indexOf(from);
  if (index !== -1 && machine.sequence[index + 1] === to) kinds.push('forward');
  if ((machine.gates ?? {})[from]?.reject === to) kinds.push('reject');
  if ((machine.returns ?? {})[from] === to) kinds.push('returns');
  if (to === dist.memory.DEPRECATED_STATE) kinds.push('deprecate');
  return kinds;
}

/**
 * The `verb-edge` finding of a single hop under a paired verb (`spec-008` §2), or `null`. Only an edge
 * of the machine is judged: a non-edge is already the state rule's finding.
 */
function verbEdgeFinding(dist, machine, type, op, from, to) {
  if (!PAIRED_VERBS.has(op) || !dist.memory.isMachineEdge(machine, from, to)) return null;
  const kinds = edgeKinds(dist, machine, from, to);
  const last = machine.sequence[machine.sequence.length - 1];
  const what = `${from} → ${to} is a ${kinds.join('/')} edge of the '${type}' machine`;
  if (op === 'approve' && !kinds.includes('forward')) return `'approve' moves along a forward edge; ${what}`;
  if (op === 'reject' && !kinds.includes('reject')) return `'reject' moves along a gates reject edge; ${what}`;
  if (op === 'finalize' && (!kinds.includes('forward') || to !== last)) return `'finalize' moves along the forward edge into the last state '${last}'; ${what}`;
  if (op === 'start' && (!kinds.includes('forward') || to === last)) {
    return `'start' moves along a forward edge not into the last state '${last}' (that is 'finalize'); ${what}`;
  }
  return null;
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

/** The ids a subject names: after the verb (without the bracket), or after `to` for `assign`. */
function subjectIds(subject, verb) {
  if (verb === 'assign') {
    const match = ASSIGN_IDS_RE.exec(subject);
    return match ? match[1].split(', ') : [];
  }
  const rest = subject.replace(WF_HEAD_RE, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  return ID_LIST_RE.test(rest) ? rest.split(', ') : null;
}

/** The subject and bracket rules. Returns the findings and the Memory operation (or `null`). */
function checkSubjectAndBracket(commit, memoryYaml, dist) {
  const findings = [];
  const add = (rule, message) => findings.push({ rule, message });
  const { subject } = commit;
  const head = WF_HEAD_RE.exec(subject);
  if (!head) {
    add('subject', 'not in the wf({type}): {verb} {ids} grammar');
    return { findings, op: null, ids: [] };
  }
  const [, scope, verb] = head;
  const op = dist.memory.parseMemoryOperation(subject);
  if (op === null) {
    add(
      'subject',
      verb === 'assign'
        ? 'an assign subject must be `wf({type}): assign release {version} to {ids}`, with no bracket'
        : `'${verb}' is not one of the declared verbs (${dist.memory.MEMORY_OPERATIONS.join(', ')})`,
    );
    return { findings, op: null, ids: [] };
  }
  if (memoryYaml && memoryYaml.ok && !Object.prototype.hasOwnProperty.call(memoryYaml.value.types, scope)) {
    add('subject', `'${scope}' is not a type of the memory.yaml committed at this commit`);
  }
  const ids = subjectIds(subject, op);
  if (ids === null || ids.length === 0) add('subject', "the ids after the verb must be a list separated by ', '");

  if (BRACKETLESS_VERBS.has(op)) {
    if (ANY_BRACKET_RE.test(subject.slice(head[0].length))) add('bracket', `'${op}' carries no bracket`);
    return { findings, op, ids: ids ?? [] };
  }
  const bracket = CANONICAL_BRACKET_RE.exec(subject);
  if (!bracket) {
    add(
      'bracket',
      ANY_BRACKET_RE.test(subject)
        ? 'the bracket is not canonical: [from → to], with the U+2192 arrow and single spaces, closing the subject'
        : `'${op}' needs a [from → to] bracket`,
    );
    return { findings, op, ids: ids ?? [] };
  }
  const states = bracket[1].split(' → ');
  if (states.length > 2 && op !== 'sync') add('bracket', `only 'sync' may chain states; '${op}' brackets one hop`);
  if (op === 'deprecate' && states[states.length - 1] !== dist.memory.DEPRECATED_STATE) {
    add('bracket', "'deprecate' ends in 'deprecated'");
  }
  if (op === 'amend' && (states.length !== 2 || states[0] !== states[1])) {
    add('bracket', "'amend' brackets the unchanged state, [s → s]");
  }
  if (op === 'park' && (states.length !== 2 || states[0] === states[1])) {
    add('bracket', "'park' brackets one hop between two different states, [from → to]");
  }
  return { findings, op, ids: ids ?? [] };
}

/** The body and authority rules. */
function checkBodyAndAuthority(commit, op, dna, dist) {
  const findings = [];
  const add = (rule, message) => findings.push({ rule, message });
  const lines = commit.body.split('\n');
  const approverLines = lines.filter((line) => APPROVER_KEY_RE.test(line));
  const reasonLines = lines.filter((line) => REASON_KEY_RE.test(line));
  const approval = dist.memory.parseApprovalMetadata(commit.body);
  const recordsApproval = APPROVAL_VERBS.has(op) || approverLines.length > 0;

  if (op === 'assign' && approverLines.length > 0) {
    add('body', "'assign' is not an approval: it carries no Approver: line");
  } else if (recordsApproval) {
    if (approverLines.length === 0) add('body', `'${op}' needs an Approver: line`);
    else if (approval === null) add('body', 'the Approver: line must be the first body line, as `Approver: Name <email> (role)`');
    else if (approval.approverRole !== dist.core.APPROVER_ROLE) add('body', `the Approver: role is '${approval.approverRole}', not 'approver'`);
    if (approverLines.length > 1) add('body', `${approverLines.length} Approver: lines; an approval records one`);
    if (APPROVAL_VERBS.has(op) && reasonLines.length === 0) add('body', `'${op}' needs a Reason: block`);
  }

  if (REASON_VERBS.has(op) && reasonLines.length === 0) add('body', `'${op}' needs a Reason: block`);
  if (reasonLines.length > 1) add('body', `${reasonLines.length} Reason: lines; a commit records one Reason: block`);
  if (reasonLines.some((line) => !line.startsWith('Reason:'))) add('body', 'the Reason: key is written `Reason:`');
  if (reasonLines.length > 0 && lines.some((line) => line.startsWith('Reason:'))) {
    const reason = dist.memory.parseCommitReason(commit.body);
    const refusal = reason === null ? 'must not be blank' : dist.memory.reasonRefusalMessage(reason);
    if (refusal !== null) add('body', `the Reason: block ${refusal.replace(/^invalid flag value: --reason /, '')} (dl-067)`);
  }

  if (recordsApproval && op !== 'assign') {
    if (dna === null) {
      add('authority', `no ${DNA_YAML} is committed before this commit, so no approval authority can be established`);
    } else if (!dna.ok) {
      add('authority', `the ${DNA_YAML} committed before this commit does not validate (${dna.error})`);
    } else if (!dist.core.hasApproverRole(dna.value, commit.authorEmail)) {
      add('authority', `the author <${commit.authorEmail}> holds no approver role in team.members (dl-094)`);
    }
    if (approval !== null && approval.approverEmail.toLowerCase() !== commit.authorEmail.toLowerCase()) {
      add('authority', `the Approver: line names <${approval.approverEmail}>, but <${commit.authorEmail}> authored the commit (dl-094)`);
    }
  }
  return findings;
}

/** A `TransitionFinding` of `verifyTransitionConsistency`, as one line. */
function describeTransitionFinding(finding, path, type) {
  switch (finding.kind) {
    case 'mismatch':
      return `${path}: the bracket declares ${finding.declared.from} → ${finding.declared.to}, the frontmatter went ${finding.derived.from} → ${finding.derived.to}`;
    case 'illegal-hop':
      return `${path}: the hop ${finding.hop.from} → ${finding.hop.to} is not an edge of the '${type}' machine at this commit`;
    default:
      return `${path}: the bracket does not read as a transition`;
  }
}

/**
 * Check the `wf()` commits of `base..HEAD` (or of `HEAD`'s whole history) in the repository at `root`,
 * and the other commits of the range for the later checks that read them.
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

  const allCommits = readCommits(root, range);
  const commits = allCommits.filter((commit) => commit.subject.startsWith('wf('));
  const memoryCommits = commits.filter((commit) => {
    const scope = WF_HEAD_RE.exec(commit.subject)?.[1];
    return scope === undefined || !dist.memory.CONFIGURATION_SCOPES.includes(scope);
  });
  const memoryShas = new Set(memoryCommits.map((commit) => commit.sha));
  const otherCommits = allCommits.filter((commit) => !commit.merge && !memoryShas.has(commit.sha));
  const touched = readTouchedPaths(root, range);
  const renamed = readRenames(root, range);
  const atHead = new Set(git(root, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n'));
  const blobs = readBlobIds(
    root,
    memoryCommits.flatMap((commit) => [`${commit.sha}:${MEMORY_YAML}`, `${commit.parent ?? commit.sha + '^'}:${DNA_YAML}`]),
  );
  const readMemoryYaml = configReader(root, dist, dist.memory.MemoryYaml);
  const readDnaYaml = configReader(root, dist, dist.dnaSchema.DnaYaml);

  const findings = [];
  const stateUnchecked = [];
  const order = new Map(allCommits.map((commit, index) => [commit.sha, index]));
  const subjects = new Map(allCommits.map((commit) => [commit.sha, commit.subject]));
  const bodies = new Map(allCommits.map((commit) => [commit.sha, commit.body]));
  /** headPath → sha → how that commit touched the document: { named, op, bracketed, machine, type, key } */
  const stateDocuments = new Map();
  /** The named documents of each `approve`, for the `supersedes-pair` check: { sha, path, machine, type }. */
  const approvals = [];
  /** Sync-style hops across a reject edge, whose body must cite a reject commit: { sha, hop }. */
  const rejectCrossings = [];
  /** Named, bracketed touches of a document gone at `HEAD`: { sha, parent, path, hops, type }. */
  const goneAtHead = [];

  memoryCommits.forEach((commit, index) => {
    const memoryOid = blobs[index * 2];
    const memoryYaml = readMemoryYaml(memoryOid);
    const dna = commit.parent === null ? null : readDnaYaml(blobs[index * 2 + 1]);
    const push = ({ rule, message, check }) =>
      findings.push({ sha: commit.sha, subject: commit.subject, rule, message, gated: isGated(commit.sha, check), ...(check ? { check } : {}) });

    const { findings: subjectFindings, op, ids } = checkSubjectAndBracket(commit, memoryYaml, dist);
    subjectFindings.forEach(push);
    if (op !== null) checkBodyAndAuthority(commit, op, dna, dist).forEach(push);
    if (DECISION_VERBS.has(op)) {
      for (const line of commit.body.split('\n').filter((candidate) => AI_TRAILER_RE.test(candidate))) {
        const key = line.slice(0, line.indexOf(':'));
        push({
          rule: 'body',
          message: `'${op}' records the approver's decision and carries no AI co-author trailer (git-conventions §7), yet it has a ${key}: line`,
          check: 'approval-ai-trailer',
        });
      }
    }

    if (!WF_HEAD_RE.test(commit.subject)) return;
    const gated = !history.has(commit.sha);
    const unchecked = (reason) => stateUnchecked.push({ sha: commit.sha, subject: commit.subject, reason });
    const type = WF_HEAD_RE.exec(commit.subject)[1];
    const typeKnown = Boolean(memoryYaml && memoryYaml.ok && Object.prototype.hasOwnProperty.call(memoryYaml.value.types, type));
    const machine = typeKnown ? dist.memory.resolveStateMachine(memoryYaml.value, type) : undefined;
    if (machine === undefined) {
      // An unknown type under a readable memory.yaml is already a subject finding.
      const why =
        memoryYaml === null
          ? `no ${MEMORY_YAML} is committed at this commit`
          : !memoryYaml.ok
            ? `the ${MEMORY_YAML} committed at this commit does not validate (${memoryYaml.error})`
            : `no machine for '${type}' in the ${MEMORY_YAML} at this commit`;
      if (gated && (memoryYaml === null || !memoryYaml.ok)) push({ rule: 'state', message: `${why}: its state cannot be checked` });
      else unchecked(`${why}: transitions not judged`);
    }
    const bracketed = ANY_BRACKET_RE.test(commit.subject);

    const hops = bracketed ? dist.memory.parseBracketHops(commit.subject) : null;
    if (op !== null && machine && hops && hops.length === 1 && !EDGE_EXEMPT_VERBS.has(op)) {
      const { from, to } = hops[0];
      if (op === 'park') {
        // `park` takes the declared return edge and no other (`spec-008` §2), as `deprecate` takes only `deprecated`.
        if ((machine.returns ?? {})[from] !== to) {
          push({ rule: 'state', message: `${from} → ${to} is not a returns edge of the '${type}' machine at this commit` });
        }
      } else if (!dist.memory.isMachineEdge(machine, from, to)) {
        push({ rule: 'state', message: `${from} → ${to} is not an edge of the '${type}' machine at this commit` });
      } else {
        const pairing = verbEdgeFinding(dist, machine, type, op, from, to);
        if (pairing !== null) push({ rule: 'state', message: pairing, check: 'verb-edge' });
      }
    }
    // A hop along a reject edge that is no forward edge, under a verb that is not `reject` itself
    // (`sync`, `dl-061` B.1): the decision is the approver's reject, which the body must cite by sha.
    if (op !== null && op !== 'reject' && !PAIRED_VERBS.has(op) && machine && hops) {
      for (const hop of hops) {
        const kinds = edgeKinds(dist, machine, hop.from, hop.to);
        if (kinds.includes('reject') && !kinds.includes('forward')) {
          rejectCrossings.push({ sha: commit.sha, hop, type });
          break;
        }
      }
    }

    // Every token of the subject, not only the parsed id list: a subject whose id list does not parse
    // (`wf(bug): sync bug-1 [a -> b] and bug-2 [-> c]`) still names the documents it touched.
    const named = new Set([...ids, ...commit.subject.split(/[\s,[\]]+/)]);
    // A token names a document by its full id or by its short id, the slug left out (`bug-071` for
    // `bug-071-read-status-at-leaks-git-stderr.md`), as hand-written subjects often do.
    const isNamed = (path) => {
      const id = basename(path, '.md');
      return named.has(id) || [...named].some((token) => token !== '' && id.startsWith(`${token}-`));
    };
    // Every Markdown document the commit touches is checked: those its subject names, and the others
    // for one thing only — a status the commit changed without naming the element.
    const documents = new Map();
    const writtenAt = new Map();
    for (const path of (touched.get(commit.sha) ?? []).filter((candidate) => candidate.endsWith('.md'))) {
      const atHeadPath = renamed(path);
      documents.set(atHeadPath, documents.get(atHeadPath) === true || isNamed(path));
      if (isNamed(path)) writtenAt.set(atHeadPath, path);
    }
    if (![...documents.values()].some(Boolean)) unchecked('no document it touches is named by its subject');
    for (const [path, isNamedDocument] of documents) {
      if (isNamedDocument && op === 'approve' && machine) approvals.push({ sha: commit.sha, path: writtenAt.get(path) ?? path, machine, type });
      if (!atHead.has(path)) {
        if (!isNamedDocument) continue;
        if (machine && hops && !EDGE_EXEMPT_VERBS.has(op)) {
          goneAtHead.push({ sha: commit.sha, parent: commit.parent, path: writtenAt.get(path) ?? path, hops });
        } else {
          unchecked(`${path} does not exist at HEAD`);
        }
        continue;
      }
      if (!stateDocuments.has(path)) stateDocuments.set(path, new Map());
      stateDocuments.get(path).set(commit.sha, {
        named: isNamedDocument,
        op,
        bracketed,
        machine,
        type,
        key: machine === undefined ? '' : `${memoryOid}:${type}`,
      });
    }
  });

  const byOrder = (a, b) => order.get(a) - order.get(b);
  /** Run `read`; on a revision whose frontmatter does not parse, report `shas` as not checked instead. */
  const readOrReport = (path, shas, read) => {
    try {
      return read();
    } catch (error) {
      // Both reads are strict: they read every revision's `status` and throw on a revision whose
      // frontmatter does not parse (`reconstructMemoryTransitions` is tolerant only for `memory
      // history`, task-171). The document's commits are reported as not checked, naming the error,
      // rather than stopping the whole check or passing them as checked.
      if (!(error instanceof dist.validation.ValidationError)) throw error;
      const first = error.message.split('\n')[0];
      for (const sha of [...shas].sort(byOrder)) {
        stateUnchecked.push({ sha, subject: subjects.get(sha), reason: `${path}: a revision's frontmatter does not parse (${first})` });
      }
      return null;
    }
  };
  const stateFinding = (sha, message, check, rule = 'state') =>
    findings.push({ sha, subject: subjects.get(sha), rule, message, gated: isGated(sha, check), ...(check ? { check } : {}) });

  for (const path of [...stateDocuments.keys()].sort()) {
    const touches = stateDocuments.get(path);

    // Bracketed subjects that name the document: the consistency check, once per machine.
    const byKey = new Map();
    for (const [sha, touch] of touches) {
      if (!touch.named || !touch.bracketed) continue;
      if (!byKey.has(touch.key)) byKey.set(touch.key, { machine: touch.machine, type: touch.type, shas: [] });
      byKey.get(touch.key).shas.push(sha);
    }
    for (const key of [...byKey.keys()].sort()) {
      const { machine, type, shas } = byKey.get(key);
      const transitionFindings = readOrReport(path, shas, () => dist.memory.verifyTransitionConsistency(root, path, machine));
      for (const finding of transitionFindings ?? []) {
        if (shas.includes(finding.sha)) stateFinding(finding.sha, describeTransitionFinding(finding, path, type));
      }
    }

    // Everything else is read from the frontmatter, before and after each commit.
    const fromFrontmatter = [...touches].filter(([, touch]) => !touch.named || (!touch.bracketed && BRACKETLESS_VERBS.has(touch.op)));
    if (fromFrontmatter.length === 0) continue;
    const reportable = fromFrontmatter.filter(([, touch]) => touch.named).map(([sha]) => sha);
    const transitions = readOrReport(path, reportable, () => dist.memory.reconstructMemoryTransitions(root, path, { strict: true }));
    for (const transition of transitions ?? []) {
      const touch = touches.get(transition.sha);
      if (touch === undefined) continue;
      const { fromState: from, toState: to } = transition;
      if (!touch.named) {
        // A document the subject does not name has no record of its own: what is wrong is only a
        // status the commit changed without recording it (`dl-103` §1, "each touched element").
        if (from !== to) stateFinding(transition.sha, `${path}: the subject does not name it, yet its status went ${from} → ${to}`);
      } else if (touch.op === 'assign') {
        if (from !== to) stateFinding(transition.sha, `${path}: 'assign' never changes status, yet it went ${from} → ${to}`);
      } else if (touch.op === 'add') {
        const initial = touch.machine?.sequence[0];
        if (initial !== undefined && to !== initial) stateFinding(transition.sha, `${path}: 'add' leaves it in the initial state '${initial}', not '${to}'`);
      } else if (touch.op === 'submit' && touch.machine && from !== null && to !== null && !dist.memory.isMachineEdge(touch.machine, from, to)) {
        stateFinding(transition.sha, `${path}: 'submit' moved it ${from} → ${to}, not an edge of the '${touch.type}' machine at this commit`);
      }
    }
  }

  // verb-edge: a document gone at HEAD still has its bracket compared with the frontmatter (bug-192).
  if (goneAtHead.length > 0) {
    const texts = readBlobTexts(root, goneAtHead.flatMap((entry) => [`${entry.parent ?? entry.sha + '^'}:${entry.path}`, `${entry.sha}:${entry.path}`]));
    goneAtHead.forEach((entry, index) => {
      const before = readFrontmatterFields(dist, texts[index * 2], `${entry.path}@${entry.parent}`);
      const after = readFrontmatterFields(dist, texts[index * 2 + 1], `${entry.path}@${entry.sha}`);
      if ((before && before.unreadable) || (after && after.unreadable)) {
        stateUnchecked.push({ sha: entry.sha, subject: subjects.get(entry.sha), reason: `${entry.path}: a revision's frontmatter does not parse` });
        return;
      }
      const derivedFrom = before?.status ?? null;
      const derivedTo = after?.status ?? null;
      const declaredFrom = entry.hops[0].from;
      const declaredTo = entry.hops[entry.hops.length - 1].to;
      if (declaredFrom !== derivedFrom || declaredTo !== derivedTo) {
        stateFinding(
          entry.sha,
          `${entry.path} (gone at HEAD): the bracket declares ${declaredFrom} → ${declaredTo}, the frontmatter went ${derivedFrom} → ${derivedTo}`,
          'verb-edge',
        );
      }
    });
  }

  // verb-edge: a hop across a reject edge cites the approver's reject commit (`dl-061` B.1).
  for (const { sha, hop, type } of rejectCrossings) {
    const tokens = [...new Set(bodies.get(sha).match(SHA_TOKEN_RE) ?? [])];
    const cited = tokens.some((token) => {
      try {
        const cite = git(root, ['log', '--no-show-signature', '-1', '--format=%s', `${token}^{commit}`, '--']).trim();
        return dist.memory.parseMemoryOperation(cite) === 'reject';
      } catch {
        return false;
      }
    });
    if (!cited) {
      stateFinding(sha, `${hop.from} → ${hop.to} is a reject edge of the '${type}' machine: the body must cite the approver's reject commit by sha (dl-061 B.1)`, 'verb-edge');
    }
  }

  // supersedes-pair: an approve into the superseding `waiting` state completes its pair (bug-218).
  if (approvals.length > 0) {
    const texts = readBlobTexts(root, approvals.map((entry) => `${entry.sha}:${entry.path}`));
    let headDocuments;
    approvals.forEach((entry, index) => {
      const approved = readFrontmatterFields(dist, texts[index], `${entry.path}@${entry.sha}`);
      if (!approved || approved.unreadable || approved.status === null) return;
      if (!dist.memory.supersedesEdgeFrom(entry.machine, approved.status)) return;
      const target = (approved.supersedes ?? '').trim();
      if (target === '') return;
      if (headDocuments === undefined) {
        const headMemoryYaml = readMemoryYaml(readBlobIds(root, [`${head}:${MEMORY_YAML}`])[0]);
        headDocuments = headMemoryYaml && headMemoryYaml.ok ? dist.memory.loadMemoryDocumentsAtRev(root, head, headMemoryYaml.value, { includeArchived: true }) : [];
      }
      const found = headDocuments.find((document) => document.frontmatter.id === target);
      const state = found && typeof found.frontmatter.status === 'string' ? found.frontmatter.status : null;
      if (state === dist.memory.SUPERSEDED_STATE) return;
      const approvedId = approved.id ?? basename(entry.path, '.md');
      stateFinding(
        entry.sha,
        `${entry.path}: approved into '${approved.status}' with supersedes: ${target}, but ${target} is ${state === null ? 'missing' : `'${state}'`} at HEAD, ` +
          `not '${dist.memory.SUPERSEDED_STATE}': complete the pair with \`wf(${entry.type}): finalize ${target} [${state ?? approved.status} → ${dist.memory.SUPERSEDED_STATE}]\`, ` +
          `Reason: superseded by ${approvedId} (its supersedes: field), approved in ${entry.sha}.`,
        'supersedes-pair',
      );
    });
  }

  // status-outside-wf: a commit that is no Memory operation changes no Memory status (dl-139 (a)).
  const changes = readFileChanges(root, range, otherCommits.map((commit) => commit.sha));
  const candidates = [];
  const otherMemoryOids = readBlobIds(root, otherCommits.map((commit) => `${commit.sha}:${MEMORY_YAML}`));
  otherCommits.forEach((commit, index) => {
    const memoryYaml = readMemoryYaml(otherMemoryOids[index]);
    if (!memoryYaml || !memoryYaml.ok) return;
    const roots = dist.memory.computeMemoryContentRoots(memoryYaml.value);
    const inRoots = (path) => path !== null && path.endsWith('.md') && roots.some((rootDir) => path.startsWith(`${rootDir}/`));
    for (const change of changes.get(commit.sha) ?? []) {
      if (change.to === null || !(inRoots(change.from) || inRoots(change.to))) continue;
      candidates.push({ commit, change, types: memoryYaml.value.types });
    }
  });
  if (candidates.length > 0) {
    const texts = readBlobTexts(
      root,
      candidates.flatMap(({ commit, change }) => [change.from === null || commit.parent === null ? '' : `${commit.parent}:${change.from}`, `${commit.sha}:${change.to}`]),
    );
    candidates.forEach(({ commit, change, types }, index) => {
      const before = change.from === null || commit.parent === null ? null : readFrontmatterFields(dist, texts[index * 2], change.from);
      const after = readFrontmatterFields(dist, texts[index * 2 + 1], change.to);
      if ((before && before.unreadable) || (after && after.unreadable)) return;
      const isMemory = (fields) => fields !== null && fields.type !== null && Object.prototype.hasOwnProperty.call(types, fields.type);
      if (!isMemory(before) && !isMemory(after)) return;
      const from = before?.status ?? null;
      const to = after?.status ?? null;
      if (from === to) return;
      stateFinding(
        commit.sha,
        `${change.to}: its status went ${from ?? '(none)'} → ${to ?? '(none)'} in a commit that is not a wf() Memory operation (dl-139)`,
        'status-outside-wf',
      );
    });
  }

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
      if (!order.has(sha)) order.set(sha, order.size);
      stateFinding(
        sha,
        `${path}: changed in ${base}..HEAD, but version: ${writtenOf(beforeText)} → ${writtenOf(afterText)} is no numeric increase (bug-249, doc-versioning)`,
        'config-version',
        'config',
      );
    });
  }

  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.sha}\0${finding.rule}\0${finding.message}`, finding);
  const sorted = [...unique.values()].sort(
    (a, b) =>
      order.get(a.sha) - order.get(b.sha) ||
      RULES.indexOf(a.rule) - RULES.indexOf(b.rule) ||
      (a.message < b.message ? -1 : a.message > b.message ? 1 : 0),
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
    stateUnchecked: stateUnchecked.sort((a, b) => order.get(a.sha) - order.get(b.sha)),
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
  const commitsWith = (findings) => new Set(findings.map((finding) => finding.sha)).size;
  lines.push(
    `gated: ${gated.length} findings on ${commitsWith(gated)} commits${gated.length ? ` (${countByRule(gated)})` : ''}`,
    `history: ${history.length} findings on ${commitsWith(history)} commits${history.length ? ` (${countByRule(history)})` : ''}`,
    `state not checked: ${report.stateUnchecked.length} entries on ${commitsWith(report.stateUnchecked)} commits ` +
      '(history with no machine, no named document, a document gone at HEAD, or a revision that does not parse)',
  );
  return lines.join('\n');
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

module.exports = { CHECKS, checkGovernance, exitCodeFor, formatReport };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

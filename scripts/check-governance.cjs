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

 * **Starting mode** (`dl-103` §1). A finding on a commit that is not the introduction commit nor one
 * of its ancestors is gated, and fails the check (exit 1). A finding on history — the introduction
 * commit and its ancestors — is reported and does not fail it (exit 0). The introduction commit is
 * the commit of `HEAD`'s first-parent line that added this file — on `main`, the merge that landed it
 * — unless `--introduced-at` names one.
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
const RULES = ['subject', 'bracket', 'body', 'authority', 'state'];

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
  const raw = git(root, ['log', '--reverse', '--format=%H%x00%P%x00%an%x00%ae%x00%s%x00%b%x00', ...range]);
  const fields = raw.split('\0');
  const commits = [];
  for (let index = 0; index + 6 <= fields.length; index += 6) {
    const [sha, parents, authorName, authorEmail, subject, body] = fields.slice(index, index + 6);
    commits.push({
      sha: sha.trim(),
      parent: parents.split(' ')[0] || null,
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
  const raw = git(root, ['log', '--no-renames', '--name-only', '--format=%x01%H', ...range]);
  const touched = new Map();
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('\u0001')) {
      current = [];
      touched.set(line.slice(1), current);
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
  const raw = git(root, ['-c', 'diff.renameLimit=0', 'log', '--reverse', '-M', '--diff-filter=R', '--name-status', '--format=', ...range]);
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
 * Check the `wf()` commits of `base..HEAD` (or of `HEAD`'s whole history) in the repository at `root`.
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
    const adding = git(root, ['log', '--first-parent', '--diff-filter=A', '--format=%H', 'HEAD', '--', SCRIPT_PATH])
      .trim()
      .split('\n')
      .filter(Boolean);
    introducedAt = adding.length === 0 ? null : adding[adding.length - 1];
  }
  const history = new Set(introducedAt === null ? [] : git(root, ['rev-list', introducedAt]).trim().split('\n'));

  const commits = readCommits(root, range).filter((commit) => commit.subject.startsWith('wf('));
  const memoryCommits = commits.filter((commit) => {
    const scope = WF_HEAD_RE.exec(commit.subject)?.[1];
    return scope === undefined || !dist.memory.CONFIGURATION_SCOPES.includes(scope);
  });
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
  const order = new Map(memoryCommits.map((commit, index) => [commit.sha, index]));
  /** headPath → sha → how that commit touched the document: { named, op, bracketed, machine, type, key } */
  const stateDocuments = new Map();

  memoryCommits.forEach((commit, index) => {
    const memoryOid = blobs[index * 2];
    const memoryYaml = readMemoryYaml(memoryOid);
    const dna = commit.parent === null ? null : readDnaYaml(blobs[index * 2 + 1]);
    const push = ({ rule, message }) => findings.push({ sha: commit.sha, subject: commit.subject, rule, message, gated: !history.has(commit.sha) });

    const { findings: subjectFindings, op, ids } = checkSubjectAndBracket(commit, memoryYaml, dist);
    subjectFindings.forEach(push);
    if (op !== null) checkBodyAndAuthority(commit, op, dna, dist).forEach(push);

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
    for (const path of (touched.get(commit.sha) ?? []).filter((candidate) => candidate.endsWith('.md'))) {
      const atHeadPath = renamed(path);
      documents.set(atHeadPath, documents.get(atHeadPath) === true || isNamed(path));
    }
    if (![...documents.values()].some(Boolean)) unchecked('no document it touches is named by its subject');
    for (const [path, isNamedDocument] of documents) {
      if (!atHead.has(path)) {
        if (isNamedDocument) unchecked(`${path} does not exist at HEAD`);
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

  const subjects = new Map(memoryCommits.map((commit) => [commit.sha, commit.subject]));
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
  const stateFinding = (sha, message) =>
    findings.push({ sha, subject: subjects.get(sha), rule: 'state', message, gated: !history.has(sha) });

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
    checked: memoryCommits.length,
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
      `(${report.gatedCommits} after the introduction commit ${report.introducedAt ?? '(none: every commit is gated)'})`,
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

module.exports = { checkGovernance, exitCodeFor, formatReport };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

/**
 * The `HEAD` snapshot workflow state deduction reads (task-198, task-203; `spec-017` §1.1–§1.3, §3.3,
 * §4.8), and the deduction at `HEAD` every workflow consumer calls.
 *
 * {@link readDeductionSnapshotAtHead} is the one impure step: it resolves `HEAD` once and reads every
 * input at that sha — the workflow registry with its core checks (`loadWorkflowRegistryAtRev`),
 * `memory.yaml`, `dna.yaml`, every Memory document in sorted path order (tolerant, task-171), the file
 * list, each open plan's start commit and what each instance's walk holds (phase records, step linkages,
 * re-entries) — plus, to **explain** and never to decide, the working-tree paths among the inputs that
 * differ from `HEAD` (`W_UNCOMMITTED_INPUTS`, §1.2; the `command-baseline` directive). The deduction
 * itself is the pure `deduceWorkflowState` (`src/workflow/deduce.ts`).
 *
 * History is read at the cost §4.8 states (REQ-PERF-03): **one** `git log` over the union of the open
 * instances' walks, bounded by the oldest start commit's parents, from which each instance's own walk is
 * cut in memory through the parent links; plus one lookup per element a re-entry in the walk names.
 *
 * git is read with `runGitRead` (stderr captured, `bug-093`) and the `git log` walk with
 * `walkGitLogFields` (NUL-framed, `bug-050`); every `git log` passes `--no-show-signature`, so a
 * `log.showSignature` setting cannot put signature text among the parsed lines (`bug-291`). No clock, no
 * randomness, nothing cached between calls.
 */
import { posix } from 'path';

import type { DnaYaml } from '../dna/schema';
import { parseBracketHops, parseMemoryOperation } from '../memory/audit';
import { walkGitLogFields } from '../memory/git-log';
import { computeMemoryContentRoots, loadMemoryDocumentsAtRev, type MemoryDocumentSummary } from '../memory/query';
import type { MemoryYaml } from '../memory/schema';
import { resolveStateMachine } from '../memory/state-machine';
import { runGitRead } from '../storage';
import type { Diagnostic } from '../validation';
import {
  deduceWorkflowState,
  OPEN_PLAN_STATUSES,
  PLAN_TYPE,
  resolveInstanceRef,
  type Deduction,
  type DeductionSnapshot,
  type InstanceDeduction,
  type InstanceHistory,
  type PhaseRecord,
  type Reentry,
  type StartCommit,
  type StepLink,
  type TransitionCommit,
  type WalkPosition,
} from '../workflow/deduce';
import { producesPath, type Workflow } from '../workflow/schema';

import { loadDnaYamlAtRev, loadMemoryYamlAtRev } from './loaders';
import { atHeadOr, listPathsAtCommit, resolveRevision } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';
import { loadWorkflowRegistryAtRev } from './workflow-registry';

/** The trailer that marks a phase record (`spec-003` § "Evidence"). */
const PHASE_TRAILER = 'WingFoil-Phase';
const RECORD_SUFFIX = ' completed';

/** A non-blank string frontmatter value, or `null`. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The marker that opens one commit of {@link readStarts}'s `git log` (a byte no path or sha holds). */
const COMMIT_MARK = String.fromCharCode(1);

/**
 * The start commit of each plan at `paths` (§3.3): the latest commit reachable from `sha` that **added**
 * the file at its current path (`--no-renames`, so a moved plan starts where it arrived). One
 * `git log --topo-order` over all of them: the commits come out in `git rev-list --topo-order` order,
 * so a start's position is the index of its commit among them (`0` the most recent).
 */
function readStarts(root: string, sha: string, paths: readonly string[]): Map<string, StartCommit> {
  const starts = new Map<string, StartCommit>();
  if (paths.length === 0) return starts;
  const args = ['-c', 'core.quotePath=false', 'log', '--topo-order', '--no-renames', '--diff-filter=A', '--name-only', '--format=%x01%H', sha, '--'];
  const wanted = new Set(paths);
  let commit = '';
  let position = -1;
  for (const line of runGitRead(root, [...args, ...paths.map((path) => `:(literal)${path}`)]).stdout.split('\n')) {
    if (line.startsWith(COMMIT_MARK)) {
      commit = line.slice(1);
      position += 1;
    } else if (wanted.has(line) && !starts.has(line)) {
      starts.set(line, { commit, position });
    }
  }
  return starts;
}

/** The value of each `key: value` line of a trailer block, by key (the last one wins), or `null`. */
function trailerValue(block: string, key: string): string | null {
  let found: string | null = null;
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1 && line.slice(0, colon).trim() === key) found = line.slice(colon + 1).trim();
  }
  return found;
}

/** The flag every `git log` here passes, so `log.showSignature` cannot print among parsed lines (`bug-291`). */
const NO_SIGNATURE = '--no-show-signature';

/** One commit of the history walk: its parents, subject and trailer block, at its walk position. */
interface WalkCommit extends WalkPosition {
  readonly parents: readonly string[];
  readonly subject: string;
  readonly trailers: string;
}

/**
 * The union of the open instances' walks (§4.8): one `git log --topo-order` of the commits reachable
 * from `sha` and not from the oldest start commit's parents, newest first, with each commit's parents,
 * subject and trailers. The oldest start has the largest topological position, so no other start is
 * reachable from its parents and every instance's walk lies inside this one.
 */
function readWalk(root: string, sha: string, starts: readonly StartCommit[]): WalkCommit[] {
  if (starts.length === 0) return [];
  const oldest = [...starts].sort((a, b) => b.position - a.position)[0]!.commit;
  const rows = walkGitLogFields(root, ['%H', '%P', '%s', '%(trailers:only,unfold)'], [], [NO_SIGNATURE, '--topo-order', sha, '--not', `${oldest}^@`]);
  // `walkGitLogFields` returns oldest first; the walk position counts from `HEAD`.
  return rows.reverse().map(([commit, parents, subject, trailers], position) => ({
    commit: commit!,
    position,
    parents: parents!.split(' ').filter((parent) => parent !== ''),
    subject: subject!,
    trailers: trailers!,
  }));
}

/**
 * The commits of one instance's walk (§4.8): those of the union walk not reachable from `start`'s
 * parents. Reachability is followed through the walk's own parent links: a commit on a path from a
 * parent of `start` down to a commit of the union walk is itself in the union walk, so nothing outside
 * it is needed.
 */
function instanceWalk(walk: readonly WalkCommit[], byCommit: ReadonlyMap<string, WalkCommit>, start: string): Set<string> {
  const excluded = new Set<string>();
  // Every start lies in the union walk: the oldest is not reachable from its own parents, and any other
  // start has a smaller topological position, so it is no ancestor of the oldest's parents.
  const pending = [...byCommit.get(start)!.parents];
  while (pending.length > 0) {
    const commit = pending.pop()!;
    const entry = byCommit.get(commit);
    if (entry === undefined || excluded.has(commit)) continue;
    excluded.add(commit);
    pending.push(...entry.parents);
  }
  return new Set(walk.filter((entry) => !excluded.has(entry.commit)).map((entry) => entry.commit));
}

/** The ids a `wf(<type>): <verb> <ids> [<bracket>]` subject names, in order. */
function subjectIds(subject: string): string[] {
  const rest = subject.replace(/^wf\([^)]*\):\s*\S+\s*/, '').replace(/\[[^[\]]*\]\s*$/, '');
  return rest
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/** The scope of a `wf(<scope>): …` subject — the Memory type of a Memory operation. */
function subjectType(subject: string): string {
  return /^wf\(([^)]*)\)/.exec(subject)![1]!;
}

/** What one walk commit says (§4.8): a record, linkages, re-entries and transitions, each possibly empty. */
interface CommitFacts {
  readonly record: PhaseRecord | null;
  readonly links: StepLink[];
  readonly reentries: Reentry[];
  readonly transitions: TransitionCommit[];
}

/**
 * Read one walk commit. A re-entry is a `reject` or `park` whose bracket ends at an earlier position of
 * the type's `sequence` than it starts from: a `bug` rejected `open → closed` moves forward, which
 * decides the phase rather than re-entering it (§5.2).
 */
function readFacts(entry: WalkCommit, memoryYaml: MemoryYaml | null): CommitFacts {
  const { commit, position, subject, trailers } = entry;
  const phase = trailerValue(trailers, PHASE_TRAILER);
  const instance = trailerValue(trailers, 'WingFoil-Instance');
  const record: PhaseRecord | null =
    phase !== null && phase.endsWith(RECORD_SUFFIX) && instance !== null
      ? {
          commit,
          position,
          phase: phase.slice(0, -RECORD_SUFFIX.length).trim(),
          instance,
          element: trailerValue(trailers, 'WingFoil-Element'),
          item: trailerValue(trailers, 'WingFoil-Item'),
        }
      : null;
  const facts: CommitFacts = { record, links: [], reentries: [], transitions: [] };
  const operation = parseMemoryOperation(subject);
  if (operation === null) return facts;
  const type = subjectType(subject);
  const ids = subjectIds(subject);
  const step = trailerValue(trailers, 'WingFoil-Step');
  if (operation === 'add' && instance !== null && step !== null) {
    for (const id of ids) facts.links.push({ commit, position, instance, step, type, id });
  }
  const hops = parseBracketHops(subject);
  if (hops === null) return facts;
  const from = hops[0]!.from;
  const to = hops[hops.length - 1]!.to;
  for (const id of ids) facts.transitions.push({ commit, position, type, id, to });
  if ((operation === 'reject' || operation === 'park') && memoryYaml !== null && Object.prototype.hasOwnProperty.call(memoryYaml.types, type)) {
    const sequence = resolveStateMachine(memoryYaml, type).sequence;
    const target = sequence.indexOf(to);
    if (target !== -1 && target < sequence.indexOf(from)) {
      for (const id of ids) facts.reentries.push({ commit, position, verb: operation, type, id, from, to });
    }
  }
  return facts;
}

/**
 * The latest commit of the walk that changed the file at `path` — one `git log -1` bounded like the
 * walk — or `null` when no commit of the walk did.
 */
function readLastChange(root: string, sha: string, oldest: string, path: string, byCommit: ReadonlyMap<string, WalkCommit>): WalkPosition | null {
  const out = runGitRead(root, ['log', NO_SIGNATURE, '--topo-order', '-1', '--format=%H', sha, '--not', `${oldest}^@`, '--', `:(literal)${path}`]).stdout.trim();
  const entry = byCommit.get(out);
  return entry === undefined ? null : { commit: entry.commit, position: entry.position };
}

/** What the history walk yields for the snapshot (§4.8). */
interface HistoryRead {
  readonly history: Map<string, InstanceHistory>;
  readonly transitions: TransitionCommit[];
  readonly lastChanges: Map<string, WalkPosition>;
}

/**
 * Read the history every open instance's deduction needs (§4.8): one walk for the union of the instances'
 * walks, each instance's records, linkages and re-entries cut from it, the transition commits naming a
 * re-entered element, and one lookup per re-entered element (its file's latest change in the walk).
 */
function readHistory(
  root: string,
  sha: string,
  starts: readonly StartCommit[],
  memoryYaml: MemoryYaml | null,
  documents: readonly MemoryDocumentSummary[],
): HistoryRead {
  const read: HistoryRead = { history: new Map(), transitions: [], lastChanges: new Map() };
  const walk = readWalk(root, sha, starts);
  if (walk.length === 0) return read;
  const byCommit = new Map(walk.map((entry) => [entry.commit, entry]));
  const facts = walk.map((entry) => readFacts(entry, memoryYaml));

  const reentered = new Set<string>();
  for (const start of [...new Set(starts.map((entry) => entry.commit))].sort()) {
    const members = instanceWalk(walk, byCommit, start);
    const inWalk = facts.filter((_, index) => members.has(walk[index]!.commit));
    const history: InstanceHistory = {
      records: inWalk.flatMap((fact) => (fact.record === null ? [] : [fact.record])),
      links: inWalk.flatMap((fact) => fact.links),
      reentries: inWalk.flatMap((fact) => fact.reentries),
    };
    for (const reentry of history.reentries) reentered.add(`${reentry.type}:${reentry.id}`);
    read.history.set(start, history);
  }
  if (reentered.size === 0) return read;

  read.transitions.push(...facts.flatMap((fact) => fact.transitions).filter((entry) => reentered.has(`${entry.type}:${entry.id}`)));
  const oldest = [...starts].sort((a, b) => b.position - a.position)[0]!.commit;
  for (const key of [...reentered].sort()) {
    const document = documents.find(({ frontmatter }) => `${text(frontmatter['type'])}:${text(frontmatter['id'])}` === key);
    if (document === undefined) continue;
    const last = readLastChange(root, sha, oldest, document.path, byCommit);
    if (last !== null) read.lastChanges.set(key, last);
  }
  return read;
}

/** The static directory (or file) a `produces` pattern names before its first token, or `null` for the whole tree. */
function staticPrefix(pattern: string): string | null {
  const brace = pattern.indexOf('{');
  if (brace === -1) return pattern;
  const slash = pattern.lastIndexOf('/', brace);
  return slash <= 0 ? null : pattern.slice(0, slash + 1);
}

/**
 * The working-tree paths among the deduction's inputs that differ from `HEAD` (§1.2): the Memory scan
 * roots, `.wingfoil/workflows.yaml` and `.wingfoil/workflows/`, every `produces` pattern's static part and
 * `paths.runs` — modified, staged, deleted or untracked, sorted.
 */
function readDirty(root: string, memoryYaml: MemoryYaml | null, dnaYaml: DnaYaml | null, workflows: readonly Workflow[]): string[] {
  const specs = new Set<string>(['.wingfoil/workflows.yaml', '.wingfoil/workflows/']);
  for (const dir of memoryYaml === null ? [] : computeMemoryContentRoots(memoryYaml)) specs.add(`${dir}/`);
  for (const workflow of workflows) {
    for (const phase of workflow.phases) {
      for (const entry of phase.produces ?? []) {
        const prefix = staticPrefix(producesPath(entry));
        if (prefix !== null) specs.add(prefix);
      }
    }
  }
  for (const dir of dnaYaml?.paths?.runs ?? []) specs.add(dir);
  const pathspecs = [...specs].sort().map((spec) => `:(literal)${spec}`);
  const status = runGitRead(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', ...pathspecs]).stdout;
  const dirty = status
    .split('\0')
    .filter((entry) => entry.length > 3)
    .map((entry) => entry.slice(3));
  return [...new Set(dirty)].sort();
}

/** The snapshot of a repository with nothing committed: no instance can be open. */
function emptySnapshot(): DeductionSnapshot {
  return {
    commit: '',
    workflows: [],
    workflowFiles: [],
    registryDiagnostics: [],
    memoryYaml: null,
    documents: [],
    scanDiagnostics: [],
    tree: [],
    starts: new Map(),
    history: new Map(),
    transitions: [],
    lastChanges: new Map(),
    dirty: [],
  };
}

/**
 * Read everything workflow state deduction needs, as `HEAD` holds it (`spec-017` §1.1), plus the
 * dirty input paths (§1.2). A repository with no commit gives an empty snapshot.
 *
 * @throws `DiagnosticsError` (`VALIDATION`, exit `1`) when the workflow registry has an error
 *   (`spec-017` §2); `StorageError` `E_GIT_READ_FAILED` when git cannot answer.
 */
export function readDeductionSnapshotAtHead(root: string): DeductionSnapshot {
  const sha = atHeadOr(root, () => resolveRevision(root, 'HEAD'), null);
  if (sha === null) return emptySnapshot();
  const registry = loadWorkflowRegistryAtRev(root, sha);
  const memoryYaml = loadMemoryYamlAtRev(root, sha);
  const dnaYaml = loadDnaYamlAtRev(root, sha);
  const scanDiagnostics: Diagnostic[] = [];
  const documents = memoryYaml === null ? [] : loadMemoryDocumentsAtRev(root, sha, memoryYaml, { onDiagnostic: (diagnostic) => scanDiagnostics.push(diagnostic) });

  // The plans that may be open instances (§3.2's status and `parent` rules; the workflow rule is the deduction's).
  const candidates = documents
    .filter(
      ({ frontmatter }) =>
        text(frontmatter['type']) === PLAN_TYPE && OPEN_PLAN_STATUSES.includes(text(frontmatter['status']) ?? '') && text(frontmatter['parent']) === null,
    )
    .map((document) => document.path);
  const starts = readStarts(root, sha, candidates);
  const { history, transitions, lastChanges } = readHistory(root, sha, [...starts.values()], memoryYaml, documents);

  return {
    commit: sha,
    workflows: registry.workflows,
    workflowFiles: (registry.manifest?.include ?? []).map((file) => posix.normalize(`.wingfoil/${file}`)),
    registryDiagnostics: registry.diagnostics,
    memoryYaml,
    documents,
    scanDiagnostics,
    tree: listPathsAtCommit(root, sha, '').sort(),
    starts,
    history,
    transitions,
    lastChanges,
    dirty: readDirty(root, memoryYaml, dnaYaml, registry.workflows),
  };
}

/**
 * Workflow state deduced at `HEAD` (`spec-017` §1–§4): {@link readDeductionSnapshotAtHead}, then the
 * pure `deduceWorkflowState`. The one function `workflow next|status|list`, the MCP Resources and
 * `agent execute --next` answer from.
 *
 * @throws as {@link readDeductionSnapshotAtHead}.
 */
export function deduceWorkflowStateAtHead(root: string): Deduction {
  return deduceWorkflowState(readDeductionSnapshotAtHead(root));
}

/**
 * The instance `ref` selects (`spec-017` §3.3): a workflow name — its most recently started open
 * instance — or an open instance id; without `ref`, the active instance (`null` when none is open).
 * A `ref` that names no open instance is `NOT_FOUND` `workflow is not open: <ref>` (§10).
 */
export function selectWorkflowInstance(deduction: Deduction, ref?: string): CoreResult<InstanceDeduction | null> {
  const found = resolveInstanceRef(deduction, ref);
  if (ref !== undefined && found === null) return coreErr({ code: 'NOT_FOUND', message: `workflow is not open: ${ref}`, details: { ref } });
  return coreOk(found);
}

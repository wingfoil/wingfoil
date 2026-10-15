/**
 * The `HEAD` snapshot workflow state deduction reads (task-198, task-203; `spec-017` §1.1–§1.3, §3.3,
 * §4.8), and the deduction at `HEAD` every workflow consumer calls.
 *
 * {@link readDeductionSnapshotAtHead} is the one impure step: it resolves `HEAD` once and reads every
 * input at that sha — the workflow registry with its core checks (`loadWorkflowRegistryAtCommit`),
 * `memory.yaml`, `dna.yaml`, every Memory document in sorted path order (tolerant, task-171), the file
 * list, each open plan's start commit and what each instance's walk holds (phase records, step linkages,
 * re-entries) — plus, to **explain** and never to decide, the working-tree paths among the inputs that
 * differ from `HEAD` (`W_UNCOMMITTED_INPUTS`, §1.2; the `command-baseline` directive). The deduction
 * itself is the pure `deduceWorkflowState` (`src/workflow/deduce.ts`).
 *
 * History is read at the cost §4.8 states (REQ-PERF-03): **one** `git log` over the union of the open
 * instances' walks, bounded by the parents of the starts' octopus merge base (one `git merge-base
 * --octopus`), from which each instance's own walk is cut in memory through the parent links; plus one
 * lookup per element a re-entry in the walk names, and one batched read (`git cat-file --batch`) of those
 * elements' files at the bracketless `add` / `submit` commits that name them (task-281, `bug-300`).
 *
 * git is read with `runGitRead` (stderr captured, `bug-093`) and the `git log` walk with
 * `walkGitLogFields` (NUL-framed, `bug-050`); every `git log` passes `--no-show-signature` and checks the
 * commit names it parses (`task-268`, `bug-291`), so a `log.showSignature` setting cannot put signature
 * text among the parsed lines; the `git merge-base` that bounds the walk takes no such flag, and its
 * output is checked the same way. No clock, no randomness, nothing cached between calls.
 */
import { posix } from 'path';

import { isRunLogPath, runLogDirPrefix } from '../agent/run-log';
import { resolveDnaPath } from '../dna/path';
import type { DnaYaml } from '../dna/schema';
import { parseBracketHops, parseMemoryOperation } from '../memory/audit';
import { walkGitLogFields } from '../memory/git-log';
import { computeMemoryContentRoots, loadMemoryDocumentsAtCommit, type MemoryDocumentSummary } from '../memory/query';
import type { MemoryYaml } from '../memory/schema';
import { resolveStateMachine } from '../memory/state-machine';
import { readRevisionPaths, requireCommitName, runGitRead, splitFrontmatter } from '../storage';
import { parseYaml, type Diagnostic } from '../validation';
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
import type { BindingsYaml, CollectionEntry } from '../workflow/bindings';
import { producesPath, type Workflow } from '../workflow/schema';

import { DIRECTIVES_DIR_PATH, DNA_YAML_PATH, loadDnaYamlAtCommit, loadMemoryYamlAtCommit, MEMORY_YAML_PATH, ROLES_YAML_PATH } from './loaders';
import { atHeadOr, listPathsAtCommit, resolveRevision } from './revision';
import { coreErr, coreOk, type CoreResult } from './types';
import { loadWorkflowRegistryAtCommit } from './workflow-registry';

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
  const args = ['-c', 'core.quotePath=false', 'log', '--no-show-signature', '--topo-order', '--no-renames', '--diff-filter=A', '--name-only', '--format=%x01%H', sha, '--'];
  const wanted = new Set(paths);
  let commit = '';
  let position = -1;
  for (const line of runGitRead(root, [...args, ...paths.map((path) => `:(literal)${path}`)]).stdout.split('\n')) {
    if (line.startsWith(COMMIT_MARK)) {
      commit = requireCommitName(line.slice(1), 'git log --diff-filter=A');
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

/** One commit of the history walk: its parents, subject and trailer block, at its walk position. */
interface WalkCommit extends WalkPosition {
  readonly parents: readonly string[];
  readonly subject: string;
  readonly trailers: string;
}

/**
 * The walk's lower bound (§4.8, review F3 ruling (a)): `^@` of the octopus merge base of every start
 * commit, or none when the starts share no ancestor (unrelated histories; `git merge-base` exits 1). The
 * base is an ancestor of (or equal to) each start, so whatever its parents reach is reachable from every
 * start's parents: outside every instance's walk. A commit some instance's walk holds is therefore never
 * cut off, as it could be by the oldest start alone in a branching history. `merge-base` prints a commit
 * name and takes no `--no-show-signature` (git refuses the option; `log.showSignature` does not apply to
 * it); its output is refused unless it is a commit name (`requireCommitName`, task-268).
 */
function readWalkBound(root: string, starts: readonly StartCommit[]): string[] {
  const commits = [...new Set(starts.map((entry) => entry.commit))].sort();
  const run = runGitRead(root, ['merge-base', '--octopus', ...commits], { accepted: [0, 1] });
  if (run.status === 1) return [];
  const base = requireCommitName(run.stdout.trim(), 'git merge-base --octopus');
  return ['--not', `${base}^@`];
}

/**
 * The union of the open instances' walks (§4.8): one `git log --topo-order` of the commits reachable
 * from `sha` and not from `bound` (`readWalkBound`), newest first, with each commit's parents, subject
 * and trailers. Every instance's walk lies inside this one.
 */
function readWalk(root: string, sha: string, bound: readonly string[]): WalkCommit[] {
  const rows = walkGitLogFields(root, ['%H', '%P', '%s', '%(trailers:only,unfold)'], [], ['--topo-order', sha, ...bound]);
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
  // Every start lies in the union walk: it descends from (or is) the merge base, so it is not reachable
  // from the base's parents.
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

/**
 * A Memory operation with no bracket naming an element — `add` or `submit`, which `memory add` and
 * `memory submit` write without one (task-281, `bug-300`): the status it left is read from the element's
 * file at that commit, for a re-entered element only (§4.8).
 */
interface BracketlessCommit extends WalkPosition {
  readonly type: string;
  readonly id: string;
}

/** The verbs whose subject carries no bracket (`spec-008` §2): `add` and `submit`. */
const BRACKETLESS_VERBS: readonly string[] = ['add', 'submit'];

/** What one walk commit says (§4.8): a record, linkages, re-entries and transitions, each possibly empty. */
interface CommitFacts {
  readonly record: PhaseRecord | null;
  readonly links: StepLink[];
  readonly reentries: Reentry[];
  readonly transitions: TransitionCommit[];
  readonly bracketless: BracketlessCommit[];
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
  const facts: CommitFacts = { record, links: [], reentries: [], transitions: [], bracketless: [] };
  const operation = parseMemoryOperation(subject);
  if (operation === null) return facts;
  const type = subjectType(subject);
  const ids = subjectIds(subject);
  const step = trailerValue(trailers, 'WingFoil-Step');
  if (operation === 'add' && instance !== null && step !== null) {
    for (const id of ids) facts.links.push({ commit, position, instance, step, type, id });
  }
  const hops = parseBracketHops(subject);
  if (hops === null) {
    if (BRACKETLESS_VERBS.includes(operation)) for (const id of ids) facts.bracketless.push({ commit, position, type, id });
    return facts;
  }
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
function readLastChange(root: string, sha: string, bound: readonly string[], path: string, byCommit: ReadonlyMap<string, WalkCommit>): WalkPosition | null {
  const out = runGitRead(root, ['log', '--no-show-signature', '--topo-order', '-1', '--format=%H', sha, ...bound, '--', `:(literal)${path}`]).stdout.trim();
  if (out === '') return null;
  const entry = byCommit.get(requireCommitName(out, 'git log -1'));
  return entry === undefined ? null : { commit: entry.commit, position: entry.position };
}

/** What the history walk yields for the snapshot (§4.8). */
interface HistoryRead {
  readonly history: Map<string, InstanceHistory>;
  readonly transitions: TransitionCommit[];
  readonly lastChanges: Map<string, WalkPosition>;
  readonly parents: Map<string, readonly string[]>;
}

/**
 * Read the history every open instance's deduction needs (§4.8): one walk for the union of the instances'
 * walks, each instance's records, linkages and re-entries cut from it, the transition commits naming a
 * re-entered element (a bracketless `add` / `submit` through the status its file holds there, one batched
 * read), the walk's parent links, and one lookup per re-entered element (its file's latest change in the
 * walk). With no start, nothing is read.
 */
function readHistory(
  root: string,
  sha: string,
  starts: readonly StartCommit[],
  memoryYaml: MemoryYaml | null,
  documents: readonly MemoryDocumentSummary[],
): HistoryRead {
  const read: HistoryRead = { history: new Map(), transitions: [], lastChanges: new Map(), parents: new Map() };
  if (starts.length === 0) return read;
  const bound = readWalkBound(root, starts);
  const walk = readWalk(root, sha, bound);
  const byCommit = new Map(walk.map((entry) => [entry.commit, entry]));
  for (const entry of walk) read.parents.set(entry.commit, entry.parents);
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

  const pathOf = new Map<string, string>();
  for (const key of [...reentered].sort()) {
    const document = documents.find(({ frontmatter }) => `${text(frontmatter['type'])}:${text(frontmatter['id'])}` === key);
    if (document !== undefined) pathOf.set(key, document.path);
  }
  const statuses = readBracketlessStatuses(root, facts.flatMap((fact) => fact.bracketless), pathOf);
  // In walk order (newest first): a bracketed transition as its bracket says, a bracketless `add` / `submit`
  // as the file it names holds at that commit (task-281, `bug-300`).
  for (const fact of facts) {
    read.transitions.push(...fact.transitions.filter((entry) => reentered.has(`${entry.type}:${entry.id}`)));
    for (const entry of fact.bracketless) {
      const to = statuses.get(`${entry.commit} ${entry.type}:${entry.id}`);
      if (to !== undefined) read.transitions.push({ commit: entry.commit, position: entry.position, type: entry.type, id: entry.id, to });
    }
  }
  for (const key of [...reentered].sort()) {
    const document = documents.find(({ frontmatter }) => `${text(frontmatter['type'])}:${text(frontmatter['id'])}` === key);
    if (document === undefined) continue;
    const last = readLastChange(root, sha, bound, document.path, byCommit);
    if (last !== null) read.lastChanges.set(key, last);
  }
  return read;
}

/**
 * The `status` each bracketless `add` / `submit` of a re-entered element left in that element's file
 * (§4.8, task-281, `bug-300`), by `<commit> <type>:<id>`: one `git cat-file --batch` for all of them, the
 * file read at its path at `HEAD` (`pathOf`). A commit whose tree does not hold that path, or whose
 * frontmatter does not parse or has no `status`, gives no entry — the subject is then not counted.
 */
function readBracketlessStatuses(root: string, entries: readonly BracketlessCommit[], pathOf: ReadonlyMap<string, string>): Map<string, string> {
  const requests = entries.flatMap((entry) => {
    const path = pathOf.get(`${entry.type}:${entry.id}`);
    return path === undefined ? [] : [{ key: `${entry.commit} ${entry.type}:${entry.id}`, rev: entry.commit, path }];
  });
  const statuses = new Map<string, string>();
  if (requests.length === 0) return statuses;
  const contents = readRevisionPaths(root, requests);
  requests.forEach((request, index) => {
    const status = frontmatterStatus(contents[index]!, `${request.rev}:${request.path}`);
    if (status !== null) statuses.set(request.key, status);
  });
  return statuses;
}

/** The frontmatter `status` of a document's bytes, or `null` (absent, no frontmatter, unparsable, no string status). */
function frontmatterStatus(raw: string | null, label: string): string | null {
  if (raw === null) return null;
  const { frontmatter } = splitFrontmatter(raw);
  if (frontmatter === null) return null;
  try {
    const data = parseYaml(frontmatter, label) as Record<string, unknown> | null;
    return text(data?.['status']);
  } catch {
    return null;
  }
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
 * roots, the configuration files §1.1 reads at `HEAD` — `.wingfoil/workflows.yaml` and
 * `.wingfoil/workflows/`, `memory.yaml`, `dna.yaml`, `roles.yaml` and `.wingfoil/directives/` (task-281,
 * `bug-301`, approver ruling D2) — every `produces` pattern's static part and `paths.runs`; modified,
 * staged, deleted or untracked, sorted.
 */
function readDirty(root: string, memoryYaml: MemoryYaml | null, dnaYaml: DnaYaml | null, workflows: readonly Workflow[]): string[] {
  const specs = new Set<string>(['.wingfoil/workflows.yaml', '.wingfoil/workflows/', MEMORY_YAML_PATH, DNA_YAML_PATH, ROLES_YAML_PATH, `${DIRECTIVES_DIR_PATH}/`]);
  for (const dir of memoryYaml === null ? [] : computeMemoryContentRoots(memoryYaml)) specs.add(`${dir}/`);
  for (const workflow of workflows) {
    for (const phase of workflow.phases) {
      for (const entry of phase.produces ?? []) {
        const prefix = staticPrefix(producesPath(entry));
        if (prefix !== null) specs.add(prefix);
      }
    }
  }
  const runLogs = (dnaYaml?.paths?.runs ?? []).flatMap((dir) => readDirtyRunLogs(root, dir));
  return [...new Set([...readDirtyPaths(root, [...specs]), ...runLogs])].sort();
}

/**
 * The run logs of the directory `dir` (`paths.runs`) that differ from `HEAD`: only the `.jsonl` files
 * directly inside it, the files a run-log reader reads (`isRunLogPath`, `spec-016` §4.1). A dirty README
 * there, or a nested file, is no deduction input and no `agent list` input, so it is not reported
 * (task-240 review F5). Sorted.
 *
 * @throws `StorageError` when git cannot answer.
 */
export function readDirtyRunLogs(root: string, dir: string): string[] {
  const prefix = runLogDirPrefix(root, dir);
  return readDirtyPaths(root, [dir]).filter((path) => isRunLogPath(prefix, path));
}

/**
 * The working-tree paths under `specs` (literal pathspecs: files or directories ending in `/`) that differ
 * from `HEAD` — modified, staged, deleted or untracked — sorted, each once (`spec-017` §1.2). The deduction's
 * input check, and `agent list --past`'s for the run log when no deduction runs (`spec-016` §5, task-240).
 *
 * @throws `StorageError` when git cannot answer.
 */
export function readDirtyPaths(root: string, specs: readonly string[]): string[] {
  const pathspecs = [...new Set(specs)].sort().map((spec) => `:(literal)${spec}`);
  const status = runGitRead(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', ...pathspecs]).stdout;
  const dirty = status
    .split('\0')
    .filter((entry) => entry.length > 3)
    .map((entry) => entry.slice(3));
  return [...new Set(dirty)].sort();
}

/**
 * The entries of every collection a loaded workflow iterates over (`spec-003` § "Collections", `dl-104`
 * D2 (b)), by reference in byte order: `dna:<path>` from `dna.yaml` (the `spec-008` §9 path syntax),
 * `bindings:<name>` from `workflows/bindings.yaml`'s `collections`, both at the snapshot's commit. A
 * `dna:` reference with no `dna.yaml` is left out: it has no candidates.
 */
function readCollections(workflows: readonly Workflow[], dnaYaml: DnaYaml | null, bindings: BindingsYaml | null): Map<string, readonly CollectionEntry[]> {
  const references = new Set<string>();
  for (const workflow of workflows) {
    for (const phase of workflow.phases) {
      if (phase.iterate_over !== undefined && /^(dna|bindings):/.test(phase.iterate_over)) references.add(phase.iterate_over);
    }
  }
  const collections = new Map<string, readonly CollectionEntry[]>();
  for (const reference of [...references].sort()) {
    // Every reference resolves to a list here: the registry refuses one that does not
    // (`E_WORKFLOW_COLLECTION_UNRESOLVED`), except a `dna:` reference without `dna.yaml`, which is undecided
    // there and has no candidates here.
    if (reference.startsWith('bindings:')) {
      collections.set(reference, bindings!.collections![reference.slice('bindings:'.length)]!);
    } else if (dnaYaml !== null) {
      collections.set(reference, (resolveDnaPath(dnaYaml, reference.slice('dna:'.length)) as { target: { value: CollectionEntry[] } }).target.value);
    }
  }
  return collections;
}

/** `read`, called at most once: later calls answer the first call's value. */
function once<T>(read: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = read();
      done = true;
    }
    return value;
  };
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
    parents: new Map(),
    dirty: [],
    collections: new Map(),
    bindings: null,
    dnaYaml: null,
  };
}

/** Whether a document's frontmatter is a plan of the instance kind (§3.1): type `plan`, `parent` empty. */
function isInstancePlan(frontmatter: Readonly<Record<string, unknown>>): boolean {
  return text(frontmatter['type']) === PLAN_TYPE && text(frontmatter['parent']) === null;
}

/**
 * The ids of the instance plans among `documents` (§3.1: type `plan`, `parent` empty), in any status, in
 * document order — what a `<ref>` may name besides a loaded workflow (§10, task-281, `bug-326`).
 */
export function instancePlanIds(documents: readonly MemoryDocumentSummary[]): string[] {
  return documents.flatMap(({ frontmatter }) => {
    const id = text(frontmatter['id']);
    return isInstancePlan(frontmatter) && id !== null ? [id] : [];
  });
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
  // `HEAD` is resolved once, above, and every pillar is read at that sha (task-283, `bug-309`): no loader
  // resolves it again, and `memory.yaml` / `dna.yaml` are read and parsed once, for the registry's core
  // checks and for the snapshot alike, in the order the registry reads them.
  const memoryYamlOnce = once(() => loadMemoryYamlAtCommit(root, sha));
  const dnaYamlOnce = once(() => loadDnaYamlAtCommit(root, sha));
  const registry = loadWorkflowRegistryAtCommit(root, sha, undefined, { memoryYaml: memoryYamlOnce, dnaYaml: dnaYamlOnce });
  const memoryYaml = memoryYamlOnce();
  const dnaYaml = dnaYamlOnce();
  const scanDiagnostics: Diagnostic[] = [];
  // The whole scan keeps archived documents: an archived bound element abandons its instance (§4.11), and
  // the deduction keeps them out of every selection and iteration itself.
  const documents = memoryYaml === null ? [] : loadMemoryDocumentsAtCommit(root, sha, memoryYaml, { onDiagnostic: (diagnostic) => scanDiagnostics.push(diagnostic) });

  // The plans that may be open instances (§3.2's status and `parent` rules; the workflow rule is the deduction's).
  const candidates = documents
    .filter(({ frontmatter }) => isInstancePlan(frontmatter) && OPEN_PLAN_STATUSES.includes(text(frontmatter['status']) ?? ''))
    .map((document) => document.path);
  const starts = readStarts(root, sha, candidates);
  const { history, transitions, lastChanges, parents } = readHistory(root, sha, [...starts.values()], memoryYaml, documents);

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
    parents,
    dirty: readDirty(root, memoryYaml, dnaYaml, registry.workflows),
    collections: readCollections(registry.workflows, dnaYaml, registry.bindings),
    bindings: registry.bindings,
    dnaYaml,
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

/**
 * The `HEAD` snapshot workflow state deduction reads (task-198, `spec-017` §1.1–§1.3, §3.3, §4.8), and
 * the deduction at `HEAD` every workflow consumer calls.
 *
 * {@link readDeductionSnapshotAtHead} is the one impure step: it resolves `HEAD` once and reads every
 * input at that sha — the workflow registry with its core checks (`loadWorkflowRegistryAtRev`),
 * `memory.yaml`, `dna.yaml`, every Memory document in sorted path order (tolerant, task-171), the file
 * list, each open plan's start commit and the phase records of its walk — plus, to **explain** and never
 * to decide, the working-tree paths among the inputs that differ from `HEAD` (`W_UNCOMMITTED_INPUTS`,
 * §1.2; the `command-baseline` directive). The deduction itself is the pure
 * `deduceWorkflowState` (`src/workflow/deduce.ts`).
 *
 * git is read with `runGitRead` (stderr captured, `bug-093`) and the `git log` walk with
 * `walkGitLogFields` (NUL-framed, `bug-050`). No clock, no randomness, nothing cached between calls.
 */
import { posix } from 'path';

import { resolveDnaPath } from '../dna/path';
import type { DnaYaml } from '../dna/schema';
import { walkGitLogFields } from '../memory/git-log';
import { computeMemoryContentRoots, loadMemoryDocumentsAtRev } from '../memory/query';
import type { MemoryYaml } from '../memory/schema';
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
  type PhaseRecord,
  type StartCommit,
} from '../workflow/deduce';
import type { BindingsYaml, CollectionEntry } from '../workflow/bindings';
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

/**
 * The phase records each start commit's walk holds (§4.8): commits reachable from `sha` and not from
 * the start commit's parents whose trailers carry `WingFoil-Phase: <w>.<p> completed` and
 * `WingFoil-Instance`. One `git log` finds the candidates; one `rev-list` per start commit bounds them,
 * only when a candidate exists. Linkage and re-entries, and the single union walk, are task-203's.
 */
function readRecords(root: string, sha: string, starts: readonly StartCommit[]): Map<string, PhaseRecord[]> {
  const byStart = new Map<string, PhaseRecord[]>();
  if (starts.length === 0) return byStart;
  // Bounded by the oldest start (the largest position): no walk reaches past its parents.
  const oldest = [...starts].sort((a, b) => b.position - a.position)[0]!.commit;
  const candidates: PhaseRecord[] = [];
  const range = ['-E', `--grep=^${PHASE_TRAILER}: `, sha, '--not', `${oldest}^@`];
  for (const [commit, block] of walkGitLogFields(root, ['%H', '%(trailers:only,unfold)'], [], range)) {
    const phase = trailerValue(block!, PHASE_TRAILER);
    const instance = trailerValue(block!, 'WingFoil-Instance');
    if (phase === null || !phase.endsWith(RECORD_SUFFIX) || instance === null) continue;
    candidates.push({
      commit: commit!,
      phase: phase.slice(0, -RECORD_SUFFIX.length).trim(),
      instance,
      element: trailerValue(block!, 'WingFoil-Element'),
      item: trailerValue(block!, 'WingFoil-Item'),
    });
  }
  if (candidates.length === 0) return byStart;
  for (const start of [...new Set(starts.map((entry) => entry.commit))].sort()) {
    const walk = new Set(runGitRead(root, ['rev-list', sha, '--not', `${start}^@`]).stdout.split('\n'));
    byStart.set(
      start,
      candidates.filter((record) => walk.has(record.commit)),
    );
  }
  return byStart;
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
    records: new Map(),
    dirty: [],
    collections: new Map(),
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
  // The whole scan keeps archived documents: an archived bound element abandons its instance (§4.11), and
  // the deduction keeps them out of every selection and iteration itself.
  const documents = memoryYaml === null ? [] : loadMemoryDocumentsAtRev(root, sha, memoryYaml, { onDiagnostic: (diagnostic) => scanDiagnostics.push(diagnostic) });

  // The plans that may be open instances (§3.2's status and `parent` rules; the workflow rule is the deduction's).
  const candidates = documents
    .filter(
      ({ frontmatter }) =>
        text(frontmatter['type']) === PLAN_TYPE && OPEN_PLAN_STATUSES.includes(text(frontmatter['status']) ?? '') && text(frontmatter['parent']) === null,
    )
    .map((document) => document.path);
  const starts = readStarts(root, sha, candidates);

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
    records: readRecords(root, sha, [...starts.values()]),
    dirty: readDirty(root, memoryYaml, dnaYaml, registry.workflows),
    collections: readCollections(registry.workflows, dnaYaml, registry.bindings),
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

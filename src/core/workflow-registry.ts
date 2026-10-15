/**
 * The workflow registry every workflow command reads (task-194, `spec-017` §2): the loader's result
 * (`spec-003` Layers 1–3 and its loader rows, `./loaders.ts`) **plus** the core checks
 * (`./workflow-core-checks.ts`), which also need `memory.yaml` and `dna.yaml`. One function per
 * baseline, each reading every input from that one baseline:
 *
 * - {@link loadWorkflowRegistryAtRev} / {@link loadWorkflowRegistryAtHead} — the committed baseline
 *   `spec-017` §1.1 gives every workflow operation (`HEAD`): the workflow files, `bindings.yaml`,
 *   `memory.yaml`, `dna.yaml` and the Memory templates are all read at one commit, resolved once;
 * - {@link loadWorkflowRegistry} — the working tree. No workflow command reads it since task-204 moved
 *   `workflow list` to `HEAD` (ruling R15); it stays for callers that read the working tree on purpose.
 *
 * The result has the loader's shape — `{ manifest, workflows, bindings, diagnostics }` — with the core
 * warnings appended after the loader's. A core **error** makes the load throw a `DiagnosticsError`
 * (`VALIDATION`, exit `1`) carrying the whole ordered array, exactly as a loader error does; the first
 * error is the reason. The core checks run only on a registry the loader accepted.
 */
import { existsSync } from 'fs';
import { join, posix } from 'path';

import type { DnaYaml } from '../dna/schema';
import type { MemoryYaml } from '../memory/schema';
import { extractFrontmatter, readDocument, readPathsAtRev } from '../storage';
import { DiagnosticsError, parseYaml } from '../validation';

import {
  ConfigFileMissingError,
  loadDnaYaml,
  loadDnaYamlAtCommit,
  loadMemoryYaml,
  loadMemoryYamlAtCommit,
  loadWorkflowsYaml,
  loadWorkflowsYamlAtCommit,
  type WorkflowsLoadResult,
} from './loaders';
import { atHeadOr, resolveRevision } from './revision';
import { workflowCoreDiagnostics } from './workflow-core-checks';

/** An absent manifest: an empty registry, with no diagnostic (`spec-003` Layer 1). */
const EMPTY_REGISTRY: WorkflowsLoadResult = { manifest: null, workflows: [], bindings: null, diagnostics: [] };

/** Where the other pillars' inputs come from: the same baseline the workflow files were read from. */
interface PillarSource {
  memoryYaml(): MemoryYaml | null;
  dnaYaml(): DnaYaml | null;
  /**
   * Files under `.wingfoil/`, by their paths relative to it, each `null` when absent, in input order. A
   * commit reads them in one batch (task-283, `bug-309`: the Memory templates, one `git cat-file --batch`
   * instead of one `git show` each).
   */
  configFiles(relatives: readonly string[]): (string | null)[];
}

/**
 * The `memory.yaml` and `dna.yaml` a caller has already loaded at the registry's commit, handed to the
 * core checks so that one snapshot reads and parses each once (task-283, `bug-309`). Each is called at
 * most once, at the point the checks would have read the file, so the order of reads and errors is the
 * one {@link loadWorkflowRegistryAtRev} has.
 */
export interface RegistryPillars {
  /** `memory.yaml` at the registry's commit, `null` when that commit does not hold it. */
  readonly memoryYaml: () => MemoryYaml | null;
  /** `dna.yaml` at the registry's commit, `null` when that commit does not hold it. */
  readonly dnaYaml: () => DnaYaml | null;
}

/** The template files `memoryYaml` declares, as paths relative to `.wingfoil/`, sorted, each once. */
function declaredTemplateFiles(memoryYaml: MemoryYaml | null): string[] {
  const files = Object.values(memoryYaml?.types ?? {}).flatMap((type) => (type.template?.file === undefined ? [] : [type.template.file]));
  return [...new Set(files)].sort();
}

/** `.wingfoil/<relative>` as a repository-relative POSIX path, or `null` when it leaves `.wingfoil/`. */
function configPath(relative: string): string | null {
  const normalized = posix.normalize(`.wingfoil/${relative}`);
  return normalized.startsWith('.wingfoil/') ? normalized : null;
}

/** The frontmatter keys of a Memory template, or `null` when it has none that parses as a map. */
function frontmatterKeys(raw: string, label: string): ReadonlySet<string> | null {
  const text = extractFrontmatter(raw);
  if (text === null) return null;
  try {
    const data = parseYaml(text, label);
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? new Set(Object.keys(data)) : null;
  } catch {
    return null;
  }
}

/** Run the core checks on an accepted load, append them, and throw when one is an error. */
function withCoreChecks(load: WorkflowsLoadResult, source: PillarSource): WorkflowsLoadResult {
  if (load.manifest === null) return load;
  const memoryYaml = source.memoryYaml();
  const dnaYaml = source.dnaYaml();
  // Every template `memory.yaml` declares, read up front in one call (one batch at a commit).
  const files = declaredTemplateFiles(memoryYaml);
  const templates = new Map(source.configFiles(files).map((raw, index) => [files[index]!, raw]));
  const fieldsByType = new Map<string, ReadonlySet<string> | null>();
  const templateFields = (type: string): ReadonlySet<string> | null => {
    if (!fieldsByType.has(type)) {
      const file = memoryYaml?.types[type]?.template?.file;
      const raw = file === undefined ? null : templates.get(file)!;
      fieldsByType.set(type, raw === null ? null : frontmatterKeys(raw, `.wingfoil/${file}`));
    }
    return fieldsByType.get(type)!;
  };
  const core = workflowCoreDiagnostics(
    { include: load.manifest.include, workflows: load.workflows, bindings: load.bindings },
    { memoryYaml, dnaYaml, templateFields },
  );
  const diagnostics = [...load.diagnostics, ...core];
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) throw new DiagnosticsError(diagnostics);
  return { ...load, diagnostics };
}

/** A working-tree config read: `null` when the file is absent, a throw when it is invalid. */
function absentAsNull<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof ConfigFileMissingError) return null;
    throw error;
  }
}

/**
 * The workflow registry from the **working tree**: the loader's result and the core checks, every
 * input read from disk. `workflow list` read it until task-204 moved that command to `HEAD`.
 *
 * @throws `DiagnosticsError` (`VALIDATION`) when the loader or a core check reports an error.
 */
export function loadWorkflowRegistry(root: string): WorkflowsLoadResult {
  return withCoreChecks(loadWorkflowsYaml(root), {
    memoryYaml: () => absentAsNull(() => loadMemoryYaml(root)),
    dnaYaml: () => absentAsNull(() => loadDnaYaml(root)),
    configFiles: (relatives) =>
      relatives.map((relative) => {
        const path = configPath(relative);
        if (path === null) return null;
        const full = join(root, path);
        return existsSync(full) ? readDocument(full) : null;
      }),
  });
}

/**
 * The workflow registry **as commit `rev` holds it** (`spec-017` §1.1): `rev` is resolved once, and the
 * workflow files, `bindings.yaml`, `memory.yaml`, `dna.yaml` and the Memory templates are all read at
 * that commit, so a dirty working tree changes nothing (the `command-baseline` directive).
 *
 * @param overlay - Workflow files (the manifest, an included file) that replace the commit's own, keyed by
 *   repository-relative path, `null` for absent: the registry a commit about to be made would leave
 *   (`workflow create` / `remove`, task-211). `memory.yaml`, `dna.yaml` and the templates stay the commit's.
 * @throws `RevisionError` for a malformed rev or one naming no commit; `DiagnosticsError`
 *   (`VALIDATION`) when the loader or a core check reports an error.
 */
export function loadWorkflowRegistryAtRev(root: string, rev: string, overlay?: ReadonlyMap<string, string | null>): WorkflowsLoadResult {
  return loadWorkflowRegistryAtCommit(root, resolveRevision(root, rev), overlay);
}

/**
 * {@link loadWorkflowRegistryAtRev} for a `sha` already resolved to a commit, read without resolving it
 * again (task-283, `bug-309`): the workflow deduction's snapshot resolves `HEAD` once and reads every
 * pillar at that sha. The Memory templates the core checks read are fetched in one batch.
 *
 * @param sha - The full sha of a commit, as `resolveRevision` returned it.
 * @param overlay - As {@link loadWorkflowRegistryAtRev}'s.
 * @param pillars - `memory.yaml` and `dna.yaml` as the caller already loads them at `sha`
 *   ({@link RegistryPillars}); absent, the checks load them at `sha` themselves.
 * @throws `DiagnosticsError` (`VALIDATION`) when the loader or a core check reports an error.
 */
export function loadWorkflowRegistryAtCommit(
  root: string,
  sha: string,
  overlay?: ReadonlyMap<string, string | null>,
  pillars?: RegistryPillars,
): WorkflowsLoadResult {
  return withCoreChecks(loadWorkflowsYamlAtCommit(root, sha, overlay), {
    memoryYaml: pillars?.memoryYaml ?? (() => loadMemoryYamlAtCommit(root, sha)),
    dnaYaml: pillars?.dnaYaml ?? (() => loadDnaYamlAtCommit(root, sha)),
    configFiles: (relatives) => {
      const paths = relatives.map(configPath);
      const inside = paths.filter((path): path is string => path !== null);
      const answers = new Map(readPathsAtRev(root, sha, inside).map((raw, index) => [inside[index]!, raw as string | null]));
      return paths.map((path) => (path === null ? null : answers.get(path)!));
    },
  });
}

/**
 * {@link loadWorkflowRegistryAtRev} at `HEAD`; a repository with no commit yet (or no repository)
 * holds no committed manifest, so its registry is empty.
 */
export function loadWorkflowRegistryAtHead(root: string): WorkflowsLoadResult {
  return atHeadOr(root, () => loadWorkflowRegistryAtRev(root, 'HEAD'), EMPTY_REGISTRY);
}

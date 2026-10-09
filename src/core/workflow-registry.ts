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
import { extractFrontmatter, readDocument, readPathAtRev } from '../storage';
import { DiagnosticsError, parseYaml } from '../validation';

import {
  ConfigFileMissingError,
  loadDnaYaml,
  loadDnaYamlAtRev,
  loadMemoryYaml,
  loadMemoryYamlAtRev,
  loadWorkflowsYaml,
  loadWorkflowsYamlAtRev,
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
  /** A file under `.wingfoil/`, by its path relative to it, or `null` when absent. */
  configFile(relative: string): string | null;
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
  const fieldsByType = new Map<string, ReadonlySet<string> | null>();
  const templateFields = (type: string): ReadonlySet<string> | null => {
    if (!fieldsByType.has(type)) {
      const file = memoryYaml?.types[type]?.template?.file;
      const raw = file === undefined ? null : source.configFile(file);
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
    configFile: (relative) => {
      const path = configPath(relative);
      if (path === null) return null;
      const full = join(root, path);
      return existsSync(full) ? readDocument(full) : null;
    },
  });
}

/**
 * The workflow registry **as commit `rev` holds it** (`spec-017` §1.1): `rev` is resolved once, and the
 * workflow files, `bindings.yaml`, `memory.yaml`, `dna.yaml` and the Memory templates are all read at
 * that commit, so a dirty working tree changes nothing (the `command-baseline` directive).
 *
 * @throws `RevisionError` for a malformed rev or one naming no commit; `DiagnosticsError`
 *   (`VALIDATION`) when the loader or a core check reports an error.
 */
export function loadWorkflowRegistryAtRev(root: string, rev: string): WorkflowsLoadResult {
  const sha = resolveRevision(root, rev);
  return withCoreChecks(loadWorkflowsYamlAtRev(root, sha), {
    memoryYaml: () => loadMemoryYamlAtRev(root, sha),
    dnaYaml: () => loadDnaYamlAtRev(root, sha),
    configFile: (relative) => {
      const path = configPath(relative);
      return path === null ? null : readPathAtRev(root, sha, path);
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

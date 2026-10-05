/**
 * Per-pillar loaders (task-004-decoupled-pillars, REQ-SYS-02). `core` exposes exactly one loader
 * per pillar — `loadMemoryYaml`, `loadDnaYaml`, `loadWorkflowsYaml`, `loadDirectives` — each reading
 * only its own artifact(s) under `.wingfoil/` (spec-011-storage-layout) through the shared two-pass
 * validation pipeline (spec-009-validation-strategy): `storage.readDocument` for bytes,
 * `validation.parseYaml` for the pre-Zod YAML parse, `validation.runValidation` for the Zod
 * structural pass. No loader imports another pillar's schema module, and no loader reads another
 * pillar's file(s) — that is what keeps adding a new Memory `type` (say) from ever requiring a
 * change to `dna.yaml` or `workflows.yaml`, and is the structural guarantee the cross-pillar load
 * test in `test/core/pillar-isolation.test.ts` exercises.
 */
import { existsSync, lstatSync, readdirSync, realpathSync, statSync, type Stats } from 'fs';
import { join, posix } from 'path';

import { DirectiveFrontmatter, RolesYaml } from '../directives/schema';
import { checkDirectiveVersion } from '../directives/version';
import { DnaYaml } from '../dna/schema';
import { MemoryYaml } from '../memory/schema';
import { documentExists, extractFrontmatter, readDocument, readPathAtRev, readPathsAtRev } from '../storage';
import {
  Diagnostic,
  DiagnosticsError,
  E_VALIDATION,
  E_YAML_PARSE_ERROR,
  emitUnknownFieldWarning,
  HasShape,
  parseYaml,
  runValidation,
  ValidationError,
} from '../validation';
import { Workflow, WorkflowsYaml } from '../workflow/schema';

import { atHeadOr, listPathsAtCommit, resolveRevision } from './revision';
import { indexWorkflowFiles, LoadedWorkflowFile, noStartableDiagnostic, workflowFileDiagnostics } from './workflow-diagnostics';

/**
 * The resolved `Stats` of `full`, or why it cannot be resolved (task-143, `bug-125`). `statSync`
 * follows a symbolic link, so a dangling one throws `ENOENT` — the raw error that used to escape every
 * directive read. `lstatSync` sees the entry itself first, so a broken link is told apart from any
 * other failure and named as one. The reasons are phrased like `requireInspectableTarget`'s
 * (`./write-guard.ts`), the write-side guard over the same kind of entry.
 */
function resolveEntry(full: string): Stats | { readonly reason: string } {
  try {
    return statSync(full);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    let isLink = false;
    try {
      isLink = lstatSync(full).isSymbolicLink();
    } catch {
      // `lstat` fails too — a directory listed without search permission, or an entry that vanished
      // after `readdirSync`: report what `stat` said.
    }
    if (isLink && (code === 'ENOENT' || code === 'ENOTDIR')) {
      return { reason: 'it is a symbolic link whose target does not exist' };
    }
    return { reason: `it cannot be read (${String(code)})` };
  }
}

/** The `code` of a filesystem error, as a skip reason's suffix. */
function cannotBeRead(error: unknown): string {
  return `it cannot be read (${String((error as NodeJS.ErrnoException).code)})`;
}

/** One entry of a {@link listMarkdownFilesSorted} walk: a `.md` file to read, or an entry it skipped. */
type WalkEntry =
  | { readonly relative: string; readonly kind: 'file' }
  | { readonly relative: string; readonly kind: 'skipped'; readonly reason: string };

/**
 * Recursively list every `.md` file under `dir`, as paths relative to `dir`, in lexicographic
 * traversal order (REQ-SYS-07: no unordered iteration in a context-building path — directory-entry
 * order from `readdirSync` is not guaranteed stable, so traversal always sorts explicitly, mirroring
 * `src/storage/snapshot.ts`'s `listFilesSorted`). Returns no entries if `dir` doesn't exist.
 *
 * An entry that cannot be resolved — a dangling symbolic link above all, a subdirectory that cannot be
 * listed, or a directory link back to one of its own ancestors — is **skipped**, and comes back as a
 * `skipped` entry with its reason, in the same traversal order (task-143, `bug-125`). Whatever the
 * link's name, it is reported: a dangling link has no type, so one named without `.md` may have been
 * a directory of directives. `dir` itself, when it is a dangling link, is one skipped entry with
 * `relative: ''`.
 *
 * Symlinked directories are followed, but never into a directory already on the walk's stack (by
 * `realpath`): without that, a link to an ancestor is walked until the OS refuses (ELOOP after some
 * forty levels), and every directive above it is listed that many times (task-143 review).
 *
 * `dir` itself is the pillar: when it cannot be listed, `rootError` carries the reason and the caller
 * refuses the read.
 */
function listMarkdownFilesSorted(dir: string): { readonly entries: WalkEntry[]; readonly rootError?: string } {
  const entries: WalkEntry[] = [];
  if (!existsSync(dir)) {
    // `existsSync` follows a link: a dangling `dir` is reported, a genuinely absent one is not.
    // `lstat` itself fails on a path through a non-directory (`.wingfoil` a file): absent, as before.
    let isLink: boolean;
    try {
      isLink = lstatSync(dir).isSymbolicLink();
    } catch {
      isLink = false;
    }
    if (isLink) entries.push({ relative: '', kind: 'skipped', reason: 'it is a symbolic link whose target does not exist' });
    return { entries };
  }
  if (!statSync(dir).isDirectory()) return { entries };
  let rootNames: string[];
  try {
    rootNames = readdirSync(dir);
  } catch (error) {
    return { entries, rootError: cannotBeRead(error) };
  }
  const walk = (current: string, prefix: string, names: string[], ancestors: ReadonlySet<string>): void => {
    for (const entry of [...names].sort()) {
      const full = join(current, entry);
      const relative = prefix ? `${prefix}/${entry}` : entry;
      const resolved = resolveEntry(full);
      if (!('isDirectory' in resolved)) {
        entries.push({ relative, kind: 'skipped', reason: resolved.reason });
      } else if (resolved.isDirectory()) {
        let real: string;
        let children: string[];
        try {
          real = realpathSync(full);
          children = readdirSync(full);
        } catch (error) {
          entries.push({ relative, kind: 'skipped', reason: cannotBeRead(error) });
          continue;
        }
        if (ancestors.has(real)) {
          entries.push({ relative, kind: 'skipped', reason: 'it is a symbolic link to an ancestor directory' });
          continue;
        }
        walk(full, relative, children, new Set([...ancestors, real]));
      } else if (entry.endsWith('.md')) {
        entries.push({ relative, kind: 'file' });
      }
    }
  };
  walk(dir, '', rootNames, new Set([realpathSync(dir)]));
  return { entries };
}

/** Load and validate `.wingfoil/memory.yaml` in isolation (spec-001-memory-yaml-schema). */
export function loadMemoryYaml(root: string): MemoryYaml {
  const filePath = join(root, '.wingfoil', 'memory.yaml');
  return parseMemoryYaml(readDocument(filePath), filePath);
}

/**
 * Root-relative POSIX path of `memory.yaml` — the form git wants for a revision read
 * (`<rev>:<path>`), as opposed to the platform `join` every on-disk read uses. Counterpart of
 * {@link DNA_YAML_PATH} (task-091).
 */
export const MEMORY_YAML_PATH = '.wingfoil/memory.yaml' as const;

/**
 * The Memory pillar's two-pass parse, over bytes that may come from anywhere — the working-tree file
 * ({@link loadMemoryYaml}) or a git revision ({@link loadMemoryYamlAtHead}). `filePath` is a label
 * only: it rides every issue this raises, so an error names the baseline it came from
 * (`HEAD:.wingfoil/memory.yaml`, not just a path on disk).
 */
function parseMemoryYaml(raw: string, filePath: string): MemoryYaml {
  return runValidation(MemoryYaml, parseYaml(raw, filePath), filePath);
}

/**
 * Load and validate `.wingfoil/memory.yaml` **as the repository has committed it** — the version at
 * `HEAD` — returning `null` when no commit of the repository contains that path (an untracked
 * `memory.yaml`, or a repository with no commits at all). Same schema and same error shapes as
 * {@link loadMemoryYaml}; only the source of the bytes differs.
 *
 * This is the baseline every Memory **state transition** resolves against
 * (`prepareMemoryTransition`, `./memory-transition.ts`), per
 * `dl-080-which-baseline-each-command-reads` option (B) — *a read that gates an operation resolves
 * against the repository as committed at `HEAD`* — closing
 * `bug-081-memory-yaml-read-from-worktree-fabricates-states`: an uncommitted edit to a type's
 * `sequence` used to decide what transition a verb performed and what `status` it committed, through
 * `memory submit`, which needs no authority at all, and left the element in a status the committed
 * machine rejects, movable by no verb at all.
 *
 * `HEAD` rather than the commit being produced: a transition commit changes only the element path
 * (`verifyCommittedScope`, task-088), so `memory.yaml` at `HEAD` and at the new commit are
 * byte-identical, and `HEAD` is the one available before that commit exists.
 */
export function loadMemoryYamlAtHead(root: string): MemoryYaml | null {
  return atHeadOr(root, () => loadMemoryYamlAtRev(root, 'HEAD'), null);
}

/**
 * Load and validate `.wingfoil/memory.yaml` **as commit `rev` holds it** (task-137, `spec-012` §2
 * `stateRef`) — the general form of {@link loadMemoryYamlAtHead}, which is this at `'HEAD'`. `null`
 * when that commit does not hold the file; a later commit and the working tree are never read.
 *
 * @param rev - A revision naming one commit, resolved once (`resolveRevision`, `./revision.ts`).
 * @throws `RevisionError` when `rev` is malformed or names no commit — never an empty answer.
 */
export function loadMemoryYamlAtRev(root: string, rev: string): MemoryYaml | null {
  const raw = readPathAtRev(root, resolveRevision(root, rev), MEMORY_YAML_PATH);
  if (raw === null) return null;
  return parseMemoryYaml(raw, `${rev}:${MEMORY_YAML_PATH}`);
}

/**
 * `js-yaml`'s `YAMLException#message` always embeds the failure position as `(<line>:<column>)`
 * (1-indexed) right after the reason text, ahead of the multi-line context snippet — verified across
 * the common `load()` failure shapes (bad indentation, unclosed flow collection, block-mapping/key
 * errors, tab-indentation), with a defensive `null` fallback for any that omit it.
 * `parseYaml` (spec-009-validation-strategy §1) preserves this
 * raw message verbatim in the single issue of the `E_YAML_PARSE_ERROR` `ValidationError` it throws.
 * Returns `null` if the position marker isn't found (defensive — no known js-yaml failure omits it).
 */
function extractYamlErrorLine(message: string): number | null {
  const match = /\((\d+):\d+\)/.exec(message);
  return match ? Number(match[1]) : null;
}

/**
 * Load and validate `.wingfoil/dna.yaml` in isolation (spec-002-dna-yaml-schema). On top of the
 * shared two-pass pipeline every pillar loader uses, this re-wraps a YAML-syntax failure into P2.4's
 * own fit criterion (BDD `P2.4-project-dna-config.feature` "Error - malformed YAML in the DNA file"):
 * `invalid DNA: YAML parse error at line <n>`, rather than surfacing the generic `E_YAML_PARSE_ERROR`
 * message every other pillar loader still uses as-is. DNA-scoped only — this does not change
 * `parseYaml`/`ValidationError`'s shared behavior for `memory.yaml`/`workflows.yaml`/directives.
 */
export function loadDnaYaml(root: string): DnaYaml {
  return parseDnaYaml(readDocument(join(root, '.wingfoil', 'dna.yaml')), join(root, '.wingfoil', 'dna.yaml'));
}

/**
 * Root-relative POSIX path of `dna.yaml` — the form git wants for a revision read
 * (`<rev>:<path>`), as opposed to the platform `join` every on-disk read uses (task-090).
 */
export const DNA_YAML_PATH = '.wingfoil/dna.yaml' as const;

/**
 * The DNA pillar's two-pass parse, over bytes that may come from anywhere — the working-tree file
 * ({@link loadDnaYaml}) or a git revision ({@link loadDnaYamlAtHead}). `filePath` is a label only: it
 * rides every issue this raises, so an error names the baseline it came from
 * (`HEAD:.wingfoil/dna.yaml`, not just a path on disk).
 */
function parseDnaYaml(raw: string, filePath: string): DnaYaml {
  let data: unknown;
  try {
    data = parseYaml(raw, filePath);
  } catch (err) {
    if (err instanceof ValidationError && err.issues[0]?.code === E_YAML_PARSE_ERROR) {
      const line = extractYamlErrorLine(err.issues[0].message);
      const message = line !== null ? `invalid DNA: YAML parse error at line ${line}` : 'invalid DNA: YAML parse error';
      throw new ValidationError([{ ...err.issues[0], message }], err.exitCode);
    }
    throw err;
  }
  return runValidation(DnaYaml, data, filePath);
}

/**
 * Load and validate `.wingfoil/dna.yaml` **as the repository has committed it** — the version at
 * `HEAD` — returning `null` when no commit of the repository contains that path (an untracked
 * `dna.yaml`, or a repository with no commits at all). Same schema and same error shapes as
 * {@link loadDnaYaml}; only the source of the bytes differs.
 *
 * Its caller is `requireApprovalAuthority` (`./approval-authority.ts`, task-090 / `bug-079`) —
 * joined by `checkAssignable` (`./directive-assign.ts`, task-091 / `bug-082`), which validates
 * `directive assign`'s `--role` against the same committed catalogue: approval authority is a property of the
 * repository, not of a working tree, so the roles it reads must be roles someone committed.
 * `adr-006-git-identity-role-based-authz`'s own Positive consequence — a fresh clone "reproduces the
 * full audit trail with zero extra infrastructure" — is what fixes the baseline: a clone carries
 * committed state and nothing else, so an `Approver:` line resting on an uncommitted grant is
 * evidence no clone can re-derive.
 *
 * `HEAD` rather than the produced commit: an approval commit changes only the element path
 * (`verifyCommittedScope`, task-088), so `dna.yaml` at `HEAD` and at the commit being produced are
 * byte-identical — the two shapes `bug-079`'s Expected Behavior offers cannot diverge, and `HEAD` is
 * the one available before the commit exists.
 *
 * Deliberately NOT how the working-tree loaders behave — but no longer an exception argued for one
 * read: `dl-080-which-baseline-each-command-reads` is `ready`, ratified as option (B), and **a read
 * that gates an operation resolves at `HEAD`** is now the rule this and {@link loadMemoryYamlAtHead}
 * implement. A read that gates nothing — `dna show`, `paths`, `directives list`, the MCP Resources —
 * still reports the working tree, which is what those exist to do. (`bug-078` is (B)'s write half:
 * a write refuses while its target carries modifications it does not own.)
 */
export function loadDnaYamlAtHead(root: string): DnaYaml | null {
  return atHeadOr(root, () => loadDnaYamlAtRev(root, 'HEAD'), null);
}

/**
 * Load and validate `.wingfoil/dna.yaml` **as commit `rev` holds it** (task-137, `spec-012` §2
 * `stateRef`) — the general form of {@link loadDnaYamlAtHead}, which is this at `'HEAD'`. `null` when
 * that commit does not hold the file; a later commit and the working tree are never read.
 *
 * @param rev - A revision naming one commit, resolved once (`resolveRevision`, `./revision.ts`).
 * @throws `RevisionError` when `rev` is malformed or names no commit — never an empty answer.
 */
export function loadDnaYamlAtRev(root: string, rev: string): DnaYaml | null {
  const raw = readPathAtRev(root, resolveRevision(root, rev), DNA_YAML_PATH);
  if (raw === null) return null;
  return parseDnaYaml(raw, `${rev}:${DNA_YAML_PATH}`);
}

/** The result of loading the Workflow pillar: the Layer-1 manifest plus every Layer-2 file it includes. */
export interface WorkflowsLoadResult {
  /** `null` when `.wingfoil/workflows.yaml` is absent — an empty registry (spec-003 Layer 1). */
  readonly manifest: WorkflowsYaml | null;
  readonly workflows: readonly Workflow[];
}

/** The manifest's path relative to `.wingfoil/` — the `file` of its diagnostics (spec-003). */
const WORKFLOWS_MANIFEST_FILE = 'workflows.yaml';

/** A Zod issue path as spec-003 spells a diagnostic `path`: `phases[3].include`. */
function diagnosticPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out === '' ? String(segment) : `.${String(segment)}`;
  }
  return out;
}

/**
 * One included file's structural (Zod) pass, as diagnostics (spec-003 § "Diagnostics": structural
 * failures keep spec-009's structural codes, except the named `kind` refusal). An empty list means the
 * file is valid and `workflow` is set.
 */
function parseWorkflowFile(
  data: unknown,
  file: string,
  filePath: string,
): { workflow: Workflow | null; diagnostics: Diagnostic[] } {
  const result = Workflow.safeParse(data);
  if (result.success) {
    // The same once-per-file unknown-field warning `runValidation` fires (spec-009 §2).
    emitUnknownFieldWarning(data as Record<string, unknown>, Workflow as unknown as HasShape, filePath);
    return { workflow: result.data, diagnostics: [] };
  }
  const diagnostics = zodDiagnostics(result.error.issues, file).map((diagnostic) =>
    diagnostic.path === 'kind' ? { ...diagnostic, code: 'E_WORKFLOW_INVALID_KIND' } : diagnostic,
  );
  return { workflow: null, diagnostics };
}

/** Zod issues as `E_VALIDATION` diagnostics of `file` (spec-009's structural code). */
function zodDiagnostics(issues: readonly { path: readonly PropertyKey[]; message: string }[], file: string): Diagnostic[] {
  return issues.map((issue) => ({ code: E_VALIDATION, severity: 'error', file, path: diagnosticPath(issue.path), message: issue.message }));
}

/**
 * Parse `raw` as YAML; a parse failure becomes one `E_YAML_PARSE_ERROR` diagnostic of `file` (the
 * spec-009 code, with the parser's message) instead of a throw, so it takes its place in the array.
 */
function parseYamlOrDiagnostic(
  raw: string,
  filePath: string,
  file: string,
): { data: unknown; diagnostic: null } | { data: null; diagnostic: Diagnostic } {
  try {
    return { data: parseYaml(raw, filePath), diagnostic: null };
  } catch (err) {
    // `parseYaml` throws nothing but `ValidationError.yamlParse`: one issue, the parser's message.
    const { message } = (err as ValidationError).issues[0]!;
    return { data: null, diagnostic: { code: E_YAML_PARSE_ERROR, severity: 'error', file, path: '', message } };
  }
}

/**
 * Load and validate the Workflow pillar in isolation (spec-003-workflows-yaml-schema): Layer 1
 * (`.wingfoil/workflows.yaml`), then every file its `include` list names (Layer 2), resolved
 * relative to `.wingfoil/` per spec-003, then the **loader** rows of spec-003 § "Diagnostics" — the
 * checks that need the loaded files themselves (spec-009 §1 "Cross-file" category), run here rather
 * than in the schema module (`./workflow-diagnostics.ts`, task-136).
 *
 * - An **absent** manifest is an empty registry, with no diagnostic (spec-003 Layer 1).
 * - A manifest that is not YAML, or fails its structural pass, is the whole array: one
 *   `E_YAML_PARSE_ERROR`, or its Zod issues as `E_VALIDATION`, on `workflows.yaml`.
 * - Everything else is collected into one ordered `diagnostics` array (REQ-SYS-07): the manifest's
 *   (`E_WORKFLOW_FILE_NOT_FOUND`, `E_NO_MAIN_WORKFLOW`), then each file in `include` order —
 *   a YAML parse failure (`E_YAML_PARSE_ERROR`) or the structural (Zod) issues, then
 *   workflow-level, then phase-level. If it holds an error, the load throws a
 *   {@link DiagnosticsError}: `VALIDATION`, exit `1`, the first error as the reason and the whole array
 *   attached.
 */
export function loadWorkflowsYaml(root: string): WorkflowsLoadResult {
  const configDir = join(root, '.wingfoil');
  return loadWorkflowsFrom({
    read: (file) => {
      const path = join(configDir, file);
      return documentExists(path) ? readDocument(path) : null;
    },
    label: (file) => join(configDir, file),
  });
}

/**
 * Load and validate the Workflow pillar **as commit `rev` holds it** (task-137, `spec-017` §1.1: the
 * registry is read at `HEAD`): the manifest and every file it includes, read at that commit. It runs
 * the same body as {@link loadWorkflowsYaml} over the committed bytes, so the result — or the
 * {@link DiagnosticsError} and its ordered `diagnostics` array (task-136) — is the one the working-tree
 * loader gives for the same bytes. Only the parse-error labels differ (`<rev>:.wingfoil/<file>`); every
 * diagnostic's `file` stays relative to `.wingfoil/`. A path the commit holds as a directory counts as
 * absent (`E_WORKFLOW_FILE_NOT_FOUND`).
 *
 * @param rev - A revision naming one commit, resolved once (`resolveRevision`, `./revision.ts`).
 * @throws `RevisionError` when `rev` is malformed or names no commit — never an empty registry.
 */
export function loadWorkflowsYamlAtRev(root: string, rev: string): WorkflowsLoadResult {
  const sha = resolveRevision(root, rev);
  const committedPath = (file: string): string => posix.normalize(`.wingfoil/${file}`);
  return loadWorkflowsFrom({
    read: (file) => {
      const [raw = null] = readPathsAtRev(root, sha, [committedPath(file)]);
      return raw;
    },
    label: (file) => `${rev}:${committedPath(file)}`,
  });
}

/**
 * Where the Workflow pillar's bytes come from: the working tree or one commit. `file` is relative to
 * `.wingfoil/` (the manifest's own `include` spelling); `read` answers `null` for a file that is not
 * there, and `label` is the name parse errors and unknown-field warnings carry.
 */
interface WorkflowSource {
  read(file: string): string | null;
  label(file: string): string;
}

/**
 * The Workflow pillar's load (spec-003 Layers 1–2 and the loader rows of § "Diagnostics"), over a
 * {@link WorkflowSource} — the one body {@link loadWorkflowsYaml} and {@link loadWorkflowsYamlAtRev}
 * share, so the two baselines cannot drift on what a registry or a diagnostic is.
 */
function loadWorkflowsFrom(source: WorkflowSource): WorkflowsLoadResult {
  const manifestRaw = source.read(WORKFLOWS_MANIFEST_FILE);
  if (manifestRaw === null) return { manifest: null, workflows: [] };
  const manifestPath = source.label(WORKFLOWS_MANIFEST_FILE);
  // A manifest that cannot be read as YAML, or fails its structural pass, names no file to load: its
  // diagnostics are the whole array.
  const manifestData = parseYamlOrDiagnostic(manifestRaw, manifestPath, WORKFLOWS_MANIFEST_FILE);
  if (manifestData.diagnostic) throw new DiagnosticsError([manifestData.diagnostic]);
  const manifestResult = WorkflowsYaml.safeParse(manifestData.data);
  if (!manifestResult.success) throw new DiagnosticsError(zodDiagnostics(manifestResult.error.issues, WORKFLOWS_MANIFEST_FILE));
  emitUnknownFieldWarning(manifestData.data as Record<string, unknown>, WorkflowsYaml as unknown as HasShape, manifestPath);
  const manifest = manifestResult.data;

  const manifestDiagnostics: Diagnostic[] = [];
  const files: LoadedWorkflowFile[] = [];
  const structural: Diagnostic[][] = [];
  manifest.include.forEach((includePath, position) => {
    const raw = source.read(includePath);
    if (raw === null) {
      manifestDiagnostics.push({
        code: 'E_WORKFLOW_FILE_NOT_FOUND',
        severity: 'error',
        file: WORKFLOWS_MANIFEST_FILE,
        path: `include[${position}]`,
        message: `included workflow file not found: ${includePath}`,
      });
      return;
    }
    const workflowPath = source.label(includePath);
    const yaml = parseYamlOrDiagnostic(raw, workflowPath, includePath);
    if (yaml.diagnostic) {
      files.push({ file: includePath, workflow: null, rawName: null });
      structural.push([yaml.diagnostic]);
      return;
    }
    const data = yaml.data;
    const parsed = parseWorkflowFile(data, includePath, workflowPath);
    const rawName = (data as { name?: unknown } | null)?.name;
    files.push({ file: includePath, workflow: parsed.workflow, rawName: typeof rawName === 'string' ? rawName : null });
    structural.push(parsed.diagnostics);
  });

  const index = indexWorkflowFiles(files, manifest.include.length - files.length);
  const noStartable = noStartableDiagnostic(files, index);
  if (noStartable) manifestDiagnostics.push(noStartable);

  const diagnostics: Diagnostic[] = [...manifestDiagnostics];
  files.forEach((_, i) => {
    diagnostics.push(...structural[i]!, ...workflowFileDiagnostics(files, index, i));
  });
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) throw new DiagnosticsError(diagnostics);

  // Every file is structurally valid once no error was reported.
  return { manifest, workflows: files.map((loaded) => loaded.workflow!) };
}

/** One Directives pillar file: its root-relative path and its validated frontmatter. */
export interface DirectiveFile {
  readonly path: string;
  readonly frontmatter: DirectiveFrontmatter;
}

/**
 * Root-relative POSIX path of the Directives tree — the form git wants for a revision listing, as
 * opposed to the platform `join` every on-disk read uses. Counterpart of {@link DNA_YAML_PATH} /
 * {@link MEMORY_YAML_PATH} for the one pillar whose baseline is a **directory** (task-096).
 */
export const DIRECTIVES_DIR_PATH = '.wingfoil/directives' as const;

/**
 * The Directives pillar's per-file parse, over bytes that may come from anywhere — the working-tree
 * file ({@link loadDirectives}) or a git revision ({@link loadDirectivesAtHead}). `filePath` is a
 * label only: it rides every issue this raises, so an error names the baseline it came from
 * (`HEAD:.wingfoil/directives/custom/x.md`, not just a path on disk). Lifted out so the two loaders
 * cannot drift on what a directive file *is*.
 *
 * @param relativePath - The file's path relative to `.wingfoil/directives/`, POSIX-spelled.
 * @param warn - Receives a `version` warning (task-144, R1). `src/core` prints nothing (task-143): the
 *   working-tree inventory forwards it to its `warnings`; a reader at a revision has no channel and
 *   drops it.
 */
function parseDirectiveFile(
  raw: string,
  filePath: string,
  relativePath: string,
  warn: (warning: string) => void = () => {},
): DirectiveFile {
  const frontmatterText = extractFrontmatter(raw);
  if (frontmatterText === null) {
    throw ValidationError.semantic([
      {
        code: 'E_MISSING_FRONTMATTER',
        path: '',
        file: filePath,
        message: 'directive file has no frontmatter block',
      },
    ]);
  }
  // `version` never fails the pillar (task-144 review, R1): a lossy number or a wrong type is a warning.
  const versionCheck = checkDirectiveVersion(parseYaml(frontmatterText, filePath), frontmatterText);
  if (versionCheck.warning !== null) warn(versionCheck.warning);
  const frontmatter = runValidation(DirectiveFrontmatter, versionCheck.data, filePath);
  // `join`, so `DirectiveFile.path` carries the platform separator on both loaders — `requireCustomAsset`
  // and `selectDirectivesById` see one spelling whichever baseline produced the file.
  return { path: join('directives', ...relativePath.split('/')), frontmatter };
}

/**
 * The working-tree directive inventory with the entries it had to skip (task-143, `bug-125`): every
 * directive file that loaded, and one operator warning per entry under `.wingfoil/directives/**` that
 * could not be resolved (a dangling symbolic link), naming it root-relative — never as an absolute
 * path. One broken entry no longer takes down the pillar's whole read surface.
 */
export interface DirectiveInventory {
  readonly files: DirectiveFile[];
  /** `directive entry '<root-relative path>' skipped: <reason>`, in traversal order; empty when none. */
  readonly warnings: string[];
}

/**
 * The working-tree directive inventory, warnings included: the form a caller with a channel of its
 * own reads. `directives list` puts the warnings in its payload (`dl-042`), so they reach `--format
 * json` readers and MCP clients; `directive remove` puts them in its refusal's `details`. `src/core`
 * never prints them itself (task-143 review: a stray stderr line breaks spec-005 §3.2's one-object
 * error under `--format json`).
 *
 * A `.md` file that cannot be **read** is skipped like any other unreadable entry: its bytes never
 * reach the parser. A file that is read and then fails to parse or validate stays fatal — that is a
 * broken directive, not a broken entry, and silently dropping a rule an agent must obey is worse than
 * refusing the read. So is a `.wingfoil/directives` that cannot be listed: it is the pillar, and is
 * refused as `E_DIRECTIVES_UNREADABLE`, naming it root-relative.
 */
export function loadDirectiveInventory(root: string): DirectiveInventory {
  const directivesDir = join(root, '.wingfoil', 'directives');
  const { entries, rootError } = listMarkdownFilesSorted(directivesDir);
  if (rootError !== undefined) {
    throw new ValidationError([
      { code: 'E_DIRECTIVES_UNREADABLE', path: '', file: '.wingfoil/directives', message: rootError },
    ]);
  }
  const files: DirectiveFile[] = [];
  const warnings: string[] = [];
  const skip = (relative: string, reason: string): void => {
    const shown = relative === '' ? '.wingfoil/directives' : `.wingfoil/directives/${relative}`;
    warnings.push(`directive entry '${shown}' skipped: ${reason}`);
  };
  for (const entry of entries) {
    if (entry.kind === 'skipped') {
      skip(entry.relative, entry.reason);
      continue;
    }
    const absolute = join(directivesDir, entry.relative);
    let raw: string;
    try {
      raw = readDocument(absolute);
    } catch (error) {
      skip(entry.relative, cannotBeRead(error));
      continue;
    }
    files.push(
      parseDirectiveFile(raw, absolute, entry.relative, (warning) =>
        warnings.push(`directive '.wingfoil/directives/${entry.relative}': ${warning}`),
      ),
    );
  }
  return { files, warnings };
}

/**
 * Load and validate every Directives file in isolation (task-004-decoupled-pillars), against
 * `spec-013-directive-frontmatter-schema`'s `DirectiveFrontmatter` (`src/directives/schema.ts`). Reads
 * every `.md` file under `.wingfoil/directives/**` (built-in + custom) **in the working tree**,
 * sorted deterministically (REQ-SYS-07: no unordered iteration in a context-building path), extracts
 * its frontmatter (`storage.extractFrontmatter`), and validates it against `DirectiveFrontmatter`.
 *
 * This is the *report* baseline — what the user has now — and it is what context assembly and the
 * MCP role Prompts read. A read that **gates** a mutation reads {@link loadDirectivesAtHead} instead
 * (`dl-080` (B)).
 *
 * The files only: an entry that cannot be resolved or read is skipped (task-143, `bug-125`) and its
 * warning dropped, since `src/core` does not print. A caller that can report the warnings reads
 * {@link loadDirectiveInventory} instead.
 */
export function loadDirectives(root: string): DirectiveFile[] {
  return loadDirectiveInventory(root).files;
}

/**
 * Load and validate every Directives file **as the repository has committed it** — the tree at
 * `HEAD`.
 *
 * This is the inventory a read that gates a mutation resolves against
 * (`checkAssignable`, `./directive-assign.ts`), per `dl-080-which-baseline-each-command-reads` option
 * (B), closing the `assign` half of `bug-086-directive-inventory-read-from-the-worktree`: an
 * untracked directive file used to be bindable, and the committed `roles.yaml` then named a directive
 * present in no commit — a dangling reference by construction, since every other clone gets the
 * binding without the file (REQ-SYS-08's referential integrity, the same way `bug-082` broke it for
 * `--role`).
 *
 * Unlike every other committed-baseline loader, this one needs a **directory listing at a revision**
 * (`storage.listPathsAtRev`, task-096) rather than one `readPathAtRev`: the pillar's members are
 * discovered, not named in advance. That missing primitive is why `task-091` deferred this half.
 *
 * Same schema and same error shapes as {@link loadDirectives}; only the source of the bytes differs.
 *
 * Returns an **array, never `null`**, unlike its three sibling committed-baseline loaders. They read
 * one named file, where "not committed" and "committed but empty" are different facts a caller may
 * need to tell apart; here the two collapse — a `HEAD` that does not resolve (no commits at all) and
 * a `HEAD` that commits no directive file both mean *the repository records no directive*, and both
 * produce the same refusal from the only gate that consults this (`checkAssignable`: every id is
 * unknown). `listPathsAtRev` keeps the distinction for callers that do need it.
 */
export function loadDirectivesAtHead(root: string): DirectiveFile[] {
  return atHeadOr(root, () => loadDirectivesAtRev(root, 'HEAD'), []);
}

/**
 * Load and validate every Directives file **as commit `rev` holds it** (task-137, `spec-012` §2
 * `stateRef`) — the general form of {@link loadDirectivesAtHead}, which is this at `'HEAD'`: the
 * `.md` files `storage.listPathsAtRev` lists under `.wingfoil/directives/` at that commit, in its
 * sorted order, each read with `storage.readPathAtRev` at the resolved sha. An empty array when the commit holds no
 * directive file; a later commit and the working tree are never read.
 *
 * @param rev - A revision naming one commit, resolved once (`resolveRevision`, `./revision.ts`).
 * @throws `RevisionError` when `rev` is malformed or names no commit — never an empty array.
 */
export function loadDirectivesAtRev(root: string, rev: string): DirectiveFile[] {
  const sha = resolveRevision(root, rev);
  const files: DirectiveFile[] = [];
  for (const path of listPathsAtCommit(root, sha, DIRECTIVES_DIR_PATH)) {
    if (!path.endsWith('.md')) continue;
    // One read per file, not the batched `readPathsAtRev`: a project holds a handful of directives,
    // and task-096's suite pins this read (`readPathAtRev`) by name.
    const raw = readPathAtRev(root, sha, path);
    // Unreachable by construction — git has just listed this blob at the same sha. Skipping is still
    // the fail-closed answer: a directive nobody can read is a directive that does not exist, so a
    // binding to it is refused rather than committed.
    if (raw === null) continue;
    files.push(parseDirectiveFile(raw, `${rev}:${path}`, path.slice(DIRECTIVES_DIR_PATH.length + 1)));
  }
  return files;
}

/**
 * Root-relative POSIX path of `roles.yaml` — the form git wants for a revision read (`<rev>:<path>`),
 * as opposed to the platform `join` every on-disk read uses. It lived in `./directive-assign.ts` until
 * task-096 moved it here, beside {@link DNA_YAML_PATH} / {@link MEMORY_YAML_PATH} and beside the
 * committed-baseline reader that uses it; `./directive-assign.ts` now **imports** it like any other
 * caller, and `src/core`'s barrel exports it from here.
 */
export const ROLES_YAML_PATH = '.wingfoil/roles.yaml' as const;

/**
 * Load and validate `.wingfoil/roles.yaml` in isolation (task-037-role-task-scoped-context,
 * REQ-STATE-05's `directive-loader`, P3.2/P3.7 role → directive bindings) — the same shared two-pass
 * pipeline (`readDocument` + `parseYaml` + `runValidation`) every other pillar loader uses, so this
 * pillar's own validation never depends on another pillar's schema (REQ-SYS-02). The working-tree
 * reader: `directives list` and the MCP role Prompts resolve a role's directives from it, while the
 * execution context (`assembleExecutionContext`, `./context.ts`) reads {@link loadRolesYamlAtRev} at its
 * `stateRef`.
 */
export function loadRolesYaml(root: string): RolesYaml {
  const filePath = join(root, '.wingfoil', 'roles.yaml');
  const raw = readDocument(filePath);
  const data = parseYaml(raw, filePath);
  return runValidation(RolesYaml, data, filePath);
}

/**
 * Load and validate `.wingfoil/roles.yaml` **as the repository has committed it** — the version at
 * `HEAD` — returning `null` when no commit contains that path (an untracked `roles.yaml`, a committed
 * deletion of it, or a repository with no commits).
 *
 * This is the baseline REQ-SEC-07 clause (b) is answered from (`checkUnreferenced`,
 * `./directive-assign.ts`), per `dl-080-which-baseline-each-command-reads` option (B), closing the
 * `remove` half of `bug-086-directive-inventory-read-from-the-worktree`: an **uncommitted** deletion
 * of the two `- <id>` lines was enough to delete a directive file the committed `roles.yaml` still
 * bound — on the only verb in the system that destroys an artefact.
 *
 * `null` is not an error and does not fail closed there, unlike `loadDnaYamlAtHead`'s: "is anything
 * still referencing this asset" is a question a missing record *answers*, with "nothing" (which is
 * also how an absent `roles.yaml` has always been read — "no bindings yet", task-051/task-053). A
 * committed `roles.yaml` that does not **validate** is the different case, and that one does refuse.
 */
export function loadRolesYamlAtHead(root: string): RolesYaml | null {
  return atHeadOr(root, () => loadRolesYamlAtRev(root, 'HEAD'), null);
}

/**
 * Load and validate `.wingfoil/roles.yaml` **as commit `rev` holds it** (task-137, `spec-012` §2
 * `stateRef`) — the general form of {@link loadRolesYamlAtHead}, which is this at `'HEAD'`. `null` when
 * that commit does not hold the file; a later commit and the working tree are never read.
 *
 * @param rev - A revision naming one commit, resolved once (`resolveRevision`, `./revision.ts`).
 * @throws `RevisionError` when `rev` is malformed or names no commit — never an empty answer.
 */
export function loadRolesYamlAtRev(root: string, rev: string): RolesYaml | null {
  const raw = readPathAtRev(root, resolveRevision(root, rev), ROLES_YAML_PATH);
  if (raw === null) return null;
  const label = `${rev}:${ROLES_YAML_PATH}`;
  return runValidation(RolesYaml, parseYaml(raw, label), label);
}

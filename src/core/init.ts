/**
 * `.wingfoil/` initialization as a shared-core domain operation (task-018-implement-git-backed-storage,
 * P1.1, US-0A-01, REQ-SYS-01/REQ-SYS-02; spec-006-core-domain-api §2 `CoreResult` shape).
 *
 * The storage layer (`src/storage/layout.ts`'s `initStorage`) is a pure write+commit mechanism; this
 * is the thin `CoreResult`-returning wrapper that both surfaces (CLI, MCP — REQ-SYS-05) drive, so the
 * two guard rails the P1.1 acceptance contract states are enforced once, identically:
 *   1. "target directory is not a git repository" → a `VALIDATION` error carrying the exact message
 *      `not a git repository: run 'git init' first`, mapped to exit 1 by `exitCodeForError`
 *      (spec-005 §1) — and, critically, NOTHING is written (no `.wingfoil/`).
 *   2. the REQ-SEC-01 git-identity pre-flight (`requireGitIdentity`, task-014) — a WingFoil commit
 *      with no attributable author is refused before any file is written.
 *
 * Both write paths below — {@link initWingfoilStorage} and {@link initWingfoilProject} — additionally
 * run the REQ-SEC-10 built-in template schema check, and the spec-007 §4 step 5 secret scan (task-135),
 * over the very `ScaffoldFile[]` they are about to write, before writing it. The symmetry is deliberate and is pinned by a shared test table
 * (`test/core/project-directives.test.ts`); it closed
 * `bug-018-init-storage-bypasses-integrity-guard`, the last asymmetry `task-044` left behind.
 *
 * The user-facing `wingfoil init` CLI command and its interactive wizard are task-029's scope; this
 * function is the library entry point that command will call. It is intentionally NOT registered in
 * `CORE_MODULES` yet — there is no distinct verb beyond `init`, and wiring the surface belongs with
 * task-029 (keeping the REQ-SYS-05 parity test's "0 mutating ops" invariant until a surface exists).
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  INIT_COMMIT_MESSAGE,
  builtinTemplateSources,
  detectInitState,
  initProjectCommitMessage,
  initStorage,
  resolveTemplate,
  scaffoldFiles,
  templateScaffold,
  type BuiltinTemplateSource,
  type ScaffoldFile,
} from '../storage';

import { verifyBuiltinTemplates } from './builtin-integrity';
import { requireConfinedWriteTarget } from './confinement';
import { requireGitIdentity } from './git-identity';
import { coreErr, coreOk, type CoreResult } from './types';
import { requireUnmodifiedTargets } from './write-guard';

/** Exact refusal message required by P1.1-git-backed-storage.feature scenario 3 — do not reword. */
const NOT_A_GIT_REPO = "not a git repository: run 'git init' first";

/**
 * Exact message required by P5.1.1-init.feature scenario "Error - initializing an already-initialized
 * project" — do not reword without that scenario. Rendered by the CLI as `error: <message>` (spec-005
 * §3) and mapped to exit 1 (a well-formed invocation that failed on business logic, spec-005 §1) by
 * `exitCodeForError`. The hint names what exists (task-119, bug-129): hand edits under `.wingfoil/`,
 * which the user commits, or the `dna` / `directive` commands, which commit themselves.
 */
export const WINGFOIL_ALREADY_INITIALIZED =
  'WingFoil already initialized (to change its configuration, edit the files under .wingfoil/ and commit them, or use the wingfoil dna and wingfoil directive commands)';

/**
 * The refusal a read gives in a git root that has no `.wingfoil/` (task-143, `bug-154`): spec-011's
 * `absent` init state, whose action is "suggest `wingfoil init`". Defined once, here beside
 * {@link WINGFOIL_ALREADY_INITIALIZED}, so every surface that needs it — `directives list` today, the
 * MCP server's pre-flight (`task-174`, `bug-035`) next — says the same thing. It names no path: the
 * root is the user's own working directory, and an absolute path is what `bug-035` objects to.
 */
export const WINGFOIL_NOT_INITIALIZED =
  "WingFoil not initialized (no .wingfoil/ directory at the project root): run 'wingfoil init' first";

/**
 * Refuse a read in a project with no configuration: `ok` when `root` has a `.wingfoil/` directory,
 * else a `VALIDATION` error carrying {@link WINGFOIL_NOT_INITIALIZED} (exit 1, spec-005 §1).
 *
 * Only spec-011's `absent` state is refused. An `incomplete` (empty) `.wingfoil/`, or one that lacks
 * the pillar a read is after, is a configured project that declares nothing yet — each pillar's own
 * loader answers for that. A `.wingfoil` that is not a directory is not a configuration either, and is
 * refused the same way; `statSync` follows a symlink, so a dangling one is `absent`, as it is for
 * `detectInitState`.
 */
export function requireInitializedProject(root: string): CoreResult<undefined> {
  const wingfoilDir = join(root, '.wingfoil');
  if (existsSync(wingfoilDir) && statSync(wingfoilDir).isDirectory()) return coreOk(undefined);
  return coreErr({ code: 'VALIDATION', message: WINGFOIL_NOT_INITIALIZED });
}

/**
 * The already-initialized refusal both init entry points run, or `null` when `root` may be
 * initialized. A `.wingfoil` that exists but is not a directory is refused too: spec-011's
 * `detectInitState` reads it with `readdirSync`, which throws `ENOTDIR` on a file, and that throw
 * escaped both entry points as an exception instead of a result (task-135 review). Checked here,
 * in `core`, so `detectInitState` keeps spec-011's three states. `statSync` follows a symlink, as
 * `detectInitState`'s `existsSync` does; a dangling one counts as absent for both.
 */
function refuseInitializedProject(root: string): CoreResult<never> | null {
  const wingfoilDir = join(root, '.wingfoil');
  if (existsSync(wingfoilDir) && !statSync(wingfoilDir).isDirectory()) {
    return coreErr({
      code: 'VALIDATION',
      message: '.wingfoil exists but is not a directory: move or remove it, then run init again',
    });
  }
  if (detectInitState(root) === 'initialized') {
    return coreErr({ code: 'VALIDATION', message: WINGFOIL_ALREADY_INITIALIZED });
  }
  return null;
}

// ---- task-172 (bug-121): the scaffold's write-target guards — kept in one delimited block ----

/**
 * Refuse, before the first write, a scaffold whose targets the init commit could not own — the
 * guard both init entry points run over the exact `files` they are about to write (task-172,
 * `bug-121-config-write-paths-have-no-confinement-pre-flight`).
 *
 * 1. **Confinement** ({@link requireConfinedWriteTarget}, REQ-SEC-06), on every path, first: a path
 *    that leaves the project is reported as leaving it. `init` does not establish the boundary it is
 *    checked against — the boundary is the git root, which guard 1 requires to exist; `init` only
 *    creates `.wingfoil/` beneath it. The one pre-existing shape a target can take here is a
 *    `.wingfoil` that is a symbolic link to an empty directory (an initialized one is refused), and
 *    out of the root that link would receive the whole scaffold before `git add` failed.
 * 2. **Unmodified and inspectable** (`requireUnmodifiedTargets`, dl-080 (B) with task-131's
 *    inspectability check): refuses a dirty target and one beyond a symbolic link — an in-root
 *    linked `.wingfoil`, which git cannot stage.
 *
 * Returns the first refusal (`VALIDATION`, exit 1), or `ok` when every path may be written.
 */
function requireScaffoldTargets(root: string, files: readonly ScaffoldFile[]): CoreResult<undefined> {
  for (const file of files) {
    const confined = requireConfinedWriteTarget(root, file.path, 'write');
    if (!confined.ok) return confined;
  }
  const unmodified = requireUnmodifiedTargets(root, files.map((file) => file.path));
  if (!unmodified.ok) return unmodified;
  return coreOk(undefined);
}

// ---- end task-172 block ----

/** What a successful init reports: the resolved root and the root-relative paths it created. */
export interface InitStorageValue {
  readonly root: string;
  readonly files: readonly string[];
}

/**
 * Initialize the `.wingfoil/` storage structure at `root` and stage it as a single commit authored
 * by the current git user.
 *
 * Guards, in the order their message must win: git repository → git identity (REQ-SEC-01) → built-in
 * template integrity (REQ-SEC-10 schema check and spec-007 §4 step 5 secret scan) — the same three,
 * in the same order, as {@link initWingfoilProject} — then the dirty/uninspectable-target guard
 * (dl-080 (B), task-092, task-131) and, last, the already-initialized refusal
 * ({@link WINGFOIL_ALREADY_INITIALIZED}, task-135 / bug-088), which {@link initWingfoilProject} runs
 * second. It runs last here so the two target guards before it keep their more specific messages;
 * either way nothing is written. The message is shared; the order is not, so on a project that is
 * both initialized and dirty the two entry points refuse with different messages. There is no `force` parameter: no caller re-scaffolds on purpose.
 *
 * The third one arrived with `task-054-project-directives` / `bug-018-init-storage-bypasses-integrity-guard`.
 * `scaffoldFiles()` now reserves `.wingfoil/directives/built-in/` (P3.5), which makes this a write path
 * that installs into a built-in ASSET directory; before that it was the one `initStorage` caller with
 * no check, safe only because the skeleton happened to contain nothing but dotfiles. Deriving the
 * checked set from `files` — the exact array handed to `initStorage` below, bound once and not
 * recomputed — is what makes "installed but unchecked" unrepresentable here too, rather than a
 * property of today's scaffold content. `verifyBuiltinTemplates` is pure and touches no disk, so
 * running it here satisfies REQ-SEC-10's "abort before writing partial assets" ordering.
 *
 * Per `dl-031-req-sec-10-integrity-depth` (`ready`), that check is schema validation: no digest, no
 * manifest, no checksum.
 *
 * @param builtinTemplates - test-only override for the REQ-SEC-10 source list, mirroring
 *   {@link initWingfoilProject}'s parameter of the same name; it lets one shared test table drive the
 *   guard through BOTH write paths (`test/core/project-directives.test.ts`). Omit it in production:
 *   the derived set is the contract.
 * @returns `ok` carrying the created paths and the produced `{sha, message}` commit; or a
 *   `CoreResult.error` (code `VALIDATION` → exit 1) when `root` is not a git repository, when git
 *   identity is unconfigured (REQ-SEC-01), when a built-in template fails its schema check
 *   (REQ-SEC-10) or its secret scan (spec-007 §4 step 5), when a target leads outside the project root
 *   or is a symbolic link (REQ-SEC-06, task-172), when a target is dirty or uninspectable,
 *   when `root` is already initialized, or (code `IO`) when the git commit itself fails.
 */
export function initWingfoilStorage(
  root: string,
  builtinTemplates?: readonly BuiltinTemplateSource[],
): CoreResult<InitStorageValue> {
  // Guard 1 — `root` must itself be a git repository (a `.git` dir or worktree file at the root).
  // Checked first so its precise message wins over the identity pre-flight below.
  if (!existsSync(join(root, '.git'))) {
    return coreErr({ code: 'VALIDATION', message: NOT_A_GIT_REPO });
  }

  // Guard 2 — refuse an unattributable commit (REQ-SEC-01). Returns its VALIDATION error unchanged.
  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity as CoreResult<InitStorageValue>;

  // Guard 3 — REQ-SEC-10 schema check plus the spec-007 §4 step 5 secret scan, over the very list
  // this call is about to write.
  const files = scaffoldFiles();
  const integrityFailure = verifyBuiltinTemplates(builtinTemplates ?? builtinTemplateSources(files));
  if (integrityFailure) {
    return coreErr({ code: 'VALIDATION', message: integrityFailure.message });
  }

  // Guard 4 — task-172 (REQ-SEC-06, bug-121) confinement, then dl-080 (B) / bug-078 / task-092
  // with task-131's inspectability check inside it ({@link requireScaffoldTargets}). Here a target
  // CAN pre-exist, and its uncommitted content would be overwritten and the diff committed under a
  // subject saying "initialize"; behind a symlink it cannot even be inspected. It runs BEFORE guard 5
  // so a dirty or uninspectable target is refused with the message that names that target, not with
  // the generic one below.
  const targets = requireScaffoldTargets(root, files);
  if (!targets.ok) return targets as CoreResult<InitStorageValue>;

  // Guard 5 — task-135 / bug-088: an initialized project is not re-initialized. The message is
  // {@link initWingfoilProject}'s, but this path runs it fifth rather than second, so the two give
  // the same answer only where no earlier guard fires first (a dirty or uninspectable target is
  // refused by guard 4 here, by this check there). Guard 4 only catches a target with modifications
  // it does not own; a CLEAN, committed `.wingfoil/dna.yaml` passed it and was overwritten.
  const initialized = refuseInitializedProject(root);
  if (initialized) return initialized;

  try {
    const sha = initStorage(root, files);
    return coreOk<InitStorageValue>(
      { root, files: files.map((file) => file.path) },
      { sha, message: INIT_COMMIT_MESSAGE },
    );
  } catch (error) {
    return coreErr({ code: 'IO', message: (error as Error).message });
  }
}

/** What a successful `wingfoil init` reports: the root, the chosen template, and the created paths. */
export interface InitProjectValue {
  readonly root: string;
  readonly template: string;
  readonly files: readonly string[];
}

/**
 * `wingfoil init` (task-029, P5.1.1): scaffold the COMPLETE spec-011 `.wingfoil/` layout for the
 * `templateName` methodology template and stage it as a single commit — the CoreResult flow both the
 * CLI wizard and the MCP surface drive (REQ-SYS-05). Config pillars ONLY (DNA/Directives/Workflow) —
 * never Memory content (the `sw-life-cycle` workflow's `init`→`wingfoil-init` phase populates config
 * pillars only, REQ-SYS-02); Memory documents are seeded later by `seed-first-release-line`.
 *
 * Guards, in the order their message must win:
 *   1. `root` is a git repository (same exact message + no-write guarantee as {@link initWingfoilStorage}).
 *   2. NOT already initialized (spec-011 `detectInitState` === 'initialized') → returns
 *      {@link WINGFOIL_ALREADY_INITIALIZED} and overwrites NOTHING (returns before any write) — P5.1.1
 *      scenario "Error - initializing an already-initialized project", exit 1.
 *   3. `templateName` resolves to a known template (defense-in-depth; the CLI rejects an unknown
 *      `--template` value as a usage error / exit 2 before reaching here).
 *   4. git identity is configured (REQ-SEC-01, {@link requireGitIdentity}) — refuse an unattributable commit.
 *   5. every built-in template source passes {@link verifyBuiltinTemplates} (REQ-SEC-10,
 *      task-044-builtin-template-integrity) — a corrupted/schema-invalid built-in directive or
 *      workflow template aborts before the scaffold write, naming the failing template (P3.8/P4.17
 *      BDD "Error - a built-in template fails its integrity check" / "... is structurally invalid"),
 *      and so does one carrying a blocking secret-scan finding, naming the template and the
 *      `pattern_id` (spec-007 §4 step 5, task-135; P3.8 "Error - a built-in template carries a secret").
 *      The sources are DERIVED from this very run's `templateScaffold(template)` output via
 *      {@link builtinTemplateSources}, so the checked set and the written set cannot drift apart
 *      (there is no separate registry to forget to update). `templateScaffold` is pure and writes
 *      nothing, so computing it before the guard preserves the "before writing partial assets"
 *      ordering the fit criterion demands.
 *   6. every scaffold path stays inside the project root, is not itself a symbolic link, and is not
 *      beyond one ({@link requireScaffoldTargets}, REQ-SEC-06, task-172 / `bug-121`) — a `.wingfoil`
 *      linked to an empty directory passes guard 2 and would otherwise receive the whole scaffold.
 *
 * @param builtinTemplates - test-only override for guard 5's source list, exercising the abort path
 *   without real built-in content on disk. Omit it in production: the derived set is the contract.
 */
export function initWingfoilProject(
  root: string,
  templateName: string,
  builtinTemplates?: readonly BuiltinTemplateSource[],
): CoreResult<InitProjectValue> {
  if (!existsSync(join(root, '.git'))) {
    return coreErr({ code: 'VALIDATION', message: NOT_A_GIT_REPO });
  }
  const initialized = refuseInitializedProject(root);
  if (initialized) return initialized;
  const template = resolveTemplate(templateName);
  if (!template) {
    return coreErr({ code: 'VALIDATION', message: `unknown template "${templateName}"` });
  }

  const identity = requireGitIdentity(root);
  if (!identity.ok) return identity as CoreResult<InitProjectValue>;

  // Guard 5 — REQ-SEC-10. `templateScaffold` is pure (no I/O), so the exact file list about to be
  // written is available to check BEFORE anything is written; deriving the sources from it is what
  // keeps "installed" and "checked" the same set.
  const files = templateScaffold(template);
  const integrityFailure = verifyBuiltinTemplates(builtinTemplates ?? builtinTemplateSources(files));
  if (integrityFailure) {
    return coreErr({ code: 'VALIDATION', message: integrityFailure.message });
  }

  // Guard 6 — task-172 (REQ-SEC-06, bug-121): no scaffold path may lead outside the project root or
  // lie beyond a symbolic link. A `.wingfoil` linked to an empty directory passes guard 2.
  const targets = requireScaffoldTargets(root, files);
  if (!targets.ok) return targets as CoreResult<InitProjectValue>;

  try {
    const message = initProjectCommitMessage(template);
    const sha = initStorage(root, files, message);
    return coreOk<InitProjectValue>(
      { root, template: template.name, files: files.map((file) => file.path) },
      { sha, message },
    );
  } catch (error) {
    return coreErr({ code: 'IO', message: (error as Error).message });
  }
}

/**
 * `.wingfoil/` layout scaffolding + init routine (task-018-implement-git-backed-storage, P1.1,
 * REQ-SYS-01 git-backed single source of truth, REQ-SYS-02 decoupled pillars; spec-011-storage-layout).
 *
 * This owns the *mechanism* of laying down and committing the `.wingfoil/` skeleton — the reusable
 * substrate `wingfoil init` (task-029) builds its interactive wizard on top of. It deliberately does
 * NOT implement the CLI command, prompt for values, or populate the full spec-011 layout with real
 * pillar content: `scaffoldFiles()` returns only the minimal committed skeleton the P1.1 acceptance
 * contract requires (`dna.yaml`/`memory.yaml`/`workflows.yaml` + the `memory/` and
 * `directives/{built-in,custom}/` subfolders), and `initStorage` takes an optional `files` override so
 * task-029's wizard can pass its own richer, spec-011-complete file set (with real content) through
 * the exact same write+commit path.
 */
import { join } from 'path';

import { writeAndCommit } from './commit';

/** The WingFoil root directory name, relative to the project (git) root (spec-011-storage-layout). */
export const WINGFOIL_DIR = '.wingfoil';

/** Default git subject for the one commit `initStorage` produces (overridable via `initStorage`). */
export const INIT_COMMIT_MESSAGE = 'chore(wingfoil): initialize .wingfoil/ storage (P1.1)';

/** One file to scaffold: a root-relative (POSIX) path under `.wingfoil/` and its initial content. */
export interface ScaffoldFile {
  /** Path relative to the project root, always under `.wingfoil/`, POSIX-separated. */
  readonly path: string;
  /** Initial file content written verbatim (bytes-only — see {@link writeDocument}). */
  readonly content: string;
}

// Placeholder pillar-config stubs. Minimal, valid-YAML skeletons only — the real DNA/Memory/Workflow
// schemas are populated by their owning tasks / task-029's wizard, not by this foundational layout.
const DNA_STUB = 'version: 1\n# Project DNA (P2.4) — populated by `wingfoil init` / task-025.\n';
const MEMORY_STUB = 'version: 1\ntypes: {}\n# Memory registry (P1.13) — populated by task-029.\n';
const WORKFLOWS_STUB = 'version: 1\nincludes: []\n# Workflow config (P4.1) — populated by task-029.\n';
// Git does not track empty directories, so each required subfolder carries a `.gitkeep` placeholder;
// this makes `memory/` and `directives/{built-in,custom}/` real, committed, git-tracked directories
// (P1.1 scenario 1; P3.5 scenario 1's "And both are tracked by git" — see `scaffoldFiles`).
const GITKEEP = '';

/**
 * The default `.wingfoil/` skeleton: exactly the files the P1.1 acceptance contract
 * (P1.1-git-backed-storage.feature scenario 1) and the P3.5 directive-layout contract
 * (p3-directives/P3.5-project-directives.feature scenario 1) require, in a fixed, hand-written order.
 * Pure and deterministic — no wall-clock, no environment read — so repeated calls are byte-identical
 * (REQ-SYS-07) and callers may compare/diff the set safely.
 *
 * That order is stable but is NOT a lexical sort, which is worth stating because the literal below
 * reads like one: `'.'` (0x2E) sorts before `'/'` (0x2F), so sorting these paths would put
 * `.wingfoil/memory.yaml` BEFORE `.wingfoil/memory/.gitkeep` — the reverse of the order written here.
 * Determinism never depended on the list being sorted, only on it being fixed, which a literal is; so
 * this is a property callers must not assume, not a defect to "fix" by sorting. Contrast
 * `templateScaffold` (./templates), which genuinely does sort its output.
 *
 * `directives/` is split into `built-in/` and `custom/` per spec-011-storage-layout, each reserved by
 * its own `.gitkeep`: P3.5 requires BOTH subfolders to be tracked by git, and git tracks files rather
 * than directories, so one placeholder per subfolder is the minimum that discharges it
 * (task-054-project-directives).
 *
 * That split is also why `initWingfoilStorage` (`src/core/init.ts`) runs the REQ-SEC-10 built-in
 * integrity guard over this list before writing it: `directives/built-in/` is a built-in ASSET
 * directory, so anything non-dotfile ever added here must be schema-checked first. Adding such a file
 * needs no edit there — `builtinTemplateSources` derives the checked set from whatever this function
 * returns (bug-018-init-storage-bypasses-integrity-guard).
 *
 * `workflows/{built-in,custom}/` is deliberately NOT part of this skeleton: it is P4.17 ground, and
 * the complete spec-011 layout is `templateScaffold`'s job (see ./templates).
 */
export function scaffoldFiles(): ScaffoldFile[] {
  return [
    { path: `${WINGFOIL_DIR}/directives/built-in/.gitkeep`, content: GITKEEP },
    { path: `${WINGFOIL_DIR}/directives/custom/.gitkeep`, content: GITKEEP },
    { path: `${WINGFOIL_DIR}/dna.yaml`, content: DNA_STUB },
    { path: `${WINGFOIL_DIR}/memory/.gitkeep`, content: GITKEEP },
    { path: `${WINGFOIL_DIR}/memory.yaml`, content: MEMORY_STUB },
    { path: `${WINGFOIL_DIR}/workflows.yaml`, content: WORKFLOWS_STUB },
  ];
}

/**
 * Write every file in `files` (default: {@link scaffoldFiles}) under `root` and stage exactly those
 * paths as a **single** commit (via {@link commitPaths}), returning the new commit's sha.
 *
 * Pure mechanism: it assumes `root` is already a validated git root (the "not a git repository" guard
 * and the git-identity pre-flight live in the `CoreResult` wrapper, `src/core/init.ts`, so both the
 * CLI and MCP surfaces enforce them identically — REQ-SYS-05). Only the given paths are staged, never
 * `git add -A`, so no unrelated working-tree change is swept into the init commit.
 */
export function initStorage(
  root: string,
  files: readonly ScaffoldFile[] = scaffoldFiles(),
  message: string = INIT_COMMIT_MESSAGE,
): string {
  return writeAndCommit(root, files.map((file) => ({ path: file.path, content: file.content })), message);
}

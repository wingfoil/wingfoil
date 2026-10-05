/**
 * `storage` module — git-backed file storage (YAML + Markdown); single source of truth
 * (REQ-SYS-01, task-003-git-backed-sot). Single entry point for: resolving the WingFoil project
 * root, detecting initialization state, rendering a Memory type's `path` pattern
 * (spec-001-memory-yaml-schema) against concrete values, reading/writing document bytes, and
 * computing the whole-project state snapshot the REQ-SYS-01 fit criterion is stated in terms of.
 */
export const MODULE_NAME = 'storage' as const;

export { StorageError, E_GIT_READ_FAILED, E_INVALID_REVISION, E_NO_GIT_ROOT, E_NOT_AT_GIT_ROOT, E_MISSING_PATH_VALUE } from './errors';
export { findGitRoot, resolveProjectRoot } from './git-root';
export { detectInitState } from './init-state';
export type { InitState } from './init-state';
// `resolveMemoryPath` (the unconfined resolver) is deliberately NOT re-exported (task-131, `bug-122`);
// the guarded `resolveConfinedMemoryPath` is imported from `./memory-path` by its callers.
export { renderMemoryPath } from './memory-path';
export { escapesRoot, resolveRealPathInRoot } from './confinement';
export type { RealPathResolution } from './confinement';
export { extractFrontmatter, splitFrontmatter } from './frontmatter';
export type { FrontmatterSplit } from './frontmatter';
export { readDocument, documentExists, removeDocument, writeDocument } from './document';
export { changedPathsBetween, commitParent, commitPaths, EMPTY_TREE_SHA, listBlobEntriesAtRev, listPathsAtRev, listPathsAtRevs, pathPorcelainStatus, readPathAtRev, readPathsAtRev, resolveCommitAtRev } from './commit';
export type { BlobEntry } from './commit';
export type { CommitOptions } from './commit';
export { GIT_READ_MAX_BUFFER, runGitRead, runGitReadBytes } from './git-read';
export type { GitReadOptions, GitReadResult } from './git-read';
export { initStorage, scaffoldFiles, WINGFOIL_DIR, INIT_COMMIT_MESSAGE } from './layout';
export type { ScaffoldFile } from './layout';
export {
  TEMPLATES,
  TEMPLATE_NAMES,
  DEFAULT_TEMPLATE,
  resolveTemplate,
  templateScaffold,
  initProjectCommitMessage,
  builtinTemplateSources,
  BUILTIN_DIRECTIVES_DIR,
  BUILTIN_WORKFLOWS_DIR,
} from './templates';
export type { TemplateDefinition, BuiltinTemplateKind, BuiltinTemplateSource } from './templates';
export { BUILTIN_DIRECTIVE_TEMPLATES, BUILTIN_DIRECTIVE_IDS, builtinDirectiveMd } from './builtin-directives';
export type { BuiltinDirectiveTemplate } from './builtin-directives';
export { computeStateSnapshot, serializeSnapshot } from './snapshot';
export type { SnapshotEntry } from './snapshot';

/**
 * The door of the read primitives a surface (`src/cli`, `src/mcp`) still needs of its own (`spec-006` §1).
 *
 * The surfaces never import `src/storage` or `src/memory` directly; the few reads that are not a core operation —
 * the project root of the `bin` entry point, the build stamp and the template names of `wingfoil init`'s help, and
 * the raw reads of the MCP Memory Resources and role Prompts — are re-exported here, unchanged. This module is not
 * part of the `src/core` barrel (`./index.ts`), so the barrel's public exports stay what they are
 * (task-354, `bug-345`).
 */
export { resolveProjectRoot } from '../storage/git-root';
export {
  DEFAULT_TEMPLATE,
  readBuildStamp,
  readDocument,
  resolveTemplate,
  splitFrontmatter,
  TEMPLATE_NAMES,
  WINGFOIL_DIR,
} from '../storage';
export { findMemoryDocumentByTypeAndId, listMemoryDocumentsByType } from '../memory/query';

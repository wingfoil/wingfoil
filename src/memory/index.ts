/**
 * `memory` module — Project Memory pillar; git-backed documents with per-type state machines
 * (P1.13). `memory.yaml`'s schema (spec-001-memory-yaml-schema) lives here — the pillar owns its own
 * independent schema (REQ-SYS-02); `src/core`'s loader wires it through the shared validation
 * pipeline. The transition-legality engine (REQ-SYS-04, task-005-per-type-state-machines) also lives
 * here — it consumes the schema's already-validated `StateMachine` shape, it does not re-validate it.
 * Further Memory behavior (per-type CLI verbs, frontmatter schema) lands in later tasks.
 *
 * task-008-dna-memory-query-latency adds the `memory search`/`memory history` query-path
 * *primitives* (REQ-PERF-02) `./query` and `./history` — the performance-bearing foundation
 * `task-021-implement-memory-search` (P1.5) and `task-049-memory-history` (P1.10) built their
 * CLI/MCP surface on top of; see those modules' own doc comments and the task's Execution Notes for
 * the foundation/feature scoping decision.
 *
 * task-015-complete-audit-trail adds `./audit` (REQ-SEC-02) — the audit/verification layer built on
 * `./history`'s raw git-log walk: attribution auditing (0 "unknown author"), `Approver:`/`Reason:`
 * commit-body parsing, full transition reconstruction, and the frontmatter-vs-commit-message
 * consistency check. It is deliberately read-only/verification-only — write-time git-identity
 * enforcement is task-014-git-identity-required's (REQ-SEC-01) separate concern.
 *
 * task-022-implement-memory-entries adds `./entry` (P1.11) — `writeMemoryEntry`, the reusable,
 * throwing library primitive that composes `resolveConfinedMemoryPath` (task-017, REQ-SEC-06),
 * `writeDocument`, and `commitPaths` (task-018) into the one "resolve confined path, write bytes,
 * one commit" Memory-entry write path (REQ-SYS-01/REQ-SYS-03). `wingfoil memory add`/`submit`
 * (task-020) wire this in behind a `CoreResult`; this module stays a plain, throwing composition,
 * matching every other `src/storage` primitive it builds on.
 *
 * task-036-frontmatter-lifecycle-validation adds `validateFrontmatterState` (REQ-STATE-01,
 * spec-010-memory-frontmatter-schema) to `./state-machine` — the per-type membership check on a
 * document's frontmatter `status` value itself, independent of any transition attempt (distinct from
 * `resolveTransitionTarget`'s verb-based transition legality). `task-045-memory-submit` (P1.6) is the
 * first CLI-facing consumer.
 *
 * task-045-memory-submit adds the pieces every Memory transition verb shares — `resolveTypeTransition`
 * (the `dl-032` illegal-transition contract), `./commit-message` (the one commit-message formatter) and
 * `./frontmatter-edit` (byte-preserving field edits) — plus `./submit`, the submit-specific rules.
 */
export const MODULE_NAME = 'memory' as const;

export { MemoryYaml, MemoryTypeEntry, RESERVED_TYPE_NAMES, StateMachine, TemplateConfig } from './schema';
export {
  ARCHIVED_STATUSES,
  DEFAULT_STATE_MACHINE,
  DEPRECATED_STATE,
  E_INVALID_STATE,
  E_INVALID_TRANSITION,
  isArchivedStatus,
  isMachineEdge,
  resolveStateMachine,
  resolveSupersedeTarget,
  resolveTransitionTarget,
  resolveTypeTransition,
  SUPERSEDED_STATE,
  supersedesEdgeFrom,
  validateFrontmatterState,
} from './state-machine';
export type { TransitionOp } from './state-machine';
export {
  computeMemoryContentRoots,
  E_EMPTY_SEARCH_QUERY,
  findMemoryDocumentById,
  findMemoryDocumentByIdAtRev,
  findMemoryDocumentByTypeAndId,
  findMemoryDocumentByTypeAndIdAtRev,
  firstLineOf,
  listMemoryDocumentPaths,
  listMemoryDocumentPathsAtRev,
  listMemoryDocumentsByType,
  loadMemoryDocumentsAtRev,
  loadMemoryDocumentSummary,
  loadMemoryDocumentSummaryAtRev,
  memoryUnreadableDiagnostic,
  searchMemoryDocuments,
  validateSearchQuery,
  W_MEMORY_UNREADABLE,
} from './query';
export type {
  MemoryDocumentFrontmatterSummary,
  MemoryDocumentSummary,
  MemoryIdLookupOptions,
  MemoryScanOptions,
  MemorySearchMatch,
  MemorySearchOptions,
  MemoryTypeScanOptions,
} from './query';
export { getMemoryHistory } from './history';
export type { MemoryHistoryEntry } from './history';
export { writeMemoryEntry } from './entry';
export type { MemoryEntryWrite } from './entry';
export {
  expandFieldTokens,
  formatIdDate,
  hasNumericToken,
  highestSequenceNumber,
  identDate,
  nextSequenceNumber,
  parseSetOptions,
  parseTags,
  readAuthorDate,
  renderAddDocument,
  slugifyTitle,
  unknownSetNames,
  writtenFields,
} from './add';
export type { AddDocumentFields, IdTokenSources, ParsedSetOptions } from './add';
export {
  formatMemoryCommitMessage,
  normalizeReason,
  parseApproverTrailerLine,
  parseReasonBlock,
  parseVersionTrailer,
  reasonDefect,
  reasonDefectMessage,
  reasonRefusalMessage,
} from './commit-message';
export type { CommitApprover, MemoryCommitMessageInput, ReasonDefect } from './commit-message';
export {
  describeDocumentChanges,
  removeFrontmatterField,
  setFrontmatterField,
  verifyDocumentEdit,
  verifyFrontmatterEdit,
} from './frontmatter-edit';
export type { DocumentScope } from './frontmatter-edit';
export { missingRequiredFields, notApplicableRefusals, REJECTION_REASON_FIELD, renderSubmitDocument } from './submit';
export type { NotApplicableProblem, NotApplicableRefusal } from './submit';
export { renderRejectDocument } from './reject';
export {
  auditAttribution,
  CONFIGURATION_SCOPES,
  isValidAttribution,
  MEMORY_OPERATIONS,
  parseApprovalMetadata,
  parseCommitReason,
  parseBracketHops,
  parseMemoryOperation,
  reconstructMemoryTransitions,
  verifyTransitionConsistency,
} from './audit';
export type {
  AttributionEntry,
  ApprovalMetadata,
  BracketHop,
  MemoryTransition,
  ConsistencyMismatch,
  IllegalHop,
  MemoryOperation,
  ReconstructOptions,
  TransitionFinding,
  UnparseableTransition,
} from './audit';

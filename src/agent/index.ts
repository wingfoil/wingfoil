/**
 * `agent` module — launching an agent's own CLI through a declared adapter (`adr-012`,
 * `spec-016-agent-execution` §1). It owns adapter manifest loading and validation (task-177: the strict
 * schema §2.2, the placeholder rules §2.3, discovery and loading at a revision §2.1, §3.2 step 5, and
 * the report of what under `.wingfoil/agents/` is not an adapter, `bug-290`), the run log (task-206),
 * and `agent execute`'s pipeline up to the spawn (task-218, `./execute.ts`); the launch itself is
 * task-228's. Its operations are registered under the `agent` `CoreModule` (`src/core/index.ts`).
 */
export const MODULE_NAME = 'agent' as const;

export { ADAPTER_MANIFEST_FORMAT, AdapterManifest } from './schema';
export { E_ADAPTER_MANIFEST, parseAdapterManifest } from './manifest';
export type { AdapterKind, AdapterSource } from './manifest';
export { ADAPTER_PLACEHOLDERS, E_ADAPTER_PLACEHOLDER, placeholderIssues, requiredPlaceholderIssues } from './placeholders';
export type { AdapterPlaceholder } from './placeholders';
export { adapterTreeDiagnosticsAtRev, ADAPTERS_DIR_PATH, duplicateAdapterRefusal, E_ADAPTER_DUPLICATE, listAdaptersAtRev, loadAdapter, W_ADAPTER_IGNORED } from './discovery';
export type { AdapterEntry, LoadedAdapter } from './discovery';
export {
  ADHOC_PHASE,
  deriveNotesField,
  executionNotesSection,
  formatRunId,
  isRunId,
  nextRunId,
  NO_WORKFLOW,
  NOT_REPORTED,
  notesField,
  parseRunLog,
  readRunLogAt,
  recordRun,
  recordSubject,
  requireWritableRunLog,
  resolveRunLogPath,
  runIdElementId,
  RUN_RECORD_KEYS,
  RUN_TOKEN_KEYS,
  runLogPreflight,
  serializeRunRecord,
} from './run-log';
export type {
  DeriveNotesFieldInput,
  NextRunIdInput,
  NotesFieldInput,
  RecordedRun,
  ReportedCount,
  RunRecord,
  RunTokens,
} from './run-log';
export {
  agentCommandFound,
  agentExecutePipeline,
  DEFAULT_ROLE,
  DEFAULT_ROLE_WARNING,
  FRESH_MODE,
  handoffLine,
  launchPlan,
  MCP_PREFLIGHT_TIMEOUT_MS,
  MCP_UNREACHABLE_MESSAGE,
  mcpPreflight,
  renderBootstrap,
  renderMcpTemplate,
  runningBuildMcpServer,
  selectAgent,
  withRunFiles,
} from './execute';
export type {
  AgentExecuteHost,
  AgentExecuteRequest,
  AgentLaunchPlan,
  BootstrapInput,
  McpPreflightInput,
  McpServerCommand,
  PreparedLaunch,
  RunFileName,
} from './execute';

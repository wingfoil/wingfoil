/**
 * `agent` module — launching an agent's own CLI through a declared adapter (`adr-012`,
 * `spec-016-agent-execution` §1). It owns adapter manifest loading and validation (task-177: the strict
 * schema §2.2, the placeholder rules §2.3, discovery and loading at a revision §2.1, §3.2 step 5, and
 * the report of what under `.wingfoil/agents/` is not an adapter, `bug-290`), the run log (task-206),
 * `agent execute`'s pipeline up to the spawn (task-218, `./execute.ts`) and the launch (task-228,
 * `./launch.ts`), interactive or headless with an optional time bound (task-335, `./duration.ts`), and the per-clone session salt
 * of an assigned session id (task-338, `./session-salt.ts`). Its operations are registered under the `agent` `CoreModule` (`src/core/index.ts`).
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
  isRunLogPath,
  nextRunId,
  NO_WORKFLOW,
  NOT_REPORTED,
  notesField,
  parseRunLog,
  readRunLogAt,
  readRunLogsAt,
  recordRun,
  recordSubject,
  requireWritableRunLog,
  resolveRunLogPath,
  runIdElementId,
  RUN_RECORD_KEYS,
  RUN_TOKEN_KEYS,
  runLogDirPrefix,
  runLogPreflight,
  serializeRunRecord,
  W_RUN_LOG_SYMLINK,
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
  agentEnvironment,
  assignedSessionId,
  CLI_VARIABLE,
  launchAgent,
  launchBanner,
  launchPermissions,
  LOOKUP_TIMEOUT_MS,
  readJsonPath,
  renderLaunchArgv,
  runSummaryLine,
  SESSION_ID_NAMESPACE,
  TIMEOUT_GRACE_MS,
  uuidV5,
} from './launch';
export type { LaunchHost, LaunchInput, LaunchKindRun, LaunchValues, RecordedLaunch, SpawnAgent } from './launch';
export { SESSION_SALT_FILE, sessionSalt } from './session-salt';
export { MAX_TIMEOUT_MS, parseDuration } from './duration';
export type { TimeBound } from './duration';
export {
  agentCommandFound,
  attributionLine,
  ATTRIBUTION_LINE_PREFIX,
  agentExecutePipeline,
  cliShim,
  DEFAULT_ROLE,
  DEFAULT_ROLE_WARNING,
  DRY_RUN_TERMINAL_WARNING,
  FRESH_MODE,
  handoffLine,
  launchPlan,
  MCP_PREFLIGHT_TIMEOUT_MS,
  MCP_UNREACHABLE_MESSAGE,
  mcpPreflight,
  renderBootstrap,
  renderMcpTemplate,
  resolveLaunchKind,
  runningBuildCli,
  runningBuildMcpServer,
  selectAgent,
  withRunFiles,
} from './execute';
export type {
  AgentExecuteHost,
  AgentExecuteRequest,
  AgentLaunchPlan,
  BootstrapInput,
  CliShim,
  McpPreflightInput,
  McpServerCommand,
  PreparedLaunch,
  RunFileName,
} from './execute';

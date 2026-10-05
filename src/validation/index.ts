/**
 * `src/validation` — the shared validation & ID module (spec-009-validation-strategy,
 * task-002-validation-id-engine). Single entry point every schema (spec-001/002/003 and the
 * frontmatter schema) and CLI/MCP surface (spec-008) calls, so parsing, unknown-field handling,
 * error-code naming, and ID generation stay uniform project-wide.
 */
export {
  E_VALIDATION,
  E_YAML_PARSE_ERROR,
  EXIT_INTEGRITY,
  EXIT_VALIDATION,
  ValidationError,
} from './errors';
export type { ValidationIssue } from './errors';
export { DiagnosticsError, formatDiagnostic } from './diagnostic';
export type { Diagnostic, DiagnosticSeverity } from './diagnostic';
export { toValidationError } from './error-mapper';
export { emitUnknownFieldWarning } from './warning';
export type { HasShape } from './warning';
export { runValidation } from './two-pass';
export type { RunValidationOptions, SemanticCheck } from './two-pass';
export { generateId, idPatternIssues, isIdPiece, isNumericToken, patternTokens, patternToRegExp, patternToSource, ID_CHAR_CLASS } from './id';
export { parseYaml } from './yaml';
export {
  ADAPTER_MANIFEST_FORMAT,
  DIRECTIVE_FORMAT,
  DNA_YAML_FORMAT,
  E_INVALID_FORMAT,
  MEMORY_TEMPLATE_FORMAT,
  MEMORY_YAML_FORMAT,
  ROLES_YAML_FORMAT,
  WORKFLOW_FORMAT,
  WORKFLOWS_YAML_FORMAT,
  formatField,
  newerFormatIssue,
  newerFormatMessage,
  refuseNewerFormat,
} from './format';
export {
  SECRET_PATTERNS,
  SCAN_SURFACE_ROOTS,
  DEFAULT_IGNORE_FILE,
  scanText,
  scanProjectSurface,
  isBinaryContent,
  loadIgnoreGlobs,
  matchesIgnoreGlob,
} from './secret-scan';
export type {
  SecretSeverity,
  SecretPattern,
  ExemptReason,
  SecretFinding,
  ExemptFinding,
  ScanResult,
  ScanTextOptions,
  ScanProjectOptions,
} from './secret-scan';

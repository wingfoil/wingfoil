/**
 * The configuration diagnostic shape (spec-003-workflows-yaml-schema § "Diagnostics"; shared by
 * spec-017-workflow-commands-and-state-deduction §2): `{ code, severity, file, path, message }`,
 * carried by commands in one array named `diagnostics`.
 *
 * A {@link Diagnostic} is a {@link ValidationIssue} with a `severity`, so a list of them can ride a
 * {@link ValidationError} unchanged; {@link DiagnosticsError} is the error a loader throws when the
 * list holds at least one `error`.
 */
import { EXIT_VALIDATION, ValidationError, ValidationIssue } from './errors';

/** `error` makes the operation fail; `warning` is reported and the operation goes on (spec-003). */
export type DiagnosticSeverity = 'error' | 'warning';

/** One load-time or deduction diagnostic (spec-003 § "Diagnostics", "Shape"). */
export interface Diagnostic extends ValidationIssue {
  /** `E_*` for an error, `W_*` for a warning. */
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  /** The configuration file, relative to `.wingfoil/` (e.g. `workflows/custom/dev-loop.yaml`). */
  readonly file: string;
  /** Locates the field inside `file`, e.g. `phases[3].include`; `''` for the whole file. */
  readonly path: string;
  readonly message: string;
}

/**
 * One diagnostic as a reason line: `<code> <path> (<file>): <message>` — the shape every
 * {@link ValidationError} reason has always had, so the reason names where to look even on a surface
 * that renders no `details`.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.code} ${diagnostic.path ? `${diagnostic.path} ` : ''}(${diagnostic.file}): ${diagnostic.message}`;
}

/**
 * One diagnostic as a warning line's text: `<code> (<file>): <message>`, or `<code>: <message>` when `file` is empty
 * (`spec-008` §6's form, `spec-016` §3.3 and §5). The one form of a diagnostic reported as a success warning: `agent
 * list`, `agent execute`, `workflow next` and `workflow status` write each entry of their `diagnostics` with it (`dl-176`
 * (a), task-373).
 */
export function diagnosticWarning(diagnostic: Diagnostic): string {
  return diagnostic.file === undefined || diagnostic.file === '' ? `${diagnostic.code}: ${diagnostic.message}` : `${diagnostic.code} (${diagnostic.file}): ${diagnostic.message}`;
}

/**
 * The failure of a load whose {@link diagnostics} hold at least one error (spec-003 § "Diagnostics"):
 * `VALIDATION`, exit `1` ({@link EXIT_VALIDATION}). Its `message` — the reason the operation reports —
 * is the **first error** in {@link formatDiagnostic}'s form, and {@link diagnostics} is the whole
 * ordered list, warnings included, for the caller to carry in `details` (`dl-055`).
 */
export class DiagnosticsError extends ValidationError {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    super([...diagnostics], EXIT_VALIDATION);
    const first = diagnostics.find((d) => d.severity === 'error') ?? diagnostics[0];
    this.message = first ? formatDiagnostic(first) : 'validation failed';
    this.name = 'DiagnosticsError';
    this.diagnostics = diagnostics;
    Object.setPrototypeOf(this, DiagnosticsError.prototype);
  }
}

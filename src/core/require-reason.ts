/**
 * `--reason` mandatory-argument pre-flight check (REQ-SEC-04 — task-041-mandatory-reason-on-verbs).
 *
 * Decisions must be explainable in the audit trail: `memory approve` (P1.7) and `memory reject`
 * (P1.8) both record an approver/rejecter identity, an ISO-8601 timestamp, and a reason in the
 * resulting git commit body (P1.7/P1.8 BDD "the git commit records the approver identity, timestamp,
 * and reason"). The reason text can only be recorded if the caller supplied one, so both operations
 * refuse before any read/write when `--reason` is omitted — the argument-validation step every
 * mutating `CoreFn` already performs inline for its own required options (e.g. `memoryAddFn`'s
 * `--type`/`--title` checks, task-020), factored out here once both approve and reject need the
 * identical check (this task is their shared prerequisite, per its own Implementation Notes).
 *
 * This mirrors `requireGitIdentity`'s (`./git-identity.ts`, REQ-SEC-01, task-014) role and calling
 * convention: a mutating `CoreFn` calls it first, before any registry lookup or file access, so an
 * omitted `--reason` makes no change (REQ-SEC-04's fit criterion). Unlike `requireGitIdentity` (an
 * ambient precondition, not tied to a CLI argument, returning a `CoreResult.error` mapped to exit 1)
 * this is an ARGUMENT-shape problem — spec-005-cli-command-contract §1's "missing required argument"
 * case — so, matching `memoryAddFn`'s own `--type`/`--title` checks and `dnaSetFn`'s invalid-key-path
 * check, it `throw`s a `UsageError` (exit **2**, `./exit-code.ts`'s `exitCodeForThrow`) rather than
 * returning a `CoreResult`.
 *
 * `memory deprecate` (P1.9, task-048) deliberately does NOT call {@link requireReason}:
 * `spec-008-cli-grammar.md` §2 marks `--reason` optional "elsewhere (e.g. `memory deprecate`)", and
 * `P1.9-memory-deprecate.feature` has no "missing reason" error scenario (unlike P1.7/P1.8). Since
 * `task-072` it calls {@link optionalReason} instead of reading `options?.reason` raw.
 *
 * `task-072-fix-reason-trailer-contract` (`dl-067-reason-trailer-contract`, fixing `bug-042`) widens
 * both checks from "was a reason given?" to "can this reason be RECORDED?". Those turned out to be
 * different questions: `--reason ""` *was* given, was accepted at exit `0`, and left a bare `Reason:`
 * that made `wingfoil memory history` report an approval gate crossed by nobody, for no reason. The
 * shape rule itself is not decided here — it lives once, in `src/memory/commit-message.ts`, beside the
 * formatter that writes the trailer and consumed by the reader in `src/memory/audit.ts` (dl-067
 * clause 5). This module only maps a defect onto the CLI's usage-error exit code.
 */
import { normalizeReason, reasonRefusalMessage, type ReasonContext } from '../memory/commit-message';

import { UsageError } from './usage-error';

/** Exact refusal message required by REQ-SEC-04's fit criterion (spec-008-cli-grammar §2's ground-truth wording) — do not reword. */
const MISSING_REASON_ERROR = 'missing required argument: --reason';

/**
 * The given reason in its declared normal form, or a `UsageError` (exit 2) naming the defect that
 * makes it unrecordable — blank, carrying a control character other than tab or newline, carrying a
 * reserved trailer line, or ending in a paragraph shaped like one (`reasonRefusalMessage`,
 * `src/memory/commit-message.ts`).
 *
 * The message is deliberately NOT {@link MISSING_REASON_ERROR}: that string answers the *omitted*
 * case, and `spec-008-cli-grammar` §2 plus the `P1.7`/`P1.8` BDD features quote it verbatim for that
 * case alone, so reusing it would make those scenarios ambiguous about which failure they pin
 * (dl-067 S1).
 */
function recordableReason(reason: string, context: ReasonContext): string {
  const refusal = reasonRefusalMessage(reason, context);
  if (refusal !== null) {
    throw new UsageError(refusal);
  }
  return normalizeReason(reason);
}

/**
 * Return the `--reason` value out of a `CoreFn`'s parsed `options` (the `ParamsContext.options`
 * value-bearing seam, `../core/registry.ts` — the same one `memoryAddFn` reads `--type`/`--title`/
 * `--tags` from), normalized to the form the commit trailer records; or throw a `UsageError` (exit 2)
 * when it is absent (`options` itself undefined, or present without a `reason` key) or cannot be
 * recorded. Call this BEFORE any registry/document lookup in a mutating `CoreFn` so a refused
 * `--reason` makes no change.
 *
 * Returning the NORMALIZED text rather than the raw argument is what keeps the commit trailer and
 * `memory reject`'s `rejection_reason` frontmatter field (`spec-010` — the one verb that writes the
 * reason twice) carrying byte-identical text: the rule is applied once, here, not at each sink.
 *
 * `context.approval` is `true` when the operation records the reason under an `Approver:` line — `approve`,
 * `reject`, `amend`, `workflow finalize` on an `approval:` phase, `workflow adopt --plan --apply`, `workflow rekey`:
 * a line starting `Co-Authored-By:` or `AI-Model:` is then refused too (`spec-018` §3.3), because an approval never
 * carries an agent trailer.
 */
export function requireReason(options: Readonly<Record<string, string>> | undefined, context: ReasonContext = {}): string {
  const reason = options?.reason;
  if (reason === undefined) {
    throw new UsageError(MISSING_REASON_ERROR);
  }
  return recordableReason(reason, context);
}

/**
 * The same, for a verb whose `--reason` is OPTIONAL — `memory deprecate` (`dl-027` option (a)):
 * `undefined` when none was given (the verb then exits `0` and commits a subject-only message), the
 * normalized text when one was.
 *
 * A reason that is *declared but empty* is a usage error here too, exactly as on the approval gates
 * (dl-067 S2, ratified). `buildOptionValues` (`src/cli/program.ts`) keeps any `typeof value ===
 * 'string'` precisely so a core op can tell "not given" from "given empty"; honouring that
 * distinction means refusing the empty one, not silently discarding it. This changes a merged verb's
 * behaviour — nothing pinned the old one, and the old one was bug-042 F2 on the verb where it bites
 * hardest, `deprecate` having no `Approver:` line of its own to lose.
 */
export function optionalReason(options: Readonly<Record<string, string>> | undefined): string | undefined {
  const reason = options?.reason;
  return reason === undefined ? undefined : recordableReason(reason, {});
}

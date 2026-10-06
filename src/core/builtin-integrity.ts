/**
 * Built-in template schema check (task-044-builtin-template-integrity, REQ-SEC-10 "Schema checks on
 * built-in templates"): "Built-in directive and workflow templates are schema-checked before
 * installation during `init`... A corrupted or schema-invalid built-in template aborts `init` before
 * writing partial assets, with a message naming the failing template"
 * (docs/02_requirements/03_sard/05_security-compliance.md).
 *
 * SCOPE, per `dl-031-req-sec-10-integrity-depth` (`ready`), which retitled the requirement: schema
 * validation IS the REQ-SEC-10 contract. There is deliberately NO digest and NO manifest here — the
 * threat the requirement's rationale names is accidental corruption (truncated file, bad merge), not
 * post-install tampering; a manifest shipped inside the same package is no control against an
 * adversary who can rewrite a template; and a content hash would add a line-ending / encoding /
 * ordering determinism surface against REQ-SYS-07. Distribution-channel assurance lives in `adr-009`
 * / `spec-015` (npm provenance) instead. Do not "strengthen" this module with hashing.
 *
 * The same pre-write pass also runs the spec-007 §4 step 5 secret scan over each source (task-135,
 * `bug-038`), which is a separate gate from the REQ-SEC-10 schema check, serving REQ-SEC-08: a
 * secret in a shipped template would be installed into every new project. It is a regex scan of
 * the content, not a digest, so the paragraph above still holds.
 *
 * Since task-196 it also checks the built-in agent adapter manifests `init` installs under
 * `.wingfoil/agents/built-in/` (kind `adapter`, `spec-016` §2.1), against the task-177 manifest schema.
 *
 * A cross-pillar concern by construction — checking a directive source needs the Directives pillar's
 * `DirectiveFrontmatter` schema, checking a workflow source needs the Workflow pillar's `Workflow`
 * schema and its loader rules, an adapter source the `agent` module's manifest parser — so, per `src/core/loaders.ts`'s own precedent ("Cross-file concerns ... need the caller to
 * have actually loaded the referenced files ... live in the loader, not [a pillar] schema module"),
 * this lives in `core`, not in either pillar module or in `storage` (which only carries the raw
 * {@link BuiltinTemplateSource} shape — see `src/storage/templates.ts`). Reuses the exact same
 * two-pass validation primitives (`parseYaml`, `runValidation`) every pillar loader already uses, so a
 * built-in source is checked against precisely the same schema its custom counterpart would be loaded
 * with — no bespoke re-implementation of YAML/frontmatter parsing.
 *
 * `verifyBuiltinTemplates` is a pure function of its input list (REQ-SYS-07: no wall-clock, no
 * randomness) — the same corrupted input always yields the same failure, and callers may pass a
 * fixture list in tests via {@link BuiltinTemplateSource} without touching disk.
 */
import { parseAdapterManifest } from '../agent/manifest';
import { DirectiveFrontmatter } from '../directives/schema';
import { BUILTIN_ADAPTERS_DIR, extractFrontmatter, type BuiltinTemplateKind, type BuiltinTemplateSource } from '../storage';
import { parseYaml, runValidation, scanText } from '../validation';
import { Workflow } from '../workflow/schema';

import { workflowFileDiagnostics } from './workflow-diagnostics';

export type { BuiltinTemplateKind, BuiltinTemplateSource } from '../storage';

/**
 * The first built-in template source {@link verifyBuiltinTemplates} found invalid: its `name`/`kind`
 * (identifying which source failed) plus the exact, already-formatted abort `message` — either the
 * P3.8 directive wording or the P4.17 workflow wording, per REQ-SEC-10's fit criterion.
 */
export interface BuiltinIntegrityFailure {
  readonly name: string;
  readonly kind: BuiltinTemplateKind;
  readonly message: string;
  /**
   * The spec-007 §2 `pattern_id` of the blocking finding, present only when the source failed the
   * secret scan ({@link secretScanFailure}) rather than its schema check.
   */
  readonly patternId?: string;
}

/**
 * `true` iff `source.content` parses as a `.md` document with a frontmatter block that validates
 * against `DirectiveFrontmatter` (the same schema `core/loaders.ts`'s `loadDirectives` runs custom
 * directive files through). Any parse or schema failure — missing frontmatter, unparsable YAML, a
 * missing required field — is "corrupted" for REQ-SEC-10's purposes; the exact cause is not surfaced
 * (the fit criterion only requires naming *which* template failed, not why).
 */
function isValidDirectiveSource(source: BuiltinTemplateSource): boolean {
  const frontmatterText = extractFrontmatter(source.content);
  if (frontmatterText === null) return false;
  try {
    const data = parseYaml(frontmatterText, source.name);
    runValidation(DirectiveFrontmatter, data, source.name);
    return true;
  } catch {
    return false;
  }
}

/**
 * `true` iff `source.content` parses as YAML, validates against the `Workflow` schema (the same
 * schema `core/loaders.ts`'s `loadWorkflowsYaml` runs every included workflow file through), and
 * raises no error under the loader's per-file rules (`workflowFileDiagnostics`, spec-003 §
 * "Diagnostics") — so a template that passes integrity also loads (task-196, `bug-183`: a template
 * with neither `kind` nor `startable`/`includable` used to pass here and be refused by the loader).
 *
 * The template is checked as the only file of a registry whose names are NOT complete: a rule that
 * needs another file (an `include` naming a workflow outside the template) is undecidable here, and
 * the loader's own rule is to report nothing it cannot decide. Warnings never fail it, as they never
 * fail a load.
 */
function isValidWorkflowSource(source: BuiltinTemplateSource): boolean {
  let workflow: Workflow;
  try {
    workflow = runValidation(Workflow, parseYaml(source.content, source.name), source.name);
  } catch {
    return false;
  }
  const index = { byName: new Map([[workflow.name, 0]]), namesComplete: false };
  const loaded = [{ file: source.name, workflow, rawName: workflow.name }];
  return !workflowFileDiagnostics(loaded, index, 0).some((diagnostic) => diagnostic.severity === 'error');
}

/**
 * `true` iff `source.content` is a valid BUILT-IN adapter manifest (`spec-016` §2.2–§2.3, task-196):
 * the task-177 parser `loadAdapter` runs, with kind `built-in` (so `verified_with` is required) and
 * the source's name as the file basename the manifest's `name` must equal.
 */
function isValidAdapterSource(source: BuiltinTemplateSource): boolean {
  try {
    parseAdapterManifest(source.content, {
      name: source.name,
      kind: 'built-in',
      file: `${BUILTIN_ADAPTERS_DIR}/${source.name}.yaml`,
    });
    return true;
  } catch {
    return false;
  }
}

/** How one {@link BuiltinTemplateKind} is checked, and what its failure message reads. */
interface IntegrityPolicy {
  readonly isValid: (source: BuiltinTemplateSource) => boolean;
  readonly message: (name: string) => string;
}

/**
 * Per-kind schema-check policy: the `isValid` predicate to apply and the exact REQ-SEC-10 abort-message
 * builder to use when it fails. Keyed by {@link BuiltinTemplateKind} so each kind's validator and its
 * BDD wording live together and `verifyBuiltinTemplates` branches on `kind` exactly once. The message
 * strings of the first two kinds are verbatim BDD contracts — P3.8 "Error - a built-in template fails
 * its integrity check" and P4.17 "Error - a built-in workflow template is structurally invalid" — do
 * not reword. The `adapter` kind (task-196) follows the directive message's shape.
 *
 * Declared as an EXHAUSTIVE `Record` so widening {@link BuiltinTemplateKind} is a compile error until
 * the new kind gets a policy; look it up only through {@link policyFor}, never by bare indexing.
 */
const INTEGRITY_POLICY: Readonly<Record<BuiltinTemplateKind, IntegrityPolicy>> = {
  directive: {
    isValid: isValidDirectiveSource,
    message: (name) => `built-in directive template integrity check failed: ${name}`,
  },
  workflow: {
    isValid: isValidWorkflowSource,
    message: (name) => `built-in workflow template invalid: ${name}`,
  },
  // task-196: the built-in directive's message shape; no BDD scenario pins this wording yet.
  adapter: {
    isValid: isValidAdapterSource,
    message: (name) => `built-in adapter template integrity check failed: ${name}`,
  },
};

/**
 * The REQ-SEC-10 message for a source whose `kind` has no policy — the fail-closed branch. Not a BDD
 * contract string (the P3.8/P4.17 scenarios only cover the two known kinds), but it obeys the fit
 * criterion's one requirement of every abort message: it NAMES the failing template. The offending
 * `kind` is echoed so the operator can see what arrived.
 */
function unknownKindMessage(name: string, kind: string): string {
  return `built-in template integrity check failed: ${name} (unrecognized kind "${kind}")`;
}

/**
 * The policy for `kind`, or `undefined` when there is none.
 *
 * `INTEGRITY_POLICY[kind]` on its own is FAIL-OPEN at runtime: TypeScript types the result as always
 * present, but a `kind` outside the union — reachable through a cast, a JS caller, a JSON boundary, or
 * a future disk-derived source list — yields `undefined` (or, for `constructor`/`toString`/`__proto__`,
 * an inherited `Object.prototype` member), and the call on it throws a `TypeError`. That throw escapes
 * `initWingfoilProject`, whose guard-5 call sits outside its `try`/`catch`, as an uncaught exception
 * instead of the `VALIDATION` CoreResult / exit 1 REQ-SEC-10 demands. `hasOwnProperty` keeps inherited
 * members out, so an unrecognized kind resolves to `undefined` and the caller fails it closed.
 */
function policyFor(kind: BuiltinTemplateKind): IntegrityPolicy | undefined {
  return Object.prototype.hasOwnProperty.call(INTEGRITY_POLICY, kind) ? INTEGRITY_POLICY[kind] : undefined;
}

/**
 * The spec-007 §4 step 5 secret scan of one built-in source (task-135, `bug-038`): `null` when the
 * content carries no `blocking` finding, otherwise a failure naming the template and the FIRST
 * blocking finding's `pattern_id` and line (`scanText` reports findings in line order, then in the
 * declared pattern order, so the choice is deterministic, REQ-SYS-07).
 *
 * The scan runs on the source's content exactly as it would be written, with the §3 exclusions
 * `scanText` applies (fenced examples, placeholder values) and no `security-ignore` list: an ignore
 * file belongs to the project being initialized, which does not exist yet. `warn` findings never
 * fail it (§4 step 6), and they are not surfaced: `init` has no warning channel, and a built-in
 * template is not the operator's to review.
 */
function secretScanFailure(source: BuiltinTemplateSource): BuiltinIntegrityFailure | null {
  const [finding] = scanText(source.content, source.name).blocking;
  if (finding === undefined) return null;
  return {
    name: source.name,
    kind: source.kind,
    patternId: finding.patternId,
    message:
      `built-in ${source.kind} template secret scan failed: ${source.name} ` +
      `(${finding.patternId}, line ${finding.line})`,
  };
}

/**
 * Schema-check, then secret-scan, every `sources` entry, in list order (REQ-SYS-07: deterministic,
 * no unordered iteration), and return the FIRST one that fails — or `null` when every source is valid (including
 * the trivial, always-passing case of an empty list, which is what `src/storage/templates.ts`'s
 * `builtinTemplateSources` derives from the P1.1 minimal skeleton, whose built-in directory holds only
 * a `.gitkeep`; `templateScaffold` yields the six P3.8 built-in directives since
 * `task-057-builtin-directive-templates`).
 *
 * FAILS CLOSED on an unrecognized `kind`: a source whose kind has no {@link INTEGRITY_POLICY} entry is
 * reported as a failure ({@link unknownKindMessage}) rather than skipped or thrown on — it cannot be
 * checked, so it must not be installed.
 *
 * The secret scan ({@link secretScanFailure}) is spec-007 §4 step 5's "additional integrity gate run
 * in the same pre-write pass" (task-135, `bug-038`): a source that passes its schema check but
 * carries a `blocking` spec-007 §2 finding fails too, naming the template and the `pattern_id`. A
 * source is scanned only once its schema check has passed, so each source reports one failure.
 *
 * Callers — `initWingfoilProject` AND `initWingfoilStorage`, both in `src/core/init.ts`; every
 * `initStorage` write path there is one — MUST run this before writing any file: REQ-SEC-10's fit
 * criterion requires the abort to happen "before writing partial assets". This function itself never
 * writes or reads from disk, so calling it before the scaffold write is sufficient to satisfy that
 * ordering.
 */
export function verifyBuiltinTemplates(
  sources: readonly BuiltinTemplateSource[],
): BuiltinIntegrityFailure | null {
  for (const source of sources) {
    const policy = policyFor(source.kind);
    if (policy === undefined) {
      return {
        name: source.name,
        kind: source.kind,
        message: unknownKindMessage(source.name, String(source.kind)),
      };
    }
    if (!policy.isValid(source)) {
      return { name: source.name, kind: source.kind, message: policy.message(source.name) };
    }
    const secret = secretScanFailure(source);
    if (secret !== null) return secret;
  }
  return null;
}

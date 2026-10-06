/**
 * Immutable built-in assets pre-flight check (REQ-SEC-07 — task-042-immutable-builtin-assets).
 *
 * **The rule is REQ-SEC-07's, the layout is spec-011's.** REQ-SEC-07 states that built-in directives
 * and built-in workflow templates cannot be removed; `spec-011-storage-layout` supplies the structure
 * that rule is expressed over — the `directives/{built-in,custom}/` and `workflows/{built-in,custom}/`
 * split, where `built-in/` holds the official templates shipped by the `wingfoil` npm package (the P3.8
 * directive templates `wingfoil init` installs, task-057; no workflow templates ship yet) and `custom/`
 * holds the project's own assets. This repository's own `directives/built-in/` holds only `.gitkeep`:
 * its hand-authored configuration predates the templates. Only the removability rule comes from
 * REQ-SEC-07; spec-011 never speaks about removal or protection.
 *
 * Classification is **structural** (which subdirectory holds the file), not the directive
 * frontmatter's `kind:` field — and that is the one point spec-011 does settle: the six P3.8 template
 * stand-ins live under `custom/` while each is "authored with `kind: custom`, `ref: [P3.8]`", so
 * `kind:` demonstrably does not track the subdirectory and cannot be the discriminator. Location is
 * the only discriminator spec-011 defines.
 *
 * **This check is an ALLOW-LIST and fails CLOSED.** It returns "removable" only for a path it
 * positively recognises as `{directives|workflows}/custom/…`; every other shape — a built-in path, an
 * unknown shape, an empty string, a `.`/`..` traversal, an absolute path, a doubled separator, a
 * different pillar's tree — is refused. A deny-list on the literal segment `built-in` was the
 * first-pass defect: `src/core/loaders.ts` builds a directive's stored path with the **platform**
 * separator (`join('directives', relativePath)`), so on Windows a built-in arrives as
 * `directives\built-in\testing.md`, which a forward-slash-only split classifies as *not* built-in and
 * would therefore have allowed `directive remove` to delete. Both separators are accepted as
 * separators here for exactly that reason.
 *
 * `.`/`..` segments are **refused, not resolved**: resolving them textually is not equivalent to
 * resolving them on a filesystem (a symlinked `custom/` aliasing `built-in/` defeats any string-level
 * normalisation), so an ambiguous shape is rejected rather than guessed at. Callers pass the
 * `.wingfoil`-relative path of an asset they already located; that path is never ambiguous.
 *
 * This lives in `src/core` (not `src/directives`/`src/workflow`) because REQ-SEC-07 crosscuts both
 * pillars identically and both the CLI and MCP surfaces must enforce it the same way (REQ-SYS-05) —
 * the same reasoning `requireGitIdentity` (REQ-SEC-01, task-014) already established for a
 * cross-cutting mutating-op pre-flight. Neither `directive remove` nor `workflow remove` exists yet in
 * `CORE_MODULES` (spec-006 §3 reserves both as future `mutates: true` operations); per the same
 * precedent (task-014, task-016), this task delivers the shared, fully-tested primitive now and defers
 * wiring it into the actual mutating op to the dependent task (task-052-directive-remove for
 * `directive.remove`; a future task for `workflow.remove`).
 *
 * **Scope:** this module delivers REQ-SEC-07's *first* clause only. The second — "removal of a
 * still-referenced custom asset is rejected naming the referrer" — is deliberately not implemented
 * here; per `dl-030-req-sec-07-referenced-asset-ownership` (`ready`) the directive half belongs to
 * `task-052-directive-remove` and the workflow half (P4.9) is carried to the next `release-planning`
 * run. `requireCustomAsset` is therefore the FIRST of two checks a remove op runs, never the only one.
 */
import { coreErr, coreOk, type CoreResult } from './types';

/** The two pillars REQ-SEC-07 protects — `built-in/` is immutable in both. */
export type AssetKind = 'directive' | 'workflow';

/** The `.wingfoil/` top-level directory that holds each pillar's assets (spec-011 layout). */
const ASSET_ROOT_SEGMENT: Record<AssetKind, string> = {
  directive: 'directives',
  workflow: 'workflows',
};

/** The spec-011 subdirectory holding removable assets — the ONE segment this allow-list accepts. */
const CUSTOM_SEGMENT = 'custom';

/** The spec-011 subdirectory reserved for official, npm-shipped templates. */
const BUILT_IN_SEGMENT = 'built-in';

/**
 * Exact refusal wording required by REQ-SEC-07's fit criterion — **do not reword**: the BDD scenarios
 * "Error - removing a built-in directive" (`p3-directives/P3.3-directive-remove.feature`) and
 * "Error - removing a built-in workflow template" (`p4-workflow/P4.9-workflow-remove.feature`) assert
 * these strings verbatim. Held in one named constant for the same reason `git-identity.ts` holds
 * `IDENTITY_ERROR`: a fit-criterion string must be greppable against the `.feature` file that pins it,
 * not reconstructed at each use site.
 */
const BUILT_IN_REMOVAL_ERROR: Record<AssetKind, string> = {
  directive: 'built-in directives cannot be removed',
  workflow: 'built-in workflows cannot be removed',
};

/**
 * Split a stored asset path into segments on **either** separator, without collapsing runs — so a
 * doubled separator yields an empty segment and an absolute path yields an empty leading segment,
 * both of which the shape check below then rejects.
 */
function segmentsOf(relativePath: string): readonly string[] {
  return relativePath.split(/[\\/]/);
}

/**
 * True when `relativePath` is exactly the shape `{kind's root}/{subdirectory}/…/<file>`: at least
 * three segments, no empty/`.`/`..` segment, the expected pillar root first and `subdirectory`
 * second. Case-sensitive on purpose — a differently-cased segment is not recognised, and therefore
 * (for the `custom` allow-list) refused rather than trusted on a case-insensitive filesystem.
 */
function isPillarAssetPath(kind: AssetKind, relativePath: string, subdirectory: string): boolean {
  const segments = segmentsOf(relativePath);
  if (segments.length < 3) return false;
  if (!segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')) return false;
  return segments[0] === ASSET_ROOT_SEGMENT[kind] && segments[1] === subdirectory;
}

/**
 * The allow-list: true only when `relativePath` is positively recognised as a removable `custom/`
 * asset of this `kind` — e.g. `directives/custom/legacy-rule.md`, `workflows/custom/arch-review.yaml`,
 * or a file nested deeper under `custom/`. Either separator is accepted (see the module doc-comment on
 * `loaders.ts`'s platform `join`). A file merely *named* `built-in-notes.md` under `custom/` is
 * removable — it is the `custom` **segment** that decides, never a substring. Everything else is
 * false, including a `kind` mismatch: a workflow path handed to `'directive'` is not removable through
 * the directive surface. Pure predicate — no filesystem access, no wall-clock/randomness (REQ-SYS-07).
 */
export function isRemovableCustomAssetPath(kind: AssetKind, relativePath: string): boolean {
  return isPillarAssetPath(kind, relativePath, CUSTOM_SEGMENT);
}

/**
 * True when `relativePath` positively declares itself a `built-in/` asset of this `kind`. Used
 * **only** to choose the refusal wording, never to decide whether to refuse — that decision belongs
 * entirely to {@link isRemovableCustomAssetPath}, so this predicate cannot reintroduce a fail-open
 * path. A shape that is neither clearly `custom/` nor clearly `built-in/` (a traversal, an odd
 * casing) is still refused; it just gets the generic wording instead of REQ-SEC-07's, because
 * asserting "this is a built-in" about a path we did not recognise would be a claim we cannot make.
 */
function declaresBuiltInPath(kind: AssetKind, relativePath: string): boolean {
  return isPillarAssetPath(kind, relativePath, BUILT_IN_SEGMENT);
}

/**
 * REQ-SEC-07 pre-flight: allow a removal only for a recognised `custom/` asset of `kind`. Mirrors
 * `requireGitIdentity`'s shape exactly (`CoreResult<void>`, pure, safe to call before any read/write)
 * — intended as the FIRST check `directiveRemove`/`workflowRemove` run, before any reference check,
 * so a protected or unrecognised path is rejected on structure alone. Returns a `VALIDATION`
 * `CoreResult.error` (a failed precondition, like the sibling pre-flights `requireGitIdentity` and
 * `requireApprovalAuthority`; exit `1` via `exitCodeForError`) carrying REQ-SEC-07's exact fit-criterion
 * wording for a declared built-in, or a generic `cannot remove '<path>': …` refusal — shaped after
 * P3.3's own `cannot remove '<name>': …` message — for any other unrecognised shape; otherwise `ok`.
 */
export function requireCustomAsset(kind: AssetKind, relativePath: string): CoreResult<void> {
  if (isRemovableCustomAssetPath(kind, relativePath)) {
    return coreOk<void>(undefined);
  }
  const message = declaresBuiltInPath(kind, relativePath)
    ? BUILT_IN_REMOVAL_ERROR[kind]
    : `cannot remove '${relativePath}': not a ${kind} under '${ASSET_ROOT_SEGMENT[kind]}/${CUSTOM_SEGMENT}/'`;
  return coreErr({ code: 'VALIDATION', message });
}

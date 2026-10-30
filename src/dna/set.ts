/**
 * Pure DNA key-path helpers for `wingfoil dna set` (P2.1, task-025-implement-dna-set). The `dna`
 * pillar owns the semantics of a dotted key path into its own structure; `src/core`'s `dnaSet`
 * operation composes these with the git-identity pre-flight, schema re-validation, write, and commit
 * (which are cross-pillar / storage concerns and therefore live in `src/core`, not here). Nothing in
 * this file imports `src/core` — the pillar stays a leaf under core (spec-006-core-domain-api §1).
 *
 * The comment-preserving in-place edit every DNA write goes through is `applyDnaEditInText`
 * (`./edit.ts`, task-093); this file keeps only the inline-comment scanner it shares
 * ({@link inlineCommentIndex}, {@link valueOf}). task-063's mapping-only setter, which `dna set` stopped
 * calling when it moved onto that editor, was removed by task-312 (`bug-254`).
 */

/**
 * The first-segment alias `dna show` resolves: `tech_stack` -> `stacks`, the BDD-compatibility alias
 * spec-002-dna-yaml-schema's Consequences describe (the schema renamed the BDD's `tech_stack` wording
 * to `stacks`), so `dna show tech_stack` still reads the `stacks` subtree.
 *
 * **READ side only, since task-093** (`bug-084-dna-key-alias-writes-unschemad-keys`). It used to be
 * applied on the write path too, and there it was a trap: `stacks` replaced a fixed-key `tech_stack`
 * OBJECT, which is a change of shape rather than of name, so rewriting only the first segment
 * produced a path that resolves nowhere — `dna set tech_stack.cli.framework Commander` wrote
 * `stacks.cli.framework`, a key no schema declares, through `Stacks`'s `.passthrough()`, at exit 0.
 * spec-002 says plainly that "any consumer that read `tech_stack.<key>` must now scan" the lists, and
 * a first-segment alias cannot honour that sentence. The write path therefore does not alias at all;
 * an old-shape path is refused as the unknown key it is (`src/dna/path.ts`, exit 1).
 */
export const DNA_KEY_ALIASES: Readonly<Record<string, string>> = { tech_stack: 'stacks' };

/** The segments of a dotted DNA path, or the refusal message the caller reports (`splitDnaPath`). */
export type DnaPathSplit =
  | { readonly ok: true; readonly segments: readonly string[] }
  | { readonly ok: false; readonly message: string };

/** The delimiter that opens and closes a quoted path segment (`dl-083`). */
const QUOTE = '"';

/**
 * Parse a dotted DNA key path into its segments — the ONE place a path is split, shared by
 * {@link isValidKeyPath} and `resolveDnaPath` (`./path.ts`). It replaced three copies of
 * `keyPath.split('.')` (the third was task-063's text setter, removed by task-312), which is why the
 * quoting rule below has one definition rather than several chances to disagree.
 *
 * **The grammar** (`dl-083-dotted-entry-names-in-paths`, ratified; it exists because
 * `dl-081-dna-mutation-surface-shape` made an entry's `name` the key it is addressed by, and
 * `stacks.technologies` really does carry entries named `Node.js` and `Commander.js`):
 *
 * - a segment that **begins** with `"` is quoted and ends at the **next** `"`. The quotes are
 *   delimiters and are not part of the name; between them `.` is an ordinary character, and so is
 *   everything else;
 * - the closing `"` must be followed by `.` or by the end of the path;
 * - a segment that does not begin with `"` ends at the next `.`;
 * - quoting is optional where it is unnecessary: `team."members".roberto` and `team.members.roberto`
 *   are the same path.
 *
 * **The rule narrows what a path may mean, and for one class of path that is a breaking change.**
 * Before it, `"` was an ordinary character inside a segment; under it every `"` is a delimiter. Two
 * measured consequences, neither hypothetical: `isValidKeyPath('modules.co"re')` was `true` and is
 * now `false`; and where a collection carries an entry named `"a"` beside one named `a` — the schema
 * permits both, `uniquelyNamed` included — `stacks.technologies."a".category` resolved to the
 * quote-named entry before and resolves to the **other** entry now, silently rather than by refusing.
 * `dl-083` accepts the narrowing deliberately (a name containing `"` becomes unaddressable, with no
 * escape sequence), but accepting it is not the same as nothing having changed.
 *
 * At a shell prompt the two quoting layers overlap and are easy to confuse:
 * `wingfoil dna update 'stacks.technologies."Node.js".version' --value 22.14+` has the **shell's**
 * single quotes outside and **WingFoil's** double quotes inside. This function sees only the inner
 * form.
 *
 * **Three refusals, and the distinctions between them are load-bearing:**
 *
 * - an **empty** segment, quoted (`team.""`) or not (`..language`) — `invalid key path: '<path>'`,
 *   the message `P2.1-dna-set.feature` scenario 3 pins, unchanged;
 * - an **unterminated** quote — a segment that opens with `"` and never closes. Refused as
 *   unterminated rather than taken as a name that happens to begin with a quote, so
 *   `dna update 'stacks."Node.js'` reports the typo instead of hunting for an entry named `"Node`;
 * - a `"` **no delimiter can account for**: inside an unquoted segment (`modules.co"re`), or in the
 *   remainder of a quoted one (`stacks."say "hi""`). A quoted segment may not contain `"` and there
 *   is **no escape sequence** — `dl-083` accepted that cost deliberately rather than overlooking it —
 *   so the name being reached for has no spelling at all. The refusal says the **name** is
 *   unaddressable, not that the path is malformed, because the path is the only spelling an
 *   impossible request has. A quoted segment that merely fails to span its segment (`"Node.js"x`)
 *   carries no such `"` and is malformed instead: that is what keeps the unaddressable message true
 *   every time it is printed.
 *
 * All three are usage errors (exit 2, `spec-005-cli-command-contract` §1) — properties of how the
 * argument is spelled, decided before anything is read. This is a pure function with no side effects,
 * so the caller owns turning a refusal into that exit code.
 */
export function splitDnaPath(keyPath: string): DnaPathSplit {
  const malformed: DnaPathSplit = { ok: false, message: `invalid key path: '${keyPath}'` };
  const segments: string[] = [];
  let index = 0;

  for (;;) {
    let segment: string;
    /** Index of the `.` that ended this segment, or `-1` when the segment ran to the end of the path. */
    let dot: number;

    if (keyPath[index] === QUOTE) {
      const close = keyPath.indexOf(QUOTE, index + 1);
      if (close < 0) {
        return {
          ok: false,
          message: `invalid key path: '${keyPath}': unterminated quote — a segment that opens with ${QUOTE} must close with ${QUOTE}`,
        };
      }
      dot = keyPath.indexOf('.', close + 1);
      const trailer = dot < 0 ? keyPath.slice(close + 1) : keyPath.slice(close + 1, dot);
      if (trailer.length > 0) return trailer.includes(QUOTE) ? unaddressable(keyPath) : malformed;
      segment = keyPath.slice(index + 1, close);
    } else {
      dot = keyPath.indexOf('.', index);
      segment = dot < 0 ? keyPath.slice(index) : keyPath.slice(index, dot);
      if (segment.includes(QUOTE)) return unaddressable(keyPath);
    }

    if (segment.length === 0) return malformed;
    segments.push(segment);
    // A `.` always opens another segment — `team.` owes one, and it is the empty one refused above.
    if (dot < 0) return { ok: true, segments };
    index = dot + 1;
  }
}

/** The refusal for a `"` that cannot be a delimiter: the NAME has no spelling, not the path. */
function unaddressable(keyPath: string): DnaPathSplit {
  return {
    ok: false,
    message:
      `unaddressable entry name in key path '${keyPath}': a segment may not contain ${QUOTE} and there is ` +
      `no escape sequence, so an entry whose name contains ${QUOTE} cannot be addressed`,
  };
}

/**
 * The path spelling of one segment: quoted when its name contains a `.`, bare otherwise. Used wherever
 * a refusal echoes part of a path, so the reported prefix can be pasted back into a command — without
 * it `stacks.technologies.Node.js` would be reported for the entry named `Node.js`, and that re-splits
 * into four segments and names a different node.
 *
 * **It is the inverse of {@link splitDnaPath} on the segments `splitDnaPath` produces — not on every
 * string**, and the difference is worth stating precisely rather than calling it "the inverse".
 * Brute-forced over the alphabet `{a, ., "}` up to five characters (363 names): 62 round-trip
 * unchanged, 294 produce a path `splitDnaPath` refuses, and **7 produce a path that parses back to a
 * different name** — `"a"` contains no `.`, so it is returned bare and re-parses as `a`; `a"."a`
 * becomes `"a"."a"`, which is two segments.
 *
 * All 7 have a `"` in the name, and that is why the gap is unreachable at the one call site
 * (`prefixOf`, `./path.ts`), structurally rather than by luck: `prefixOf` is fed
 * `DnaPathTarget.segments`, which comes from `splitDnaPath`, and a segment it returns can never
 * contain a `"` — a bare segment containing one is refused as unaddressable, and a quoted segment
 * ends at the *first* `"`. Measured over the same 363: **0** parse to a segment containing a quote.
 * So the hardening a general inverse would need is unreachable code, and is deliberately not written;
 * what is written instead is this note and the `"`-free precondition it rests on.
 */
export function quoteDnaSegment(name: string): string {
  return name.includes('.') ? `${QUOTE}${name}${QUOTE}` : name;
}

/**
 * Whether `keyPath` is a well-formed dotted path — {@link splitDnaPath} reduced to a boolean, so the
 * predicate and the parser cannot disagree about what "well-formed" means. A malformed path (the
 * BDD's `..language`, an empty segment, an unterminated or unaccountable quote) is a usage error
 * (exit 2, spec-005-cli-command-contract §1) the caller rejects before any write; a caller that
 * reports a message uses `splitDnaPath` directly, because only it knows *which* of the three it was.
 */
export function isValidKeyPath(keyPath: string): boolean {
  return splitDnaPath(keyPath).ok;
}

// ---------------------------------------------------------------------------------------------
// The inline-comment scanner shared with the comment-preserving editor (`./edit.ts`)
// ---------------------------------------------------------------------------------------------

/**
 * Index within `rest` of the `#` that starts an inline comment, or `-1`. Quote-aware, so a `#`
 * inside a `'single'`- or `"double"`-quoted scalar is not mistaken for a comment; per the YAML spec
 * a comment must also be preceded by whitespace (or start the field).
 *
 * Exported for `./edit.ts`, the comment-preserving editor added by task-093 and the one DNA write path
 * since task-312 (`bug-254`): it decides where a line's value ends and its comment begins.
 */
export function inlineCommentIndex(rest: string): number {
  let quote: string | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const char = rest[i]!;
    if (quote !== undefined) {
      if (char === quote) {
        if (quote === "'" && rest[i + 1] === "'") i += 1;
        else quote = undefined;
      } else if (quote === '"' && char === '\\') i += 1;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === '#' && (i === 0 || rest[i - 1] === ' ' || rest[i - 1] === '\t')) return i;
  }
  return -1;
}

/** The value part of a key line's `rest`, with any inline comment and surrounding spaces removed. */
export function valueOf(rest: string): string {
  const commentIndex = inlineCommentIndex(rest);
  return (commentIndex < 0 ? rest : rest.slice(0, commentIndex)).trim();
}

/**
 * Shared low-level `git log` field walk (task-015-complete-audit-trail refactor) — task-011's
 * `./history` (`getMemoryHistory`) and this task's `./audit` (`auditAttribution`) both need the same
 * "run `git log` with a custom multi-field format, split stdout into per-commit records, oldest
 * first" plumbing over a different field set/pathspec shape; this is that one shared primitive, so
 * the record-separator convention lives in exactly one place instead of being copy-pasted twice.
 */
import { E_GIT_READ_FAILED, requireCommitName, runGitRead, StorageError } from '../storage';

/** The exit status git uses for `fatal:` — a broken repository, and an unborn `HEAD` alike. */
const GIT_FATAL = 128;

/**
 * Whether `root` is a repository with no commit yet — the one `fatal:` of a `git log` that is an
 * answer ("nothing has been recorded") rather than a failure. `rev-parse --verify --quiet` exits `1`,
 * printing nothing, for a `HEAD` that names no commit; outside a repository it exits `128` like the
 * walk did. Asked only after the walk has failed, so a healthy walk costs no extra process.
 */
function isUnbornHead(root: string): boolean {
  return runGitRead(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { accepted: [0, 1, GIT_FATAL] }).status === 1;
}

/**
 * The `--format` placeholder git expands to a single NUL byte, used to delimit BOTH the fields of a
 * commit and one commit's record from the next. A literal NUL cannot be written into the format
 * string, because it travels to git through `argv` and a C string ends at the first NUL — so `%x00`
 * is the only way to get one there at all.
 */
const NUL_PLACEHOLDER = '%x00';

/**
 * The delimiter {@link NUL_PLACEHOLDER} expands to, and the one character this module splits on.
 *
 * The guarantee, stated as narrowly as it actually holds
 * (`task-086-fix-reason-control-chars-history-forgery`, `bug-050`): **git refuses to write a commit
 * whose message contains a NUL byte** — `error: a NUL byte in commit log message not allowed`,
 * raised by every writer down to `commit-tree`, the lowest-level plumbing there is. This is not a
 * claim about what commit text conventionally contains; it is a property git enforces at write time,
 * and it is the same property git's own `-z` output options rest on.
 * `test/memory/git-log-framing.test.ts` pins it against all three writers rather than trusting it.
 *
 * It replaced a pair of separators (`0x1f`/`0x1e`) documented as characters "a real commit
 * subject/body never contains". That claim was false by construction: `--reason <text>` is arbitrary
 * free text that lands in the commit body (P1.7/P1.8, REQ-SEC-04), so a reason carrying `0x1e` split
 * one commit's record in two and made `wingfoil memory history` (P1.10) print a fabricated entry
 * whose `sha` was the caller-supplied text, while the genuine approval lost its `from`. Because the
 * delimiters live in the `--format` string — expanded by git at READ time and never stored — moving
 * to NUL re-reads all history under the new framing, whenever and by whichever writer it was made.
 *
 * Built with `String.fromCharCode` rather than spelled as a unicode escape for code point zero,
 * because any tool that resolves such an escape while editing this file leaves a RAW NUL byte in
 * the source — at which point git classifies the file as binary and stops diffing it. Observed
 * once here, hence the note: the constructor form cannot be resolved into the file by accident.
 */
const NUL = String.fromCharCode(0);

/**
 * Run `git log <extraArgs> --format=<each field followed by %x00> -- <pathspecs>` and return each
 * matching commit's raw field list (in `fields` order, not yet destructured into a named shape —
 * that's each caller's concern), oldest first.
 *
 * Because the field and record delimiters are the same character ({@link NUL}), records are
 * recovered by **arity** rather than by a second delimiter: the stream is split on NUL and consumed
 * in fixed groups of `fields.length`. That is what makes the walk independent of its own output's
 * content — there is no character a commit could carry that would realign the groups — and it also
 * means a field that is legitimately empty (a commit with no body, `%b`) still occupies its slot
 * instead of being dropped. **Every returned record therefore has exactly `fields.length` entries**
 * — a partial group at the end of the stream is not a record and is discarded, never padded — which
 * is the postcondition `./history`'s destructuring relies on.
 *
 * git terminates each commit's formatted output with a newline. The format ends with a delimiter, so
 * that newline falls in the piece AFTER the record's last field — which is why the split's final
 * piece is dropped rather than grouped. Dropping it explicitly, instead of letting it fall off as a
 * short remainder, is what makes the walk total at **one** field too: at that arity the tail is a
 * whole group of its own and became a spurious record (it did, on this task's first pass; the
 * arity-1 cases in `test/memory/git-log-framing.test.ts` now pin it). What survives of the newline is
 * a single leading `\n` on each record's first field after the first, and that is stripped; both call
 * sites put `%H` first, which never legitimately begins with one.
 *
 * Returns `[]` when none of `pathspecs` has any matching history — git prints nothing, the split
 * yields one piece, and dropping it leaves nothing to group, at EVERY arity — and when the repository
 * has no commit yet: an unborn `HEAD` makes git exit `128`, and `isUnbornHead` confirms that
 * is the reason. An empty `fields` requests nothing and likewise yields `[]`, rather than looping
 * forever over zero-width groups.
 *
 * `--no-show-signature` is passed so a `log.showSignature` configuration cannot print signature text
 * before a commit's formatted output, where it would land in the record's first field (`task-268`,
 * `bug-291`); and every `%H` field is checked to be a full commit name (`requireCommitName`), so
 * whatever arrives there anyway is refused rather than used.
 *
 * **Every other failure throws** `StorageError` `E_GIT_READ_FAILED` carrying git's own message
 * (`task-142`): a `root` that is not a repository, a tree git cannot read, an output past the read
 * buffer. It used to return `[]` for all of them, so an oversized walk — Node's 1 MiB default buffer,
 * `ENOBUFS` — read as "this document has no history", and an audit over it as a clean pass
 * (`bug-072-oversized-git-log-becomes-empty-history`). git runs through `runGitRead`
 * (`src/storage/git-read.ts`), so its stderr travels inside that error and never reaches the
 * operator's terminal (`bug-093-two-more-git-calls-inherit-the-operator-stderr`).
 */
export function walkGitLogFields(
  root: string,
  fields: readonly string[],
  pathspecs: readonly string[],
  extraArgs: readonly string[] = [],
): string[][] {
  if (fields.length === 0) return [];
  const format = fields.map((field) => `${field}${NUL_PLACEHOLDER}`).join('');
  const args = ['log', '--no-show-signature', ...extraArgs, `--format=${format}`, '--', ...pathspecs];
  const run = runGitRead(root, args, { accepted: [0, GIT_FATAL] });
  if (run.status === GIT_FATAL) {
    if (isUnbornHead(root)) return [];
    throw new StorageError(E_GIT_READ_FAILED, `git ${args.join(' ')} failed in ${root}: ${run.stderr.trim()}`);
  }
  const stdout = run.stdout;

  // The stream is `<f1>NUL<f2>NUL…<fn>NUL` per commit, each run terminated by git's own newline, so
  // the text after the FINAL NUL is never a field — it is that newline, or the empty string when git
  // printed nothing at all. Drop it before grouping; at `fields.length === 1` it would otherwise be
  // a complete group and become a record that no commit backs. Only whole groups of `fields.length`
  // are records thereafter.
  const pieces = stdout.split(NUL);
  pieces.pop();
  const commitNameSlots = fields.flatMap((field, index) => (field === '%H' ? [index] : []));
  const records: string[][] = [];
  for (let index = 0; index + fields.length <= pieces.length; index += fields.length) {
    const record = pieces.slice(index, index + fields.length);
    record[0] = (record[0] as string).replace(/^\n+/, '');
    for (const index of commitNameSlots) requireCommitName(record[index] as string, 'git log');
    records.push(record);
  }

  return records.reverse();
}

/**
 * Pure/domain helpers behind `wingfoil memory add` (P1.3, task-020-implement-memory-add). Factored
 * out of the `CoreResult`-wrapped orchestration in `src/core` so that (mirroring `dna set`'s split —
 * pure `setDnaValue` in `src/dna`, the `CoreFn` in `src/core`) the surface-facing operation stays a
 * thin composition and the id/slug/document-render logic is independently unit-testable.
 *
 * Every function here is deterministic (REQ-SYS-07): a slug is a pure function of the title, the
 * rendered document a pure function of `(scaffold, id, title, tags)`, and the sequence counter a
 * maximum over the paths every ref and the working tree hold (order-independent, task-128) — no
 * randomness and no unordered iteration in a value that reaches the produced id or document. The one
 * time read is `{date}`'s ({@link readAuthorDate}, task-163): a write path, not a context-building
 * one, taken once per add from the author date git records for the add commit, so a caller fixes it
 * with `GIT_AUTHOR_DATE` and the id never disagrees with its own commit.
 */
import { E_GIT_READ_FAILED, listPathsAtRevs, runGitRead, splitFrontmatter, StorageError } from '../storage';
import { isIdPiece, isNumericToken, patternTokens, patternToSource, ValidationError } from '../validation';
import type { ValidationIssue } from '../validation';
import { setFrontmatterEntry } from './frontmatter-edit';

const TOKEN_RE = /\{([^{}]+)\}/g;

/**
 * Turn a human `--title` into a single, valid `[a-z0-9-.]` ID slug piece (spec-009-validation-strategy
 * §1's ID character class, the same one `generateId` enforces): lowercase, every run of characters
 * outside `[a-z0-9]` collapsed to one `-`, and no leading/trailing/doubled `-` — except that a run
 * consisting of exactly one `.` between two alphanumerics is **kept** (`v0.2` → `v0.2`,
 * `dl-107` S1 (a), task-110). That is the character rule `generateId`'s Pass-B slug check
 * (`[a-z0-9.]+(?:-[a-z0-9.]+)*`) already accepts, so the slugifier and the validator share one rule
 * instead of the slug being stricter than the id it feeds. Ids added before this rule are untouched:
 * an id is immutable once added.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, (run: string, offset: number, text: string) =>
      run === '.' && offset > 0 && offset + run.length < text.length ? '.' : '-',
    )
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse the CLI `--tags "a,b,c"` value into a trimmed, non-empty string array, or `undefined` when the
 * option is absent or contributes no tags (so `renderAddDocument` leaves the scaffold's `tags` at its
 * default rather than writing an empty list).
 */
export function parseTags(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const tags = raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
}

/** Whether an `id_pattern` contains a `{n}`-family numeric token (e.g. `task-{n}-{slug}`, `u-{n:1}`) —
 * i.e. it needs a sequence counter resolved before {@link generateId} can render it. */
export function hasNumericToken(idPattern: string): boolean {
  for (const match of idPattern.matchAll(TOKEN_RE)) {
    if (isNumericToken(match[1] ?? '')) return true;
  }
  return false;
}

/**
 * The author date git would record for a commit made now at `root`, as git's internal
 * `<seconds> <offset>` pair (`1790731800 -0200`): `GIT_AUTHOR_DATE` when it is set, in any format git
 * accepts, otherwise the system clock — read ONCE, through `git var GIT_AUTHOR_IDENT` (task-163,
 * `bug-158`). `memory add` builds `{date}` from it ({@link formatIdDate}) and records the add commit
 * with this same author date (passed back as `@<seconds> <offset>`: git reads a bare pair as a
 * timestamp only from 9 digits of seconds up), so the id and the commit cannot disagree, and a caller (a test, a
 * replay) fixes the date the way it fixes any git author date.
 *
 * `identity` is passed to git as `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`: the identity was already
 * resolved and checked (`requireGitIdentity`), and only the date part of git's answer is read.
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when git refuses (e.g. a `GIT_AUTHOR_DATE` it
 *   cannot parse) or answers in a shape that is not `… <seconds> <offset>`.
 */
export function readAuthorDate(root: string, identity: { readonly name: string; readonly email: string }): string {
  const answer = runGitRead(root, ['var', 'GIT_AUTHOR_IDENT'], {
    env: { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email },
  }).stdout;
  return identDate(answer);
}

/**
 * The `<seconds> <offset>` date that ends a git ident line (`Name <email> 1790731800 -0200`). Pure.
 *
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when the line does not end with one.
 */
export function identDate(ident: string): string {
  const date = /> (-?[0-9]+ [+-][0-9]{4})$/.exec(ident.trim())?.[1];
  if (date === undefined) {
    throw new StorageError(E_GIT_READ_FAILED, `git var GIT_AUTHOR_IDENT gave no author date: "${ident.trim()}"`);
  }
  return date;
}

/**
 * `{date}`'s value (`spec-001`'s placeholder table): the UTC calendar date `YYYYMMDD` of a git
 * `<seconds> <offset>` date ({@link readAuthorDate}). The offset does not move the instant, so
 * `23:30 -0200` on the 29th is the 30th. Pure.
 */
export function formatIdDate(gitDate: string): string {
  const seconds = Number.parseInt(gitDate, 10);
  return new Date(seconds * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

/** A non-`{id}` `path` token as the counter matches it: one or more path segments (`dl-101` (a)). */
const PATH_TOKEN_SOURCE = '[^/]+(?:/[^/]+)*';

/**
 * The RegExp a repository-relative path of this type matches, with the `{n}` value as group 1: the
 * `path` pattern with `{id}` replaced by the (materialized) `id_pattern` and **every other token a
 * wildcard**, whatever value this add gives it — so a `task`'s counter spans every
 * `docs/04_memory/{release}/` folder, not only the one being added to (`bug-162`).
 */
function sequencePathRegExp(pathPattern: string, idPattern: string): RegExp {
  const idSource = patternToSource(idPattern, { captureNumeric: true });
  let source = '^';
  let last = 0;
  for (const match of pathPattern.matchAll(TOKEN_RE)) {
    const index = match.index as number;
    source += escapeRegExp(pathPattern.slice(last, index));
    source += match[1] === 'id' ? `(?:${idSource})` : PATH_TOKEN_SOURCE;
    last = index + match[0].length;
  }
  return new RegExp(`${source}${escapeRegExp(pathPattern.slice(last))}$`);
}

/**
 * The highest `{n}` value among `paths` (repository-relative, `/`-separated) that the type's `path`
 * pattern and materialized `id_pattern` match, or `0` when none does (`spec-001` "Counter algorithm",
 * `dl-101` §2 (a)). The **highest**, not a count, so a gap never reissues a number (`bug-087`); and a
 * maximum, so the answer is independent of the order `paths` arrive in (REQ-SYS-07).
 */
export function highestSequenceNumber(paths: Iterable<string>, pathPattern: string, idPattern: string): number {
  const re = sequencePathRegExp(pathPattern, idPattern);
  let highest = 0;
  for (const path of paths) {
    const digits = re.exec(path)?.[1];
    if (digits !== undefined) highest = Math.max(highest, Number.parseInt(digits, 10));
  }
  return highest;
}

/** The literal directory a `path` pattern starts with (up to its last `/` before any token), or `''`. */
function literalPrefix(pathPattern: string): string {
  const head = pathPattern.split('{', 1)[0] as string;
  return head.slice(0, head.lastIndexOf('/') + 1);
}

/**
 * Every repository-relative path under `prefix` that any baseline a number can be taken on holds —
 * `command-baseline`'s declared baseline for `memory add`'s counter (`dl-101` §2 (a), `dl-080`):
 *
 * - the tree of every local branch (`refs/heads/*`) and remote-tracking ref (`refs/remotes/*`), and
 *   of `HEAD` (a detached `HEAD` is on no branch);
 * - the working tree as git sees it: the index and the untracked, non-ignored files.
 *
 * No network: the remote-tracking refs are what the last `git fetch` left (`dl-101` §1.1). Commits are
 * de-duplicated and visited in sorted order, and the result is sorted (REQ-SYS-07).
 */
function sequenceCandidatePaths(root: string, prefix: string): string[] {
  const pathspec = prefix.length === 0 ? [] : ['--', prefix];
  const paths = new Set<string>();
  const worktree = runGitRead(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...pathspec]);
  for (const path of worktree.stdout.split('\0')) if (path.length > 0) paths.add(path);

  const refs = runGitRead(root, ['for-each-ref', '--format=%(objectname)', 'refs/heads', 'refs/remotes']);
  // `--verify --quiet` exits 1, printing nothing, on an unborn `HEAD`: an answer, not a failure.
  const head = runGitRead(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { accepted: [0, 1] });
  const commits = new Set(`${refs.stdout}\n${head.stdout}`.split('\n').map((sha) => sha.trim()));
  commits.delete('');
  // One batched read for every commit, not one `git ls-tree` each (`bug-178`, task-142): the number of
  // git processes no longer grows with the number of branches and remote-tracking refs.
  for (const path of listPathsAtRevs(root, [...commits].sort(), prefix)) paths.add(path);
  return [...paths].sort();
}

/**
 * The next sequence number for a `{n}`-token id: `1 +` the highest number any baseline holds for this
 * type — every local branch, remote-tracking ref, `HEAD`, the index and the untracked working-tree
 * files ({@link sequenceCandidatePaths}) — over every folder the type's `path` can resolve to
 * ({@link highestSequenceNumber}). `1` when nothing matches. Ratified `dl-101` §2 (a) (task-128,
 * `bug-087`, `bug-162`); `spec-001` "Counter algorithm".
 *
 * @param root - The repository root.
 * @param pathPattern - The type's committed `path` pattern, e.g. `docs/04_memory/{release}/{id}.md`.
 * @param idPattern - The type's `id_pattern` with its field tokens already materialized.
 * @throws {@link StorageError} `E_GIT_READ_FAILED` when a git read fails.
 */
export function nextSequenceNumber(root: string, pathPattern: string, idPattern: string): number {
  const prefix = literalPrefix(pathPattern);
  return highestSequenceNumber(sequenceCandidatePaths(root, prefix), pathPattern, idPattern) + 1;
}

/** The fields `memory.add` pins on the freshly-created document (P1.3 memory.add / spec-010). */
export interface AddDocumentFields {
  readonly id: string;
  readonly title: string;
  readonly tags?: readonly string[];
  /**
   * Frontmatter fields `memory add --set` fills (task-110, `dl-107` S2 (a)), as `[name, value]` pairs
   * in the order they are written — {@link writtenFields} produces them sorted by name
   * (REQ-SYS-07). Each is written as a JSON-quoted string, replacing the scaffold's line for that key
   * or appended when the scaffold has none.
   */
  readonly fields?: readonly (readonly [string, string])[];
  /**
   * The initial `status`: the head of the type's machine (`spec-001`; `bug-214`, task-180), which
   * `memory add` resolves from the committed `memory.yaml`. Defaults to `draft`, the head of the
   * built-in default machine.
   */
  readonly status?: string;
}

/**
 * Escape a literal string for safe insertion into a `RegExp` source (a frontmatter key here). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Copy a type's `template.file` scaffold verbatim and fill only the frontmatter skeleton `memory.add`
 * pins (P1.3; spec-010-memory-frontmatter-schema): the generated `id`, the `--title`, the
 * initial `status` (the head of the type's machine, {@link AddDocumentFields.status}), when `--tags`
 * was supplied the `tags` flow sequence, and the `--set` fields
 * {@link AddDocumentFields.fields} carries (task-110). Every other
 * field (notably `type` and `tmpl_version`, spec-010: not touched by add) and the whole body are left
 * exactly as the scaffold had them. `title`/`tags` are JSON-quoted (valid YAML double-quoted scalars /
 * flow sequences), so an arbitrary title with spaces or colons is written safely.
 *
 * Each field is set through `./frontmatter-edit`'s shared setter, the one the transition verbs use
 * (task-163, `bug-033`): only a TOP-LEVEL key is matched, so a nested key of the same name is never
 * edited, and an edited line keeps the scaffold's inline `# comment`.
 *
 * @throws when the scaffold has no frontmatter block (a malformed template — a config error surfaced
 *   as a thrown `Error` the core op maps to a `CoreError`).
 */
export function renderAddDocument(scaffold: string, fields: AddDocumentFields): string {
  const { frontmatter, body } = splitFrontmatter(scaffold);
  if (frontmatter === null) {
    throw new Error('memory template scaffold has no frontmatter block');
  }
  // Rebuilt as `memory add` always wrote it (a `---` line, the frontmatter, a `---` line, the body),
  // then edited in place by the shared setter.
  let document = `---\n${frontmatter}\n---\n${body}`;
  document = setFrontmatterEntry(document, 'id', fields.id);
  document = setFrontmatterEntry(document, 'title', JSON.stringify(fields.title));
  document = setFrontmatterEntry(document, 'status', fields.status ?? 'draft');
  if (fields.tags !== undefined) {
    const flow = `[${fields.tags.map((tag) => JSON.stringify(tag)).join(',')}]`;
    document = setFrontmatterEntry(document, 'tags', flow);
  }
  for (const [name, value] of fields.fields ?? []) {
    document = setFrontmatterEntry(document, name, JSON.stringify(value));
  }
  return document;
}

/**
 * Names `memory add --set` refuses (`spec-008-cli-grammar` §10): the fields `memory add` fills itself
 * or through its own option (`id`, `type`, `status`, `title`, `tags`), and the tokens with a source of
 * their own (`n`, `slug`, `date`, `author` — `spec-001`'s placeholder table).
 */
const RESERVED_SET_NAMES: ReadonlySet<string> = new Set(['id', 'type', 'status', 'title', 'tags', 'n', 'slug', 'date', 'author']);

/**
 * The refusal of a reserved `--set` name, saying where its value comes from (`spec-008` §10). `date`
 * and `author` name their source, which is not an option of `memory add` (task-163, `bug-158`: the
 * generic sentence was false while nothing filled them, and unhelpful once something did).
 */
function reservedSetMessage(name: string): string {
  const prefix = `invalid flag value: --set cannot set "${name}": memory add fills`;
  if (name === 'date') return `${prefix} {date} from the add commit's author date (GIT_AUTHOR_DATE, or the clock)`;
  if (name === 'author') return `${prefix} {author} from the git author name`;
  return `${prefix} it itself or through its own option`;
}

/** A `--set` field name: `[a-z][a-z0-9_-]*` — the same shape `idPatternIssues` accepts for a token. */
const SET_NAME_RE = /^[a-z][a-z0-9_-]*$/;

/**
 * Tokens that are workflow **context** rather than a frontmatter field (`spec-001`, `dl-107` S2 (c)):
 * written into the document only where its template declares a field of that name.
 */
const CONTEXT_TOKENS: ReadonlySet<string> = new Set(['workflow', 'phase', 'scope']);

/** The outcome of {@link parseSetOptions}: the parsed values, or the one usage-error message. */
export type ParsedSetOptions =
  | { readonly ok: true; readonly values: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly message: string };

/**
 * Parse `memory add`'s repeatable `--set <name>=<value>` occurrences (`spec-008-cli-grammar` §10,
 * task-110). The CLI hands every occurrence as a string array; a single string is one occurrence;
 * `undefined` is none. `<name>` is split from `<value>` at the FIRST `=`.
 *
 * Every refusal here is a property of how the argument is spelled, decided before anything is read,
 * so the caller raises it as a usage error (exit 2) — the first failing occurrence, in the order
 * given, with §10's exact message. Pure and order-preserving (REQ-SYS-07).
 */
export function parseSetOptions(raw: string | readonly string[] | undefined): ParsedSetOptions {
  const occurrences = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  const values: Record<string, string> = {};
  for (const occurrence of occurrences) {
    const eq = occurrence.indexOf('=');
    if (eq <= 0) {
      return { ok: false, message: `invalid flag value: --set expects <name>=<value>, got "${occurrence}"` };
    }
    const name = occurrence.slice(0, eq);
    const value = occurrence.slice(eq + 1);
    if (!SET_NAME_RE.test(name)) {
      return { ok: false, message: `invalid flag value: --set name "${name}" is not a field name ([a-z][a-z0-9_-]*)` };
    }
    if (RESERVED_SET_NAMES.has(name)) {
      return { ok: false, message: reservedSetMessage(name) };
    }
    if (value.trim().length === 0) {
      return { ok: false, message: `invalid flag value: --set ${name} must not be blank` };
    }
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      return { ok: false, message: `invalid flag value: --set ${name} given more than once` };
    }
    values[name] = value;
  }
  return { ok: true, values };
}

/**
 * The `--set` names a type's committed patterns cannot use: every name that is not a token of its
 * `id_pattern` or of its `path` (other than `{id}`), in the order given. `memory add` refuses them
 * (exit 1, `spec-008` §10) rather than writing a field no token reads.
 */
export function unknownSetNames(
  values: Readonly<Record<string, string>>,
  idPattern: string,
  pathPattern: string,
): string[] {
  const tokens = new Set([...patternTokens(idPattern), ...patternTokens(pathPattern)]);
  tokens.delete('id');
  return Object.keys(values).filter((name) => !tokens.has(name));
}

/**
 * The values of the tokens `memory add` sources itself rather than from `--set` (`spec-001`'s
 * placeholder table, task-163): `{date}` and `{author}`. Each is needed only when the pattern has the
 * token, and is read once per add by the caller.
 */
export interface IdTokenSources {
  /** The add commit's author date as git's `<seconds> <offset>` ({@link readAuthorDate}). */
  readonly date?: string;
  /** The git author name the add commit records (`requireGitIdentity`), before slugging. */
  readonly authorName?: string;
}

/**
 * Materialize an `id_pattern`'s `{date}`, `{author}`, frontmatter and context tokens (`{kind}`,
 * `{version}`, `{workflow}`, …), leaving `{slug}` and the `{n}` family in place — `spec-001`'s fixed
 * expansion order (`{date}` → `{author}` → field and context tokens → `{slug}` → `{n}`), so the
 * `{n}` counter regexp built from the result sees a fully-materialized prefix (task-110). `{date}` is
 * the UTC `YYYYMMDD` of `sources.date` ({@link formatIdDate}); `{author}` the slug of
 * `sources.authorName` ({@link slugifyTitle}) — task-163, `bug-158`.
 *
 * @throws {@link ValidationError} naming every field token with no value
 *   (`missing value for token {<name>}: give it with --set <name>=<value>`), an `{author}` whose
 *   name slugs to nothing, and every value outside the ID character class, in pattern order — the
 *   same `E_INVALID_ID` code `generateId` raises.
 */
export function expandFieldTokens(
  idPattern: string,
  values: Readonly<Record<string, string>>,
  sources: IdTokenSources = {},
): string {
  const issues: ValidationIssue[] = [];
  const expanded = idPattern.replace(TOKEN_RE, (whole: string, token: string) => {
    if (token === 'date' && sources.date !== undefined) return formatIdDate(sources.date);
    if (token === 'author' && sources.authorName !== undefined) {
      const author = slugifyTitle(sources.authorName);
      if (author.length > 0) return author;
      issues.push(fieldIssue(idPattern, `value for token {author} is empty once the git author name "${sources.authorName}" is slugged`));
      return whole;
    }
    if (isNumericToken(token) || RESERVED_SET_NAMES.has(token)) return whole;
    const value = values[token];
    if (value === undefined) {
      issues.push(fieldIssue(idPattern, `missing value for token {${token}}: give it with --set ${token}=<value>`));
      return whole;
    }
    if (!isIdPiece(value)) {
      issues.push(fieldIssue(idPattern, `value for token {${token}} is not a valid [a-z0-9-.] piece: "${value}"`));
      return whole;
    }
    return value;
  });
  if (issues.length > 0) throw new ValidationError(issues);
  return expanded;
}

function fieldIssue(pattern: string, message: string): ValidationIssue {
  return { code: 'E_INVALID_ID', path: 'id', file: pattern, message };
}

/**
 * The `--set` values `memory add` writes into the new document's frontmatter, as `[name, value]`
 * pairs sorted by name (REQ-SYS-07). A field token is always written, so the id and the field cannot
 * disagree (`dl-107` S2 (a)); a context token (`workflow`, `phase`, `scope`) only where the committed
 * scaffold's frontmatter declares that key (`dl-107` S2 (c) — `plan` declares `workflow` and `phase`,
 * not `scope`).
 */
export function writtenFields(scaffold: string, values: Readonly<Record<string, string>>): [string, string][] {
  const { frontmatter } = splitFrontmatter(scaffold);
  // A top-level key only (task-163): a nested key of the same name is not a declaration of the field.
  const declared = (key: string): boolean =>
    frontmatter !== null && new RegExp(`^${escapeRegExp(key)}:(?:[ \\t\\r]|$)`, 'm').test(frontmatter);
  return Object.keys(values)
    .sort()
    .filter((name) => !CONTEXT_TOKENS.has(name) || declared(name))
    .map((name) => [name, values[name] as string]);
}

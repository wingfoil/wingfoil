/**
 * Git-identity pre-flight check (REQ-SEC-01, adr-006-git-identity-role-based-authz —
 * task-014-git-identity-required).
 *
 * Git identity is WingFoil's sole attribution mechanism: the commit author *is* the "who" of the
 * audit trail (adr-001 / adr-006 — no separate auth/session/IAM layer). So every state-mutating
 * operation must refuse to run when no author or no committer resolves (`user.name`/`user.email`, or
 * what outranks them for git: `GIT_AUTHOR_*`/`author.*`, `GIT_COMMITTER_*`/`committer.*` — task-132),
 * rather than produce a commit with an unattributable author, or fail half-way through one. This check lives in `src/core` so the CLI and every MCP Tool enforce
 * it identically by construction (REQ-SYS-05) — a mutation calls it first and returns its
 * `CoreResult.error` unchanged, so the surface renders the exact message and writes nothing.
 */
import { spawnSync } from 'node:child_process';

import { coreErr, coreOk, type CoreResult } from './types';

/** Exact refusal message required by REQ-SEC-01's fit criterion — do not reword. */
const IDENTITY_ERROR = 'git identity not configured (user.name/user.email)';

/** The six config keys an author or committer identity can come from, as `git config` prints them. */
const IDENTITY_KEYS = /^(author|committer|user)\.(name|email)$/;

/**
 * What {@link readIdentityConfig} found: the effective config values, or the reason git could not be
 * run at all (task-284, `bug-377`).
 */
type IdentityConfig =
  | { readonly ran: true; readonly values: ReadonlyMap<string, string> }
  | { readonly ran: false; readonly cause: string };

/**
 * The effective values of `author.*`, `committer.*` and `user.*` (`name`, `email`) at `root`, in ONE
 * `git config` subprocess. `--get-regexp` lists every scope's entry, lowest precedence first
 * (system, global, local), so the last value seen for a key is the effective one, exactly as
 * `git config <key>` would answer. `-z` keeps a value with unusual bytes intact.
 *
 * Three outcomes (task-284, `bug-377`):
 *
 * - **git could not be run** — the spawn itself failed (`ENOENT`: no `git` on `PATH`; `EACCES`: not
 *   executable; `EPERM`: a sandbox forbids it), so git never answered: `ran: false`, with the spawn
 *   error's message (`spawnSync git ENOENT`) as the cause. Before task-284 this read as "no value", and
 *   the check sent the user to configure an identity that may have been right. An output past
 *   `spawnSync`'s default `maxBuffer` also sets the spawn error (`ENOBUFS`) and takes this branch, read
 *   as `could not run git: spawnSync git ENOBUFS`.
 * - **git ran and exited non-zero** — `1` when no key matches, `128` for a root git cannot enter or a
 *   config file it cannot parse, or a signal: every key is absent, the "empty means unconfigured"
 *   contract the check relies on, kept on purpose for these exits (the approver's ruling on task-284,
 *   D2).
 * - **exit `0`** — the values git printed. A key that is unset is simply absent.
 */
function readIdentityConfig(root: string): IdentityConfig {
  // `env: process.env` is passed explicitly (identical to the default in production): it makes git's
  // config resolution follow the current environment by design, so a caller/test can scope it via
  // `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`/`GIT_CONFIG_NOSYSTEM` deterministically.
  const run = spawnSync('git', ['-C', root, 'config', '-z', '--get-regexp', IDENTITY_KEYS.source], {
    encoding: 'utf-8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (run.error !== undefined) return { ran: false, cause: run.error.message };
  const values = new Map<string, string>();
  if (run.status !== 0) return { ran: true, values };
  for (const record of run.stdout.split('\0')) {
    const newline = record.indexOf('\n');
    if (newline < 0) continue;
    values.set(record.slice(0, newline), record.slice(newline + 1).trim());
  }
  return { ran: true, values };
}

/**
 * The single source of truth for "a configured/attributable identity": non-empty `name` AND
 * non-empty `email`. Both the write-time precondition below (`requireGitIdentity`, REQ-SEC-01,
 * task-014-git-identity-required) and the read-time historical audit (`isValidAttribution` in
 * `src/memory/audit.ts`, REQ-SEC-02, task-015-complete-audit-trail) build on this exact predicate for
 * their shared base check — see `isValidAttribution`'s doc-comment for the audit-only augmentations
 * it layers on top for historical commits (a concern this write-time check has no need for, since it
 * only ever looks at the *current* live git config). Pure predicate — no git/filesystem access.
 */
export function isConfiguredIdentity(name: string, email: string): boolean {
  return name.length > 0 && email.length > 0;
}

/**
 * The author identity {@link readGitIdentity} resolves at a given root — either field may be `''`
 * (unresolved). It is the one value a mutating operation checks (REQ-SEC-01), authorizes
 * (REQ-SEC-03), writes into an `Approver:` line and pins as its commit's author (task-132, `bug-149`).
 */
export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

/** The two identities a commit carries; git resolves each from its own variables and keys first. */
type IdentityRole = 'author' | 'committer';

/**
 * One field of the `role` identity, resolved in `git commit`'s own order: the `GIT_AUTHOR_*` /
 * `GIT_COMMITTER_*` environment variable, then the `author.*` / `committer.*` config key, then
 * `user.*`. A variable that is SET wins even when blank, never falling back: git refuses a blank name
 * ("empty ident name not allowed") and records a blank email as `<>`; a blank one resolves to `''`
 * and the check refuses both (task-132 review, finding 4). A blank config value falls through to the next key.
 *
 * Deliberately NOT followed further down git's chain: the `EMAIL` environment variable and git's
 * hostname guess. Both are what REQ-SEC-01 exists to refuse — an identity nobody configured — and the
 * check's message names `user.name`/`user.email` as the thing to set.
 */
function resolveField(config: ReadonlyMap<string, string>, role: IdentityRole, field: 'name' | 'email'): string {
  const fromEnv = process.env[`GIT_${role.toUpperCase()}_${field.toUpperCase()}`];
  if (fromEnv !== undefined) return fromEnv.trim();
  const fromRole = config.get(`${role}.${field}`) ?? '';
  if (fromRole.length > 0) return fromRole;
  return config.get(`user.${field}`) ?? '';
}

function resolveIdentity(config: ReadonlyMap<string, string>, role: IdentityRole): GitIdentity {
  return { name: resolveField(config, role, 'name'), email: resolveField(config, role, 'email') };
}

/**
 * Whether `value` holds a character git's ident format cannot carry verbatim: `<` and `>` delimit the
 * email in a commit's `author`/`committer` header, and a control character (newline included) can end
 * a line of the commit body. Either lets a recorded identity, or an `Approver:` line built from it,
 * say something other than what was authorized (task-132 review, finding 2).
 */
function hasUnsafeIdentityCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '<' || char === '>' || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Resolve the identity git would record as the author of a commit made at `root` — `GIT_AUTHOR_NAME`
 * / `GIT_AUTHOR_EMAIL`, then `author.name` / `author.email`, then `user.name` / `user.email`, each
 * field independently, as `git commit` does — with no "is it valid" judgement of its own (that is
 * {@link isConfiguredIdentity}'s job).
 *
 * Before task-132 this read `user.*` alone, while the commit itself was authored by git's precedence,
 * so with `GIT_AUTHOR_EMAIL` set the identity an approval was authorized for and the one it was
 * recorded under could differ (`bug-149`). Reading in git's order makes the value the one the user
 * meant; the transition verbs then pin it as the commit's author (`commitMemoryTransition`, through
 * `GIT_AUTHOR_*` in the commit's environment), so the recorded author is this value by construction
 * rather than by agreement between two readers.
 *
 * One `git config` subprocess (it used to be two per read, and an approval read three times — six
 * subprocesses, `dl-064` Context (ii)). Called once per operation, by {@link requireGitIdentity}; the
 * result is passed on, never re-read (`dl-064` B.1).
 *
 * A git that cannot be run resolves nothing here: both fields are `''`, as before task-284. Only
 * {@link requireGitIdentity} turns that case into its own refusal; this reader has no error channel
 * and its read-only caller (`workflow next --assigned-to me`) treats an unresolved email as no member.
 */
export function readGitIdentity(root: string): GitIdentity {
  const config = readIdentityConfig(root);
  return resolveIdentity(config.ran ? config.values : new Map(), 'author');
}

/**
 * Verify that a commit made at `root` now would be attributable, and return its author. Every
 * mutating operation runs this before it reads or writes anything else (REQ-SEC-01), so a refusal
 * leaves the repository exactly as it was.
 *
 * Three refusals, all exit `1` by `exitCodeForError`:
 *
 * - **git could not be run** (`IO`, task-284, `bug-377`) — the `git config` spawn itself failed
 *   ({@link readIdentityConfig}): `could not run git: <cause>`, the cause being the spawn error's
 *   message (`spawnSync git ENOENT`). git is the storage, so this is a failure of the storage, not of
 *   the identity, and REQ-SEC-01's message would point the user at the wrong thing.
 * - **Unresolved** (`VALIDATION`) — the author's or the committer's name or email does not resolve
 *   ({@link resolveField}): REQ-SEC-01's exact message. The committer is checked too because
 *   `git commit` refuses without one: an author supplied by `GIT_AUTHOR_*` or `author.*` alone passed
 *   this check after task-132's first pass, and `git commit` then died on "Committer identity
 *   unknown" AFTER the document had been written and staged (task-132 review, finding 1).
 * - **Unusable** (`VALIDATION`) — one of the four values holds `<`, `>` or a control character
 *   ({@link hasUnsafeIdentityCharacter}): `git identity not usable: the <role> <field> contains '<',
 *   '>' or a control character`.
 *
 * On success the value is the author — the one "who" every later step uses: the authority check,
 * the `Approver:` line and the commit author (`dl-064` B.1, task-132) — never read again.
 */
export function requireGitIdentity(root: string): CoreResult<GitIdentity> {
  const read = readIdentityConfig(root);
  if (!read.ran) return coreErr({ code: 'IO', message: `could not run git: ${read.cause}` });
  const config = read.values;
  const author = resolveIdentity(config, 'author');
  const committer = resolveIdentity(config, 'committer');
  if (!isConfiguredIdentity(author.name, author.email) || !isConfiguredIdentity(committer.name, committer.email)) {
    return coreErr({ code: 'VALIDATION', message: IDENTITY_ERROR });
  }
  for (const [role, identity] of [['author', author], ['committer', committer]] as const) {
    for (const field of ['name', 'email'] as const) {
      if (hasUnsafeIdentityCharacter(identity[field])) {
        return coreErr({
          code: 'VALIDATION',
          message: `git identity not usable: the ${role} ${field} contains '<', '>' or a control character`,
        });
      }
    }
  }
  return coreOk(author);
}

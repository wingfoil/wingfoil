#!/usr/bin/env node
/**
 * The `wingfoil` CLI executable — task-007-npm-distribution (REQ-SYS-09). This is the `bin`
 * entrypoint `package.json`'s `"bin"` field maps to (compiled to `dist/cli.js`); `npm install -g
 * wingfoil` places a shim on `PATH` that runs this file directly (npm chmods it executable at link
 * time — the `#!/usr/bin/env node` shebang above is what makes the shim itself runnable).
 *
 * It wires the real `commander` program built by `./cli/program.ts` (`buildProgram`, task-006) onto
 * a real process invocation, exactly like `test/cli/fixtures/cli-harness.cjs` drives it against a
 * fixture root in tests — the difference here is `resolveRoot` resolves the *real* project root via
 * git-root detection (`./storage/git-root.ts`, spec-011-storage-layout) instead of a fixed fixture
 * path, and the real `process.argv` is parsed instead of a synthetic one.
 *
 * `resolveRoot` is only invoked lazily, once per dispatched command (see `./cli/registrar.ts`'s
 * `run`) — `--help` (Commander built-in) and `--version` (registered by `buildProgram` via
 * `.version()`, see `./cli/program.ts` — bug-001-cli-version-flag) are both handled by `commander`
 * before any command handler runs, so `wingfoil --help` / `wingfoil --version` exit `0`
 * (spec-005-cli-command-contract §1, spec-008-cli-grammar §1) even outside a git repository; only an
 * actual `<noun> <verb>` invocation needs a resolvable git root.
 */
import { DeferredExit } from './cli/exit';
import { buildProgram } from './cli/program';
import { CORE_MODULES } from './core';
import { resolveProjectRoot } from './storage/git-root';

buildProgram(CORE_MODULES, {
  resolveRoot: () => resolveProjectRoot(process.cwd()),
  // task-026's single bare `positional` (`ctx.positional`, read by `dnaShowFn`/`pathsFn` as
  // section/category), task-025's full `positionals` list (read by `dnaSetFn` as `<key> <value>`),
  // task-028's additive `flags` spread (e.g. `paths`'s `--list` -> `list: true`), plus task-020's
  // value-bearing `options` record (read by `memoryAddFn` as `type`/`title`/`tags`). A command with no
  // positional/flags/options is unaffected.
  buildParams: (ctx) => ({ root: ctx.root, positional: ctx.positional, positionals: ctx.positionals, options: ctx.options, ...(ctx.flags ?? {}) }),
})
  .then((program) => program.parseAsync(process.argv))
  .catch((error: unknown) => {
    // Not an error: an exit already chosen through `exitWith` is waiting for queued output to drain
    // (task-249, `bug-222`), and the process ends with that code once it has.
    if (error instanceof DeferredExit) return;
    // Last-resort handler for anything that escapes the per-command spec-005 exit path. Emit only the
    // message as a single `error:` line — never `error.stack`, which would leak a stack trace and
    // absolute internal paths from a published CLI (bug-002-cli-error-stack-dump). The normal
    // no-git-root path is already handled cleanly inside the registrar; this guards the unexpected.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  });

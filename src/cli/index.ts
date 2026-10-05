/**
 * `cli` module — human interface (Commander.js); the `wingfoil` command surface.
 *
 * task-006-dual-interface-shared-core adds the thin adapter (spec-006 §2): `buildCliCommands`
 * (`./registrar.ts`) derives one `wingfoil <noun> <verb>` command descriptor per operation from a
 * `CoreModule[]` registry (`src/core/index.ts`'s `CORE_MODULES`), with no business logic beyond
 * parse-format / call-core / render-result / exit. `buildProgram` (`./program.ts`) wires that model
 * onto a real `commander` `Command` tree — see that file's module doc for why `commander` (ESM-only
 * as of v15) is imported dynamically rather than statically, and why that wiring is not itself
 * exercised by an automated test in this task. A runnable `bin` entry point (calling
 * `buildProgram(CORE_MODULES, ...)` against `process.argv` and installing it as the `wingfoil`
 * executable) is left to a later task — this task's scope is the registrar mechanism and its test
 * coverage, not a shippable CLI binary (see task-006 Execution Notes).
 */
export const MODULE_NAME = 'cli' as const;

export { buildCliCommands, listRegisteredCliCommands } from './registrar';
export type { BuildCommandsOptions, CliCommand } from './registrar';
export { buildProgram } from './program';
export { DeferredExit, exitWith } from './exit';
export type { ExitCode } from './exit';
export { isValidFormat, renderSuccess } from './output';
export type { OutputFormat } from './output';
export { emitError } from './error';
export { runInit, createReadlinePrompt } from './init-command';
export type { InitCliOptions, InitCliDeps } from './init-command';
export { runMcp } from './mcp-command';
export type { McpCliDeps } from './mcp-command';

import type { ChildProcess } from 'node:child_process';

import type { SmokeReport } from './e2e-smoke.cjs';

/** Every file and directory one staging run uses, all under its work dir. */
export interface StagingPaths {
  readonly root: string;
  readonly storage: string;
  readonly htpasswd: string;
  readonly config: string;
  readonly tools: string;
  readonly pack: string;
  readonly userconfig: string;
  readonly globalconfig: string;
  readonly cache: string;
  readonly prefix: string;
}

/** A started staging registry. */
export interface StagingRegistry {
  /** Stop the registry process. */
  stop(): Promise<void>;
}

/** The side effects {@link runStaging} orchestrates — real in the script, faked in tests. */
export interface StagingEffects {
  /** Create the throwaway work dir. */
  makeWorkDir(): string;
  /** Delete the work dir (teardown). */
  removeWorkDir(dir: string): void;
  /**
   * Delete the work dir's `npmrc` — the first step of teardown, so the throwaway `_authToken` is the
   * shortest-lived artefact of a run rather than the longest (task-083, `bug-059`). Must be a no-op
   * when the file is not there (teardown runs on paths where no token was ever written).
   */
  removeToken(dir: string): void;
  /** Pack the package into `paths.pack`; returns the tarball path. */
  packTarball(paths: StagingPaths, env: NodeJS.ProcessEnv): string;
  /**
   * Install and start Verdaccio; resolves once it answers.
   *
   * `onSpawn` is called with a usable handle **as soon as the child exists**, before the readiness
   * poll — so teardown can stop a registry that is still coming up. Taking the resolved value alone
   * left a window (the poll sleeps 500 ms between probes) in which an interrupt tore down without
   * stopping the child, orphaning it on the staging port (reject `8937a51`).
   */
  startRegistry(
    paths: StagingPaths,
    env: NodeJS.ProcessEnv,
    onSpawn?: (registry: StagingRegistry) => void,
  ): Promise<StagingRegistry>;
  /** Register a throwaway user and write its token to `paths.userconfig`. */
  createToken(paths: StagingPaths): Promise<void>;
  /** Run `npm <args>`; throws on a non-zero exit. */
  npm(args: readonly string[], env: NodeJS.ProcessEnv, paths: StagingPaths): void;
  /**
   * Run the dl-023 smoke against the installed `wingfoil`. With `commit`, `wingfoil --version` must be
   * exactly `<version> (<commit>)` (task-254, `bug-235`).
   */
  smoke(env: NodeJS.ProcessEnv, version: string, commit?: string): SmokeReport;
  /** Progress sink. */
  log(line: string): void;
}

/** Options for {@link runStaging}. */
export interface StagingOptions {
  /** Package name (`package.json` `name`). */
  readonly name: string;
  /** Package version (`package.json` `version`). */
  readonly version: string;
  /** A pre-built tarball to stage instead of packing (CI: the gate job's artifact). */
  readonly tarball?: string;
  /**
   * The commit the tarball was built from (`--expect-commit`; CI: `GITHUB_SHA`). The smoke then
   * requires the installed build stamp to name it; omitted, the stamp's commit is not checked.
   */
  readonly commit?: string;
  /** The effects to run. */
  readonly effects: StagingEffects;
  /** Environment to derive the staging environment from (defaults to `process.env`). */
  readonly baseEnv?: NodeJS.ProcessEnv;
  /**
   * Arm the interrupt handlers (task-083). Omitted — as every offline test omits it — `runStaging`
   * installs nothing on any process; the real `main()` passes `{ target: process, die: raiseSignal }`.
   */
  readonly interrupts?: TeardownHandlerOptions;
}

/** The part of `process` {@link installTeardownHandlers} uses; faked in tests. */
export interface SignalTarget {
  on(signal: string, handler: () => unknown): unknown;
  removeListener(signal: string, handler: () => unknown): unknown;
}

/** Options for {@link installTeardownHandlers}. */
export interface TeardownHandlerOptions {
  /** The teardown to run before dying. Must be idempotent: the `finally` path may call it too. */
  readonly teardown?: () => Promise<void>;
  /** Progress sink; supplied by {@link runStaging} from its effects. */
  readonly log?: (line: string) => void;
  /** How to end the process once teardown is done (default: re-raise the signal). */
  readonly die?: (signal: string) => void | Promise<void>;
  /** Where the handlers are installed (default: `process`). */
  readonly target?: SignalTarget;
  /** Which signals to handle (default: {@link TEARDOWN_SIGNALS}). */
  readonly signals?: readonly string[];
}

/** Options for {@link stopProcess}. */
export interface StopProcessOptions {
  /** Whether the child is already known to have exited; when true nothing is signalled. */
  readonly hasExited?: () => boolean;
  /** How long `SIGTERM` gets before `SIGKILL` (default {@link REGISTRY_STOP_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
  /** How long `SIGKILL` gets before resolving anyway (default {@link SIGKILL_GRACE_MS}). */
  readonly killGraceMs?: number;
}

/** The transient staging registry address. */
export const STAGING_REGISTRY: string;
/** Default interval between `SIGTERM` and `SIGKILL` when stopping a staging child. */
export const REGISTRY_STOP_TIMEOUT_MS: number;
/** Default grace given to `SIGKILL` before {@link stopProcess} resolves regardless. */
export const SIGKILL_GRACE_MS: number;
/** The Verdaccio package spec installed for staging. */
export const VERDACCIO_PACKAGE: string;
/** The catchable signals that run teardown before this script dies (task-083, `bug-059`). */
export const TEARDOWN_SIGNALS: readonly string[];

/** Work-dir layout for one staging run. */
export function stagingPaths(root: string): StagingPaths;
/** Verdaccio config: no uplink for the package under test, npmjs proxy for everything else. */
export function verdaccioConfig(paths: StagingPaths, packageName?: string): string;
/** Scrubbed, work-dir-isolated environment for every staging subprocess. */
export function stagingEnv(base: NodeJS.ProcessEnv, paths: StagingPaths): NodeJS.ProcessEnv;
/** argv publishing a tarball to staging, provenance off. */
export function publishArgs(tarball: string): string[];
/** argv globally installing the exact staged version from staging. */
export function installArgs(name: string, version: string): string[];
/** Parse `[--tarball <path>] [--expect-commit <sha>]`; throws on a bad argument or commit name. */
export function parseArgs(argv: readonly string[]): { tarball?: string; expectCommit?: string };
/** The real effects: a filesystem work dir, a Verdaccio child process, npm subprocesses, the smoke. */
export function realEffects(repoRoot: string, log: (line: string) => void): StagingEffects;
/** Run the staging flow; resolves to the exit code. Teardown runs on every path. */
export function runStaging(options: StagingOptions): Promise<number>;
/** Stop a child: `SIGTERM`, bounded wait, `SIGKILL` — always resolves (dl-057 item c). */
export function stopProcess(child: ChildProcess, options?: StopProcessOptions): Promise<void>;
/**
 * Run `teardown` on every signal in `signals`, then die *by* that signal; returns the uninstall.
 * Re-entrant signals are absorbed, and a teardown that throws still exits (task-083, `bug-059`).
 */
export function installTeardownHandlers(options: TeardownHandlerOptions): () => void;

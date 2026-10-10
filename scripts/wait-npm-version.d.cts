/** What one `npm view` run answered. */
export interface NpmViewAnswer {
  /** npm's exit status (`null` when it could not be started). */
  readonly status: number | null;
  /** npm's standard output: the version when it is served. */
  readonly stdout: string;
  /** npm's standard error. */
  readonly stderr: string;
}

/** Inputs of {@link waitForNpmVersion}; the clock, the sleep and npm are injected. */
export interface WaitForNpmVersionOptions {
  /** The package name, e.g. `wingfoil`. */
  readonly name: string;
  /** The exact version awaited, `X.Y.Z`. */
  readonly version: string;
  /** How long after the first attempt to keep polling; `0` means one attempt. */
  readonly timeoutMs: number;
  /** The wait between attempts (the last one is shortened to the deadline). */
  readonly intervalMs: number;
  /** Runs `npm` with the given arguments. */
  readonly view: (args: readonly string[]) => Promise<NpmViewAnswer>;
  /** The current time, in milliseconds. */
  readonly now: () => number;
  /** Waits the given milliseconds. */
  readonly sleep: (ms: number) => Promise<void>;
  /** Receives one line per attempt. */
  readonly log: (line: string) => void;
}

/** Outcome of {@link waitForNpmVersion}. */
export interface WaitForNpmVersionResult {
  /** `true` only when npm answered exactly the version awaited. */
  readonly ok: boolean;
  /** How many times npm was asked. */
  readonly attempts: number;
  /** One readable line: live, or not live after the timeout with npm's last answer. */
  readonly message: string;
}

/** task-229: the `npm` arguments asking for one exact version — `view <name>@<version> version`, never a dist-tag. */
export function npmViewArgs(name: string, version: string): string[];

/** task-229 (`dl-130` step 1, `adr-011`): poll npm until it serves `version`, at most `timeoutMs`. */
export function waitForNpmVersion(options: WaitForNpmVersionOptions): Promise<WaitForNpmVersionResult>;

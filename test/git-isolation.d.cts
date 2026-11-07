/** Where the isolated git configuration of a jest run lives. */
export interface GitIsolation {
  /** The run's directory, `<tmp>/wf-git-isolation-r<pid>-…`, recorded as `WF_GIT_ISOLATION_DIR`. */
  readonly dir: string;
  /** `<dir>/gitconfig`, holding `ISOLATED_GLOBAL_CONFIG`. */
  readonly globalConfig: string;
  /** `<dir>/xdg`, an empty directory. */
  readonly xdgConfigHome: string;
}

/**
 * `base` without `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>`, plus
 * `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM=1` and `XDG_CONFIG_HOME`; every other variable kept. Pure.
 */
export function isolatedGitEnv(
  base: Readonly<Record<string, string | undefined>>,
  isolation: { readonly globalConfig: string; readonly xdgConfigHome: string },
): Record<string, string | undefined>;

/** Create the run's isolation directory, its `gitconfig` and its empty `xdg/` (task-349, bug-446). */
export function prepareGitIsolation(root?: string): GitIsolation;

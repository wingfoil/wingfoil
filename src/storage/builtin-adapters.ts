/**
 * The built-in agent adapter manifests the `wingfoil` package ships (`spec-016-agent-execution` §2.1,
 * §2.8; `adr-012` point 2; task-196).
 *
 * **How they reach a project.** `wingfoil init` writes each one to `.wingfoil/agents/built-in/<name>.yaml`
 * (`templateScaffold`, ./templates), as it writes the P3.8 directive templates to
 * `directives/built-in/`. The installed copy pins the launch argv in the project's git history, so two
 * clones launch the same argv (REQ-SYS-07). Like the directive templates, they ship as DATA compiled
 * into `dist/` (`spec-015` §1 keeps the tarball allowlist at `files: ["dist", "README.md"]`).
 *
 * **What is checked.** Every manifest is derived back out of the scaffold by `builtinTemplateSources`
 * (kind `adapter`) and run through `verifyBuiltinTemplates` before anything is written: the task-177
 * manifest schema as a built-in (REQ-SEC-10), then the spec-007 §4 step 5 secret scan.
 *
 * **Empty today.** The two built-ins of `spec-016` §2.8 (`claude-code`, `codex-cli`) are their own
 * tasks, each with its `verified_with` pass by hand; none is established in this repository yet. Until
 * one lands, `init` reserves the directory with a `.gitkeep`.
 */

/** One shipped built-in adapter: its name (the file basename) and its manifest's YAML text. */
export interface BuiltinAdapterManifest {
  /** The adapter's name; written as `<name>.yaml`, and the manifest's own `name` must equal it. */
  readonly name: string;
  /** The manifest, written byte for byte. */
  readonly content: string;
}

/** The built-in adapters `wingfoil init` installs, in the order they are listed. None ships yet. */
export const BUILTIN_ADAPTERS: readonly BuiltinAdapterManifest[] = [];

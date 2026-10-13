/** One line of an `llms.txt` section (`docs/site.yaml` `llms[].entries[]`). */
export interface SiteLlmsEntry {
  /** The link text. */
  readonly title: string;
  /** One line saying what the document is for. */
  readonly about: string;
  /** A repository file that is part of the site; exclusive with `site_path`. */
  readonly path: string | undefined;
  /** A site path the Pages workflow generates (e.g. `api/`); exclusive with `path`. */
  readonly site_path: string | undefined;
  /** The package.json script that builds `site_path`. */
  readonly built_by: string | undefined;
}

/** `docs/site.yaml`: the site's declared sources and its `llms.txt` index (task-234, dl-129). */
export interface SiteManifest {
  /** The `llms.txt` title and the site's title. */
  readonly title: string;
  /** The `llms.txt` blockquote and the site's description. */
  readonly summary: string;
  /** Markdown pages, copied to the same repository-relative path. */
  readonly pages: readonly string[];
  /** Directories copied recursively, each with a trailing slash. */
  readonly files: readonly string[];
  /** The `llms.txt` sections, in order. */
  readonly llms: ReadonlyArray<{ readonly section: string; readonly entries: readonly SiteLlmsEntry[] }>;
}

/** task-234: parse `<root>/docs/site.yaml`; throws when it is missing or not of the declared shape. */
export function readSiteManifest(root: string): SiteManifest;

/** task-234 (dl-116): the declaration's problems, one line each, sorted; `[]` when it is sound. */
export function checkSiteManifest(
  root: string,
  manifest: SiteManifest,
  scripts: Readonly<Record<string, string>>,
): string[];

/** task-234 (dl-129 §3): the `llms.txt` text, absolute URLs under `homepage`, one trailing newline. */
export function renderLlmsTxt(manifest: SiteManifest, homepage: string): string;

/**
 * task-234 (dl-129 §2): assemble the site's sources into `outDir` (absent or empty) — pages and directories at their
 * repository paths, out-of-site links pointing at the repository at `options.ref`, `llms.txt`, `_config.yml`.
 */
export function assembleSite(root: string, outDir: string, options: { readonly ref: string }): { readonly files: readonly string[] };

/** task-234: the CLI (`llms [--check]`, `site --out <dir> --ref <commit>`, `--root <dir>`); returns the exit code. */
export function main(argv: readonly string[]): number;

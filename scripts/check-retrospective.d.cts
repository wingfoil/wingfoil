/**
 * `true` when `markdown` holds, under a `## …Execution Notes` section (`## Execution Notes`, or a bug's `## Triage &
 * Execution Notes`), a `### Retrospective` subsection whose last occurrence has at least one non-blank line outside
 * HTML comments: `None` is an entry, the template's comment alone is not (task-358, `dl-115` Q1 (A), approver ruling
 * D2 (b)). A heading inside a fenced code block is not a heading. Pure.
 */
export function hasRetrospectiveEntry(markdown: string): boolean;

/**
 * I/O, read-only: the files among `paths` (repository-relative, confined to `root`), then each task's `closed` bugs
 * of its `bug:` list (found under `memory.yaml`'s `bug.path` directory by full or short id), that hold no
 * `### Retrospective` entry, in that order. Throws when the check cannot run — no path, a path outside `root`, a
 * missing file, a file that is not a Memory document of `root`'s `memory.yaml`, a `bug:` id with no file or several —
 * which the command line reports with exit 2.
 */
export function missingRetrospectives(root: string, paths: readonly string[]): string[];

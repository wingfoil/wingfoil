/**
 * bug-225 (fixed by task-190) — every `uses:` in `.github/workflows/` is a full commit SHA with its
 * release tag in a trailing comment (`dl-057`, `task-113`), checked over the directory, so a workflow
 * file is covered the moment it is added rather than when its own suite is written.
 *
 * The file-specific suites keep their stricter checks: `publish-pipeline.test.ts` (an exact SHA ↔ tag
 * table), `ci-workflow.test.ts` and `dependency-check-workflow.test.ts` (each line is one the reference
 * file already has), `scorecard-workflow.test.ts` (its own table). This suite is the floor under all of
 * them. Exempt by rule, not by name: a local action (`./…`) and a container image (`docker://…`), which
 * have no repository commit to pin.
 *
 * Offline: the files are read from the working tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

const WORKFLOWS_DIR = join(__dirname, '..', '..', '.github', 'workflows');

/** `owner/repo[/path]@<40 hex> # vX.Y.Z` — the one accepted form of a remote action reference. */
const PINNED = /^(?:- )?uses: [\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

/** A reference exempt by rule: a local action or a container image. */
const EXEMPT = /^(?:- )?uses: (?:\.\/|docker:\/\/)/;

/** True when a trimmed `uses:` line satisfies the pin rule. */
function satisfiesPinRule(line: string): boolean {
  return EXEMPT.test(line) || PINNED.test(line);
}

/** Every `.yml`/`.yaml` file of the directory, sorted (a deterministic order for the report). */
function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
}

/** The trimmed `uses:` lines of a file (step-level `- uses:` and job-level `uses:` alike). */
function usesLines(raw: string): string[] {
  return raw
    .split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line))
    .map((line) => line.trim());
}

/** Every `uses` value the YAML parser sees — job-level (reusable workflows) and step-level. */
function parsedUses(raw: string): string[] {
  const parsed = yamlLoad(raw) as {
    readonly jobs?: Readonly<Record<string, { readonly uses?: string; readonly steps?: readonly { readonly uses?: string }[] }>>;
  };
  const found: string[] = [];
  for (const job of Object.values(parsed.jobs ?? {})) {
    if (job.uses !== undefined) found.push(job.uses);
    for (const step of job.steps ?? []) if (step.uses !== undefined) found.push(step.uses);
  }
  return found;
}

describe('bug-225 — every `uses:` in .github/workflows/ is a full commit SHA with its tag', () => {
  it('finds the workflow directory non-empty', () => {
    expect(workflowFiles().length).toBeGreaterThan(0);
  });

  it.each(workflowFiles())('%s: every `uses:` line is `owner/repo[/path]@<40 hex> # vX.Y.Z`', (file) => {
    const raw = readFileSync(join(WORKFLOWS_DIR, file), 'utf-8');
    const offending = usesLines(raw).filter((line) => !satisfiesPinRule(line));
    expect({ file, offending }).toEqual({ file, offending: [] });
  });

  it.each(workflowFiles())('%s: every `uses` the YAML parser sees is on a line of its own the rule read', (file) => {
    // Guards the line scan: a flow-style `{ uses: … }` or a quoted key would escape it, and is caught here.
    const raw = readFileSync(join(WORKFLOWS_DIR, file), 'utf-8');
    const lines = usesLines(raw).map((line) => line.replace(/^(?:- )?uses: /, '').replace(/ # .*$/, ''));
    expect({ file, uses: parsedUses(raw).sort() }).toEqual({ file, uses: lines.sort() });
  });

  it('rejects the forms the rule exists to keep out, and admits the exempt ones', () => {
    const sha = 'a'.repeat(40);
    expect(satisfiesPinRule(`- uses: actions/checkout@${sha} # v7.0.1`)).toBe(true);
    expect(satisfiesPinRule(`- uses: github/codeql-action/upload-sarif@${sha} # v4.38.2`)).toBe(true);
    expect(satisfiesPinRule(`uses: owner/repo/.github/workflows/x.yml@${sha} # v1.0.0`)).toBe(true);
    expect(satisfiesPinRule('- uses: ./.github/actions/local')).toBe(true);
    expect(satisfiesPinRule('- uses: docker://alpine:3.20')).toBe(true);
    expect(satisfiesPinRule('- uses: actions/checkout@v7')).toBe(false);
    expect(satisfiesPinRule('- uses: actions/checkout@v7.0.1')).toBe(false);
    expect(satisfiesPinRule(`- uses: actions/checkout@${sha}`)).toBe(false);
    expect(satisfiesPinRule(`- uses: actions/checkout@${sha.slice(0, 7)} # v7.0.1`)).toBe(false);
    expect(satisfiesPinRule(`- uses: actions/checkout@${sha} # main`)).toBe(false);
    expect(satisfiesPinRule(`- uses: actions/checkout@${'A'.repeat(40)} # v7.0.1`)).toBe(false);
  });
});

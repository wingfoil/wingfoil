/**
 * task-306 (`bug-428`, `bug-433`, `bug-405`; `release-planning-rel-v0.3.2-plan` R8) — the texts that go with
 * `release-publishing`'s new last phase `merge-forward`, its `publish` phase waiting for the tarball, and the run
 * `tests.passing` names. The phase itself (its shape, the registry, the version) is pinned in
 * `test/core/workflow-integration-branch.test.ts` (AC 1); `git-conventions` §1 rule 6 in
 * `test/directives/git-conventions.test.ts` (AC 2); the script in `test/cli/wait-npm-version*.test.ts` (AC 3).
 *
 * - AC 2 (red-first, design D1): `AGENTS.md` §6 and `.wingfoil/WORKFLOW.md`'s *Release Publishing* name the phase;
 *   the "by hand" sentences are gone.
 * - AC 3 (red-first): `publish`'s post check and description say the version is installable once its
 *   `dist.tarball` answers HTTP 200; `publish.yml`'s and `pages.yml`'s headers say what the wait now waits for
 *   (design: publish.yml line 27; approver ruling D6: pages.yml line 24).
 * - AC 4 (red-first, design D1): `publish` states that `tests.passing` is the run on the release commit; the
 *   comment above `tests.passing:` in `bindings.yaml` says the same (D3: comments only, the binding unchanged).
 *
 * Workflow and bindings files are read **as `HEAD` holds them** (`loadWorkflowRegistryAtHead`, `git show HEAD:`),
 * the documents and the GitHub workflows from the working tree, as their own suites do. Prose is pinned as
 * substrings of whitespace-flattened text (task-276); every absence sits beside its positive; version pins are "≥"
 * plus the history entry naming the task (bug-314).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as yamlLoad } from 'js-yaml';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import type { Phase } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const BINDINGS_FILE = '.wingfoil/workflows/bindings.yaml';
const NEW_POST =
  'staged version approved on npm, installable from the npm registry once its tarball answers HTTP 200, its GitHub Release created with the test reports attached and its MCP Registry listing published';

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf-8');
const atHead = (path: string): string => execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
const flat = (text: string): string => text.replace(/\s+/g, ' ');
/** The leading comment block of a YAML file up to `stop`, `#` markers removed, flattened. */
const header = (raw: string, stop: string): string => {
  const end = raw.indexOf(stop);
  return flat((end < 0 ? raw : raw.slice(0, end)).replace(/^\s*#\s?/gm, ''));
};

function publishingPhase(name: string): Phase {
  const wf = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'release-publishing');
  const phase = wf?.phases.find((p) => p.name === name);
  if (phase === undefined) throw new Error(`release-publishing has no phase '${name}' at HEAD`);
  return phase;
}

describe('task-306 AC 2 — AGENTS.md §6 and WORKFLOW.md name the merge-forward phase', () => {
  it('AGENTS.md §6 chains `mark-released` → `merge-forward`, no longer "no phase declares it yet"', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('`mark-released` → `merge-forward`');
    expect(agents).not.toContain('no phase declares it yet');
  });

  const guide = read('.wingfoil/WORKFLOW.md');

  it("WORKFLOW.md's Release Publishing section names the phase and its node, no longer 'run by hand until a workflow declares it'", () => {
    const start = guide.indexOf('### Release Publishing');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = guide.indexOf('\n### ', start + 1);
    const section = guide.slice(start, end < 0 ? undefined : end);
    expect(section).toContain('**merge-forward**');
    expect(section).toContain('`merge-forward`');
    expect(flat(section)).not.toContain('run by hand until a workflow declares it');
  });

  it('the RP2 node of the release-cycle diagram ends its chain with mark-released → merge-forward', () => {
    const node = guide.split('\n').find((line) => line.trimStart().startsWith('RP2["'));
    expect(node).toBeDefined();
    expect(node).toContain('mark-released → merge-forward');
  });
});

describe('task-306 AC 3 — publish waits for the tarball (bug-433)', () => {
  it('the post check says the version is installable once its tarball answers HTTP 200 (one prose check, no `(` or `:`)', () => {
    expect(publishingPhase('publish').checks?.post).toEqual([NEW_POST]);
    expect(NEW_POST).not.toMatch(/[(:]/);
  });

  it('the description names dist.tarball and HTTP 200, and still no branch by name', () => {
    const description = flat(publishingPhase('publish').description ?? '');
    expect(description).toContain('dist.tarball');
    expect(description).toContain('HTTP 200');
    expect(description).not.toMatch(/\bmain\b/);
  });

  it("publish.yml's header runbook: the release job waits until npm view lists the version and its tarball answers HTTP 200", () => {
    const text = header(read('.github/workflows/publish.yml'), '\nname: publish');
    expect(text).toContain('`npm view wingfoil@<version> version dist.tarball --json`');
    expect(text).toContain('HTTP 200');
  });

  it("pages.yml's header (approver ruling D6): the build waits for the version's tarball too", () => {
    const text = header(read('.github/workflows/pages.yml'), '\nname: pages');
    expect(text).toContain('scripts/wait-npm-version.cjs');
    expect(text).toContain('tarball');
    expect(text).toContain('HTTP 200');
  });
});

describe('task-306 AC 4 — tests.passing is the run on the release commit (bug-405)', () => {
  it("publish's description says which run satisfies tests.passing, the no-identity suite, citing bug-405", () => {
    const description = flat(publishingPhase('publish').description ?? '');
    expect(description).toContain('`tests.passing` is the run on the release commit');
    expect(description).toContain('test:no-identity');
    expect(description).toContain('bug-405');
  });

  const raw = atHead(BINDINGS_FILE);

  /** The `#` comment lines directly above the line starting with `key`, flattened. */
  function commentAbove(key: string): string {
    const lines = raw.split('\n');
    const at = lines.findIndex((line) => line.startsWith(key));
    if (at < 0) throw new Error(`no line starting ${key}`);
    const block: string[] = [];
    for (let i = at - 1; i >= 0 && /^\s*#/.test(lines[i] ?? ''); i -= 1) block.unshift(lines[i] ?? '');
    return flat(block.join('\n').replace(/^\s*#\s?/gm, ''));
  }

  it('the comment above tests.passing: names release-publishing.publish and the run on the release commit; the binding is unchanged', () => {
    const comment = commentAbove('  tests.passing:');
    expect(comment).toContain('release-publishing.publish');
    expect(comment).toContain('the run on the release commit');
    const bindings = yamlLoad(raw) as { checks: Record<string, unknown> };
    expect(bindings.checks['tests.passing']).toEqual({ run: ['npm', 'test'] });
  });

  it('the git.merge comments name the merge-forward form (design D3, comments only)', () => {
    expect(commentAbove('  git.merge:')).toContain('git.merge(from: integration_branch, ff: false)');
  });

  it('bindings.yaml `version:` is 2.7 or later with a 2.7 entry naming task-306', () => {
    const match = /^version: "?(\d+\.\d+)"?(.*)$/m.exec(raw);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(2.7);
    expect(raw).toMatch(/2\.7 [^;]*task-306/);
  });
});

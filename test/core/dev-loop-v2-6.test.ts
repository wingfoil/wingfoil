/**
 * task-367 AC 7 (`bug-530`; `spec-018` §3, `dl-212` D1; approver ruling D11) — `dev-loop.yaml` 2.6 and the `wingfoil-cli`
 * directive 1.7 say that the approver runs `memory reject` and `memory amend` from their own terminal and that an agent
 * never does: the verbs refuse an agent's session (`spec-018` §3), so "the person or agent running the reject" and a
 * tag "added by `memory amend` on the approver's instruction" describe a run that cannot happen.
 *
 * Read **as `HEAD` holds it** (`git show HEAD:`, `loadWorkflowRegistryAtHead`, `workflowShowAtHead`), like
 * `test/core/dev-loop-v2-4.test.ts`. Version pins are "≥" plus the newest clause naming the task (bug-314). The
 * header comment and §3 are compared with their line breaks folded to single spaces, so a rewrap does not matter.
 *
 * - red-first (D11): the version rows and the corrected sentences — today `dev-loop.yaml` is 2.5 and says "the person
 *   or agent running the reject", and §3 says "on the approver's instruction";
 * - characterization: the dev-loop phase names and their order, no error diagnostic from `workflow show` at `HEAD`;
 *   and the pinned build (`node_modules/wingfoil-released`, `wingfoil-cli` §1) still reads both files —
 *   `workflow show dev-loop --format json` lists the seven phases with no error diagnostic, `directives list
 *   --format json` lists `directives/custom/wingfoil-cli.md` with no warning (`dl-205`; the design's scratch-clone
 *   proof, as a test). Both pass before and after the change.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { spawnCapture } from '../cli/helpers/spawn-cli';

const ROOT = join(__dirname, '..', '..');
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';
const WINGFOIL_CLI_FILE = '.wingfoil/directives/custom/wingfoil-cli.md';
const PINNED_CLI = join('node_modules', 'wingfoil-released', 'dist', 'cli.js');
const PHASES = ['start', 'design', 'red', 'green', 'refactor', 'review', 'done'];

function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

/** A `version:` line's comment split at its first `(prev `: the newest clause, and the whole comment. */
function versionComment(text: string): { version: number; head: string; comment: string } {
  const line = /^version:\s*"?([0-9.]+)"?[^#\n]*#(.*)$/m.exec(text);
  if (line === null) throw new Error('no commented version: line');
  const comment = line[2]!;
  const cut = comment.indexOf('(prev ');
  return { version: Number(line[1]), head: cut < 0 ? comment : comment.slice(0, cut), comment };
}

/** The leading comment block of a YAML file, `# ` markers dropped, folded to one line. */
function headerComment(text: string): string {
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) break;
    lines.push(line.replace(/^#\s?/, ''));
  }
  return lines.join(' ').replace(/\s+/g, ' ');
}

/** A Markdown `## <n>.` section, up to the next `## `, folded to one line. */
function section(text: string, number: number): string {
  const start = text.search(new RegExp(`^## ${number}\\. `, 'm'));
  if (start < 0) throw new Error(`no section ${number}`);
  const rest = text.slice(start + 3);
  const end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

describe('task-367 AC 7 — dev-loop.yaml 2.6: the approver runs the reject from their own terminal, an agent never does (bug-530)', () => {
  it('red-first: `version:` is 2.6 or later and its newest clause names task-367, keeping `prev 2.3`', () => {
    const { version, head, comment } = versionComment(atHead(DEV_LOOP_FILE));
    expect(version).toBeGreaterThanOrEqual(2.6);
    expect(head).toContain('task-367');
    expect(comment).toContain('prev 2.3');
  });

  it('red-first: the header says "their own terminal" and "an agent never", no longer "the person or agent running the reject"', () => {
    const header = headerComment(atHead(DEV_LOOP_FILE));
    expect(header).toContain('their own terminal');
    expect(header).toContain('an agent never');
    expect(header).not.toContain('the person or agent running the reject');
  });

  it('characterization: the phase names and their order are unchanged, and workflow show at HEAD reports no error', () => {
    const workflow = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'dev-loop');
    expect(workflow?.phases.map((p) => p.name)).toEqual(PHASES);
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    expect(shown.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('task-367 AC 7 — wingfoil-cli 1.7: the pinned-build tag is added by a memory amend the approver runs (bug-530)', () => {
  it('red-first: `version:` is "1.7" or later and its newest clause names task-367, keeping `prev 1.5`', () => {
    const { version, head, comment } = versionComment(atHead(WINGFOIL_CLI_FILE));
    expect(version).toBeGreaterThanOrEqual(1.7);
    expect(head).toContain('task-367');
    expect(comment).toContain('prev 1.5');
  });

  it('red-first: §3 says "their own terminal", no longer "on the approver\'s instruction"', () => {
    const three = section(atHead(WINGFOIL_CLI_FILE), 3);
    expect(three).toContain('their own terminal');
    expect(three).not.toContain("on the approver's instruction");
  });
});

describe('task-367 AC 7 — the pinned build still reads both files (dl-205, wingfoil-cli §1)', () => {
  it('characterization: `workflow show dev-loop --format json` on the pinned build lists the seven phases, no error diagnostic', () => {
    const run = spawnCapture(process.execPath, [PINNED_CLI, 'workflow', 'show', 'dev-loop', '--format', 'json'], { cwd: ROOT });
    expect(run.status).toBe(0);
    const shown = JSON.parse(run.stdout) as { workflow: { phases: { name: string }[] }; diagnostics: { severity: string }[] };
    expect(shown.workflow.phases.map((p) => p.name)).toEqual(PHASES);
    expect(shown.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('characterization: `directives list --format json` on the pinned build lists directives/custom/wingfoil-cli.md, no warning', () => {
    const run = spawnCapture(process.execPath, [PINNED_CLI, 'directives', 'list', '--format', 'json'], { cwd: ROOT });
    expect(run.status).toBe(0);
    const listed = JSON.parse(run.stdout) as { entries: { path: string }[]; warnings: unknown[] };
    expect(listed.entries.map((entry) => entry.path)).toContain('directives/custom/wingfoil-cli.md');
    expect(listed.warnings).toEqual([]);
  });
});

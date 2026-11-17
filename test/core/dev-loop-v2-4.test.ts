/**
 * task-348 (`dl-205` Q1 (a), approver rulings D1–D3 (a), 2026-11-08) — `dev-loop.yaml` 2.4: the `design` phase
 * checks every `.wingfoil/` shape change against the pinned build before `red`. Its description gains a fourth
 * instruction (load the proposed files with the pinned build on a scratch copy, record the commands, declare any
 * break before `red`), and its `checks.post` the fifth entry `pinned-build.reads`, bound `manual: true` in
 * `workflows/bindings.yaml` (D1 (a): at `design` the branch still holds the unchanged configuration, so a `run`
 * binding would prove nothing); one version bump of each file.
 *
 * Read **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, `workflowShowAtHead`, `git show HEAD:`), like
 * `test/core/dev-loop-v2-3.test.ts`. Version pins are "≥" plus the comment naming the task (bug-314).
 *
 * - AC 1 (red-first): the token, fifth in `design.checks.post`, on no other phase; its prose and the description's
 *   instruction; its `manual: true` binding, resolved and shown by `workflow show` (AC 4's jest twin); the
 *   `bindings.yaml` version and its history entry;
 * - AC 3 (red-first, the version row; approver ruling on the design): `dev-loop.yaml` raises `version:` once;
 * - AC 3 (characterization): the phase names and their order, no error at `HEAD`, and no warning naming
 *   `pinned-build.reads`; since task-358 (`bug-469`) the registry raises no diagnostic at all (68 → 0).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { resolveToken, tokenName } from '../../src/workflow/bindings';
import type { Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');
const DEV_LOOP_FILE = '.wingfoil/workflows/custom/dev-loop.yaml';
const BINDINGS_FILE = '.wingfoil/workflows/bindings.yaml';
const TOKEN = 'pinned-build.reads';

function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

function devLoop(): Workflow {
  const workflow = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === 'dev-loop');
  if (workflow === undefined) throw new Error('no dev-loop workflow at HEAD');
  return workflow;
}

function phase(name: string): Workflow['phases'][number] {
  const found = devLoop().phases.find((p) => p.name === name);
  if (found === undefined) throw new Error(`no dev-loop phase ${name}`);
  return found;
}

function designToken(): string | undefined {
  return (phase('design').checks?.post ?? []).find((check) => tokenName(check) === TOKEN);
}

/** A `version:` line's comment split at its first `(prev `: the newest clause, and the whole comment. */
function versionComment(text: string): { version: number; head: string; comment: string } {
  const line = /^version:\s*"?([0-9.]+)"?[^#\n]*#(.*)$/m.exec(text);
  if (line === null) throw new Error('no commented version: line');
  const comment = line[2]!;
  const cut = comment.indexOf('(prev ');
  return { version: Number(line[1]), head: cut < 0 ? comment : comment.slice(0, cut), comment };
}

describe('task-348 AC 1 — dev-loop design checks a .wingfoil/ shape change against the pinned build (dl-205 Q1 (a))', () => {
  it('red-first: design.checks.post names its four checks and appends pinned-build.reads, fifth', () => {
    expect((phase('design').checks?.post ?? []).map(tokenName)).toEqual([
      'frontmatter.required',
      'tech-spec.approved',
      'depends_on.acknowledged',
      'acceptance-criteria.consistent',
      TOKEN,
    ]);
  });

  it('red-first: the pinned-build.reads prose names the pinned build, the scratch copy, before red, KNOWN_READ_FAILURES and wingfoil-cli §1', () => {
    const token = designToken();
    expect(token).toBeDefined();
    for (const phrase of ['pinned build', 'scratch copy', 'before red', 'KNOWN_READ_FAILURES', 'wingfoil-cli §1']) {
      expect(token).toContain(phrase);
    }
  });

  it('red-first: no other dev-loop phase declares pinned-build.reads, pre or post', () => {
    const declaring = devLoop()
      .phases.filter((p) => [...(p.checks?.pre ?? []), ...(p.checks?.post ?? [])].some((check) => tokenName(check) === TOKEN))
      .map((p) => p.name);
    expect(declaring).toEqual(['design']);
  });

  it('red-first: design.description states the check: .wingfoil/, the pinned build, a scratch copy, npm run check:mcp, dl-205', () => {
    const description = phase('design').description ?? '';
    for (const phrase of ['.wingfoil/', 'pinned build', 'scratch copy', 'npm run check:mcp', 'dl-205']) {
      expect(description).toContain(phrase);
    }
  });

  it('red-first: bindings.yaml binds pinned-build.reads manual: true, and the design token resolves to it', () => {
    const { bindings } = loadWorkflowRegistryAtHead(ROOT);
    expect(bindings?.checks?.[TOKEN]).toEqual({ manual: true });
    expect(resolveToken(TOKEN, 'check', bindings)).toEqual({ kind: 'manual', source: 'project' });
    const token = designToken();
    expect(token).toBeDefined();
    expect(resolveToken(token!, 'check', bindings)).toEqual({ kind: 'manual', source: 'project' });
  });

  it('red-first: workflow show dev-loop at HEAD lists pinned-build.reads on design only, bound manual and evaluated: false (AC 4\'s jest twin)', () => {
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    const views = shown.value.workflow.phases.flatMap((p) =>
      [...p.checks.pre, ...p.checks.post]
        .filter((check) => tokenName(check.token) === TOKEN)
        .map((check) => [p.name, check.binding.kind, check.evaluated]),
    );
    expect(views).toEqual([['design', 'manual', false]]);
  });

  it('red-first: bindings.yaml `version:` is 3.0 or later, with a task-348 history entry numbered at least 3.0 (bug-314)', () => {
    const line = /^version:.*$/m.exec(atHead(BINDINGS_FILE))![0];
    expect(Number(/^version:\s*"?([0-9.]+)/.exec(line)![1])).toBeGreaterThanOrEqual(3.0);
    // Each `;`-separated segment of the version comment opens with its own version number.
    const entries = line
      .replace(/^version:[^#]*#/, '')
      .split(';')
      .map((segment) => /^\s*(\d+\.\d+)\b/.exec(segment))
      .filter((match): match is RegExpExecArray => match !== null && match.input.includes('task-348'))
      .map((match) => Number(match[1]));
    expect(entries.length > 0 ? Math.max(...entries) : Number.NaN).toBeGreaterThanOrEqual(3.0);
  });
});

describe('task-348 AC 3 — dev-loop.yaml raises its version once; the rest of the workflow is unchanged', () => {
  it('red-first: `version:` is 2.4 or later and its newest clause names task-348, keeping `prev 2.3`', () => {
    const { version, head, comment } = versionComment(atHead(DEV_LOOP_FILE));
    expect(version).toBeGreaterThanOrEqual(2.4);
    expect(head).toContain('task-348');
    expect(comment).toContain('prev 2.3');
  });

  it('characterization: the phase names and their order are unchanged, and workflow show reports no error', () => {
    expect(devLoop().phases.map((p) => p.name)).toEqual(['start', 'design', 'red', 'green', 'refactor', 'review', 'done']);
    const shown = workflowShowAtHead(ROOT, 'dev-loop');
    if (!shown.ok) throw new Error(`workflow show dev-loop failed: ${shown.error.message}`);
    expect(shown.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('characterization: the registry raises no diagnostic (68 → 0 at task-358, bug-469), none naming pinned-build.reads', () => {
    const diagnostics = loadWorkflowRegistryAtHead(ROOT).diagnostics as readonly { code: string; severity: string; message: string }[];
    expect(diagnostics).toEqual([]);
    expect(diagnostics.filter((d) => d.message.includes(TOKEN))).toEqual([]);
  });
});

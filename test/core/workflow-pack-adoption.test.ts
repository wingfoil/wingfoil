/**
 * task-351 (`dl-186` Q3, `dl-138`; release-planning R8; approver rulings D1–D4 (a) on the design) — the hand
 * adoption of the published template packs (base@2.0.1, software@1.0.0) into this repository's `.wingfoil/`,
 * after the design's per-file comparison. Four rows are adopted, nothing is renamed:
 *
 * - rows 15, 32, 33: the `capture` phase of `decision-log-ingest`, `adr-ingest` and `bug-ingest` declares its
 *   `produces` in the pack's typed form `{ type, path }`, with the `{id}` token (D3 (a));
 * - row 34 (D4): `end-of-life.announce` loses its `approval:`, tags the decision-log it adds `end-of-life` and
 *   declares it as `produces`; a new phase `approve` follows it, as the pack's (approver, selecting that
 *   decision-log `in-discussion`, `fallback` to `announce`); `deprecate` and `archive` are unchanged.
 *
 * Read **as `HEAD` holds it** (`loadWorkflowRegistryAtHead`, `workflowShowAtHead`, `loadMemoryYamlAtHead`,
 * `git show HEAD:`), like `test/core/dev-loop-v2-4.test.ts`. Version pins are "≥" plus the comment naming the
 * task (bug-314).
 *
 * - AC 2 (a)–(c) (red-first): the typed produces, `end-of-life`'s phases, one version bump of each file;
 * - AC 2 (d) (characterization): every workflow name and every Memory type with its `sequence` kept.
 *
 * Deterministic: fixed expectations, phases in declared order, workflow names sorted.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { loadWorkflowRegistryAtHead } from '../../src/core';
import { loadMemoryYamlAtHead } from '../../src/core/loaders';
import { workflowShowAtHead } from '../../src/core/workflow-list-show';
import { tokenName } from '../../src/workflow/bindings';
import type { Workflow } from '../../src/workflow/schema';

const ROOT = join(__dirname, '..', '..');

function atHead(path: string): string {
  return execFileSync('git', ['-C', ROOT, 'show', `HEAD:${path}`], { encoding: 'utf-8' });
}

function workflow(name: string): Workflow {
  const found = loadWorkflowRegistryAtHead(ROOT).workflows.find((w) => w.name === name);
  if (found === undefined) throw new Error(`no ${name} workflow at HEAD`);
  return found;
}

function phase(workflowName: string, phaseName: string): Workflow['phases'][number] | undefined {
  return workflow(workflowName).phases.find((p) => p.name === phaseName);
}

/**
 * A workflow file's `version:` line: the number, the comment's newest clause (the text before its first
 * `(prev `) and the whole comment — an empty comment when the line has none, so the pin fails on an assertion.
 */
function versionLine(name: string): { version: number; head: string; comment: string } {
  const line = /^version:\s*"?([0-9.]+)"?[^#\n]*(?:#(.*))?$/m.exec(atHead(`.wingfoil/workflows/custom/${name}.yaml`));
  if (line === null) throw new Error(`no version: line in ${name}.yaml at HEAD`);
  const comment = line[2] ?? '';
  const cut = comment.indexOf('(prev ');
  return { version: Number(line[1]), head: cut < 0 ? comment : comment.slice(0, cut), comment };
}

const DL_PATH = 'docs/04_memory/design/dls/{id}.md';

describe('task-351 AC 2 (a) — the ingest mains declare their capture produces in the typed form (rows 15, 32, 33; D3 (a))', () => {
  it.each([
    ['decision-log-ingest', 'decision-log', DL_PATH, ['capture', 'approve']],
    ['adr-ingest', 'adr', 'docs/04_memory/design/adrs/{id}.md', ['capture', 'approve']],
    ['bug-ingest', 'bug', 'docs/04_memory/bugs/{id}.md', ['capture', 'triage']],
  ])('red-first: %s.capture produces [{ type: %s, path: %s }], its phase names unchanged', (name, type, path, phases) => {
    expect(workflow(name).phases.map((p) => p.name)).toEqual(phases);
    expect(phase(name, 'capture')?.produces).toEqual([{ type, path }]);
  });

  it.each([
    ['decision-log-ingest', 'decision-log'],
    ['adr-ingest', 'adr'],
    ['bug-ingest', 'bug'],
  ])('red-first: workflow show %s at HEAD reports no error, and capture still adds a %s', (name, type) => {
    const shown = workflowShowAtHead(ROOT, name);
    if (!shown.ok) throw new Error(`workflow show ${name} failed: ${shown.error.message}`);
    expect(shown.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect((phase(name, 'capture')?.actions ?? []).map(tokenName)).toEqual(['memory.add', 'memory.submit']);
    expect(phase(name, 'capture')?.actions?.[0]).toContain(`type: ${type}`);
    expect(phase(name, 'capture')?.produces).toEqual([{ type, path: expect.stringMatching(/\{id\}\.md$/) }]);
  });
});

describe('task-351 AC 2 (b) — end-of-life announces without approval and gains the pack\'s approve phase (row 34; D4)', () => {
  it('red-first: the phases are announce, approve, deprecate, archive — one added, none renamed', () => {
    expect(workflow('end-of-life').phases.map((p) => p.name)).toEqual(['announce', 'approve', 'deprecate', 'archive']);
  });

  it('red-first: announce has no approval, tags the decision-log it adds end-of-life and declares it as produces', () => {
    const announce = phase('end-of-life', 'announce');
    expect(announce).toBeDefined();
    expect(announce?.approval).toBeUndefined();
    expect(announce?.actions).toEqual([
      'memory.add(type: decision-log, title: "End-of-life plan", tags: [end-of-life])',
      'memory.submit',
    ]);
    expect(announce?.produces).toEqual([{ type: 'decision-log', path: DL_PATH }]);
  });

  it('red-first: approve is the approver\'s gate on the end-of-life decision-log in-discussion, falling back to announce', () => {
    const approve = phase('end-of-life', 'approve');
    expect(approve).toBeDefined();
    expect(approve?.role).toBe('approver');
    expect(approve?.approval).toEqual({ by_role: 'approver' });
    expect(approve?.fallback).toEqual({ step: 'announce' });
    expect(approve?.where).toEqual({ type: 'decision-log', status: ['in-discussion'], tags: ['end-of-life'] });
    expect(approve?.actions).toEqual(['memory.approve']);
  });

  it('red-first: approve is the only end-of-life phase that records an approval', () => {
    expect(workflow('end-of-life').phases.filter((p) => p.approval !== undefined).map((p) => p.name)).toEqual(['approve']);
  });

  it('characterization: deprecate and archive are unchanged (deprecate keeps the release-line filter, approver ruling 2026-10-07)', () => {
    expect(phase('end-of-life', 'deprecate')).toEqual({
      name: 'deprecate',
      description: 'Deprecate the releases of the release-line being closed that are not yet released.',
      role: 'tech-lead',
      optional: false,
      actions: ['memory.deprecate'],
      where: {
        type: 'release',
        'release-line': '{release-line.version}',
        status: ['draft', 'planning', 'in-development', 'releasing'],
      },
      checks: { post: ['deprecated content excluded from agent context and default search (REQ-STATE-06)'] },
      cadence: 'once',
    });
    expect(phase('end-of-life', 'archive')).toEqual({
      name: 'archive',
      description: 'Final commit; freeze the repository line.',
      role: 'tech-lead',
      optional: false,
      actions: ['git.commit(message: "end-of-life: archive")'],
      cadence: 'once',
    });
  });

  it('red-first: workflow show end-of-life at HEAD reports no error and lists the four phases', () => {
    const shown = workflowShowAtHead(ROOT, 'end-of-life');
    if (!shown.ok) throw new Error(`workflow show end-of-life failed: ${shown.error.message}`);
    expect(shown.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(shown.value.workflow.phases.map((p) => p.name)).toEqual(['announce', 'approve', 'deprecate', 'archive']);
  });
});

describe('task-351 AC 2 (c) — each adopted workflow file raises its version once (doc-versioning, dl-174)', () => {
  it.each([
    ['decision-log-ingest', 1.2, 'prev 1.1'],
    ['adr-ingest', 1.1, 'prev 1.0'],
    ['bug-ingest', 1.3, 'prev 1.2'],
    ['end-of-life', 1.2, 'prev 1.1'],
  ])('red-first: %s `version:` is %s or later, its newest clause names task-351, keeping `%s`', (name, min, prev) => {
    const { version, head, comment } = versionLine(name);
    expect(version).toBeGreaterThanOrEqual(min);
    expect(head).toContain('task-351');
    expect(comment).toContain(prev);
  });
});

describe('task-351 AC 2 (d) — every workflow, Memory type and state name is kept (ids immutable)', () => {
  it('characterization: the registry at HEAD holds the same 27 workflow names', () => {
    expect(loadWorkflowRegistryAtHead(ROOT).workflows.map((w) => w.name).sort()).toEqual([
      'adr-ingest', 'agent-docs', 'backlog-export', 'bug-ingest', 'decision-log-ingest', 'dev-loop', 'e2e-smoke', 'end-of-life',
      'initial-design', 'lean-inception', 'release-cycle', 'release-health', 'release-line-cycle', 'release-planning',
      'release-publishing', 'release-submit', 'retrospective', 'service-ingest', 'specification-by-examples',
      'specification-downcast', 'sw-life-cycle', 'user-docs', 'user-story-mapping', 'vision-change', 'volere-requirements',
      'wave', 'wingfoil-init',
    ]);
  });

  it('characterization: memory.yaml at HEAD declares the same ten types, each with the same sequence', () => {
    const memory = loadMemoryYamlAtHead(ROOT);
    if (memory === null) throw new Error('no .wingfoil/memory.yaml committed at HEAD');
    const sequences = Object.fromEntries(
      Object.entries(memory.types).map(([type, entry]) => [type, (entry as { states: { sequence: string[] } }).states.sequence]),
    );
    expect(sequences).toEqual({
      'release-line': ['draft', 'planning', 'active', 'done'],
      release: ['draft', 'planning', 'in-development', 'releasing', 'released'],
      task: ['draft', 'pending', 'backlog', 'in-progress', 'in-review', 'approved', 'done'],
      adr: ['draft', 'pending', 'accepted', 'superseded'],
      'decision-log': ['draft', 'in-discussion', 'ready'],
      'tech-spec': ['draft', 'pending', 'approved', 'superseded'],
      bug: ['draft', 'open', 'triaged', 'planned', 'in-progress', 'in-review', 'resolved', 'closed'],
      plan: ['draft', 'active', 'done'],
      service: ['draft', 'pending', 'active'],
      'change-proposal': ['draft', 'in-analysis', 'accepted', 'scheduled'],
    });
  });
});

/**
 * task-279 (`bug-342`; `dl-092`, `dl-108` A3; approver rulings after design 2026-10-12, D1 (a), D2) —
 * `memory amend` accepts a release added before `dl-092`, which carries no `kind:` field.
 *
 * The exemption is declared once, on the type in `memory.yaml`: `template.frontmatter.exempt: { <field>:
 * [<id>, …] }` — a document whose `id` is listed under a field does not need that field; every other field is
 * still required of it, and every other id still needs the field. `requireRequiredFields` reads it, so
 * `memory submit` and `memory amend` keep sharing one rule (D2).
 *
 * - **AC 1 (red-first).** A pre-`dl-092` release with no `kind:` (or a blank one) amends: one commit
 *   `wf(release): amend <id> [<state> → <state>]` touching only that file.
 * - **AC 2 (characterization rows).** An id not listed with a blank `kind` is still refused; a listed id
 *   missing another required field (`title`) is still refused, naming `title`. That the message then names
 *   `title` ONLY (not `kind`) is new behaviour, so it is a separate red-first row.
 * - **AC 3 (red-first).** The source is the declaration: without the key the listed id is refused; with a
 *   different id listed, that id is accepted and `minor-v0.1` refused (no id hard-coded); `memory submit`
 *   honours the same declaration.
 * - **AC 4 (red-first, reclassified at design).** This repository's `release-planning.yaml` (≥ 2.1, its
 *   history line naming task-279) and `WORKFLOW.md` drop the hand-amend clause and cite `bug-342`.
 *
 * Exercises the REAL registered `CORE_MODULES` `memory.memoryAmend` / `memorySubmit` operations in throwaway
 * git repos. Determinism (REQ-SYS-07): fixed fixtures and expectations.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CORE_MODULES, loadWorkflowRegistry } from '../../src/core';
import { exitCodeForResult } from '../../src/core/exit-code';
import { requireRequiredFields } from '../../src/core/required-fields';
import type { MemoryYaml } from '../../src/memory';
import type { CoreFn } from '../../src/core/registry';
import { splitFrontmatter } from '../../src/storage';
import { commitAll, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';

const ROOT = join(__dirname, '..', '..');

const TEST_EMAIL = 'wf-test@example.invalid';
const TEST_NAME = 'WingFoil Test';

const APPROVER_DNA = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: ${TEST_NAME}
      email: ${TEST_EMAIL}
      roles: [ approver, developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

/** The fixture `memory.yaml`: an amendable `release` with `exemptLine` (or none) under its frontmatter. */
function memoryYaml(exemptLine: string | null): string {
  return `version: 1
types:
  release:
    path: "docs/memory/planning/{id}.md"
    amendable: true
    template:
      file: "memory/templates/release.md"
      frontmatter:
        required: [title, kind, version]
${exemptLine === null ? '' : `        ${exemptLine}\n`}    states:
      sequence: [draft, planning, in-development, releasing, released]
`;
}

const EXEMPT_V01 = 'exempt: { kind: [minor-v0.1] }';

const pathOf = (id: string): string => `docs/memory/planning/${id}.md`;

interface ReleaseFields {
  readonly id: string;
  readonly status: string;
  readonly title?: string;
  /** `undefined` → no `kind:` key at all; a string → `kind: "<value>"`. */
  readonly kind?: string;
}

function release(fields: ReleaseFields, body = 'Original body.\n'): string {
  const kind = fields.kind === undefined ? '' : `kind: "${fields.kind}"\n`;
  return `---
id: "${fields.id}"
type: release
title: "${fields.title ?? 'A release'}"
status: ${fields.status}
${kind}version: "v0.1"
tmpl_version: 260703
---

## Scope

${body}`;
}

function operationFn<T>(name: string): CoreFn<unknown, T> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`"${name}" is not registered on the memory module`);
  return operation.fn as CoreFn<unknown, T>;
}
const amend = (): CoreFn<unknown, { id: string; path: string; from: string; to: string }> => operationFn('memoryAmend');
const submit = (): CoreFn<unknown, unknown> => operationFn('memorySubmit');

function gitOut(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);
const readIn = (repo: string, path: string): string => readFileSync(join(repo, path), 'utf-8');

function frontmatterOf(content: string): Record<string, unknown> {
  const { frontmatter } = splitFrontmatter(content);
  return (load(frontmatter ?? '') as Record<string, unknown> | undefined) ?? {};
}

describe('task-279 — memory amend accepts a pre-dl-092 release with no `kind:` (bug-342)', () => {
  let repo: string;

  /** Seeds a repo with `docs` committed, then writes `edits` (uncommitted) on top. */
  function seed(exemptLine: string | null, docs: readonly ReleaseFields[]): void {
    writeFixtureFile(repo, '.wingfoil/memory.yaml', memoryYaml(exemptLine));
    writeFixtureFile(repo, '.wingfoil/dna.yaml', APPROVER_DNA);
    for (const fields of docs) writeFixtureFile(repo, pathOf(fields.id), release(fields));
    commitAll(repo, 'seed');
  }

  /** Edits the body of a committed document, keeping its frontmatter; returns the edited bytes. */
  function editBody(fields: ReleaseFields): string {
    const edited = release(fields, 'Corrected body.\n');
    writeFixtureFile(repo, pathOf(fields.id), edited);
    return edited;
  }

  /** The refusal shape every negative row pins: VALIDATION, exit 1, the exact message, nothing written. */
  async function expectRefused(id: string, edited: string, message: string | RegExp): Promise<void> {
    const before = head(repo);
    const unchanged = snapshotPersistence(repo);
    const result = await amend()({ root: repo, positional: id, options: { reason: 'r' } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(exitCodeForResult(result)).toBe(1);
    if (typeof message === 'string') expect(result.error.message).toBe(message);
    else expect(result.error.message).toMatch(message);
    expect(head(repo)).toBe(before);
    expect(readIn(repo, pathOf(id))).toBe(edited);
    assertPersistenceUnchanged(repo, unchanged);
  }

  /** The acceptance shape: exit 0, exactly one `[state → state]` amend commit touching only that file. */
  async function expectAmended(id: string, status: string, edited: string): Promise<void> {
    const before = head(repo);
    const result = await amend()({ root: repo, positional: id, options: { reason: 'pre-dl-092 correction' } });
    expect(result.ok ? null : result.error.message).toBeNull();
    if (!result.ok) return;
    expect(exitCodeForResult(result)).toBe(0);
    expect(result.value).toEqual({ id, path: pathOf(id), from: status, to: status });
    expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe(`wf(release): amend ${id} [${status} → ${status}]`);
    expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(pathOf(id));
    expect(gitOut(repo, ['show', `HEAD:${pathOf(id)}`]) + '\n').toBe(edited);
  }

  beforeEach(() => {
    repo = makeTempGitRepo();
  });

  afterEach(() => removeTempDir(repo));

  describe('AC 1 (red-first) — a listed release with no `kind` amends', () => {
    it('AC 1: minor-v0.1 `released`, no `kind:` key → one `wf(release): amend minor-v0.1 [released → released]` commit, only that file', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'released' };
      seed(EXEMPT_V01, [fields]);
      const edited = editBody(fields);

      await expectAmended('minor-v0.1', 'released', edited);
      const committed = frontmatterOf(gitOut(repo, ['show', `HEAD:${pathOf('minor-v0.1')}`]));
      expect(committed).not.toHaveProperty('kind');
      expect(gitOut(repo, ['log', '-1', '--format=%B'])).toContain('Reason: pre-dl-092 correction');
    });

    it('AC 1: minor-v0.1 with a blank `kind: ""` → accepted (the field is not required of it)', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'released', kind: '' };
      seed(EXEMPT_V01, [fields]);
      const edited = editBody(fields);

      await expectAmended('minor-v0.1', 'released', edited);
    });
  });

  describe('AC 2 (characterization) — the exemption does not widen', () => {
    it('AC 2 (a): a release not listed (patch-v9.9) with a blank `kind` → refused `missing required field on amend: kind`, nothing written', async () => {
      const fields: ReleaseFields = { id: 'patch-v9.9', status: 'released', kind: '' };
      seed(EXEMPT_V01, [fields]);
      const edited = editBody(fields);

      await expectRefused('patch-v9.9', edited, 'missing required field on amend: kind');
    });

    it('AC 2 (b): a listed release (minor-v0.1) with a blank `title` and no `kind` → still refused, naming `title`', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'released', title: '' };
      seed(EXEMPT_V01, [fields]);
      const edited = editBody(fields);

      await expectRefused('minor-v0.1', edited, /^missing required field on amend: title\b/);
    });
  });

  describe('AC 1 / AC 3 (red-first) — the exempt field drops out of the refusal message', () => {
    it('AC 2 (b) companion: the minor-v0.1 refusal for a blank `title` names `title` only, not `kind`', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'released', title: '' };
      seed(EXEMPT_V01, [fields]);
      const edited = editBody(fields);

      await expectRefused('minor-v0.1', edited, 'missing required field on amend: title');
    });
  });

  describe('AC 3 (red-first) — the exemption is read from the memory.yaml declaration, nowhere else', () => {
    it('AC 3 (i): without the `exempt` key, minor-v0.1 with no `kind` is refused', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'released' };
      seed(null, [fields]);
      const edited = editBody(fields);

      await expectRefused('minor-v0.1', edited, 'missing required field on amend: kind');
    });

    it('AC 3 (ii): with `exempt: { kind: [minor-v9.8] }`, minor-v9.8 with no `kind` is accepted', async () => {
      const fields: ReleaseFields = { id: 'minor-v9.8', status: 'released' };
      seed('exempt: { kind: [minor-v9.8] }', [fields]);
      const edited = editBody(fields);

      await expectAmended('minor-v9.8', 'released', edited);
    });

    it('AC 3 (ii): with `exempt: { kind: [minor-v9.8] }`, minor-v0.1 with no `kind` is refused (no id hard-coded)', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'released' };
      seed('exempt: { kind: [minor-v9.8] }', [fields]);
      const edited = editBody(fields);

      await expectRefused('minor-v0.1', edited, 'missing required field on amend: kind');
    });

    it('AC 3 (iii), D2: `memory submit minor-v0.1` from draft with every field but `kind` → one `wf(release): submit minor-v0.1` commit, status planning', async () => {
      const fields: ReleaseFields = { id: 'minor-v0.1', status: 'draft' };
      seed(EXEMPT_V01, [fields]);
      const before = head(repo);

      const result = await submit()({ root: repo, positional: 'minor-v0.1', positionals: ['minor-v0.1'] });

      expect(result.ok ? null : result.error.message).toBeNull();
      expect(gitOut(repo, ['rev-list', '--count', `${before}..HEAD`])).toBe('1');
      expect(gitOut(repo, ['log', '-1', '--format=%s'])).toBe('wf(release): submit minor-v0.1');
      expect(gitOut(repo, ['show', '--name-only', '--format=', 'HEAD'])).toBe(pathOf('minor-v0.1'));
      expect(frontmatterOf(gitOut(repo, ['show', `HEAD:${pathOf('minor-v0.1')}`]))['status']).toBe('planning');
    });
  });
});

describe('task-279 review send-back (red-first) — a required field named like an Object.prototype member is refused, never a throw', () => {
  /** A one-type `memory.yaml` whose `t` requires [title, kind, <field>] (default `constructor`), with `exempt` absent or not listing the field. */
  const yamlWith = (exempt: Readonly<Record<string, readonly string[]>> | undefined, field = 'constructor'): MemoryYaml =>
    ({
      version: 1,
      types: {
        t: {
          path: 'docs/t/{id}.md',
          template: { file: 'memory/templates/t.md', frontmatter: { required: ['title', 'kind', field], ...(exempt ? { exempt } : {}) } },
        },
      },
    }) as unknown as MemoryYaml;

  /** The function's result, or `{ thrown }` — so a crash fails the refusal expectation instead of erroring the test. */
  function outcome(memoryYaml: MemoryYaml, verb: 'submit' | 'amend'): unknown {
    try {
      return requireRequiredFields(memoryYaml, 't', { id: 'x', title: 'a', kind: 'minor' }, verb);
    } catch (error) {
      return { thrown: String(error) };
    }
  }

  it.each([
    ['no exempt map', 'submit', undefined],
    ['no exempt map', 'amend', undefined],
    ['an exempt map not listing the field', 'submit', { kind: ['other'] }],
    ['an exempt map not listing the field', 'amend', { kind: ['other'] }],
  ] as const)('%s, %s: a document lacking `constructor` → VALIDATION `missing required field on <verb>: constructor`', (_label, verb, exempt) => {
    expect(outcome(yamlWith(exempt), verb)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION', message: `missing required field on ${verb}: constructor` }),
    });
  });

  it.each(['toString', 'valueOf', 'hasOwnProperty'])('the same for a required field named `%s` (submit, no exempt map)', (field) => {
    expect(outcome(yamlWith(undefined, field), 'submit')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION', message: `missing required field on submit: ${field}` }),
    });
  });
});

describe("task-279 AC 4 (red-first) — this repository's workflow docs retire the hand amend (bug-342)", () => {
  const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
  const RELEASE_PLANNING = '.wingfoil/workflows/custom/release-planning.yaml';
  const versionLine = (path: string): string => /^version:.*$/m.exec(read(path))![0];
  const version = (path: string): number => Number(/^version:\s*([0-9.]+)/m.exec(read(path))![1]);

  function defineScopeDescription(): string {
    const workflow = loadWorkflowRegistry(ROOT).workflows.find((w) => w.name === 'release-planning');
    const phase = workflow?.phases.find((p) => p.name === 'define-scope');
    if (phase === undefined) throw new Error('no phase release-planning.define-scope');
    return phase.description ?? '';
  }

  it('AC 4: release-planning.yaml `version:` is at least 2.1, and its history line names 2.1 with task-279', () => {
    expect(version(RELEASE_PLANNING)).toBeGreaterThanOrEqual(2.1);
    expect(versionLine(RELEASE_PLANNING)).toMatch(/2\.1 [^;]*task-279/);
  });

  it("AC 4: define-scope's description drops the hand-amend clause and cites bug-342", () => {
    const description = defineScopeDescription();
    expect(description).not.toContain('refuses a release with no');
    expect(description).toContain('bug-342');
  });

  it('AC 4: WORKFLOW.md drops the hand-amend clause (define-scope sentence and DS node) and cites bug-342', () => {
    // Line-level, so a failure prints the offending lines rather than the whole document.
    const linesWith = (needle: string): string[] => read('.wingfoil/WORKFLOW.md').split('\n').filter((line) => line.includes(needle));
    expect(linesWith('refuses a release with no')).toEqual([]);
    expect(linesWith("hand amend on the approver's instruction")).toEqual([]);
    expect(linesWith('bug-342').length).toBeGreaterThan(0);
  });
});

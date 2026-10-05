/**
 * task-091-reads-resolve-at-head / `bug-081-memory-yaml-read-from-worktree-fabricates-states` —
 * **the state machine that decides a transition is read from the COMMITTED `.wingfoil/memory.yaml`,
 * never from the working tree** (`dl-080-which-baseline-each-command-reads`, ratified as option (B):
 * *a read that gates an operation resolves against the repository as committed at `HEAD`*).
 *
 * The defect this pins: `prepareMemoryTransition` was handed a `MemoryYaml` its caller had loaded
 * from disk, so an uncommitted edit to a type's `sequence` decided what transition a verb performed
 * and what `status` it wrote — through `memory submit`, which requires no authority at all — while
 * the committed machine defined no such state. The element was then **stranded**: with the working
 * tree restored, `submit`, `approve` and `deprecate` alike refuse it, because its own status is a
 * member of no sequence the machine declares.
 *
 * Same shape of fix as `task-090`'s for approval authority, and for the same reason: the parameter
 * through which a working-tree document reached the decision is **gone**, so the committed baseline
 * is a property of the read rather than of a precondition someone must remember to run. That is why
 * several cases below assert what the committed machine *does* decide, not merely that the dirty one
 * does not — a guard would satisfy the second and not the first.
 *
 * Exercises the REAL, registered `CORE_MODULES` memory operations — the exact `CoreFn`s the CLI
 * command and the MCP Tool dispatch to — in THROWAWAY temp git repositories (`bug-075`: the verbs
 * cannot be pointed at this repository's own Memory). The sibling suite
 * `test/cli/reads-resolve-at-head.integration.test.ts` pins the exit code and stderr at the process
 * boundary.
 *
 * Determinism (REQ-SYS-07): fixed fixture texts, fixed identity, fixed step order; nothing asserted
 * depends on a clock, on randomness, or on the temp directory name.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORE_MODULES } from '../../src/core';
import * as loaders from '../../src/core/loaders';
import * as storage from '../../src/storage';
import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreFn } from '../../src/core/registry';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { STAMP_TRAILER } from '../storage/helpers/stamp-trailer';

const MEMORY_YAML_PATH = '.wingfoil/memory.yaml';
const DOC_PATH = 'docs/memory/adr/adr-001.md';

/** The committed machine every case starts from: the scaffold's own default chain. */
const MEMORY_YAML = `version: 1
defaults:
  states:
    sequence: [draft, pending, approved]
    gates:
      pending: { reject: draft }
types:
  adr:
    path: "docs/memory/adr/{id}.md"
    template:
      file: "memory/templates/adr.md"
      frontmatter:
        required: [title]
`;

/** The `bug-081` edit: `pending` replaced by a state no committed machine defines. */
const FABRICATED_MEMORY_YAML = MEMORY_YAML.replace(/pending/g, 'FABRICATED-BY-SUBMIT');

interface TransitionValue {
  readonly id: string;
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

/** The real, registered memory `CoreFn` — fails loudly if a future change un-registers it. */
function memoryFn(
  name: 'memorySubmit' | 'memoryApprove' | 'memoryReject' | 'memoryDeprecate',
): CoreFn<unknown, TransitionValue> {
  const operation = CORE_MODULES.find((module) => module.name === 'memory')?.operations[name];
  if (!operation) throw new Error(`fixture bug: "${name}" operation not registered on the memory module`);
  return operation.fn as CoreFn<unknown, TransitionValue>;
}

function gitOut(repo: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim();
}
const head = (repo: string): string => gitOut(repo, ['rev-parse', 'HEAD']);

function adrDoc(status: string, title = 'An ADR'): string {
  return `---
id: "adr-001"
type: adr
title: "${title}"
status: ${status}
---

## Context

Real content.
`;
}

/** A repo whose COMMITTED state is `MEMORY_YAML` plus one `draft` ADR, with a clean working tree. */
function seedRepo(status = 'draft'): string {
  const repo = makeTempGitRepo();
  writeFixtureFile(repo, MEMORY_YAML_PATH, MEMORY_YAML);
  writeFixtureFile(repo, DOC_PATH, adrDoc(status));
  commitAll(repo, 'seed');
  return repo;
}

/** Overwrite `.wingfoil/memory.yaml` in the WORKING TREE only — never staged, never committed. */
function dirtyMachine(repo: string, content: string): void {
  writeFileSync(join(repo, MEMORY_YAML_PATH), content, 'utf-8');
  expect(gitOut(repo, ['status', '--porcelain', '--', MEMORY_YAML_PATH])).toBe(`M ${MEMORY_YAML_PATH}`);
}

const statusOf = (repo: string): string =>
  /^status: (.*)$/m.exec(readFileSync(join(repo, DOC_PATH), 'utf-8'))?.[1] ?? '(none)';

describe('memory transitions resolve their state machine at HEAD (bug-081, dl-080 (B))', () => {
  let repo: string;

  afterEach(() => removeTempDir(repo));

  // AC1's reproduction, as a test (AC3/AC6). Red today: `to` is `FABRICATED-BY-SUBMIT`.
  it('AC2/AC6: an uncommitted `sequence` edit does not decide the target — the COMMITTED machine does', async () => {
    repo = seedRepo();
    dirtyMachine(repo, FABRICATED_MEMORY_YAML);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'draft', to: 'pending' });
    // The status written, the document on disk and the commit subject all come from HEAD's machine.
    expect(statusOf(repo)).toBe('pending');
    expect(gitOut(repo, ['show', `HEAD:${DOC_PATH}`])).toContain('status: pending');
    expect(gitOut(repo, ['log', '-1', '--format=%B'])).toBe(`wf(adr): submit adr-001${STAMP_TRAILER}`);
  });

  // The stranding half of bug-081: a status only a dirty machine knows can no longer be reached, and
  // if one is present the verbs refuse it rather than walking a machine no commit records.
  it('AC3/AC6: a status only the working-tree machine defines is refused at exit 1, nothing written', async () => {
    repo = seedRepo('FABRICATED-BY-SUBMIT');
    dirtyMachine(repo, FABRICATED_MEMORY_YAML);
    const before = head(repo);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain("invalid state 'FABRICATED-BY-SUBMIT' for type 'adr'");
    expect(head(repo)).toBe(before);
    expect(statusOf(repo)).toBe('FABRICATED-BY-SUBMIT');
  });

  // The same read serves all four verbs, so all four move to the committed baseline together.
  it.each([
    ['memoryApprove' as const, 'pending', 'approved'],
    ['memoryReject' as const, 'pending', 'draft'],
    ['memoryDeprecate' as const, 'draft', 'deprecated'],
  ])('AC2: `%s` too resolves its edge from HEAD, not from the dirty machine', async (name, from, to) => {
    repo = seedRepo(from);
    // The approval gates need an approver of record (task-090): grant one in the COMMITTED dna.yaml.
    writeFixtureFile(
      repo,
      '.wingfoil/dna.yaml',
      `version: 1.1\nmodules:\n  - name: core\n    path: src/core\nstacks:\n  technologies:\n    - name: TypeScript\n      category: language\nteam:\n  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [ approver ]\n  roles:\n    - name: approver\npaths:\n  sources: [ src/ ]\n`,
    );
    commitAll(repo, 'seed approver');
    dirtyMachine(repo, FABRICATED_MEMORY_YAML);

    const result = await memoryFn(name)({ root: repo, positional: 'adr-001', options: { reason: 'a reason' } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from, to });
    expect(gitOut(repo, ['log', '-1', '--format=%s'])).toContain(`[${from} → ${to}]`);
  });

  // The mirror image, and the case a `task-088`-style guard would get wrong in the other direction:
  // a machine the repository RECORDS keeps working while the working tree narrows it.
  it('AC2: a transition HEAD sanctions succeeds even though the working-tree machine no longer declares it', async () => {
    repo = seedRepo();
    dirtyMachine(repo, `version: 1\ndefaults:\n  states:\n    sequence: [draft]\ntypes:\n  adr:\n    path: "docs/memory/adr/{id}.md"\n`);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ from: 'draft', to: 'pending' });
  });

  // One baseline per verb, not one per read: `submit`'s required-field check reads the same committed
  // document as the machine did, so a single command cannot decide two things from two copies.
  it('AC2: `template.frontmatter.required` is read from the same committed copy — an uncommitted addition does not block', async () => {
    repo = seedRepo();
    dirtyMachine(repo, MEMORY_YAML.replace('required: [title]', 'required: [title, release]'));

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(true);
  });

  it('AC2: … and an uncommitted REMOVAL of a required field does not unblock a submit HEAD refuses', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, MEMORY_YAML_PATH, MEMORY_YAML.replace('required: [title]', 'required: [title, release]'));
    writeFixtureFile(repo, DOC_PATH, adrDoc('draft'));
    commitAll(repo, 'seed');
    dirtyMachine(repo, MEMORY_YAML);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toBe('missing required field on submit: release');
  });

  // A type that exists only in the working tree is not a type this repository records.
  it('AC3: a type defined only in the working tree cannot carry a transition — exit 1, nothing written', async () => {
    repo = seedRepo();
    const before = head(repo);
    dirtyMachine(repo, `${MEMORY_YAML}  note:\n    path: "docs/memory/note/{id}.md"\n`);
    writeFixtureFile(repo, 'docs/memory/note/note-001.md', '---\nid: "note-001"\ntype: note\ntitle: "A note"\nstatus: draft\n---\n\nBody.\n');

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'note-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(head(repo)).toBe(before);
  });

  // AC4 — fail-closed, deliberately (see the task's `design` § D4): `init` commits `memory.yaml`, so a
  // project with none at HEAD has no legitimate flow behind it, and the only fail-open available is
  // the working tree, which is the defect.
  it('AC4: no committed `memory.yaml` at all — refused at exit 1, naming the file and the baseline', async () => {
    repo = seedRepo();
    git(repo, ['rm', '--cached', '--quiet', '--', MEMORY_YAML_PATH]);
    git(repo, ['commit', '--quiet', '-m', 'untrack the machine, keep it on disk']);
    expect(gitOut(repo, ['status', '--porcelain', '--', MEMORY_YAML_PATH])).toBe(`?? ${MEMORY_YAML_PATH}`);
    const before = head(repo);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain(MEMORY_YAML_PATH);
    expect(result.error.message).toContain('not committed at HEAD');
    expect(head(repo)).toBe(before);
    expect(statusOf(repo)).toBe('draft');
  });

  it('AC4: a committed `memory.yaml` that does not validate is refused even though the working-tree copy is fine', async () => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, MEMORY_YAML_PATH, 'version: 1\ntypes: "not a mapping"\n');
    writeFixtureFile(repo, DOC_PATH, adrDoc('draft'));
    commitAll(repo, 'seed an invalid machine');
    writeFileSync(join(repo, MEMORY_YAML_PATH), MEMORY_YAML, 'utf-8');

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(exitCodeForResult(result)).toBe(1);
    expect(result.error.message).toContain('HEAD');
  });

  // AC4's ordinary flow, characterization: a project whose committed machine is valid transitions
  // exactly as before — the whole point being that nothing changes for the clean case.
  it('AC4: a clean project whose committed machine is valid transitions normally, draft → pending → approved', async () => {
    repo = seedRepo();
    writeFixtureFile(
      repo,
      '.wingfoil/dna.yaml',
      `version: 1.1\nmodules:\n  - name: core\n    path: src/core\nstacks:\n  technologies:\n    - name: TypeScript\n      category: language\nteam:\n  members:\n    - name: WingFoil Test\n      email: wf-test@example.invalid\n      roles: [ approver ]\n  roles:\n    - name: approver\npaths:\n  sources: [ src/ ]\n`,
    );
    commitAll(repo, 'seed approver');

    const submitted = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });
    expect(submitted.ok).toBe(true);
    const approved = await memoryFn('memoryApprove')({ root: repo, positional: 'adr-001', options: { reason: 'ok' } });
    expect(approved.ok).toBe(true);
    expect(statusOf(repo)).toBe('approved');
    expect(gitOut(repo, ['status', '--porcelain'])).toBe('');
  });

  // D5 — the diagnostic that never decides: when the refusal and the user's editor disagree, say so.
  it('AC4/D5: the refusal names the uncommitted `memory.yaml` when the working tree is what disagrees', async () => {
    repo = seedRepo('FABRICATED-BY-SUBMIT');
    dirtyMachine(repo, FABRICATED_MEMORY_YAML);

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // REQ/dl-032 fit criteria stay the verbatim first sentence; the baseline note is appended.
    expect(result.error.message).toMatch(/^invalid state 'FABRICATED-BY-SUBMIT' for type 'adr'/);
    expect(result.error.message).toContain(MEMORY_YAML_PATH);
    expect(result.error.message).toContain('uncommitted');
  });

  // A defect in the committed read must PROPAGATE, never be converted into a transition answer:
  // "there is no machine" and "the machine could not be read" are different facts, and only the
  // second is a bug in this code. Reachable only by making the read fail in a way nothing in the
  // code can produce, hence the spy (task-090 pinned the same property on the authority read).
  it('a non-ValidationError from the committed read propagates instead of becoming a refusal', async () => {
    repo = seedRepo();
    const spy = jest.spyOn(loaders, 'loadMemoryYamlAtRev').mockImplementation(() => {
      throw new TypeError('a defect in the read path');
    });
    try {
      await expect(memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' })).rejects.toThrow(TypeError);
    } finally {
      spy.mockRestore();
    }
  });

  // The diagnostic can never decide: a failure to ASK git about the working tree leaves the refusal
  // exactly as its fit criterion words it. Unreachable from the code (`readPathAtRev` has already
  // succeeded by then, so the repository is readable), which is why it takes a spy — it pins the real
  // property that a defect in the diagnostic path cannot become part of the answer.
  it('D5: a failure to read the working-tree status adds no note and changes no outcome', async () => {
    repo = seedRepo('FABRICATED-BY-SUBMIT');
    dirtyMachine(repo, FABRICATED_MEMORY_YAML);
    const spy = jest.spyOn(storage, 'pathPorcelainStatus').mockImplementation(() => {
      throw new Error('git is unavailable');
    });
    try {
      const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe("invalid state 'FABRICATED-BY-SUBMIT' for type 'adr'");
    } finally {
      spy.mockRestore();
    }
  });

  it('D5: a clean working tree adds no note to the refusal', async () => {
    repo = seedRepo('FABRICATED-BY-SUBMIT');

    const result = await memoryFn('memorySubmit')({ root: repo, positional: 'adr-001' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("invalid state 'FABRICATED-BY-SUBMIT' for type 'adr'");
  });
});

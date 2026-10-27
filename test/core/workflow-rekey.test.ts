/**
 * task-295 AC 2 (P4.21, `dl-187` C5; `spec-017` §7.12, §8, §10; `spec-008` §2, §12; design D1–D5, ruled at the
 * design gate 2026-10-24) — `wingfoil workflow rekey` driven in process through the registered `CORE_MODULES`
 * operation `workflow.workflowRekey`, on the fixture of `./helpers/rekey-fixture` (an adoption of
 * `release-line:rl-v1` into `life.seed` written by hand, then `seed` renamed `seed-line`):
 *
 * - each refusal of §10, with its code, its exact message, exit 1 and nothing written: `--from` still declared,
 *   `--to` not declared, `--from` named by no record of the instance (scoped to the instance), no approver
 *   authority (checked before the instance and before the no-op, D1), an unknown or ended `<ref>`, a staged index,
 *   no git identity;
 * - the refusal order of D1 (still declared before unknown step; unknown step before the no-op);
 * - a mapping already recorded: ok, `commit: null`, `remapped: 0`, nothing written — and checked before the
 *   "named by no record" refusal (§7.12);
 * - the usage errors of `spec-008` §12 (exit 2, a thrown `UsageError`), checked before any read (D1, D2);
 * - the success shape (`RekeyResult`, keys in §8 order), `remapped` counting entries (D4), and a chain of rekeys.
 *
 * Red until `workflowRekey` is registered: every case fails with `workflowRekey is not registered`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exitCodeForResult } from '../../src/core/exit-code';
import type { CoreResult } from '../../src/core/types';
import { UsageError } from '../../src/core/usage-error';
import { commitAll, git, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from '../storage/helpers/persistence-snapshot';
import { asMorgan, buildRekeyRepo, call, commitWith, lifeYaml, LIFE_FILE, ok, planPath } from './helpers/rekey-fixture';

const VALID = { from: 'life.seed', to: 'life.seed-line', reason: 'phase renamed' } as const;
const SUBJECT = 'workflow: rekey life-1-plan life.seed life.seed-line';

interface RekeyView {
  readonly baseline: unknown;
  readonly instance: { readonly id: string };
  readonly from: string;
  readonly to: string;
  readonly remapped: number;
  readonly commit: string | null;
  readonly next: { readonly key: string } | null;
}

const head = (root: string): string => git(root, ['rev-parse', 'HEAD']).trim();
const count = (root: string): number => Number(git(root, ['rev-list', '--count', 'HEAD']).trim());

function rekey(root: string, ref: string | undefined, options: Record<string, unknown>): Promise<CoreResult<unknown>> {
  return call('workflowRekey', root, ref, options);
}

/** A refusal: exit 1, `code`, the exact `message`, and nothing written. */
async function expectRefusal(root: string, run: () => Promise<CoreResult<unknown>>, code: string, message: string): Promise<void> {
  const unchanged = snapshotPersistence(root);
  const result = await run();
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  expect(result.error.message).toBe(message);
  expect(exitCodeForResult(result)).toBe(1);
  assertPersistenceUnchanged(root, unchanged);
}

describe('task-295 AC 2 — the refusals of spec-017 §10 (exit 1, nothing written)', () => {
  let root: string;
  beforeEach(async () => {
    root = await buildRekeyRepo();
  });
  afterEach(() => removeTempDir(root));

  it('--from still declared: CONFLICT "cannot rekey <from>: it is still declared"', async () => {
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-1-plan', { ...VALID, from: 'life.close' })), 'CONFLICT', 'cannot rekey life.close: it is still declared');
  });

  it('--to not declared: CONFLICT "unknown step: <to>"', async () => {
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-1-plan', { ...VALID, to: 'life.nope' })), 'CONFLICT', 'unknown step: life.nope');
  });

  it('--from named by no record of the instance: CONFLICT "no record of <instance> names <from>"', async () => {
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-1-plan', { ...VALID, from: 'life.gone' })), 'CONFLICT', 'no record of life-1-plan names life.gone');
  });

  it('no approver authority: VALIDATION "user not authorized to rekey"', async () => {
    await expectRefusal(root, () => rekey(root, 'life-1-plan', { ...VALID }), 'VALIDATION', 'user not authorized to rekey');
  });

  it('no approver authority on an unknown <ref>: the authority refusal, not the instance one (D1: authority before the instance)', async () => {
    await expectRefusal(root, () => rekey(root, 'nope', { ...VALID }), 'VALIDATION', 'user not authorized to rekey');
  });

  it('no approver authority on a mapping already recorded: the authority refusal, not the no-op (D1)', async () => {
    ok(await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID })));
    await expectRefusal(root, () => rekey(root, 'life-1-plan', { ...VALID }), 'VALIDATION', 'user not authorized to rekey');
  });

  it('an unknown <ref>: NOT_FOUND "unknown workflow: <ref>"', async () => {
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'nope', { ...VALID })), 'NOT_FOUND', 'unknown workflow: nope');
  });

  it('an ended instance: NOT_FOUND "workflow is not open: <id>"', async () => {
    const path = planPath(root, 'life-1-plan');
    writeFixtureFile(root, path, git(root, ['show', `HEAD:${path}`]).replace(/^status: active$/m, 'status: done'));
    commitAll(root, 'wf(plan): finalize life-1-plan [active → done]');
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-1-plan', { ...VALID })), 'NOT_FOUND', 'workflow is not open: life-1-plan');
  });

  it('a staged index: VALIDATION "refusing to commit \'<subject>\': the index holds staged changes (…", the file still staged', async () => {
    writeFixtureFile(root, 'notes.txt', 'staged\n');
    git(root, ['add', 'notes.txt']);
    const unchanged = snapshotPersistence(root);
    const result = await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message.startsWith(`refusing to commit '${SUBJECT}': the index holds staged changes (`)).toBe(true);
    expect(exitCodeForResult(result)).toBe(1);
    expect(git(root, ['diff', '--cached', '--name-only']).trim()).toBe('notes.txt');
    assertPersistenceUnchanged(root, unchanged);
  });
});

describe('task-295 AC 2 — "named by no record" is scoped to the instance', () => {
  let root: string;
  beforeEach(async () => {
    root = await buildRekeyRepo({ secondInstance: true });
  });
  afterEach(() => removeTempDir(root));

  it("a second instance whose walk holds only life-1-plan's adoption: \"no record of life-2-plan names life.seed\"", async () => {
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-2-plan', { ...VALID })), 'CONFLICT', 'no record of life-2-plan names life.seed');
  });
});

describe('task-295 AC 2 — REQ-SEC-01: no git identity, nothing written', () => {
  const ISOLATION_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'] as const;
  const saved: Record<string, string | undefined> = {};
  let root: string;
  let scratch: string;

  beforeEach(async () => {
    root = await buildRekeyRepo();
    git(root, ['config', '--unset', 'user.name']);
    git(root, ['config', '--unset', 'user.email']);
    scratch = mkdtempSync(join(tmpdir(), 'wf-rekey-noid-'));
    const emptyConfig = join(scratch, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    for (const key of ISOLATION_KEYS) saved[key] = process.env[key];
    for (const key of ISOLATION_KEYS) delete process.env[key];
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
  });

  afterEach(() => {
    for (const key of ISOLATION_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    removeTempDir(root);
    rmSync(scratch, { recursive: true, force: true });
  });

  it('refuses with the exact REQ-SEC-01 message, exit 1, and writes nothing', async () => {
    const unchanged = snapshotPersistence(root);
    const result = await rekey(root, 'life-1-plan', { ...VALID });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('git identity not configured (user.name/user.email)');
    expect(exitCodeForResult(result)).toBe(1);
    assertPersistenceUnchanged(root, unchanged);
  });
});

describe('task-295 AC 2 — the refusal order (D1) and the no-op (D5, spec-017 §7.12)', () => {
  let root: string;
  beforeEach(async () => {
    root = await buildRekeyRepo();
  });
  afterEach(() => removeTempDir(root));

  it('--from still declared AND --to unknown: the still-declared refusal comes first', async () => {
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-1-plan', { ...VALID, from: 'life.close', to: 'life.nope' })), 'CONFLICT', 'cannot rekey life.close: it is still declared');
  });

  it('a mapping already recorded: ok, commit null, remapped 0, exit 0, nothing written — before the "named by no record" refusal', async () => {
    ok(await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID })));
    const before = count(root);
    const unchanged = snapshotPersistence(root);
    // No record names life.seed any more (the first rekey maps them all), so only a no-op check placed before
    // the "named by no record" refusal can answer ok here.
    const result = await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID }));
    const value = ok<RekeyView>(result);
    expect(exitCodeForResult(result)).toBe(0);
    expect(value).toMatchObject({ from: 'life.seed', to: 'life.seed-line', remapped: 0, commit: null });
    expect(value.instance.id).toBe('life-1-plan');
    expect(value.next?.key).toMatch(/^life\.close(@|$)/);
    expect(count(root)).toBe(before);
    assertPersistenceUnchanged(root, unchanged);
  });

  it('--to unknown after the mapping is recorded: "unknown step: <to>", not the no-op', async () => {
    ok(await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID })));
    await expectRefusal(root, () => asMorgan(() => rekey(root, 'life-1-plan', { ...VALID, to: 'life.nope' })), 'CONFLICT', 'unknown step: life.nope');
  });
});

describe('task-295 AC 2 — the usage errors of spec-008 §12 (a thrown UsageError, exit 2), before any read', () => {
  let root: string;
  beforeAll(async () => {
    root = await buildRekeyRepo();
  });
  afterAll(() => removeTempDir(root));

  it.each<[string, string, Record<string, unknown>]>([
    ['no --from (and nothing else): the --from message first', 'missing required argument: --from', {}],
    ['no --from', 'missing required argument: --from', { to: VALID.to, reason: VALID.reason }],
    ['no --to', 'missing required argument: --to', { from: VALID.from }],
    ['--from with an @<scope> suffix', 'invalid flag value: --from must be <workflow>.<phase>', { ...VALID, from: 'life.seed@task:task-1' }],
    ['--from with no dot', 'invalid flag value: --from must be <workflow>.<phase>', { ...VALID, from: 'seed' }],
    ['--from outside the name class', 'invalid flag value: --from must be <workflow>.<phase>', { ...VALID, from: 'Life.seed' }],
    ['--to with two dots', 'invalid flag value: --to must be <workflow>.<phase>', { ...VALID, to: 'life.x.y' }],
    ['no --reason', 'missing required argument: --reason', { from: VALID.from, to: VALID.to }],
    ['a blank --reason', 'invalid flag value: --reason must not be blank', { ...VALID, reason: ' ' }],
  ])('%s → "%s", nothing written', async (_label, message, options) => {
    const unchanged = snapshotPersistence(root);
    await asMorgan(async () => {
      await expect(rekey(root, 'life-1-plan', options)).rejects.toThrow(UsageError);
      await expect(rekey(root, 'life-1-plan', options)).rejects.toThrow(message);
    });
    assertPersistenceUnchanged(root, unchanged);
  });

  it('on a root that is not a git repository, the usage error still comes first (no read before it)', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'wf-rekey-plain-'));
    try {
      await expect(rekey(plain, 'life-1-plan', {})).rejects.toThrow(UsageError);
      await expect(rekey(plain, 'life-1-plan', {})).rejects.toThrow('missing required argument: --from');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('task-295 AC 2 — the success shape, remapped (D4) and chains', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) removeTempDir(root);
  });

  it('RekeyResult: keys in spec-017 §8 order, commit = HEAD, remapped 1 (the adoption), exit 0', async () => {
    const root = await buildRekeyRepo();
    roots.push(root);
    const result = await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID }));
    const value = ok<RekeyView>(result);
    expect(exitCodeForResult(result)).toBe(0);
    expect(Object.keys(value)).toEqual(['baseline', 'instance', 'from', 'to', 'remapped', 'commit', 'next']);
    expect(value.commit).toBe(head(root));
    expect(value).toMatchObject({ from: 'life.seed', to: 'life.seed-line', remapped: 1 });
    expect(value.instance.id).toBe('life-1-plan');
    expect(value.next?.key).toMatch(/^life\.close(@|$)/);
  });

  it('remapped counts entries: an adoption, a phase record and a linkage naming life.seed → 3', async () => {
    const root = await buildRekeyRepo({
      beforeRename: (repo) => {
        commitWith(repo, 'workflow: finalize life-1-plan life.seed', { 'WingFoil-Phase': 'life.seed completed', 'WingFoil-Instance': 'life-1-plan' });
        writeFixtureFile(repo, 'docs/rl/rl-v2.md', '---\nid: "rl-v2"\ntype: release-line\ntitle: "rl-v2"\nstatus: draft\n---\n\n## Body\n');
        commitWith(repo, 'wf(release-line): add rl-v2', { 'WingFoil-Instance': 'life-1-plan', 'WingFoil-Step': 'life.seed' });
      },
    });
    roots.push(root);
    const value = ok<RekeyView>(await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID })));
    expect(value.remapped).toBe(3);
    expect(value.commit).toBe(head(root));
  });

  it('a chain: seed → seed-line, then seed-line → seed-final (remapped 1); life.seed then names no record', async () => {
    const root = await buildRekeyRepo();
    roots.push(root);
    ok(await asMorgan(() => rekey(root, 'life-1-plan', { ...VALID })));
    writeFixtureFile(root, LIFE_FILE, lifeYaml('seed-final'));
    commitAll(root, 'rename life.seed-line to life.seed-final');

    const second = ok<RekeyView>(await asMorgan(() => rekey(root, 'life-1-plan', { from: 'life.seed-line', to: 'life.seed-final', reason: 'renamed again' })));
    expect(second).toMatchObject({ from: 'life.seed-line', to: 'life.seed-final', remapped: 1 });
    expect(second.commit).toBe(head(root));

    await expectRefusal(
      root,
      () => asMorgan(() => rekey(root, 'life-1-plan', { from: 'life.seed', to: 'life.seed-final', reason: 'skip a link' })),
      'CONFLICT',
      'no record of life-1-plan names life.seed',
    );
  });
});

/**
 * task-334 AC 1, AC 2 (the primitive half) (`spec-018` §2.2, §2.3 rule 4, §3.3; design "src/storage/commit.ts", D2) —
 * the commit primitive appends the agent attribution trailers from `CommitOptions.attribution`, for every writer
 * (`writeAndCommit`, `commitEmpty`, `commitPaths`) and for a dry run's planned message.
 *
 * - The two lines join the final trailer paragraph AFTER `WingFoil-Version:`, in the order `Co-Authored-By: <name>
 *   <<email>>`, `AI-Model: <model>`; the caller's `trailers` stay first; one paragraph (`git-conventions` §8,
 *   `bug-236`), so git's own trailer reader (`%(trailers:key=Co-Authored-By,valueonly)`) reads it.
 * - `attribution.note` (`spec-018` §2.3 rule 4's body line) becomes the body's FIRST paragraph, before every other
 *   body line, so a `Reason:` block that runs to the trailer paragraph does not swallow it.
 * - The approval backstop sees the attribution: an attribution handed to a message with an `Approver:` line is
 *   `E_AGENT_TRAILER_ON_APPROVAL` naming `Co-Authored-By`, nothing written or staged (§3.3).
 * - Without `attribution` the bytes are today's (T-10's primitive half; characterization, passes before green).
 *
 * Red until green: `CommitOptions` has no `attribution` (tsc TS2353) and `CommitAttribution` is not exported from
 * `src/storage` (tsc TS2305); under ts-jest's `isolatedModules` the suite runs and the messages lack the two lines.
 * Throwaway repositories. Deterministic: fixed text, fixed identity; the `WingFoil-Version:` value is computed as the
 * storage suites do (`formatVersionTrailer(readBuildStamp())`), never typed.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { captureDryRun, commitEmpty, commitPaths, formatVersionTrailer, readBuildStamp, StorageError, writeAndCommit } from '../../src/storage';
import type { CommitAttribution } from '../../src/storage';
import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from './helpers/git-fixture';
import { assertPersistenceUnchanged, snapshotPersistence } from './helpers/persistence-snapshot';

const ATTRIBUTION: CommitAttribution = { name: 'Claude', email: 'noreply@anthropic.com', model: 'm-1' };
const GUESSED_NOTE = 'Attributed to the first team.agents entry, Claude: no entry is named for this agent.';

const stamp = (): string => formatVersionTrailer(readBuildStamp());
const agentLines = (): string => 'Co-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: m-1';

describe('task-334 AC 1 — CommitOptions.attribution appends the two trailers after WingFoil-Version:, one paragraph', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/kept.md', 'one\n');
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  /** The recorded message of `HEAD`, its trailing newlines dropped. */
  const message = (): string => git(repo, ['log', '-1', '--format=%B']).replace(/\n+$/, '');
  const coAuthorByGit = (): string => git(repo, ['log', '-1', '--format=%(trailers:key=Co-Authored-By,valueonly)']).trim();
  const modelByGit = (): string => git(repo, ['log', '-1', '--format=%(trailers:key=AI-Model,valueonly)']).trim();

  it('writeAndCommit: subject, then the paragraph WingFoil-Version:, Co-Authored-By:, AI-Model:; git reads both trailers', () => {
    writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'wf(task): add t', { attribution: ATTRIBUTION });
    expect(message()).toBe(`wf(task): add t\n\n${stamp()}\n${agentLines()}`);
    expect(coAuthorByGit()).toBe('Claude <noreply@anthropic.com>');
    expect(modelByGit()).toBe('m-1');
  });

  it('writeAndCommit with trailers: the caller\'s trailers, then WingFoil-Version:, then the two agent lines — one paragraph', () => {
    writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'wf(task): add t', {
      trailers: ['WingFoil-Instance: i', 'WingFoil-Step: s'],
      attribution: ATTRIBUTION,
    });
    expect(message()).toBe(`wf(task): add t\n\nWingFoil-Instance: i\nWingFoil-Step: s\n${stamp()}\n${agentLines()}`);
    expect(git(repo, ['log', '-1', '--format=%(trailers:key=WingFoil-Instance,valueonly)']).trim()).toBe('i');
    expect(coAuthorByGit()).toBe('Claude <noreply@anthropic.com>');
  });

  it('commitEmpty: the same final paragraph', () => {
    commitEmpty(repo, 'workflow: finalize p w.a', { trailers: ['WingFoil-Phase: w.a completed'], attribution: ATTRIBUTION });
    expect(message()).toBe(`workflow: finalize p w.a\n\nWingFoil-Phase: w.a completed\n${stamp()}\n${agentLines()}`);
    expect(coAuthorByGit()).toBe('Claude <noreply@anthropic.com>');
  });

  it('commitPaths: the same final paragraph', () => {
    writeFixtureFile(repo, 'docs/kept.md', 'two\n');
    commitPaths(repo, ['docs/kept.md'], 'wf(dna): set x', { attribution: ATTRIBUTION });
    expect(message()).toBe(`wf(dna): set x\n\n${stamp()}\n${agentLines()}`);
  });

  it('a body is kept between the subject and the trailer paragraph', () => {
    commitEmpty(repo, 'wf(task): park t [in-progress → backlog]\n\nReason: r', { attribution: ATTRIBUTION });
    expect(message()).toBe(`wf(task): park t [in-progress → backlog]\n\nReason: r\n\n${stamp()}\n${agentLines()}`);
  });

  it('attribution.note is the body\'s FIRST paragraph, before a Reason: block (spec-018 §2.3 rule 4)', () => {
    commitEmpty(repo, 'wf(task): park t [in-progress → backlog]\n\nReason: r', { attribution: { ...ATTRIBUTION, note: GUESSED_NOTE } });
    expect(message()).toBe(`wf(task): park t [in-progress → backlog]\n\n${GUESSED_NOTE}\n\nReason: r\n\n${stamp()}\n${agentLines()}`);
  });

  it('attribution.note on a subject-only message: the subject, the note, then the trailer paragraph', () => {
    writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'wf(task): add t', { attribution: { ...ATTRIBUTION, note: GUESSED_NOTE } });
    expect(message()).toBe(`wf(task): add t\n\n${GUESSED_NOTE}\n\n${stamp()}\n${agentLines()}`);
  });

  it('a dry run\'s planned message ends with the two agent lines, nothing written', async () => {
    const unchanged = snapshotPersistence(repo, ['docs/new.md']);
    const outcome = await captureDryRun(async () =>
      writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'wf(task): submit t', { attribution: ATTRIBUTION }),
    );
    assertPersistenceUnchanged(repo, unchanged, 'dry run');
    expect(outcome.kind).toBe('planned');
    if (outcome.kind !== 'planned') return;
    expect(outcome.plan.message).toBe(`wf(task): submit t\n\n${stamp()}\n${agentLines()}`);
  });

  it('characterization (T-10, primitive half): without attribution the message is exactly the subject and the signature', () => {
    writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], 'wf(task): add t');
    expect(message()).toBe(`wf(task): add t\n\n${stamp()}`);
    expect(coAuthorByGit()).toBe('');
  });
});

describe('task-334 AC 1 — the approval backstop sees the attribution (spec-018 §3.3)', () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempGitRepo();
    writeFixtureFile(repo, 'docs/kept.md', 'one\n');
    commitAll(repo, 'seed');
  });
  afterEach(() => removeTempDir(repo));

  const SUBJECT = 'wf(task): approve t [pending → backlog]';
  const APPROVAL = `${SUBJECT}\n\nApprover: A <a@example.invalid> (approver)\nReason: r`;

  it('writeAndCommit with an attribution on an Approver: message: E_AGENT_TRAILER_ON_APPROVAL naming Co-Authored-By, nothing written or staged', () => {
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    const unchanged = snapshotPersistence(repo, ['docs/new.md']);
    let thrown: unknown;
    try {
      writeAndCommit(repo, [{ path: 'docs/new.md', content: 'n\n' }], APPROVAL, { attribution: ATTRIBUTION });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).code).toBe('E_AGENT_TRAILER_ON_APPROVAL');
    expect((thrown as { key?: string }).key).toBe('Co-Authored-By');
    expect(existsSync(join(repo, 'docs/new.md'))).toBe(false);
    expect(git(repo, ['diff', '--cached', '--name-only'])).toBe('');
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(head);
    assertPersistenceUnchanged(repo, unchanged, 'refused approval');
  });

  it('commitEmpty with an attribution on an Approver: message: refused the same way, HEAD unchanged', () => {
    const head = git(repo, ['rev-parse', 'HEAD']).trim();
    let thrown: unknown;
    try {
      commitEmpty(repo, APPROVAL, { attribution: ATTRIBUTION });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as StorageError | undefined)?.code).toBe('E_AGENT_TRAILER_ON_APPROVAL');
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(head);
  });
});

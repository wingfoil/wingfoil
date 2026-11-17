/**
 * task-333 fix round (review finding 6) — the `approval-agent-trailer` finding names the key with the article that
 * agrees with it: "an AI-Model: line", "a Co-Authored-By: line" (`scripts/check-governance.cjs`, `spec-018` §4).
 * A throwaway repository with one approval commit carrying both trailers.
 */
import { execFileSync } from 'node:child_process';

import { checkGovernance } from '../../scripts/check-governance.cjs';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

describe('task-333 — approval-agent-trailer words its key with the right article', () => {
  let root: string;
  afterAll(() => removeTempDir(root));

  it('says "an AI-Model: line" and "a Co-Authored-By: line"', () => {
    root = makeTempGitRepo();
    writeFixtureFile(root, 'README.md', 'x\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'chore: seed']);
    execFileSync(
      'git',
      [
        'commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m',
        'workflow: rekey life-1-plan life.a life.b\n\nApprover: Ada <ada@example.invalid> (approver)\nReason: Renamed.\nCo-Authored-By: Claude <noreply@anthropic.com>\nAI-Model: m-1\n\nWingFoil-Instance: life-1-plan',
      ],
      { cwd: root, encoding: 'utf-8' },
    );
    const sha = git(root, ['rev-parse', 'HEAD']).trim();

    const messages = checkGovernance(root)
      .findings.filter((finding) => finding.sha === sha && finding.check === 'approval-agent-trailer')
      .map((finding) => finding.message);

    expect(messages).toHaveLength(2);
    expect(messages.some((message) => message.endsWith('yet it has an AI-Model: line'))).toBe(true);
    expect(messages.some((message) => message.endsWith('yet it has a Co-Authored-By: line'))).toBe(true);
  });
});

/**
 * task-294 AC 4 (characterization, design D4 as ruled at the design gate, 2026-10-24) — the provenance records
 * are not Memory operations, for every reader that sorts commits into Memory operations and the rest:
 *
 * - `scripts/check-governance.cjs` checks no `wf()` rule on `workflow: adopt …` (single, or bulk with an
 *   `Approver:` line by a non-approver) or `workflow: rekey …`, as it checks none on `workflow: finalize …`, and
 *   counts them among the other commits; the run exits 0;
 * - `parseMemoryOperation` reads each subject as `null`;
 * - `memory history` of an adopted element lists the same entries before and after its adoption (the record
 *   changes no file).
 *
 * Passes at red: the behaviour exists (design facts, scratch run of 2026-10-24). The authority hole on a
 * `workflow:` record's `Approver:` line is the coordinator's candidate finding F29, not this task's.
 */
import { execFileSync } from 'node:child_process';

import { checkGovernance, exitCodeFor } from '../../scripts/check-governance.cjs';
import { CORE_MODULES, enumerateOperations } from '../../src/core';
import type { CoreResult } from '../../src/core/types';
import { parseMemoryOperation } from '../../src/memory/audit';
import { adoptionByHand, buildLifeRepo, INSTANCE } from '../core/helpers/adopt-fixture';
import { git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';

const ADOPT_SINGLE = `workflow: adopt life-1-plan life.seed release-line:rl-v1`;
const ADOPT_BULK = `workflow: adopt life-1-plan life.adr@release-line:rl-v1 adr:adr-1`;
const REKEY = 'workflow: rekey life-1-plan life.seed life.seed-line';
const FINALIZE = 'workflow: finalize life-1-plan life.close';

describe('task-294 AC 4 — parseMemoryOperation reads the provenance subjects as null, as the finalize record', () => {
  it.each([ADOPT_SINGLE, ADOPT_BULK, REKEY, FINALIZE])('%s', (subject) => {
    expect(parseMemoryOperation(subject)).toBeNull();
  });
});

const DNA_YAML = `version: 1.1
modules:
  - name: core
    path: src/core
stacks:
  technologies:
    - name: TypeScript
      category: language
team:
  members:
    - name: Ada Approver
      email: approver@example.invalid
      roles: [ approver, developer ]
    - name: Dev Eloper
      email: developer@example.invalid
      roles: [ developer ]
  roles:
    - name: approver
    - name: developer
paths:
  sources: [ src/ ]
`;

const MEMORY_YAML = `version: 1
types:
  task:
    path: "docs/memory/task/{id}.md"
    states:
      sequence: [draft, pending, done]
`;

const DEVELOPER = { name: 'Dev Eloper', email: 'developer@example.invalid' };

describe('task-294 AC 4 — check-governance treats workflow: adopt / rekey records as non-Memory commits', () => {
  const root = makeTempGitRepo();
  afterAll(() => removeTempDir(root));

  /** An empty commit with `message`, authored by the developer (no approver role). */
  function empty(message: string): string {
    execFileSync('git', ['commit', '--quiet', '--allow-empty', '--cleanup=whitespace', '-m', message], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, GIT_AUTHOR_NAME: DEVELOPER.name, GIT_AUTHOR_EMAIL: DEVELOPER.email, GIT_COMMITTER_NAME: DEVELOPER.name, GIT_COMMITTER_EMAIL: DEVELOPER.email },
    });
    return git(root, ['rev-parse', 'HEAD']).trim();
  }

  writeFixtureFile(root, '.wingfoil/memory.yaml', MEMORY_YAML);
  writeFixtureFile(root, '.wingfoil/dna.yaml', DNA_YAML);
  writeFixtureFile(root, 'docs/memory/task/t-1.md', '---\nid: "t-1"\ntype: task\ntitle: "T"\nstatus: draft\n---\n\nBody.\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'wf(task): add t-1']);
  const single = empty(`${ADOPT_SINGLE}\n\nReason: created by hand\n\nWingFoil-Instance: life-1-plan\nWingFoil-Step: life.seed\nWingFoil-Adopted: release-line:rl-v1`);
  const bulk = empty(
    `${ADOPT_BULK}\n\nApprover: Dev Eloper <developer@example.invalid> (approver)\nReason: adoption of the pre-engine state\n\nWingFoil-Instance: life-1-plan\nWingFoil-Step: life.adr@release-line:rl-v1\nWingFoil-Adopted: adr:adr-1`,
  );
  const rekey = empty(`${REKEY}\n\nApprover: Dev Eloper <developer@example.invalid> (approver)\nReason: phase renamed\n\nWingFoil-Instance: life-1-plan\nWingFoil-Rekey-From: life.seed\nWingFoil-Rekey-To: life.seed-line`);
  const report = checkGovernance(root);

  it('reports no finding on any of the three records', () => {
    expect(report.findings.filter((finding) => [single, bulk, rekey].includes(finding.sha))).toEqual([]);
  });

  it('checks only the wf() commit, counts the three records among the other commits, and exits 0', () => {
    expect(report.checked).toBe(1);
    expect(report.otherCommits).toBe(3);
    expect(report.findings).toEqual([]);
    expect(exitCodeFor(report)).toBe(0);
  });
});

describe('task-294 AC 4 — memory history of an adopted element is unchanged by its adoption', () => {
  let root: string;
  afterAll(() => removeTempDir(root));

  it('lists the same entries before and after the adoption record', async () => {
    root = buildLifeRepo();
    const history = enumerateOperations(CORE_MODULES).find((entry) => entry.module.name === 'memory' && entry.operation.name === 'memoryHistory')!.operation.fn;
    const read = async (): Promise<unknown> => {
      const result = (await history({ root, positional: 'rl-v1', options: {} })) as CoreResult<unknown>;
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    const before = await read();

    adoptionByHand(root, INSTANCE, 'life.seed', 'release-line:rl-v1');

    expect(await read()).toEqual(before);
  });
});

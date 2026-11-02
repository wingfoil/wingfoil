/**
 * task-309 (`bug-025`, P3.5) — through the compiled CLI: a directive file that lacks its required `name`
 * header is refused with the P3.5 scenario's message ("Error - a directive file missing required header
 * fields", `docs/02_requirements/02_bdd/features/p3-directives/P3.5-project-directives.feature`), the
 * file named repository-relative in front of it (design gate, 2026-10-30, D1 (a)):
 *
 * - `directives list` reads the working tree: `error: E_VALIDATION name (<file>): invalid directive:
 *   missing required field 'name'`, exit `1`, and the same reason as `{"error": …}` under `--format json`;
 * - `directive assign` resolves the inventory at HEAD (task-311): the committed file is named `HEAD:<file>`
 *   inside its refusal, and nothing is committed.
 *
 * The loader-level pins are `test/core/project-directives.test.ts`. Each repository is scaffolded by the
 * CLI's own `init --template scrum`, so the other directives are the shipped ones.
 */
import { existsSync, realpathSync } from 'node:fs';

import { commitAll, git, makeTempGitRepo, removeTempDir, writeFixtureFile } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';

const FILE = '.wingfoil/directives/custom/no-direct-db-access.md';
/** bug-025's fixture file, verbatim. */
const NAMELESS = '---\nid: no-direct-db-access\ntype: directive\nkind: custom\ntitle: "No direct DB access"\n---\n\nrule body\n';
const MESSAGE = "invalid directive: missing required field 'name'";
const REASON = `E_VALIDATION name (${FILE}): ${MESSAGE}`;

function expectNoHostPathNorZodText(repo: string, text: string): void {
  expect(text).not.toContain(repo);
  expect(text).not.toContain(realpathSync(repo));
  expect(text).not.toContain('received undefined');
}

describe('P3.5 — a directive file missing its name header, through the CLI (task-309, bug-025)', () => {
  const repos: string[] = [];
  const scaffolded = (): string => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    const init = runCliEntry(repo, ['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
    writeFixtureFile(repo, FILE, NAMELESS);
    return repo;
  };

  beforeAll(() => expect(existsSync(CLI_ENTRY)).toBe(true));
  afterAll(() => repos.forEach(removeTempDir));

  it('`directives list` reports the file invalid with the P3.5 message, exit 1', () => {
    const repo = scaffolded();

    const result = runCliEntry(repo, ['directives', 'list']);

    expect(result.status).toBe(1);
    expect(result.stderr.split('\n')[0]).toBe(`error: ${REASON}`);
    expectNoHostPathNorZodText(repo, result.stderr);
  });

  it('`--format json directives list` carries the same reason as `{"error": …}`', () => {
    const repo = scaffolded();

    const result = runCliEntry(repo, ['--format', 'json', 'directives', 'list']);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ error: REASON });
    expectNoHostPathNorZodText(repo, result.stderr);
  });

  it('`directive assign` on a committed nameless file names it at HEAD with the P3.5 message, and commits nothing', () => {
    const repo = scaffolded();
    commitAll(repo, 'fixture: a directive with no name');
    const before = git(repo, ['rev-parse', 'HEAD']).trim();

    const result = runCliEntry(repo, ['directive', 'assign', '--directive', 'determinism', '--role', 'qa']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`E_VALIDATION name (HEAD:${FILE}): ${MESSAGE}`);
    expectNoHostPathNorZodText(repo, result.stderr);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(before);
  });
});

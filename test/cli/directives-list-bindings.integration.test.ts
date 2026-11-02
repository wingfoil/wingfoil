/**
 * task-310 (`bug-199`, `bug-411`) — through the compiled CLI: what `wingfoil directives list` says about
 * role bindings.
 *
 * - AC1 (`bug-199`, RED-FIRST, design gate D3 (a)): with no `roles.yaml` — here a `.wingfoil/` that is an
 *   empty directory — `--role` makes no role assertion: exit `0`, `{ entries: [], warnings: [] }`, and no
 *   "no directives assigned" text in either format. Before task-310 the same steps printed
 *   `{"entries":[],"warnings":["no directives assigned to role 'developer'"]}`, exit 0
 *   (`git init`, an empty commit, `mkdir .wingfoil`, `node dist/cli.js --format json directives list --role
 *   developer`, on 0.3.1 at dc56337f).
 * - AC2 (`bug-411`, RED-FIRST, design gate D1 (a), D4 (a)): on a scaffolded project whose `roles.yaml`
 *   binds `ghost-directive` to `qa`, the UNFILTERED listing names that binding, as `--role qa` already does
 *   (`["directive 'ghost-directive' bound to role 'qa' has no directive file"]` under `--role qa`, `[]`
 *   unfiltered, on the same build): a warning, exit `0` (dl-042 D).
 *
 * The `roles.yaml` refusals of AC3 (`bug-455`) sit beside task-309's in
 * `test/cli/config-missing-refusal.integration.test.ts`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';
import { CLI_ENTRY, runCliEntry } from './helpers/spawn-cli';

describe('wingfoil directives list — role bindings (task-310)', () => {
  const repos: string[] = [];
  const freshRepo = (): string => {
    const repo = makeTempGitRepo();
    repos.push(repo);
    return repo;
  };

  beforeAll(() => expect(existsSync(CLI_ENTRY)).toBe(true));
  afterAll(() => repos.forEach(removeTempDir));

  describe('AC1 — --role with no roles.yaml makes no role assertion (bug-199)', () => {
    const emptyConfiguration = (): string => {
      const repo = freshRepo();
      git(repo, ['commit', '--quiet', '--allow-empty', '-m', 'init']);
      mkdirSync(join(repo, '.wingfoil'));
      return repo;
    };

    it('`wingfoil --format json directives list --role developer` on an empty .wingfoil/: exit 0, nothing listed, nothing warned', () => {
      const repo = emptyConfiguration();

      const result = runCliEntry(repo, ['--format', 'json', 'directives', 'list', '--role', 'developer']);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ entries: [], warnings: [] });
    });

    it('`wingfoil directives list --role developer` on an empty .wingfoil/: no "no directives assigned" text', () => {
      const repo = emptyConfiguration();

      const result = runCliEntry(repo, ['directives', 'list', '--role', 'developer']);

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('no directives assigned');
      expect(result.stderr).not.toContain('no directives assigned');
    });
  });

  describe('AC2 — the unfiltered listing names a dangling binding (bug-411)', () => {
    it('a scaffold whose roles.yaml binds ghost-directive to qa: `wingfoil --format json directives list` warns, exit 0', () => {
      const repo = freshRepo();
      const init = runCliEntry(repo, ['init', '--template', 'scrum']);
      if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
      const rolesPath = join(repo, '.wingfoil', 'roles.yaml');
      const roles = readFileSync(rolesPath, 'utf-8');
      if (!roles.includes('\n  qa:\n')) throw new Error('fixture bug: the scaffold roles.yaml has no `qa:` assignment');
      writeFileSync(rolesPath, roles.replace('\n  qa:\n', '\n  qa:\n    - ghost-directive\n'), 'utf-8');
      git(repo, ['commit', '--quiet', '-am', 'bind ghost-directive to qa']);

      const result = runCliEntry(repo, ['--format', 'json', 'directives', 'list']);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).warnings).toEqual(["directive 'ghost-directive' bound to role 'qa' has no directive file"]);
    });
  });
});

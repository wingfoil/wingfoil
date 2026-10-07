/**
 * task-260 — a `team.agents` entry is an identity the attribution audit would accept (`bug-261`), and an
 * entry that `agent execute` can launch signs with an address (`dl-158` Rule 2 (ii)).
 *
 * `git-conventions` §7 writes the entry as `Co-Authored-By: <name> <<email>>`. Before this task
 * `AgentEntry` accepted an empty or blank `name` and an `email` on an RFC 2606 reserved top-level domain,
 * the very identities `isValidAttribution` (`src/memory/audit.ts`, task-132, `bug-153`) calls placeholders;
 * and an entry with an `adapter` (so launchable, `spec-016` §3.7) could omit its `email`, which would make
 * its commits drop the co-authorship `dl-117` Q1 (B) requires. The rule is shared, not restated: the
 * agreement table below shows the schema and the audit reach the same verdict on its rows (agreement on
 * those rows, not a proof of equivalence: the schema is stricter by design, e.g. angle brackets), and the
 * reserved-TLD list and git's `.(none)` marker are defined once under `src/`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DnaYaml } from '../../src/dna/schema';
import { isValidAttribution } from '../../src/memory';

function withAgent(agent: Record<string, unknown>): unknown {
  return {
    version: 1.1,
    modules: [{ name: 'core', path: 'src/core' }],
    stacks: { technologies: [{ name: 'TypeScript', category: 'language' }] },
    team: {
      members: [{ name: 'X', roles: ['approver'] }],
      agents: [{ name: 'claude', executes_as: ['developer'], ...agent }],
      roles: [{ name: 'developer' }, { name: 'approver' }],
    },
    paths: { sources: ['src/'] },
  };
}

function issueAt(input: unknown, path: string): string | undefined {
  const result = DnaYaml.safeParse(input);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join('.') === path)?.message;
}

describe('task-260 — AgentEntry refuses a placeholder identity (bug-261)', () => {
  it.each(['', ' ', '  \t '])('refuses an empty or blank name (%j), naming team.agents.0.name', (name) => {
    const message = issueAt(withAgent({ name, email: 'noreply@anthropic.com' }), 'team.agents.0.name');
    expect(message).toBeDefined();
    expect(message).toMatch(/empty or blank/);
  });

  it.each(['bot@agents.test', 'bot@example.invalid', 'a@b.example', 'svc@host.localhost', 'Bot@Agents.TEST', 'bot@agents.test.'])(
    'refuses an email on an RFC 2606 reserved top-level domain (%j), naming team.agents.0.email',
    (email) => {
      const message = issueAt(withAgent({ email }), 'team.agents.0.email');
      expect(message).toBeDefined();
      expect(message).toMatch(/reserved top-level domain/);
    },
  );

  it.each(['root@host.(none)', 'root@host.(none).com'])('refuses git\'s guessed-domain marker (%j), naming team.agents.0.email', (email) => {
    const message = issueAt(withAgent({ email }), 'team.agents.0.email');
    expect(message).toBeDefined();
    expect(message).toContain('.(none)');
  });

  it('refuses a parenthesis in the top-level domain, naming team.agents.0.email', () => {
    const message = issueAt(withAgent({ email: 'a@b.c(d)' }), 'team.agents.0.email');
    expect(message).toBeDefined();
    expect(message).toMatch(/parenthesis/);
  });

  it('reports one issue per refused email (the shape refusal is not repeated by the audit rule)', () => {
    const result = DnaYaml.safeParse(withAgent({ email: 'bot@agents.test' }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.filter((i) => i.path.join('.') === 'team.agents.0.email')).toHaveLength(1);
  });

  it.each(['noreply@anthropic.com', 'agent@test.example.com', 'bot@example.org'])('keeps accepting %j (only the top-level label counts)', (email) => {
    expect(DnaYaml.safeParse(withAgent({ email })).success).toBe(true);
  });

  // The agreement table: for every well-shaped pair, the schema refuses the entry exactly when the audit
  // rejects the identity. Rows cover each half of the shared rule and the accepted case.
  it.each<[string, string]>([
    ['', 'noreply@anthropic.com'],
    ['   ', 'noreply@anthropic.com'],
    ['Claude', 'bot@agents.test'],
    ['Claude', 'bot@example.invalid'],
    ['Claude', 'a@b.example'],
    ['Claude', 'svc@host.localhost'],
    ['Claude', 'noreply@anthropic.com'],
    ['AI agent (Claude/Cursor/etc.)', 'agent@test.example.com'],
    // Review F1: git's guessed-domain marker and a parenthesis in the top-level domain, which the audit's
    // address shape rejects. The table shows agreement on its rows, not equivalence of the two predicates.
    ['Claude', 'root@host.(none)'],
    ['Claude', 'root@host.(none).com'],
    ['Claude', 'a@b.c(d)'],
  ])('the schema and isValidAttribution agree on %j <%s>', (name, email) => {
    const schemaAccepts = DnaYaml.safeParse(withAgent({ name, email })).success;
    expect(schemaAccepts).toBe(isValidAttribution(name, email));
  });
});

describe('task-260 — an entry agent execute can launch declares an email (dl-158 Rule 2 (ii))', () => {
  it('refuses an entry with an adapter and no email, naming team.agents.0.email', () => {
    const message = issueAt(withAgent({ adapter: 'claude-code' }), 'team.agents.0.email');
    expect(message).toBeDefined();
    expect(message).toContain('adapter');
    expect(message).toContain('dl-158');
  });

  it('accepts an entry with an adapter and an email', () => {
    expect(DnaYaml.safeParse(withAgent({ adapter: 'claude-code', email: 'noreply@anthropic.com' })).success).toBe(true);
  });

  it('keeps email optional for an entry with no adapter, which signs nothing yet (approver ruling F1, task-256)', () => {
    expect(DnaYaml.safeParse(withAgent({})).success).toBe(true);
  });
});

describe('task-260 — the attribution rule is defined once (bug-261: shared, not restated)', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir)
      .sort()
      .flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return full.endsWith('.ts') ? [full] : [];
      });
  }

  it("the RFC 2606 reserved-TLD list and git's .(none) marker appear in exactly one file under src/, src/validation's", () => {
    const root = join(__dirname, '..', '..');
    const holders = sourceFiles(join(root, 'src'))
      .filter((file) => {
        const text = readFileSync(file, 'utf-8');
        return /\[\s*'invalid',\s*'example',\s*'test',\s*'localhost'\s*\]/.test(text) || text.includes("'.(none)'");
      })
      .map((file) => file.slice(root.length + 1).split('\\').join('/'));
    expect(holders).toEqual(['src/validation/identity.ts']);
  });
});

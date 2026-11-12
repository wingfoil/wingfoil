/**
 * task-339 review fix (approver ruling 2026-11-12; `spec-016` §2.8's posture paragraph and table, as amended) — the
 * `claude-code` built-in's headless write roles may run the project's own copy of wingfoil:
 *
 * - `developer`, `qa` and `architect` allow `"Bash(wingfoil *)"`, beside `"Bash(npx *)"` and `"Bash(npm *)"`, so the
 *   three forms a project runs its copy in — bare (`node_modules/.bin` on `PATH`, or an alias), `npx wingfoil …` and
 *   `npm run wingfoil -- …` — each match an allowed rule and no disallowed one;
 * - `reviewer` and `default` do not allow `"Bash(wingfoil *)"` (what a reviewer writes is `bug-527`'s question).
 *
 * The match below models a `Bash(<prefix> *)` rule as "the command starts with `<prefix> `", the reading of the
 * CLI's help example `"Bash(git *) Edit"`; how the CLI itself matches is settled only by the by-hand pass (D6).
 */
import { parseAdapterManifest } from '../../src/agent';
import { BUILTIN_ADAPTERS, BUILTIN_ADAPTERS_DIR } from '../../src/storage';

const WINGFOIL_RULE = 'Bash(wingfoil *)';

/** The three forms of a `wingfoil` verb run through the project's own copy. */
const FORMS = ['wingfoil memory submit task-001', 'npx wingfoil memory submit task-001', 'npm run wingfoil -- memory submit task-001'];

/** `claude-code`'s `launch.headless.permissions`, read through a record. */
function claudeMap(): Record<string, string[]> {
  const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === 'claude-code');
  if (entry === undefined) throw new Error('no built-in adapter claude-code');
  const manifest = parseAdapterManifest(entry.content, { name: 'claude-code', kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/claude-code.yaml` });
  return (manifest.launch.headless as unknown as { permissions: Record<string, string[]> }).permissions;
}

/** A fragment's allowed and disallowed rules: the words after each list option, up to the next option. */
function rules(fragment: readonly string[]): { allowed: string[]; disallowed: string[] } {
  const lists: Record<string, string[]> = { '--allowedTools': [], '--disallowedTools': [] };
  let current: string[] | undefined;
  for (const word of fragment) {
    if (word.startsWith('--')) current = lists[word];
    else current?.push(word);
  }
  return { allowed: lists['--allowedTools']!, disallowed: lists['--disallowedTools']! };
}

/** Whether `command` matches a `Bash(<prefix> *)` rule (see the header). */
function matches(rule: string, command: string): boolean {
  const prefix = /^Bash\((.+) \*\)$/.exec(rule)?.[1];
  return prefix !== undefined && command.startsWith(`${prefix} `);
}

describe('task-339 review — claude-code: the write roles run the project\'s own wingfoil (spec-016 §2.8)', () => {
  it.each(['developer', 'qa', 'architect'])('%s allows Bash(wingfoil *), and each form matches an allowed rule and no disallowed one', (role) => {
    const { allowed, disallowed } = rules(claudeMap()[role] ?? []);
    expect(allowed).toEqual(expect.arrayContaining([WINGFOIL_RULE, 'Bash(npx *)', 'Bash(npm *)']));
    for (const form of FORMS) {
      expect([form, allowed.some((rule) => matches(rule, form))]).toEqual([form, true]);
      expect([form, disallowed.some((rule) => matches(rule, form))]).toEqual([form, false]);
    }
  });

  it.each(['reviewer', 'default'])('%s does not allow Bash(wingfoil *)', (role) => {
    const fragment = claudeMap()[role] ?? [];
    expect(fragment.length).toBeGreaterThan(0);
    expect(fragment).not.toContain(WINGFOIL_RULE);
  });
});

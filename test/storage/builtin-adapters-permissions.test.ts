/**
 * task-339 AC 3 (red-first, the structural half; `spec-016` §2.8's posture table as amended at the design gate;
 * `dl-223` (b), Action 3; `dl-181` ratification "never wider than the step's role"; approver rulings D5 (a), D6, D7 (a),
 * D8) — every shipped built-in adapter, parsed as a built-in, declares its headless posture as a role map:
 *
 * - `launch.headless.permissions` is a map (not a list) naming `default`, `developer`, `qa`, `reviewer`, `architect`;
 * - `launch.interactive.permissions` is absent (D5: at a terminal a person answers the CLI's prompts);
 * - no fragment holds a flag or value that bypasses the CLI's permission checks or sandbox;
 * - `claude-code`: every entry begins `--permission-mode dontAsk`, and neither `default`'s nor `reviewer`'s fragment
 *   holds `Edit` or `Write`;
 * - `codex-cli`: `default` is `--sandbox read-only`.
 *
 * As in the per-adapter suites (`test/storage/builtin-adapter-{claude-code,codex-cli}.test.ts`, their l.8–9), the
 * exact flag lists are not pinned: they are facts of the by-hand pass (D8), recorded in the task's Execution Notes
 * with the CLI version read. That this repository's installed `claude-code.yaml` still equals the shipped entry is
 * `test/storage/builtin-adapter-claude-code.test.ts`'s (unchanged). The field is read through a record so the suite
 * type-checks before the schema gains it; today it is absent, and every case fails on that.
 */
import { parseAdapterManifest } from '../../src/agent';
import { BUILTIN_ADAPTERS, BUILTIN_ADAPTERS_DIR } from '../../src/storage';

/** The roles whose entry `spec-016` §2.8's table states, and the fallback. */
const ROLE_KEYS = ['default', 'developer', 'qa', 'reviewer', 'architect'];

/** Words that would make a fragment wider than any role: the CLIs' own bypasses. */
const BYPASSES = ['--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', 'bypassPermissions', '--dangerously-bypass-approvals-and-sandbox', 'danger-full-access'];

type Launch = Record<string, Record<string, unknown> | undefined>;

function launchOf(name: string): Launch {
  const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name);
  if (entry === undefined) throw new Error(`no built-in adapter ${name}`);
  return parseAdapterManifest(entry.content, { name, kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/${name}.yaml` }).launch as unknown as Launch;
}

/** `launch.headless.permissions` of a built-in, asserted to be a role map. */
function headlessMap(name: string): Record<string, string[]> {
  const permissions = launchOf(name)['headless']?.['permissions'];
  expect(permissions).toEqual(expect.any(Object));
  expect(Array.isArray(permissions)).toBe(false);
  return permissions as Record<string, string[]>;
}

const NAMES = BUILTIN_ADAPTERS.map((adapter) => adapter.name);

describe('task-339 AC 3 — each built-in declares a headless role map (spec-016 §2.8, dl-223 (b))', () => {
  it('ships claude-code and codex-cli', () => {
    expect(NAMES).toEqual(['claude-code', 'codex-cli']);
  });

  it.each(NAMES)('%s: launch.headless.permissions is a map naming default, developer, qa, reviewer and architect', (name) => {
    const map = headlessMap(name);
    expect(Object.keys(map)).toEqual(expect.arrayContaining(ROLE_KEYS));
    for (const key of Object.keys(map)) expect(map[key]).toEqual(expect.any(Array));
  });

  it.each(NAMES)('%s: no launch.interactive.permissions (D5)', (name) => {
    expect(launchOf(name)['interactive']?.['permissions']).toBeUndefined();
  });

  it.each(NAMES)('%s: no fragment bypasses the CLI\'s permission checks or sandbox', (name) => {
    const words = Object.values(headlessMap(name)).flat();
    expect(words.length).toBeGreaterThan(0);
    for (const bypass of BYPASSES) expect(words.filter((word) => word.includes(bypass))).toEqual([]);
  });
});

describe('task-339 AC 3 — claude-code: dontAsk on every entry, no edit for default or reviewer (D6)', () => {
  it('every entry begins --permission-mode dontAsk', () => {
    const map = headlessMap('claude-code');
    for (const [role, fragment] of Object.entries(map)) expect([role, fragment.slice(0, 2)]).toEqual([role, ['--permission-mode', 'dontAsk']]);
  });

  it.each(['default', 'reviewer'])('%s holds neither Edit nor Write', (role) => {
    const fragment = headlessMap('claude-code')[role] ?? [];
    expect(fragment.length).toBeGreaterThan(0);
    expect(fragment.filter((word) => /\b(Edit|Write)\b/.test(word))).toEqual([]);
  });
});

describe('task-339 AC 3 — codex-cli: default reads only (D7 (a))', () => {
  it('default is --sandbox read-only', () => {
    expect(headlessMap('codex-cli')['default']).toEqual(['--sandbox', 'read-only']);
  });
});

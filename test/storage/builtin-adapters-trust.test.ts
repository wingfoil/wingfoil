/**
 * task-353 AC 2 (red-first, the built-ins' half; `spec-016` §2.8 "The folder trust of the built-ins" as amended at
 * the design gate `c0ac033df`; `bug-500`; approver ruling D4, from the by-hand pass of 2026-11-14 on
 * `2.1.322 (Claude Code)` and `codex-cli 0.167.2`) — every shipped built-in adapter, parsed as a built-in, declares
 * its folder trust on both launches:
 *
 * | built-in      | `launch.interactive.trust` | `launch.headless.trust` |
 * |---------------|----------------------------|-------------------------|
 * | `claude-code` | `prompt`                   | `implied`               |
 * | `codex-cli`   | `prompt`                   | `implied`               |
 *
 * No built-in declares a fragment (neither CLI's help shows an option that trusts the launch directory). That this
 * repository's installed `claude-code.yaml` still equals the shipped entry is
 * `test/storage/builtin-adapter-claude-code.test.ts`'s (unchanged). The field is read through a record so the suite
 * type-checks before the schema gains it; today the shipped manifests do not declare it, and every case fails on that.
 */
import { parseAdapterManifest } from '../../src/agent';
import { BUILTIN_ADAPTERS, BUILTIN_ADAPTERS_DIR } from '../../src/storage';

type Launch = Record<string, Record<string, unknown> | undefined>;

function launchOf(name: string): Launch {
  const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name);
  if (entry === undefined) throw new Error(`no built-in adapter ${name}`);
  return parseAdapterManifest(entry.content, { name, kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/${name}.yaml` }).launch as unknown as Launch;
}

/** D4's values, per built-in: `[interactive, headless]`. */
const RULED: Readonly<Record<string, readonly [string, string]>> = {
  'claude-code': ['prompt', 'implied'],
  'codex-cli': ['prompt', 'implied'],
};

describe('task-353 AC 2 — each built-in declares its folder trust (spec-016 §2.8, bug-500, D4)', () => {
  it('the ruled table covers exactly the shipped built-ins', () => {
    expect(BUILTIN_ADAPTERS.map((adapter) => adapter.name)).toEqual(Object.keys(RULED));
  });

  it.each(Object.entries(RULED))('%s: launch.interactive.trust and launch.headless.trust are %j', (name, [interactive, headless]) => {
    const launch = launchOf(name);
    expect([launch['interactive']?.['trust'], launch['headless']?.['trust']]).toEqual([interactive, headless]);
  });

  it.each(Object.keys(RULED))('%s: no fragment on either launch (a string, never a list)', (name) => {
    const launch = launchOf(name);
    for (const kind of ['interactive', 'headless']) {
      const trust = launch[kind]?.['trust'];
      expect(typeof trust).toBe('string');
      expect(Array.isArray(trust)).toBe(false);
    }
  });
});

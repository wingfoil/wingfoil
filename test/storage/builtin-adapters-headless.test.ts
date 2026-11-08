/**
 * task-335 AC 4 (red-first; AC 9's structural half) — the built-in adapters gain their headless work-run block
 * (`spec-016` §2.2, §2.8; `dl-181` Q3 (c), Action 3; approver ruling D7 (a)): each shipped manifest still validates
 * as a built-in and declares `launch.headless` with `output: none` (nothing parses the agent's stdout until
 * `dl-182`/`dl-188`'s tasks) and an argv of its own. As in the per-adapter suites, the flags of the argv and the
 * `verified_with` string are not pinned: they are facts of the by-hand pass (AC 9), which only a person runs. That
 * this repository's installed `claude-code.yaml` still equals the shipped entry is
 * `test/storage/builtin-adapter-claude-code.test.ts`'s (unchanged).
 */
import { parseAdapterManifest } from '../../src/agent';
import { BUILTIN_ADAPTERS, BUILTIN_ADAPTERS_DIR } from '../../src/storage';

describe('task-335 AC 4 — every shipped built-in adapter declares a headless launch (spec-016 §2.8)', () => {
  it('ships claude-code and codex-cli', () => {
    expect(BUILTIN_ADAPTERS.map((adapter) => adapter.name)).toEqual(['claude-code', 'codex-cli']);
  });

  it.each(['claude-code', 'codex-cli'])('%s: validates as a built-in, launch.headless.output is none, its args non-empty', (name) => {
    const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name)!;
    const manifest = parseAdapterManifest(entry.content, { name, kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/${name}.yaml` });
    expect(manifest.launch.headless?.output).toBe('none');
    expect(manifest.launch.headless?.args.length ?? 0).toBeGreaterThan(0);
    expect(manifest.prompt.via).toBe('arg');
  });
});

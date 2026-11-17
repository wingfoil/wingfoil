/**
 * task-335 AC 4 (red-first; AC 9's structural half) — the built-in adapters gain their headless work-run block
 * (`spec-016` §2.2, §2.8; `dl-181` Q3 (c), Action 3; approver ruling D7 (a)): each shipped manifest still validates
 * as a built-in and declares `launch.headless` with an argv of its own and an `output`: `none` for `claude-code`
 * (nothing parses its stdout until `dl-182`/`dl-188`'s tasks), `jsonl` for `codex-cli` from task-356 (its session id). As in the per-adapter suites, the flags of the argv and the
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

  // task-356 (`bug-375`, approver ruling D2 (a)): codex-cli's work run prints JSONL events (`codex exec --json`),
  // whose first carries the session id; claude-code's output stays unread.
  it.each([
    ['claude-code', 'none'],
    ['codex-cli', 'jsonl'],
  ])('%s: validates as a built-in, launch.headless.output is %s, its args non-empty', (name, output) => {
    const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name)!;
    const manifest = parseAdapterManifest(entry.content, { name, kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/${name}.yaml` });
    expect(manifest.launch.headless?.output).toBe(output);
    expect(manifest.launch.headless?.args.length ?? 0).toBeGreaterThan(0);
    expect(manifest.prompt.via).toBe('arg');
  });
});

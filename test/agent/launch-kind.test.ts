/**
 * task-335 AC 2 / AC 3 (red-first) — the launch kind (`spec-016` §3.2 step 7; `dl-183` Q1 (a), Q2 (a), Q3 (a)):
 * `resolveLaunchKind(declared, option, manifest)` over the 4 × 3 table of a phase's declared `launch`
 * (`interactive`, `headless`, `any`, none) and the option (`--interactive`, `--headless`, none).
 *
 * The rule: the option, else the declared kind when it is `interactive` or `headless`, else `interactive`
 * (`launch: any` tries the adapter's declared kinds `interactive` first, and every format-1 manifest declares
 * `launch.interactive`). A warning only when the option names the other kind than a declared `interactive` or
 * `headless`; its exact text (`phase '<workflow>.<phase>' declares launch: <declared>; launching <kind>
 * (--<kind>)`) is the pipeline's, pinned on the CLI in `test/cli/agent-execute-launch-kind.integration.test.ts`.
 * The adapter's lack of the resolved kind is not this function's refusal (§3.3 step 4, `NO_LAUNCH_KIND`): the
 * manifest below declares both.
 */
import type { AdapterManifest } from '../../src/agent';
import { resolveLaunchKind } from '../../src/agent/execute';

/** `test/fixtures/agents/custom/fake.yaml`'s launch block: both kinds declared. */
const MANIFEST = {
  name: 'fake',
  format: 1,
  command: 'node',
  launch: {
    interactive: { args: ['test/fixtures/agents/fake-agent.cjs', '--prompt', '{bootstrap}'], terminal: 'optional' },
    headless: { args: ['test/fixtures/agents/fake-agent.cjs', '--headless', '--prompt', '{bootstrap}'], output: 'json' },
  },
  prompt: { via: 'arg' },
  mcp: { via: 'config-file', template: '{}' },
  session: { id: 'none', resume: { supported: false } },
  usage: { from: 'none' },
} as AdapterManifest;

type Declared = 'interactive' | 'headless' | 'any' | null;
type Option = 'interactive' | 'headless' | undefined;

describe('task-335 — resolveLaunchKind: the option over the phase, interactive by default (spec-016 §3.2 step 7)', () => {
  it.each<[Declared, Option, 'interactive' | 'headless', boolean]>([
    // declared, option, kind, warning
    [null, undefined, 'interactive', false],
    [null, 'interactive', 'interactive', false],
    [null, 'headless', 'headless', false],
    ['interactive', undefined, 'interactive', false],
    ['interactive', 'interactive', 'interactive', false],
    ['interactive', 'headless', 'headless', true],
    ['headless', undefined, 'headless', false],
    ['headless', 'interactive', 'interactive', true],
    ['headless', 'headless', 'headless', false],
    ['any', undefined, 'interactive', false],
    ['any', 'interactive', 'interactive', false],
    ['any', 'headless', 'headless', false],
  ])('declared %s, option %s → %s (warning: %s)', (declared, option, kind, warned) => {
    const resolved = resolveLaunchKind(declared, option, MANIFEST);
    expect(resolved.kind).toBe(kind);
    expect(resolved.warning !== undefined).toBe(warned);
  });
});

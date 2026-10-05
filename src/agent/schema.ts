/**
 * The agent adapter manifest schema (`spec-016-agent-execution` §2.2, task-177): how to launch one
 * agent CLI, declared in `.wingfoil/agents/{built-in,custom}/<name>.yaml`.
 *
 * Unlike every pillar file, each object node is **strict** (`z.strictObject`), so an unknown key is a
 * Pass-1 validation error rather than `spec-009` §2's tolerated warning: a misspelt `args` would
 * otherwise launch the agent without its MCP registration (§2.2). This is the one structural layer.
 * The rules that cross fields — what a value of one field makes required in another (§2.2's "Req."
 * column), and where each placeholder is legal (§2.3) — are Pass-2 checks in `./manifest.ts`, because
 * they read several fields at once and must name the field they fault.
 *
 * There is deliberately no `env:` field (§2.2): credentials stay inside the agent CLI (`adr-012` point 1).
 * The TypeScript type is derived with `z.infer`.
 */
import { z } from 'zod';

import { ADAPTER_MANIFEST_FORMAT } from '../validation/format';
import { ID_CHAR_CLASS, isIdPiece } from '../validation/id';

/**
 * The manifest format this build reads (`spec-016` §2.2 `format`). A new manifest field bumps it.
 * Declared in `src/validation/format.ts` beside every other file kind's format (task-251, `dl-149`).
 */
export { ADAPTER_MANIFEST_FORMAT };

/** An argv template: a list of whole arguments, never a shell string (`dl-090` Q3 (a)). */
const Argv = z.array(z.string());

/** A non-empty string: a field whose empty value could only be a mistake. */
const NonEmpty = z.string().min(1, 'must not be empty');

/** `launch.interactive` — the v0.3 launch, the agent owning the terminal (`adr-012` point 4). */
const InteractiveLaunch = z.strictObject({
  args: Argv,
  /** Whether the launch needs a terminal on stdin and stdout (§3.3 step 12); `required` when absent. */
  terminal: z.enum(['required', 'optional']).default('required'),
});

/** `launch.headless` — no terminal, a structured result; read from v1.0 (§3.5). */
const HeadlessLaunch = z.strictObject({
  args: Argv,
  output: z.enum(['json', 'none']),
});

/** The JSON paths `usage.fields` may declare (§2.2); an undeclared one yields `not-reported`. */
const UsageFields = z.strictObject({
  model: NonEmpty.optional(),
  input: NonEmpty.optional(),
  output: NonEmpty.optional(),
  cache_read: NonEmpty.optional(),
  cache_write: NonEmpty.optional(),
});

/**
 * One adapter manifest, `spec-016` §2.2, field for field. A field the table marks "required with"
 * another field's value is optional here and enforced in Pass 2 (`adapterManifestIssues`,
 * `./manifest.ts`).
 */
export const AdapterManifest = z.strictObject({
  name: z.string().refine(isIdPiece, { message: `must be an id: characters [${ID_CHAR_CLASS}] only (spec-009 §1)` }),
  format: z.literal(ADAPTER_MANIFEST_FORMAT),
  command: NonEmpty,
  verified_with: NonEmpty.optional(),
  version_args: Argv.optional(),
  launch: z.strictObject({
    interactive: InteractiveLaunch,
    headless: HeadlessLaunch.optional(),
  }),
  prompt: z.strictObject({
    via: z.enum(['arg', 'stdin', 'file']),
  }),
  mcp: z.strictObject({
    // No `none`: an adapter that cannot register the `wingfoil` MCP server is refused (`adr-012`).
    via: z.enum(['config-file', 'args']),
    template: NonEmpty.optional(),
  }),
  session: z.strictObject({
    id: z.enum(['assign', 'output', 'lookup', 'none']),
    assign_args: Argv.optional(),
    lookup_args: Argv.optional(),
    field: NonEmpty.optional(),
    resume: z.strictObject({
      supported: z.boolean(),
      args: Argv.optional(),
    }),
  }),
  usage: z.strictObject({
    from: z.enum(['output', 'lookup', 'none']),
    lookup_args: Argv.optional(),
    fields: UsageFields.optional(),
  }),
  summary: z
    .strictObject({
      export_args: Argv.optional(),
    })
    .optional(),
});

/** A validated adapter manifest (`spec-016` §2.2), `launch.interactive.terminal` defaulted. */
export type AdapterManifest = z.infer<typeof AdapterManifest>;

/**
 * The two layers that have to agree about an option's NAME, and did not
 * (task-093-dna-mutation-surface-add-remove-update, second pass).
 *
 * `dna add|remove|update`'s per-entry options are **derived** from `spec-002`'s entry schemas
 * (`dnaEntryOptionNames`), while the global flags are **declared** (`spec-008` §2). Nothing kept the
 * two namespaces disjoint, and they collided on the first try: `TechEntry` declares `version`, so
 * `dna add stacks.technologies --value Zod --category validation --version 4.0` reached
 * Commander's program-level `-V, --version`, printed the CLI version, exited `0` and wrote nothing —
 * while `dna add --help` advertised `--version <value>` as a working option. A silent success in the
 * pillar every other pillar reads, which is the class `bug-084` files.
 *
 * **Why no existing test could have caught it.** AC3/AC5/AC6 were pinned at the `CoreFn` layer,
 * calling the operation with an `options` object — the layer where Commander does not run and a
 * collision cannot exist — and the CLI-layer pins happened to use `--email`, `--roles` and `--path`,
 * the names that do not collide. A criterion verified only where the defect is impossible is not
 * verified. So this file works the other way round: it asks the REGISTRY what it declares and drives
 * every one of those names through the real, compiled CLI.
 *
 * Two halves, at the two layers:
 *
 * 1. **The invariant**, in-process over the real `buildProgram` tree: no option any derived command
 *    registers may share a long name with a global flag. Both sides are read off the built program,
 *    so a new global flag (or a new schema field) is checked against what is actually registered
 *    rather than against a hand-copied list that can go stale.
 * 2. **The drive**, out-of-process over the compiled `dist/cli.js`: every entry-field option the DNA
 *    verbs declare is passed on a real command line, and the value has to land in `dna.yaml`. The
 *    table is checked for completeness against the registry, so a field added to `spec-002` cannot
 *    slip in undriven.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { buildProgram } from '../../src/cli/program';
import { CORE_MODULES, dnaEntryOptionName } from '../../src/core';
import { dnaEntryOptionNames } from '../../src/dna/path';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

/** Commander's `Command`, taken from `buildProgram`'s own return type — the package is ESM-only, so a
 * direct `import type { Command } from 'commander'` needs a resolution-mode attribute that this test
 * does not otherwise need (see `src/cli/program.ts`'s module doc). */
type BuiltProgram = Awaited<ReturnType<typeof buildProgram>>;

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');
const DNA = '.wingfoil/dna.yaml';

/** Every option the DNA mutation verbs declare, as the registry declares it. */
function dnaVerbOptions(operation: string): readonly string[] {
  const dna = CORE_MODULES.find((module) => module.name === 'dna');
  const found = dna?.operations[operation];
  if (!found) throw new Error(`fixture bug: dna.${operation} is not registered`);
  return (found.options ?? []).map((option) => option.name);
}

describe('the invariant: a derived option never shadows a global flag (spec-008 §2)', () => {
  it('no option of any derived command shares a long name with a global flag', async () => {
    const program = await buildProgram(CORE_MODULES, {
      resolveRoot: () => '/fixture-root',
      buildParams: (ctx) => ({ root: ctx.root }),
    });

    const globals = new Set(program.options.map((option) => option.long).filter((long): long is string => Boolean(long)));
    // `--version` is registered by `program.version()` rather than `.option()`, and `--help` by
    // Commander itself; neither shows up in `program.options`, and both are exactly the two that
    // TAKE AN ACTION and exit, so they are the most damaging to shadow.
    globals.add('--version').add('--help');
    expect(globals.size).toBeGreaterThan(2);

    const collisions: string[] = [];
    const walk = (command: BuiltProgram): void => {
      for (const option of command.options) {
        if (option.long && globals.has(option.long)) collisions.push(`${command.name()} ${option.long}`);
      }
      for (const child of command.commands) walk(child);
    };
    for (const child of program.commands) walk(child);

    expect(collisions).toEqual([]);
  });

  it('every entry-field option carries the namespace prefix, so the disjointness is structural', () => {
    const declared = dnaVerbOptions('dnaAdd');
    for (const field of dnaEntryOptionNames()) {
      expect(declared).toContain(dnaEntryOptionName(field));
      expect(declared).not.toContain(field);
    }
    // `--value` is the ratified grammar (dl-081; the path is the positional, dl-082) and stays
    // unprefixed; everything else
    // a verb declares is an entry field.
    expect(declared.filter((name) => name !== 'field' && name !== 'value').every((name) => name.startsWith('entry-'))).toBe(true);
  });
});

describe('the drive: every declared entry-field option lands, through the real compiled CLI', () => {
  let repo: string;

  function runCli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf-8' });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  function dna(): Record<string, never> {
    return load(readFileSync(join(repo, DNA), 'utf-8')) as Record<string, never>;
  }

  beforeEach(() => {
    repo = makeTempGitRepo();
    const init = runCli(['init', '--template', 'scrum']);
    if (init.status !== 0) throw new Error(`fixture bug: wingfoil init failed — ${init.stderr}`);
  });

  afterEach(() => removeTempDir(repo));

  /**
   * One invocation per collection, together covering every field the entry schemas declare. Each row
   * is a real command line; the assertion is on what reached `dna.yaml`, not on the exit code alone —
   * the defect this file exists for exited `0` and wrote nothing.
   */
  const DRIVES: ReadonlyArray<{
    readonly fields: readonly string[];
    readonly args: readonly string[];
    readonly expect: (document: Record<string, never>) => unknown;
    readonly value: unknown;
  }> = [
    {
      fields: ['description', 'path'],
      args: ['dna', 'add', 'modules', '--value', 'core', '--entry-description', 'Shared domain logic.', '--entry-path', 'src/core'],
      expect: (document) => (document.modules as unknown as unknown[])[0],
      value: { name: 'core', description: 'Shared domain logic.', path: 'src/core' },
    },
    {
      fields: ['category', 'version', 'notes'],
      args: [
        'dna', 'add', 'stacks.technologies', '--value', 'Zod',
        '--entry-category', 'validation', '--entry-version', '4.0', '--entry-notes', 'schema validation',
      ],
      expect: (document) => ((document.stacks as unknown as { technologies: unknown[] }).technologies)[0],
      value: { name: 'Zod', category: 'validation', version: '4.0', notes: 'schema validation' },
    },
    {
      fields: ['phase'],
      args: ['dna', 'add', 'stacks.methodologies', '--value', 'Lean Inception', '--entry-phase', 'inception'],
      expect: (document) => {
        const list = (document.stacks as unknown as { methodologies: Array<{ name: string }> }).methodologies;
        return list[list.length - 1];
      },
      value: { name: 'Lean Inception', phase: 'inception' },
    },
    {
      fields: ['email', 'roles'],
      args: [
        'dna', 'add', 'team.members', '--value', 'Ada',
        '--entry-email', 'ada@example.it', '--entry-roles', 'developer,reviewer',
      ],
      expect: (document) => (document.team as unknown as { members: unknown[] }).members[0],
      value: { name: 'Ada', email: 'ada@example.it', roles: ['developer', 'reviewer'] },
    },
    {
      fields: ['executes_as', 'approval_authority', 'adapter'],
      args: [
        'dna', 'add', 'team.agents', '--value', 'agent',
        '--entry-executes_as', 'developer,qa', '--entry-approval_authority', 'false',
        '--entry-adapter', 'claude-code',
      ],
      expect: (document) => (document.team as unknown as { agents: unknown[] }).agents[0],
      value: { name: 'agent', executes_as: ['developer', 'qa'], approval_authority: false, adapter: 'claude-code' },
    },
  ];

  it('the table drives EVERY entry-field option the registry declares — no field slips in undriven', () => {
    const driven = new Set(DRIVES.flatMap((drive) => drive.fields.map((field) => dnaEntryOptionName(field))));
    const declared = dnaVerbOptions('dnaAdd').filter((name) => name !== 'field' && name !== 'value');
    expect([...driven].sort()).toEqual([...declared].sort());
  });

  it.each(DRIVES.map((drive) => [drive.fields.join(', '), drive] as const))(
    'writes %s through the real CLI',
    (_fields, drive) => {
      const result = runCli(drive.args);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      // The defect: `--version 4.0` printed the CLI version here and wrote nothing, at exit 0.
      expect(result.stdout).not.toMatch(/^\d+\.\d+\.\d+\s*$/);
      expect(drive.expect(dna())).toEqual(drive.value);
    },
  );

  it('the reported reproduction now writes the field instead of printing the CLI version', () => {
    const shadowed = runCli(['dna', 'add', 'stacks.technologies', '--value', 'Zod', '--entry-category', 'validation', '--entry-version', '4.0']);
    expect(shadowed.status).toBe(0);
    expect(shadowed.stdout).not.toContain('0.1.0');
    expect(((dna().stacks as unknown as { technologies: Array<{ version?: string }> }).technologies)[0]?.version).toBe('4.0');
  });

  /**
   * An unprefixed spelling does TWO different things, and the first draft of `spec-008` §9 claimed only
   * the first — "an unprefixed spelling is an unknown option (exit 2 since task-101; `1` when spec-008
   * §9 was written), never a silent no-op" — while
   * pinning it with `--category`, one of the names for which it happens to hold. The claim is false for
   * `version`, which is §9's own worked example. Both outcomes are driven here, and the set of names
   * the second applies to is DERIVED from the built program rather than written out, so a new global
   * flag (or a new schema field) moves a name between the two cases without this file going stale.
   */
  describe('an unprefixed spelling: unknown option, or swallowed by the global of the same name', () => {
    /** The derived entry fields whose bare name a global flag also declares. Today: exactly `version`. */
    async function shadowedFields(): Promise<readonly string[]> {
      const program = await buildProgram(CORE_MODULES, {
        resolveRoot: () => '/fixture-root',
        buildParams: (ctx) => ({ root: ctx.root }),
      });
      const globals = new Set(
        program.options.map((option) => option.long?.replace(/^--(no-)?/, '')).filter((name): name is string => Boolean(name)),
      );
      // `--version` and `--help` are registered by `program.version()` / commander itself rather than
      // by `.option()`, so they are absent from `program.options` — and they are precisely the two that
      // take an ACTION and exit, i.e. the damaging ones.
      globals.add('version').add('help');
      return dnaEntryOptionNames().filter((field) => globals.has(field));
    }

    it('a name no global declares is refused as an unknown option at exit 2, writing nothing', async () => {
      const shadowed = await shadowedFields();
      expect(dnaEntryOptionNames().filter((field) => !shadowed.includes(field))).toContain('category');
      const result = runCli(['dna', 'add', 'stacks.technologies', '--value', 'Go', '--category', 'language']);
      // `2`, not the `1` this asserted before task-101-route-commander-parse-errors-through-the-exit-code-contract
      // (`bug-098`): an unknown option is a usage error under spec-005 §1, and Commander's parse errors
      // now terminate through that contract. What the case is here to prove is unchanged — the name is
      // REFUSED rather than silently swallowed, and nothing is written.
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("unknown option '--category'");
      expect((dna().stacks as unknown as { technologies: unknown[] }).technologies).toEqual([]);
    });

    it('a name a global DOES declare is consumed by the global, never reported — the case the prefix removes', async () => {
      const shadowed = await shadowedFields();
      // If this ever empties, `spec-008` §9's second bullet has no example left and must be re-measured
      // rather than quietly kept.
      expect(shadowed).toEqual(['version']);

      const before = readFileSync(join(repo, DNA), 'utf-8');
      const result = runCli(['dna', 'add', 'stacks.technologies', '--value', 'Go', '--version', '1.22']);

      // NOT an unknown option, NOT the exit 2 an unknown option gets: the program's own `-V, --version`
      // fires, prints and exits 0.
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+ \((?:[0-9a-f]{7,64}(?:-dirty)?|unknown)\)$/);
      // And the whole point: nothing was written, at a success exit code.
      expect(readFileSync(join(repo, DNA), 'utf-8')).toBe(before);
      expect((dna().stacks as unknown as { technologies: unknown[] }).technologies).toEqual([]);
    });

    it('the SAME field under its prefixed name is written instead, which is what makes the prefix the fix', () => {
      const result = runCli(['dna', 'add', 'stacks.technologies', '--value', 'Go', '--entry-category', 'language', '--entry-version', '1.22']);
      expect(result.status).toBe(0);
      expect(((dna().stacks as unknown as { technologies: Array<{ version?: string }> }).technologies)[0]?.version).toBe('1.22');
    });
  });

  it('`--help` advertises exactly the names that work', () => {
    const help = runCli(['dna', 'add', '--help']);
    expect(help.status).toBe(0);
    for (const field of dnaEntryOptionNames()) {
      expect(help.stdout).toContain(`--${dnaEntryOptionName(field)} <value>`);
    }
    expect(help.stdout).not.toMatch(/^\s+--version <value>/m);
  });
});

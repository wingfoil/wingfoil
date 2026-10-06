/**
 * task-060-publish-pipeline — `scripts/publish-staging.cjs`, the local-first `publish:staging` flow
 * (`spec-015` §2/§3 stages 2–3, `adr-009` §3): ephemeral Verdaccio → publish → clean global install →
 * dl-023 smoke → teardown.
 *
 * Its real effects (installing and running Verdaccio, `npm publish`, `npm install -g`) contact a registry,
 * which no test may do. The orchestrator therefore takes its effects as a parameter; these cases drive it
 * with recording fakes and assert what must hold regardless of the network: step order, the staging-only
 * flags, the scrubbed environment, and that teardown runs on every failure path. The pure builders
 * (Verdaccio config, npm argv, env) are asserted directly.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  REGISTRY_STOP_TIMEOUT_MS,
  STAGING_REGISTRY,
  TEARDOWN_SIGNALS,
  installArgs,
  installTeardownHandlers,
  parseArgs,
  publishArgs,
  realEffects,
  runStaging,
  stagingEnv,
  stagingPaths,
  stopProcess,
  verdaccioConfig,
} from '../../scripts/publish-staging.cjs';
import type { SignalTarget, StagingEffects } from '../../scripts/publish-staging.cjs';

const WORK = '/tmp/wf-staging-test';

/** Recording fake effects; `failAt` makes the named effect throw (or the smoke fail). */
function fakeEffects(failAt?: string): { readonly effects: StagingEffects; readonly calls: string[] } {
  const calls: string[] = [];
  const maybeFail = (name: string): void => {
    if (failAt === name) throw new Error(`${name} failed`);
  };
  const effects: StagingEffects = {
    makeWorkDir: () => {
      calls.push('makeWorkDir');
      return WORK;
    },
    removeWorkDir: (dir) => {
      calls.push(`removeWorkDir ${dir}`);
    },
    removeToken: (dir) => {
      calls.push(`removeToken ${dir}`);
    },
    packTarball: () => {
      calls.push('packTarball');
      maybeFail('packTarball');
      return `${WORK}/pack/wingfoil-0.2.0.tgz`;
    },
    startRegistry: async () => {
      calls.push('startRegistry');
      maybeFail('startRegistry');
      return {
        stop: async () => {
          calls.push('stopRegistry');
        },
      };
    },
    createToken: async () => {
      calls.push('createToken');
      maybeFail('createToken');
    },
    npm: (args) => {
      calls.push(`npm ${args[0]}`);
      maybeFail(`npm ${args[0]}`);
    },
    smoke: (_env, version, commit) => {
      calls.push(commit === undefined ? `smoke ${version}` : `smoke ${version} ${commit}`);
      return { ok: failAt !== 'smoke', checks: [{ label: 'wingfoil --help', ok: failAt !== 'smoke', detail: '' }] };
    },
    log: () => undefined,
  };
  return { effects, calls };
}

describe('publish:staging (task-060) — pure builders', () => {
  const paths = stagingPaths(WORK);

  it('stages on the transient localhost Verdaccio address (spec-015 §1/§5)', () => {
    expect(STAGING_REGISTRY).toBe('http://localhost:4873/');
  });

  it('keeps every staging file inside the run work dir', () => {
    for (const value of Object.values(paths)) {
      expect(value.startsWith(WORK)).toBe(true);
    }
  });

  it('publishes to staging only, with provenance explicitly off (task-059 handoff: no OIDC issuer at staging)', () => {
    const args = publishArgs('/x/wingfoil-0.2.0.tgz');
    expect(args.slice(0, 2)).toEqual(['publish', '/x/wingfoil-0.2.0.tgz']);
    expect(args).toEqual(expect.arrayContaining(['--registry', STAGING_REGISTRY, '--provenance=false']));
    expect(args.join(' ')).not.toContain('registry.npmjs.org');
  });

  it('installs the exact staged version globally from staging', () => {
    expect(installArgs('wingfoil', '0.2.0')).toEqual(['install', '--global', 'wingfoil@0.2.0', '--registry', STAGING_REGISTRY]);
  });

  it('never lets the real `wingfoil` on npmjs satisfy the install: no uplink for the package itself', () => {
    const config = verdaccioConfig(paths);
    const wingfoilBlock = config.split("'wingfoil':")[1]?.split("'**':")[0] ?? '';
    expect(wingfoilBlock).not.toBe('');
    expect(wingfoilBlock).not.toContain('proxy');
    expect(config.split("'**':")[1]).toContain('proxy: npmjs');
    expect(config).toContain(`storage: ${JSON.stringify(paths.storage)}`);
    expect(config).toContain('listen: localhost:4873');
  });

  it('scrubs inherited npm config and credentials, and isolates npm into the work dir', () => {
    const env = stagingEnv(
      {
        PATH: '/usr/bin',
        HOME: '/home/dev',
        npm_config_registry: 'https://registry.npmjs.org/',
        NPM_CONFIG_USERCONFIG: '/home/dev/.npmrc',
        npm_config__authtoken: 'x',
        NPM_TOKEN: 'x',
        NODE_AUTH_TOKEN: 'x',
      },
      paths,
    );
    expect(env.npm_config_registry).toBeUndefined();
    expect(env.NPM_CONFIG_USERCONFIG).toBeUndefined();
    expect(env.npm_config__authtoken).toBeUndefined();
    expect(env.NPM_TOKEN).toBeUndefined();
    expect(env.NODE_AUTH_TOKEN).toBeUndefined();
    expect(env).toMatchObject({
      HOME: '/home/dev',
      npm_config_userconfig: paths.userconfig,
      npm_config_globalconfig: paths.globalconfig,
      npm_config_cache: paths.cache,
      npm_config_prefix: paths.prefix,
      PATH: `${paths.prefix}/bin:/usr/bin`,
    });
  });

  it('parses an optional --tarball', () => {
    expect(parseArgs([])).toEqual({});
    expect(parseArgs(['--tarball', 'dist-pack/wingfoil-0.2.0.tgz'])).toEqual({ tarball: 'dist-pack/wingfoil-0.2.0.tgz' });
    expect(() => parseArgs(['--tarball'])).toThrow('--tarball');
    expect(() => parseArgs(['--registry', 'x'])).toThrow('--registry');
  });

  it('parses an optional --expect-commit (task-254)', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    expect(parseArgs(['--expect-commit', sha])).toEqual({ expectCommit: sha });
    expect(parseArgs(['--tarball', 't.tgz', '--expect-commit', sha])).toEqual({ tarball: 't.tgz', expectCommit: sha });
    expect(() => parseArgs(['--expect-commit'])).toThrow('--expect-commit');
    // An empty `"$GITHUB_SHA"` must stop the stage, never run it unchecked.
    expect(() => parseArgs(['--expect-commit', ''])).toThrow('--expect-commit');
    for (const bad of ['unknown', `${sha}-dirty`, 'main', sha.slice(0, 12)]) {
      expect(() => parseArgs(['--expect-commit', bad])).toThrow('not a commit name');
    }
  });
});

/**
 * task-254 (`bug-235`, `dl-111`): the stage requires the stamp to name the commit it staged, given as
 * `--expect-commit`. `publish.yml`'s stage step passes `"$GITHUB_SHA"`, the commit the gate job of the
 * same run built (`test/cli/publish-pipeline.test.ts` pins the step).
 */
describe('publish:staging (task-254) — the expected commit reaches the smoke', () => {
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const OTHER = 'fedcba9876543210fedcba9876543210fedcba98';

  it('passes the expected commit to the smoke with the version', async () => {
    const { effects, calls } = fakeEffects();
    await expect(runStaging({ name: 'wingfoil', version: '0.3.0', effects, commit: SHA })).resolves.toBe(0);
    expect(calls).toContain(`smoke 0.3.0 ${SHA}`);
  });

  it('logs that the commit is not checked when none is expected (a local run)', async () => {
    const { effects, calls } = fakeEffects();
    const lines: string[] = [];
    await expect(runStaging({ name: 'wingfoil', version: '0.3.0', effects: { ...effects, log: (l) => lines.push(l) } })).resolves.toBe(0);
    expect(calls).toContain('smoke 0.3.0');
    expect(lines).toContain('no --expect-commit: the build stamp\'s commit is not checked');
  });

  describe('the real smoke effect, against a stub `wingfoil` on PATH', () => {
    let bin: string;
    beforeAll(() => {
      bin = mkdtempSync(join(tmpdir(), 'wf-staging-stub-'));
      const stub = join(bin, 'wingfoil');
      writeFileSync(
        stub,
        [
          `#!${process.execPath}`,
          'const [a] = process.argv.slice(2);',
          "if (a === '--help') { console.log('Usage: wingfoil'); process.exit(0); }",
          "if (a === '--version') { console.log(process.env.SMOKE_STAMP); process.exit(0); }",
          "console.log(JSON.stringify({ id: 'task-001-stub', from: 'draft', to: 'pending' }));",
          '',
        ].join('\n'),
      );
      chmodSync(stub, 0o755);
    });
    afterAll(() => rmSync(bin, { recursive: true, force: true }));

    const smoke = (stamp: string, commit?: string) =>
      realEffects(process.cwd(), () => undefined).smoke(
        { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, SMOKE_STAMP: stamp },
        '0.3.0',
        commit,
      );

    it.each([['0.3.0 (unknown)'], [`0.3.0 (${SHA}-dirty)`], [`0.3.0 (${OTHER})`]])(
      'fails the stage on %s when the commit is expected',
      (stamp) => {
        const report = smoke(stamp, SHA);
        expect(report.ok).toBe(false);
        expect(report.checks[report.checks.length - 1]).toMatchObject({ label: `wingfoil --version = 0.3.0 (${SHA})`, ok: false });
      },
    );

    it('passes the stage on the exact stamp', () => {
      const report = smoke(`0.3.0 (${SHA})`, SHA);
      expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    });
  });
});

describe('publish:staging (task-060) — orchestration', () => {
  const run = (effects: StagingEffects, tarball?: string): Promise<number> =>
    runStaging({ name: 'wingfoil', version: '0.2.0', tarball, effects });

  it('packs, stages, publishes, installs, smokes, then tears down — in that order', async () => {
    const { effects, calls } = fakeEffects();
    await expect(run(effects)).resolves.toBe(0);
    expect(calls).toEqual([
      'makeWorkDir',
      'packTarball',
      'startRegistry',
      'createToken',
      'npm publish',
      'npm install',
      'smoke 0.2.0',
      // task-083 AC4: the credential goes first, before the registry it authenticates against and
      // before the bulk removal — so it is the shortest-lived artefact of a run, not the longest.
      `removeToken ${WORK}`,
      'stopRegistry',
      `removeWorkDir ${WORK}`,
    ]);
  });

  it('reuses a given tarball instead of packing (CI: the gate job’s artifact)', async () => {
    const { effects, calls } = fakeEffects();
    await expect(run(effects, 'dist-pack/wingfoil-0.2.0.tgz')).resolves.toBe(0);
    expect(calls).not.toContain('packTarball');
  });

  it.each([
    ['smoke', true],
    ['npm install', true],
    ['npm publish', true],
    ['createToken', true],
    ['startRegistry', false],
    ['packTarball', false],
  ])('fails (exit 1) when %s fails, and still tears down', async (failAt, registryStarted) => {
    const { effects, calls } = fakeEffects(failAt);
    await expect(run(effects)).resolves.toBe(1);
    expect(calls[calls.length - 1]).toBe(`removeWorkDir ${WORK}`);
    expect(calls.includes('stopRegistry')).toBe(registryStarted);
  });
});

/**
 * task-078 (`dl-057` item c) — `stopProcess`, the bounded stop the staging registry's `stop()` is built
 * from. The child processes below are plain `node -e` scripts: they touch no registry and no network.
 */
describe('stopProcess (task-078) — SIGTERM, then a bounded wait, then SIGKILL', () => {
  const children: ChildProcess[] = [];

  /** Spawn a `node -e` child and resolve once it has printed `ready` (so its handlers are installed). */
  async function spawnChild(script: string): Promise<ChildProcess> {
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
    children.push(child);
    for await (const chunk of child.stdout ?? []) {
      if (String(chunk).includes('ready')) break;
    }
    return child;
  }

  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
  });

  it('escalates to SIGKILL when the child ignores SIGTERM, and still resolves', async () => {
    const child = await spawnChild("process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);");
    const exited = once(child, 'exit');
    await stopProcess(child, { timeoutMs: 250 });
    const [, signal] = (await exited) as [number | null, NodeJS.Signals | null];
    expect(signal).toBe('SIGKILL');
  });

  it('resolves as soon as a well-behaved child exits, without waiting out the interval', async () => {
    const child = await spawnChild("console.log('ready'); setInterval(() => {}, 1000);");
    const exited = once(child, 'exit');
    // A 30 s interval the test itself could never wait out: if the escalation delay were awaited
    // unconditionally, this case would fail on jest's 5 s timeout instead of passing.
    await stopProcess(child, { timeoutMs: 30_000 });
    const [, signal] = (await exited) as [number | null, NodeJS.Signals | null];
    expect(signal).toBe('SIGTERM');
  });

  it('resolves — and signals nothing — when the child has already exited', async () => {
    const child = await spawnChild("console.log('ready');");
    await once(child, 'exit');
    const signalled: string[] = [];
    const recorder = { ...child, kill: (s: string) => signalled.push(s) } as unknown as ChildProcess;
    await stopProcess(recorder, { hasExited: () => true, timeoutMs: 30_000 });
    expect(signalled).toEqual([]);
  });

  it('resolves even for a child that never exits at all, after SIGTERM then SIGKILL', async () => {
    const signalled: string[] = [];
    const deaf = {
      once: () => deaf,
      kill: (s: string) => {
        signalled.push(s);
        return true;
      },
    } as unknown as ChildProcess;
    await stopProcess(deaf, { timeoutMs: 20, killGraceMs: 20 });
    expect(signalled).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('defaults the escalation interval well below the registry start timeout it can be called from', () => {
    expect(REGISTRY_STOP_TIMEOUT_MS).toBe(10_000);
  });
});

/**
 * task-083 (`bug-059`) — teardown on a signal delivered to the SCRIPT. Every case here drives the
 * installed handler directly through a fake signal target and a fake `die`: no real signal is sent, no
 * real process is killed, no Verdaccio is started and nothing touches the network, so the suite stays
 * as offline and as deterministic as the orchestration cases above (AC7). The end-to-end proof — that a
 * real `SIGINT`/`SIGTERM` to a real run leaves no registry, no work dir and no token — is a recorded
 * manual probe in the task's Execution Notes, because the in-use guard it also proves is a live
 * `fetch` against :4873 that no test may make.
 */
describe('publish:staging (task-083) — teardown on SIGINT/SIGTERM/SIGHUP', () => {
  /** A signal target that records what was installed and lets a case invoke it directly. */
  function fakeSignals(): {
    readonly target: SignalTarget;
    readonly died: string[];
    readonly lines: string[];
    readonly die: (signal: string) => void;
    readonly log: (line: string) => void;
    readonly installedFor: () => string[];
    readonly raise: (signal: string) => Promise<void>;
  } {
    const handlers = new Map<string, (() => unknown)[]>();
    const died: string[] = [];
    const lines: string[] = [];
    return {
      target: {
        on: (signal, handler) => {
          handlers.set(signal, [...(handlers.get(signal) ?? []), handler]);
        },
        removeListener: (signal, handler) => {
          handlers.set(signal, (handlers.get(signal) ?? []).filter((h) => h !== handler));
        },
      },
      died,
      lines,
      die: (signal) => {
        died.push(signal);
      },
      log: (line) => {
        lines.push(line);
      },
      installedFor: () => [...handlers.entries()].filter(([, hs]) => hs.length > 0).map(([signal]) => signal),
      raise: async (signal) => {
        await Promise.all([...(handlers.get(signal) ?? [])].map((handler) => handler()));
      },
    };
  }

  it('installs a handler for exactly SIGINT, SIGTERM and SIGHUP, and removes them all on uninstall', () => {
    const signals = fakeSignals();
    const uninstall = installTeardownHandlers({
      teardown: async () => undefined,
      log: signals.log,
      die: signals.die,
      target: signals.target,
    });
    // SIGINT: Ctrl-C (bug-059's own case). SIGTERM: bare `kill`, `timeout`, `docker stop`, a CI
    // cancellation's escalation. SIGHUP: a closed terminal or dropped SSH, which leaks the same way
    // with nobody present to notice. SIGKILL is absent because POSIX forbids catching it.
    expect(TEARDOWN_SIGNALS).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    expect(signals.installedFor()).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    expect(TEARDOWN_SIGNALS).not.toContain('SIGKILL');
    uninstall();
    expect(signals.installedFor()).toEqual([]);
  });

  it.each(TEARDOWN_SIGNALS as string[])(
    'tears down exactly once and re-raises %s when it arrives mid-run (AC1, AC2, AC3, AC6)',
    async (signal) => {
      const signals = fakeSignals();
      const { effects, calls } = fakeEffects();
      let raised: Promise<void> | undefined;
      const interrupted: StagingEffects = {
        ...effects,
        // The handler logs through the staging log sink, not through a sink of its own.
        log: signals.log,
        npm: (args, env, paths) => {
          effects.npm(args, env, paths);
          // bug-059's moment: the registry is up and the token is already on disk. The main flow
          // keeps running afterwards and reaches its own `finally`, so both teardown paths race here.
          if (args[0] === 'publish') raised = signals.raise(signal);
        },
      };
      await runStaging({
        name: 'wingfoil',
        version: '0.2.0',
        tarball: 't.tgz',
        effects: interrupted,
        interrupts: { target: signals.target, die: signals.die },
      });
      await raised;

      expect(calls.filter((c) => c === `removeToken ${WORK}`)).toHaveLength(1);
      expect(calls.filter((c) => c === 'stopRegistry')).toHaveLength(1);
      expect(calls.filter((c) => c === `removeWorkDir ${WORK}`)).toHaveLength(1);
      // AC3: the interrupt is re-raised, not translated into a normal exit.
      expect(signals.died).toEqual([signal]);
      expect(signals.lines.join('\n')).toContain(`interrupted by ${signal}`);
      expect(signals.lines.join('\n')).toContain('teardown complete');
    },
  );

  it('removes the npmrc before the registry and before the work dir, on the signal path too (AC4)', async () => {
    const signals = fakeSignals();
    const { effects, calls } = fakeEffects();
    let raised: Promise<void> | undefined;
    await runStaging({
      name: 'wingfoil',
      version: '0.2.0',
      tarball: 't.tgz',
      effects: {
        ...effects,
        createToken: async () => {
          await effects.createToken(stagingPaths(WORK));
          raised = signals.raise('SIGINT');
        },
      },
      interrupts: { target: signals.target, die: signals.die },
    });
    await raised;
    expect(calls.indexOf(`removeToken ${WORK}`)).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf(`removeToken ${WORK}`)).toBeLessThan(calls.indexOf('stopRegistry'));
    expect(calls.indexOf(`removeToken ${WORK}`)).toBeLessThan(calls.indexOf(`removeWorkDir ${WORK}`));
  });

  it('absorbs a second signal during teardown: teardown still runs once and the process still exits (AC6)', async () => {
    const signals = fakeSignals();
    let release = (): void => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let teardowns = 0;
    installTeardownHandlers({
      teardown: async () => {
        teardowns += 1;
        await blocked;
      },
      log: signals.log,
      die: signals.die,
      target: signals.target,
    });
    const first = signals.raise('SIGINT');
    const second = signals.raise('SIGINT');
    release();
    await Promise.all([first, second]);

    expect(teardowns).toBe(1);
    expect(signals.died).toEqual(['SIGINT']);
    expect(signals.lines.join('\n')).toContain('already running');
  });

  it('still exits on the signal when teardown itself throws — a handler may never wedge (AC6)', async () => {
    const signals = fakeSignals();
    installTeardownHandlers({
      teardown: async () => {
        throw new Error('rm -rf refused');
      },
      log: signals.log,
      die: signals.die,
      target: signals.target,
    });
    await signals.raise('SIGTERM');
    expect(signals.died).toEqual(['SIGTERM']);
    expect(signals.lines.join('\n')).toContain('rm -rf refused');
  });

  it('uninstalls its handlers when a run finishes normally, and exits nothing', async () => {
    const signals = fakeSignals();
    const { effects } = fakeEffects();
    await expect(
      runStaging({
        name: 'wingfoil',
        version: '0.2.0',
        tarball: 't.tgz',
        effects,
        interrupts: { target: signals.target, die: signals.die },
      }),
    ).resolves.toBe(0);
    expect(signals.installedFor()).toEqual([]);
    expect(signals.died).toEqual([]);
  });

  it('touches no real process handler when no `interrupts` option is given (AC7)', async () => {
    const counts = (): number[] => (TEARDOWN_SIGNALS as NodeJS.Signals[]).map((s) => process.listenerCount(s));
    const before = counts();
    // The load-bearing sample is taken MID-RUN. Comparing only before and after cannot fail: the
    // `finally` always uninstalls, so "never installed" and "installed then removed" look identical
    // from outside the call — arming the handlers unconditionally left all 29 cases green (reject
    // 8937a51, found by mutation). Sampling from inside a fake effect is what pins the property.
    const during: number[][] = [];
    const { effects } = fakeEffects();
    await expect(
      runStaging({
        name: 'wingfoil',
        version: '0.2.0',
        tarball: 't.tgz',
        effects: {
          ...effects,
          createToken: async (paths) => {
            during.push(counts());
            await effects.createToken(paths);
          },
          smoke: (env, version) => {
            during.push(counts());
            return effects.smoke(env, version);
          },
        },
      }),
    ).resolves.toBe(0);
    expect(during).toEqual([before, before]);
    expect(counts()).toEqual(before);
  });

  /**
   * reject `8937a51` — the start-up window. `runStaging` used to learn about the registry only from
   * `startRegistry`'s resolved value, but the child is spawned well before that and the readiness poll
   * sleeps 500 ms between probes. A signal landing in between tore down with `registry === undefined`:
   * `stop()` was never called, the orphan kept :4873, and the completion line still said the registry
   * had been stopped. Reproduced in the field on a real Verdaccio before this case was written.
   */
  describe('the start-up window (reject 8937a51)', () => {
    /** Effects whose `startRegistry` hands out its `stop` at spawn time, then blocks as a poll would. */
    function slowStartingRegistry(
      calls: string[],
      base: StagingEffects,
      duringPoll: () => Promise<void>,
    ): StagingEffects {
      return {
        ...base,
        startRegistry: async (paths, env, onSpawn) => {
          calls.push('spawnRegistry');
          onSpawn?.({
            stop: async () => {
              calls.push('stopRegistry');
            },
          });
          await duringPoll();
          calls.push('startRegistryResolved');
          return {
            stop: async () => {
              calls.push('stopRegistry');
            },
          };
        },
      };
    }

    it('stops a registry that is still coming up when the signal lands mid-poll', async () => {
      const signals = fakeSignals();
      const { effects, calls } = fakeEffects();
      let raised: Promise<void> | undefined;
      await runStaging({
        name: 'wingfoil',
        version: '0.2.0',
        tarball: 't.tgz',
        effects: slowStartingRegistry(calls, { ...effects, log: signals.log }, async () => {
          raised = signals.raise('SIGINT');
          await raised;
        }),
        interrupts: { target: signals.target, die: signals.die },
      });
      await raised;

      // The child was spawned and the poll had not returned — yet teardown stopped it exactly once.
      expect(calls).toContain('spawnRegistry');
      expect(calls.indexOf('stopRegistry')).toBeGreaterThanOrEqual(0);
      expect(calls.indexOf('stopRegistry')).toBeLessThan(calls.indexOf('startRegistryResolved'));
      expect(calls.filter((c) => c === 'stopRegistry')).toHaveLength(1);
      expect(signals.died).toEqual(['SIGINT']);
    });

    it('reports what teardown actually did, and says the registry was stopped only when it was', async () => {
      const signals = fakeSignals();
      const { effects, calls } = fakeEffects();
      let raised: Promise<void> | undefined;
      await runStaging({
        name: 'wingfoil',
        version: '0.2.0',
        tarball: 't.tgz',
        effects: slowStartingRegistry(calls, { ...effects, log: signals.log }, async () => {
          raised = signals.raise('SIGINT');
          await raised;
        }),
        interrupts: { target: signals.target, die: signals.die },
      });
      await raised;
      // The full ordered list, not just the phrase "registry stopped": the rejected version printed a
      // FIXED sentence that happened to contain that phrase, so asserting it alone stayed green
      // against the defect. What must be pinned is that the line is derived from what teardown did —
      // and the token step, which the fixed sentence never mentioned, is what proves derivation.
      expect(signals.lines.join('\n')).toContain('token removed, registry stopped, work dir removed');
    });

    it('does not claim a registry was stopped when none had been started', async () => {
      const signals = fakeSignals();
      const { effects, calls } = fakeEffects();
      let raised: Promise<void> | undefined;
      await runStaging({
        name: 'wingfoil',
        version: '0.2.0',
        effects: {
          ...effects,
          log: signals.log,
          // The signal lands while the tarball is being packed: nothing has been spawned yet.
          packTarball: (paths, env) => {
            raised = signals.raise('SIGINT');
            return effects.packTarball(paths, env);
          },
        },
        interrupts: { target: signals.target, die: signals.die },
      });
      await raised;
      expect(calls).not.toContain('stopRegistry');
      const said = signals.lines.join('\n');
      expect(said).toContain('no registry to stop');
      expect(said).not.toContain('registry stopped');
      expect(said).toContain('work dir removed');
    });
  });
});

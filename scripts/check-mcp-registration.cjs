#!/usr/bin/env node
/**
 * task-112-a-pinned-released-build-develops-wingfoil (`dl-095` Q2 (i), `dl-026`) — verify the MCP
 * server this repository's `.mcp.json` registers: that it is the pinned, published WingFoil build, and
 * that it advertises the channel set declared below.
 *
 * What it checks, in order:
 *
 *   1. the registration, statically: `.mcp.json` has a `mcpServers.wingfoil` entry whose arguments run
 *      the `mcp` command of the binary under `node_modules/wingfoil-released/`. The path is what tells
 *      the pinned build from the build under development — both report the same version between a
 *      release and the next bump — and `npx wingfoil` is not used because it runs this package's own
 *      `dist/cli.js` once that is built (measured in task-112's Execution Notes);
 *   2. the server, by starting it exactly as registered (from the repository root, over stdio) and
 *      reading the `initialize` handshake: `serverInfo.version` equals the version `package.json` pins
 *      (`"wingfoil-released": "npm:wingfoil@X.Y.Z"`);
 *   3. its channel set equals {@link EXPECTED_CHANNELS}, and every advertised channel answers its list
 *      request. This is `dl-026`'s re-verification: when a pin switch brings a build that advertises a
 *      different channel set, this check fails until the constant is updated on purpose;
 *   4. every static Resource it lists answers a read, and every Prompt it lists answers a get with no
 *      arguments (task-239, `bug-292`: listing alone passed while one of two Resources failed every read).
 *      A failure the pinned build is known to have is declared in {@link KNOWN_READ_FAILURES}, by version
 *      and URI, and named in the verdict; an entry that no longer applies — its read answers, or it names
 *      another version than the pin — fails the check, so it is removed when the pin advances;
 *   5. the build under development, `node dist/cli.js mcp` ({@link DEV_BUILD_ENTRY}), started from the same
 *      directory: every channel answers its list request and every listed Resource and Prompt answers, with
 *      no known failure allowed. It serves the Resources the pin does not have yet (`wingfoil://workflows/-/next`
 *      and `-/status`, task-239), so the check also reads what the next pin will serve. It needs
 *      `npm run build` first; a missing `dist/cli.js` fails the check, naming it.
 *
 * Offline: it spawns the build `npm ci` installed and the one `npm run build` wrote; nothing is fetched. Deterministic: fixed channel
 * order, and nothing in the verdict depends on a clock (the timeout only bounds a hung server).
 *
 * Usage: node scripts/check-mcp-registration.cjs [project-dir]      (`npm run check:mcp`)
 */
'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** The server name `.mcp.json` registers WingFoil under. */
const SERVER_NAME = 'wingfoil';

/** The devDependency alias that installs the pinned build (`dl-095` Q1 (a)). */
const PINNED_ALIAS = 'wingfoil-released';

/** Every channel an MCP server can advertise that WingFoil implements, in report order. */
const MCP_CHANNELS = Object.freeze(['prompts', 'resources', 'tools']);

/**
 * The channel set the pinned build is expected to advertise: Resources (P5.2.1, v0.1), Prompts
 * (P5.2.2, v0.2) and, from 0.3.0 (`task-174`, `bug-151`), an empty `tools` channel (`tools/list` → `[]`);
 * Tools themselves (P5.2.3) land in v0.4. The constant changes in the commit after a pin switch that
 * brings a different channel set (the switch commit itself touches only package.json and
 * package-lock.json, `release-planning`'s `advance-pinned-build`): the re-verification `dl-026` asks for.
 */
const EXPECTED_CHANNELS = Object.freeze(['prompts', 'resources', 'tools']);

/** Why 0.3.0 cannot read this repository's workflows (task-298, `dl-172` (a)): one reason for its three Resources. */
const MANUAL_CHECK_ON_0_3_0 =
  'task-298: 0.3.0 requires run on every check binding and refuses the { manual: true } check binding dl-172 (a) adds (demo.rendered in workflows/bindings.yaml); it ends when advance-pinned-build moves the pin to 0.3.1';

/**
 * The reads the pinned build is known to fail, by its version (task-239, `bug-292`). Each entry applies only
 * while `package.json` pins that version, and only while the read still fails: otherwise the check fails
 * and asks for the entry's removal (the `advance-pinned-build` re-verification, `dl-026`).
 *
 * @type {readonly import('./check-mcp-registration.cjs').KnownReadFailure[]}
 */
const KNOWN_READ_FAILURES = Object.freeze([
  Object.freeze({
    version: '0.3.0',
    uri: 'wingfoil://workflows',
    reason: MANUAL_CHECK_ON_0_3_0,
  }),
  Object.freeze({
    version: '0.3.0',
    uri: 'wingfoil://workflows/-/next',
    reason: MANUAL_CHECK_ON_0_3_0,
  }),
  Object.freeze({
    version: '0.3.0',
    uri: 'wingfoil://workflows/-/status',
    reason: MANUAL_CHECK_ON_0_3_0,
  }),
]);

/** The build under development, started from the project directory (task-239, `bug-292`). */
const DEV_BUILD_ENTRY = Object.freeze({ command: 'node', args: Object.freeze(['dist/cli.js', 'mcp']) });

/** How long a server may take to answer the handshake and the list requests. */
const TIMEOUT_MS = 20000;

/**
 * @param {import('./check-mcp-registration.cjs').McpRegistrationManifest} manifest
 * @returns {string | undefined}
 */
function pinnedVersion(manifest) {
  const spec = (manifest.devDependencies || {})[PINNED_ALIAS];
  const match = /^npm:wingfoil@(\d+\.\d+\.\d+)$/.exec(typeof spec === 'string' ? spec : '');
  return match === null ? undefined : match[1];
}

/**
 * @param {Readonly<Record<string, unknown>> | undefined} capabilities
 * @returns {string[]}
 */
function channelSet(capabilities) {
  return MCP_CHANNELS.filter((channel) => capabilities !== undefined && capabilities[channel] !== undefined);
}

/**
 * @param {import('./check-mcp-registration.cjs').McpConfig} config
 * @returns {string[]}
 */
function registrationProblems(config) {
  const entry = (config.mcpServers || {})[SERVER_NAME];
  if (entry === undefined) {
    return [`.mcp.json registers no "${SERVER_NAME}" server under mcpServers`];
  }
  const args = entry.args || [];
  const problems = [];
  const binary = `node_modules/${PINNED_ALIAS}/`;
  if (!args.some((arg) => arg.replace(/\\/g, '/').includes(binary))) {
    problems.push(
      `.mcp.json "${SERVER_NAME}" runs ${[entry.command, ...args].join(' ')}, not the pinned build under ${binary} (dl-095 Q2 (i))`,
    );
  }
  if (args[args.length - 1] !== 'mcp') {
    problems.push(`.mcp.json "${SERVER_NAME}" does not run the mcp command (its last argument is not "mcp")`);
  }
  return problems;
}

/**
 * The problems of an observed server's reads: each Resource read or Prompt get that failed, unless `known`
 * declares it (by URI), and each `known` entry whose read answered after all. A declared failure is returned
 * as a note, not a problem.
 *
 * @param {import('./check-mcp-registration.cjs').McpServerObservation} observed
 * @param {readonly import('./check-mcp-registration.cjs').KnownReadFailure[]} known
 * @returns {{ problems: string[], notes: string[] }}
 */
function readProblems(observed, known) {
  const problems = [];
  const notes = [];
  for (const [uri, outcome] of Object.entries(observed.resourceReads)) {
    const declared = known.find((entry) => entry.uri === uri);
    if (outcome === true) {
      if (declared !== undefined) {
        problems.push(
          `the read of ${uri} answers, but KNOWN_READ_FAILURES declares it failing on ${declared.version}: remove the entry from scripts/check-mcp-registration.cjs`,
        );
      }
    } else if (declared !== undefined) {
      notes.push(`known failure: the read of ${uri} fails (${declared.reason})`);
    } else {
      problems.push(`the Resource ${uri} is listed but its read failed: ${outcome.error}`);
    }
  }
  for (const entry of known) {
    if (!(entry.uri in observed.resourceReads)) {
      problems.push(`KNOWN_READ_FAILURES declares ${entry.uri} on ${entry.version}, but the server does not list it: remove the entry`);
    }
  }
  for (const [name, outcome] of Object.entries(observed.promptGets)) {
    if (outcome !== true) problems.push(`the Prompt ${name} is listed but its get failed: ${outcome.error}`);
  }
  return { problems, notes };
}

/**
 * @param {import('./check-mcp-registration.cjs').McpRegistrationManifest} manifest
 * @param {import('./check-mcp-registration.cjs').McpConfig} config
 * @param {import('./check-mcp-registration.cjs').McpServerObservation | { readonly error: string }} observed
 * @param {readonly string[]} [expectedChannels]
 * @param {readonly import('./check-mcp-registration.cjs').KnownReadFailure[]} [knownFailures]
 * @returns {import('./check-mcp-registration.cjs').McpRegistrationCheck}
 */
function evaluateRegistration(manifest, config, observed, expectedChannels = EXPECTED_CHANNELS, knownFailures = KNOWN_READ_FAILURES) {
  const problems = registrationProblems(config);
  const pin = pinnedVersion(manifest);
  if (pin === undefined) {
    problems.push(`package.json does not pin ${PINNED_ALIAS} as an exact npm:wingfoil@X.Y.Z devDependency`);
  }
  /** @type {string[]} */
  let notes = [];
  for (const entry of knownFailures) {
    if (entry.version !== pin) {
      problems.push(`KNOWN_READ_FAILURES declares a failure of ${entry.version}, but package.json pins ${pin}: remove the entry`);
    }
  }
  if ('error' in observed) {
    problems.push(`the registered server did not answer: ${observed.error}`);
  } else {
    if (pin !== undefined && observed.version !== pin) {
      problems.push(`the registered server reports version ${observed.version}, but package.json pins ${pin}`);
    }
    const got = observed.channels.join(', ');
    const want = expectedChannels.join(', ');
    if (got !== want) {
      problems.push(
        `the registered server advertises [${got}], expected [${want}]; if the pinned build changed its ` +
          'channels on purpose, update EXPECTED_CHANNELS in scripts/check-mcp-registration.cjs (dl-026)',
      );
    }
    for (const channel of observed.channels) {
      const listed = observed.lists[channel];
      if (typeof listed === 'object' && listed !== null) {
        problems.push(`the ${channel} channel is advertised but its list request failed: ${listed.error}`);
      }
    }
    const reads = readProblems(observed, knownFailures.filter((entry) => entry.version === pin));
    problems.push(...reads.problems);
    notes = reads.notes;
  }
  if (problems.length === 0 && !('error' in observed)) {
    const counts = observed.channels.map((channel) => `${channel}: ${observed.lists[channel]}`).join(', ');
    return {
      ok: true,
      message: [
        `.mcp.json "${SERVER_NAME}" runs the pinned wingfoil ${observed.version}, advertising [${observed.channels.join(', ')}] (${counts})`,
      ]
        .concat(notes.map((note) => `  - ${note}`))
        .join('\n'),
    };
  }
  return {
    ok: false,
    message: ['The registered MCP server is not the one this repository declares:', '']
      .concat(problems.map((problem) => `  - ${problem}`))
      .join('\n'),
  };
}

/**
 * Judge the build under development (task-239, `bug-292`): it answered, every advertised channel answered its
 * list, and every listed Resource read and Prompt get answered — no known failure is allowed here.
 *
 * @param {import('./check-mcp-registration.cjs').McpServerObservation | { readonly error: string }} observed
 * @returns {import('./check-mcp-registration.cjs').DevBuildCheck}
 */
function evaluateDevBuild(observed) {
  const label = `the build under development (${DEV_BUILD_ENTRY.args[0]})`;
  if ('error' in observed) return { problems: [`${label} did not answer: ${observed.error}`], summary: '' };
  const problems = [];
  for (const channel of observed.channels) {
    const listed = observed.lists[channel];
    if (typeof listed === 'object' && listed !== null) {
      problems.push(`${label}: the ${channel} channel is advertised but its list request failed: ${listed.error}`);
    }
  }
  problems.push(...readProblems(observed, []).problems.map((problem) => `${label}: ${problem}`));
  const counts = observed.channels.map((channel) => `${channel}: ${observed.lists[channel]}`).join(', ');
  return {
    problems,
    summary: `${label} serves [${observed.channels.join(', ')}] (${counts}); every listed Resource read and Prompt get answered`,
  };
}

/** The list request for each channel, and the field of its result that holds the items. */
const LISTS = Object.freeze({
  prompts: { method: 'listPrompts', field: 'prompts' },
  resources: { method: 'listResources', field: 'resources' },
  tools: { method: 'listTools', field: 'tools' },
});

/**
 * @param {string} dir
 * @param {import('./check-mcp-registration.cjs').McpServerEntry} entry
 * @returns {Promise<import('./check-mcp-registration.cjs').McpServerObservation>}
 */
async function observeServer(dir, entry) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({
    command: entry.command || 'node',
    args: [...(entry.args || [])],
    cwd: dir,
    env: { ...process.env, ...(entry.env || {}) },
    stderr: 'pipe',
  });
  let stderr = '';
  if (transport.stderr !== null) transport.stderr.on('data', (chunk) => (stderr += String(chunk)));
  const client = new Client({ name: 'check-mcp-registration', version: '1.0.0' });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
  });
  const session = (async () => {
    await client.connect(transport);
    const info = client.getServerVersion();
    const channels = channelSet(client.getServerCapabilities());
    /** @type {Record<string, number | { error: string }>} */
    const lists = {};
    /** @type {Record<string, unknown[]>} */
    const items = {};
    for (const channel of channels) {
      const { method, field } = LISTS[channel];
      try {
        items[channel] = (await client[method]())[field];
        lists[channel] = items[channel].length;
      } catch (error) {
        lists[channel] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    const message = (/** @type {unknown} */ error) => ({ error: error instanceof Error ? error.message : String(error) });
    // task-239 (bug-292): read every listed static Resource and get every listed Prompt, in listed order
    // sorted by URI / name, so a server that lists what it cannot serve is seen. Prompts are got with no
    // arguments; every WingFoil Prompt argument is optional (spec-004 §3.1).
    /** @type {Record<string, true | { error: string }>} */
    const resourceReads = {};
    const uris = (items.resources || []).map((/** @type {{ uri: string }} */ resource) => resource.uri).sort();
    for (const uri of uris) {
      try {
        await client.readResource({ uri });
        resourceReads[uri] = true;
      } catch (error) {
        resourceReads[uri] = message(error);
      }
    }
    /** @type {Record<string, true | { error: string }>} */
    const promptGets = {};
    const names = (items.prompts || []).map((/** @type {{ name: string }} */ prompt) => prompt.name).sort();
    for (const name of names) {
      try {
        await client.getPrompt({ name });
        promptGets[name] = true;
      } catch (error) {
        promptGets[name] = message(error);
      }
    }
    return { version: info === undefined ? undefined : info.version, channels, lists, resourceReads, promptGets };
  })();
  try {
    return await Promise.race([session, timeout]);
  } catch (error) {
    const said = stderr.trim();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(said === '' ? reason : `${reason} (server stderr: ${said})`, { cause: error });
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => undefined);
  }
}

/**
 * @param {string} dir
 * @param {readonly string[]} [expectedChannels]
 * @returns {Promise<import('./check-mcp-registration.cjs').McpRegistrationCheck>}
 */
async function checkMcpRegistration(dir, expectedChannels = EXPECTED_CHANNELS) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  const config = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
  const entry = (config.mcpServers || {})[SERVER_NAME];
  const observe = async (/** @type {import('./check-mcp-registration.cjs').McpServerEntry} */ server) => {
    try {
      return await observeServer(dir, server);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
  const registered = evaluateRegistration(manifest, config, entry === undefined ? { error: 'not registered' } : await observe(entry), expectedChannels);
  const devBuilt = existsSync(join(dir, DEV_BUILD_ENTRY.args[0]));
  const dev = evaluateDevBuild(devBuilt ? await observe(DEV_BUILD_ENTRY) : { error: `${DEV_BUILD_ENTRY.args[0]} is not built: run npm run build first` });
  if (registered.ok && dev.problems.length === 0) return { ok: true, message: `${registered.message}\n${dev.summary}` };
  const problems = dev.problems.map((problem) => `  - ${problem}`);
  if (registered.ok) {
    return { ok: false, message: ['The build under development does not serve what it lists:', ''].concat(problems).join('\n') };
  }
  return { ok: false, message: [registered.message].concat(problems).join('\n') };
}

if (require.main === module) {
  const dir = process.argv[2] || join(__dirname, '..');
  checkMcpRegistration(dir).then(
    (result) => {
      (result.ok ? process.stdout : process.stderr).write(`${result.message}\n`);
      process.exitCode = result.ok ? 0 : 1;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  SERVER_NAME,
  PINNED_ALIAS,
  MCP_CHANNELS,
  EXPECTED_CHANNELS,
  KNOWN_READ_FAILURES,
  DEV_BUILD_ENTRY,
  pinnedVersion,
  channelSet,
  registrationProblems,
  evaluateRegistration,
  evaluateDevBuild,
  observeServer,
  checkMcpRegistration,
};

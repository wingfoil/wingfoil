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
 *      new channel (P5.2.3 Tools, v0.4), this check fails until the constant is updated on purpose.
 *
 * Offline: it spawns the build `npm ci` installed; nothing is fetched. Deterministic: fixed channel
 * order, and nothing in the verdict depends on a clock (the timeout only bounds a hung server).
 *
 * Usage: node scripts/check-mcp-registration.cjs [project-dir]      (`npm run check:mcp`)
 */
'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** The server name `.mcp.json` registers WingFoil under. */
const SERVER_NAME = 'wingfoil';

/** The devDependency alias that installs the pinned build (`dl-095` Q1 (a)). */
const PINNED_ALIAS = 'wingfoil-released';

/** Every channel an MCP server can advertise that WingFoil implements, in report order. */
const MCP_CHANNELS = Object.freeze(['prompts', 'resources', 'tools']);

/**
 * The channel set the pinned build is expected to advertise: Resources (P5.2.1, v0.1) and Prompts
 * (P5.2.2, v0.2). From the first build that carries `task-174` (`bug-151`), the server also declares an
 * empty `tools` channel (`tools/list` → `[]`), and Tools themselves (P5.2.3) land in v0.4 — update this
 * constant in the commit that moves the pin to a build that advertises `tools`, which is the
 * re-verification `dl-026` asks for.
 */
const EXPECTED_CHANNELS = Object.freeze(['prompts', 'resources']);

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
 * @param {import('./check-mcp-registration.cjs').McpRegistrationManifest} manifest
 * @param {import('./check-mcp-registration.cjs').McpConfig} config
 * @param {import('./check-mcp-registration.cjs').McpServerObservation | { readonly error: string }} observed
 * @param {readonly string[]} [expectedChannels]
 * @returns {import('./check-mcp-registration.cjs').McpRegistrationCheck}
 */
function evaluateRegistration(manifest, config, observed, expectedChannels = EXPECTED_CHANNELS) {
  const problems = registrationProblems(config);
  const pin = pinnedVersion(manifest);
  if (pin === undefined) {
    problems.push(`package.json does not pin ${PINNED_ALIAS} as an exact npm:wingfoil@X.Y.Z devDependency`);
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
  }
  if (problems.length === 0 && !('error' in observed)) {
    const counts = observed.channels.map((channel) => `${channel}: ${observed.lists[channel]}`).join(', ');
    return {
      ok: true,
      message: `.mcp.json "${SERVER_NAME}" runs the pinned wingfoil ${observed.version}, advertising [${observed.channels.join(', ')}] (${counts})`,
    };
  }
  return {
    ok: false,
    message: ['The registered MCP server is not the one this repository declares:', '']
      .concat(problems.map((problem) => `  - ${problem}`))
      .join('\n'),
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
    for (const channel of channels) {
      const { method, field } = LISTS[channel];
      try {
        lists[channel] = (await client[method]())[field].length;
      } catch (error) {
        lists[channel] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    return { version: info === undefined ? undefined : info.version, channels, lists };
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
  if (entry === undefined) return evaluateRegistration(manifest, config, { error: 'not registered' }, expectedChannels);
  let observed;
  try {
    observed = await observeServer(dir, entry);
  } catch (error) {
    observed = { error: error instanceof Error ? error.message : String(error) };
  }
  return evaluateRegistration(manifest, config, observed, expectedChannels);
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
  pinnedVersion,
  channelSet,
  registrationProblems,
  evaluateRegistration,
  observeServer,
  checkMcpRegistration,
};

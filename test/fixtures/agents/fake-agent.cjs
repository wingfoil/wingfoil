#!/usr/bin/env node
/**
 * The fake agent (`spec-016-agent-execution` §2.7, `adr-012` point 6, task-200): a Node script that
 * stands in for an agent CLI wherever no real agent can run — Jest, CI, the `e2e-smoke` gate. Two
 * CUSTOM adapter manifests declare it, `custom/fake.yaml` (`launch.interactive.terminal: optional`, the
 * success path) and `custom/fake-terminal.yaml` (`terminal: required`, the `NO_TERMINAL` refusal).
 *
 * It is self-contained on purpose: it requires Node built-ins only, so it runs wherever it is copied
 * (a fixture repository, a fresh `init` project), with no `node_modules` beside it. Its MCP client is
 * the stdio transport written by hand: newline-delimited JSON-RPC 2.0 on the server's stdin/stdout.
 *
 * Invocations (the argv the manifests declare):
 * - `--version` — prints {@link VERSION} (`version_args`).
 * - `--lookup <session-id>` — prints the declared JSON document for that session (`session.lookup_args`,
 *   `usage.lookup_args`).
 * - `--summary` — prints a one-line summary (`summary.export_args`).
 * - anything else is a launch: `[--headless] --mcp-config <file> (--prompt <text> | --prompt-file <file>)
 *   [--session-id <id>] [--resume <id>]`. A headless launch prints the declared JSON document on stdout
 *   when it ends (`launch.headless.output: json`).
 *
 * What it does is declared by the caller through environment variables (names below; their values are
 * the test's):
 * - `WINGFOIL_FAKE_AGENT_RECORD` — a file; every invocation appends ONE JSON line to it: its argv, its
 *   stdin (or `null` when not read), the NAMES of the environment variables it received, sorted, never
 *   their values (`REQ-SEC-08`), and, on a launch that connected, what the MCP server answered.
 * - `WINGFOIL_FAKE_AGENT_CONNECT=1` — on a launch, connect to the `wingfoil` server named in the MCP
 *   config, complete `initialize`, and get the Prompt the bootstrap's context instruction names, with
 *   its `element` and `state` arguments (§2.4). The Prompt's text is recorded verbatim.
 * - `WINGFOIL_FAKE_AGENT_STDIN=1` — read stdin to its end and record it. Off by default: an interactive
 *   agent owns stdin, and an inherited pipe nobody closes would never end.
 * - `WINGFOIL_FAKE_AGENT_DOCUMENT` — the JSON document to print for `--lookup` and a headless launch,
 *   instead of {@link defaultDocument}; a document without `session_id` gets the session asked for.
 * - `WINGFOIL_FAKE_AGENT_EXIT` — a launch's exit code (default `0`).
 * - `WINGFOIL_FAKE_AGENT_WAIT=signal` — a launch, after recording, waits until a signal kills it.
 * - `WINGFOIL_FAKE_AGENT_LOOKUP=fail|hang` — `--lookup`, after recording, exits `1` with nothing on
 *   stdout (`fail`), or waits until a signal kills it (`hang`): a post-run lookup that fails or times
 *   out while the launch succeeded (`spec-016` §2.6).
 *
 * `EXIT` and `WAIT` apply to a launch only. `agent execute` passes its environment to every child it
 * starts (§2.2), so the post-run `--version` and `--lookup` (§3.3 step 16) see the same variables, and
 * must still answer.
 *
 * Nothing here is random or read from the clock, and nothing secret-shaped is written as a literal.
 */
'use strict';

const { spawn } = require('child_process');
const { appendFileSync, readFileSync } = require('fs');

/** What `--version` prints, and what the manifests' `verified_with` names. */
const VERSION = 'fake-agent 1.0.0';

/** The MCP protocol revision the fake asks for; the SDK the server is built on supports it. */
const PROTOCOL_VERSION = '2025-06-18';

/** How long the whole MCP exchange may take before the fake gives up. */
const MCP_TIMEOUT_MS = 30000;

/**
 * `spec-016` §2.4's context instruction, as the bootstrap carries it. The fake acts on it as a real
 * agent must: it reads the Prompt name and both arguments out of the text it was given.
 */
const CONTEXT_INSTRUCTION_RE = /Get the MCP prompt "([^"]+)" with arguments element="([^"]+)" and state="([^"]+)"\./;

/** The value following `flag` in `argv`, or `undefined`. */
function option(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** The document `--lookup` and a headless launch print when the caller declares none. */
function defaultDocument(sessionId) {
  return {
    session_id: sessionId,
    model: 'fake-model',
    usage: { input: 120, output: 45, cache_read: 10, cache_write: 5 },
  };
}

/** The declared document, its `session_id` set to the one asked for when the caller left it out. */
function documentFor(sessionId) {
  const declared = process.env.WINGFOIL_FAKE_AGENT_DOCUMENT;
  if (declared === undefined) return defaultDocument(sessionId);
  const document = JSON.parse(declared);
  return 'session_id' in document ? document : { ...document, session_id: sessionId };
}

/** Keep the process alive until a signal ends it; the timer only keeps the event loop busy. */
function waitForSignal() {
  setInterval(() => undefined, 60000);
}

/** Stdin to its end, as UTF-8 text. */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

/** Append one JSON line to the record file, when the caller named one. */
function record(entry) {
  const file = process.env.WINGFOIL_FAKE_AGENT_RECORD;
  if (file === undefined || file === '') return;
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

/**
 * Talk to the `wingfoil` server of `configFile` over stdio: `initialize`, the `initialized`
 * notification, then `prompts/get` for `prompt` with `args`. Resolves with what the server answered;
 * a JSON-RPC error is an answer too (recorded, not thrown).
 */
function fetchPrompt(configFile, prompt, args) {
  const config = JSON.parse(readFileSync(configFile, 'utf-8'));
  const server = config.mcpServers && config.mcpServers.wingfoil;
  if (!server || typeof server.command !== 'string' || !Array.isArray(server.args)) {
    return Promise.reject(new Error(`no "wingfoil" server with a command and args in ${configFile}`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const pending = new Map();
    let buffered = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`MCP exchange timed out after ${MCP_TIMEOUT_MS} ms`)), MCP_TIMEOUT_MS);
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    const request = (id, method, params) =>
      new Promise((done) => {
        pending.set(id, done);
        send({ id, method, params });
      });

    child.on('error', (error) => finish(error));
    child.on('exit', (code, signal) => {
      finish(new Error(`MCP server exited (${signal ?? code}) before answering: ${stderr.trim()}`));
    });
    // Decoded as streams, so a multi-byte character split across two chunks stays one character.
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      buffered += chunk;
      let newline;
      while (!settled && (newline = buffered.indexOf('\n')) !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line === '') continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          finish(new Error(`non-JSON line from server: ${line}`));
          return;
        }
        const done = pending.get(message.id);
        if (done === undefined) continue; // a notification, or an answer nobody asked for
        pending.delete(message.id);
        done(message);
      }
    });

    (async () => {
      const initialized = await request(1, 'initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'wingfoil-fake-agent', version: VERSION },
      });
      if (initialized.error) return finish(null, { initialize: initialized.error });
      send({ method: 'notifications/initialized' });
      const answer = await request(2, 'prompts/get', { name: prompt, arguments: args });
      const result = { server: initialized.result.serverInfo, prompt: { name: prompt, arguments: args } };
      if (answer.error) return finish(null, { ...result, error: { code: answer.error.code, message: answer.error.message } });
      const [first] = answer.result.messages;
      finish(null, {
        ...result,
        text: first && first.content && first.content.type === 'text' ? first.content.text : null,
        ...(answer.result.warnings === undefined ? {} : { warnings: answer.result.warnings }),
      });
    })().catch((error) => finish(error));
  });
}

/** One launch: record, optionally connect, then print the headless document. Returns the exit code. */
async function launch(argv, stdin) {
  const bootstrapFile = option(argv, '--prompt-file');
  const bootstrap = option(argv, '--prompt') ?? (bootstrapFile === undefined ? stdin : readFileSync(bootstrapFile, 'utf-8'));
  const sessionId = option(argv, '--session-id') ?? option(argv, '--resume') ?? null;
  let mcp = null;
  let failure = null;
  if (process.env.WINGFOIL_FAKE_AGENT_CONNECT === '1') {
    const instruction = bootstrap === undefined || bootstrap === null ? null : CONTEXT_INSTRUCTION_RE.exec(bootstrap);
    const configFile = option(argv, '--mcp-config');
    if (instruction === null) failure = 'the bootstrap names no MCP prompt to get (spec-016 §2.4)';
    else if (configFile === undefined) failure = 'no --mcp-config was given';
    else {
      try {
        mcp = await fetchPrompt(configFile, instruction[1], { element: instruction[2], state: instruction[3] });
      } catch (error) {
        failure = error.message;
      }
    }
  }
  record({ argv, stdin, env: Object.keys(process.env).sort(), mcp, ...(failure === null ? {} : { failure }) });
  if (failure !== null) {
    process.stderr.write(`fake-agent: ${failure}\n`);
    return 1;
  }
  if (argv.includes('--headless')) process.stdout.write(`${JSON.stringify(documentFor(sessionId))}\n`);
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const stdin = process.env.WINGFOIL_FAKE_AGENT_STDIN === '1' ? await readStdin() : null;

  if (argv.includes('--version')) {
    record({ argv, stdin, env: Object.keys(process.env).sort(), mcp: null });
    process.stdout.write(`${VERSION}\n`);
  } else if (argv.includes('--lookup')) {
    record({ argv, stdin, env: Object.keys(process.env).sort(), mcp: null });
    const lookup = process.env.WINGFOIL_FAKE_AGENT_LOOKUP;
    if (lookup === 'hang') return waitForSignal();
    if (lookup === 'fail') {
      process.stderr.write('fake-agent: lookup failed (WINGFOIL_FAKE_AGENT_LOOKUP=fail)\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(documentFor(option(argv, '--lookup') ?? null))}\n`);
  } else if (argv.includes('--summary')) {
    record({ argv, stdin, env: Object.keys(process.env).sort(), mcp: null });
    process.stdout.write('fake-agent: session summary\n');
  } else {
    // Only a launch reads EXIT and WAIT (review F1).
    const failed = await launch(argv, stdin);
    if (failed !== null) process.exitCode = failed;
    else if (process.env.WINGFOIL_FAKE_AGENT_WAIT === 'signal') waitForSignal();
    else process.exitCode = Number(process.env.WINGFOIL_FAKE_AGENT_EXIT ?? '0');
  }
}

main().catch((error) => {
  process.stderr.write(`fake-agent: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});

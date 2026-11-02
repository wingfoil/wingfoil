/**
 * task-309 (`bug-251`) — the three paths of `ConfigFileUnreadableError` the red tests leave unpinned
 * (the qa's notes): `EPERM` (no portable trigger on disk, so `readDocument` is steered to throw it), the
 * Workflow pillar's `workflows/bindings.yaml` reader, and the MCP `prompts/get` handler over an unreadable
 * `roles.yaml`. Each names the file repository-relative and the cause, never the host path nor Node's raw
 * text (design gate, approver, 2026-10-30: D4 as written, D5 (a)).
 */
import { mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CORE_MODULES, coreErrorOf, initWingfoilProject, loadDnaYaml, loadWorkflowsYaml } from '../../src/core';
import type { CoreFn } from '../../src/core/registry';
import { registerRolePrompts } from '../../src/mcp';
import { makeTempGitRepo, removeTempDir } from '../storage/helpers/git-fixture';

/** Armed only around the read under test, so the scaffold reads and writes for real. */
let eperm = false;

jest.mock('../../src/storage', () => {
  const actual = jest.requireActual<typeof import('../../src/storage')>('../../src/storage');
  return {
    ...actual,
    readDocument: (absolutePath: string): string => {
      if (eperm && absolutePath.endsWith('dna.yaml')) {
        throw Object.assign(new Error(`EPERM: operation not permitted, open '${absolutePath}'`), { code: 'EPERM' });
      }
      return actual.readDocument(absolutePath);
    },
  };
});

const RAW_NODE_TEXT = ['operation not permitted', 'illegal operation on a directory', 'too many symbolic links', 'EISDIR', 'EPERM'];

function expectNamedRelative(repo: string, text: string): void {
  expect(text).not.toContain(repo);
  expect(text).not.toContain(realpathSync(repo));
  for (const raw of RAW_NODE_TEXT) expect(text).not.toContain(raw);
}

function caught(load: () => unknown): { name: string; relativePath: string; code: string; message: string } {
  try {
    load();
  } catch (error) {
    return error as { name: string; relativePath: string; code: string; message: string };
  }
  throw new Error('expected the load to throw');
}

describe('ConfigFileUnreadableError — the paths the red tests leave unpinned (task-309, bug-251)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });

  afterEach(() => {
    eperm = false;
    removeTempDir(repo);
  });

  it('EPERM on dna.yaml: "<rel> cannot be read: permission denied", IO, and `dna show` refuses with it (exit 1)', async () => {
    eperm = true;

    const error = caught(() => loadDnaYaml(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe('.wingfoil/dna.yaml');
    expect(error.code).toBe('EPERM');
    expect(error.message).toBe('.wingfoil/dna.yaml cannot be read: permission denied');
    expectNamedRelative(repo, error.message);
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });

    const dnaShow = CORE_MODULES.find((module) => module.name === 'dna')?.operations.dnaShow?.fn as CoreFn<unknown, unknown>;
    await expect(dnaShow({ root: repo })).resolves.toEqual({
      ok: false,
      error: { code: 'IO', message: '.wingfoil/dna.yaml cannot be read: permission denied' },
    });
  });

  it('workflows/bindings.yaml is a directory: loadWorkflowsYaml refuses it named relative, IO', () => {
    const bindings = join(repo, '.wingfoil', 'workflows', 'bindings.yaml');
    rmSync(bindings, { force: true });
    mkdirSync(bindings);

    const error = caught(() => loadWorkflowsYaml(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe('.wingfoil/workflows/bindings.yaml');
    expect(error.code).toBe('EISDIR');
    expect(error.message).toBe('.wingfoil/workflows/bindings.yaml is a directory, not a file');
    expectNamedRelative(repo, error.message);
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
  });

  it('MCP prompts/get over a roles.yaml that is a directory rejects with "<rel> is a directory, not a file"', async () => {
    const roles = join(repo, '.wingfoil', 'roles.yaml');
    rmSync(roles);
    mkdirSync(roles);
    const server = new McpServer({ name: 'wingfoil-test', version: '0.0.0' });
    registerRolePrompts(server, { resolveRoot: () => repo, roles: ['developer'] });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'wingfoil-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const rejection: unknown = await client.getPrompt({ name: 'developer-session' }).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(rejection).toBeInstanceOf(Error);
    const { message, data } = rejection as { message: string; data?: unknown };
    expect(message).toContain('.wingfoil/roles.yaml is a directory, not a file');
    expectNamedRelative(repo, JSON.stringify({ message, data }));
    await client.close();
  });
});

/**
 * Review fix (task-309): the Workflow pillar's working-tree reader used an `existsSync` pre-check, false
 * for a symbolic-link loop, so a looping manifest read as an empty registry and a looping include as
 * `E_WORKFLOW_FILE_NOT_FOUND`. A loop is unreadable, not absent; a dangling link stays absent.
 */
describe('loadWorkflowsYaml — a looping workflows file is unreadable, not absent (task-309 review)', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempGitRepo();
    const scaffolded = initWingfoilProject(repo, 'Scrum');
    if (!scaffolded.ok) throw new Error(`fixture bug: wingfoil init failed — ${scaffolded.error.message}`);
  });

  afterEach(() => removeTempDir(repo));

  it('the manifest workflows.yaml a symbolic link to itself: "<rel> cannot be read (ELOOP)", IO', () => {
    rmSync(join(repo, '.wingfoil', 'workflows.yaml'));
    symlinkSync('workflows.yaml', join(repo, '.wingfoil', 'workflows.yaml'));

    const error = caught(() => loadWorkflowsYaml(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe('.wingfoil/workflows.yaml');
    expect(error.code).toBe('ELOOP');
    expect(error.message).toBe('.wingfoil/workflows.yaml cannot be read (ELOOP)');
    expectNamedRelative(repo, error.message);
    expect(coreErrorOf(error)).toEqual({ code: 'IO', message: error.message });
  });

  it('an included file (workflows/custom/bug-ingest.yaml) a symbolic link to itself: ELOOP, not E_WORKFLOW_FILE_NOT_FOUND', () => {
    const included = join(repo, '.wingfoil', 'workflows', 'custom', 'bug-ingest.yaml');
    rmSync(included);
    symlinkSync('bug-ingest.yaml', included);

    const error = caught(() => loadWorkflowsYaml(repo));

    expect(error.name).toBe('ConfigFileUnreadableError');
    expect(error.relativePath).toBe('.wingfoil/workflows/custom/bug-ingest.yaml');
    expect(error.code).toBe('ELOOP');
    expect(error.message).toBe('.wingfoil/workflows/custom/bug-ingest.yaml cannot be read (ELOOP)');
    expectNamedRelative(repo, error.message);
  });

  it('an included file that is a dangling symbolic link stays absent: E_WORKFLOW_FILE_NOT_FOUND', () => {
    const included = join(repo, '.wingfoil', 'workflows', 'custom', 'bug-ingest.yaml');
    rmSync(included);
    symlinkSync('no-such-file.yaml', included);

    const error = caught(() => loadWorkflowsYaml(repo)) as unknown as { diagnostics: { code: string; message: string }[] };

    expect(error.diagnostics.map(({ code }) => code)).toContain('E_WORKFLOW_FILE_NOT_FOUND');
    expect(error.diagnostics.find(({ code }) => code === 'E_WORKFLOW_FILE_NOT_FOUND')?.message).toBe(
      'included workflow file not found: workflows/custom/bug-ingest.yaml',
    );
  });
});

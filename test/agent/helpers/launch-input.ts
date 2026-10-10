/**
 * task-228 — a scratch repository and a hand-built `LaunchInput` for `launchAgent` (`src/agent/launch.ts`),
 * with small agent and lookup scripts the tests point a manifest at: `agent-ok.cjs` (exits 0),
 * `silent.cjs` (prints nothing), `not-json.cjs`, `killed.cjs` (ends itself by SIGKILL),
 * `number-session.cjs` (prints `{"sid": 5}`), `fails.cjs` (exits 1) and `both.cjs` (prints a session id and
 * one count, and appends a line to `lookups.log` each time it runs).
 */
import type { AdapterManifest, LaunchInput } from '../../../src/agent';
import { commitAll, git, makeTempGitRepo, writeFixtureFile } from '../../storage/helpers/git-fixture';

const ELEMENT_ID = 'task-001-hand';

const SCRIPTS: Readonly<Record<string, string>> = {
  'scripts/agent-ok.cjs': 'process.exitCode = 0;\n',
  'scripts/silent.cjs': '\n',
  'scripts/not-json.cjs': "process.stdout.write('not json\\n');\n",
  'scripts/killed.cjs': "process.kill(process.pid, 'SIGKILL');\n",
  'scripts/number-session.cjs': "process.stdout.write(JSON.stringify({ sid: 5 }) + '\\n');\n",
  'scripts/fails.cjs': 'process.exitCode = 1;\n',
  'scripts/both.cjs':
    "require('fs').appendFileSync('lookups.log', 'run\\n'); process.stdout.write(JSON.stringify({ sid: 's-9', tokens: { in: 7 } }) + '\\n');\n",
};

/** The base manifest: `node scripts/agent-ok.cjs`, nothing looked up. */
const BASE: AdapterManifest = {
  name: 'hand',
  format: 1,
  command: 'node',
  launch: { interactive: { args: ['scripts/agent-ok.cjs'], terminal: 'optional' } },
  prompt: { via: 'arg' },
  mcp: { via: 'config-file', template: '{}' },
  session: { id: 'none', resume: { supported: false } },
  usage: { from: 'none' },
} as AdapterManifest;

/** A committed scratch repository with the scripts and one task, and the launch input for it. */
export function launchFixture(edit: (manifest: AdapterManifest) => AdapterManifest): { root: string; input: LaunchInput } {
  const root = makeTempGitRepo();
  for (const [path, text] of Object.entries(SCRIPTS)) writeFixtureFile(root, path, text);
  writeFixtureFile(root, `docs/tasks/${ELEMENT_ID}.md`, `---\nid: ${ELEMENT_ID}\ntype: task\n---\n\n## Execution Notes\n`);
  commitAll(root, 'seed launch fixture');
  const stateRef = git(root, ['rev-parse', 'HEAD']).trim();
  return {
    root,
    input: {
      runId: `${ELEMENT_ID}/adhoc/1`,
      element: `task:${ELEMENT_ID}`,
      workflow: 'n/a',
      phase: 'adhoc',
      role: 'developer',
      mode: 'fresh',
      agent: { name: 'Hand Agent' },
      adapter: { name: 'hand', kind: 'custom', manifest: edit(BASE) },
      stateRef,
      logPath: `docs/runs/${ELEMENT_ID}.jsonl`,
      elementPath: `docs/tasks/${ELEMENT_ID}.md`,
      templatePath: undefined,
      bootstrap: 'bootstrap\n',
      mcpServer: { command: process.execPath, args: ['cli.js', 'mcp'] },
      files: {},
    },
  };
}

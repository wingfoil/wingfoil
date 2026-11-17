/**
 * task-337 AC 1 (red-first; `spec-016` §2.8 "The usage of the built-ins" and the headless table, as amended at
 * `2d193b318`; `dl-188` part 1 (c); approver ruling D6 (a), on the by-hand checks H1/H2 recorded in the task's design
 * gate note, Claude Code `2.1.322`) — each shipped built-in, parsed as a built-in, declares its usage sources:
 *
 * - `claude-code`: `usage.from: [transcript, output]`; `usage.transcript` = `path:
 *   "{home}/.claude/projects/{launch_dir_slug}/{session_id}.jsonl"`, `select: { field: type, equals: assistant }`,
 *   `message_id: message.id`, `fields` the message's model and its four usage counts; `usage.fields` the headless
 *   result's four counts, no model path; and its headless launch `[-p, "{bootstrap}", --output-format, json,
 *   --mcp-config, "{mcp_config_file}"]` with `output: json`;
 * - `codex-cli`: `usage.from: none`, no `usage.transcript`, its headless launch unchanged (`output: jsonl`).
 *
 * That this repository's installed `claude-code.yaml` still equals the shipped entry is
 * `test/storage/builtin-adapter-claude-code.test.ts`'s. Expected red: today `claude-code` declares `usage.from: none`
 * and `output: none`, and the schema has no `usage.transcript`.
 */
import { parseAdapterManifest } from '../../src/agent';
import { BUILTIN_ADAPTERS, BUILTIN_ADAPTERS_DIR } from '../../src/storage';

function parsed(name: string): ReturnType<typeof parseAdapterManifest> {
  const entry = BUILTIN_ADAPTERS.find((adapter) => adapter.name === name);
  if (entry === undefined) throw new Error(`no built-in ${name}`);
  return parseAdapterManifest(entry.content, { name, kind: 'built-in', file: `${BUILTIN_ADAPTERS_DIR}/${name}.yaml` });
}

describe('task-337 AC 1 — the built-ins declare their usage sources (spec-016 §2.8)', () => {
  it('claude-code: usage.from [transcript, output], the transcript block and the headless result fields, exactly as amended §2.8', () => {
    expect(parsed('claude-code').usage).toEqual({
      from: ['transcript', 'output'],
      transcript: {
        path: '{home}/.claude/projects/{launch_dir_slug}/{session_id}.jsonl',
        select: { field: 'type', equals: 'assistant' },
        message_id: 'message.id',
        fields: {
          model: 'message.model',
          input: 'message.usage.input_tokens',
          output: 'message.usage.output_tokens',
          cache_read: 'message.usage.cache_read_input_tokens',
          cache_write: 'message.usage.cache_creation_input_tokens',
        },
      },
      fields: {
        input: 'usage.input_tokens',
        output: 'usage.output_tokens',
        cache_read: 'usage.cache_read_input_tokens',
        cache_write: 'usage.cache_creation_input_tokens',
      },
    });
  });

  it('claude-code: the headless launch prints one JSON document, --output-format json after the prompt, output: json', () => {
    const headless = parsed('claude-code').launch.headless;
    expect(headless?.args).toEqual(['-p', '{bootstrap}', '--output-format', 'json', '--mcp-config', '{mcp_config_file}']);
    expect(headless?.output).toBe('json');
  });

  it('claude-code: verified_with names the version the by-hand checks H1/H2 ran', () => {
    expect(parsed('claude-code').verified_with).toBe('2.1.322 (Claude Code)');
  });

  it('codex-cli: usage.from none and no transcript; its headless output stays jsonl', () => {
    const manifest = parsed('codex-cli');
    expect(manifest.usage).toEqual({ from: 'none' });
    expect(manifest.launch.headless?.output).toBe('jsonl');
  });
});

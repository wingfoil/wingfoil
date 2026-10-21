---
id: "bug-034-mcp-error-prefix-doubled"
type: bug
title: "SDK-raised MCP errors carry the `MCP error <code>:` prefix in the wire message, so clients show it twice"
status: triaged
severity: "low"
release-origin: "v0.2"
release: ""
feature: "P5.2.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

When the MCP SDK itself raises an error on WingFoil's server (unknown Resource URI, unknown Prompt
name), it throws `McpError`, whose constructor bakes `MCP error <code>: ` into `message`. The server
sends that prefixed string as the JSON-RPC `error.message`, and the SDK client wraps it in a second
`McpError`, so a caller reads `MCP error -32602: MCP error -32602: Resource wingfoil://nope not found`.

## Steps to Reproduce

On `main` (`8a6a091`), `@modelcontextprotocol/sdk@1.29.0` (`node_modules/@modelcontextprotocol/sdk/package.json`):

1. `sed -n 2067,2073p node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` →
   `class McpError extends Error { constructor(code, message, data) { super(\`MCP error ${code}: ${message}\`); …`
2. Connect a real SDK `Client` over `InMemoryTransport` to `main`'s production
   `createMcpServer({ resolveRoot })` (`dist/mcp/server.js`), intercepting the server transport's
   `send`, and call `client.readResource({ uri: 'wingfoil://nope' })`:
   - on the wire: `{"code":-32602,"message":"MCP error -32602: Resource wingfoil://nope not found"}`
   - thrown at the client: `"MCP error -32602: MCP error -32602: Resource wingfoil://nope not found"`
3. The same with a bare `McpServer` that registers one prompt, calling `client.getPrompt({ name: 'nope' })`
   → client message `"MCP error -32602: MCP error -32602: Prompt nope not found"` — pure SDK behaviour,
   no WingFoil code on the path.

## Expected Behavior

The wire `error.message` is the reason alone (`Resource wingfoil://nope not found`); the code travels
in `error.code`. A client then renders exactly one prefix.

## Actual Behavior

Every SDK-generated refusal carries a redundant prefix on the wire and a doubled one at an SDK client.
WingFoil-authored errors are not affected when thrown as plain `Error` objects with a `code`.

## Notes

- **Why it matters beyond cosmetics.** `spec-004` pins exact refusal strings (e.g. §2.3
  `resources are read-only`; BDD `P5.2.2` `no prompt for undefined role '<role>'`). Any refusal routed
  through `McpError` would reach a conforming client with a prefix baked into the message, so exact
  string matches would fail.
- **The task-058 branch already works around it** for its own refusals:
  `git show 3f27d98:src/mcp/prompt.ts` lines 70-72 build `Object.assign(new Error(message), { code: ErrorCode.InvalidParams })`
  rather than an `McpError`, and its test pins the single-prefix client message
  (`test/mcp/mcp-prompts.feature.test.ts:150`: `"MCP error -32602: no prompt for undefined role 'wizard'"`).
  The SDK's own not-found paths (`Resource … not found`, and `Prompt … not found` on the high-level
  API) remain doubled.
- **Fix options, for triage:** (1) accept as upstream SDK behaviour and document that clients should
  match on `error.code` plus a suffix; (2) handle the unknown-URI / unknown-name paths in WingFoil's own
  handlers (as task-058 does for prompts) so the wire message is clean; (3) report upstream.
- Related: `dl-048` (the undefined-role refusal's code and message are unspecified in `spec-004` §3).

## Triage & Execution Notes

- capture: raised during the implementation of `task-058-mcp-prompts-role-based` (Wave 2, 2026-09-17)
  and reproduced on `main` without that branch's code; filed under
  `bug-ingest-rel-v0.2-wave2-review-findings-plan`. Severity `low`: message text only; codes are correct.

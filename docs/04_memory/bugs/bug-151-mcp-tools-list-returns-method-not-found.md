---
id: "bug-151-mcp-tools-list-returns-method-not-found"
type: bug
title: "The MCP server declares only `resources`/`prompts` capabilities; a `tools/list` request fails with a JSON-RPC protocol error instead of returning an empty list"
status: in-review
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.2.3"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`wingfoil mcp`'s `initialize` response advertises `{"resources":{...},"prompts":{}}` and no `tools`
capability, which is consistent with P5.2.3 (MCP Tools) not shipping yet. But a client that still
calls `tools/list` — a routine capability probe, or one that does not first branch on the
`capabilities` object — gets back a raw JSON-RPC method-not-found error rather than the empty-list
response the MCP spec expects from a server that legitimately has no tools.

## Steps to Reproduce

Reproduced against `wingfoil@0.2.1`, any fresh project:

1. Start the server and send `initialize` then `tools/list` over stdio:
   ```
   { echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"repro","version":"0"}}}';
     sleep 0.3;
     echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'; sleep 0.3;
   } | wingfoil mcp
   ```
2. Result:
   ```
   {"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}
   {"result":{"protocolVersion":"2024-11-05","capabilities":{"resources":{"listChanged":true},"prompts":{}},"serverInfo":{"name":"wingfoil","version":"0.2.1"}},"jsonrpc":"2.0","id":1}
   ```
   (order as received on stdout — `tools/list`'s error arrived before `initialize`'s own result in
   this run, but both are present and the `tools/list` reply is unambiguously a protocol-level
   error, not a data payload.)
3. `grep -n "registerCoreModules" src/mcp/server.ts` shows the module-level doc-comment explains the
   server "deliberately does NOT call `registerCoreModules`, which would advertise a mutating Tool for
   every [core module]" — Tools are intentionally unregistered in this version. `grep -n "ListTools"
   -r src/mcp/` finds no handler for the Tools-list method anywhere in `src/mcp/`, so the SDK's
   default behaviour for an unregistered method — the JSON-RPC `-32601` error — is what surfaces here.

## Expected Behavior

A server that has no Tools yet (P5.2.3 not shipped) still answers `tools/list` with
`{"result":{"tools":[]}}`, per the MCP spec's expectation that a listed-but-empty capability, or a
declared-absent one, still answers its own list method gracefully rather than erroring.

## Actual Behavior

`tools/list` returns a raw protocol error (`Method not found`), which a well-behaved client cannot
distinguish from "this server doesn't speak MCP correctly" versus "this server just has zero tools
right now."

## Notes

- Root cause: `createMcpServer` (`src/mcp/server.ts`) registers only the read-only Resources and
  Prompts channels and deliberately skips `registerCoreModules` (Tools are P5.2.3/v0.4 scope), and no
  handler answers the Tools-list method in the interim; the SDK's fallback for a request with no
  registered handler is the generic JSON-RPC method-not-found error.
- Gate: no gate exercises this — `dl-026-repo-versioned-mcp-server-config` (`ready`) is the
  decision-log naming MCP (P5.2) as the one pillar not yet dogfooded in this repository (no `.mcp.json`
  registers the server for any session here), so the server's day-to-day protocol behaviour under a
  real client is not exercised by any test that would catch this shape.
- Fix: register an explicit `tools/list` handler that returns `{ tools: [] }` until P5.2.3 ships real
  Tools, either by adding an (empty) `tools` capability and a matching handler, or by handling the
  request explicitly even while the capability itself stays undeclared.

## Triage & Execution Notes

- capture: filed by the v0.2 retrospective (retro-v0.2); reproduced independently over stdio against
  `wingfoil mcp`, unchanged from `0.2.1`.

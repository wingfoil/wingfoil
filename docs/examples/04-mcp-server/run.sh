#!/usr/bin/env bash
# Example 04 — talk to `wingfoil mcp` over stdio the way an MCP client does, and list what it exposes.
source "$(dirname "$0")/../lib.sh"
new_repo

step init --template Scrum
step memory add --type task --title "Wire the MCP server"

REQUESTS='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"resources/list"}
{"jsonrpc":"2.0","id":3,"method":"resources/templates/list"}
{"jsonrpc":"2.0","id":4,"method":"prompts/list"}
{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"wingfoil://memory/task"}}
{"jsonrpc":"2.0","id":6,"method":"resources/read","params":{"uri":"wingfoil://workflows/-/status"}}'

printf '\n$ wingfoil mcp   # fed seven JSON-RPC requests on stdin\n'
set +e; REPLIES=$(printf '%s\n' "$REQUESTS" | timeout 10 $WINGFOIL mcp 2>/dev/null); set -e

reply() { printf '%s\n' "$REPLIES" | node -e '
  const id = Number(process.argv[1]);
  const lines = require("fs").readFileSync(0, "utf8").trim().split("\n").map(JSON.parse);
  const r = lines.find((l) => l.id === id);
  console.log(eval(process.argv[2]));' "$1" "$2"; }

RESOURCES=$(reply 2 'r.result.resources.map(x=>x.uri).join(" ")')
TEMPLATES=$(reply 3 'r.result.resourceTemplates.map(x=>x.uriTemplate).join(" ")')
PROMPTS=$(reply 4 'r.result.prompts.map(x=>x.name).join(" ")')
TASKS=$(reply 5 'JSON.parse(r.result.contents[0].text).map(t=>t.id).join(" ")')
STATUS=$(reply 6 'JSON.parse(r.result.contents[0].text).message')
printf 'resources: %s\ntemplates: %s\nprompts:   %s\ntasks:     %s\nstatus:    %s\n' "$RESOURCES" "$TEMPLATES" "$PROMPTS" "$TASKS" "$STATUS"

assert_eq "$RESOURCES" "wingfoil://dna wingfoil://workflows wingfoil://workflows/-/next wingfoil://workflows/-/status" "static resources"
case " $TEMPLATES " in *" wingfoil://memory/{type}/{id} "*) ;; *) fail "memory.show template missing" ;; esac
case " $PROMPTS " in *" developer-session "*) ;; *) fail "developer-session prompt missing" ;; esac
assert_eq "$TASKS" "task-001-wire-the-mcp-server" "memory resource"
assert_eq "$STATUS" "$(wf workflow status --format json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).message)')" "workflow status resource"
assert_clean
done_ok "MCP server: resources, templates, role prompts, a Memory read, the workflow status"

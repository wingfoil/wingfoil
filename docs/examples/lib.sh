# Shared helpers for the runnable WingFoil examples. Sourced by each example's run.sh — not run directly.
#
# WINGFOIL selects the CLI under test: the installed `wingfoil` by default, or e.g.
#   WINGFOIL="node /path/to/wingfoil/dist/cli.js" ./run.sh
# Each example works in a fresh throwaway git repository that is deleted on exit.

set -euo pipefail

WINGFOIL="${WINGFOIL:-wingfoil}"

# Run the CLI (word-splitting WINGFOIL on purpose, so "node dist/cli.js" works).
wf() { $WINGFOIL "$@"; }

# Print a command as the reader would type it, then run it.
step() { printf '\n$ wingfoil %s\n' "$*"; wf "$@"; }

fail() { printf '\nFAIL: %s\n' "$*" >&2; exit 1; }

# expect_exit <code> <args...> — run `wingfoil <args...>`, require exit <code>, echo its combined output.
expect_exit() {
  local want=$1; shift
  local out got
  printf '\n$ wingfoil %s\n' "$*"
  set +e; out=$(wf "$@" 2>&1); got=$?; set -e
  printf '%s\n[exit %s]\n' "$out" "$got"
  [ "$got" -eq "$want" ] || fail "expected exit $want, got $got: wingfoil $*"
  LAST_OUTPUT=$out
}

# json_field <json> <js-expression over `d`> — evaluate with Node (always present: WingFoil needs it).
json_field() { node -e 'const d=JSON.parse(process.argv[1]); console.log(eval(process.argv[2]))' "$1" "$2"; }

# assert_eq <actual> <expected> <what>
assert_eq() { [ "$1" = "$2" ] || fail "$3: expected '$2', got '$1'"; }

# Create a throwaway git repository with a fixed identity, cd into it, delete it on exit.
new_repo() {
  EXAMPLE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/wingfoil-example-XXXXXX")
  trap 'rm -rf "$EXAMPLE_DIR"' EXIT
  cd "$EXAMPLE_DIR"
  git init --quiet --initial-branch=main
  git config user.name "Ada Lovelace"
  git config user.email "ada@example.com"
  git config commit.gpgsign false
}

# The working tree must be clean: every WingFoil write is exactly one commit.
assert_clean() { [ -z "$(git status --porcelain)" ] || fail "working tree not clean: $(git status --porcelain)"; }

# expect_head <subject> — the last command wrote exactly one commit with this subject, and nothing else is left.
expect_head() {
  assert_eq "$(git log -1 --format=%s)" "$1" "HEAD commit"
  assert_clean
}

done_ok() { printf '\nOK: %s\n' "$1"; }

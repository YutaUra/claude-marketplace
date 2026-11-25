#!/bin/bash
set -u
hook="$(cd "$(dirname "$0")" && pwd)/doc-drift-context.sh"
fail=0

assert() {
  local name="$1" cond="$2"
  if eval "$cond"; then echo "ok   - $name"; else echo "FAIL - $name"; fail=1; fi
}

run_in() {
  CLAUDE_PROJECT_DIR="$1" bash "$hook" </dev/null
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/with-claude-md" && touch "$tmp/with-claude-md/CLAUDE.md"
out=$(run_in "$tmp/with-claude-md"); code=$?
assert "CLAUDE.md があるとき方針文を出力する" '[ $code -eq 0 ] && [[ "$out" == *"既存コード"* ]]'

mkdir -p "$tmp/with-agents-md" && touch "$tmp/with-agents-md/AGENTS.md"
out=$(run_in "$tmp/with-agents-md")
assert "AGENTS.md だけでも方針文を出力する" '[[ "$out" == *"既存コード"* ]]'

mkdir -p "$tmp/with-rules/.claude/rules"
out=$(run_in "$tmp/with-rules")
assert ".claude/rules/ だけでも方針文を出力する" '[[ "$out" == *"既存コード"* ]]'

mkdir -p "$tmp/no-docs"
out=$(run_in "$tmp/no-docs"); code=$?
assert "AI 向け文書がないときは何も出力せず成功する" '[ $code -eq 0 ] && [ -z "$out" ]'

exit $fail

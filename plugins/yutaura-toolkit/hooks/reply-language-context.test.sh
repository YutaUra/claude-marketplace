#!/bin/bash
set -u
hook="$(cd "$(dirname "$0")" && pwd)/reply-language-context.sh"
fail=0

assert() {
  local name="$1" cond="$2"
  if eval "$cond"; then echo "ok   - $name"; else echo "FAIL - $name"; fail=1; fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

run() {
  printf '{"hook_event_name":"%s","tool_name":"Bash"}' "$3" |
    CLAUDE_CONFIG_DIR="$1" CLAUDE_PROJECT_DIR="$2" bash "$hook"
}

field() {
  printf '%s' "$1" | python3 -c 'import json,sys; d=json.load(sys.stdin)["hookSpecificOutput"]; print(d[sys.argv[1]])' "$2" 2>/dev/null
}

mkdir -p "$tmp/user" "$tmp/proj-none"
printf '{"language": "日本語"}' > "$tmp/user/settings.json"

out=$(run "$tmp/user" "$tmp/proj-none" PostToolUse); code=$?
assert "user settings の language を additionalContext として返す" '[ $code -eq 0 ] && [[ "$(field "$out" additionalContext)" == *"日本語"* ]]'
assert "PostToolUse の入力には hookEventName PostToolUse を返す" '[ "$(field "$out" hookEventName)" = "PostToolUse" ]'

out=$(run "$tmp/user" "$tmp/proj-none" PostToolUseFailure)
assert "PostToolUseFailure の入力には hookEventName PostToolUseFailure を返す" '[ "$(field "$out" hookEventName)" = "PostToolUseFailure" ]'

mkdir -p "$tmp/proj/.claude"
printf '{"language": "Deutsch"}' > "$tmp/proj/.claude/settings.json"
out=$(run "$tmp/user" "$tmp/proj" PostToolUse)
assert "project settings の language が user settings より優先される" '[[ "$(field "$out" additionalContext)" == *"Deutsch"* ]]'

mkdir -p "$tmp/proj-local/.claude"
printf '{"language": "Deutsch"}' > "$tmp/proj-local/.claude/settings.json"
printf '{"language": "français"}' > "$tmp/proj-local/.claude/settings.local.json"
out=$(run "$tmp/user" "$tmp/proj-local" PostToolUse)
assert "settings.local.json の language が最優先される" '[[ "$(field "$out" additionalContext)" == *"français"* ]]'

mkdir -p "$tmp/proj-nolang/.claude"
printf '{"model": "opus"}' > "$tmp/proj-nolang/.claude/settings.json"
out=$(run "$tmp/user" "$tmp/proj-nolang" PostToolUse)
assert "language を持たない settings は飛ばして次を見る" '[[ "$(field "$out" additionalContext)" == *"日本語"* ]]'

mkdir -p "$tmp/empty-user"
out=$(run "$tmp/empty-user" "$tmp/proj-none" PostToolUse); code=$?
assert "language が未設定なら何も出力せず成功する" '[ $code -eq 0 ] && [ -z "$out" ]'

mkdir -p "$tmp/broken"
printf '{not json' > "$tmp/broken/settings.json"
out=$(run "$tmp/broken" "$tmp/proj-none" PostToolUse); code=$?
assert "settings が壊れていても失敗せず何も出力しない" '[ $code -eq 0 ] && [ -z "$out" ]'

exit $fail

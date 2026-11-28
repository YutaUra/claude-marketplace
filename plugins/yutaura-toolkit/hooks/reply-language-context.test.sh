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
  printf '{"hook_event_name":"%s","tool_name":"%s"}' "$3" "${4:-Bash}" |
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

out=$(run "$tmp/user" "$tmp/proj-none" PostToolUse Poll); code=$?
assert "Poll の後は直前の REPL の分と重なるので何も出力しない" '[ $code -eq 0 ] && [ -z "$out" ]'

out=$(run "$tmp/user" "$tmp/proj-none" PostToolUse REPL)
assert "REPL の後は言語を言い直す" '[[ "$(field "$out" additionalContext)" == *"日本語"* ]]'

out=$(run "$tmp/user" "$tmp/proj-none" PostToolUse)
assert "language が日本語なら指示文を日本語で書き、最終報告も名指しする" '[[ "$(field "$out" additionalContext)" == *"最終報告"* ]] && [[ "$(field "$out" additionalContext)" != *"Reminder"* ]]'

mkdir -p "$tmp/user-en-name"
printf '{"language": "Japanese"}' > "$tmp/user-en-name/settings.json"
out=$(run "$tmp/user-en-name" "$tmp/proj-none" PostToolUse)
assert "language が英語表記の Japanese でも日本語の指示文にする" '[[ "$(field "$out" additionalContext)" == *"最終報告"* ]]'

out=$(run "$tmp/user" "$tmp/proj" PostToolUse)
assert "日本語以外の言語では英語の指示文で最終報告も名指しする" '[[ "$(field "$out" additionalContext)" == *"Deutsch"* ]] && [[ "$(field "$out" additionalContext)" == *"final report"* ]]'

mkdir -p "$tmp/evil"
printf 'import pathlib\npathlib.Path(%s).touch()\n' "'$tmp/pwned'" > "$tmp/evil/json.py"
(cd "$tmp/evil" && run "$tmp/user" "$tmp/evil" PostToolUse >/dev/null)
assert "カレントディレクトリに置かれた json.py を import しない" '[ ! -e "$tmp/pwned" ]'

exit $fail

#!/bin/bash
set -u
hook="$(cd "$(dirname "$0")" && pwd)/pr-conflict-watch.sh"
fail=0
seq=0

assert() {
  local name="$1" cond="$2"
  if eval "$cond"; then echo "ok   - $name"; else echo "FAIL - $name"; echo "      out: $out"; fail=1; fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export TMPDIR="$tmp/state"
mkdir -p "$TMPDIR" "$tmp/bin" "$tmp/repo"

# gh スタブ: mergeable は FAKE_STATES を 1 行ずつ返し（最終行を繰り返す、空行は API 失敗）、URL 解決は FAKE_PR_URL（空なら PR なし）
cat > "$tmp/bin/gh" <<'STUB'
#!/bin/bash
echo "$*" >> "$FAKE_GH_LOG"
case "$*" in
  *state,mergeable*)
    n=$(cat "$FAKE_STATES.pos" 2>/dev/null || echo 1)
    total=$(wc -l < "$FAKE_STATES" | tr -d ' ')
    [ "$n" -gt "$total" ] && n=$total
    echo $((n + 1)) > "$FAKE_STATES.pos"
    line=$(sed -n "${n}p" "$FAKE_STATES")
    [ -z "$line" ] && { echo "HTTP 502" >&2; exit 1; }
    echo "$line"
    ;;
  *)
    [ -z "${FAKE_PR_URL:-}" ] && { echo "no pull requests found" >&2; exit 1; }
    echo "$FAKE_PR_URL"
    ;;
esac
STUB
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"
export FAKE_GH_LOG="$tmp/gh.log"
export PR_CONFLICT_WATCH_INTERVAL=0
export PR_CONFLICT_WATCH_FRESH_INTERVAL=0
export PR_CONFLICT_WATCH_FRESH_SECONDS=300
export PR_CONFLICT_WATCH_MAX_SECONDS=30
export FAKE_PR_URL="https://github.com/o/r/pull/7"

states() {
  printf '%s\n' "$@" > "$tmp/states"
  rm -f "$tmp/states.pos"
  export FAKE_STATES="$tmp/states"
}

new_session() { seq=$((seq + 1)); session="s$seq"; : > "$FAKE_GH_LOG"; }

run_hook() {
  local cmd="$1" stdout="${2:-}"
  local input
  input=$(python3 -c '
import json, sys
print(json.dumps({"session_id": sys.argv[1], "cwd": sys.argv[2], "tool_name": "Bash",
                  "tool_input": {"command": sys.argv[3]},
                  "tool_response": {"stdout": sys.argv[4], "stderr": ""}}))
' "$session" "$tmp/repo" "$cmd" "$stdout")
  out=$(printf '%s' "$input" | bash "$hook" 2>&1); code=$?
}

new_session; states "OPEN UNKNOWN" "OPEN CONFLICTING"
run_hook 'gh pr create --title "x" --body "y"' "https://github.com/o/r/pull/12"
assert "作成した PR がコンフリクトしていたら exit 2 で Claude を起こす" '[ $code -eq 2 ]'
assert "作成直後のコンフリクトは解消して push するよう指示する" '[[ "$out" == *"https://github.com/o/r/pull/12"* ]] && [[ "$out" == *"解消して push"* ]]'

new_session; states "OPEN MERGEABLE" "OPEN MERGEABLE" "OPEN CONFLICTING"
PR_CONFLICT_WATCH_FRESH_SECONDS=0 run_hook "git push" ""
assert "後からコンフリクトした場合も exit 2 で通知する" '[ $code -eq 2 ]'
assert "後から発生したコンフリクトはユーザーへの報告を求める" '[[ "$out" == *"https://github.com/o/r/pull/7"* ]] && [[ "$out" == *"ユーザーに報告"* ]]'

new_session; states "OPEN MERGEABLE" "MERGED UNKNOWN"
run_hook "git push" ""
assert "PR がマージされたら通知せずに監視を終える" '[ $code -eq 0 ]'

new_session; states "OPEN MERGEABLE"
PR_CONFLICT_WATCH_MAX_SECONDS=1 PR_CONFLICT_WATCH_INTERVAL=0.2 PR_CONFLICT_WATCH_FRESH_INTERVAL=0.2 run_hook "git push" ""
assert "監視の上限時間を過ぎたら通知せずに終える" '[ $code -eq 0 ]'

new_session; states "OPEN CONFLICTING"
FAKE_PR_URL="" run_hook "git push origin feature" ""
assert "push したブランチに PR がなければ何もしない" '[ $code -eq 0 ] && ! grep -q state,mergeable "$FAKE_GH_LOG"'

new_session; states "OPEN CONFLICTING"
run_hook 'gh pr edit 42 --title "new title"' ""
assert "gh pr edit の後も監視する" '[ $code -eq 2 ]'
assert "gh pr edit に渡された PR 番号で PR を特定する" 'grep -qE "pr view 42( |$)" "$FAKE_GH_LOG"'

new_session; states "OPEN CONFLICTING"
run_hook 'gh pr edit --add-label bug -R o/other' ""
assert "gh pr edit の -R 指定を PR の特定に引き継ぐ" 'grep -qE "pr view .*-R o/other" "$FAKE_GH_LOG"'

new_session; states "OPEN CONFLICTING"
run_hook "gh pr view 7" ""
assert "PR を変更しない gh コマンドでは監視しない" '[ $code -eq 0 ] && [ ! -s "$FAKE_GH_LOG" ]'

new_session; states "OPEN CONFLICTING"
run_hook "ls -la" ""
assert "無関係なコマンドでは gh を呼ばない" '[ $code -eq 0 ] && [ ! -s "$FAKE_GH_LOG" ]'

new_session; states "OPEN CONFLICTING"
run_hook 'gh pr create --title "x"' "pull request create failed: GraphQL error"
assert "PR 作成に失敗した（URL が出力されていない）ときは監視しない" '[ $code -eq 0 ] && ! grep -q state,mergeable "$FAKE_GH_LOG"'

new_session; states "OPEN CONFLICTING"
sleep 30 & live_pid=$!
lock_dir="$TMPDIR/claude-pr-conflict-watch/$session"
mkdir -p "$lock_dir"
echo "$live_pid" > "$lock_dir/github.com_o_r_pull_7.pid"
run_hook "git push" ""
kill "$live_pid" 2>/dev/null
assert "同じセッションで同じ PR を監視中なら二重に監視しない" '[ $code -eq 0 ] && ! grep -q state,mergeable "$FAKE_GH_LOG"'

new_session; states "OPEN CONFLICTING"
mkdir -p "$TMPDIR/claude-pr-conflict-watch/$session"
echo 999999 > "$TMPDIR/claude-pr-conflict-watch/$session/github.com_o_r_pull_7.pid"
run_hook "git push" ""
assert "以前の監視プロセスが終了済みなら新たに監視する" '[ $code -eq 2 ]'

new_session; states "OPEN UNKNOWN" "" "OPEN CONFLICTING"
run_hook "git push" ""
assert "gh の一時的な失敗があっても監視を続ける" '[ $code -eq 2 ]'

out=$(printf 'git push but not json' | bash "$hook" 2>&1); code=$?
assert "入力が壊れていても失敗せず素通しする" '[ $code -eq 0 ]'

exit $fail

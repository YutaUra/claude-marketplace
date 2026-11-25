#!/bin/bash
set -u
hook="$(cd "$(dirname "$0")" && pwd)/pnpm-best-practices-gate.sh"
fail=0
seq=0

assert() {
  local name="$1" cond="$2"
  if eval "$cond"; then echo "ok   - $name"; else echo "FAIL - $name"; fail=1; fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export TMPDIR="$tmp/markers"
mkdir -p "$TMPDIR"

run_hook() {
  local session="$1" tool="$2" cwd="$3" arg="$4" input
  if [ "$tool" = "Bash" ]; then
    input=$(printf '{"session_id":"%s","cwd":"%s","tool_name":"Bash","tool_input":{"command":"%s"}}' "$session" "$cwd" "$arg")
  else
    input=$(printf '{"session_id":"%s","cwd":"%s","tool_name":"%s","tool_input":{"file_path":"%s"}}' "$session" "$cwd" "$tool" "$arg")
  fi
  out=$(printf '%s' "$input" | bash "$hook" 2>&1); code=$?
}

new_session() { seq=$((seq + 1)); session="s$seq"; }

mkdir -p "$tmp/fresh" "$tmp/existing/packages/app" "$tmp/plain"
touch "$tmp/existing/pnpm-lock.yaml"

new_session; run_hook "$session" Bash "$tmp/fresh" "pnpm install"
assert "lockfile がない場所での pnpm install は skill の読み込みを求めてブロックする" '[ $code -eq 2 ] && [[ "$out" == *"pnpm-best-practices"* ]]'

run_hook "$session" Bash "$tmp/fresh" "pnpm install"
assert "同じセッションで 2 回目はブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Bash "$tmp/fresh" "pnpm add -D vitest"
assert "lockfile がない場所での pnpm add もブロックする" '[ $code -eq 2 ]'

new_session; run_hook "$session" Bash "$tmp/fresh" "cd app && pnpm"
assert "引数なしの pnpm（= install）もブロックする" '[ $code -eq 2 ]'

new_session; run_hook "$session" Bash "$tmp/fresh" "pnpm init"
assert "pnpm init もブロックする" '[ $code -eq 2 ]'

new_session; run_hook "$session" Bash "$tmp/existing" "pnpm install"
assert "lockfile がある既存プロジェクトではブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Bash "$tmp/existing/packages/app" "pnpm add zod"
assert "親ディレクトリに lockfile がある monorepo の子ではブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Bash "$tmp/fresh" "pnpm run build"
assert "lockfile を作らない pnpm コマンドはブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Bash "$tmp/fresh" "cat pnpm-lock.yaml"
assert "pnpm-lock.yaml というファイル名の言及だけではブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Bash "$tmp/fresh" "npm install"
assert "pnpm 以外のパッケージマネージャはブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Write "$tmp/existing" "$tmp/existing/pnpm-workspace.yaml"
assert "pnpm-workspace.yaml の作成はブロックする" '[ $code -eq 2 ] && [[ "$out" == *"pnpm-best-practices"* ]]'

new_session; run_hook "$session" Edit "$tmp/existing" "$tmp/existing/pnpm-workspace.yaml"
assert "pnpm-workspace.yaml の編集もブロックする" '[ $code -eq 2 ]'

new_session; run_hook "$session" Edit "$tmp/existing" "$tmp/existing/.npmrc"
assert "pnpm プロジェクトの .npmrc 編集はブロックする" '[ $code -eq 2 ]'

new_session; run_hook "$session" Edit "$tmp/plain" "$tmp/plain/.npmrc"
assert "pnpm プロジェクトでない場所の .npmrc 編集はブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Write "$tmp/existing" "$tmp/existing/src/index.ts"
assert "無関係なファイルの書き込みはブロックしない" '[ $code -eq 0 ]'

new_session; run_hook "$session" Write "$tmp/existing" "$tmp/existing/pnpm-workspace.yaml"
run_hook "$session" Bash "$tmp/fresh" "pnpm install"
assert "一度 skill を案内したセッションでは別のトリガーでもブロックしない" '[ $code -eq 0 ]'

out=$(printf 'pnpm install but not json' | bash "$hook" 2>&1); code=$?
assert "入力が壊れていても失敗せず素通しする" '[ $code -eq 0 ]'

exit $fail

#!/bin/bash
# 1 回の確認で済ませずポーリングする理由: mergeable は非同期計算で作成直後は UNKNOWN になり、後からのコンフリクトも拾えないため。
# plugin の monitors を使わない理由: session_id が渡らず「このセッションで触った PR」に絞れないため。
set -u

input=$(cat)

# 全 Bash で起動されるため、無関係な呼び出しは python を起こさず組み込みだけで抜ける
case "$input" in
  *gh*pr*|*git*push*) ;;
  *) exit 0 ;;
esac

parsed=$(printf '%s' "$input" | python3 -c '
import json, re, sys
d = json.load(sys.stdin)
ti = d.get("tool_input") or {}
tr = d.get("tool_response")
stdout = tr.get("stdout", "") if isinstance(tr, dict) else ""
m = re.search(r"https://[^\s]+/pull/[0-9]+", stdout or "")
for v in (d.get("session_id", ""), d.get("cwd", ""), d.get("tool_name", ""),
          ti.get("command", ""), m.group(0) if m else ""):
    print(str(v).replace("\n", " "))
' 2>/dev/null) || exit 0
session=$(printf '%s\n' "$parsed" | sed -n 1p)
cwd=$(printf '%s\n' "$parsed" | sed -n 2p)
tool=$(printf '%s\n' "$parsed" | sed -n 3p)
cmd=$(printf '%s\n' "$parsed" | sed -n 4p)
created_url=$(printf '%s\n' "$parsed" | sed -n 5p)

[ "$tool" = "Bash" ] || exit 0

sep='(^|[;&|[:space:]])'
selector=()
if printf '%s' "$cmd" | grep -qE "${sep}gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)"; then
  # 作成に失敗した場合は stdout に URL が出ないので、それで成否を判定する
  [ -n "$created_url" ] || exit 0
elif printf '%s' "$cmd" | grep -qE "${sep}gh[[:space:]]+pr[[:space:]]+edit([[:space:]]|$)"; then
  target=$(printf '%s' "$cmd" | sed -nE 's/.*gh[[:space:]]+pr[[:space:]]+edit[[:space:]]+([^-[:space:]][^[:space:];&|]*).*/\1/p')
  [ -n "$target" ] && selector+=("$target")
  repo=$(printf '%s' "$cmd" | sed -nE 's/.*(-R|--repo)[=[:space:]]+([^[:space:];&|]+).*/\2/p')
  [ -n "$repo" ] && selector+=(-R "$repo")
elif printf '%s' "$cmd" | grep -qE "${sep}git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)"; then
  # 引数なしの gh pr view は cwd の現在ブランチの PR を指す
  :
else
  exit 0
fi

cd "${cwd:-.}" 2>/dev/null || exit 0
if [ -n "$created_url" ]; then
  url="$created_url"
else
  url=$(gh pr view "${selector[@]}" --json url --jq .url 2>/dev/null) || exit 0
fi
[ -n "$url" ] || exit 0

key=$(printf '%s' "${url#https://}" | tr -c '[:alnum:].\n-' '_')
state_dir="${TMPDIR:-/tmp}/claude-pr-conflict-watch/${session:-unknown-session}"
mkdir -p "$state_dir" 2>/dev/null || exit 0
pid_file="$state_dir/$key.pid"
touched="$state_dir/$key.touched"

# 監視中の watcher がいても「直前に操作した」ことは伝えたいので、pid 確認より先に更新する
touch "$touched"
if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file" 2>/dev/null)" 2>/dev/null; then
  exit 0
fi
echo $$ > "$pid_file"
trap '[ "$(cat "$pid_file" 2>/dev/null)" = "$$" ] && rm -f "$pid_file"' EXIT

interval="${PR_CONFLICT_WATCH_INTERVAL:-60}"
fresh_interval="${PR_CONFLICT_WATCH_FRESH_INTERVAL:-10}"
fresh_seconds="${PR_CONFLICT_WATCH_FRESH_SECONDS:-300}"
max_seconds="${PR_CONFLICT_WATCH_MAX_SECONDS:-43200}"

mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

start=$(date +%s)
while :; do
  now=$(date +%s)
  [ $((now - start)) -gt "$max_seconds" ] && exit 0

  since_touched=$((now - $(mtime "$touched")))
  result=$(gh pr view "$url" --json state,mergeable --jq '.state + " " + .mergeable' 2>/dev/null) || result=""
  pr_state=${result%% *}
  mergeable=${result#* }

  if [ -n "$result" ] && [ "$pr_state" != "OPEN" ]; then
    exit 0
  fi

  if [ -n "$result" ] && [ "$mergeable" = "CONFLICTING" ]; then
    if [ "$since_touched" -lt "$fresh_seconds" ]; then
      cat >&2 <<EOF
[pr-conflict-watch hook] 直前に作成・更新した PR $url がベースブランチとコンフリクトしています。
ベースブランチを取り込み（merge か rebase かはリポジトリの慣習に従う）、コンフリクトを解消して push してください。
双方の変更の意図がぶつかっていて解消方針に判断が要る箇所は、勝手に決めずユーザーに確認すること。
push すれば同じ PR の監視は自動で再開されます。
EOF
    else
      cat >&2 <<EOF
[pr-conflict-watch hook] このセッションで作成・更新した PR $url が、その後のベースブランチの更新によりコンフリクトするようになりました。
ユーザーに報告し、解消するかどうかを確認してください。別の作業の途中であれば、その区切りで報告して構いません。
EOF
    fi
    exit 2
  fi

  if [ "$since_touched" -lt "$fresh_seconds" ]; then
    sleep "$fresh_interval"
  else
    sleep "$interval"
  fi
done

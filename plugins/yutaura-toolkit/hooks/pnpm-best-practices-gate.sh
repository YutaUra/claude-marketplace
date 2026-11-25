#!/bin/bash
# additionalContext で注入しない理由: tool 結果と一緒に届くため lockfile / yaml が書かれた後になり、
# 最初の install より前に必要な供給網対策の設定が間に合わない。そのため 1 回ブロック → 再実行で通す。
set -u

input=$(cat)

# 全 Bash / Write / Edit で起動されるため、無関係な呼び出しは python を起こさず組み込みだけで抜ける
case "$input" in
  *pnpm*|*.npmrc*) ;;
  *) exit 0 ;;
esac

# 値は空白を含みうるので行区切りで受け取る
parsed=$(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
ti = d.get("tool_input") or {}
for v in (d.get("session_id", ""), d.get("cwd", ""), d.get("tool_name", ""),
          ti.get("command", ""), ti.get("file_path", "")):
    print(str(v).replace("\n", " "))
' 2>/dev/null) || exit 0
session=$(printf '%s\n' "$parsed" | sed -n 1p)
cwd=$(printf '%s\n' "$parsed" | sed -n 2p)
tool=$(printf '%s\n' "$parsed" | sed -n 3p)
cmd=$(printf '%s\n' "$parsed" | sed -n 4p)
file_path=$(printf '%s\n' "$parsed" | sed -n 5p)

find_up() {
  local dir="$1"; shift
  local name
  while [ -n "$dir" ]; do
    for name in "$@"; do
      [ -e "$dir/$name" ] && return 0
    done
    [ "$dir" = "/" ] && return 1
    dir=$(dirname "$dir")
  done
  return 1
}

reason=""
case "$tool" in
  Bash)
    # 引数なしの pnpm も install 扱い。pnpm-lock.yaml 等のファイル名の言及には反応させない
    if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])pnpm([[:space:]]+-[^[:space:]]+)*([[:space:]]+(install|i|add|import|init)([[:space:]]|$|[;&|])|[[:space:]]*($|[;&|]))'; then
      if ! find_up "${cwd:-$PWD}" pnpm-lock.yaml; then
        reason="pnpm-lock.yaml が新しく作られようとしています"
      fi
    fi
    ;;
  Write|Edit|MultiEdit)
    case "$(basename "$file_path")" in
      pnpm-workspace.yaml)
        reason="pnpm-workspace.yaml を書こうとしています"
        ;;
      .npmrc)
        if find_up "$(dirname "$file_path")" pnpm-lock.yaml pnpm-workspace.yaml; then
          reason="pnpm プロジェクトの .npmrc を書こうとしています"
        fi
        ;;
    esac
    ;;
esac

[ -z "$reason" ] && exit 0

marker_dir="${TMPDIR:-/tmp}/claude-pnpm-best-practices"
marker="$marker_dir/${session:-unknown-session}"
[ -e "$marker" ] && exit 0
mkdir -p "$marker_dir" 2>/dev/null && touch "$marker" 2>/dev/null || exit 0

cat >&2 <<EOF
[pnpm-best-practices hook] ${reason}。
先に pnpm-best-practices skill（yutaura-toolkit:pnpm-best-practices）を invoke し、
その方針（供給網対策の設定を最初の install より前に pnpm-workspace.yaml へ書く、など）に沿って準備してから、
同じ操作を再実行してください。この案内はセッションにつき 1 回だけで、再実行はそのまま通ります。
EOF
exit 2

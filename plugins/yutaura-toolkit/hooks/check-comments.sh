#!/bin/bash
# PreToolUse (Bash) hook: git commit / git push の直前に、diff に追加された
# コメント行を検出したら exit 2 でブロックし、comment-cleanup skill での
# 見直しを Claude に指示する。
#
# 無限ループ回避のため「1回ブロックしたら次の同種コマンドは通す」設計。
# ブロック時にマーカーファイルを .git/ 内に置き、次回はマーカーを消して許可する。
# コメント削除の判断は LLM でないと不可能なので、hook は検出のみを担う。
set -u

input=$(cat)

# cmd はスペースを含むため行区切りで受け取る（1行目: cmd, 2行目: cwd）
parsed=$(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
cmd = d.get("tool_input", {}).get("command", "")
cwd = d.get("cwd", "")
print(cmd.replace("\n", " "))
print(cwd)
' 2>/dev/null) || exit 0
cmd=$(printf '%s\n' "$parsed" | sed -n 1p)
cwd=$(printf '%s\n' "$parsed" | sed -n 2p)

[ -z "${cmd:-}" ] && exit 0

# git commit / git push を含むコマンドのみ対象（メッセージ文字列内の誤検知は許容）
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit\b'; then
  mode="commit"
elif printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push\b'; then
  mode="push"
else
  exit 0
fi

git_dir=$(git -C "${cwd:-.}" rev-parse --git-dir 2>/dev/null) || exit 0
case "$git_dir" in
  /*) ;;
  *) git_dir="${cwd:-.}/$git_dir" ;;
esac

marker="$git_dir/comment-cleanup-checked-$mode"

# 前回このモードでブロック済みなら、今回は見直し済みとみなして通す。
# ただし commit を取りやめた場合の残留 marker が後日の無関係な commit を
# 素通りさせないよう、TTL (5分) を超えた marker は無効として再検査する
TTL_SECONDS=300
if [ -f "$marker" ]; then
  mtime=$(stat -f %m "$marker" 2>/dev/null || stat -c %Y "$marker" 2>/dev/null || echo 0)
  now=$(date +%s)
  rm -f "$marker"
  if [ $((now - mtime)) -le "$TTL_SECONDS" ]; then
    exit 0
  fi
fi

# 対象 diff を取得。markdown はコメント検出の対象外
exclude=(':(exclude)*.md' ':(exclude)*.mdx')
if [ "$mode" = "commit" ]; then
  diff=$(git -C "${cwd:-.}" diff --cached -- . "${exclude[@]}" 2>/dev/null)
  # commit -a 等で staged が空のケースは worktree diff を見る
  if [ -z "$diff" ]; then
    diff=$(git -C "${cwd:-.}" diff -- . "${exclude[@]}" 2>/dev/null)
  fi
else
  diff=$(git -C "${cwd:-.}" diff '@{u}...HEAD' -- . "${exclude[@]}" 2>/dev/null) || diff=""
fi

[ -z "$diff" ] && exit 0

# 追加行のうちコメントで始まる行を数える。偽陰性を減らす方針で広めにマッチさせる:
# //, /* (JSX の {/* 含む), * 揃え行, # (shebang 除く), -- (デクリメント様の --識別子 除く。
# --[[ や --> も拾う), <!--, """ / ''', Ruby の =begin / =end
count=$(printf '%s\n' "$diff" \
  | grep -E '^\+' \
  | grep -vE '^\+\+\+' \
  | grep -cE '^\+[[:space:]]*(//|#([^!]|$)|/\*|\{[[:space:]]*/\*|\*([[:space:]]|/|$)|--($|[^[:alnum:]_($])|<!--|"""|'"'''"'|=begin|=end)' )

[ "$count" -eq 0 ] && exit 0

touch "$marker"

cat >&2 <<EOF
[comment-cleanup hook] ${mode} しようとしている diff にコメント行が ${count} 行追加されています。
${mode} の前に comment-cleanup skill（yutaura-toolkit:comment-cleanup）を invoke し、
その基準に従って無価値なコメント（動作をなぞるだけ / 変更説明 / ナレーション等）を削除してください。
Why not コメント・ディレクティブ・ライセンスヘッダ等の価値あるコメントは残して構いません。
見直しが完了したら、同じ git ${mode} コマンドを再実行してください。
コメントに問題がない（すべて残す価値がある）場合も、そのまま再実行すれば許可されます（5分以内）。
EOF
exit 2

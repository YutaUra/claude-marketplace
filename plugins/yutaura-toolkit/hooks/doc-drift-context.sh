#!/bin/bash
# SessionStart hook: AI 向け文書と既存コードが食い違ったときの優先順位を、指示として注入する。
#
# rules レーンではなく hook にしている理由: plugin は rules を配信できないため、
# 常時効かせたい指示を auto-update で全マシンに届ける手段が SessionStart hook しかない。
# 起動のたびに走るので、git や python は呼ばず shell の組み込み test だけで判定している。
# 文書の鮮度チェックなど動的な検査は、起動の遅延になるため意図的に入れていない。
dir="${CLAUDE_PROJECT_DIR:-$PWD}"

if [ -e "$dir/CLAUDE.md" ] || [ -e "$dir/AGENTS.md" ] || [ -d "$dir/.claude/rules" ]; then
  cat <<'EOF'
## リポジトリ文書と既存コードが食い違うとき
リポジトリ内の文書（README / docs/ / CLAUDE.md / AGENTS.md / .claude/rules/）と既存コードが食い違う場合は、既存コードの書き方に従うこと。見つけた食い違いは最後の返答ですべて挙げ、文書側の修正案を添えること。
- ~/.claude/ 配下のユーザー個人ルール（TDD など）はこの対象外。既存コードが個人ルールに反していても、個人ルールに従う。
- 文書が移行計画・ADR・roadmap のように「目指す状態」だと明示している場合は、どちらかに勝手に寄せずユーザーに確認する。
EOF
fi
exit 0

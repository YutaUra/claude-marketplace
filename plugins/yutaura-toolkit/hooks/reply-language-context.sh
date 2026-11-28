#!/bin/bash
# language 設定だけでは英語のツール出力の後に返答が英語へ流れるため、直近に言い直す（anthropics/claude-code#96326）。
# 言語を直書きしないのは、汎用 plugin として各環境の language 設定に従わせるため。
# 全ツールで走るが python3 を使う: 起動の数十 ms よりも JSON を正しく読む方を優先した。
# -I: cwd（clone した任意のリポジトリ）の json.py 等や PYTHON* 環境変数で任意コードを実行させないため。
set -u

CLAUDE_HOOK_INPUT=$(cat) python3 -I -c '
import json, os, sys

try:
    hook_input = json.loads(os.environ.get("CLAUDE_HOOK_INPUT") or "{}")
except ValueError:
    hook_input = {}
event = hook_input.get("hook_event_name") or "PostToolUse"

# Poll は REPL の結果を受け取るだけで、直前の同じ位置に REPL の分がすでに入っている
if hook_input.get("tool_name") == "Poll":
    sys.exit(0)

project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
config = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
candidates = [
    os.path.join(project, ".claude", "settings.local.json"),
    os.path.join(project, ".claude", "settings.json"),
    os.path.join(config, "settings.json"),
]

language = None
for path in candidates:
    try:
        with open(path, encoding="utf-8") as f:
            value = json.load(f).get("language")
    except (OSError, ValueError, AttributeError):
        continue
    if isinstance(value, str) and value.strip():
        language = value.strip()
        break

if language is None:
    sys.exit(0)

context = (
    f"Reminder: write every user-facing sentence in {language}, including short progress notes "
    "and summaries right after tool results, even when the tool output is in English. "
    "Keep code, identifiers, commands and quoted output as they are."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": context}}, ensure_ascii=False))
' 2>/dev/null
exit 0

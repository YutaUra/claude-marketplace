#!/bin/bash
# language 設定だけでは英語のツール出力の後に返答が英語へ流れるため、直近に言い直す（anthropics/claude-code#96326）。
# 言語を直書きしないのは、汎用 plugin として各環境の language 設定に従わせるため。
# 全ツールで走るが python3 を使う: 起動の数十 ms よりも JSON を正しく読む方を優先した。
set -u

CLAUDE_HOOK_INPUT=$(cat) python3 -c '
import json, os, sys

try:
    event = json.loads(os.environ.get("CLAUDE_HOOK_INPUT") or "{}").get("hook_event_name") or "PostToolUse"
except ValueError:
    event = "PostToolUse"

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

# claude-marketplace

[Claude Code](https://docs.claude.com/en/docs/claude-code) 向けの個人用 plugin marketplace。
基本的に yutaura 個人で利用する想定。

## 含まれる plugin

### `yutaura-toolkit`

現状は skills のみ。今後 agents / commands / hooks も必要に応じて追加する。

| Skill | 概要 |
| --- | --- |
| `tuning` | Claude の振る舞いを設定ファイル（skills / rules / CLAUDE.md）に反映する |
| `claude-code-rules` | `.claude/rules/*.md` の作成・改善・リファクタ |
| `repo-kickoff` | 新規リポジトリ立ち上げ時の README / docs / CLAUDE.md 整備 |
| `decision-council` | 重要な意思決定を複数役のエージェントで多角検証 |
| `playwright-cli` | `playwright-cli` を使ったブラウザ自動操作 |
| `herdr-agent-message` | herdr で別 workspace / pane の Claude Code に依頼し返信を受け取る |
| `gh-stack` | stacked branches / PR を `gh stack` CLI 拡張で管理（[github/gh-stack](https://github.com/github/gh-stack) v0.0.9 から vendor） |

## 使い方

### marketplace を追加（初回のみ）

```
/plugin marketplace add https://github.com/yutaura/claude-marketplace.git
```

### plugin を有効化

`~/.claude/settings.json` に記述（nix-darwin で管理している場合は `home/common/claude-code.nix` 経由）:

```json
{
  "enabledPlugins": {
    "yutaura-toolkit@yutaura-marketplace": true
  }
}
```

### Auto-update を有効にする

Third-party marketplace の auto-update は **default で OFF**。明示的に有効にする必要がある。

#### 1. 環境変数

CLI 自体の auto-update を `DISABLE_AUTOUPDATER=1` で止めている場合、plugin だけは更新したいので
`FORCE_AUTOUPDATE_PLUGINS=1` を併用する（nix-darwin 側は設定済み）。

```bash
export DISABLE_AUTOUPDATER=1     # 任意。CLI を手動更新したい場合のみ
export FORCE_AUTOUPDATE_PLUGINS=1
```

#### 2. Marketplace ごとの toggle（UI で 1 回だけ実行）

公式に declarative な手段はなく、`/plugin` UI で marketplace 単位に toggle する:

```
/plugin
→ Marketplaces タブ
→ yutaura-marketplace を選択
→ Enable auto-update
```

設定は `~/.claude/plugins/known_marketplaces.json` に保存される（user state）。

#### 3. 手動更新

auto-update を有効にしない場合、または即時反映したい場合:

```
/plugin marketplace update yutaura-marketplace
/reload-plugins
```

## ディレクトリ構成

```
.
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── yutaura-toolkit/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
│           ├── claude-code-rules/
│           ├── decision-council/
│           ├── gh-stack/                # github/gh-stack から vendor
│           ├── herdr-agent-message/
│           ├── playwright-cli/
│           ├── repo-kickoff/
│           └── tuning/
└── rules/                              # nix-darwin から fetch される
    ├── tdd-guidelines.md
    └── documentation-principles.md
```

将来 agents / commands 等を追加する場合は `plugins/yutaura-toolkit/` 直下に
`agents/` `commands/` `hooks/` `.mcp.json` などを配置する。

## rules ディレクトリについて

`.claude/rules/*.md`（auto-loaded ルール）は **Claude Code plugin の公式配信対象外**
（plugin の標準ディレクトリは skills / agents / commands / hooks / mcp / lsp / monitors / bin のみ）。

このため rules は marketplace 配信ではなく、別レーンで配信する:

- **配信元**: このリポジトリの `rules/` ディレクトリ
- **配信先**: `~/.claude/rules/`
- **配信手段**: nix-darwin の `pkgs/yutaura-rules.nix` が `fetchFromGitHub` でこのリポジトリを取得し、`home.file` で配置
- **更新タイミング**: `nix flake update` → `darwin-rebuild switch`（plugin auto-update とは別系統）

つまり Claude Code が auto-load してくれる挙動は維持したまま、ファイルは marketplace と同じリポジトリで履歴管理される。

## skill / plugin 更新時の手順

1. 該当ファイル（`SKILL.md` 等）を編集
2. `plugins/yutaura-toolkit/.claude-plugin/plugin.json` の `version` を bump
3. commit & push
4. 利用側は次回起動で自動反映（auto-update 有効時）。手動なら
   `/plugin marketplace update yutaura-marketplace` → `/reload-plugins`

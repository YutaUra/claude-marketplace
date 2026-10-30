# claude-marketplace

[Claude Code](https://docs.claude.com/en/docs/claude-code) 向けの個人用 plugin marketplace。
基本的に yutaura 個人で利用する想定。

## 含まれる plugin

plugin は **2 本**ある。配信は plugin ごとに独立しており、有効化も version bump も別々に行う。

| Plugin | 役割 | 有効化の前提 |
| --- | --- | --- |
| `yutaura-toolkit` | 汎用。どのマシンでも動く skills / agents / hooks | なし |
| `yutaura-private` | nix-darwin の private プロファイルにしか入っていないツールに依存する skills | 該当ツールが PATH にあること |

> `yutaura-private` の "private" は **「private プロファイル専用」** の意味で、機密情報という意味ではない。**このリポジトリは public** なので、どちらの plugin にも秘密情報は置かない。

### `yutaura-toolkit`

skills / agents / hooks を含む。今後 commands も必要に応じて追加する。

| Skill | 概要 |
| --- | --- |
| `tuning` | Claude の振る舞いを設定ファイル（skills / rules / CLAUDE.md）に反映する |
| `claude-code-rules` | `.claude/rules/*.md` の作成・改善・リファクタ |
| `repo-kickoff` | 新規リポジトリ立ち上げ時の README / docs / CLAUDE.md 整備 |
| `decision-council` | 重要な意思決定を複数役のエージェントで多角検証 |
| `playwright-cli` | `playwright-cli` を使ったブラウザ自動操作 |
| `herdr-agent-message` | herdr で別 workspace / pane の Claude Code に依頼し返信を受け取る |
| `gh-stack` | stacked branches / PR を `gh stack` CLI 拡張で管理（[github/gh-stack](https://github.com/github/gh-stack) v0.0.9 から vendor） |
| `keepa-price-history` | keepa.com の内部 WebSocket 通信を傍受して Amazon 価格履歴を無料取得（個人利用・低頻度専用） |
| `webapp-review` | Web アプリの変更を専門レビュワー agent 群で多角レビュー（diff 分析 → 該当観点のみ並列起動 → 統合レポート） |
| `comment-cleanup` | diff に追加された無価値なコードコメント（動作をなぞるだけ / 変更説明 / ナレーション等）を commit / push 前に削除。Why not コメント等は保持 |
| `terraform-backend` | 個人リポジトリ（`YutaUra/*` / `yutaura-dev/*`）で Terraform / OpenTofu の state を共通 S3 バケットに集約する規約。key の組み立て方と、DynamoDB ロックテーブル等のアンチパターン |
| `project-manager-mode` | ユーザーが product 側、Claude が project manager という分業で働く。調査は読み取り専用サブエージェントに本体ディレクトリで、修正は worktree を切って実装役に委譲。件ごとに「決裁が要るか」を判定し、要らないものは全体のまとめを待たず単独で直し、要るものは実装を進めず「それ単体で決められる形」に整えて返す。判断待ちが溜まるときは会話ではなくファイルで非同期にやり取りする。完了時は未実施の検証まで含めた 5 点で報告し、未確認の累積・PR の状態・ブランチの土台といった「自分は知っているが外から見えない状態」を可視化する |
| `review-refine-loop` | 成果物（コード変更 / skill / ドキュメント / 設計案 等）を「多角レビュー → MUST/WANT/NIT 分類 → 妥当性検証 → 修正 → 再レビュー」のループで、妥当な指摘が尽きるまで収束させる。発散（最上位モデル）・検証・修正を別モデルに分担し、1 ラウンドにつき各カテゴリ 1 件だけ処理して修正同士の干渉を防ぐ。棄却/保留リストの持ち回り、エージェント失敗と収束の区別、振動検出で「直したつもりで終わる」を防ぐ |

| Hook | 概要 |
| --- | --- |
| `check-comments.sh` (PreToolUse: Bash) | `git commit` / `git push` 実行前に diff の追加コメント行を検出したらブロックし、`comment-cleanup` skill での見直しを促す。ブロックは 1 回のみで、見直し後の再実行は通る |

| Agent | レビュー観点 |
| --- | --- |
| `db-design-reviewer` | DB スキーマ・インデックス・マイグレーション安全性 |
| `api-design-reviewer` | API 契約・破壊的変更・入出力の堅牢性・Webhook |
| `authn-reviewer` | 認証（パスワード・セッション・トークン・OAuth/MFA） |
| `authz-reviewer` | 認可（IDOR・テナント分離・権限昇格） |
| `payment-reviewer` | 決済・課金（冪等性・Webhook 署名・金額計算・サブスク） |
| `security-reviewer` | セキュリティ全般（OWASP Top 10 ベース） |
| `concurrency-reviewer` | 並行性・トランザクション・非同期ジョブの整合性 |
| `performance-reviewer` | N+1・大量データ・キャッシュ・スケーラビリティ |
| `audit-trail-reviewer` | 監査証跡・履歴設計・台帳方式・イベントソーシング（最軽量手法から段階提案） |
| `sre-reviewer` | 可観測性・障害の局所化・デプロイ安全性 |
| `legal-reviewer` | 法務（個人情報・特商法・資金決済法・OSS ライセンス）— 要法務確認箇所の検知器 |
| `marketing-reviewer` | SEO/OGP・計測トラッキング・転換導線 |

### `yutaura-private`

nix-darwin の private プロファイル限定で導入しているツールに依存する skill を置く。
依存ツールが入っていないマシンでは skill が機能しないため、`yutaura-toolkit` とは分けている。

| Skill | 概要 |
| --- | --- |
| `openai-decisions` | OpenAI Decisions API（`openai-decisions/gpt-6-luna`）を `llm` CLI 経由で使い、テキスト / 画像の真偽・分類・段階評価を確率付きで判定する。中心は「chat モデルではなく decisions を選ぶ判断基準」と、確率を閾値運用するときの設計（`refusal` の fail closed / 低 confidence の扱い / 入力と質問の取り違え防止） |

**依存**: `llm` 0.36 + `llm-openai-decisions` 0.1。nix-darwin 側の `pkgs/llm-with-decisions.nix` で自前パッケージ化している。
site-packages が read-only なため **`llm install` は使えない**（skill 本文に明記済み）。

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
    "yutaura-toolkit@yutaura-marketplace": true,
    "yutaura-private@yutaura-marketplace": true
  }
}
```

`yutaura-private` は依存ツールが入っているマシンでのみ有効化する。

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
│   ├── yutaura-toolkit/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── agents/                      # webapp-review 用の専門レビュワー群
│   │   ├── hooks/                       # hooks.json + check-comments.sh
│   │   └── skills/
│   │       ├── claude-code-rules/
│   │       ├── comment-cleanup/
│   │       ├── decision-council/
│   │       ├── gh-stack/                # github/gh-stack から vendor
│   │       ├── herdr-agent-message/
│   │       ├── keepa-price-history/
│   │       ├── playwright-cli/
│   │       ├── project-manager-mode/
│   │       ├── repo-kickoff/
│   │       ├── review-refine-loop/
│   │       ├── terraform-backend/
│   │       ├── tuning/
│   │       └── webapp-review/
│   └── yutaura-private/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
│           └── openai-decisions/
└── rules/                              # nix-darwin から fetch される
    ├── tdd-guidelines.md
    └── documentation-principles.md
```

将来 agents / commands 等を追加する場合は、対象 plugin のディレクトリ直下に
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
2. **変更した plugin の** `plugin.json` の `version` を bump
   - `plugins/yutaura-toolkit/.claude-plugin/plugin.json`
   - `plugins/yutaura-private/.claude-plugin/plugin.json`

   両方の plugin を変更したなら**両方** bump する。片方だけ編集したときに
   もう片方を bump する必要はない（配信は plugin ごとに独立）
3. 新しい skill を追加したら、該当 plugin の skill 一覧テーブルを更新
4. commit & push
5. 利用側は次回起動で自動反映（auto-update 有効時）。手動なら
   `/plugin marketplace update yutaura-marketplace` → `/reload-plugins`

# Output Templates

`repo-kickoff` skill が生成するファイルのテンプレート集。

ヒアリング結果を以下のテンプレートに当てはめて出力する。

---

## ファイル構成

```
flake.nix / flake.lock           ← 開発依存の固定（nix devShell）
.envrc                           ← direnv: use flake + dotenv_if_exists
.env.example                     ← 環境変数の雛形
.worktreeinclude                 ← worktree にコピーする gitignore 対象ファイル
README.md                        ← 外部向け（プロジェクトの顔）
CLAUDE.md                        ← AI 協働の文脈
docs/
├── README.md                    ← docs/ の読む順序ガイド
├── charter.md         🪨 stable    ← 不変領域: Why / Scope / Sunset
├── plan.md            🌀 evolving  ← 準不変: フェーズ / マイルストーン
├── architecture.md    🌊 living    ← 可変: 技術スタック / 設計判断 / 運用
└── decisions/                   ← ADR
    ├── 0000-template.md
    └── 0001-record-architecture-decisions.md
```

---

## 共通: Stability ヘッダ

各 `docs/*.md` ファイルの冒頭に以下を必ず配置する:

```markdown
> **Stability**: 🪨 stable
> **最終更新**: 2026-04-30
> **直近の変更 ADR**: なし（初版）
```

`Stability` は以下のいずれか:

- `🪨 stable` — プロジェクトのアイデンティティ。変更時は ADR 必須
- `🌀 evolving` — 計画・ロードマップ。フェーズ進行で更新
- `🌊 living` — 実装・運用の現状。日常的に更新

`直近の変更 ADR` は ADR 作成後に該当ファイルへのリンクを書く。初版時は「なし（初版）」。

---

## README.md テンプレート

```markdown
# {プロジェクト名}

{1 行のサマリ: 何のためのリポジトリか}

## なぜこれが必要か

{視点 1.1 - 1.2 の要点を 2-3 段落で。詳細は [docs/charter.md](docs/charter.md) を参照}

## クイックスタート

\`\`\`sh
direnv allow          # nix devShell と .env を有効化（初回のみ）
cp .env.example .env  # 自分の環境の値を記入
{セットアップコマンド}
\`\`\`

> 依存は nix flake で固定されている。詳細は [docs/architecture.md](docs/architecture.md) を参照。

## 機能

- {主要機能 1}
- {主要機能 2}
- {主要機能 3}

## ドキュメント

- [docs/charter.md](docs/charter.md) — このプロジェクトの存在意義・スコープ・撤退条件 🪨
- [docs/plan.md](docs/plan.md) — フェーズ・マイルストーン 🌀
- [docs/architecture.md](docs/architecture.md) — 技術スタック・設計判断 🌊
- [docs/decisions/](docs/decisions/) — Architecture Decision Records

## 貢献

{視点 7 の内容: 貢献ポリシー・コミュニケーションチャネル}

## ライセンス

{ライセンス情報。未定なら「TBD」}
```

---

## CLAUDE.md テンプレート

```markdown
# {プロジェクト名}

{1 行のサマリ。README と同じでよい}

## このプロジェクトについて

詳細は [docs/charter.md](docs/charter.md) を参照。AI が作業時に最低限知っておくべき要点のみここに書く。

- **目的**: {視点 1.1 を 1 行で}
- **やらないこと**: {視点 2.2 の要点。最重要}
- **想定ユーザー**: {視点 1.3 を 1 行で}

## ドメイン用語

{視点 9.2 の用語集。プロジェクト固有の用語を AI に伝える}

| 用語 | 意味 |
|------|------|
| {用語} | {意味} |

## AI 協働ルール

{視点 9.1 の暗黙ルール}

- {ルール 1}
- {ルール 2}

## 触れてほしくない領域

{視点 9.3。AI に勝手に触ってほしくないファイル・ディレクトリ}

- `{パス}` — {理由}

## 開発環境

- **ツールを追加するとき**: `flake.nix` の `devShells.default` の `packages` へ。グローバルインストールはしない
- **環境変数を増やすとき**: `.env.example` にキーと説明だけ追記する（非秘匿値は `.env`、秘匿値は `.env.local`）
- **worktree で足りないファイルがあるとき**: `.worktreeinclude` に追記する

構成の詳細は [docs/architecture.md](docs/architecture.md) を参照。

## プロジェクト特有のワークフロー

{視点 9.4。一般的でない手順があれば}

- {ワークフロー説明}

## 主要な設計判断（要点のみ）

{視点 3.3 の要点。詳細は docs/architecture.md と docs/decisions/ にある}

- {判断 1}
- {判断 2}
```

---

## docs/README.md テンプレート

```markdown
# Documentation

このディレクトリには {プロジェクト名} の設計文書を、**更新頻度（Stability）に応じて分離して** 配置している。

## 読む順序

1. **[charter.md](charter.md) 🪨** — まずこれを読む。プロジェクトの存在意義・スコープ・撤退条件
2. **[plan.md](plan.md) 🌀** — 次にこれ。現在のフェーズと今後のマイルストーン
3. **[architecture.md](architecture.md) 🌊** — 実装に踏み込む人はこれ。技術スタックと設計判断
4. **[decisions/](decisions/)** — 過去の重要決定の経緯を追いたいときはここ

## Stability の見方

| Stability | 意味 | 変更時の重み |
|-----------|------|--------------|
| 🪨 stable | プロジェクトのアイデンティティ。原則として変えない | 重い（ADR 必須） |
| 🌀 evolving | 計画・ロードマップ。フェーズ進行で更新される | 中（明示的な更新タイミング） |
| 🌊 living | 実装・運用の現状。日々書き換えられる | 軽い（自由に更新） |

## 文書の更新ルール

- **🪨 stable** な文書を変更する場合は、必ず `decisions/` に ADR を切る
- **🌀 evolving** な文書はフェーズ完了時または計画見直し時に更新する
- **🌊 living** な文書は実装に追従して自由に更新する
- すべての文書冒頭に **最終更新日** と **直近の変更 ADR** を記載する
```

---

## docs/charter.md テンプレート

```markdown
> **Stability**: 🪨 stable
> **最終更新**: {YYYY-MM-DD}
> **直近の変更 ADR**: なし（初版）

# Charter — {プロジェクト名}

このプロジェクトのアイデンティティを定義する文書。**変更には ADR が必須**。

## 存在意義 (Why)

{視点 1.1: このリポジトリは一言で言うと何のために存在するか}

{視点 1.2: 解決する具体的な課題}

## 想定ユーザー (Who)

{視点 1.3: 主なユーザー}

{視点 1.4: 既存の代替手段との違い}

## やること (In Scope)

{視点 2.1 の項目を箇条書き}

- {やること 1}
- {やること 2}
- {やること 3}

## やらないこと (Out of Scope) ⚠ 重要

{視点 2.2: 絶対にやらないこと。これがアイデンティティを保つ}

- {やらないこと 1}
- {やらないこと 2}

## 隣接プロジェクトとの境界

{視点 2.3: 関連する他のリポジトリ・サービスとの境界}

## 成功条件 (Success Criteria)

{視点 6.1: 成功と判断する指標}

- {指標 1}
- {指標 2}

## 撤退条件 (Sunset Criteria) ⚠ 重要

{視点 6.3: 撤退・凍結する条件。将来の判断に効く}

- {条件 1: 例「6 か月使われなかったら凍結」}
- {条件 2: 例「上位互換ツールが登場したら撤退」}

## 後継への移行パス

{視点 6.4: 撤退時のユーザー・データ移行先（あれば）}

## 前提と制約

{視点 8.2 / 8.4: 守るべき制約や前提条件}
```

---

## docs/plan.md テンプレート

```markdown
> **Stability**: 🌀 evolving
> **最終更新**: {YYYY-MM-DD}
> **直近の変更 ADR**: なし（初版）

# Plan — {プロジェクト名}

このプロジェクトの段階的な計画。フェーズの進行や見直しに応じて更新される。

## 現在のフェーズ

**Phase {N}: {フェーズ名}**

{現在のフェーズで取り組んでいる内容}

## MVP 定義

{視点 5.1: 「最小限これができれば価値がある」機能セット}

完了条件:
- [ ] {条件 1}
- [ ] {条件 2}
- [ ] {条件 3}

## フェーズ計画

### Phase 1: {フェーズ名}

**目標**: {このフェーズで達成すること}

**完了条件 (Definition of Done)**:
- [ ] {条件}
- [ ] {条件}

**想定タイムライン**: {視点 5.4: 大まかな期間}

### Phase 2: {フェーズ名}

**目標**: {このフェーズで達成すること}

**完了条件**:
- [ ] {条件}

### Phase 3: {フェーズ名}

{TBD or 概要}

## マイルストーン

| マイルストーン | 内容 | 状態 |
|----------------|------|------|
| M1 | {内容} | ⬜ 未着手 / 🟦 進行中 / ✅ 完了 |
| M2 | {内容} | ⬜ |

## 計画の見直しトリガー

以下が起きたら計画全体を見直す:

- {トリガー 1: 例「Phase 1 が予定の 2 倍以上遅れた」}
- {トリガー 2: 例「想定ユーザーが大きく変わった」}
```

---

## docs/architecture.md テンプレート

```markdown
> **Stability**: 🌊 living
> **最終更新**: {YYYY-MM-DD}
> **直近の変更 ADR**: なし（初版）

# Architecture — {プロジェクト名}

このプロジェクトの技術構成と設計判断。実装に追従して自由に更新する。重要な設計判断は `decisions/` に ADR として記録する。

## 全体構成

{視点 3.2: 全体構成の一行説明}

```
{簡単な構成図 or テキスト記述}
```

## 技術スタック

{視点 3.1}

| 領域 | 採用技術 | 採用理由 / 関連 ADR |
|------|----------|---------------------|
| 言語 | {言語} | {理由 or [ADR-XXXX](decisions/XXXX-...md)} |
| フレームワーク | {FW} | |
| データストア | {DB} | |
| ホスティング | {ホスティング先} | |
| 開発環境 | nix flake + direnv | 版を `flake.lock` で固定し、手元・CI・worktree を揃える |

## 開発環境

{Step 6 の scaffold を採用した場合。代替スタックを使う場合はその内容に差し替える}

| ファイル | 役割 |
|----------|------|
| `flake.nix` / `flake.lock` | 言語ランタイム・CLI ツールの固定。追加は `devShells.default` の `packages` へ |
| `.envrc` | `use flake` で devShell 有効化 + `dotenv_if_exists` で `.env` / `.env.local` 読み込み |
| `.env` | 非秘匿の環境差分（ポート番号、クラウド CLI のプロファイル名など）。gitignore |
| `.env.local` | 秘匿値（API キー・トークン）。gitignore |
| `.env.example` | 上記 2 つの雛形。キーと説明のみ |
| `.worktreeinclude` | worktree 作成時にコピーする gitignore 対象ファイルの列挙 |

## 主要な設計判断

{視点 3.3: 重要な判断は ADR を切ってここからリンクする}

- [ADR-0001: アーキテクチャ判断記録方式の採用](decisions/0001-record-architecture-decisions.md)

## 外部依存

{視点 3.4: 外部サービス・API・有料 SaaS}

| 依存先 | 用途 | リスク |
|--------|------|--------|
| {サービス} | {用途} | {リスク} |

## 非機能要件

{視点 4.1}

- **性能**: {目標値 or TBD}
- **可用性**: {目標値 or TBD}
- **セキュリティ**: {要件 or TBD}

## テスト戦略

{視点 4.2}

## 監視・観測

{視点 4.3}

## デプロイ

{視点 4.4}
```

---

## docs/decisions/0000-template.md テンプレート

```markdown
# ADR-XXXX: {決定のタイトル}

- **Status**: Proposed / Accepted / Deprecated / Superseded by ADR-YYYY
- **Date**: {YYYY-MM-DD}
- **Deciders**: {決定者}

## Context

{この決定が必要になった背景・問題状況}

## Decision

{採用した判断}

## Alternatives Considered

{検討したが採用しなかった選択肢とその理由}

- **{代替案 1}**: {採用しなかった理由}
- **{代替案 2}**: {採用しなかった理由}

## Consequences

### Positive

- {良い影響}

### Negative

- {悪い影響・トレードオフ}

### Neutral

- {中立的な影響}

## References

- {関連リンク・ドキュメント}
```

---

## docs/decisions/0001-record-architecture-decisions.md テンプレート

ADR システム自体を ADR として最初に記録する（ADR 慣行）:

```markdown
# ADR-0001: アーキテクチャ判断記録方式の採用

- **Status**: Accepted
- **Date**: {YYYY-MM-DD}
- **Deciders**: {決定者}

## Context

このリポジトリの設計判断を、後から「なぜそう決めたか」追えるように残したい。git log とコミットメッセージだけでは、判断の context や検討した代替案が散逸する。

## Decision

Michael Nygard 形式の Architecture Decision Record (ADR) を `docs/decisions/` ディレクトリに採用する。

- 1 つの ADR は 1 つの決定を記録する
- ファイル名: `NNNN-short-title.md`（NNNN は連番）
- 構造: Context / Decision / Alternatives Considered / Consequences
- 採用後の決定は **immutable**（書き換えず、新しい ADR で Supersede する）

`docs/charter.md` の改訂時は ADR を切ることを必須とする。`docs/architecture.md` の重要な変更時は推奨。

## Alternatives Considered

- **コミットメッセージのみで残す**: context や代替案が散逸しやすい
- **wiki / Notion などの外部ツール**: git で管理されないため、コードと同期しなくなる
- **CHANGELOG.md にまとめる**: 「変更ログ」と「決定の根拠」は性質が異なり、混在させると読みにくい

## Consequences

### Positive

- 重要な判断の根拠が永続化される
- 新規参入者が過去の判断経緯を理解できる
- charter.md の不変領域が変更されたとき、履歴が残る

### Negative

- ADR を書く手間が発生する
- 「これは ADR にすべきか」の判断疲れが起きうる

### Neutral

- 個人開発では ADR 数が少なく済む可能性がある（無理に増やさない）

## References

- [Michael Nygard, "Documenting Architecture Decisions" (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [adr.github.io](https://adr.github.io/)
```

---

## 開発環境 scaffold テンプレート

`flake.nix` / `.envrc` / `.env.example` / `.worktreeinclude` / `.gitignore` の 5 点セット。
適用条件は SKILL.md Step 6 を参照。

### flake.nix

```nix
{
  description = "{プロジェクト名}: 開発環境";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          # グローバルインストール（brew / npm i -g）に頼らない理由:
          # 版が flake.lock で固定され、手元・CI・worktree で同じものが入る。
          packages = [
            # {言語ランタイム。例: pkgs.nodejs_22 pkgs.pnpm / pkgs.python312 / pkgs.go}
            # {CLI ツール。例: pkgs.jq pkgs.gh / pkgs.opentofu / pkgs.awscli2}
          ];
        };
      }
    );
}
```

言語 toolchain に専用の overlay が要る場合（Rust の `rust-overlay` など）は `inputs` に追加する。

書いたら `nix flake lock` を実行して `flake.lock` を生成し、`flake.nix` と一緒に commit する。

### .envrc

```bash
use flake

# 環境差分の値を読む。.env → .env.local の順で、後勝ち。
#   .env       — 非秘匿（ポート番号、クラウド CLI のプロファイル名 など）
#   .env.local — 秘匿値（API キー, トークン など）
# dotenv_if_exists を使う理由: ファイルが無くても direnv が壊れず、
# KEY=VALUE を読むだけでシェル実行しないため source より安全。
dotenv_if_exists .env
dotenv_if_exists .env.local
```

nix を入れていないメンバーが触る可能性があるリポジトリでは `use flake` を次で包む:

```bash
if has nix; then
  use flake
fi
```

### .env.example

```bash
# キーと説明だけを置き、実値は書かない。cp .env.example .env して値を入れる。
# 全行をコメントアウトしておく理由: そのまま cp しても秘匿キーが .env に有効な形で
# 入らず、非秘匿（.env）と秘匿（.env.local）の分離が初回セットアップで壊れない。

# ── .env に書く（非秘匿の環境差分）──
# PORT=3000
# {クラウド CLI のプロファイル名。例: AWS_PROFILE=}

# ── .env.local に書く（秘匿値。.env には置かない）──
# {SERVICE}_API_KEY=
```

### .worktreeinclude

```gitignore
# worktree を新規作成する際にコピーするファイル（.gitignore 構文）。
# gitignore 対象のファイルがコピーされる（tracked ファイルは git が複製するので書く必要はない）。

# direnv が読む環境差分
.env

# 秘匿値（API キー・トークン）
.env.local
```

プロジェクト固有のローカル設定（Cloudflare Workers の `.dev.vars`、Terraform の `terraform.tfvars`、monorepo なら `apps/*/.env.local` など）があれば、
**なぜ必要か** を 1 行コメントで添えて追記する。

### .gitignore への追記

```gitignore
# nix / direnv
.direnv/
/result
/result-*

# env files
.env
.env*.local
```

---

## 出力時のチェックリスト

skill 実行時、以下を確認してから完了とする:

- [ ] 必須項目（🔴）の充足率 >= 50%
- [ ] 全 docs/ ファイルに Stability ヘッダ + 最終更新日が記載されている
- [ ] README.md から docs/ への相互リンクがある
- [ ] docs/README.md が読む順序を案内している
- [ ] CLAUDE.md と README.md / charter.md の内容が重複していない
- [ ] 「やらないこと」「撤退条件」が `TBD` で済まされていない（最も重要）
- [ ] ADR-0001 が初期生成されている
- [ ] 未定項目は `TBD（次回更新時に決定）` のように明示されている
- [ ] 開発環境 scaffold を生成し `flake.lock` まで commit した、または既存の代替スタックがあることを確認した
- [ ] CLAUDE.md に「開発環境」節（ツール追加は flake へ / 変数追加は .env.example へ）がある

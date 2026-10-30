# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## リポジトリの性質

yutaura 個人用の Claude Code plugin marketplace。ビルド・テスト・lint は存在しない。すべて Markdown / JSON の宣言的ファイルで構成される。

## アーキテクチャ（2つの配信レーン）

このリポジトリには**配信経路の異なる2種類のコンテンツ**が同居している:

1. **plugin レーン**: `plugins/<plugin 名>/` — Claude Code の marketplace 機能（`.claude-plugin/marketplace.json` → `plugin.json` → `skills/`）で配信される。auto-update または `/plugin marketplace update yutaura-marketplace` で利用側に反映。
2. **rules レーン**: `rules/*.md` — plugin の公式配信対象外のため、nix-darwin（`pkgs/yutaura-rules.nix` の `fetchFromGitHub`）が別途取得して `~/.claude/rules/` に配置する。反映は `nix flake update` → `darwin-rebuild switch` で、plugin とは更新タイミングが独立。

## plugin は 2 本ある（配信は plugin ごとに独立）

| Plugin | 役割 | 置いてよい skill の条件 |
| --- | --- | --- |
| `yutaura-toolkit` | 汎用 | どのマシンでも動く |
| `yutaura-private` | private プロファイル専用 | nix-darwin の private プロファイルにしか入っていないツールに依存する |

**version / 有効化 / auto-update はすべて plugin 単位で独立**している。`yutaura-toolkit` を bump しても `yutaura-private` は再配信されないし、その逆も同様。

新しい skill をどちらに置くかは **「依存ツールが素の環境にあるか」** で決める。無ければ `yutaura-private`。

⚠️ `yutaura-private` の "private" は **「private プロファイル専用」** の意味であり、機密という意味ではない。**このリポジトリは public** なので、どちらの plugin にも秘密情報（認証情報・トークン・個人情報・社内固有名）を書かない。

## skill の構造

各 skill は `plugins/<plugin 名>/skills/<name>/SKILL.md`（frontmatter: `name`, `description`）を本体とし、詳細情報は `references/*.md` に分離する。`description` はトリガー条件（Use when: ...）を含める慣習。発火させたくない条件（negative trigger）も併記する。

## 変更時の必須手順

`plugins/` 配下を変更したら、**変更した plugin の `plugin.json` の `version` を必ず bump** してから commit する。version bump がないと利用側の auto-update が発火しない。

- `plugins/yutaura-toolkit/.claude-plugin/plugin.json`
- `plugins/yutaura-private/.claude-plugin/plugin.json`

⚠️ **bump するのは実際に変更した plugin だけ**。両方変更したなら両方 bump する。片方だけの変更でもう片方を bump するのは無意味な再配信になる。

新しい skill を追加したら README.md の該当 plugin の skill 一覧テーブルも更新する。将来 agents / commands / hooks を追加する場合は、対象 plugin のディレクトリ直下に `agents/` `commands/` 等を配置する。

## git ワークフロー

個人用リポジトリなので **`main` へ直接 commit してよい**。レビューのためにブランチを切ったり PR を作ったりしない（レビュアーが自分しかおらず、オーバーヘッドに見合わない）。

ただし **「ブランチを切らない」と「勝手に commit する」は別**。commit / push はユーザーに依頼されたときに行う。
